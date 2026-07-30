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
  runObbbaLawUscComparisonIndexWithCommitments,
} from "../build-obbba-law-usc-comparison-index.mjs";

test("runner deterministically generates the full text-free 332-target index", async () => {
  const first = await makeFixture("comparison-success-a-");
  const second = await makeFixture("comparison-success-b-");
  try {
    const one = await run(first);
    const two = await run(second);
    assert.equal(one.entries.length, 332);
    for (const counts of Object.values(one.summary.windows)) {
      assert.equal(
        Object.values(counts).reduce((sum, count) => sum + count, 0),
        332,
      );
    }
    assert.equal(
      await readFile(first.outputPath, "utf8"),
      await readFile(second.outputPath, "utf8"),
    );
    const serialized = await readFile(first.outputPath, "utf8");
    for (const forbidden of [
      "<section",
      "relativePath",
      "sourceIdentifier",
      "\"fragment\"",
      "\"raw\"",
      "\"xml\"",
      "Operative rule",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
    assert.deepEqual(JSON.parse(serialized), one);
    assert.deepEqual(one, two);
  } finally {
    await cleanup(first, second);
  }
});

test("runner preserves an existing output before evidence or fragment reads", async () => {
  const fixture = await makeFixture("comparison-preflight-");
  try {
    await writeFile(fixture.outputPath, "competitor", { flag: "wx" });
    await rm(fixture.evidencePath);
    await assert.rejects(() => run(fixture), /already exists/);
    assert.equal(await readFile(fixture.outputPath, "utf8"), "competitor");
  } finally {
    await cleanup(fixture);
  }
});

test("runner rejects evidence drift and malformed full-cardinality schemas", async () => {
  const mutations = [
    ["duplicate identity", (store) => {
      store.entries[1].uscSection = store.entries[0].uscSection;
    }, /duplicated/],
    ["wrong role set", (store) => {
      delete store.entries[0].versions.current;
    }, /versions are invalid/],
    ["state-count drift", (store) => {
      store.entries[44].versions.prior = {
        state: "absent",
        sourceDocumentSha256: "c".repeat(64),
      };
    }, /state counts/],
    ["absence extra field", (store) => {
      store.entries[0].versions.prior.extra = true;
    }, /absent state is invalid/],
    ["present identity mismatch", (store) => {
      store.entries[44].versions.current.sourceIdentifier = "/us/usc/t26/s999";
    }, /present state is invalid/],
  ];
  for (const [label, mutate, pattern] of mutations) {
    const fixture = await makeFixture(`comparison-tamper-${label}-`);
    try {
      const store = JSON.parse(await readFile(fixture.evidencePath, "utf8"));
      mutate(store);
      await writeEvidence(fixture, store);
      await assert.rejects(() => run(fixture), pattern);
      await assert.rejects(() => readFile(fixture.outputPath), { code: "ENOENT" });
    } finally {
      await cleanup(fixture);
    }
  }
  const mismatch = await makeFixture("comparison-sha-mismatch-");
  try {
    mismatch.expectedStoreEvidenceSha256 = "0".repeat(64);
    await assert.rejects(() => run(mismatch), /bytes do not match/);
    await assert.rejects(() => readFile(mismatch.outputPath), { code: "ENOENT" });
  } finally {
    await cleanup(mismatch);
  }
});

test("runner rejects fragment drift and cross-store paths without output", async () => {
  const drift = await makeFixture("comparison-fragment-drift-");
  try {
    const firstPath = join(
      drift.storeDirectory,
      "sections",
      drift.store.entries[44].versions.prior.relativePath,
    );
    await writeFile(firstPath, "<section><content>drift</content></section>");
    await assert.rejects(() => run(drift), /fragment drift/);
    await assert.rejects(() => readFile(drift.outputPath), { code: "ENOENT" });
  } finally {
    await cleanup(drift);
  }
  const traversal = await makeFixture("comparison-path-traversal-");
  try {
    const store = JSON.parse(await readFile(traversal.evidencePath, "utf8"));
    store.entries[44].versions.prior.relativePath = "../outside.xml";
    await writeEvidence(traversal, store);
    await assert.rejects(() => run(traversal), /path drift/);
    await assert.rejects(
      () => readFile(traversal.outputPath),
      { code: "ENOENT" },
    );
  } finally {
    await cleanup(traversal);
  }
});

test("runner final wx collision preserves the competing output", async () => {
  const fixture = await makeFixture("comparison-output-race-");
  try {
    await assert.rejects(
      () => run(fixture, {
        beforeCommit: async () => {
          await writeFile(fixture.outputPath, "competitor", { flag: "wx" });
        },
      }),
      { code: "EEXIST" },
    );
    assert.equal(await readFile(fixture.outputPath, "utf8"), "competitor");
  } finally {
    await cleanup(fixture);
  }
});

test("production wrapper exposes only progress and cannot forward commit hooks", async () => {
  const source = await readFile(
    new URL("../build-obbba-law-usc-comparison-index.mjs", import.meta.url),
    "utf8",
  );
  const wrapper = source.slice(
    source.indexOf("export async function buildObbbaLawUscComparisonIndex"),
    source.indexOf(
      "export async function runObbbaLawUscComparisonIndexWithCommitments",
    ),
  );
  assert.match(wrapper, /\(\{ onProgress \} = \{\}\)/);
  assert.equal(wrapper.includes("...options"), false);
  assert.equal(wrapper.includes("beforeCommit"), false);
});

async function makeFixture(prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const storeBasename = "synthetic-section-store";
  const storeDirectory = join(root, storeBasename);
  const sectionsDirectory = join(storeDirectory, "sections");
  const evidencePath = join(root, "store-evidence.json");
  const outputPath = join(root, "comparison.json");
  await mkdir(sectionsDirectory, { recursive: true });
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
      const directory = join(sectionsDirectory, role);
      await mkdir(directory, { recursive: true });
      const fragment =
        `<section identifier="/us/usc/t26/s${uscSection}">`
        + `<num>§ ${uscSection}.</num><content>Rule ${role} ${uscSection}.</content>`
        + "</section>";
      const bytes = Buffer.from(fragment);
      await writeFile(join(sectionsDirectory, relativePath), bytes, { flag: "wx" });
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
      obbbaSections: [String(10000 + index)],
      classificationRows: 1,
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
    evidencePath,
    outputPath,
    store,
  };
  await writeEvidence(fixture, store);
  return fixture;
}

async function writeEvidence(fixture, store) {
  const bytes = Buffer.from(`${JSON.stringify(store, null, 2)}\n`);
  await writeFile(fixture.evidencePath, bytes);
  fixture.expectedStoreEvidenceSha256 = sha256(bytes);
}

function run(fixture, extra = {}) {
  return runObbbaLawUscComparisonIndexWithCommitments({
    storeEvidencePath: fixture.evidencePath,
    sectionStoreDirectory: fixture.storeDirectory,
    outputPath: fixture.outputPath,
    expectedStoreEvidenceSha256: fixture.expectedStoreEvidenceSha256,
    expectedStoreBasename: fixture.storeBasename,
    ...extra,
  });
}

async function cleanup(...fixtures) {
  await Promise.all(fixtures.map((fixture) =>
    rm(fixture.root, { recursive: true, force: true })));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
