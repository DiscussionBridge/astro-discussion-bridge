import assert from "node:assert/strict";
import test from "node:test";
import { fetchFromDiscourseRecord } from "../dist/bridge-record.js";
import { createHash } from "node:crypto";

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
  assert.equal(request.url, `https://forum.example/community/discussion-bridge/v1/bridge-records/${resourceId}.json?publication_contract=0.3.0-alpha.1`);
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
  globalThis.fetch = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json", "content-length": "2097153" } });
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

test("direct From presentation hydrates complete UTF8 chunks within a configured Discourse subfolder", async (t) => {
  const prior = globalThis.fetch;
  t.after(() => { globalThis.fetch = prior; });
  const body = Buffer.from(`<p>${"Ω".repeat(40000)}Complete ending</p>`);
  const sha256 = createHash("sha256").update(body).digest("hex");
  const source = { status: "active", edition: "a".repeat(64), content: { bytes: body.length, sha256, path: `/discussion-bridge/v1/bridge-records/${resourceId}/content.json`, chunk_bytes: 32768 } };
  let chunks = 0;
  globalThis.fetch = async (url, init) => {
    const request = new URL(url);
    assert.equal(request.origin, "https://forum.example");
    assert.ok(request.pathname.startsWith("/community/discussion-bridge/"));
    assert.equal(init.headers["X-DiscussionBridge-Connection"], credentials.connectionId);
    let data;
    if (request.pathname.endsWith("/content.json")) {
      chunks++;
      const offset = Number(request.searchParams.get("offset"));
      const bytes = body.subarray(offset, offset + 32768);
      const next = offset + bytes.length;
      data = { resource_id: resourceId, edition: source.edition, offset, total_bytes: body.length, content_sha256: sha256, chunk_base64: bytes.toString("base64"), next_offset: next === body.length ? null : next };
    } else data = payload({ source, content_html: null });
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  };
  assert.match((await fetchFromDiscourseRecord(resourceId, credentials)).contentHtml, /Complete ending/);
  assert.equal(chunks, 3);
});

test("direct From presentation retries a changed source edition three times and refuses withdrawal", async (t) => {
  const prior = globalThis.fetch;
  t.after(() => { globalThis.fetch = prior; });
  const source = { status: "active", edition: "a".repeat(64), content: { bytes: 1, sha256: "b".repeat(64), path: `/discussion-bridge/v1/bridge-records/${resourceId}/content.json`, chunk_bytes: 32768 } };
  let requests = 0;
  globalThis.fetch = async (url) => {
    if (new URL(url).pathname.endsWith("/content.json")) {
      requests++;
      return new Response(JSON.stringify({ reason: "edition_changed" }), { status: 409, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify(payload({ source, content_html: null })), { headers: { "content-type": "application/json" } });
  };
  await assert.rejects(() => fetchFromDiscourseRecord(resourceId, credentials), /edition changed/);
  assert.equal(requests, 3);
  globalThis.fetch = async () => new Response(JSON.stringify(payload({ content_html: null, source: { status: "withdrawn" } })), { headers: { "content-type": "application/json" } });
  await assert.rejects(() => fetchFromDiscourseRecord(resourceId, credentials), /invalid/);
});
