import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLawAsAmendedForumMetadata,
  sha256,
} from "../obbba-law-as-amended-metadata-lib.mjs";

function fixture() {
  const nodes = Array.from({ length: 309 }, (_, index) => {
    const sectionId = String(10_001 + index);
    return {
      kind: "section",
      topicId: index + 1,
      label: `Sec. ${sectionId}. Provision ${sectionId} | Law as Amended`,
      children: [],
    };
  });
  const navigationText = JSON.stringify({
    lenses: [{ key: "law-as-amended", nodes }],
  });
  const diagnosticReportText = JSON.stringify({
    mode: "obbba-law-as-amended-plan",
    summary: { total: 309 },
    entries: nodes.map((node, index) => ({
      sectionId: String(10_001 + index),
      topicId: node.topicId,
      title: node.label,
      sourceUrl: `https://forum.repealobbba.org/t/${node.topicId}`,
      normalizedTags: index === 0 ? ["law-as-amended", "needs-text"] : ["law-as-amended"],
      roles: { currentLaw: { cookedSha256: "a".repeat(64) } },
    })),
  });
  return { navigationText, diagnosticReportText };
}

test("metadata manifest contains only the approved forum authority fields", () => {
  const input = fixture();
  const manifest = buildLawAsAmendedForumMetadata({
    ...input,
    expectedNavigationSha256: sha256(input.navigationText),
    expectedDiagnosticReportSha256: sha256(input.diagnosticReportText),
  });
  assert.equal(manifest.summary.total, 309);
  assert.equal(manifest.summary.placeholderTagged, 1);
  assert.deepEqual(Object.keys(manifest.entries[0]), [
    "sectionId", "topicId", "title", "sourceUrl", "normalizedTags",
  ]);
  assert.doesNotMatch(
    JSON.stringify(manifest),
    /roles|cooked|currentLaw|amendments|priorLaw|officialLinks/,
  );
});

test("metadata manifest fails closed on byte, identity, tag, and set drift", () => {
  const base = fixture();
  const build = (navigationText, diagnosticReportText) =>
    buildLawAsAmendedForumMetadata({
      navigationText,
      diagnosticReportText,
      expectedNavigationSha256: sha256(navigationText),
      expectedDiagnosticReportSha256: sha256(diagnosticReportText),
    });
  assert.throws(() => buildLawAsAmendedForumMetadata({
    ...base,
    expectedNavigationSha256: "0".repeat(64),
    expectedDiagnosticReportSha256: sha256(base.diagnosticReportText),
  }), /byte commitment/);

  for (const mutate of [
    (report) => { report.entries[0].title += " changed"; },
    (report) => { report.entries[0].topicId = report.entries[1].topicId; },
    (report) => { report.entries[0].normalizedTags = ["Needs-Text"]; },
    (report) => { report.entries.pop(); },
  ]) {
    const report = JSON.parse(base.diagnosticReportText);
    mutate(report);
    assert.throws(() => build(base.navigationText, JSON.stringify(report)));
  }

  for (const mutate of [
    (navigation) => {
      navigation.lenses[0].nodes.at(-1).topicId = navigation.lenses[0].nodes[0].topicId;
    },
    (navigation) => {
      navigation.lenses[0].nodes.at(-1).label = navigation.lenses[0].nodes[0].label;
    },
  ]) {
    const navigation = JSON.parse(base.navigationText);
    mutate(navigation);
    assert.throws(() => build(JSON.stringify(navigation), base.diagnosticReportText));
  }
});
