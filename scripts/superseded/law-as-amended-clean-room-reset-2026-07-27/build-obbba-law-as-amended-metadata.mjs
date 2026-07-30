import { readFile, writeFile } from "node:fs/promises";

import { buildLawAsAmendedForumMetadata } from "./obbba-law-as-amended-metadata-lib.mjs";

const NAVIGATION = "C:/CodeProjects/Projects/OBBBA/sites/onebigbeautifulbill.us/astro/discussionbridge-navigation.law-as-amended.v2.next.json";
const DIAGNOSTIC = "docs/evidence/OBBBA_LAW_AS_AMENDED_PLAN_2026-07-26.json";
const OUTPUT = "docs/evidence/OBBBA_LAW_AS_AMENDED_FORUM_METADATA_2026-07-26.json";
const NAVIGATION_SHA256 = "d6b8e28bae607b2b549313b9f46e36fc0fe66e55966fbf3763679d8382edb89d";
const DIAGNOSTIC_SHA256 = "cb94611cae58068235e580c05555b303080ed73f30873a1798817d661ae73aed";

const [navigationText, diagnosticReportText] = await Promise.all([
  readFile(NAVIGATION, "utf8"),
  readFile(DIAGNOSTIC, "utf8"),
]);
const manifest = buildLawAsAmendedForumMetadata({
  navigationText,
  diagnosticReportText,
  expectedNavigationSha256: NAVIGATION_SHA256,
  expectedDiagnosticReportSha256: DIAGNOSTIC_SHA256,
});
await writeFile(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
});
process.stdout.write(
  `Law as Amended forum metadata only: ${manifest.summary.total} topics; `
  + `${manifest.summary.placeholderTagged} placeholder-tagged.\n`
  + `Written create-only: ${OUTPUT}\n`,
);
