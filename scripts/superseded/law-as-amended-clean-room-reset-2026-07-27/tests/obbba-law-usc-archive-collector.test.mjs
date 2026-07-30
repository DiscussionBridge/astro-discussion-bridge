import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  collectObbbaLawUscArchives,
  inspectZip,
} from "../obbba-law-usc-archive-collector.mjs";

const SOURCE_PLAN = new URL(
  "../../docs/evidence/OBBBA_LAW_USC_RELEASE_INPUT_PLAN_V3_2026-07-26.json",
  import.meta.url,
);
const INCORPORATION_PLAN = new URL(
  "../../docs/evidence/OBBBA_LAW_INCORPORATION_WINDOW_INPUT_PLAN_2026-07-26.json",
  import.meta.url,
);

test("ZIP inspection requires the exact safe XML member", () => {
  const zip = makeZip("usc07.xml", "<usc>seven</usc>");
  assert.deepEqual(inspectZip(zip, "usc07.xml"), {
    crc32: "00000000",
    compressedBytes: 16,
    uncompressedBytes: 16,
    method: 0,
    dataOffset: 39,
  });
  assert.throws(() => inspectZip(zip, "usc08.xml"), /missing expected XML/);
  assert.throws(
    () => inspectZip(makeZip("../usc07.xml", "bad"), "usc07.xml"),
    /unsafe or duplicate/,
  );
  const corruptLocal = makeZip("usc07.xml", "bad");
  corruptLocal[0] = 0;
  assert.throws(() => inspectZip(corruptLocal, "usc07.xml"), /local header/);
  const trailing = new Uint8Array(zip.length + 1);
  trailing.set(zip);
  assert.throws(() => inspectZip(trailing, "usc07.xml"), /central directory/);
  const zip64 = makeZip("usc07.xml", "bad");
  new DataView(zip64.buffer).setUint16(zip64.length - 12, 0xffff, true);
  assert.throws(() => inspectZip(zip64, "usc07.xml"), /central directory/);
  assert.equal(
    inspectZip(makeDescriptorZip("usc07.xml", "descriptor"), "usc07.xml")
      .uncompressedBytes,
    10,
  );
  const brokenDescriptor = makeDescriptorZip("usc07.xml", "descriptor");
  brokenDescriptor[30 + "usc07.xml".length + 10 + 4] = 1;
  assert.throws(
    () => inspectZip(brokenDescriptor, "usc07.xml"),
    /data descriptor/,
  );
});

test("collector fetches only planned sources and commits create-only evidence", async () => {
  const layout = await makeRepositoryLayout("obbba-usc-collector-");
  const { directory, planPath, archiveDirectory, evidencePath } = layout;
  const calls = [];
  try {
    const evidence = await collectObbbaLawUscArchives({
      planPath,
      archiveDirectory,
      evidencePath,
      fetcher: async (url, options) => {
        calls.push({ url, options });
        const title = /xml_usc(\d+)@/.exec(url)?.[1];
        return new Response(makeZip(`usc${title}.xml`, `<usc title="${title}"/>`), {
          status: 200,
          headers: { "content-type": "application/zip" },
        });
      },
    });
    assert.equal(calls.length, 40);
    assert.ok(calls.every((call) =>
      call.options.method === "GET"
      && call.options.redirect === "manual"
      && !("authorization" in call.options.headers)
      && new URL(call.url).hostname === "uscode.house.gov"));
    assert.equal(evidence.summary.archives, 40);
    assert.equal(evidence.summary.titles, 20);
    assert.deepEqual(await readdir(archiveDirectory), ["archives"]);
    assert.equal((await readdir(join(archiveDirectory, "archives"))).length, 40);
    assert.ok(evidence.archives.every((entry) =>
      entry.relativePath === `archives/${entry.fileName}`));
    assert.deepEqual(JSON.parse(await readFile(evidencePath, "utf8")), evidence);
    await assert.rejects(
      collectObbbaLawUscArchives({
        planPath,
        archiveDirectory,
        evidencePath,
        fetcher: () => { throw new Error("must not fetch"); },
      }),
      /already exists/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("collector accepts only the pinned incorporation-window profile", async () => {
  const layout = await makeRepositoryLayout(
    "obbba-usc-incorporation-",
    {
      sourcePlan: INCORPORATION_PLAN,
      planName:
        "OBBBA_LAW_INCORPORATION_WINDOW_INPUT_PLAN_2026-07-26.json",
      archiveName: "obbba-law-usc-incorporation-archives-2026-07-26",
    },
  );
  const calls = [];
  try {
    const evidence = await collectObbbaLawUscArchives({
      planPath: layout.planPath,
      archiveDirectory: layout.archiveDirectory,
      evidencePath: layout.evidencePath,
      fetcher: async (url) => {
        calls.push(url);
        const title = /xml_usc(\d+)@/.exec(url)?.[1];
        return new Response(makeZip(`usc${title}.xml`, "window"));
      },
    });
    assert.equal(evidence.input.releasePlanProfile, "incorporation-window-v1");
    assert.equal(calls.length, 40);
    assert.equal(calls.filter((url) => url.includes("/119/27not21/")).length, 20);
    assert.equal(calls.filter((url) => url.includes("/119/31/")).length, 20);
    assert.ok(calls.every((url) =>
      /xml_usc\d+@119-(?:27not21|31)\.zip$/.test(url)));
  } finally {
    await rm(layout.directory, { recursive: true, force: true });
  }
});

test("collector rolls back all staged archives when any ZIP fails", async () => {
  const layout = await makeRepositoryLayout("obbba-usc-rollback-");
  const { directory, planPath, archiveDirectory, evidencePath } = layout;
  let calls = 0;
  try {
    await assert.rejects(
      collectObbbaLawUscArchives({
        planPath,
        archiveDirectory,
        evidencePath,
        fetcher: async (url) => {
          calls += 1;
          if (calls === 2) return new Response(new Uint8Array([1, 2, 3]));
          const title = /xml_usc(\d+)@/.exec(url)?.[1];
          return new Response(makeZip(`usc${title}.xml`, "ok"));
        },
      }),
      /valid ZIP/,
    );
    await assert.rejects(readFile(evidencePath), /ENOENT/);
    await assert.rejects(readdir(archiveDirectory), /ENOENT/);
    await assert.rejects(
      readdir(join(directory, ".discussionbridge-cache")),
      /ENOENT/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("collector enforces one bounded fetch/body deadline", async () => {
  for (const fetcher of [
    () => new Promise(() => undefined),
    () => Promise.resolve(new Response(new ReadableStream({
      pull() {
        return new Promise(() => undefined);
      },
    }))),
  ]) {
    const layout = await makeRepositoryLayout("obbba-usc-deadline-");
    const { directory, planPath, archiveDirectory, evidencePath } = layout;
    const started = Date.now();
    try {
      await assert.rejects(
        collectObbbaLawUscArchives({
          planPath,
          archiveDirectory,
          evidencePath,
          fetcher,
          deadlineMs: 25,
        }),
        /deadline exceeded/,
      );
      assert.ok(Date.now() - started < 500);
      await assert.rejects(
        readdir(join(directory, ".discussionbridge-cache")),
        /ENOENT/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  const layout = await makeRepositoryLayout("obbba-usc-single-window-");
  const { directory, planPath, archiveDirectory, evidencePath } = layout;
  try {
    await assert.rejects(
      collectObbbaLawUscArchives({
        planPath,
        archiveDirectory,
        evidencePath,
        deadlineMs: 30,
        fetcher: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return new Response(new ReadableStream({
            async pull(controller) {
              await new Promise((resolve) => setTimeout(resolve, 20));
              controller.enqueue(new Uint8Array([1]));
            },
          }));
        },
      }),
      /deadline exceeded/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("late destination race preserves the competing directory", async () => {
  const layout = await makeRepositoryLayout("obbba-usc-race-");
  const { directory, planPath, archiveDirectory, evidencePath } = layout;
  let createdCompetitor = false;
  try {
    await assert.rejects(
      collectObbbaLawUscArchives({
        planPath,
        archiveDirectory,
        evidencePath,
        fetcher: async (url) => {
          if (!createdCompetitor) {
            createdCompetitor = true;
            await import("node:fs/promises").then(({ mkdir, writeFile }) =>
              mkdir(archiveDirectory).then(() =>
                writeFile(join(archiveDirectory, "competitor.txt"), "keep")));
          }
          const title = /xml_usc(\d+)@/.exec(url)?.[1];
          return new Response(makeZip(`usc${title}.xml`, "ok"));
        },
      }),
      /EEXIST|already exists/,
    );
    assert.equal(
      await readFile(join(archiveDirectory, "competitor.txt"), "utf8"),
      "keep",
    );
    await assert.rejects(readFile(evidencePath), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function makeRepositoryLayout(prefix, {
  sourcePlan = SOURCE_PLAN,
  planName = "OBBBA_LAW_USC_RELEASE_INPUT_PLAN_V3_2026-07-26.json",
  archiveName = "obbba-law-usc-archives-2026-07-26",
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const evidenceDirectory = join(directory, "docs", "evidence");
  await mkdir(evidenceDirectory, { recursive: true });
  const planPath = join(
    evidenceDirectory,
    planName,
  );
  await writeFile(planPath, await readFile(sourcePlan));
  return {
    directory,
    planPath,
    archiveDirectory: join(
      directory,
      ".discussionbridge-cache",
      archiveName,
    ),
    evidencePath: join(evidenceDirectory, "archive-evidence.json"),
  };
}

function makeZip(name, content) {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const body = encoder.encode(content);
  const local = new Uint8Array(30 + nameBytes.length + body.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(8, 0, true);
  localView.setUint32(18, body.length, true);
  localView.setUint32(22, body.length, true);
  localView.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(body, 30 + nameBytes.length);

  const central = new Uint8Array(46 + nameBytes.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(10, 0, true);
  centralView.setUint32(20, body.length, true);
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

  const result = new Uint8Array(local.length + central.length + eocd.length);
  result.set(local, 0);
  result.set(central, local.length);
  result.set(eocd, local.length + central.length);
  return result;
}

function makeDescriptorZip(name, content) {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const body = encoder.encode(content);
  const descriptor = new Uint8Array(16);
  const descriptorView = new DataView(descriptor.buffer);
  descriptorView.setUint32(0, 0x08074b50, true);
  descriptorView.setUint32(4, 0, true);
  descriptorView.setUint32(8, body.length, true);
  descriptorView.setUint32(12, body.length, true);

  const ordinary = makeZip(name, content);
  const ordinaryView = new DataView(ordinary.buffer);
  const centralOffset = ordinaryView.getUint32(ordinary.length - 6, true);
  const centralLength = ordinary.length - centralOffset - 22;
  const result = new Uint8Array(ordinary.length + descriptor.length);
  result.set(ordinary.subarray(0, centralOffset), 0);
  result.set(descriptor, centralOffset);
  result.set(
    ordinary.subarray(centralOffset, centralOffset + centralLength),
    centralOffset + descriptor.length,
  );
  result.set(ordinary.subarray(ordinary.length - 22), result.length - 22);
  const view = new DataView(result.buffer);
  view.setUint16(6, 0x8, true);
  view.setUint32(14, 0, true);
  view.setUint32(18, 0, true);
  view.setUint32(22, 0, true);
  view.setUint16(centralOffset + descriptor.length + 8, 0x8, true);
  view.setUint32(result.length - 6, centralOffset + descriptor.length, true);
  assert.equal(nameBytes.length, view.getUint16(26, true));
  return result;
}
