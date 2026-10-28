import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CmsClient, CmsRequestError } from "../dist/cms-client.js";

const uuid = index => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const connectionId = "dbc_0123456789abcdef01234567";
const secret = "s".repeat(32);
const connection = {
  connection_id: connectionId, profile: "astro", destination_origin: "https://astro.example", scope_revision: "scope-1", forum_name: "Native forum",
  directions: ["from_discourse"], publication_lane: "docs",
  policy: { policy_revision: "policy-1", enabled: true, selection: "all_public", category_ids: [], include_topic_ids: [], exclude_topic_ids: [], include_unlisted: false, publication_kind: "static", presentation_mode: "full", author_ids: [], taxonomy_ids: [] },
  native_capabilities: { native_revision: "profile-1", supported_presentations: ["simple", "full", "interactive"], publication_kind: "static", complete_content_supported: true },
};
const work = { work_id: uuid(1), mapping_id: uuid(2), source_id: "topic:53", source_revision: "revision-1", policy_revision: "policy-1", action: "publish_revision", state: "leased", attempt_cycle: uuid(3), attempt: 1, lease_generation: 1, retry_at: null, last_failure_code: null };
const lease = { work, lease_token: Buffer.alloc(32, 7).toString("base64url"), lease_generation: 1, expires_at: "2026-10-14T10:05:00.000Z", server_time: "2026-10-14T10:00:00.000Z" };
const options = fetchImplementation => ({ serverUrl: "https://forum.example/", connectionId, connectionSecret: secret, fetchImplementation });
const authority = { work_id: work.work_id, lease_token: lease.lease_token, lease_generation: 1, source_revision: "revision-1", policy_revision: "policy-1" };

test("private CMS runtime and schema remain byte-exact pinned copies", async () => {
  const provenance = JSON.parse(await readFile(new URL("../src/private/ARTIFACTS.json", import.meta.url), "utf8"));
  assert.equal(provenance.wire_version, "v4"); assert.equal(provenance.implementation_version, "0.4.0-alpha.1"); assert.equal(provenance.release_version, null);
  for (const { path, sha256, bytes } of provenance.members.filter(member => ["src/cms-schema.json", "src/cms-runtime.mjs"].includes(member.path))) {
    const actual = await readFile(new URL(`../src/private/${path.slice(4)}`, import.meta.url)); assert.equal(actual.length, bytes);
    assert.equal(createHash("sha256").update(actual).digest("hex"), sha256);
  }
});

test("CMS transport validates connection, claim and renewal without alternate protocol dispatch or credential-bearing URLs", async () => {
  const calls = [];
  const client = new CmsClient(options(async (url, init) => {
    const endpoint = new URL(url);
    calls.push(endpoint.pathname);
    assert.match(endpoint.pathname, /^\/discussion-bridge\/v4\//);
    assert.equal(endpoint.search.includes(secret), false);
    assert.equal(init.headers["X-DiscussionBridge-Connection"], connectionId);
    assert.equal(init.headers["X-DiscussionBridge-Secret"], secret);
    assert.equal(init.headers["Accept-Encoding"], "identity");
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    if (endpoint.pathname.endsWith("connection.json")) return Response.json(connection);
    if (endpoint.pathname.endsWith("claim.json")) {
      assert.deepEqual(JSON.parse(init.body), { mutation_id: uuid(4), mapping_id: uuid(2) });
      return Response.json(lease);
    }
    assert.deepEqual(JSON.parse(init.body), { mutation_id: uuid(5), authority });
    return Response.json({ ...lease, expires_at: "2026-10-14T10:06:00.000Z" });
  }));
  assert.equal((await client.connection()).forum_name, "Native forum");
  assert.equal((await client.claim(uuid(4), uuid(2))).work.mapping_id, uuid(2));
  assert.equal((await client.renew(uuid(5), authority)).lease_generation, 1);
  assert.equal(calls.length, 3);
});

test("CMS claim204 must be bodyless and input/path grammar rejects before any fetch", async () => {
  let calls = 0;
  const client = new CmsClient(options(async () => { calls++; return new Response(null, { status: 204 }); }));
  assert.equal(await client.claim(uuid(4)), undefined);
  assert.equal(calls, 1);
  await assert.rejects(client.claim("not-a-uuid"));
  await assert.rejects(client.sources("changes"));
  await assert.rejects(client.request("V4-15", { path: { work_id: uuid(9) }, body: { mutation_id: uuid(5), authority } }));
  assert.equal(calls, 1);
});

test("CMS complete source content verifies bytes/hash after UTF8 split chunks and encodes opaque path segments once", async () => {
  const bytes = Buffer.from(`<p>${"Ω".repeat(50000)}</p>`);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const source = { source_id: "native/a%", source_revision: "revision/1", topic_id: "53", topic_url: "https://forum.example/t/source/53", title: "Source", content_sha256: hash, content_bytes: bytes.length, source_created_at: null, source_updated_at: null, source_authors: [] };
  let calls = 0;
  const client = new CmsClient(options(async url => {
    calls++;
    const endpoint = new URL(url);
    assert.match(endpoint.pathname, /\/sources\/native%2Fa%25\/revisions\/revision%2F1\/content.json$/);
    const offset = Number(endpoint.searchParams.get("offset"));
    const slice = bytes.subarray(offset, offset + 32768);
    return Response.json({ source_id: source.source_id, source_revision: source.source_revision, content_sha256: hash, content_bytes: bytes.length, offset, next_offset: offset + slice.length === bytes.length ? null : offset + slice.length, content_base64: slice.toString("base64") });
  }));
  assert.equal(await client.content(source), bytes.toString("utf8"));
  assert.equal(calls, 4);
  await assert.rejects(new CmsClient(options(async () => Response.json({ source_id: source.source_id, source_revision: "wrong", content_sha256: hash, content_bytes: bytes.length, offset: 0, next_offset: 1, content_base64: "AA==" }))).content(source));
});

test("CMS strict response/origin/stream bounds reject and errors redact secrets", async () => {
  for (const response of [
    new Response('{"stream":"initial","stream":"changes"}', { headers: { "content-type": "application/json" } }),
    Response.json({ ...connection, native_capabilities: { ...connection.native_capabilities, complete_content_supported: "true" } }),
    new Response("not JSON", { headers: { "content-type": "text/html" } }),
    new Response("{}", { status: 302, headers: { "content-type": "application/json" } }),
  ]) await assert.rejects(new CmsClient(options(async () => response)).connection(), error => !error.message.includes(secret));
  const wrongOrigin = Response.json(connection);
  Object.defineProperty(wrongOrigin, "url", { value: "https://other.example/" });
  await assert.rejects(new CmsClient(options(async () => wrongOrigin)).connection());
  let cancelled = false;
  const oversized = new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(262145)); }, cancel() { cancelled = true; } }), { headers: { "content-type": "application/json" } });
  await assert.rejects(new CmsClient(options(async () => oversized)).connection());
  assert.equal(cancelled, true);
  await assert.rejects(new CmsClient(options(async () => { throw new Error(secret); })).connection(), error => !error.message.includes(secret));
  await assert.rejects(new CmsClient(options(async () => Response.json({ outcome: "rejected", code: "scope_denied", retryable: false, retry_after_seconds: null, correlation_id: null, core_fallback: false }, { status: 403 }))).connection(), error => error instanceof CmsRequestError && error.code === "scope_denied" && error.retryable === false);
});
