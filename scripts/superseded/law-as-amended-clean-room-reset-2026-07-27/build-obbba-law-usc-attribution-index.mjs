import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  operativeLegalTextCommitment,
  publicLaw11921EditorialEvidence,
} from "./obbba-law-usc-comparison-lib.mjs";
import {
  validateUscComparisonIndex,
  validateUscSectionStoreEvidence,
} from "./build-obbba-law-usc-comparison-index.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const AUTHORITY_SHA =
  "977639eacd190746b9bf347fb933bf7434cbf80891d1b7255007c9daf2edcf26";
const STORE_SHA =
  "90e1f677227f510fd2b25f370d200ba49d5cc6476706d3be50bad66092177cdd";
const COMPARISON_SHA =
  "c2de89f8b5ff24485c19a4dc1c5658ce0a86ada9fba5030ec8de9adfccda76e5";
const STORE_BASENAME =
  "obbba-law-usc-selected-sections-2026-07-26";

export async function buildObbbaLawUscAttributionIndex({ onProgress } = {}) {
  return runObbbaLawUscAttributionIndexWithCommitments({
    onProgress,
    authorityPath: resolve(
      ROOT,
      "docs/evidence/OBBBA_LAW_OFFICIAL_AUTHORITY_MAP_2026-07-26.json",
    ),
    authoritySha256: AUTHORITY_SHA,
    storeEvidencePath: resolve(
      ROOT,
      "docs/evidence/OBBBA_LAW_USC_VERSIONED_SECTION_STORE_2026-07-26.json",
    ),
    storeEvidenceSha256: STORE_SHA,
    comparisonPath: resolve(
      ROOT,
      "docs/evidence/OBBBA_LAW_USC_STATE_COMPARISON_INDEX_2026-07-26.json",
    ),
    comparisonSha256: COMPARISON_SHA,
    storeDirectory: resolve(ROOT, ".discussionbridge-cache", STORE_BASENAME),
    storeBasename: STORE_BASENAME,
    outputPath: resolve(
      ROOT,
      "docs/evidence/OBBBA_LAW_USC_ATTRIBUTION_INDEX_V2_2026-07-26.json",
    ),
  });
}

export async function runObbbaLawUscAttributionIndexWithCommitments(options) {
  await assertAbsent(options.outputPath);
  if (basename(resolve(options.storeDirectory)) !== options.storeBasename) {
    throw new Error("Attribution source-store basename is invalid.");
  }
  const [authority, store, comparison] = await Promise.all([
    readPinnedJson(options.authorityPath, options.authoritySha256, "authority"),
    readPinnedJson(
      options.storeEvidencePath,
      options.storeEvidenceSha256,
      "section store",
    ),
    readPinnedJson(
      options.comparisonPath,
      options.comparisonSha256,
      "comparison",
    ),
  ]);
  validateUscSectionStoreEvidence(store);
  validateUscComparisonIndex(comparison, options.storeEvidenceSha256);
  const classifiedTargets = deriveClassifiedTargets(authority);
  const storeTargets = indexStore(store);
  const comparisonTargets = indexComparison(comparison);
  requireExactSets(classifiedTargets, storeTargets, "authority/store");
  requireExactSets(classifiedTargets, comparisonTargets, "authority/comparison");
  const entries = [];
  let completed = 0;
  for (const identity of [...classifiedTargets.keys()].sort(identitySort)) {
    const classified = classifiedTargets.get(identity);
    const stored = storeTargets.get(identity);
    const compared = comparisonTargets.get(identity);
    if (JSON.stringify(classified.obbbaSections)
      !== JSON.stringify(compared.obbbaSections)
      || JSON.stringify(classified.obbbaSections)
        !== JSON.stringify(stored.obbbaSections)) {
      throw new Error(`Attribution OBBBA binding drift: ${identity}.`);
    }
    const editorialEvidence = {};
    for (const role of ["prior", "before", "after", "current"]) {
      const version = stored.versions[role];
      const comparedVersion = compared.versions[role];
      if (version.state === "absent") {
        if (comparedVersion.state !== "absent"
          || comparedVersion.sourceDocumentSha256
            !== version.sourceDocumentSha256) {
          throw new Error(`Attribution absent-state drift: ${role}:${identity}.`);
        }
        continue;
      }
      const expectedRelative =
        `${role}/usc${classified.uscTitle.padStart(2, "0")}`
        + `-s${classified.uscSection}.xml`;
      if (version.relativePath !== expectedRelative) {
        throw new Error(`Attribution fragment path drift: ${role}:${identity}.`);
      }
      const sectionRoot = resolve(options.storeDirectory, "sections");
      const fragmentPath = resolve(
        options.storeDirectory,
        "sections",
        ...expectedRelative.split("/"),
      );
      const storeRelative = relative(sectionRoot, fragmentPath);
      if (!storeRelative || isAbsolute(storeRelative)
        || storeRelative === ".." || storeRelative.startsWith(`..\\`)
        || storeRelative.startsWith("../")) {
        throw new Error(`Attribution fragment path escapes store: ${identity}.`);
      }
      const bytes = await readFile(fragmentPath);
      if (bytes.length !== version.bytes || sha256(bytes) !== version.sha256) {
        throw new Error(`Attribution fragment drift: ${role}:${identity}.`);
      }
      const fragment = bytes.toString("utf8");
      const operative = operativeLegalTextCommitment(fragment);
      if (comparedVersion.state !== "present"
        || comparedVersion.sourceDocumentSha256
          !== version.sourceDocumentSha256
        || comparedVersion.sourceFragmentSha256 !== version.sha256
        || comparedVersion.operativeTextProfile !== operative.profile
        || comparedVersion.operativeTextSha256 !== operative.sha256
        || comparedVersion.operativeCharacters !== operative.characters
        || comparedVersion.operativeWords !== operative.words) {
        throw new Error(`Attribution semantic linkage drift: ${role}:${identity}.`);
      }
      if (role === "after" || role === "current") {
        editorialEvidence[role] =
          publicLaw11921EditorialEvidence(fragment);
      }
    }
    const allLinks = [...new Set([
      ...editorialEvidence.after.statusHeadingLinks,
      ...editorialEvidence.after.sourceCreditLinks,
      ...editorialEvidence.after.noteLinks,
      ...editorialEvidence.current.statusHeadingLinks,
      ...editorialEvidence.current.sourceCreditLinks,
      ...editorialEvidence.current.noteLinks,
    ])].sort();
    const referencedSections = [...new Set([
      ...editorialEvidence.after.referencedObbbaSections,
      ...editorialEvidence.current.referencedObbbaSections,
    ])].sort(sectionSort);
    const matchedSections = referencedSections
      .filter((section) => classified.obbbaSections.includes(section));
    const evidenceState = classifyEvidence({
      allLinks,
      descriptions: classified.classifications.map((item) => item.description),
      comparisons: compared.comparisons,
    });
    entries.push({
      uscTitle: classified.uscTitle,
      uscSection: classified.uscSection,
      obbbaSections: classified.obbbaSections,
      classifications: classified.classifications,
      comparisons: compared.comparisons,
      editorialEvidence,
      referencedObbbaSections: referencedSections,
      matchedObbbaSections: matchedSections,
      evidenceState,
    });
    completed += 1;
    await options.onProgress?.({ completed, total: 332 });
  }
  const result = {
    version: 2,
    mode: "obbba-law-usc-attribution-evidence-index",
    authorityBoundary:
      "This index records classification, editorial, and state evidence. "
      + "It does not infer legal causation from release differences.",
    inputs: {
      authoritySha256: options.authoritySha256,
      sectionStoreEvidenceSha256: options.storeEvidenceSha256,
      comparisonSha256: options.comparisonSha256,
    },
    summary: summarize(entries),
    entries,
  };
  await options.beforeCommit?.(result);
  await writeFile(options.outputPath, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return result;
}

function deriveClassifiedTargets(authority) {
  if (!authority || authority.version !== 1
    || authority.mode !== "obbba-law-official-authority-map"
    || authority.summary?.total !== 309
    || authority.summary?.classifiedToUsCode !== 227
    || authority.summary?.noUsCodeClassificationRecord !== 82
    || authority.summary?.classificationRows !== 635
    || !Array.isArray(authority.entries) || authority.entries.length !== 309) {
    throw new Error("Attribution authority map is invalid.");
  }
  const targets = new Map();
  const authoritySections = new Set();
  const classificationTuples = new Set();
  let classifiedSections = 0;
  let unclassifiedSections = 0;
  let classificationRows = 0;
  for (const entry of authority.entries) {
    if (!/^\d+[A-Za-z]?$/.test(entry.sectionId)
      || authoritySections.has(entry.sectionId)
      || !Array.isArray(entry.classifications)
      || !["classified-to-us-code", "no-us-code-classification-record"]
        .includes(entry.classificationStatus)
      || (entry.classificationStatus === "classified-to-us-code"
        ? entry.classifications.length < 1
        : entry.classifications.length !== 0)) {
      throw new Error("Attribution authority identity is invalid.");
    }
    authoritySections.add(entry.sectionId);
    if (entry.classificationStatus === "classified-to-us-code") {
      classifiedSections += 1;
    } else {
      unclassifiedSections += 1;
    }
    for (const classification of entry.classifications) {
      if (!/^[1-9]\d*$/.test(classification.uscTitle)
        || !/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(
          classification.uscSection,
        )
        || typeof classification.description !== "string"
        || !/^(?:|gen amd|new|nt|nt \[tbl\]|nt new|prec|prec new|repealed|tr (?:fr|to) \d+\/[A-Za-z0-9.-]+)$/.test(
          classification.description,
        )
        || classification.publicLaw !== "119-21"
        || typeof classification.publicLawSection !== "string"
        || typeof classification.statutePages !== "string") {
        throw new Error("Attribution classification record is invalid.");
      }
      const tuple = JSON.stringify([
        entry.sectionId,
        classification.uscTitle,
        classification.uscSection,
        classification.description,
        classification.publicLaw,
        classification.publicLawSection,
        classification.statutePages,
      ]);
      if (classificationTuples.has(tuple)) {
        throw new Error("Attribution classification record is duplicated.");
      }
      classificationTuples.add(tuple);
      classificationRows += 1;
      const identity = `${classification.uscTitle}:${classification.uscSection}`;
      const target = targets.get(identity) ?? {
        uscTitle: classification.uscTitle,
        uscSection: classification.uscSection,
        obbbaSections: [],
        classifications: [],
      };
      target.obbbaSections.push(entry.sectionId);
      target.classifications.push({
        obbbaSection: entry.sectionId,
        description: classification.description,
        publicLawSection: classification.publicLawSection,
      });
      targets.set(identity, target);
    }
  }
  if (authoritySections.size !== 309
    || classifiedSections !== 227
    || unclassifiedSections !== 82
    || classificationRows !== 635) {
    throw new Error("Attribution authority counts do not recompute.");
  }
  for (const target of targets.values()) {
    target.obbbaSections = [...new Set(target.obbbaSections)].sort(sectionSort);
    target.classifications.sort((left, right) =>
      sectionSort(left.obbbaSection, right.obbbaSection)
      || left.publicLawSection.localeCompare(right.publicLawSection));
  }
  if (targets.size !== 332) {
    throw new Error("Attribution authority did not derive 332 USC targets.");
  }
  return targets;
}

function indexStore(store) {
  if (!store || store.version !== 1
    || store.mode !== "obbba-law-usc-versioned-section-store"
    || !Array.isArray(store.entries) || store.entries.length !== 332) {
    throw new Error("Attribution section-store evidence is invalid.");
  }
  return uniqueIndex(store.entries, "section store");
}

function indexComparison(comparison) {
  if (!comparison || comparison.version !== 1
    || comparison.mode !== "obbba-law-usc-state-comparison-index"
    || !Array.isArray(comparison.entries) || comparison.entries.length !== 332) {
    throw new Error("Attribution comparison evidence is invalid.");
  }
  return uniqueIndex(comparison.entries, "comparison");
}

function uniqueIndex(entries, label) {
  const result = new Map();
  for (const entry of entries) {
    const identity = `${entry.uscTitle}:${entry.uscSection}`;
    if (result.has(identity)) {
      throw new Error(`Attribution ${label} identity duplicated: ${identity}.`);
    }
    result.set(identity, entry);
  }
  return result;
}

function requireExactSets(left, right, label) {
  if (left.size !== right.size
    || [...left.keys()].some((identity) => !right.has(identity))) {
    throw new Error(`Attribution target-set mismatch: ${label}.`);
  }
}

function classifyEvidence({ allLinks, descriptions, comparisons }) {
  if (allLinks.length) return "explicit-editorial-evidence";
  if (descriptions.every((value) => value === "prec" || value === "prec new")
    && Object.values(comparisons).every((value) => value === "unchanged")) {
    return "classification-context-only";
  }
  return "review-required";
}

function summarize(entries) {
  const evidenceStates = {};
  for (const entry of entries) {
    evidenceStates[entry.evidenceState] =
      (evidenceStates[entry.evidenceState] ?? 0) + 1;
  }
  return { targets: entries.length, evidenceStates };
}

async function readPinnedJson(path, expectedSha256, label) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 ?? "")) {
    throw new Error(`Attribution ${label} commitment is invalid.`);
  }
  const bytes = await readFile(path);
  if (sha256(bytes) !== expectedSha256) {
    throw new Error(`Attribution ${label} bytes do not match review.`);
  }
  return JSON.parse(bytes.toString("utf8"));
}

async function assertAbsent(path) {
  try {
    await readFile(path);
    throw new Error(`Attribution output already exists: ${path}.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function identitySort(left, right) {
  const [leftTitle, leftSection] = left.split(":");
  const [rightTitle, rightSection] = right.split(":");
  return Number(leftTitle) - Number(rightTitle)
    || sectionSort(leftSection, rightSection);
}

function sectionSort(left, right) {
  return left.localeCompare(right, "en", { numeric: true });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const result = await buildObbbaLawUscAttributionIndex({
    onProgress: ({ completed, total }) => {
      if (completed === 1 || completed % 25 === 0 || completed === total) {
        process.stdout.write(`Attributed ${completed}/${total} USC targets.\n`);
      }
    },
  });
  process.stdout.write(
    `Attribution index: ${result.summary.targets} targets.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
