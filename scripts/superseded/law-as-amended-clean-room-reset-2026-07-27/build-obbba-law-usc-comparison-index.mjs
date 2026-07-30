import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  compareVersionCommitments,
  operativeLegalTextCommitment,
} from "./obbba-law-usc-comparison-lib.mjs";

const STORE_EVIDENCE_SHA256 =
  "90e1f677227f510fd2b25f370d200ba49d5cc6476706d3be50bad66092177cdd";
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const STORE_BASENAME =
  "obbba-law-usc-selected-sections-2026-07-26";
const ROLES = ["prior", "before", "after", "current"];

export async function buildObbbaLawUscComparisonIndex({ onProgress } = {}) {
  return runObbbaLawUscComparisonIndexWithCommitments({
    onProgress,
    storeEvidencePath: resolve(
      REPOSITORY_ROOT,
      "docs/evidence/OBBBA_LAW_USC_VERSIONED_SECTION_STORE_2026-07-26.json",
    ),
    sectionStoreDirectory: resolve(
      REPOSITORY_ROOT,
      ".discussionbridge-cache",
      STORE_BASENAME,
    ),
    outputPath: resolve(
      REPOSITORY_ROOT,
      "docs/evidence/OBBBA_LAW_USC_STATE_COMPARISON_INDEX_2026-07-26.json",
    ),
    expectedStoreEvidenceSha256: STORE_EVIDENCE_SHA256,
    expectedStoreBasename: STORE_BASENAME,
  });
}

export async function runObbbaLawUscComparisonIndexWithCommitments(options) {
  const outputPath = resolve(options.outputPath);
  await assertAbsent(outputPath);
  if (basename(resolve(options.sectionStoreDirectory))
    !== options.expectedStoreBasename) {
    throw new Error("USC section-store basename does not match commitment.");
  }
  const evidenceBytes = await readFile(resolve(options.storeEvidencePath));
  if (!/^[a-f0-9]{64}$/.test(options.expectedStoreEvidenceSha256 ?? "")
    || sha256(evidenceBytes) !== options.expectedStoreEvidenceSha256) {
    throw new Error("USC section-store evidence bytes do not match review.");
  }
  const store = JSON.parse(evidenceBytes.toString("utf8"));
  validateUscSectionStoreEvidence(store);
  const storeRoot = resolve(options.sectionStoreDirectory, "sections");
  const entries = [];
  let completed = 0;
  for (const entry of store.entries) {
    const versions = {};
    for (const role of ROLES) {
      const source = entry.versions[role];
      if (source.state === "absent") {
        versions[role] = {
          state: "absent",
          sourceDocumentSha256: source.sourceDocumentSha256,
        };
        continue;
      }
      const expectedRelative =
        `${role}/usc${entry.uscTitle.padStart(2, "0")}-s${entry.uscSection}.xml`;
      if (source.relativePath !== expectedRelative) {
        throw new Error(`USC fragment path drift: ${role}:${entry.uscTitle}:${entry.uscSection}.`);
      }
      const fragmentPath = resolve(storeRoot, ...source.relativePath.split("/"));
      const storeRelative = relative(storeRoot, fragmentPath);
      if (!storeRelative || isAbsolute(storeRelative)
        || storeRelative === ".." || storeRelative.startsWith(`..\\`)
        || storeRelative.startsWith("../")
        || basename(fragmentPath) !== basename(source.relativePath)) {
        throw new Error("USC fragment path escapes the reviewed store.");
      }
      const bytes = await readFile(fragmentPath);
      if (bytes.length !== source.bytes || sha256(bytes) !== source.sha256) {
        throw new Error(`USC fragment drift: ${role}:${entry.uscTitle}:${entry.uscSection}.`);
      }
      const commitment = operativeLegalTextCommitment(bytes.toString("utf8"));
      versions[role] = {
        state: "present",
        sourceDocumentSha256: source.sourceDocumentSha256,
        sourceFragmentSha256: source.sha256,
        operativeTextProfile: commitment.profile,
        operativeTextSha256: commitment.sha256,
        operativeCharacters: commitment.characters,
        operativeWords: commitment.words,
      };
    }
    entries.push({
      uscTitle: entry.uscTitle,
      uscSection: entry.uscSection,
      obbbaSections: entry.obbbaSections,
      versions,
      comparisons: compareVersionCommitments(versions),
    });
    completed += 1;
    await options.onProgress?.({ completed, total: store.entries.length });
  }
  const result = {
    version: 1,
    mode: "obbba-law-usc-state-comparison-index",
    authorityBoundary:
      "Release comparisons are state evidence only; OBBBA attribution requires "
      + "separate Public Law 119-21 authority evidence.",
    input: {
      sectionStoreEvidenceSha256: options.expectedStoreEvidenceSha256,
    },
    summary: buildSummary(entries),
    entries,
  };
  await options.beforeCommit?.(result);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return result;
}

export function validateUscSectionStoreEvidence(value) {
  if (!value || value.version !== 1
    || value.mode !== "obbba-law-usc-versioned-section-store"
    || value.summary?.targets !== 332
    || value.summary?.presentFragments !== 1240
    || value.summary?.absentStates !== 88
    || !Array.isArray(value.entries) || value.entries.length !== 332) {
    throw new Error("USC section-store evidence shape/counts are invalid.");
  }
  const identities = new Set();
  let present = 0;
  let absent = 0;
  for (const entry of value.entries) {
    if (!/^\d+$/.test(entry.uscTitle)
      || !/^[A-Za-z0-9.-]+$/.test(entry.uscSection)
      || !Array.isArray(entry.obbbaSections)
      || !entry.obbbaSections.length
      || entry.obbbaSections.some((id) => !/^\d+[A-Za-z]?$/.test(id))
      || new Set(entry.obbbaSections).size !== entry.obbbaSections.length) {
      throw new Error("USC section-store entry identity is invalid.");
    }
    const identity = `${entry.uscTitle}:${entry.uscSection}`;
    if (identities.has(identity)) {
      throw new Error(`USC section-store identity is duplicated: ${identity}.`);
    }
    identities.add(identity);
    if (!entry.versions
      || Object.keys(entry.versions).sort().join(",")
        !== "after,before,current,prior") {
      throw new Error(`USC section-store versions are invalid: ${identity}.`);
    }
    for (const role of ROLES) {
      const version = entry.versions[role];
      if (!version || !/^[a-f0-9]{64}$/.test(version.sourceDocumentSha256 ?? "")) {
        throw new Error(`USC source document commitment is invalid: ${identity}.`);
      }
      if (version.state === "present") {
        if (Object.keys(version).sort().join(",")
          !== "bytes,relativePath,sha256,sourceDocumentSha256,sourceIdentifier,state"
          || !/^[a-f0-9]{64}$/.test(version.sha256 ?? "")
          || !Number.isSafeInteger(version.bytes) || version.bytes < 1
          || typeof version.relativePath !== "string"
          || typeof version.sourceIdentifier !== "string"
          || version.sourceIdentifier.replaceAll("–", "-")
            !== `/us/usc/t${entry.uscTitle}/s${entry.uscSection}`) {
          throw new Error(`USC present state is invalid: ${role}:${identity}.`);
        }
        present += 1;
      } else if (version.state === "absent") {
        if (Object.keys(version).sort().join(",")
          !== "sourceDocumentSha256,state") {
          throw new Error(`USC absent state is invalid: ${role}:${identity}.`);
        }
        absent += 1;
      } else {
        throw new Error(`USC state is invalid: ${role}:${identity}.`);
      }
    }
  }
  if (present !== 1240 || absent !== 88) {
    throw new Error("USC section-store state counts do not recompute.");
  }
  const patterns = new Map();
  for (const entry of value.entries) {
    const pattern = ROLES.map((role) =>
      entry.versions[role].state === "present" ? "1" : "0").join("");
    patterns.set(pattern, (patterns.get(pattern) ?? 0) + 1);
  }
  if (patterns.size !== 2
    || patterns.get("1111") !== 288
    || patterns.get("0011") !== 44) {
    throw new Error("USC section-store presence patterns do not recompute.");
  }
}

export function validateUscComparisonIndex(value, expectedStoreSha256) {
  if (!value || value.version !== 1
    || value.mode !== "obbba-law-usc-state-comparison-index"
    || value.input?.sectionStoreEvidenceSha256 !== expectedStoreSha256
    || !Array.isArray(value.entries) || value.entries.length !== 332) {
    throw new Error("USC comparison index shape/input is invalid.");
  }
  const identities = new Set();
  const recomputedWindows = {
    incorporationWindow: {},
    broadHistorical: {},
    laterEvolution: {},
  };
  for (const entry of value.entries) {
    if (Object.keys(entry).sort().join(",")
      !== "comparisons,obbbaSections,uscSection,uscTitle,versions"
      || !/^\d+$/.test(entry.uscTitle)
      || !/^[A-Za-z0-9.-]+$/.test(entry.uscSection)
      || !Array.isArray(entry.obbbaSections) || !entry.obbbaSections.length
      || new Set(entry.obbbaSections).size !== entry.obbbaSections.length) {
      throw new Error("USC comparison entry identity/schema is invalid.");
    }
    const identity = `${entry.uscTitle}:${entry.uscSection}`;
    if (identities.has(identity)) {
      throw new Error(`USC comparison identity is duplicated: ${identity}.`);
    }
    identities.add(identity);
    if (Object.keys(entry.versions).sort().join(",")
      !== "after,before,current,prior"
      || Object.keys(entry.comparisons).sort().join(",")
        !== "broadHistorical,incorporationWindow,laterEvolution") {
      throw new Error(`USC comparison roles/windows are invalid: ${identity}.`);
    }
    for (const role of ROLES) {
      const version = entry.versions[role];
      const absentKeys = "sourceDocumentSha256,state";
      const presentKeys =
        "operativeCharacters,operativeTextProfile,operativeTextSha256,"
        + "operativeWords,sourceDocumentSha256,sourceFragmentSha256,state";
      if (!version || !["present", "absent"].includes(version.state)
        || Object.keys(version).sort().join(",")
          !== (version.state === "present" ? presentKeys : absentKeys)
        || !/^[a-f0-9]{64}$/.test(version.sourceDocumentSha256 ?? "")
        || (version.state === "present"
          && (version.operativeTextProfile !== "uslm-operative-text-v1"
            || !/^[a-f0-9]{64}$/.test(version.operativeTextSha256 ?? "")
            || !/^[a-f0-9]{64}$/.test(version.sourceFragmentSha256 ?? "")
            || !Number.isSafeInteger(version.operativeCharacters)
            || version.operativeCharacters < 1
            || !Number.isSafeInteger(version.operativeWords)
            || version.operativeWords < 1))) {
        throw new Error(`USC comparison version is invalid: ${role}:${identity}.`);
      }
    }
    const derived = compareVersionCommitments(entry.versions);
    if (JSON.stringify(derived) !== JSON.stringify(entry.comparisons)) {
      throw new Error(`USC comparison outcomes do not recompute: ${identity}.`);
    }
    for (const [window, outcome] of Object.entries(derived)) {
      recomputedWindows[window][outcome] =
        (recomputedWindows[window][outcome] ?? 0) + 1;
    }
  }
  if (value.summary?.targets !== 332
    || JSON.stringify(value.summary.windows)
      !== JSON.stringify(recomputedWindows)) {
    throw new Error("USC comparison summary does not recompute.");
  }
}

function buildSummary(entries) {
  const windows = {
    incorporationWindow: {},
    broadHistorical: {},
    laterEvolution: {},
  };
  for (const entry of entries) {
    for (const [window, outcome] of Object.entries(entry.comparisons)) {
      windows[window][outcome] = (windows[window][outcome] ?? 0) + 1;
    }
  }
  return { targets: entries.length, windows };
}

async function assertAbsent(path) {
  try {
    await readFile(path);
    throw new Error(`Comparison output already exists: ${path}.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const result = await buildObbbaLawUscComparisonIndex({
    onProgress: ({ completed, total }) => {
      if (completed === 1 || completed % 25 === 0 || completed === total) {
        process.stdout.write(`Compared ${completed}/${total} USC targets.\n`);
      }
    },
  });
  process.stdout.write(`Comparison index: ${result.summary.targets} targets.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
