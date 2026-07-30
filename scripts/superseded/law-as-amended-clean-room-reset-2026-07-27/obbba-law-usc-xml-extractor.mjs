import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
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
import { inflateRawSync } from "node:zlib";

import { inspectZip } from "./obbba-law-usc-archive-collector.mjs";

const require = createRequire(
  new URL("../packages/astro-discussion-bridge/package.json", import.meta.url),
);
const { XMLParser, XMLValidator } = require("fast-xml-parser");

const ARCHIVE_EVIDENCE_SHA256 =
  "51ac2da3eebd6b81f0db22cd5fc59db11f55d7a2b2b337089e8f025a25986522";
const INCORPORATION_ARCHIVE_EVIDENCE_SHA256 =
  "5dc17fedeaaccfa834ce41732047685b80006d4158151a103b3ad1ec68d63f79";
const MAX_XML_BYTES = 250 * 1024 * 1024;

export function extractValidatedUscXml(archiveBytes, commitment) {
  const inspected = inspectZip(archiveBytes, commitment.expectedArchiveEntry);
  if (inspected.uncompressedBytes !== commitment.xmlUncompressedBytes
    || inspected.crc32 !== commitment.xmlCrc32) {
    throw new Error("USC ZIP metadata drifted from archive evidence.");
  }
  const compressed = archiveBytes.subarray(
    inspected.dataOffset,
    inspected.dataOffset + inspected.compressedBytes,
  );
  let xmlBytes;
  if (inspected.method === 0) {
    xmlBytes = Uint8Array.from(compressed);
  } else if (inspected.method === 8) {
    try {
      xmlBytes = new Uint8Array(inflateRawSync(compressed, {
        maxOutputLength: Math.min(MAX_XML_BYTES, inspected.uncompressedBytes + 1),
      }));
    } catch {
      throw new Error("USC XML decompression failed or exceeded its bound.");
    }
  } else {
    throw new Error("USC XML compression method is unsupported.");
  }
  if (xmlBytes.length !== inspected.uncompressedBytes
    || crc32(xmlBytes) !== inspected.crc32) {
    throw new Error("USC XML size or CRC does not match its ZIP commitment.");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(xmlBytes);
  } catch {
    throw new Error("USC XML is not valid UTF-8.");
  }
  const withoutBom = text.replace(/^\uFEFF/, "");
  if (/<!DOCTYPE|<!ENTITY/i.test(withoutBom)
    || XMLValidator.validate(withoutBom, {
      allowBooleanAttributes: false,
      unpairedTags: [],
    }) !== true
    || !hasOfficialUscDocRoot(withoutBom)) {
    throw new Error("USC XML is not a safe USLM uscDoc document.");
  }
  return { xmlBytes, sha256: sha256(xmlBytes) };
}

export async function extractObbbaLawUscXml({
  archiveEvidencePath,
  archiveDirectory,
  xmlDirectory,
  xmlEvidencePath,
  onProgress = () => undefined,
}) {
  return extractObbbaLawUscXmlWithCommitment({
    archiveEvidencePath,
    archiveDirectory,
    xmlDirectory,
    xmlEvidencePath,
    onProgress,
    expectedArchiveEvidenceSha256: ARCHIVE_EVIDENCE_SHA256,
    expectedReleaseRoles: ["current", "prior"],
    expectedArchiveBasename: "obbba-law-usc-archives-2026-07-26",
    expectedXmlBasename: "obbba-law-usc-xml-2026-07-26",
  });
}

export async function extractObbbaLawIncorporationWindowXml(options) {
  return extractObbbaLawUscXmlWithCommitment({
    ...options,
    expectedArchiveEvidenceSha256: INCORPORATION_ARCHIVE_EVIDENCE_SHA256,
    expectedReleaseRoles: ["before", "after"],
    expectedArchiveBasename:
      "obbba-law-usc-incorporation-archives-2026-07-26",
    expectedXmlBasename: "obbba-law-usc-incorporation-xml-2026-07-26",
  });
}

export async function extractObbbaLawUscXmlWithCommitment({
  archiveEvidencePath,
  archiveDirectory,
  xmlDirectory,
  xmlEvidencePath,
  onProgress = () => undefined,
  expectedArchiveEvidenceSha256,
  expectedReleaseRoles = ["current", "prior"],
  expectedArchiveBasename = "obbba-law-usc-archives-2026-07-26",
  expectedXmlBasename = "obbba-law-usc-xml-2026-07-26",
}) {
  if (!/^[a-f0-9]{64}$/.test(expectedArchiveEvidenceSha256)) {
    throw new Error("USC XML extraction requires an exact evidence commitment.");
  }
  await requireAbsent(xmlDirectory, "XML directory");
  await requireAbsent(xmlEvidencePath, "XML evidence");
  const archiveEvidenceText = await readFile(archiveEvidencePath, "utf8");
  if (sha256(archiveEvidenceText) !== expectedArchiveEvidenceSha256) {
    throw new Error("Approved USC archive-evidence byte commitment does not match.");
  }
  const evidence = validateArchiveEvidence(
    JSON.parse(archiveEvidenceText),
    expectedReleaseRoles,
  );
  validateCacheRelationship(
    archiveEvidencePath,
    archiveDirectory,
    xmlDirectory,
    expectedArchiveBasename,
    expectedXmlBasename,
  );

  const staging = join(
    dirname(xmlDirectory),
    `.discussionbridge-usc-xml-${randomUUID()}`,
  );
  await mkdir(staging, { recursive: false });
  let targetOwned = false;
  try {
    const outputs = [];
    for (const [index, entry] of evidence.archives.entries()) {
      await onProgress({ completed: index, total: evidence.archives.length, entry });
      const archivePath = join(
        archiveDirectory,
        ...entry.relativePath.split("/"),
      );
      const archiveBytes = new Uint8Array(await readFile(archivePath));
      if (archiveBytes.length !== entry.bytes
        || sha256(archiveBytes) !== entry.sha256) {
        throw new Error(`USC archive hash/size drift: ${entry.fileName}.`);
      }
      const extracted = extractValidatedUscXml(archiveBytes, entry);
      const fileName =
        `${entry.releaseRole}-usc${entry.uscTitle.padStart(2, "0")}.xml`;
      await writeFile(join(staging, fileName), extracted.xmlBytes, { flag: "wx" });
      outputs.push({
        releaseRole: entry.releaseRole,
        releasePoint: entry.releasePoint,
        uscTitle: entry.uscTitle,
        sourceArchiveSha256: entry.sha256,
        fileName,
        bytes: extracted.xmlBytes.length,
        sha256: extracted.sha256,
      });
    }
    await onProgress({ phase: "before-target-commit" });
    await mkdir(xmlDirectory, { recursive: false });
    targetOwned = true;
    await rename(staging, join(xmlDirectory, "documents"));
    const xmlEvidence = {
      version: 1,
      mode: "obbba-law-usc-xml-evidence",
      input: { archiveEvidenceSha256: expectedArchiveEvidenceSha256 },
      summary: {
        documents: outputs.length,
        titles: new Set(outputs.map((entry) => entry.uscTitle)).size,
        totalBytes: outputs.reduce((sum, entry) => sum + entry.bytes, 0),
      },
      documents: outputs.map((entry) => ({
        ...entry,
        relativePath: `documents/${entry.fileName}`,
      })),
    };
    await onProgress({ phase: "before-evidence-commit" });
    await writeFile(xmlEvidencePath, `${JSON.stringify(xmlEvidence, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await onProgress({ completed: outputs.length, total: outputs.length });
    return xmlEvidence;
  } catch (error) {
    await rm(targetOwned ? xmlDirectory : staging, {
      recursive: true,
      force: true,
    });
    throw error;
  }
}

function validateArchiveEvidence(value, expectedReleaseRoles) {
  if (!value || value.version !== 1
    || value.mode !== "obbba-law-usc-archive-evidence"
    || value.summary?.archives !== 40
    || value.summary?.titles !== 20
    || !Array.isArray(value.archives) || value.archives.length !== 40) {
    throw new Error("USC archive evidence has an unexpected schema or summary.");
  }
  const identities = new Set();
  let totalBytes = 0;
  for (const entry of value.archives) {
    const identity = `${entry?.releaseRole}:${entry?.uscTitle}`;
    if (!expectedReleaseRoles.includes(entry?.releaseRole)
      || !/^\d{1,2}$/.test(entry?.uscTitle)
      || !/^[a-f0-9]{64}$/.test(entry?.sha256)
      || !/^[a-f0-9]{8}$/.test(entry?.xmlCrc32)
      || !Number.isInteger(entry?.bytes) || entry.bytes <= 0
      || !Number.isInteger(entry?.xmlUncompressedBytes)
      || entry.xmlUncompressedBytes <= 0 || entry.xmlUncompressedBytes > MAX_XML_BYTES
      || entry.relativePath !== `archives/${entry.fileName}`
      || entry.expectedArchiveEntry !== `usc${entry.uscTitle.padStart(2, "0")}.xml`
      || identities.has(identity)) {
      throw new Error("USC archive evidence contains an invalid commitment.");
    }
    identities.add(identity);
    totalBytes += entry.bytes;
  }
  if (identities.size !== 40 || totalBytes !== value.summary.totalBytes) {
    throw new Error("USC archive evidence summary does not match its entries.");
  }
  return value;
}

function validateCacheRelationship(
  evidencePath,
  archiveDirectory,
  xmlDirectory,
  expectedArchiveBasename,
  expectedXmlBasename,
) {
  const repositoryRoot = resolve(dirname(resolve(evidencePath)), "..", "..");
  const cacheRoot = join(repositoryRoot, ".discussionbridge-cache");
  if (resolve(dirname(archiveDirectory)) !== cacheRoot
    || resolve(dirname(xmlDirectory)) !== cacheRoot
    || archiveDirectory.split(/[\\/]/).at(-1) !== expectedArchiveBasename
    || xmlDirectory.split(/[\\/]/).at(-1) !== expectedXmlBasename
    || resolve(archiveDirectory) === resolve(xmlDirectory)) {
    throw new Error("USC archive/XML paths must be distinct children of the fixed cache root.");
  }
}

function hasOfficialUscDocRoot(xml) {
  let parsed;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      preserveOrder: true,
      processEntities: false,
    }).parse(xml);
  } catch {
    return false;
  }
  const elements = parsed.filter((node) =>
    Object.keys(node).some((key) =>
      !key.startsWith("?") && key !== "#comment" && key !== ":@"));
  return elements.length === 1
    && Object.hasOwn(elements[0], "uscDoc")
    && elements[0][":@"]?.["@_xmlns"]
      === "http://xml.house.gov/schemas/uslm/1.0";
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const evidence = await extractObbbaLawUscXml({
    archiveEvidencePath:
      "docs/evidence/OBBBA_LAW_USC_ARCHIVE_EVIDENCE_2026-07-26.json",
    archiveDirectory:
      ".discussionbridge-cache/obbba-law-usc-archives-2026-07-26",
    xmlDirectory:
      ".discussionbridge-cache/obbba-law-usc-xml-2026-07-26",
    xmlEvidencePath:
      "docs/evidence/OBBBA_LAW_USC_XML_EVIDENCE_2026-07-26.json",
    onProgress: ({ completed, total, entry }) => {
      if (entry) {
        process.stdout.write(
          `Extracting ${completed + 1}/${total}: `
          + `${entry.releaseRole} USC ${entry.uscTitle}.\n`,
        );
      }
    },
  });
  process.stdout.write(
    `Extracted ${evidence.summary.documents} official USLM XML documents `
    + `(${evidence.summary.totalBytes} bytes).\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
