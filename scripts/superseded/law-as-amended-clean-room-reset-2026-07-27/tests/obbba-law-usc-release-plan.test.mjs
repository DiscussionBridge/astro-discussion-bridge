import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  AUTHORITY_MAP_SHA256,
  buildObbbaLawUscReleasePlan,
  validateObbbaLawUscReleasePlan,
} from "../obbba-law-usc-release-plan-lib.mjs";
import { runObbbaLawUscReleasePlan } from "../build-obbba-law-usc-release-plan.mjs";

const AUTHORITY = new URL(
  "../../docs/evidence/OBBBA_LAW_OFFICIAL_AUTHORITY_MAP_2026-07-26.json",
  import.meta.url,
);

test("release plan is exactly derived from the reviewed authority map", async () => {
  const authorityMapText = await readFile(AUTHORITY, "utf8");
  const plan = buildObbbaLawUscReleasePlan({ authorityMapText });
  assert.equal(plan.inputs.authorityMapSha256, AUTHORITY_MAP_SHA256);
  assert.equal(plan.summary.titles, 20);
  assert.equal(plan.summary.classifiedSections, 227);
  assert.equal(plan.summary.classificationRows, 635);
  assert.equal(plan.summary.sourceArchives, 40);
  assert.deepEqual(plan.titles.map((entry) => entry.uscTitle), [
    "5", "7", "8", "10", "12", "14", "15", "16", "19", "20",
    "22", "26", "30", "31", "34", "42", "43", "47", "49", "51",
  ]);
  const title7 = plan.titles.find((entry) => entry.uscTitle === "7");
  assert.equal(
    title7.current.archiveUrl,
    "https://uscode.house.gov/download/releasepoints/us/pl/119/102/"
      + "xml_usc07@119-102.zip",
  );
  assert.equal(
    title7.prior.archiveUrl,
    "https://uscode.house.gov/download/releasepoints/us/pl/118/250not159/"
      + "xml_usc07@118-250not159.zip",
  );
  assert.doesNotMatch(
    JSON.stringify(plan),
    /forum.*(?:raw|cooked|body)|currentLawText|priorLawText/i,
  );
  assert.equal(validateObbbaLawUscReleasePlan(plan, { authorityMapText }), plan);
});

test("release plan fails closed on byte and output drift", async () => {
  const authorityMapText = await readFile(AUTHORITY, "utf8");
  assert.throws(
    () => buildObbbaLawUscReleasePlan({ authorityMapText: `${authorityMapText} ` }),
    /byte commitment/,
  );
  const plan = buildObbbaLawUscReleasePlan({ authorityMapText });
  const drifted = structuredClone(plan);
  drifted.titles[0].current.archiveUrl = "https://example.invalid/title.zip";
  assert.throws(
    () => validateObbbaLawUscReleasePlan(drifted, { authorityMapText }),
    /does not match/,
  );
});

test("runner is create-only and preserves an existing output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "obbba-usc-plan-"));
  const outputPath = join(directory, "plan.json");
  try {
    await writeFile(outputPath, "competing", "utf8");
    await assert.rejects(
      runObbbaLawUscReleasePlan({
        authorityMapPath: AUTHORITY,
        outputPath,
      }),
      /already exists/,
    );
    assert.equal(await readFile(outputPath, "utf8"), "competing");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
