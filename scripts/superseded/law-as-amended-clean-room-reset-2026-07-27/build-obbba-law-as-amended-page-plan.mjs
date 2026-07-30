import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildLawAsAmendedPagePlan,
} from "./obbba-law-as-amended-page-plan-lib.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FORUM_SHA =
  "434761fa42bbd67e2b9b6b8e1523d87fb85b238a5e376c0d6c5ab004e0a16f67";
const AUTHORITY_SHA =
  "977639eacd190746b9bf347fb933bf7434cbf80891d1b7255007c9daf2edcf26";
const ATTRIBUTION_SHA =
  "ea33c90c3c860385d016a58e10cdc92f5eb97e4620a3e406fa8696074fbc3ec7";

export async function buildObbbaLawAsAmendedPagePlan() {
  return runObbbaLawAsAmendedPagePlanWithCommitments({
    forumPath: resolve(
      ROOT,
      "docs/evidence/OBBBA_LAW_AS_AMENDED_FORUM_METADATA_2026-07-26.json",
    ),
    forumSha256: FORUM_SHA,
    authorityPath: resolve(
      ROOT,
      "docs/evidence/OBBBA_LAW_OFFICIAL_AUTHORITY_MAP_2026-07-26.json",
    ),
    authoritySha256: AUTHORITY_SHA,
    attributionPath: resolve(
      ROOT,
      "docs/evidence/OBBBA_LAW_USC_ATTRIBUTION_INDEX_V2_2026-07-26.json",
    ),
    attributionSha256: ATTRIBUTION_SHA,
    outputPath: resolve(
      ROOT,
      "docs/evidence/OBBBA_LAW_AS_AMENDED_PAGE_INPUT_PLAN_2026-07-26.json",
    ),
  });
}

export async function runObbbaLawAsAmendedPagePlanWithCommitments(options) {
  await assertAbsent(options.outputPath);
  const [forumMetadata, authorityMap, attributionIndex] = await Promise.all([
    readPinned(options.forumPath, options.forumSha256, "forum"),
    readPinned(options.authorityPath, options.authoritySha256, "authority"),
    readPinned(
      options.attributionPath,
      options.attributionSha256,
      "attribution",
    ),
  ]);
  const plan = buildLawAsAmendedPagePlan({
    forumMetadata,
    authorityMap,
    attributionIndex,
    inputHashes: {
      forumMetadataSha256: options.forumSha256,
      authorityMapSha256: options.authoritySha256,
      attributionIndexSha256: options.attributionSha256,
    },
  });
  await options.beforeCommit?.(plan);
  await writeFile(options.outputPath, `${JSON.stringify(plan, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return plan;
}

async function readPinned(path, expectedSha256, label) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 ?? "")) {
    throw new Error(`Law page plan ${label} commitment is invalid.`);
  }
  const bytes = await readFile(path);
  if (sha256(bytes) !== expectedSha256) {
    throw new Error(`Law page plan ${label} bytes do not match review.`);
  }
  return JSON.parse(bytes.toString("utf8"));
}

async function assertAbsent(path) {
  try {
    await readFile(path);
    throw new Error(`Law page plan output already exists: ${path}.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const plan = await buildObbbaLawAsAmendedPagePlan();
  process.stdout.write(
    `Law as Amended page plan: ${plan.summary.pages} pages.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
