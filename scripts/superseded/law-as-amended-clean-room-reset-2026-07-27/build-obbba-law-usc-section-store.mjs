import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { selectUscTargets } from "./obbba-law-usc-section-selector-lib.mjs";

const AUTHORITY_SHA256 =
  "977639eacd190746b9bf347fb933bf7434cbf80891d1b7255007c9daf2edcf26";
const CURRENT_PRIOR_XML_EVIDENCE_SHA256 =
  "4c6d63d0139f37d7094f12af9660c2c936b315f5ae69fb983ac6832c44935df6";
const INCORPORATION_XML_EVIDENCE_SHA256 =
  "84136240ddc76309e82dd7d39ca8c4cd4fce08a0bdd737ce0075aa55f0829577";

export async function buildObbbaLawUscSectionStore({
  authorityMapPath,
  currentPriorEvidencePath,
  currentPriorXmlDirectory,
  incorporationEvidencePath,
  incorporationXmlDirectory,
  sectionStoreDirectory,
  sectionEvidencePath,
  onProgress = () => undefined,
}) {
  return buildObbbaLawUscSectionStoreWithCommitments({
    authorityMapPath,
    currentPriorEvidencePath,
    currentPriorXmlDirectory,
    incorporationEvidencePath,
    incorporationXmlDirectory,
    sectionStoreDirectory,
    sectionEvidencePath,
    onProgress,
    expectedAuthoritySha256: AUTHORITY_SHA256,
    expectedCurrentPriorEvidenceSha256: CURRENT_PRIOR_XML_EVIDENCE_SHA256,
    expectedIncorporationEvidenceSha256:
      INCORPORATION_XML_EVIDENCE_SHA256,
    expectedCurrentPriorBasename: "obbba-law-usc-xml-2026-07-26",
    expectedIncorporationBasename:
      "obbba-law-usc-incorporation-xml-2026-07-26",
    expectedStoreBasename:
      "obbba-law-usc-selected-sections-2026-07-26",
  });
}

export async function buildObbbaLawUscSectionStoreWithCommitments({
  authorityMapPath,
  currentPriorEvidencePath,
  currentPriorXmlDirectory,
  incorporationEvidencePath,
  incorporationXmlDirectory,
  sectionStoreDirectory,
  sectionEvidencePath,
  onProgress = () => undefined,
  expectedAuthoritySha256,
  expectedCurrentPriorEvidenceSha256,
  expectedIncorporationEvidenceSha256,
  expectedCurrentPriorBasename,
  expectedIncorporationBasename,
  expectedStoreBasename,
}) {
  for (const commitment of [
    expectedAuthoritySha256,
    expectedCurrentPriorEvidenceSha256,
    expectedIncorporationEvidenceSha256,
  ]) {
    if (!/^[a-f0-9]{64}$/.test(commitment)) {
      throw new Error("Section store requires exact SHA-256 commitments.");
    }
  }
  await requireAbsent(sectionStoreDirectory, "section store");
  await requireAbsent(sectionEvidencePath, "section evidence");
  validateFixedCachePaths({
    authorityMapPath,
    currentPriorXmlDirectory,
    incorporationXmlDirectory,
    sectionStoreDirectory,
    expectedCurrentPriorBasename,
    expectedIncorporationBasename,
    expectedStoreBasename,
  });
  const [authorityText, currentPriorText, incorporationText] = await Promise.all([
    readPinned(authorityMapPath, expectedAuthoritySha256, "authority map"),
    readPinned(
      currentPriorEvidencePath,
      expectedCurrentPriorEvidenceSha256,
      "current/prior XML evidence",
    ),
    readPinned(
      incorporationEvidencePath,
      expectedIncorporationEvidenceSha256,
      "incorporation XML evidence",
    ),
  ]);
  const targetsByTitle = authorityTargets(JSON.parse(authorityText));
  const documents = new Map([
    ...validateXmlEvidence(
      JSON.parse(currentPriorText),
      ["current", "prior"],
      currentPriorXmlDirectory,
    ),
    ...validateXmlEvidence(
      JSON.parse(incorporationText),
      ["before", "after"],
      incorporationXmlDirectory,
    ),
  ]);
  if (documents.size !== 80) {
    throw new Error("Section store requires exactly 80 role/title documents.");
  }

  const staging = join(
    dirname(sectionStoreDirectory),
    `.discussionbridge-usc-sections-${randomUUID()}`,
  );
  await mkdir(staging, { recursive: false });
  let targetOwned = false;
  try {
    for (const role of ["prior", "before", "after", "current"]) {
      await mkdir(join(staging, role), { recursive: false });
    }
    const entries = [];
    let completedDocuments = 0;
    for (const [uscTitle, targetMap] of targetsByTitle) {
      const targets = [...targetMap.keys()].sort(sectionSort);
      const versionsByTarget = new Map(
        targets.map((target) => [target, {}]),
      );
      for (const role of ["prior", "before", "after", "current"]) {
        const document = documents.get(`${role}:${uscTitle}`);
        if (!document) {
          throw new Error(`Missing XML document commitment: ${role}:${uscTitle}.`);
        }
        const sourceBytes = await readFile(document.path);
        if (sourceBytes.length !== document.bytes
          || sha256(sourceBytes) !== document.sha256) {
          throw new Error(`USC XML source drift: ${role}:${uscTitle}.`);
        }
        const selected = selectUscTargets(
          sourceBytes.toString("utf8"),
          uscTitle,
          targets,
        );
        for (const fragment of selected) {
          if (fragment.state === "absent") {
            versionsByTarget.get(fragment.uscSection)[role] = {
              state: "absent",
              sourceDocumentSha256: document.sha256,
            };
            continue;
          }
          const fileName =
            `usc${uscTitle.padStart(2, "0")}-s${fragment.uscSection}.xml`;
          await writeFile(
            join(staging, role, fileName),
            fragment.fragment,
            { encoding: "utf8", flag: "wx" },
          );
          versionsByTarget.get(fragment.uscSection)[role] = {
            state: "present",
            sourceDocumentSha256: document.sha256,
            sourceIdentifier: fragment.sourceIdentifier,
            relativePath: `${role}/${fileName}`,
            bytes: fragment.bytes,
            sha256: fragment.sha256,
          };
        }
        completedDocuments += 1;
        await onProgress({
          completed: completedDocuments,
          total: 80,
          role,
          uscTitle,
          targets: targets.length,
        });
      }
      for (const target of targets) {
        entries.push({
          uscTitle,
          uscSection: target,
          obbbaSections: [...targetMap.get(target).obbbaSections].sort(sectionSort),
          classificationRows: targetMap.get(target).classificationRows,
          versions: versionsByTarget.get(target),
        });
      }
    }
    if (entries.length !== 332
      || entries.some((entry) =>
        Object.keys(entry.versions).sort().join(",")
          !== "after,before,current,prior")) {
      throw new Error("Section store did not produce 332 four-version target states.");
    }
    const patterns = new Map();
    for (const entry of entries) {
      const pattern = ["prior", "before", "after", "current"]
        .map((role) => entry.versions[role].state === "present" ? "1" : "0")
        .join("");
      patterns.set(pattern, (patterns.get(pattern) ?? 0) + 1);
    }
    if (patterns.size !== 2
      || patterns.get("1111") !== 288
      || patterns.get("0011") !== 44) {
      throw new Error(
        "Section store presence transitions are not the reviewed 288/44 set.",
      );
    }
    await onProgress({ phase: "before-target-commit" });
    await mkdir(sectionStoreDirectory, { recursive: false });
    targetOwned = true;
    await rename(staging, join(sectionStoreDirectory, "sections"));
    const evidence = {
      version: 1,
      mode: "obbba-law-usc-versioned-section-store",
      attributionRule:
        "Text differences are state evidence; OBBBA attribution requires "
        + "Public Law 119-21 authority evidence.",
      inputs: {
        authorityMapSha256: expectedAuthoritySha256,
        currentPriorXmlEvidenceSha256: expectedCurrentPriorEvidenceSha256,
        incorporationXmlEvidenceSha256:
          expectedIncorporationEvidenceSha256,
      },
      summary: {
        targets: entries.length,
        versionsPerTarget: 4,
        presentFragments: 1240,
        absentStates: 88,
        presentAllFour: 288,
        addedInIncorporationWindow: 44,
        titles: targetsByTitle.length,
      },
      entries,
    };
    await onProgress({ phase: "before-evidence-commit" });
    await writeFile(sectionEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    return evidence;
  } catch (error) {
    await rm(targetOwned ? sectionStoreDirectory : staging, {
      recursive: true,
      force: true,
    });
    throw error;
  }
}

function authorityTargets(map) {
  if (map?.version !== 1 || map?.summary?.classificationRows !== 635
    || !Array.isArray(map.entries) || map.entries.length !== 309) {
    throw new Error("Section store authority map is invalid.");
  }
  const byTitle = new Map();
  for (const entry of map.entries) {
    for (const classification of entry.classifications) {
      const titleTargets = byTitle.get(classification.uscTitle) ?? new Map();
      const target = titleTargets.get(classification.uscSection) ?? {
        obbbaSections: new Set(),
        classificationRows: 0,
      };
      target.obbbaSections.add(entry.sectionId);
      target.classificationRows += 1;
      titleTargets.set(classification.uscSection, target);
      byTitle.set(classification.uscTitle, titleTargets);
    }
  }
  if (byTitle.size !== 20
    || [...byTitle.values()].reduce((sum, targets) => sum + targets.size, 0) !== 332) {
    throw new Error("Section store authority target set is not 20 titles/332 targets.");
  }
  return [...byTitle.entries()]
    .sort(([left], [right]) => Number(left) - Number(right));
}

function validateXmlEvidence(evidence, roles, directory) {
  if (evidence?.version !== 1
    || evidence?.mode !== "obbba-law-usc-xml-evidence"
    || evidence?.summary?.documents !== 40
    || evidence?.summary?.titles !== 20
    || !Array.isArray(evidence.documents) || evidence.documents.length !== 40) {
    throw new Error("Section store XML evidence is invalid.");
  }
  const output = [];
  const identities = new Set();
  for (const document of evidence.documents) {
    const identity = `${document.releaseRole}:${document.uscTitle}`;
    if (!roles.includes(document.releaseRole)
      || !/^\d{1,2}$/.test(document.uscTitle)
      || !/^[a-f0-9]{64}$/.test(document.sha256)
      || !Number.isInteger(document.bytes) || document.bytes <= 0
      || document.relativePath !== `documents/${document.fileName}`
      || identities.has(identity)) {
      throw new Error("Section store XML evidence contains an invalid commitment.");
    }
    identities.add(identity);
    output.push([identity, {
      ...document,
      path: join(directory, ...document.relativePath.split("/")),
    }]);
  }
  if (identities.size !== 40) {
    throw new Error("Section store XML evidence lacks exact role/title identities.");
  }
  return output;
}

function validateFixedCachePaths({
  authorityMapPath,
  currentPriorXmlDirectory,
  incorporationXmlDirectory,
  sectionStoreDirectory,
  expectedCurrentPriorBasename,
  expectedIncorporationBasename,
  expectedStoreBasename,
}) {
  const repositoryRoot = resolve(dirname(resolve(authorityMapPath)), "..", "..");
  const cache = join(repositoryRoot, ".discussionbridge-cache");
  const expected = new Map([
    [resolve(currentPriorXmlDirectory), expectedCurrentPriorBasename],
    [
      resolve(incorporationXmlDirectory),
      expectedIncorporationBasename,
    ],
    [
      resolve(sectionStoreDirectory),
      expectedStoreBasename,
    ],
  ]);
  for (const [path, basename] of expected) {
    if (dirname(path) !== cache || path.split(/[\\/]/).at(-1) !== basename) {
      throw new Error("Section store paths must use exact fixed cache children.");
    }
  }
}

async function readPinned(path, expectedHash, label) {
  const text = await readFile(path, "utf8");
  if (sha256(text) !== expectedHash) {
    throw new Error(`Approved ${label} byte commitment does not match.`);
  }
  return text;
}

async function requireAbsent(path, label) {
  try {
    await access(path);
    throw new Error(`USC ${label} already exists: ${path}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`USC ${label} already exists:`)) {
      throw error;
    }
    if (error?.code !== "ENOENT") throw error;
  }
}

function sectionSort(left, right) {
  return left.localeCompare(right, "en", { numeric: true });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const evidence = await buildObbbaLawUscSectionStore({
    authorityMapPath:
      "docs/evidence/OBBBA_LAW_OFFICIAL_AUTHORITY_MAP_2026-07-26.json",
    currentPriorEvidencePath:
      "docs/evidence/OBBBA_LAW_USC_XML_EVIDENCE_2026-07-26.json",
    currentPriorXmlDirectory:
      ".discussionbridge-cache/obbba-law-usc-xml-2026-07-26",
    incorporationEvidencePath:
      "docs/evidence/OBBBA_LAW_INCORPORATION_WINDOW_XML_EVIDENCE_2026-07-26.json",
    incorporationXmlDirectory:
      ".discussionbridge-cache/obbba-law-usc-incorporation-xml-2026-07-26",
    sectionStoreDirectory:
      ".discussionbridge-cache/obbba-law-usc-selected-sections-2026-07-26",
    sectionEvidencePath:
      "docs/evidence/OBBBA_LAW_USC_VERSIONED_SECTION_STORE_2026-07-26.json",
    onProgress: ({ completed, total, role, uscTitle, targets }) => {
      if (role) {
        process.stdout.write(
          `Selected ${completed}/${total}: ${role} USC ${uscTitle} `
          + `(${targets} targets).\n`,
        );
      }
    },
  });
  process.stdout.write(
    `Section store: ${evidence.summary.targets} targets; `
    + `${evidence.summary.presentFragments} present fragments; `
    + `${evidence.summary.absentStates} absent states.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
