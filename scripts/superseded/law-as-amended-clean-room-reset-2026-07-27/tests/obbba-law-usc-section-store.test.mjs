import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildObbbaLawUscSectionStoreWithCommitments,
} from "../build-obbba-law-usc-section-store.mjs";

test("section-store runner commits 332 targets with 1,240 real fragments and 88 absences", async () => {
  const layout = await makeLayout("obbba-section-store-success-");
  try {
    const evidence = await runFixture(layout);
    assert.deepEqual(evidence.summary, {
      targets: 332,
      versionsPerTarget: 4,
      presentFragments: 1240,
      absentStates: 88,
      presentAllFour: 288,
      addedInIncorporationWindow: 44,
      titles: 20,
    });
    assert.equal(evidence.entries.length, 332);
    for (const role of ["prior", "before"]) {
      assert.equal(
        (await readdir(join(layout.storeDirectory, "sections", role))).length,
        288,
      );
    }
    for (const role of ["after", "current"]) {
      assert.equal(
        (await readdir(join(layout.storeDirectory, "sections", role))).length,
        332,
      );
    }
    assert.deepEqual(
      JSON.parse(await readFile(layout.storeEvidencePath, "utf8")),
      evidence,
    );
  } finally {
    await rm(layout.root, { recursive: true, force: true });
  }
});

test("section-store preflight occurs before missing authority input read", async () => {
  const layout = await makeLayout("obbba-section-store-preflight-");
  try {
    await mkdir(layout.storeDirectory);
    await writeFile(join(layout.storeDirectory, "competitor.txt"), "keep");
    await unlink(layout.authorityPath);
    await assert.rejects(runFixture(layout), /section store already exists/);
    assert.equal(
      await readFile(join(layout.storeDirectory, "competitor.txt"), "utf8"),
      "keep",
    );
  } finally {
    await rm(layout.root, { recursive: true, force: true });
  }
});

test("section-store source drift rolls back all staged fragments", async () => {
  const layout = await makeLayout("obbba-section-store-drift-");
  try {
    await writeFile(
      join(layout.currentPriorDirectory, "documents", "current-usc01.xml"),
      "drift",
    );
    await assert.rejects(runFixture(layout), /source drift/);
    await assert.rejects(readdir(layout.storeDirectory), /ENOENT/);
    await assert.rejects(readFile(layout.storeEvidencePath), /ENOENT/);
  } finally {
    await rm(layout.root, { recursive: true, force: true });
  }
});

test("section-store preserves late target and evidence competitors", async () => {
  for (const race of ["target", "evidence"]) {
    const layout = await makeLayout(`obbba-section-store-${race}-race-`);
    try {
      await assert.rejects(
        runFixture(layout, async ({ phase }) => {
          if (race === "target" && phase === "before-target-commit") {
            await mkdir(layout.storeDirectory);
            await writeFile(
              join(layout.storeDirectory, "competitor.txt"),
              "keep",
            );
          }
          if (race === "evidence" && phase === "before-evidence-commit") {
            await writeFile(layout.storeEvidencePath, "keep", { flag: "wx" });
          }
        }),
        /EEXIST/,
      );
      if (race === "target") {
        assert.equal(
          await readFile(join(layout.storeDirectory, "competitor.txt"), "utf8"),
          "keep",
        );
      } else {
        assert.equal(await readFile(layout.storeEvidencePath, "utf8"), "keep");
        await assert.rejects(readdir(layout.storeDirectory), /ENOENT/);
      }
    } finally {
      await rm(layout.root, { recursive: true, force: true });
    }
  }
});

async function makeLayout(prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const evidenceDirectory = join(root, "docs", "evidence");
  const cache = join(root, ".discussionbridge-cache");
  const currentPriorBasename = "test-current-prior-xml";
  const incorporationBasename = "test-incorporation-xml";
  const storeBasename = "test-section-store";
  const currentPriorDirectory = join(cache, currentPriorBasename);
  const incorporationDirectory = join(cache, incorporationBasename);
  await mkdir(evidenceDirectory, { recursive: true });
  await mkdir(join(currentPriorDirectory, "documents"), { recursive: true });
  await mkdir(join(incorporationDirectory, "documents"), { recursive: true });

  const targets = [];
  for (let title = 1; title <= 20; title += 1) {
    const count = title <= 12 ? 17 : 16;
    for (let section = 1; section <= count; section += 1) {
      targets.push({
        uscTitle: String(title),
        uscSection: String(title * 1000 + section),
        added: targets.length < 44,
      });
    }
  }
  assert.equal(targets.length, 332);

  const authorityEntries = Array.from({ length: 309 }, (_, index) => ({
    sectionId: String(10_000 + index),
    classifications: [],
  }));
  for (let row = 0; row < 635; row += 1) {
    const target = targets[row % targets.length];
    authorityEntries[row % authorityEntries.length].classifications.push({
      uscTitle: target.uscTitle,
      uscSection: target.uscSection,
    });
  }
  const authorityText = `${JSON.stringify({
    version: 1,
    mode: "obbba-law-official-authority-map",
    summary: { classificationRows: 635 },
    entries: authorityEntries,
  }, null, 2)}\n`;
  const authorityPath = join(evidenceDirectory, "authority.json");
  await writeFile(authorityPath, authorityText);

  const currentPrior = await writeDocuments({
    directory: currentPriorDirectory,
    roles: ["current", "prior"],
    targets,
  });
  const incorporation = await writeDocuments({
    directory: incorporationDirectory,
    roles: ["before", "after"],
    targets,
  });
  const currentPriorText = `${JSON.stringify(currentPrior, null, 2)}\n`;
  const incorporationText = `${JSON.stringify(incorporation, null, 2)}\n`;
  const currentPriorEvidencePath = join(evidenceDirectory, "current-prior.json");
  const incorporationEvidencePath = join(evidenceDirectory, "incorporation.json");
  await writeFile(currentPriorEvidencePath, currentPriorText);
  await writeFile(incorporationEvidencePath, incorporationText);

  return {
    root,
    authorityPath,
    authoritySha256: sha256(authorityText),
    currentPriorEvidencePath,
    currentPriorEvidenceSha256: sha256(currentPriorText),
    currentPriorDirectory,
    currentPriorBasename,
    incorporationEvidencePath,
    incorporationEvidenceSha256: sha256(incorporationText),
    incorporationDirectory,
    incorporationBasename,
    storeDirectory: join(cache, storeBasename),
    storeBasename,
    storeEvidencePath: join(evidenceDirectory, "section-store.json"),
  };
}

async function writeDocuments({ directory, roles, targets }) {
  const documents = [];
  for (let title = 1; title <= 20; title += 1) {
    const uscTitle = String(title);
    const titleTargets = targets.filter((target) => target.uscTitle === uscTitle);
    for (const releaseRole of roles) {
      const xml = `<?xml version="1.0"?><uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0"><main><title identifier="/us/usc/t${uscTitle}">${
        titleTargets.filter((target) =>
          !(target.added && ["prior", "before"].includes(releaseRole))
        ).map(({ uscSection }) =>
          `<section identifier="/us/usc/t${uscTitle}/s${uscSection}"><num value="${uscSection}">§ ${uscSection}.</num><heading>${releaseRole} ${uscSection}</heading></section>`
        ).join("")
      }</title></main></uscDoc>`;
      const fileName = `${releaseRole}-usc${uscTitle.padStart(2, "0")}.xml`;
      await writeFile(join(directory, "documents", fileName), xml);
      documents.push({
        releaseRole,
        uscTitle,
        fileName,
        relativePath: `documents/${fileName}`,
        bytes: Buffer.byteLength(xml),
        sha256: sha256(xml),
      });
    }
  }
  return {
    version: 1,
    mode: "obbba-law-usc-xml-evidence",
    summary: { documents: 40, titles: 20 },
    documents,
  };
}

function runFixture(layout, onProgress) {
  return buildObbbaLawUscSectionStoreWithCommitments({
    authorityMapPath: layout.authorityPath,
    currentPriorEvidencePath: layout.currentPriorEvidencePath,
    currentPriorXmlDirectory: layout.currentPriorDirectory,
    incorporationEvidencePath: layout.incorporationEvidencePath,
    incorporationXmlDirectory: layout.incorporationDirectory,
    sectionStoreDirectory: layout.storeDirectory,
    sectionEvidencePath: layout.storeEvidencePath,
    onProgress,
    expectedAuthoritySha256: layout.authoritySha256,
    expectedCurrentPriorEvidenceSha256:
      layout.currentPriorEvidenceSha256,
    expectedIncorporationEvidenceSha256:
      layout.incorporationEvidenceSha256,
    expectedCurrentPriorBasename: layout.currentPriorBasename,
    expectedIncorporationBasename: layout.incorporationBasename,
    expectedStoreBasename: layout.storeBasename,
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
