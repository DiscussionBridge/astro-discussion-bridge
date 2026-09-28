import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchFromDiscourseRecord } from "../dist/bridge-record.js";

const fixture = async (name) => JSON.parse(await readFile(
  new URL(`../node_modules/discussionbridge-adapter-contract/fixtures/${name}`, import.meta.url),
  "utf8",
));
const capabilityBase = await fixture("connection-capability.json");
const recordBase = await fixture("from-discourse-record.json");
const resourceId = recordBase.bridge_record.resource_id;
const credentialsBase = {
  discourseUrl: "https://forum.example/",
  connectionId: capabilityBase.connection_id,
  connectionSecret: "s".repeat(40),
};

function capability(correlationId, overrides = {}) {
  return {
    ...structuredClone(capabilityBase),
    destination_policies: capabilityBase.destination_policies.map((policy) => ({ ...policy, profile: "astro" })),
    ...overrides,
    correlation_id: correlationId,
  };
}

function response(payload, correlationId, status = 200) {
  return new Response(JSON.stringify({ ...payload, correlation_id: correlationId }), {
    status,
    headers: { "content-type": "application/json", "X-DiscussionBridge-Correlation": correlationId },
  });
}

function mockedFetch(record, chunks = [], capabilityOverrides = {}) {
  const requests = [];
  const implementation = async (url, init) => {
    const parsed = new URL(url);
    const correlationId = init.headers["X-DiscussionBridge-Correlation"];
    requests.push({ url: parsed, init });
    if (parsed.pathname.endsWith("/discussion-bridge/v1/connection.json")) {
      return response(capability(correlationId, capabilityOverrides), correlationId);
    }
    if (parsed.pathname.endsWith(`/discussion-bridge/v1/bridge-records/${resourceId}.json`)) {
      return response({ bridge_record: record }, correlationId);
    }
    if (parsed.pathname.endsWith(`/discussion-bridge/v1/source-topics/${record.topic_id}/content.json`)) {
      const number = Number(parsed.searchParams.get("chunk"));
      assert.equal(parsed.searchParams.get("source_revision"), record.source_revision);
      const bytes = chunks[number - 1];
      return response({
        source_revision: record.source_revision,
        chunk: number,
        chunk_count: chunks.length,
        decoded_bytes: bytes.length,
        chunk_sha256: createHash("sha256").update(bytes).digest("hex"),
        content_base64: bytes.toString("base64"),
      }, correlationId);
    }
    throw new Error(`Unexpected request ${parsed.pathname}`);
  };
  return { implementation, requests };
}

function withContent(html, overrides = {}) {
  const bytes = Buffer.from(html, "utf8");
  return {
    ...structuredClone(recordBase.bridge_record),
    content_transport: {
      mode: "inline",
      media_type: "text/html; charset=utf-8",
      byte_length: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      content_html: html,
    },
    ...overrides,
  };
}

test("From Discourse presentation uses exact Alpha.21 capability, record, correlation, and sanitization", async () => {
  const record = withContent('<h2>Roadmap</h2><script>alert(1)</script><p onclick="bad()">Safe</p><a href="javascript:bad()">bad</a>');
  const mock = mockedFetch(record);
  const presented = await fetchFromDiscourseRecord(resourceId, { ...credentialsBase, fetchImplementation: mock.implementation });
  assert.equal(mock.requests.length, 2);
  for (const request of mock.requests) {
    assert.equal(request.init.headers["X-DiscussionBridge-Contract"], "0.2.0-alpha.21");
    assert.equal(request.init.headers["X-DiscussionBridge-Connection"], credentialsBase.connectionId);
    assert.equal(request.init.headers["X-DiscussionBridge-Secret"], credentialsBase.connectionSecret);
  }
  assert.equal(presented.topicId, 8);
  assert.equal(presented.sourceRevision, "post:12:version:4");
  assert.equal(presented.sourceUpdatedAt, "2026-09-27T18:30:00Z");
  assert.match(presented.contentHtml, /<h2>Roadmap<\/h2>/);
  assert.match(presented.contentHtml, /<p>Safe<\/p>/);
  assert.doesNotMatch(presented.contentHtml, /script|onclick|javascript:/i);
});

test("From Discourse presentation reassembles verified chunked content above 48 KiB", async () => {
  const html = `<h2>Complete source</h2><p>${"large-source-".repeat(6_000)}</p>`;
  const complete = Buffer.from(html, "utf8");
  const chunks = [];
  for (let offset = 0; offset < complete.length; offset += 32_768) chunks.push(complete.subarray(offset, offset + 32_768));
  const record = {
    ...structuredClone(recordBase.bridge_record),
    content_transport: {
      mode: "chunked",
      media_type: "text/html; charset=utf-8",
      byte_length: complete.length,
      sha256: createHash("sha256").update(complete).digest("hex"),
      chunk_count: chunks.length,
      decoded_chunk_maximum_bytes: 32_768,
    },
  };
  const mock = mockedFetch(record, chunks);
  const presented = await fetchFromDiscourseRecord(resourceId, { ...credentialsBase, fetchImplementation: mock.implementation });
  assert.ok(presented.sourceContentBytes > 49_152);
  assert.equal(presented.sourceContentSha256, record.content_transport.sha256);
  assert.match(presented.contentHtml, /Complete source/);
  assert.equal(mock.requests.length, 2 + chunks.length);
});

test("From Discourse presentation fails closed on resource, direction, topic, binding, and capability", async () => {
  const cases = [
    [{ ...structuredClone(recordBase.bridge_record), resource_id: "22222222-2222-4222-8222-222222222222" }, {}],
    [{ ...structuredClone(recordBase.bridge_record), direction: "to_discourse" }, {}],
    [{ ...structuredClone(recordBase.bridge_record), topic_url: "https://attacker.invalid/t/roadmap/8" }, {}],
    [{ ...structuredClone(recordBase.bridge_record), bindings: [] }, {}],
    [structuredClone(recordBase.bridge_record), { directions: ["to_discourse"] }],
  ];
  for (const [record, capabilityOverrides] of cases) {
    const mock = mockedFetch(record, [], capabilityOverrides);
    await assert.rejects(() => fetchFromDiscourseRecord(resourceId, { ...credentialsBase, fetchImplementation: mock.implementation }));
  }
});

test("From Discourse credentials and resource identity reject before any request", async () => {
  let requests = 0;
  const fetchImplementation = async () => { requests += 1; throw new Error("must not fetch"); };
  await assert.rejects(() => fetchFromDiscourseRecord("invalid", { ...credentialsBase, fetchImplementation }), /resource ID/);
  await assert.rejects(() => fetchFromDiscourseRecord(resourceId, { ...credentialsBase, connectionId: "astro-alpha", fetchImplementation }), /connection ID/);
  await assert.rejects(() => fetchFromDiscourseRecord(resourceId, { ...credentialsBase, connectionSecret: "short", fetchImplementation }), /connection secret/);
  assert.equal(requests, 0);
});
