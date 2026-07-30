import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  runObbbaLawUscAttributionIndexWithCommitments,
} from "../build-obbba-law-usc-attribution-index.mjs";
import {
  runObbbaLawUscComparisonIndexWithCommitments,
} from "../build-obbba-law-usc-comparison-index.mjs";

test("attribution runner deterministically builds the complete three-state evidence index", async () => {
  const first = await makeFixture("attribution-success-a-");
  const second = await makeFixture("attribution-success-b-");
  try {
    const one = await run(first);
    const two = await run(second);
    assert.deepEqual(one.summary, {
      targets: 332,
      evidenceStates: {
        "explicit-editorial-evidence": 316,
        "classification-context-only": 16,
      },
    });
    const repealed = one.entries.find((entry) => entry.uscSection === "1000");
    const repealedObbba = repealed.obbbaSections[0];
    assert.equal(repealed.evidenceState, "explicit-editorial-evidence");
    assert.deepEqual(
      repealed.editorialEvidence.after.statusHeadingLinks,
      [`/us/pl/119/21/s${repealedObbba}`],
    );
    assert.deepEqual(repealed.referencedObbbaSections, [repealedObbba]);
    assert.deepEqual(repealed.matchedObbbaSections, [repealedObbba]);
    assert.equal(
      await readFile(first.outputPath, "utf8"),
      await readFile(second.outputPath, "utf8"),
    );
    assert.deepEqual(one, two);
    const serialized = await readFile(first.outputPath, "utf8");
    for (const forbidden of [
      "<section",
      "Rule before",
      "Rule after",
      "relativePath",
      "sourceIdentifier",
      "\"raw\"",
      "\"xml\"",
      "\"fragment\"",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  } finally {
    await cleanup(first, second);
  }
});

test("attribution evidence states fail safely when context-only conditions differ", async () => {
  const fixture = await makeFixture("attribution-states-");
  try {
    const context = fixture.authority.entries
      .flatMap((entry) => entry.classifications
        .map((classification) => ({ entry, classification })))
      .find(({ classification }) => classification.uscSection === "1316");
    context.classification.description = "nt";
    await rewriteAuthority(fixture);
    const result = await run(fixture);
    assert.equal(result.summary.evidenceStates["classification-context-only"], 15);
    assert.equal(result.summary.evidenceStates["review-required"], 1);
  } finally {
    await cleanup(fixture);
  }
});

test("attribution runner preflights existing output and preserves final wx competitor", async () => {
  const preflight = await makeFixture("attribution-preflight-");
  try {
    await writeFile(preflight.outputPath, "competitor", { flag: "wx" });
    await rm(preflight.authorityPath);
    await assert.rejects(() => run(preflight), /already exists/);
    assert.equal(await readFile(preflight.outputPath, "utf8"), "competitor");
  } finally {
    await cleanup(preflight);
  }
  const race = await makeFixture("attribution-race-");
  try {
    await assert.rejects(
      () => run(race, {
        beforeCommit: async () => {
          await writeFile(race.outputPath, "competitor", { flag: "wx" });
        },
      }),
      { code: "EEXIST" },
    );
    assert.equal(await readFile(race.outputPath, "utf8"), "competitor");
  } finally {
    await cleanup(race);
  }
});

test("attribution runner rejects pinned-input, semantic-link, and fragment drift", async () => {
  for (const field of [
    "authoritySha256",
    "storeEvidenceSha256",
    "comparisonSha256",
  ]) {
    const fixture = await makeFixture(`attribution-${field}-`);
    try {
      fixture[field] = "0".repeat(64);
      await assert.rejects(() => run(fixture), /bytes do not match/);
      await assert.rejects(() => readFile(fixture.outputPath), { code: "ENOENT" });
    } finally {
      await cleanup(fixture);
    }
  }
  const semantic = await makeFixture("attribution-semantic-");
  try {
    semantic.comparison.entries[0].versions.after.operativeTextSha256 =
      "f".repeat(64);
    await rewriteComparison(semantic);
    await assert.rejects(
      () => run(semantic),
      /outcomes do not recompute|semantic linkage drift/,
    );
    await assert.rejects(() => readFile(semantic.outputPath), { code: "ENOENT" });
  } finally {
    await cleanup(semantic);
  }
  const fragment = await makeFixture("attribution-fragment-");
  try {
    const entry = fragment.store.entries[0];
    await writeFile(
      join(fragment.storeDirectory, "sections", entry.versions.after.relativePath),
      "<section><content>drift</content></section>",
    );
    await assert.rejects(() => run(fragment), /fragment drift/);
    await assert.rejects(() => readFile(fragment.outputPath), { code: "ENOENT" });
  } finally {
    await cleanup(fragment);
  }
});

test("attribution runner rejects nested authority, store, comparison, and binding drift", async () => {
  const fixture = await makeFixture("attribution-tamper-matrix-");
  const baseAuthority = structuredClone(fixture.authority);
  const baseStore = structuredClone(fixture.store);
  const baseComparison = structuredClone(fixture.comparison);
  try {
    const cases = [
      ["authority vocabulary", async () => {
        fixture.authority.entries[0].classifications[0].description = "mystery";
        await rewriteAuthority(fixture);
      }, /classification record is invalid/],
      ["authority duplicate section", async () => {
        fixture.authority.entries[1].sectionId =
          fixture.authority.entries[0].sectionId;
        await rewriteAuthority(fixture);
      }, /authority identity is invalid/],
      ["authority row count", async () => {
        fixture.authority.summary.classificationRows = 634;
        await rewriteAuthority(fixture);
      }, /authority map is invalid/],
      ["store role set", async () => {
        delete fixture.store.entries[0].versions.current;
        await rewriteStore(fixture);
      }, /versions are invalid/],
      ["store absence extras", async () => {
        fixture.store.entries[0].versions.prior.extra = true;
        await rewriteStore(fixture);
      }, /absent state is invalid/],
      ["store count drift", async () => {
        fixture.store.entries[44].versions.prior = {
          state: "absent",
          sourceDocumentSha256: "c".repeat(64),
        };
        await rewriteStore(fixture);
      }, /state counts/],
      ["comparison input store", async () => {
        fixture.comparison.input.sectionStoreEvidenceSha256 = "0".repeat(64);
        await rewriteComparison(fixture);
      }, /shape\/input is invalid/],
      ["comparison outcome", async () => {
        fixture.comparison.entries[0].comparisons.incorporationWindow =
          "unchanged";
        await rewriteComparison(fixture);
      }, /outcomes do not recompute/],
      ["comparison summary", async () => {
        fixture.comparison.summary.windows.incorporationWindow.added -= 1;
        await rewriteComparison(fixture);
      }, /summary does not recompute/],
      ["OBBBA binding", async () => {
        fixture.comparison.entries[0].obbbaSections = ["99999"];
        await rewriteComparison(fixture);
      }, /OBBBA binding drift/],
    ];
    for (const [label, mutate, pattern] of cases) {
      fixture.authority = structuredClone(baseAuthority);
      fixture.store = structuredClone(baseStore);
      fixture.comparison = structuredClone(baseComparison);
      await rewriteAuthority(fixture);
      await rewriteStore(fixture);
      await rewriteComparison(fixture);
      await mutate();
      await assert.rejects(() => run(fixture), pattern, label);
      await assert.rejects(
        () => readFile(fixture.outputPath),
        { code: "ENOENT" },
        label,
      );
    }
    fixture.authority = structuredClone(baseAuthority);
    fixture.store = structuredClone(baseStore);
    fixture.comparison = structuredClone(baseComparison);
    fixture.store.entries[44].versions.current.relativePath = "../outside.xml";
    await rewriteAuthority(fixture);
    await rewriteStore(fixture);
    fixture.comparison.input.sectionStoreEvidenceSha256 =
      fixture.storeEvidenceSha256;
    await rewriteComparison(fixture);
    await assert.rejects(() => run(fixture), /fragment path drift/);
  } finally {
    await cleanup(fixture);
  }
});

test("attribution production wrapper exposes progress only", async () => {
  const source = await readFile(
    new URL("../build-obbba-law-usc-attribution-index.mjs", import.meta.url),
    "utf8",
  );
  const wrapper = source.slice(
    source.indexOf("export async function buildObbbaLawUscAttributionIndex"),
    source.indexOf(
      "export async function runObbbaLawUscAttributionIndexWithCommitments",
    ),
  );
  assert.match(wrapper, /\(\{ onProgress \} = \{\}\)/);
  assert.equal(wrapper.includes("...options"), false);
  assert.equal(wrapper.includes("beforeCommit"), false);
});

async function makeFixture(prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const storeBasename = "synthetic-attribution-store";
  const storeDirectory = join(root, storeBasename);
  const sectionsRoot = join(storeDirectory, "sections");
  const authorityPath = join(root, "authority.json");
  const storeEvidencePath = join(root, "store.json");
  const comparisonPath = join(root, "comparison.json");
  const outputPath = join(root, "attribution.json");
  await mkdir(sectionsRoot, { recursive: true });
  const authority = buildAuthority();
  const bindings = authorityBindings(authority);
  const entries = [];
  for (let index = 0; index < 332; index += 1) {
    const uscTitle = "26";
    const uscSection = String(1000 + index);
    const versions = {};
    for (const role of ["prior", "before", "after", "current"]) {
      if (index < 44 && (role === "prior" || role === "before")) {
        versions[role] = {
          state: "absent",
          sourceDocumentSha256: "c".repeat(64),
        };
        continue;
      }
      const relativePath = `${role}/usc26-s${uscSection}.xml`;
      await mkdir(join(sectionsRoot, role), { recursive: true });
      const contextOnly = index >= 316;
      const phase = contextOnly
        ? "same"
        : (role === "prior" || role === "before" ? "before" : "after");
      const obbbaSection = bindings.get(`26:${uscSection}`)[0];
      const repealedHeading = index === 0
        && (role === "after" || role === "current");
      const editorial = !contextOnly && !repealedHeading
        && (role === "after" || role === "current")
          ? `<notes><note><ref href="/us/pl/119/21/s${obbbaSection}">`
            + "Public Law</ref></note></notes>"
          : "";
      const sectionStatus = repealedHeading ? ' status="repealed"' : "";
      const heading = repealedHeading
        ? `<heading>Repealed. <ref href="/us/pl/119/21/s${obbbaSection}">`
          + "Public Law</ref></heading>"
        : "";
      const fragment =
        `<section${sectionStatus} identifier="/us/usc/t26/s${uscSection}">`
        + `<num>§ ${uscSection}.</num>${heading}`
        + `<content>Rule ${phase} ${uscSection}.</content>`
        + `${editorial}</section>`;
      const bytes = Buffer.from(fragment);
      await writeFile(join(sectionsRoot, relativePath), bytes, { flag: "wx" });
      versions[role] = {
        state: "present",
        sourceDocumentSha256: "c".repeat(64),
        sourceIdentifier: `/us/usc/t26/s${uscSection}`,
        relativePath,
        bytes: bytes.length,
        sha256: sha256(bytes),
      };
    }
    entries.push({
      uscTitle,
      uscSection,
      obbbaSections: bindings.get(`26:${uscSection}`),
      classificationRows: authority.entries
        .flatMap((entry) => entry.classifications)
        .filter((item) =>
          item.uscTitle === uscTitle && item.uscSection === uscSection).length,
      versions,
    });
  }
  const store = {
    version: 1,
    mode: "obbba-law-usc-versioned-section-store",
    summary: {
      targets: 332,
      presentFragments: 1240,
      absentStates: 88,
    },
    entries,
  };
  const fixture = {
    root,
    storeBasename,
    storeDirectory,
    authorityPath,
    storeEvidencePath,
    comparisonPath,
    outputPath,
    authority,
    store,
  };
  await rewriteAuthority(fixture);
  await rewriteStore(fixture);
  await runObbbaLawUscComparisonIndexWithCommitments({
    storeEvidencePath,
    sectionStoreDirectory: storeDirectory,
    outputPath: comparisonPath,
    expectedStoreEvidenceSha256: fixture.storeEvidenceSha256,
    expectedStoreBasename: storeBasename,
  });
  fixture.comparison = JSON.parse(await readFile(comparisonPath, "utf8"));
  fixture.comparisonSha256 = sha256(await readFile(comparisonPath));
  return fixture;
}

function buildAuthority() {
  const entries = Array.from({ length: 309 }, (_, index) => ({
    sectionId: String(10000 + index),
    classificationStatus: index < 227
      ? "classified-to-us-code"
      : "no-us-code-classification-record",
    classifications: [],
  }));
  let target = 0;
  for (let index = 0; index < 227; index += 1) {
    const count = index < 105 ? 2 : 1;
    for (let offset = 0; offset < count; offset += 1) {
      entries[index].classifications.push(classification(
        target,
        entries[index].sectionId,
        entries[index].classifications.length + 1,
      ));
      target += 1;
    }
  }
  for (let extra = 0; extra < 303; extra += 1) {
    const entry = entries[extra % 227];
    entry.classifications.push(classification(
      extra % 332,
      entry.sectionId,
      entry.classifications.length + 1,
    ));
  }
  return {
    version: 1,
    mode: "obbba-law-official-authority-map",
    summary: {
      total: 309,
      classifiedToUsCode: 227,
      noUsCodeClassificationRecord: 82,
      classificationRows: 635,
    },
    entries,
  };
}

function classification(target, obbbaSection, ordinal) {
  return {
    uscTitle: "26",
    uscSection: String(1000 + target),
    description: target >= 316
      ? (target % 2 ? "prec new" : "prec")
      : (target === 0 ? "" : "nt"),
    publicLaw: "119-21",
    publicLawSection: `${obbbaSection}(${ordinal})`,
    statutePages: "1",
  };
}

function authorityBindings(authority) {
  const result = new Map();
  for (const entry of authority.entries) {
    for (const item of entry.classifications) {
      const identity = `${item.uscTitle}:${item.uscSection}`;
      const values = result.get(identity) ?? [];
      values.push(entry.sectionId);
      result.set(identity, [...new Set(values)].sort(sectionSort));
    }
  }
  return result;
}

async function rewriteAuthority(fixture) {
  const bytes = Buffer.from(`${JSON.stringify(fixture.authority, null, 2)}\n`);
  await writeFile(fixture.authorityPath, bytes);
  fixture.authoritySha256 = sha256(bytes);
}

async function rewriteStore(fixture) {
  const bytes = Buffer.from(`${JSON.stringify(fixture.store, null, 2)}\n`);
  await writeFile(fixture.storeEvidencePath, bytes);
  fixture.storeEvidenceSha256 = sha256(bytes);
}

async function rewriteComparison(fixture) {
  const bytes = Buffer.from(`${JSON.stringify(fixture.comparison, null, 2)}\n`);
  await writeFile(fixture.comparisonPath, bytes);
  fixture.comparisonSha256 = sha256(bytes);
}

function run(fixture, extra = {}) {
  return runObbbaLawUscAttributionIndexWithCommitments({
    authorityPath: fixture.authorityPath,
    authoritySha256: fixture.authoritySha256,
    storeEvidencePath: fixture.storeEvidencePath,
    storeEvidenceSha256: fixture.storeEvidenceSha256,
    comparisonPath: fixture.comparisonPath,
    comparisonSha256: fixture.comparisonSha256,
    storeDirectory: fixture.storeDirectory,
    storeBasename: fixture.storeBasename,
    outputPath: fixture.outputPath,
    ...extra,
  });
}

async function cleanup(...fixtures) {
  await Promise.all(fixtures.map((fixture) =>
    rm(fixture.root, { recursive: true, force: true })));
}

function sectionSort(left, right) {
  return left.localeCompare(right, "en", { numeric: true });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
