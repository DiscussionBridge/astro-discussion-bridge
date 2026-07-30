import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildObbbaLawIncorporationWindowPlan,
  validateObbbaLawIncorporationWindowPlan,
} from "../obbba-law-incorporation-window-plan-lib.mjs";

const AUTHORITY = new URL(
  "../../docs/evidence/OBBBA_LAW_OFFICIAL_AUTHORITY_MAP_2026-07-26.json",
  import.meta.url,
);

test("incorporation plan derives the exact reviewed target set", async () => {
  const authorityMapText = await readFile(AUTHORITY, "utf8");
  const plan = buildObbbaLawIncorporationWindowPlan({ authorityMapText });
  assert.deepEqual(plan.summary, {
    titles: 20,
    uniqueUscTargets: 332,
    sourceArchives: 40,
  });
  assert.match(plan.attributionRule, /state evidence only/);
  assert.equal(plan.releases.before.releasePoint, "119-27not21");
  assert.equal(plan.releases.after.releasePoint, "119-31");
  assert.match(plan.releases.after.limitation, /intervening public laws/);
  const title7 = plan.titles.find((entry) => entry.uscTitle === "7");
  assert.equal(
    title7.before.archiveUrl,
    "https://uscode.house.gov/download/releasepoints/us/pl/119/27not21/"
      + "xml_usc07@119-27not21.zip",
  );
  assert.equal(
    title7.after.archiveUrl,
    "https://uscode.house.gov/download/releasepoints/us/pl/119/31/"
      + "xml_usc07@119-31.zip",
  );
  assert.equal(
    validateObbbaLawIncorporationWindowPlan(plan, { authorityMapText }),
    plan,
  );
});

test("incorporation plan fails closed on input and output drift", async () => {
  const authorityMapText = await readFile(AUTHORITY, "utf8");
  assert.throws(
    () => buildObbbaLawIncorporationWindowPlan({
      authorityMapText: `${authorityMapText} `,
    }),
    /byte commitment/,
  );
  const plan = buildObbbaLawIncorporationWindowPlan({ authorityMapText });
  const drifted = structuredClone(plan);
  drifted.releases.after.limitation = "";
  assert.throws(
    () => validateObbbaLawIncorporationWindowPlan(drifted, { authorityMapText }),
    /does not match/,
  );
});
