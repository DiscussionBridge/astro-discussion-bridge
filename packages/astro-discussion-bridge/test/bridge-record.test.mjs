import assert from "node:assert/strict";
import test from "node:test";
import { fetchFromDiscourseRecord } from "../dist/bridge-record.js";

const credentials = {
  discourseUrl: "https://forum.example/community/",
  connectionId: "dbc_aaaaaaaaaaaaaaaaaaaaaaaa",
  connectionSecret: "s".repeat(32),
};
const resourceId = "11111111-1111-4111-8111-111111111111";

function payload(overrides = {}) {
  return {
    bridge_record: {
      resource_id: resourceId,
      direction: "from_discourse",
      state: "healthy",
      title: "Forum roadmap",
      topic_id: 42,
      topic_url: "https://forum.example/community/t/forum-roadmap/42",
      content_html: '<h2>Roadmap</h2><script>alert(1)</script><p onclick="bad()">Safe</p><a href="javascript:bad()">bad</a>',
      ...overrides,
    },
  };
}

test("From Discourse retrieval is authenticated, bounded, identity-checked, and sanitized", async (t) => {
  const prior = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify(payload()), { status: 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = prior; });
  const record = await fetchFromDiscourseRecord(resourceId, credentials);
  assert.equal(request.url, `https://forum.example/community/discussion-bridge/v1/bridge-records/${resourceId}.json`);
  assert.equal(request.init.method, "GET");
  assert.equal(request.init.redirect, "error");
  assert.equal(request.init.headers["X-DiscussionBridge-Connection"], credentials.connectionId);
  assert.equal(request.init.headers["X-DiscussionBridge-Secret"], credentials.connectionSecret);
  assert.equal(record.topicId, 42);
  assert.match(record.contentHtml, /<h2>Roadmap<\/h2>/);
  assert.match(record.contentHtml, /<p>Safe<\/p>/);
  assert.doesNotMatch(record.contentHtml, /script|onclick|javascript:/i);
});

test("From Discourse retrieval fails closed on identity, direction, origin, and response bounds", async (t) => {
  const prior = globalThis.fetch;
  t.after(() => { globalThis.fetch = prior; });
  for (const overrides of [
    { resource_id: "22222222-2222-4222-8222-222222222222" },
    { direction: "to_discourse" },
    { state: "failed" },
    { topic_url: "https://attacker.invalid/t/roadmap/42" },
    { topic_url: "https://forum.example/community/t/roadmap/41" },
  ]) {
    globalThis.fetch = async () => new Response(JSON.stringify(payload(overrides)), { status: 200, headers: { "content-type": "application/json" } });
    await assert.rejects(() => fetchFromDiscourseRecord(resourceId, credentials));
  }
  globalThis.fetch = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json", "content-length": "65537" } });
  await assert.rejects(() => fetchFromDiscourseRecord(resourceId, credentials), /too large/);
});

test("From Discourse credentials and resource identity reject before fetch", async (t) => {
  const prior = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("must not fetch"); };
  t.after(() => { globalThis.fetch = prior; });
  await assert.rejects(() => fetchFromDiscourseRecord("invalid", credentials), /resource ID/);
  await assert.rejects(() => fetchFromDiscourseRecord(resourceId, { ...credentials, connectionId: "astro-alpha" }), /connection ID/);
  await assert.rejects(() => fetchFromDiscourseRecord(resourceId, { ...credentials, connectionSecret: "short" }), /connection secret/);
  assert.equal(requests, 0);
});
