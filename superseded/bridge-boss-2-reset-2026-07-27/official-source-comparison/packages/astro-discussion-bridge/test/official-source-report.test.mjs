import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  compareOfficialSourceBatch,
  writeOfficialSourceBatchReport,
} from "../dist/official-source-report.js";

const profile = {
  profile: "us-public-law",
  law: "Public Law 119-21",
  title: "Title I",
  congressUrl: "https://www.congress.gov/bill/119th-congress/house-bill/1/text",
  xmlUrl: "https://www.congress.gov/119/plaws/publ21/example.xml",
};

const navigation = {
  version: 1,
  generatedAt: "2026-07-24T00:00:00.000Z",
  discourseUrl: "https://forum.example.com/",
  hierarchyTagGroups: [],
  lenses: [{
    key: "obbba-text",
    label: "OBBBA Text",
    categoryId: 5,
    indexTopicId: 12,
    indexSourceUrl: "https://forum.example.com/t/12",
    nodes: [{
      id: "obbba-text:15",
      topicId: 15,
      label: "TITLE I",
      kind: "title",
      sourceUrl: "https://forum.example.com/t/15",
      children: [{
        id: "obbba-text:34",
        topicId: 34,
        label: "Sec. 10101. Test section",
        kind: "section",
        sourceUrl: "https://forum.example.com/t/34",
        children: [],
      }, {
        id: "obbba-text:35",
        topicId: 35,
        label: "Sec. 99999. Missing section",
        kind: "section",
        sourceUrl: "https://forum.example.com/t/35",
        children: [],
      }],
    }],
  }],
};

const xml = `<?xml version="1.0"?>
<law>
  <page identifier="/us/stat/139/80">139 STAT. 80</page>
  <section identifier="/us/pl/119/21/tI/s10101">
    <num value="10101">SEC. 10101.</num>
    <heading>TEST SECTION.</heading>
    <content>The exact statutory wording.</content>
  </section>
</law>`;

test("comparison batches read section topics and produce a zero-write report", async () => {
  const requests = [];
  const report = await compareOfficialSourceBatch({
    navigation,
    trustedDiscourseUrl: "https://forum.example.com",
    lens: "obbba-text",
    officialSource: profile,
    apiKey: "read-key",
    apiUsername: "reader",
    generatedAt: "2026-07-24T00:00:00.000Z",
    requestIntervalMs: 0,
    fetch: async (url, init = {}) => {
      const parsed = new URL(url);
      requests.push({ method: init.method ?? "GET", path: parsed.pathname, redirect: init.redirect });
      if (parsed.pathname === "/t/34.json" || parsed.pathname === "/t/35.json") {
        const topicId = Number(parsed.pathname.match(/\d+/)[0]);
        return jsonResponse({
          id: topicId,
          title: `Topic ${topicId}`,
          posts_count: 1,
          created_at: "2026-07-24T00:00:00.000Z",
          post_stream: {
            stream: [topicId + 100],
            posts: [{
              id: topicId + 100,
              post_number: 1,
              topic_id: topicId,
              topic_slug: `topic-${topicId}`,
              cooked: "",
            }],
          },
        });
      }
      if (parsed.pathname === "/posts/134.json" || parsed.pathname === "/posts/135.json") {
        const topicId = Number(parsed.pathname.match(/\d+/)[0]) - 100;
        return jsonResponse({
          id: topicId + 100,
          post_number: 1,
          topic_id: topicId,
          topic_slug: `topic-${topicId}`,
          raw: "The exact statutory wording.",
          cooked: "",
        });
      }
      if (parsed.pathname.endsWith("/example.xml")) {
        return new Response(xml, { status: 200 });
      }
      return new Response("Not found", { status: 404, statusText: "Not Found" });
    },
  });

  assert.deepEqual(report.writes, { discourse: 0, astroContent: 0 });
  assert.deepEqual(report.summary, {
    total: 2,
    exact: 1,
    "presentation-only": 0,
    "substantive-difference": 0,
    unresolved: 1,
  }, JSON.stringify(report.entries, null, 2));
  assert.equal(report.entries[0].citation, "139 Stat. 80");
  assert.match(report.entries[1].error, /does not contain Section 99999/);
  assert.ok(requests.every((request) => request.method === "GET"));
  assert.ok(requests.filter((request) => request.path.startsWith("/t/") || request.path.startsWith("/posts/"))
    .every((request) => request.redirect === "error"));
  assert.equal(requests.filter((request) => request.path.endsWith("/example.xml")).length, 1);
});

test("comparison rejects navigation authority drift before any credentialed fetch", async () => {
  let fetches = 0;
  await assert.rejects(
    compareOfficialSourceBatch({
      navigation,
      trustedDiscourseUrl: "https://trusted.example.com/",
      lens: "obbba-text",
      officialSource: profile,
      apiKey: "read-key",
      apiUsername: "reader",
      fetch: async () => {
        fetches += 1;
        throw new Error("must not fetch");
      },
    }),
    /does not match trusted Discourse URL/,
  );
  assert.equal(fetches, 0);
});

test("comparison bounds 429 cleanup and retries only rate limits", async () => {
  let attempts = 0;
  const rateLimitedReport = await compareOfficialSourceBatch({
      navigation,
      trustedDiscourseUrl: "https://forum.example.com/",
      lens: "obbba-text",
      officialSource: profile,
      apiKey: "read-key",
      apiUsername: "reader",
      requestIntervalMs: 0,
      fetch: async () => {
        attempts += 1;
        if (attempts >= 4) {
          return new Response("Rate limited", { status: 429 });
        }
        const hangingBody = new ReadableStream({
          cancel() {
            return new Promise(() => {});
          },
        });
        return new Response(hangingBody, {
          status: 429,
          headers: { "Retry-After": "0" },
        });
      },
    });
  assert.equal(rateLimitedReport.summary.unresolved, 2);
  assert.equal(attempts, 8);

  let nonRateLimitAttempts = 0;
  const forbiddenReport = await compareOfficialSourceBatch({
      navigation,
      trustedDiscourseUrl: "https://forum.example.com/",
      lens: "obbba-text",
      officialSource: profile,
      apiKey: "read-key",
      apiUsername: "reader",
      requestIntervalMs: 0,
      fetch: async () => {
        nonRateLimitAttempts += 1;
        return new Response("Forbidden", { status: 403 });
      },
    });
  assert.equal(forbiddenReport.summary.unresolved, 2);
  assert.equal(nonRateLimitAttempts, 2);
});

test("report output is create-only and rejects non-zero write claims", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-official-report-"));
  const filePath = path.join(dir, "report.json");
  const report = {
    version: 2,
    generatedAt: "2026-07-24T00:00:00.000Z",
    mode: "comparison-only",
    writes: { discourse: 0, astroContent: 0 },
    discourseUrl: "https://forum.example.com/",
    lens: "obbba-text",
    officialSource: profile,
    inputs: {
      navigationSha256: "a".repeat(64),
      configSha256: "b".repeat(64),
    },
    summary: {
      total: 0,
      exact: 0,
      "presentation-only": 0,
      "substantive-difference": 0,
      unresolved: 0,
    },
    entries: [],
  };
  try {
    await writeOfficialSourceBatchReport(filePath, report);
    assert.equal(JSON.parse(await readFile(filePath, "utf8")).mode, "comparison-only");
    await assert.rejects(writeOfficialSourceBatchReport(filePath, report), /EEXIST/);
    await assert.rejects(
      writeOfficialSourceBatchReport(path.join(dir, "unsafe.json"), {
        ...report,
        writes: { discourse: 1, astroContent: 0 },
      }),
      /must declare zero/,
    );
    await assert.rejects(
      writeOfficialSourceBatchReport(path.join(dir, "bad-hash.json"), {
        ...report,
        inputs: { ...report.inputs, navigationSha256: "bad" },
      }),
      /input hashes/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
