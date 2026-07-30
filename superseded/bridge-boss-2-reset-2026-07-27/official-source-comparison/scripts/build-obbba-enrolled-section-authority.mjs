import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeLegalText } from "../packages/astro-discussion-bridge/dist/official-source.js";
import { extractEnrolledSections } from "./enrolled-source-lib.mjs";
import {
  validateApprovedEnrolledBytes,
  validateEnrolledComparisonPacket,
} from "./obbba-text-import-manifest-lib.mjs";

const APPROVED_COMPARISON_SHA256 =
  "128ab8e7884cfe18acab62082f714ae32943b9600a9ddeeee35215dbf6211ae9";

const [comparisonPath, enrolledPath, outputPath] = process.argv.slice(2);
if (!comparisonPath || !enrolledPath || !outputPath) {
  throw new Error(
    "Usage: node scripts/build-obbba-enrolled-section-authority.mjs COMPARISON ENROLLED OUTPUT",
  );
}

const [comparisonBytes, enrolledBytes] = await Promise.all([
  fs.readFile(path.resolve(comparisonPath)),
  fs.readFile(path.resolve(enrolledPath)),
]);
const comparison = validateApprovedEnrolledBytes(comparisonBytes, APPROVED_COMPARISON_SHA256);
validateEnrolledComparisonPacket(comparison);
const sourceSha256 = sha256(enrolledBytes);
if (sourceSha256 !== comparison.baseline.sourceSha256) {
  throw new Error(`Enrolled source bytes do not match the reviewed comparison: ${sourceSha256}.`);
}
const sections = extractEnrolledSections(enrolledBytes.toString("utf8"));
const entries = comparison.entries.map((entry) => {
  const text = sections.get(entry.sectionId);
  if (!text) throw new Error(`Enrolled source is missing Section ${entry.sectionId}.`);
  return {
    sectionId: entry.sectionId,
    topicId: entry.topicId,
    sourceUrl: entry.sourceUrl,
    enrolledLegalTextSha256: sha256(normalizeLegalText(text)),
  };
});
if (entries.length !== 307 || new Set(entries.map((entry) => entry.sectionId)).size !== 307) {
  throw new Error("Enrolled section authority must contain 307 unique sections.");
}
const packet = {
  version: 1,
  mode: "enrolled-section-authority",
  source: {
    comparisonSha256: APPROVED_COMPARISON_SHA256,
    enrolledSourceSha256: sourceSha256,
  },
  writes: { discourse: 0, astroContent: 0 },
  summary: { total: entries.length },
  entries,
};
await fs.writeFile(
  path.resolve(outputPath),
  `${JSON.stringify(packet, null, 2)}\n`,
  { encoding: "utf8", flag: "wx" },
);
process.stdout.write(`Created enrolled authority for ${entries.length} sections: ${path.resolve(outputPath)}\n`);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
