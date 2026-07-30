import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildLawAsAmendedPagePlan,
} from "../obbba-law-as-amended-page-plan-lib.mjs";
import {
  runObbbaLawAsAmendedPagePlanWithCommitments,
} from "../build-obbba-law-as-amended-page-plan.mjs";

test("builds a strict text-free production-cardinality page plan", () => {
  const fixture = makeFixture();
  const plan = build(fixture);
  assert.equal(plan.entries.length, 309);
  assert.deepEqual(plan.summary.outcomes, {
    "official-law-page-candidate": 227,
    "enacted-law-only": 82,
  });
  assert.equal(plan.summary.officialTargets, 332);
  assert.equal(new Set(plan.entries.map(({ topicId }) => topicId)).size, 309);
  assert.equal(new Set(plan.entries.map(({ outputPath }) =>
    outputPath.toLowerCase())).size, 309);
  assert.doesNotMatch(JSON.stringify(plan), /CONTENT_CANARY|"(?:raw|cooked|html|xml|legalText|noteText)":/);
});

test("explicit matched evidence takes precedence over prec context", () => {
  const fixture = makeFixture();
  const target = fixture.attributionIndex.entries[0];
  for (const row of target.classifications) row.description = "prec";
  for (const entry of fixture.authorityMap.entries) {
    for (const row of entry.classifications) {
      if (row.uscTitle === target.uscTitle
        && row.uscSection === target.uscSection) row.description = "prec";
    }
  }
  assert.equal(build(fixture).entries[0].outcome,
    "official-law-page-candidate");
});

test("couples explicit context and review outcomes and counts all warnings", () => {
  const fixture = makeFixture();
  makeNonExplicit(fixture, "10201", "prec", "classification-context-only");
  makeNonExplicit(fixture, "10202", "new", "review-required");
  const reviewTarget = targetForSection(fixture, "10202");
  reviewTarget.comparisons.laterEvolution = "changed";
  const plan = build(fixture);
  assert.equal(plan.entries.find(({ sectionId }) => sectionId === "10201").outcome,
    "classification-context-page-candidate");
  assert.equal(plan.entries.find(({ sectionId }) => sectionId === "10202").outcome,
    "review-required");
  assert.equal(plan.summary.laterEvolutionWarnings, 1);
});

test("rejects unknown nested content, binding drift, and unsafe paths", () => {
  for (const mutate of [
    (f) => { f.attributionIndex.entries[0].editorialEvidence.after.raw = "CONTENT_CANARY"; },
    (f) => { f.attributionIndex.entries[0].matchedObbbaSections = []; },
    (f) => {
      const target = f.attributionIndex.entries[0];
      target.editorialEvidence.after.noteLinks =
        ["/us/pl/119/21/s99999"];
    },
    (f) => { f.forumMetadata.entries[0].sourceUrl = "https://evil.example/t/1"; },
    (f) => { f.forumMetadata.entries[0].normalizedTags.push("title-ii"); },
    (f) => {
      f.forumMetadata.entries[1].title = f.forumMetadata.entries[0].title;
      f.authorityMap.entries[1].title = f.authorityMap.entries[0].title;
    },
  ]) {
    const fixture = makeFixture();
    mutate(fixture);
    assert.throws(() => build(fixture));
  }
});

test("runner is pinned, deterministic, preflight-first, and create-only", async () => {
  const fixture = makeFixture();
  const root = await mkdtemp(join(tmpdir(), "law-page-plan-"));
  const paths = {
    forumPath: join(root, "forum.json"),
    authorityPath: join(root, "authority.json"),
    attributionPath: join(root, "attribution.json"),
  };
  const options = {};
  for (const [name, value] of [
    ["forum", fixture.forumMetadata],
    ["authority", fixture.authorityMap],
    ["attribution", fixture.attributionIndex],
  ]) {
    const bytes = `${JSON.stringify(value)}\n`;
    const pathKey = `${name}Path`;
    const hashKey = `${name}Sha256`;
    await writeFile(paths[pathKey], bytes);
    options[pathKey] = paths[pathKey];
    options[hashKey] = sha256(bytes);
  }
  const first = join(root, "first.json");
  const second = join(root, "second.json");
  await runObbbaLawAsAmendedPagePlanWithCommitments({
    ...options, outputPath: first,
  });
  await runObbbaLawAsAmendedPagePlanWithCommitments({
    ...options, outputPath: second,
  });
  assert.deepEqual(await readFile(first), await readFile(second));

  for (const hashKey of [
    "forumSha256", "authoritySha256", "attributionSha256",
  ]) {
    const outputPath = join(root, `${hashKey}.json`);
    await assert.rejects(
      runObbbaLawAsAmendedPagePlanWithCommitments({
        ...options, [hashKey]: "0".repeat(64), outputPath,
      }),
      /bytes do not match review/,
    );
    await assert.rejects(readFile(outputPath), { code: "ENOENT" });
  }

  const competitor = join(root, "competitor.json");
  await writeFile(competitor, "mine");
  await assert.rejects(
    runObbbaLawAsAmendedPagePlanWithCommitments({
      forumPath: join(root, "missing"),
      forumSha256: "0".repeat(64),
      authorityPath: join(root, "missing"),
      authoritySha256: "0".repeat(64),
      attributionPath: join(root, "missing"),
      attributionSha256: "0".repeat(64),
      outputPath: competitor,
    }),
    /already exists/,
  );
  assert.equal(await readFile(competitor, "utf8"), "mine");

  const raced = join(root, "raced.json");
  await assert.rejects(
    runObbbaLawAsAmendedPagePlanWithCommitments({
      ...options,
      outputPath: raced,
      beforeCommit: async () => writeFile(raced, "competitor"),
    }),
  );
  assert.equal(await readFile(raced, "utf8"), "competitor");
});

test("production wrapper exposes no override or commit hook", async () => {
  const source = await readFile(new URL(
    "../build-obbba-law-as-amended-page-plan.mjs", import.meta.url,
  ), "utf8");
  const wrapper = source.slice(
    source.indexOf("export async function buildObbbaLawAsAmendedPagePlan"),
    source.indexOf("export async function runObbbaLawAsAmendedPagePlanWithCommitments"),
  );
  assert.match(wrapper,
    /buildObbbaLawAsAmendedPagePlan\(\)/);
  assert.doesNotMatch(wrapper, /\.\.\.|beforeCommit|options/);
  for (const commitment of [
    "434761fa42bbd67e2b9b6b8e1523d87fb85b238a5e376c0d6c5ab004e0a16f67",
    "977639eacd190746b9bf347fb933bf7434cbf80891d1b7255007c9daf2edcf26",
    "ea33c90c3c860385d016a58e10cdc92f5eb97e4620a3e406fa8696074fbc3ec7",
    "OBBBA_LAW_AS_AMENDED_PAGE_INPUT_PLAN_2026-07-26.json",
  ]) assert.match(source, new RegExp(commitment.replaceAll(".", "\\.")));
});

function build(fixture) {
  return buildLawAsAmendedPagePlan({
    ...fixture,
    inputHashes: {
      forumMetadataSha256: "1".repeat(64),
      authorityMapSha256: "2".repeat(64),
      attributionIndexSha256: "3".repeat(64),
    },
  });
}

function makeFixture() {
  const forumEntries = [];
  const authorityEntries = [];
  const targets = new Map();
  for (let index = 0; index < 309; index += 1) {
    const sectionId = String(10001 + index);
    const topicId = index + 1;
    const title = `Sec. ${sectionId}. Synthetic ${index} | Law as Amended`;
    const normalizedTags = ["law-as-amended", "title-i"];
    const sourceUrl = `https://forum.repealobbba.org/t/${topicId}`;
    forumEntries.push({ sectionId, topicId, title, sourceUrl, normalizedTags });
    const classifications = [];
    if (index < 227) {
      addRow(classifications, targets, sectionId, index + 1, 0);
      if (index < 105) addRow(classifications, targets, sectionId, index + 1001, 0);
    }
    authorityEntries.push({
      sectionId, topicId, title, discussionUrl: sourceUrl, normalizedTags,
      classificationStatus: classifications.length
        ? "classified-to-us-code"
        : "no-us-code-classification-record",
      classifications,
      enactedAuthority: {
        law: "Public Law 119-21",
        section: sectionId,
        sourceUrl: "https://www.govinfo.gov/app/details/PLAW-119publ21",
      },
    });
  }
  let extra = 0;
  while (countRows(authorityEntries) < 635) {
    const entry = authorityEntries[extra % 227];
    const row = entry.classifications[0];
    addRow(entry.classifications, targets, entry.sectionId,
      Number(row.uscSection), extra + 1);
    extra += 1;
  }
  const attributionEntries = [...targets.values()].map((target) => {
    const sections = [...target.obbbaSections].sort();
    const link = `/us/pl/119/21/s${sections[0]}`;
    const editorial = {
      profile: "uslm-pl119-21-editorial-links-v2",
      statusHeadingLinks: [],
      sourceCreditLinks: [],
      noteLinks: [link],
      referencedObbbaSections: [sections[0]],
    };
    return {
      uscTitle: target.uscTitle,
      uscSection: target.uscSection,
      obbbaSections: sections,
      classifications: target.classifications.sort((a, b) =>
        a.publicLawSection.localeCompare(b.publicLawSection)),
      comparisons: {
        incorporationWindow: "unchanged",
        broadHistorical: "unchanged",
        laterEvolution: "unchanged",
      },
      editorialEvidence: { after: editorial, current: structuredClone(editorial) },
      referencedObbbaSections: [sections[0]],
      matchedObbbaSections: [sections[0]],
      evidenceState: "explicit-editorial-evidence",
    };
  });
  return {
    forumMetadata: {
      version: 1, mode: "law-as-amended-forum-metadata-only",
      authorityBoundary: {}, inputs: {},
      summary: { total: 309, placeholderTagged: 0 }, entries: forumEntries,
    },
    authorityMap: {
      version: 1, mode: "obbba-law-official-authority-map",
      sources: {}, inputs: {},
      summary: {
        total: 309, classifiedToUsCode: 227,
        noUsCodeClassificationRecord: 82, classificationRows: 635,
      },
      entries: authorityEntries,
    },
    attributionIndex: {
      version: 2, mode: "obbba-law-usc-attribution-evidence-index",
      authorityBoundary: "", inputs: {
        authoritySha256: "a".repeat(64),
        sectionStoreEvidenceSha256: "b".repeat(64),
        comparisonSha256: "c".repeat(64),
      },
      summary: {
        targets: 332, evidenceStates: { "explicit-editorial-evidence": 332 },
      },
      entries: attributionEntries,
    },
  };
}

function targetForSection(fixture, sectionId) {
  return fixture.attributionIndex.entries.find((entry) =>
    entry.obbbaSections.length === 1 && entry.obbbaSections[0] === sectionId);
}

function makeNonExplicit(fixture, sectionId, description, evidenceState) {
  const target = targetForSection(fixture, sectionId);
  assert.ok(target);
  for (const role of ["after", "current"]) {
    target.editorialEvidence[role].statusHeadingLinks = [];
    target.editorialEvidence[role].sourceCreditLinks = [];
    target.editorialEvidence[role].noteLinks = [];
    target.editorialEvidence[role].referencedObbbaSections = [];
  }
  target.referencedObbbaSections = [];
  target.matchedObbbaSections = [];
  target.evidenceState = evidenceState;
  fixture.attributionIndex.summary.evidenceStates[
    "explicit-editorial-evidence"
  ] -= 1;
  fixture.attributionIndex.summary.evidenceStates[evidenceState] =
    (fixture.attributionIndex.summary.evidenceStates[evidenceState] ?? 0) + 1;
  for (const row of target.classifications) row.description = description;
  for (const entry of fixture.authorityMap.entries) {
    for (const row of entry.classifications) {
      if (row.uscTitle === target.uscTitle
        && row.uscSection === target.uscSection) row.description = description;
    }
  }
}

function addRow(rows, targets, sectionId, uscSection, suffix) {
  const row = {
    uscTitle: "1",
    uscSection: String(uscSection),
    description: "new",
    publicLaw: "119-21",
    publicLawSection: `${sectionId}(${suffix})`,
    statutePages: "1",
  };
  rows.push(row);
  const identity = `${row.uscTitle}:${row.uscSection}`;
  const target = targets.get(identity) ?? {
    uscTitle: row.uscTitle, uscSection: row.uscSection,
    obbbaSections: new Set(), classifications: [],
  };
  target.obbbaSections.add(sectionId);
  target.classifications.push({
    obbbaSection: sectionId,
    description: row.description,
    publicLawSection: row.publicLawSection,
  });
  targets.set(identity, target);
}

function countRows(entries) {
  return entries.reduce((sum, entry) => sum + entry.classifications.length, 0);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
