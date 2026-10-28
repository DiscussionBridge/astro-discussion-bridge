import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { deployCmsNativeBuild, stageCmsNativePublications } from "../dist/cms-pipeline.js";
import { cmsNativeReservation } from "../dist/cms-coordinator.js";
import { recordCmsNativeBuild } from "../dist/cms-static.js";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";
import { buildCmsConsumer } from "./fixtures/cms-static.mjs";
import { connection, connectionId, source, work, mapping, uuid } from "./fixtures/cms-coordinator.mjs";

test("actual static batch settles independent work receipts and fences an unreconciled owned result before a new OS command", async t => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-cms-batch-");
  const entries = [], mutations = [];
  function add(index) {
    const cooked = `<p>Complete independent source ${index}.</p>`, topicId = String(53 + index);
    const nativeSource = { ...source, source_id: `topic:${topicId}`, topic_id: topicId, topic_url: `https://forum.example/t/source/${topicId}`, title: `Independent source ${index}`,
      content_bytes: Buffer.byteLength(cooked), content_sha256: createHash("sha256").update(cooked).digest("hex") };
    const entry = { source: nativeSource, cooked, mapping: undefined, work: { ...work, work_id: uuid(100 + index), mapping_id: uuid(200 + index), source_id: nativeSource.source_id, state: "pending" } };
    entries.push(entry); return entry;
  }
  const first = add(0), second = add(1); let changes = [];
  const expires = new Date(Date.now() + 300000).toISOString();
  const options = { docsDir: path.join(root, "src/content/publications"), stateFile: path.join(root, ".discussionbridge/state.json"),
    siteUrl: "https://astro.example", serverUrl: "https://forum.example", connectionId, connectionSecret: "s".repeat(32),
    fetchImplementation: async (url, init) => {
      const endpoint = new URL(url), body = init.body && JSON.parse(init.body);
      const event = entry => ({ event_type: "publication", event_id: uuid(300 + entries.indexOf(entry)), event_sequence: String(10 + entries.indexOf(entry)), source: entry.source });
      if (endpoint.pathname.endsWith("connection.json")) return Response.json(connection);
      if (endpoint.pathname.endsWith("sources.json")) {
        const stream = endpoint.searchParams.get("stream"), items = stream === "initial" ? entries.map(event) : changes.map(event); changes = [];
        return Response.json({ stream, items, next_cursor: null, checkpoint_cursor: "Y2hlY2s" });
      }
      if (endpoint.pathname.endsWith("mappings/prepare.json")) {
        const entry = entries.find(value => value.source.source_id === body.source_id);
        entry.mapping = { ...mapping(body), mapping_id: entry.work.mapping_id, resource_id: uuid(400 + entries.indexOf(entry)), source_id: entry.source.source_id };
        return Response.json(entry.mapping, { status: 201 });
      }
      const lease = entry => ({ work: entry.work, lease_token: Buffer.alloc(32, 7 + entries.indexOf(entry)).toString("base64url"), lease_generation: 1, expires_at: expires, server_time: new Date().toISOString() });
      if (endpoint.pathname.endsWith("claim.json")) { const entry = entries.find(value => value.mapping && value.work.state === "pending"); if (!entry) return new Response(null, { status: 204 }); entry.work.state = "leased"; return Response.json(lease(entry)); }
      if (endpoint.pathname.includes("/sources/")) {
        const entry = entries.find(value => endpoint.pathname.includes(encodeURIComponent(value.source.source_id)));
        return Response.json({ source_id: entry.source.source_id, source_revision: entry.source.source_revision, content_sha256: entry.source.content_sha256, content_bytes: entry.source.content_bytes, offset: 0, next_offset: null, content_base64: Buffer.from(entry.cooked).toString("base64") });
      }
      const entry = entries.find(value => endpoint.pathname.includes(value.work.work_id));
      assert.ok(entry, endpoint.pathname);
      if (endpoint.pathname.endsWith("renew.json")) return Response.json(lease(entry));
      if (endpoint.pathname.endsWith("prepare.json")) {
        entry.work.state = "synchronized"; entry.mapping.destination_native_id = body.native_result.native_id; entry.mapping.destination_native_revision = body.native_result.native_revision;
        entry.mapping.synchronized_source_revision = entry.source.source_revision; entry.mapping.synchronized_at = body.prepared_at;
      } else if (endpoint.pathname.endsWith("fail.json")) { mutations.push({ kind: "failure", workId: entry.work.work_id, body }); entry.work.state = "attention"; entry.work.last_failure_code = body.code; }
      else if (endpoint.pathname.endsWith("finalize.json")) {
        mutations.push({ kind: "finalize", workId: entry.work.work_id, body }); entry.work.state = "verified"; entry.mapping.mapping_state = "active";
        entry.mapping.publicly_verified_source_revision = entry.source.source_revision; entry.mapping.publicly_verified_at = body.verification.checked_at;
      }
      return Response.json({ work: entry.work, mapping: entry.mapping, lease_expires_at: expires });
    } };
  const staged = await stageCmsNativePublications(options); assert.equal(staged.prepared.length, 2);
  const state = { root, options, sourceRecord: first.source }; await buildCmsConsumer(state);
  await recordCmsNativeBuild(options, path.join(root, "dist"));
  const secondHtml = await readFile(path.join(root, "dist", new URL(second.mapping.canonical_url).pathname, "index.html"), "utf8");
  const script = path.join(root, "harmless-batch-child.mjs"), witness = path.join(root, "child-count.txt");
  await writeFile(script, "import { appendFileSync } from 'node:fs'; appendFileSync(process.argv[2], 'one local command\\n');");
  const command = { executable: process.execPath, args: [script, witness], cwd: root, timeoutMs: 20_000 };
  await assert.rejects(deployCmsNativeBuild({ ...options, publicFetchImplementation: async url => new Response(url === second.mapping.canonical_url ? secondHtml : "stale unrelated public HTML", { headers: { "Content-Type": "text/html" } }) }, command), /successful independent receipts remain durable/);
  assert.equal(first.work.state, "attention"); assert.equal(second.work.state, "verified");
  assert.equal(mutations.find(value => value.kind === "failure").body.code, "public_verification_failed");
  assert.equal(mutations.find(value => value.kind === "finalize").workId, second.work.work_id);
  const journal = JSON.parse(await readFile(options.stateFile, "utf8")); assert.equal(journal.transactions[second.work.work_id].stage, "verified");
  const third = add(2); changes = [third];
  assert.deepEqual((await stageCmsNativePublications(options)).prepared, [third.work.work_id]);
  await buildCmsConsumer(state); await recordCmsNativeBuild(options, path.join(root, "dist"));
  assert.ok(cmsNativeReservation(options, third.source).file);
  await assert.rejects(deployCmsNativeBuild(options, command), /current owned result/);
  assert.equal(await readFile(witness, "utf8"), "one local command\n", "the unreconciled owned result prevented a new OS child");
  assert.equal(third.work.state, "synchronized");
});
