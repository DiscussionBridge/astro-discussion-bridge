import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  fetchOlrcClassification,
  runObbbaLawAuthorityMap,
} from "../fetch-obbba-law-authority-map.mjs";

const valid = `
<pre>
7     2012                          119-21   10101(a)                 80
</pre>`;

function response(status, body, options = {}) {
  return {
    status,
    statusText: options.statusText ?? "",
    ok: status >= 200 && status < 300,
    headers: new Headers(options.headers),
    arrayBuffer: options.arrayBuffer ?? (async () => new TextEncoder().encode(body).buffer),
    body: options.body ?? { cancel: async () => undefined },
  };
}

test("OLRC fetch is anonymous GET-only, redirect-blocked, and bounded", async () => {
  const calls = [];
  const text = await fetchOlrcClassification({
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return response(200, valid);
    },
  });
  assert.equal(text, valid);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://uscode.house.gov/classification/tbl119pl_1st.htm");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.redirect, "manual");
  assert.ok(!Object.keys(calls[0].init.headers).some((key) => /authorization|api|cookie/i.test(key)));
  await assert.rejects(
    fetchOlrcClassification({ fetcher: async () => response(302, "") }),
    /redirect blocked/,
  );
  await assert.rejects(
    fetchOlrcClassification({
      fetcher: async () => response(200, "", {
        headers: { "content-length": String(11 * 1024 * 1024) },
      }),
    }),
    /exceeds 10 MiB/,
  );
});

test("OLRC fetch retries only 429 and exposes bounded waits", async () => {
  let calls = 0;
  const waits = [];
  const notices = [];
  const text = await fetchOlrcClassification({
    fetcher: async () => {
      calls += 1;
      return calls === 1
        ? response(429, '{"extras":{"wait_seconds":3}}', {
          headers: { "retry-after": "2" },
        })
        : response(200, valid);
    },
    sleep: async (milliseconds) => waits.push(milliseconds),
    onRateLimit: (...values) => notices.push(values),
  });
  assert.equal(text, valid);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [3000]);
  assert.deepEqual(notices, [[3000, 1, 3]]);

  calls = 0;
  await assert.rejects(
    fetchOlrcClassification({
      fetcher: async () => {
        calls += 1;
        return response(429, "");
      },
      sleep: async () => undefined,
    }),
    /failed: 429/,
  );
  assert.equal(calls, 4);

  calls = 0;
  await assert.rejects(
    fetchOlrcClassification({
      fetcher: async () => {
        calls += 1;
        return response(500, "");
      },
    }),
    /failed: 500/,
  );
  assert.equal(calls, 1);
});

test("OLRC body failures and hanging cancellation are contained", async () => {
  const started = Date.now();
  await assert.rejects(
    fetchOlrcClassification({
      fetcher: async () => response(500, "", {
        arrayBuffer: async () => { throw new Error("canary-secret"); },
        body: { cancel: async () => new Promise(() => {}) },
      }),
    }),
    (error) => {
      assert.doesNotMatch(error.message, /canary-secret/);
      return /body could not be read/.test(error.message);
    },
  );
  assert.ok(Date.now() - started < 1000);
});

test("OLRC streaming cap rejects chunked and understated bodies early", async () => {
  for (const headers of [{}, { "content-length": "1" }]) {
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    await assert.rejects(
      fetchOlrcClassification({
        fetcher: async () => ({
          status: 200,
          statusText: "OK",
          ok: true,
          headers: new Headers(headers),
          body,
          arrayBuffer: async () => assert.fail("stream path must not buffer"),
        }),
      }),
      /exceeds 10 MiB/,
    );
    assert.equal(cancelled, true);
    assert.ok(pulls <= 12);
  }
});

test("OLRC hanging stream is aborted and cancelled by the real deadline", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull() {
      return new Promise(() => {});
    },
    cancel() {
      cancelled = true;
    },
  });
  const started = Date.now();
  await assert.rejects(
    fetchOlrcClassification({
      fetcher: async () => ({
        status: 200,
        statusText: "OK",
        ok: true,
        headers: new Headers(),
        body,
        arrayBuffer: async () => assert.fail("stream path must not buffer"),
      }),
      deadlineMs: 30,
    }),
    /deadline exceeded/,
  );
  assert.equal(cancelled, true);
  assert.ok(Date.now() - started < 500);
});

function runnerMetadataText() {
  const entries = Array.from({ length: 309 }, (_, index) => {
    const sectionId = index === 0 ? "10101" : String(80_000 + index);
    const topicId = index + 1;
    return {
      sectionId,
      topicId,
      title: `Sec. ${sectionId}. Provision ${sectionId} | Law as Amended`,
      sourceUrl: `https://forum.repealobbba.org/t/${topicId}`,
      normalizedTags: ["law-as-amended"],
    };
  });
  return `${JSON.stringify({
    mode: "law-as-amended-forum-metadata-only",
    summary: { total: 309 },
    entries,
  }, null, 2)}\n`;
}

test("authority runner stops before fetch, leaves failures absent, and roundtrips create-only", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "discussionbridge-authority-map-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const metadataPath = path.join(directory, "metadata.json");
  const outputPath = path.join(directory, "map.json");
  const metadata = runnerMetadataText();
  const metadataHash = createHash("sha256").update(metadata).digest("hex");
  await writeFile(metadataPath, metadata);

  let fetches = 0;
  await writeFile(outputPath, "competing");
  await assert.rejects(
    runObbbaLawAuthorityMap({
      metadataPath,
      outputPath,
      expectedMetadataSha256: metadataHash,
      fetcher: async () => {
        fetches += 1;
        assert.fail("existing output must stop before fetch");
      },
    }),
    /already exists/,
  );
  assert.equal(fetches, 0);
  assert.equal(await readFile(outputPath, "utf8"), "competing");
  await rm(outputPath);

  await assert.rejects(
    runObbbaLawAuthorityMap({
      metadataPath,
      outputPath,
      expectedMetadataSha256: "0".repeat(64),
      fetcher: async () => {
        fetches += 1;
        assert.fail("hash mismatch must stop before fetch");
      },
    }),
    /byte commitment/,
  );
  assert.equal(fetches, 0);

  await assert.rejects(
    runObbbaLawAuthorityMap({
      metadataPath,
      outputPath,
      expectedMetadataSha256: metadataHash,
      fetcher: async () => response(200, "not a classification"),
    }),
    /contains no Public Law/,
  );
  await assert.rejects(readFile(outputPath), { code: "ENOENT" });

  const map = await runObbbaLawAuthorityMap({
    metadataPath,
    outputPath,
    expectedMetadataSha256: metadataHash,
    fetcher: async () => response(200, valid),
  });
  assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), map);
});

test("authority runner final wx collision preserves the competing file", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "discussionbridge-authority-map-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const metadataPath = path.join(directory, "metadata.json");
  const outputPath = path.join(directory, "map.json");
  const metadata = runnerMetadataText();
  const metadataHash = createHash("sha256").update(metadata).digest("hex");
  await writeFile(metadataPath, metadata);
  await assert.rejects(
    runObbbaLawAuthorityMap({
      metadataPath,
      outputPath,
      expectedMetadataSha256: metadataHash,
      fetcher: async () => {
        await writeFile(outputPath, "race-winner");
        return response(200, valid);
      },
    }),
    { code: "EEXIST" },
  );
  assert.equal(await readFile(outputPath, "utf8"), "race-winner");
});
