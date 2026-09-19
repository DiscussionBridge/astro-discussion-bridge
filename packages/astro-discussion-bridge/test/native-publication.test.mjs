import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { materializeNativePublications, migrateNativePublication } from "../dist/native-publication.js";

const record = {
  resource_id: "11111111-1111-4111-8111-111111111111", direction: "from_discourse", state: "healthy", title: "The Bridge publishes everywhere", topic_id: 53,
  content_html: "<h2>One source</h2><script>bad()</script><p>Native Astro content.</p>",
  source: { platform: "discourse", origin: "https://bridge.example", topic_id: 53, topic_url: "https://bridge.example/t/publisher/53", post_id: 149, post_number: 1, post_version: 1, revision: "post:149:version:1", updated_at: "2026-09-01T08:00:00.000Z", author: { name: "DiscussionBridge", profile_url: "https://bridge.example/u/discussionbridge" } },
  bindings: [{ role: "presentation", state: "active", canonical_url: "https://astro.example/bridge-publisher/", native_materialization: true }],
};

function options(docsDir, records = [record]) {
  return { docsDir, siteUrl: "https://astro.example/", serverUrl: "https://bridge.example/", connectionId: "dbc_0123456789abcdef01234567", connectionSecret: "s".repeat(32), fetchImplementation: async () => new Response(JSON.stringify({ bridge_records: records, pagination: { page: 1, pages: 1, total: records.length, snapshot: "snapshot-one" } }), { status: 200, headers: { "content-type": "application/json" } }) };
}

test("materializes one authorized Astro source atomically and exact retry is unchanged", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-native-"));
  await writeFile(path.join(root, "ordinary.md"), "---\ntitle: Ordinary page\n---\n\ndiscussionbridgeNativePublication: true\ndiscussionbridgeResourceId: 11111111-1111-4111-8111-111111111111\n");
  assert.deepEqual(await materializeNativePublications(options(root)), { created: 1, updated: 0, unchanged: 0, skipped: 0, failed: 0 });
  assert.deepEqual(await materializeNativePublications(options(root)), { created: 0, updated: 0, unchanged: 1, skipped: 0, failed: 0 });
  const source = await readFile(path.join(root, "bridge-publisher.md"), "utf8");
  assert.match(source, /discussionFromDiscourse: true/);
  assert.match(source, /discussionbridgeNativePublication: true/);
  assert.match(source, /discussionCommentsDisplay: interactive/);
  assert.doesNotMatch(source, /discussionCommentsDisplay: fullInteractive/);
  assert.match(source, /discussionbridgeResourceId: 11111111-1111-4111-8111-111111111111/);
  assert.match(source, /discourseTopicId: 53/);
  assert.match(source, /date: "2026-09-01T08:00:00\.000Z"/);
  assert.match(source, /Native Astro content/);
  assert.doesNotMatch(source, /<script|bad\(\)/);

  const moved = { ...record, bindings: [{ ...record.bindings[0], canonical_url: "https://astro.example/new-location/" }] };
  await assert.rejects(() => materializeNativePublications(options(root, [moved])), /explicit migration and redirect/);
  await assert.rejects(() => readFile(path.join(root, "new-location.md")), /ENOENT/);
  assert.equal(await readFile(path.join(root, "bridge-publisher.md"), "utf8"), source);

  await writeFile(path.join(root, "duplicate.md"), source);
  await assert.rejects(() => materializeNativePublications(options(root)), /resource identity is duplicated across files/);
});

test("supports an optional source path and fails an invalid authorized destination", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-native-"));
  const presentation = { ...record, bindings: [{ ...record.bindings[0], native_materialization: false }] };
  const nested = { ...record, resource_id: "22222222-2222-4222-8222-222222222222", bindings: [{ ...record.bindings[0], canonical_url: "https://astro.example/from-the-bridge/nested-page/" }] };
  const invalid = { ...record, resource_id: "33333333-3333-4333-8333-333333333333", bindings: [{ ...record.bindings[0], canonical_url: "https://astro.example/from-the-bridge/invalid_path/" }] };
  assert.deepEqual(await materializeNativePublications(options(root, [presentation, nested, invalid])), { created: 1, updated: 0, unchanged: 0, skipped: 1, failed: 1 });
  assert.match(await readFile(path.join(root, "from-the-bridge", "nested-page.md"), "utf8"), /discussionbridgeNativePublication: true/);
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

test("explicit Astro migration moves only the matching native page and writes a permanent redirect", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-migrate-"));
  const docsDir = path.join(root, "content");
  const redirectsFile = path.join(root, "public", "_redirects");
  await materializeNativePublications(options(docsDir));
  const oldFile = path.join(docsDir, "bridge-publisher.md");
  const before = await readFile(oldFile, "utf8");
  const migration = { docsDir, siteUrl: "https://astro.example/", resourceId: record.resource_id, oldUrl: "https://astro.example/bridge-publisher/", newUrl: "https://astro.example/new-location/", redirectsFile };
  const result = await migrateNativePublication(migration);
  assert.equal(result.redirectRule, "/bridge-publisher/ /new-location/ 301");
  await assert.rejects(() => readFile(oldFile), /ENOENT/);
  assert.equal(await readFile(path.join(docsDir, "new-location.md"), "utf8"), before);
  assert.equal(await readFile(redirectsFile, "utf8"), "/bridge-publisher/ /new-location/ 301\n");
  await assert.rejects(() => materializeNativePublications(options(docsDir)), /explicit migration and redirect/);
  const moved = { ...record, bindings: [{ ...record.bindings[0], canonical_url: migration.newUrl }] };
  assert.deepEqual(await materializeNativePublications(options(docsDir, [moved])), { created: 0, updated: 0, unchanged: 1, skipped: 0, failed: 0 });
  assert.equal((await migrateNativePublication(migration)).outcome, "already_current");
  const reverse = await migrateNativePublication({ ...migration, oldUrl: migration.newUrl, newUrl: migration.oldUrl });
  assert.equal(reverse.redirectRule, "/new-location/ /bridge-publisher/ 301");
  assert.equal(await readFile(oldFile, "utf8"), before);
  await assert.rejects(() => readFile(path.join(docsDir, "new-location.md")), /ENOENT/);
  assert.equal(await readFile(redirectsFile, "utf8"), "/new-location/ /bridge-publisher/ 301\n");
});

async function firstJsonLine(child) {
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return new Promise((resolve, reject) => {
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline >= 0) {
        try { resolve(JSON.parse(buffer.slice(0, newline))); }
        catch (error) { reject(error); }
      }
    });
    child.once("exit", (code) => reject(new Error(`Migration child exited ${code}: ${stderr}`)));
    child.once("error", reject);
  });
}

test("Astro publication migration recovers after hard termination at every durable boundary in both directions", async (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  t.after(() => { if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv; });
  const phases = ["prepared", "redirected", "moved"];
  for (const direction of ["forward", "reverse"]) {
    for (const phase of phases) {
      const root = await mkdtemp(path.join(os.tmpdir(), `discussionbridge-astro-hard-kill-${direction}-${phase}-`));
      t.after(() => rm(root, { recursive: true, force: true }));
      const docsDir = path.join(root, "content");
      const redirectsFile = path.join(root, "public", "_redirects");
      await materializeNativePublications(options(docsDir));
      const forward = { docsDir, siteUrl: "https://astro.example/", resourceId: record.resource_id, oldUrl: "https://astro.example/bridge-publisher/", newUrl: "https://astro.example/new-location/", redirectsFile };
      if (direction === "reverse") await migrateNativePublication(forward);
      const migration = direction === "forward" ? forward : { ...forward, oldUrl: forward.newUrl, newUrl: forward.oldUrl };
      const inputFile = path.join(root, "migration.json");
      await writeFile(inputFile, JSON.stringify(migration));
      const child = spawn(process.execPath, [fileURLToPath(new URL("../test-support/hard-kill-migration-child.mjs", import.meta.url)), inputFile], {
        env: { ...process.env, NODE_ENV: "test", DISCUSSIONBRIDGE_TEST_MIGRATION_PAUSE: phase },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const checkpoint = await firstJsonLine(child);
      assert.equal(checkpoint.phase, phase);
      const exited = once(child, "exit");
      assert.equal(child.kill("SIGKILL"), true);
      await exited;
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      assert.equal((await migrateNativePublication(migration)).outcome, "migrated");
      assert.equal((await migrateNativePublication(migration)).outcome, "already_current");
      const expectedFile = direction === "forward" ? path.join(docsDir, "new-location.md") : path.join(docsDir, "bridge-publisher.md");
      assert.match(await readFile(expectedFile, "utf8"), /discussionbridgeResourceId: 11111111-1111-4111-8111-111111111111/);
      const expectedRule = direction === "forward" ? "/bridge-publisher/ /new-location/ 301\n" : "/new-location/ /bridge-publisher/ 301\n";
      assert.equal(await readFile(redirectsFile, "utf8"), expectedRule);
      await assert.rejects(() => readFile(path.join(docsDir, ".discussionbridge-publication-url-migration.json")), /ENOENT/);
    }
  }
});

test("Astro migration refuses destination and redirect conflicts without moving content", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-migrate-conflict-"));
  const docsDir = path.join(root, "content");
  const redirectsFile = path.join(root, "public", "_redirects");
  await materializeNativePublications(options(docsDir));
  const oldFile = path.join(docsDir, "bridge-publisher.md");
  const before = await readFile(oldFile, "utf8");
  const migration = { docsDir, siteUrl: "https://astro.example/", resourceId: record.resource_id, oldUrl: "https://astro.example/bridge-publisher/", newUrl: "https://astro.example/new-location/", redirectsFile };
  await writeFile(path.join(docsDir, "new-location.md"), "another page");
  await assert.rejects(() => migrateNativePublication(migration), /destination already has content/);
  assert.equal(await readFile(oldFile, "utf8"), before);
  await rm(path.join(docsDir, "new-location.md"));
  await mkdir(path.dirname(redirectsFile), { recursive: true });
  await writeFile(redirectsFile, "/bridge-publisher/ /elsewhere/ 301\n");
  await assert.rejects(() => migrateNativePublication(migration), /redirect source conflicts/);
  await writeFile(redirectsFile, "/new-location/ /elsewhere/ 301\n");
  await assert.rejects(() => migrateNativePublication(migration), /destination has a conflicting redirect/);
  await writeFile(redirectsFile, "/bridge-publisher/ /elsewhere/ 301\n");
  assert.equal(await readFile(oldFile, "utf8"), before);
  assert.equal(await readFile(redirectsFile, "utf8"), "/bridge-publisher/ /elsewhere/ 301\n");
  await assert.rejects(() => migrateNativePublication({ ...migration, oldUrl: "https://astro.example/not-the-page/" }), /old URL does not match/);
  assert.equal(await readFile(oldFile, "utf8"), before);
});
