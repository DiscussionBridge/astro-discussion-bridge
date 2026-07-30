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
import { deflateRawSync } from "node:zlib";
import test from "node:test";

import {
  extractObbbaLawUscXmlWithCommitment,
  extractValidatedUscXml,
} from "../obbba-law-usc-xml-extractor.mjs";

test("extractor validates stored and deflated USLM XML", () => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?><uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0"><meta/></uscDoc>';
  for (const method of [0, 8]) {
    const fixture = makeZip("usc07.xml", xml, method);
    const result = extractValidatedUscXml(fixture.bytes, fixture.commitment);
    assert.equal(new TextDecoder().decode(result.xmlBytes), xml);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
  }
});

test("extractor rejects commitment drift, malformed output, and active XML declarations", () => {
  const safe = makeZip(
    "usc07.xml",
    '<uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0"><section/></uscDoc>',
    8,
  );
  assert.throws(
    () => extractValidatedUscXml(safe.bytes, {
      ...safe.commitment,
      xmlCrc32: "deadbeef",
    }),
    /metadata drifted/,
  );
  for (const text of [
    "<notUscDoc/>",
    "<uscDoc/>",
    '<uscDoc xmlns="https://attacker.example/schema"/>',
    '<uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0"><section></uscDoc>',
    '<uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0"/><extra/>',
    '<!DOCTYPE uscDoc SYSTEM "https://evil.example/test"><uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0"/>',
    '<!ENTITY x "bad"><uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0">&x;</uscDoc>',
  ]) {
    const fixture = makeZip("usc07.xml", text, 8);
    assert.throws(
      () => extractValidatedUscXml(fixture.bytes, fixture.commitment),
      /safe USLM/,
      text,
    );
  }
  const invalidUtf8 = makeZipBytes(
    "usc07.xml",
    new Uint8Array([0x3c, 0x75, 0x73, 0x63, 0x44, 0x6f, 0x63, 0x3e, 0xff]),
    0,
  );
  assert.throws(
    () => extractValidatedUscXml(invalidUtf8.bytes, invalidUtf8.commitment),
    /valid UTF-8/,
  );
});

test("extractor detects compressed-stream and CRC corruption", () => {
  const fixture = makeZip(
    "usc07.xml",
    '<uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0">content</uscDoc>',
    8,
  );
  const corrupted = Uint8Array.from(fixture.bytes);
  corrupted[fixture.dataOffset + 2] ^= 0xff;
  assert.throws(
    () => extractValidatedUscXml(corrupted, fixture.commitment),
    /decompression failed|size or CRC/,
  );
});

test("40-document runner commits XML and create-only evidence", async () => {
  const layout = await makeRunnerLayout("obbba-xml-success-");
  try {
    const result = await runFixture(layout);
    assert.equal(result.summary.documents, 40);
    assert.equal(result.summary.titles, 20);
    assert.equal(
      (await readdir(join(layout.xmlDirectory, "documents"))).length,
      40,
    );
    assert.deepEqual(
      JSON.parse(await readFile(layout.xmlEvidencePath, "utf8")),
      result,
    );
  } finally {
    await rm(layout.root, { recursive: true, force: true });
  }
});

test("40-document runner binds incorporation roles to incorporation cache names", async () => {
  const layout = await makeRunnerLayout("obbba-xml-incorporation-", {
    roles: ["before", "after"],
    archiveBasename:
      "obbba-law-usc-incorporation-archives-2026-07-26",
    xmlBasename: "obbba-law-usc-incorporation-xml-2026-07-26",
  });
  try {
    const result = await runFixture(layout);
    assert.deepEqual(
      [...new Set(result.documents.map((entry) => entry.releaseRole))].sort(),
      ["after", "before"],
    );
    await assert.rejects(
      extractObbbaLawUscXmlWithCommitment({
        archiveEvidencePath: layout.archiveEvidencePath,
        archiveDirectory: layout.archiveDirectory,
        xmlDirectory: join(
          layout.root,
          ".discussionbridge-cache",
          "obbba-law-usc-xml-2026-07-26",
        ),
        xmlEvidencePath: join(layout.root, "docs", "evidence", "wrong.json"),
        expectedArchiveEvidenceSha256: layout.archiveEvidenceSha256,
      }),
      /invalid commitment|paths must be distinct children/,
    );
  } finally {
    await rm(layout.root, { recursive: true, force: true });
  }
});

test("runner preflight stops before evidence/archive reads", async () => {
  const layout = await makeRunnerLayout("obbba-xml-preflight-");
  try {
    await mkdir(layout.xmlDirectory);
    await writeFile(join(layout.xmlDirectory, "competitor.txt"), "keep");
    await unlink(layout.archiveEvidencePath);
    await assert.rejects(runFixture(layout), /XML directory already exists/);
    assert.equal(
      await readFile(join(layout.xmlDirectory, "competitor.txt"), "utf8"),
      "keep",
    );
  } finally {
    await rm(layout.root, { recursive: true, force: true });
  }
});

test("runner mid-batch failure leaves XML and evidence absent", async () => {
  const layout = await makeRunnerLayout("obbba-xml-midbatch-");
  try {
    const second = layout.archiveEvidence.archives[1];
    await writeFile(
      join(layout.archiveDirectory, ...second.relativePath.split("/")),
      "corrupt",
    );
    await assert.rejects(runFixture(layout), /hash\/size drift/);
    await assert.rejects(readdir(layout.xmlDirectory), /ENOENT/);
    await assert.rejects(readFile(layout.xmlEvidencePath), /ENOENT/);
  } finally {
    await rm(layout.root, { recursive: true, force: true });
  }
});

test("runner preserves late target and evidence competitors", async () => {
  for (const race of ["target", "evidence"]) {
    const layout = await makeRunnerLayout(`obbba-xml-${race}-race-`);
    try {
      await assert.rejects(
        runFixture(layout, async ({ phase }) => {
          if (race === "target" && phase === "before-target-commit") {
            await mkdir(layout.xmlDirectory);
            await writeFile(join(layout.xmlDirectory, "competitor.txt"), "keep");
          }
          if (race === "evidence" && phase === "before-evidence-commit") {
            await writeFile(layout.xmlEvidencePath, "keep", { flag: "wx" });
          }
        }),
        /EEXIST/,
      );
      if (race === "target") {
        assert.equal(
          await readFile(join(layout.xmlDirectory, "competitor.txt"), "utf8"),
          "keep",
        );
      } else {
        assert.equal(await readFile(layout.xmlEvidencePath, "utf8"), "keep");
        await assert.rejects(readdir(layout.xmlDirectory), /ENOENT/);
      }
    } finally {
      await rm(layout.root, { recursive: true, force: true });
    }
  }
});

async function makeRunnerLayout(prefix, {
  roles = ["current", "prior"],
  archiveBasename = "obbba-law-usc-archives-2026-07-26",
  xmlBasename = "obbba-law-usc-xml-2026-07-26",
} = {}) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const evidenceDirectory = join(root, "docs", "evidence");
  const cacheRoot = join(root, ".discussionbridge-cache");
  const archiveDirectory = join(
    cacheRoot,
    archiveBasename,
  );
  const archiveFiles = join(archiveDirectory, "archives");
  await mkdir(evidenceDirectory, { recursive: true });
  await mkdir(archiveFiles, { recursive: true });
  const archives = [];
  for (let title = 1; title <= 20; title += 1) {
    const uscTitle = String(title);
    for (const releaseRole of roles) {
      const expectedArchiveEntry = `usc${uscTitle.padStart(2, "0")}.xml`;
      const fixture = makeZip(
        expectedArchiveEntry,
        `<uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0"><meta title="${uscTitle}" release="${releaseRole}"/></uscDoc>`,
        8,
      );
      const fileName = `${releaseRole}-usc${uscTitle.padStart(2, "0")}.zip`;
      await writeFile(join(archiveFiles, fileName), fixture.bytes);
      archives.push({
        releaseRole,
        releasePoint: `test-${releaseRole}`,
        uscTitle,
        sourceUrl: `https://uscode.house.gov/test/${fileName}`,
        fileName,
        relativePath: `archives/${fileName}`,
        bytes: fixture.bytes.length,
        sha256: sha256(fixture.bytes),
        expectedArchiveEntry,
        xmlUncompressedBytes: fixture.commitment.xmlUncompressedBytes,
        xmlCrc32: fixture.commitment.xmlCrc32,
      });
    }
  }
  const archiveEvidence = {
    version: 1,
    mode: "obbba-law-usc-archive-evidence",
    input: { releasePlanSha256: "0".repeat(64) },
    summary: {
      archives: 40,
      titles: 20,
      totalBytes: archives.reduce((sum, entry) => sum + entry.bytes, 0),
    },
    archives,
  };
  const archiveEvidenceText = `${JSON.stringify(archiveEvidence, null, 2)}\n`;
  const archiveEvidencePath = join(evidenceDirectory, "archive-evidence.json");
  await writeFile(archiveEvidencePath, archiveEvidenceText);
  return {
    root,
    archiveDirectory,
    archiveEvidence,
    archiveEvidencePath,
    archiveEvidenceSha256: sha256(archiveEvidenceText),
    expectedReleaseRoles: roles,
    expectedArchiveBasename: archiveBasename,
    expectedXmlBasename: xmlBasename,
    xmlDirectory: join(cacheRoot, xmlBasename),
    xmlEvidencePath: join(evidenceDirectory, "xml-evidence.json"),
  };
}

function runFixture(layout, onProgress) {
  return extractObbbaLawUscXmlWithCommitment({
    archiveEvidencePath: layout.archiveEvidencePath,
    archiveDirectory: layout.archiveDirectory,
    xmlDirectory: layout.xmlDirectory,
    xmlEvidencePath: layout.xmlEvidencePath,
    expectedArchiveEvidenceSha256: layout.archiveEvidenceSha256,
    expectedReleaseRoles: layout.expectedReleaseRoles,
    expectedArchiveBasename: layout.expectedArchiveBasename,
    expectedXmlBasename: layout.expectedXmlBasename,
    onProgress,
  });
}

function makeZip(name, content, method) {
  return makeZipBytes(name, new TextEncoder().encode(content), method);
}

function makeZipBytes(name, body, method) {
  const nameBytes = new TextEncoder().encode(name);
  const compressed = method === 8
    ? new Uint8Array(deflateRawSync(body))
    : body;
  const crc = crc32Number(body);
  const local = new Uint8Array(30 + nameBytes.length + compressed.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(8, method, true);
  localView.setUint32(14, crc, true);
  localView.setUint32(18, compressed.length, true);
  localView.setUint32(22, body.length, true);
  localView.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(compressed, 30 + nameBytes.length);

  const central = new Uint8Array(46 + nameBytes.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(10, method, true);
  centralView.setUint32(16, crc, true);
  centralView.setUint32(20, compressed.length, true);
  centralView.setUint32(24, body.length, true);
  centralView.setUint16(28, nameBytes.length, true);
  central.set(nameBytes, 46);

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, 1, true);
  eocdView.setUint16(10, 1, true);
  eocdView.setUint32(12, central.length, true);
  eocdView.setUint32(16, local.length, true);
  const bytes = new Uint8Array(local.length + central.length + eocd.length);
  bytes.set(local);
  bytes.set(central, local.length);
  bytes.set(eocd, local.length + central.length);
  return {
    bytes,
    dataOffset: 30 + nameBytes.length,
    commitment: {
      expectedArchiveEntry: name,
      xmlUncompressedBytes: body.length,
      xmlCrc32: crc.toString(16).padStart(8, "0"),
    },
  };
}

function crc32Number(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
