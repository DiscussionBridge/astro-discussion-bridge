import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  fetchSourceInventoryPage,
  fetchSourceRevocationDetail,
  fetchSourceRevocationPage,
  fetchSourceTopicDetail,
} from "../dist/source-publication.js";

const fixture = async (name) => JSON.parse(await readFile(
  new URL(`../node_modules/discussionbridge-adapter-contract/fixtures/${name}`, import.meta.url),
  "utf8",
));
const capabilityBase = await fixture("connection-capability.json");
const inventoryFixture = await fixture("source-inventory-page.json");
const inlineFixture = await fixture("source-detail-inline.json");
const revocationIndexFixture = await fixture("source-revocation-index.json");
const revocationFixture = await fixture("source-revocation.json");
const credentialsBase = {
  discourseUrl: "https://forum.example/",
  connectionId: capabilityBase.connection_id,
  connectionSecret: "s".repeat(40),
};

function capability(correlationId) {
  return {
    ...structuredClone(capabilityBase),
    destination_policies: capabilityBase.destination_policies.map((policy) => ({ ...policy, profile: "astro" })),
    correlation_id: correlationId,
  };
}

function response(payload, correlationId, status = 200) {
  return new Response(JSON.stringify({ ...payload, correlation_id: correlationId }), {
    status,
    headers: { "content-type": "application/json", "X-DiscussionBridge-Correlation": correlationId },
  });
}

function mockedFetch(routes) {
  return async (url, init) => {
    const parsed = new URL(url);
    const correlationId = init.headers["X-DiscussionBridge-Correlation"];
    if (parsed.pathname.endsWith("/discussion-bridge/v1/connection.json")) return response(capability(correlationId), correlationId);
    const handler = routes.find(([suffix]) => parsed.pathname.endsWith(suffix))?.[1];
    if (!handler) throw new Error(`Unexpected request ${parsed.pathname}`);
    return handler(parsed, correlationId);
  };
}

test("immutable inventory and inline detail consume released Alpha.21 fixtures", async () => {
  const fetchImplementation = mockedFetch([
    ["/discussion-bridge/v1/source-topics.json", (_url, correlationId) => response(inventoryFixture, correlationId)],
    ["/discussion-bridge/v1/source-topics/8.json", (url, correlationId) => {
      assert.equal(url.searchParams.get("source_revision"), "post:12:version:4");
      return response(inlineFixture, correlationId);
    }],
  ]);
  const credentials = { ...credentialsBase, fetchImplementation };
  const page = await fetchSourceInventoryPage(credentials, { limit: 25 });
  assert.equal(page.snapshot, inventoryFixture.snapshot);
  assert.equal(page.complete, true);
  assert.equal(page.items[0].sourceRevisionSequence, 4);
  const detail = await fetchSourceTopicDetail(credentials, 8, "post:12:version:4");
  assert.equal(detail.contentHtml, "<p>This discussion started in Discourse.</p>");
  assert.equal(detail.sanitizedContentHtml, detail.contentHtml);
  assert.equal(detail.sourceContentBytes, 44);
  assert.equal(detail.sourceUpdatedAt, "2026-09-27T18:30:00Z");
});

test("chunked content is revision-pinned and verified before UTF-8 decode or sanitization", async () => {
  const html = `<h2>Large source</h2><p>${"complete-content-".repeat(5_000)}</p>`;
  const complete = Buffer.from(html, "utf8");
  const parts = [];
  for (let offset = 0; offset < complete.length; offset += 32_768) parts.push(complete.subarray(offset, offset + 32_768));
  const detail = {
    ...inlineFixture,
    topic_id: 12,
    topic_url: "https://forum.example/t/large-source/12",
    source_revision: "post:18:version:7",
    source_revision_sequence: 7,
    content_transport: {
      mode: "chunked",
      media_type: "text/html; charset=utf-8",
      byte_length: complete.length,
      sha256: createHash("sha256").update(complete).digest("hex"),
      chunk_count: parts.length,
      decoded_chunk_maximum_bytes: 32_768,
    },
  };
  const fetchImplementation = mockedFetch([
    ["/discussion-bridge/v1/source-topics/12.json", (_url, correlationId) => response(detail, correlationId)],
    ["/discussion-bridge/v1/source-topics/12/content.json", (url, correlationId) => {
      assert.equal(url.searchParams.get("source_revision"), "post:18:version:7");
      const number = Number(url.searchParams.get("chunk"));
      const bytes = parts[number - 1];
      return response({
        source_revision: "post:18:version:7",
        chunk: number,
        chunk_count: parts.length,
        decoded_bytes: bytes.length,
        chunk_sha256: createHash("sha256").update(bytes).digest("hex"),
        content_base64: bytes.toString("base64"),
      }, correlationId);
    }],
  ]);
  const result = await fetchSourceTopicDetail({ ...credentialsBase, fetchImplementation }, 12, "post:18:version:7");
  assert.equal(result.contentHtml, html);
  assert.equal(result.sourceContentBytes, complete.length);
  assert.match(result.sanitizedContentHtml, /Large source/);
});

test("a corrupt chunk fails before any partial source is returned", async () => {
  const bytes = Buffer.from("<p>Complete</p>");
  const detail = {
    ...inlineFixture,
    content_transport: {
      mode: "chunked",
      media_type: "text/html; charset=utf-8",
      byte_length: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      chunk_count: 1,
      decoded_chunk_maximum_bytes: 32_768,
    },
  };
  const fetchImplementation = mockedFetch([
    ["/discussion-bridge/v1/source-topics/8.json", (_url, correlationId) => response(detail, correlationId)],
    ["/discussion-bridge/v1/source-topics/8/content.json", (_url, correlationId) => response({
      source_revision: "post:12:version:4",
      chunk: 1,
      chunk_count: 1,
      decoded_bytes: bytes.length,
      chunk_sha256: "0".repeat(64),
      content_base64: bytes.toString("base64"),
    }, correlationId)],
  ]);
  await assert.rejects(
    () => fetchSourceTopicDetail({ ...credentialsBase, fetchImplementation }, 8, "post:12:version:4"),
    /chunk integrity failed/,
  );
});

test("revocation inventory and exact detail retain independent policy and source identity", async () => {
  const fetchImplementation = mockedFetch([
    ["/discussion-bridge/v1/source-revocations.json", (_url, correlationId) => response(revocationIndexFixture, correlationId)],
    [`/discussion-bridge/v1/source-revocations/${revocationFixture.resource_id}.json`, (_url, correlationId) => response(revocationFixture, correlationId)],
  ]);
  const credentials = { ...credentialsBase, fetchImplementation };
  const page = await fetchSourceRevocationPage(credentials, { limit: 25 });
  assert.equal(page.items[0].reason, "source_unpublished");
  assert.equal(page.items[0].restorable, true);
  const detail = await fetchSourceRevocationDetail(credentials, revocationFixture.resource_id);
  assert.deepEqual(detail.affectedBindingIds, revocationFixture.affected_binding_ids);
  assert.equal(detail.policyRevision, revocationFixture.policy_revision);
});

test("snapshot identity drift and substituted source revisions fail closed", async () => {
  const fetchImplementation = mockedFetch([
    ["/discussion-bridge/v1/source-topics.json", (_url, correlationId) => response(inventoryFixture, correlationId)],
    ["/discussion-bridge/v1/source-topics/8.json", (_url, correlationId) => response(inlineFixture, correlationId)],
    ["/discussion-bridge/v1/source-revocations.json", (_url, correlationId) => response(revocationIndexFixture, correlationId)],
  ]);
  const credentials = { ...credentialsBase, fetchImplementation };
  await assert.rejects(
    () => fetchSourceInventoryPage(credentials, { snapshot: "dbs_wrong_snapshot" }),
    /snapshot changed/,
  );
  await assert.rejects(
    () => fetchSourceInventoryPage(credentials, {
      snapshot: inventoryFixture.snapshot,
      policyRevision: "policy:wrong",
    }),
    /policy changed/,
  );
  await assert.rejects(
    () => fetchSourceRevocationPage(credentials, {
      highWater: revocationIndexFixture.high_water,
      policyRevision: "policy:wrong",
    }),
    /policy changed/,
  );
  await assert.rejects(
    () => fetchSourceTopicDetail(credentials, 8, "post:12:version:99"),
    /substituted a different identity or revision/,
  );
});
