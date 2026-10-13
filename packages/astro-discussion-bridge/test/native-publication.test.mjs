import assert from "node:assert/strict";
import { mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { materializeNativePublications } from "../dist/native-publication.js";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";

const record = {
  resource_id: "11111111-1111-4111-8111-111111111111", direction: "from_discourse", state: "healthy", title: "The Bridge publishes everywhere", topic_id: 53,
  content_html: "<h2>One source</h2><script>bad()</script><p>Native Astro content.</p>",
  source: { platform: "discourse", origin: "https://bridge.example", topic_id: 53, topic_url: "https://bridge.example/t/publisher/53", post_id: 149, post_number: 1, post_version: 1, revision: "post:149:version:1", updated_at: "2026-09-01T08:00:00.000Z", author: { name: "DiscussionBridge", profile_url: "https://bridge.example/u/discussionbridge" } },
  bindings: [{ role: "presentation", state: "active", canonical_url: "https://astro.example/comments/bridge-publisher/", native_materialization: true }],
};

function options(docsDir, records = [record]) {
  return { docsDir, siteUrl: "https://astro.example/", serverUrl: "https://bridge.example/", connectionId: "dbc_0123456789abcdef01234567", connectionSecret: "s".repeat(32), fetchImplementation: async () => new Response(JSON.stringify({ bridge_records: records, pagination: { page: 1, pages: 1, total: records.length, snapshot: "snapshot-one" } }), { status: 200, headers: { "content-type": "application/json" } }) };
}

test("materializes one authorized Astro source atomically and exact retry is unchanged", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-native-");
  assert.deepEqual(await materializeNativePublications(options(root)), { created: 1, updated: 0, unchanged: 0, skipped: 0, failed: 0 });
  assert.deepEqual(await materializeNativePublications(options(root)), { created: 0, updated: 0, unchanged: 1, skipped: 0, failed: 0 });
  const source = await readFile(path.join(root, "comments", "bridge-publisher.md"), "utf8");
  assert.match(source, /discussionFromDiscourse: true/);
  assert.match(source, /discussionbridgeNativePublication: true/);
  assert.match(source, /discussionCommentsDisplay: interactive/);
  assert.doesNotMatch(source, /discussionCommentsDisplay: fullInteractive/);
  assert.match(source, /discussionbridgeResourceId: 11111111-1111-4111-8111-111111111111/);
  assert.match(source, /discourseTopicId: 53/);
  assert.doesNotMatch(source, /^date:/mu);
  assert.match(source, /discussionbridgeSourceUpdatedAt: /);
  assert.match(source, /Native Astro content/);
  assert.doesNotMatch(source, /<script|bad\(\)/);
});

test("skips presentation-only records and fails an authorized destination escape", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-native-");
  const presentation = { ...record, bindings: [{ ...record.bindings[0], native_materialization: false }] };
  const escaped = { ...record, resource_id: "22222222-2222-4222-8222-222222222222", bindings: [{ ...record.bindings[0], canonical_url: "https://astro.example/outside/bridge-publisher/" }] };
  assert.deepEqual(await materializeNativePublications(options(root, [presentation, escaped])), { created: 0, updated: 0, unchanged: 0, skipped: 1, failed: 1 });
});

for (const [name, contents] of [
  ["empty existing page", ""],
  ["resource marker in an unrelated body", `---\ntitle: Human-owned page\n---\n\ndiscussionbridgeResourceId: ${record.resource_id}\n`],
]) {
  test(`preserves an unowned first-publication target: ${name}`, async (t) => {
    const root = await ownedTempFixture(t, "discussionbridge-astro-native-");
    const file = path.join(root, "comments", "bridge-publisher.md");
    await mkdir(path.dirname(file));
    await writeFile(file, contents);
    assert.deepEqual(await materializeNativePublications(options(root)), { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 1 });
    assert.equal(await readFile(file, "utf8"), contents);
  });
}

test("refuses a linked publication directory and preserves its target", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-native-");
  const target = path.join(root, "unrelated");
  await mkdir(target);
  const sentinel = path.join(target, "sentinel.txt");
  await writeFile(sentinel, "Human-owned target\n");
  try {
    await symlink(target, path.join(root, "comments"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") return t.skip("Directory links are unavailable on this host.");
    throw error;
  }
  await assert.rejects(materializeNativePublications(options(root)), /unlinked directory/);
  assert.equal(await readFile(sentinel, "utf8"), "Human-owned target\n");
  assert.deepEqual(await readdir(target), ["sentinel.txt"]);
});

test("updates its owned page while preserving a configured route base", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-native-");
  const routed = { ...record, bindings: [{ ...record.bindings[0], canonical_url: "https://astro.example/articles/bridge-publisher/" }] };
  const initial = { ...options(root, [routed]), routeBase: "articles" };
  assert.equal((await materializeNativePublications(initial)).created, 1);
  const changed = { ...routed, content_html: "<p>Updated native content.</p>", source: { ...routed.source, post_version: 2, revision: "post:149:version:2", updated_at: "2026-09-02T08:00:00.000Z" } };
  assert.equal((await materializeNativePublications({ ...options(root, [changed]), routeBase: "articles" })).updated, 1);
  const contents = await readFile(path.join(root, "articles", "bridge-publisher.md"), "utf8");
  assert.match(contents, /Updated native content/);
  assert.match(contents, /discussionbridgeSourceRevision: post:149:version:2/);
  assert.match(contents, /discussionCommentsDisplay: interactive/);
});

test("fails closed when a paginated publication feed drifts or repeats an identity", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-feed-");
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

test("source author punctuation and HTML remain literal in the generated Markdown page", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-author-");
  const author = '<img src=x onerror="bad()"> [click](https://attacker.example/) **admin** & Alice';
  const hostile = { ...record, source: { ...record.source, author: { ...record.source.author, name: author } } };
  assert.equal((await materializeNativePublications(options(root, [hostile]))).created, 1);
  const contents = await readFile(path.join(root, "comments", "bridge-publisher.md"), "utf8");
  const body = contents.slice(contents.indexOf("\n---\n", 4) + 5);
  const processor = await createMarkdownProcessor();
  const { code } = await processor.render(body);
  assert.match(code, /(?:&lt;|&#x3C;)img src=x onerror=/);
  assert.match(code, /\[click\]\(https:\/\/attacker.example\/\)/);
  assert.doesNotMatch(code, /<img src=x|href="https:\/\/attacker.example|<strong>admin/);
});

test("rejects a mismatched source topic identity without creating a page", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-identity-");
  for (const topic_url of ["https://bridge.example/t/publisher/999", "https://bridge.example/t/publisher/53/2", "https://bridge.example/t/publisher%2fother/53"]) {
    const wrong = { ...record, source: { ...record.source, topic_url } };
    assert.equal((await materializeNativePublications(options(root, [wrong]))).failed, 1);
  }
  assert.deepEqual(await readdir(root), []);
});

test("bounded streaming cancels oversized and declared-oversized responses before text allocation", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-bounds-");
  for (const declared of [null, "2097153", "invalid"]) {
    let cancelled = false;
    let pulls = 0;
    const response = new Response(new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(1048577)); },
      cancel() { cancelled = true; },
    }), { headers: { "content-type": "application/json", ...(declared ? { "content-length": declared } : {}) } });
    response.text = () => { throw new Error("Unbounded text allocation"); };
    const bounded = { ...options(root), fetchImplementation: async (_, init) => { assert.ok(init.signal instanceof AbortSignal); return response; } };
    await assert.rejects(() => materializeNativePublications(bounded), /too large/);
    assert.equal(cancelled, true);
    assert.ok(pulls <= (declared ? 1 : 3));
  }
});

function chunkedOptions(root, body, changes = {}) {
  const bytes = Buffer.from(body);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const edition = createHash("sha256").update(`edition:${body}`).digest("hex");
  const publication = { ...structuredClone(record), ...changes, content_html: null };
  publication.source = { ...publication.source, status: "active", edition, created_at: "2026-08-01T10:00:00+02:00", updated_at: "2026-09-02T08:00:00.000Z", forum_name: 'Forum <safe> & "name"', content: { bytes: bytes.length, sha256, path: `/discussion-bridge/v1/bridge-records/${publication.resource_id}/content.json`, chunk_bytes: 32768 } };
  let contentCalls = 0;
  const configured = { ...options(root), fetchImplementation: async (url) => {
    const request = new URL(url);
    let data;
    if (request.pathname.endsWith("/content.json")) {
      contentCalls++;
      assert.equal(request.searchParams.get("edition"), edition);
      const offset = Number(request.searchParams.get("offset"));
      const chunk = bytes.subarray(offset, offset + 32768);
      const next = offset + chunk.length;
      data = { resource_id: publication.resource_id, edition, offset, total_bytes: bytes.length, content_sha256: sha256, chunk_base64: chunk.toString("base64"), next_offset: next === bytes.length ? null : next };
    } else {
      assert.equal(request.searchParams.get("publication_contract"), "0.3.0-alpha.1");
      data = request.pathname.endsWith(`/${publication.resource_id}.json`) ? { bridge_record: publication } : { bridge_records: [publication], pagination: { page: 1, pages: 1, total: 1, snapshot: "chunked" } };
    }
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  } };
  return { configured, publication, get contentCalls() { return contentCalls; } };
}

test("complete chunked content, authoritative dates/name and selected mode survive retries and operator updates", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-chunks-");
  const first = chunkedOptions(root, `<p>${"Ω".repeat(50000)} Complete ending</p>`);
  first.publication.bindings[0].presentation_mode = "full";
  assert.equal((await materializeNativePublications(first.configured)).created, 1);
  const file = path.join(root, "comments", "bridge-publisher.md");
  const source = await readFile(file, "utf8");
  assert.match(source, /Complete ending/);
  assert.match(source, /date: "2026-08-01T10:00:00\+02:00"/);
  assert.match(source, /discussionCommentsDisplay: full/);
  assert.match(source, /Forum &lt;safe&gt; &amp; &quot;name&quot;/);
  const calls = first.contentCalls;
  assert.equal((await materializeNativePublications(first.configured)).unchanged, 1);
  assert.equal(first.contentCalls, calls, "unchanged editions do not fetch content chunks");
  await writeFile(file, source.replace("discussionCommentsDisplay: full", "discussionCommentsDisplay: simple\noperatorNote: keep me"));
  const changed = chunkedOptions(root, "<p>New edition</p>");
  changed.publication.bindings[0].presentation_mode = "interactive";
  assert.equal((await materializeNativePublications(changed.configured)).updated, 1);
  const updated = await readFile(file, "utf8");
  assert.match(updated, /discussionCommentsDisplay: simple/);
  assert.match(updated, /operatorNote: keep me/);
});

test("invalid chunks never replace an owned page and changed editions refresh at most three times", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-chunks-");
  const initial = chunkedOptions(root, "<p>Keep this edition</p>");
  await materializeNativePublications(initial.configured);
  const file = path.join(root, "comments", "bridge-publisher.md");
  const prior = await readFile(file, "utf8");
  for (const mutation of [data => ({ ...data, offset: 999 }), data => ({ ...data, next_offset: 1 }), data => ({ ...data, chunk_base64: "!!!!" }), data => ({ ...data, content_sha256: "a".repeat(64) })]) {
    const changed = chunkedOptions(root, "<p>New source</p>");
    const fetchImplementation = async (url, init) => {
      const response = await changed.configured.fetchImplementation(url, init);
      const data = await response.json();
      return new Response(JSON.stringify(new URL(url).pathname.endsWith("/content.json") ? mutation(data) : data), { headers: { "content-type": "application/json" } });
    };
    assert.equal((await materializeNativePublications({ ...changed.configured, fetchImplementation })).failed, 1);
    assert.equal(await readFile(file, "utf8"), prior);
  }
  const changed = chunkedOptions(root, "<p>Newest source</p>");
  let attempts = 0;
  const fetchImplementation = async (url, init) => {
    if (new URL(url).pathname.endsWith("/content.json")) {
      attempts++;
      return new Response(JSON.stringify({ reason: "source_changed" }), { status: 409, headers: { "content-type": "application/json" } });
    }
    return changed.configured.fetchImplementation(url, init);
  };
  assert.equal((await materializeNativePublications({ ...changed.configured, fetchImplementation })).failed, 1);
  assert.equal(attempts, 3);
  assert.equal(await readFile(file, "utf8"), prior);
});

test("withdrawal drafts only an exactly owned page and restoration preserves identity and prior choice", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-withdraw-");
  const initial = chunkedOptions(root, "<p>Private recovery content</p>");
  await materializeNativePublications(initial.configured);
  const file = path.join(root, "comments", "bridge-publisher.md");
  const withdrawn = { ...record, title: "Source publication withdrawn", content_html: null, source: { status: "withdrawn", reason: "source_unavailable", edition: "a".repeat(64) } };
  assert.equal((await materializeNativePublications(options(root, [withdrawn]))).updated, 1);
  const hidden = await readFile(file, "utf8");
  assert.match(hidden, /draft: true/);
  assert.match(hidden, /Private recovery content/);
  const restored = chunkedOptions(root, "<p>Restored public edition</p>");
  assert.equal((await materializeNativePublications(restored.configured)).updated, 1);
  const source = await readFile(file, "utf8");
  const fields = parseYaml(/^---\n([\s\S]*?)\n---/u.exec(source)[1]);
  assert.equal(Object.hasOwn(fields, "draft"), false);
  assert.equal(fields.discussionbridgeResourceId, record.resource_id);
  assert.equal(fields.discourseTopicId, 53);
  assert.match(source, /Restored public edition/);
});

test("deadline aborts a stalled response body and cancels its reader", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-timeout-");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let cancelled = false;
  let ready;
  const started = new Promise((resolve) => { ready = resolve; });
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-type": "application/json" } });
  const pending = materializeNativePublications({ ...options(root), fetchImplementation: async () => { ready(); return response; } });
  await started;
  await Promise.resolve();
  t.mock.timers.tick(15_000);
  await assert.rejects(pending, /timed out/);
  assert.equal(cancelled, true);
});

test("native resource census rejects duplicate ownership and URL drift before a second file can be created", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-census-");
  await materializeNativePublications(options(root));
  const file = path.join(root, "comments", "bridge-publisher.md");
  const original = await readFile(file, "utf8");
  const moved = { ...record, bindings: [{ ...record.bindings[0], canonical_url: "https://astro.example/comments/moved-source/" }] };
  assert.equal((await materializeNativePublications(options(root, [moved]))).failed, 1);
  assert.deepEqual(await readdir(path.dirname(file)), ["bridge-publisher.md"]);
  const duplicate = path.join(path.dirname(file), "duplicate.md");
  await writeFile(duplicate, original);
  assert.equal((await materializeNativePublications(options(root))).failed, 1);
  assert.equal(await readFile(file, "utf8"), original);
  assert.equal(await readFile(duplicate, "utf8"), original);
});

test("source updates preserve a locally edited body and an unproved inherited body", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-managed-");
  const initial = chunkedOptions(root, "<p>Source-owned body</p>");
  await materializeNativePublications(initial.configured);
  const file = path.join(root, "comments", "bridge-publisher.md");
  const source = await readFile(file, "utf8");
  const updated = chunkedOptions(root, "<p>New source edition</p>");
  for (const operatorSource of [source + "\nOperator-created appendix.\n", source.replace(/^discussionbridgeNativeBodySha256:.*\n/mu, ""), source.replace(/^title:.*$/mu, "title: Operator-created title")]) {
    await writeFile(file, operatorSource);
    assert.equal((await materializeNativePublications(initial.configured)).failed, 1, "unchanged edition does not certify locally altered content");
    assert.equal((await materializeNativePublications(updated.configured)).failed, 1);
    assert.equal(await readFile(file, "utf8"), operatorSource);
  }
});

test("simultaneous materializers cannot enter one native publication namespace", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-lock-");
  let releaseFeed;
  let started;
  const feedStarted = new Promise((resolve) => { started = resolve; });
  const heldFeed = new Promise((resolve) => { releaseFeed = resolve; });
  const configured = options(root);
  const pending = materializeNativePublications({ ...configured, fetchImplementation: async (...args) => { started(); await heldFeed; return configured.fetchImplementation(...args); } });
  await feedStarted;
  try { await assert.rejects(materializeNativePublications(options(root)), { code: "ELOCKED" }); }
  finally { releaseFeed(); }
  assert.equal((await pending).created, 1);
});
