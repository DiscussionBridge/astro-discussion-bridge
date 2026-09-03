import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeNativePublications } from "../dist/native-publication.js";

const record = {
  resource_id: "11111111-1111-4111-8111-111111111111", direction: "from_discourse", state: "healthy", title: "The Bridge publishes everywhere", topic_id: 53,
  content_html: "<h2>One source</h2><script>bad()</script><p>Native Astro content.</p>",
  source: { platform: "discourse", origin: "https://bridge.example", topic_id: 53, topic_url: "https://bridge.example/t/publisher/53", post_id: 149, post_number: 1, post_version: 1, revision: "post:149:version:1", updated_at: "2026-09-01T08:00:00.000Z", author: { name: "DiscussionBridge", profile_url: "https://bridge.example/u/discussionbridge" } },
  bindings: [{ role: "presentation", state: "active", canonical_url: "https://astro.example/comments/bridge-publisher/", native_materialization: true }],
};

function options(docsDir, records = [record]) {
  return { docsDir, siteUrl: "https://astro.example/", serverUrl: "https://bridge.example/", connectionId: "dbc_0123456789abcdef01234567", connectionSecret: "s".repeat(32), fetchImplementation: async () => new Response(JSON.stringify({ bridge_records: records, pagination: { page: 1, pages: 1, total: records.length, snapshot: "snapshot-one" } }), { status: 200, headers: { "content-type": "application/json" } }) };
}

test("materializes one authorized Astro source atomically and exact retry is unchanged", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-native-"));
  assert.deepEqual(await materializeNativePublications(options(root)), { created: 1, updated: 0, unchanged: 0, skipped: 0, failed: 0 });
  assert.deepEqual(await materializeNativePublications(options(root)), { created: 0, updated: 0, unchanged: 1, skipped: 0, failed: 0 });
  const source = await readFile(path.join(root, "comments", "bridge-publisher.md"), "utf8");
  assert.match(source, /discussionbridgeNativePublication: true/);
  assert.match(source, /discussionbridgeResourceId: 11111111-1111-4111-8111-111111111111/);
  assert.match(source, /discourseTopicId: 53/);
  assert.match(source, /date: "2026-09-01T08:00:00\.000Z"/);
  assert.match(source, /Native Astro content/);
  assert.doesNotMatch(source, /<script|bad\(\)/);
});

test("skips presentation-only records and fails an authorized destination escape", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-native-"));
  const presentation = { ...record, bindings: [{ ...record.bindings[0], native_materialization: false }] };
  const escaped = { ...record, resource_id: "22222222-2222-4222-8222-222222222222", bindings: [{ ...record.bindings[0], canonical_url: "https://astro.example/outside/bridge-publisher/" }] };
  assert.deepEqual(await materializeNativePublications(options(root, [presentation, escaped])), { created: 0, updated: 0, unchanged: 0, skipped: 1, failed: 1 });
});

test("fails closed when a paginated publication feed drifts or repeats an identity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-feed-"));
  let call = 0;
  const drifting = {
    ...options(root),
    fetchImplementation: async () => {
      call++;
      return new Response(JSON.stringify({ bridge_records: [record], pagination: { page: call, pages: 2, total: 2, snapshot: call === 1 ? "snapshot-one" : "snapshot-two" } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  };
  await assert.rejects(() => materializeNativePublications(drifting), /changed during synchronization/);
  const repeated = {
    ...options(root),
    fetchImplementation: async (url) => new Response(JSON.stringify({ bridge_records: [record], pagination: { page: Number(new URL(url).searchParams.get("page")), pages: 2, total: 2, snapshot: "snapshot-one" } }), { status: 200, headers: { "content-type": "application/json" } }),
  };
  await assert.rejects(() => materializeNativePublications(repeated), /duplicate or invalid resource identity/);
});
