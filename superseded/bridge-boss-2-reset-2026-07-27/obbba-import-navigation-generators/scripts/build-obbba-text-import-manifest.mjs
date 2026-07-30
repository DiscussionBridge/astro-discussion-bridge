import { promises as fs } from "node:fs";
import path from "node:path";
import {
  validateApprovedEnrolledBytes,
  validateEnrolledComparisonPacket,
  validateEnrolledSectionAuthority,
} from "./obbba-text-import-manifest-lib.mjs";

export const APPROVED_ENROLLED_BYTES_SHA256 =
  "128ab8e7884cfe18acab62082f714ae32943b9600a9ddeeee35215dbf6211ae9";
export const APPROVED_AUTHORITY_BYTES_SHA256 =
  "f10f9b688ed8c7ff0168b72587cfdea2ddc30a55ee0390e659f901b4616309b2";

const [reviewPath, authorityPath, navigationPath, outputPath] = process.argv.slice(2);
if (!reviewPath || !authorityPath || !navigationPath || !outputPath) {
  throw new Error(
    "Usage: node scripts/build-obbba-text-import-manifest.mjs REVIEW AUTHORITY NAVIGATION OUTPUT",
  );
}

const [reviewBytes, authorityBytes, navigation] = await Promise.all([
  fs.readFile(path.resolve(reviewPath)),
  fs.readFile(path.resolve(authorityPath)),
  readJson(navigationPath),
]);
const review = validateApprovedEnrolledBytes(reviewBytes, APPROVED_ENROLLED_BYTES_SHA256);
validateEnrolledComparisonPacket(review);
const authority = validateApprovedEnrolledBytes(authorityBytes, APPROVED_AUTHORITY_BYTES_SHA256);
validateEnrolledSectionAuthority(authority, review);
const authorityBySection = new Map(authority.entries.map((entry) => [entry.sectionId, entry]));

const lens = navigation?.lenses?.find((candidate) => candidate.key === "obbba-text");
if (!lens) throw new Error("Navigation manifest does not contain the OBBBA Text lens.");
const navigationSections = new Map();
walk(lens.nodes, undefined, (node, titleNode) => {
  if (node.kind !== "section") return;
  if (!Number.isInteger(node.topicId) || navigationSections.has(node.topicId)) {
    throw new Error(`Navigation contains an invalid or duplicate OBBBA Text topic: ${node.topicId}.`);
  }
  navigationSections.set(node.topicId, { node, titleNode });
});

const imports = [];
for (const entry of review.entries) {
  if (entry.sectionId === "10101") continue;
  const navigationEntry = navigationSections.get(entry.topicId);
  const node = navigationEntry?.node;
  if (!node || node.sourceUrl !== entry.sourceUrl) {
    throw new Error(`Navigation identity mismatch for OBBBA Text Section ${entry.sectionId}.`);
  }
  const nodeSectionId = node.label.match(/^Sec\.\s+([A-Za-z0-9.-]+)\./)?.[1];
  if (nodeSectionId !== entry.sectionId || node.label !== entry.label) {
    throw new Error(`Navigation section mismatch for OBBBA Text topic ${entry.topicId}.`);
  }
  const roman = navigationEntry?.titleNode?.label.match(/^TITLE\s+([IVX]+)/i)?.[1]?.toUpperCase();
  if (!roman) {
    throw new Error(`Could not resolve the title lane for OBBBA Text Section ${entry.sectionId}.`);
  }
  const output = `obbba-text/title-${roman.toLowerCase()}/${slugify(entry.label)}.md`;
  const bodyEdits = bodyEditsFor(entry);
  const enrolledAuthority = authorityBySection.get(entry.sectionId);
  if (!enrolledAuthority) {
    throw new Error(`Missing enrolled authority for OBBBA Text Section ${entry.sectionId}.`);
  }
  imports.push({
    topic: entry.topicId,
    output,
    sourceMode: "discourse-managed",
    commentsDisplay: "fullInteractive",
    sectionId: entry.sectionId,
    contentLens: "obbba-text",
    expectedCommunitySha256: entry.communityHash,
    expectedCommunityHashProfile: "legal-text",
    expectedPostUpdatedAt: entry.postUpdatedAt,
    ...(bodyEdits.length
      ? {
          expectedImportedBodySha256: enrolledAuthority.enrolledLegalTextSha256,
          expectedImportedBodyHashProfile: "enrolled-legal-text",
          bodyEdits,
        }
      : {}),
  });
}

if (imports.length !== 306) {
  throw new Error(`Expected exactly 306 missing OBBBA Text pages; found ${imports.length}.`);
}
if (new Set(imports.map((entry) => entry.topic)).size !== imports.length) {
  throw new Error("Generated OBBBA Text manifest contains duplicate topics.");
}
if (new Set(imports.map((entry) => entry.output.toLowerCase())).size !== imports.length) {
  throw new Error("Generated OBBBA Text manifest contains duplicate output paths.");
}
if (imports.filter((entry) => entry.bodyEdits).map((entry) => entry.sectionId).join(",") !== "10401,40005") {
  throw new Error("Generated OBBBA Text manifest does not contain exactly the two approved exceptions.");
}

const output = `${JSON.stringify({ version: 2, imports }, null, 2)}\n`;
await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await fs.writeFile(outputPath, output, { encoding: "utf8", flag: "wx" });
process.stdout.write(`Created hash-bound OBBBA Text import manifest with ${imports.length} entries: ${path.resolve(outputPath)}\n`);

function bodyEditsFor(entry) {
  if (entry.sectionId === "10401") {
    return [{
      operation: "remove-between-phrases",
      startPhrase: "Footnotes Not found in US Code apparently a direction to the Secretary",
      endPhrase: "(d) Tree assistance program",
    }];
  }
  if (entry.sectionId === "40005") {
    return [{
      operation: "append-after-terminal-phrase",
      terminalPhrase: "by adding at the end the following:",
      content: "“20306. Special appropriations for Mars missions, Artemis missions, and Moon to Mars program.”.",
    }];
  }
  return [];
}

function walk(nodes, titleNode, visit) {
  for (const node of nodes ?? []) {
    const currentTitle = node.kind === "title" ? node : titleNode;
    visit(node, currentTitle);
    walk(node.children, currentTitle, visit);
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "imported-discourse-topic";
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
}
