import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { CmsClient } from "../dist/cms-client.js";
import { publishControlledDiscussions } from "../dist/controlled-creation.js";
import { qualifyCurrentToAuthorities, qualifyCurrentToAuthority } from "../dist/cms-to-authority.js";
import { readPublicationOperationalState, writePublicationOperationalState } from "../dist/operational-state.js";
import { withNativeSourceWriter } from "../dist/native-locks.js";
import { validateCmsRoute } from "../src/private/cms-runtime.mjs";
import { toFixture, nativeSource } from "./fixtures/cms-to.mjs";
import { uuid } from "./fixtures/cms-coordinator.mjs";

async function batchFixture(t, owners = 8, files = 12) {
  const fixture = await toFixture(t), original = fixture.options.controlledCreation.fetchImplementation;
  for (let i = 1; i < owners; i++) await fs.writeFile(path.join(fixture.docsDir, `source-${i}.md`), nativeSource(`Meaningful source ${i}.`));
  for (let i = owners; i < files; i++) await fs.writeFile(path.join(fixture.docsDir, `inactive-${i}.md`), nativeSource(`Inactive source ${i}.`).replace("discussionSync: true", "discussionSync: false"));
  const records = new Map(), externals = new Map(), mutations = new Map();
  const calls = { resolves: 0, records: 0, onRecord: undefined };
  fixture.options.controlledCreation.fetchImplementation = async (value, init) => {
    const url = new URL(value);
    if (url.pathname.endsWith("connection.json")) return original(value, init);
    if (url.pathname.endsWith("resolve.json")) {
      calls.resolves++; const body = JSON.parse(init.body); validateCmsRoute("V4-02", { body });
      const replay = mutations.get(body.mutation_id); if (replay) { assert.deepEqual(body, replay.body); return Response.json(replay.result, { status: replay.result.outcome === "created" ? 201 : 200 }); }
      const source = body.bridge_record, prior = externals.get(source.external_id);
      assert.equal(source.expected_source_revision, prior?.source_revision ?? null);
      const resource = prior?.resource_id ?? uuid(records.size + 100), topic = prior?.topic_id ?? String(records.size + 2000);
      const record = { resource_id: resource, topic_id: topic, topic_url: `https://forum.example/t/native/${topic}`, direction: "to_discourse", state: "active",
        external_id: source.external_id, canonical_url: source.canonical_url, source_revision: source.source_revision,
        source_created_at: source.source_created_at, source_updated_at: source.source_updated_at, synchronized_at: new Date().toISOString(), mapping_id: null };
      const outcome = !prior ? "created" : prior.source_revision === source.source_revision ? "resolved" : "updated";
      const result = { outcome, reason: outcome === "created" ? "record_created" : outcome === "updated" ? "source_revision_updated" : "already_resolved",
        resource_id: resource, topic_id: topic, topic_url: record.topic_url, direction: "to_discourse", source_revision: record.source_revision, synchronized_at: record.synchronized_at, core_fallback: false };
      records.set(resource, record); externals.set(source.external_id, record); mutations.set(body.mutation_id, { body: structuredClone(body), result });
      return Response.json(result, { status: outcome === "created" ? 201 : 200 });
    }
    const resource = /\/bridge-records\/([^/]+)\.json$/u.exec(url.pathname)?.[1]; assert.ok(records.has(resource));
    calls.records++; await calls.onRecord?.(resource, calls.records); return Response.json(records.get(resource));
  };
  await publishControlledDiscussions(fixture.options); assert.equal(records.size, owners);
  calls.resolves = 0; calls.records = 0;
  fixture.connection.scope_revision = "b".repeat(64);
  return { ...fixture, records, calls, owners, files };
}
async function qualify(s, afterSave, targeted = false) {
  return withNativeSourceWriter(s.docsDir, s.options.stateFile, async () => {
    const state = await readPublicationOperationalState(s.options.stateFile), client = new CmsClient({ serverUrl: s.options.discourseUrl, ...s.options.controlledCreation });
    const connection = await client.connection();
    const operations = Object.values(state.operations);
    await (targeted ? qualifyCurrentToAuthority : qualifyCurrentToAuthorities)(s.options, state, targeted ? operations[0] : operations, client, connection, async () => {
      await writePublicationOperationalState(s.options.stateFile, state); await afterSave?.();
    });
  });
}
/** Observe real filesystem calls in this test process only; do not substitute IO. */
async function measure(s, action) {
  const counts = { markdownReads: 0, corpusEnumerations: 0 }, open = fs.open, readdir = fs.readdir;
  fs.open = function(file, ...args) { if (typeof file === "string" && file.startsWith(s.docsDir + path.sep) && file.endsWith(".md")) counts.markdownReads++; return open.call(this, file, ...args); };
  fs.readdir = function(file, ...args) { if (file === s.docsDir) counts.corpusEnumerations++; return readdir.call(this, file, ...args); };
  syncBuiltinESMExports();
  try { await action(); return counts; } finally { fs.open = open; fs.readdir = readdir; syncBuiltinESMExports(); }
}

test("one actual multi-owner qualification batch reads the corpus three times, independent of owner count", async t => {
  for (const [owners, files] of [[3, 7], [12, 20]]) await t.test(`${owners} owners / ${files} files`, async child => {
    const s = await batchFixture(child, owners, files), before = await s.journal();
    const counts = await measure(s, () => qualify(s));
    assert.equal(counts.markdownReads, 3 * files); assert.equal(counts.corpusEnumerations, 6, "two complete-list checks per fresh proof phase, not per owner");
    assert.equal(s.calls.records, 3 * owners); assert.equal(s.calls.resolves, 0, "qualification is not publication or an edition");
    const after = await s.journal();
    for (const [id, operation] of Object.entries(after.operations)) {
      assert.equal(operation.to.qualifications.length, 1); assert.deepEqual(operation.to.scope, before.operations[id].to.scope);
      assert.deepEqual(operation.to.receipts, before.operations[id].to.receipts); assert.equal(operation.resourceId, before.operations[id].resourceId);
    }
    console.log(JSON.stringify({ authorityBatchOperationCounts: true, owners, files, ...counts, recordReads: s.calls.records, latencyBenchmark: false }));
  });
});

test("ordinary multi-owner publisher uses the batch, not a per-owner corpus observation loop", async t => {
  const s = await batchFixture(t, 12, 20);
  const counts = await measure(s, () => publishControlledDiscussions(s.options));
  assert.equal(counts.corpusEnumerations, 8, "ordinary census checks plus three shared proof phases");
  assert.equal(s.records.size, 12); assert.equal(s.calls.resolves, 12);
  for (const operation of Object.values((await s.journal()).operations)) assert.equal(operation.to.qualifications.length, 1);
});

test("read-only topic references do not become duplicate To publication owners", async t => {
  for (const mode of ["simple", "full", "interactive"]) for (const optIn of [false, undefined]) await t.test(`${mode} / opt-in ${optIn}`, async child => {
    const s = await batchFixture(child, 1, 1), before = await s.journal(), first = Object.values(before.operations)[0];
    let reference = nativeSource("Another presentation of the same discussion.", `discourseTopicId: "${first.topicId}"\ndiscourseTopicUrl: ${first.topicUrl}\n`)
      .replace("discussionCommentsDisplay: interactive", `discussionCommentsDisplay: ${mode}`);
    reference = optIn === false ? reference.replace("discussionSync: true", "discussionSync: false") : reference.replace("discussionSync: true\n", "");
    const file = path.join(s.docsDir, "comments-reference.md"); await fs.writeFile(file, reference);
    const source = await fs.readFile(s.file, "utf8");
    await qualify(s);
    const after = await s.journal(), current = after.operations[first.externalId];
    assert.equal(current.to.qualifications.length, 1); assert.deepEqual(current.to.scope, first.to.scope);
    assert.deepEqual(current.to.receipts, first.to.receipts); assert.equal(current.to.acceptedRevision, first.to.acceptedRevision);
    assert.equal(current.resourceId, first.resourceId); assert.equal(current.topicId, first.topicId); assert.equal(s.calls.resolves, 0);
    assert.equal(await fs.readFile(file, "utf8"), reference); assert.equal(await fs.readFile(s.file, "utf8"), source);
    await publishControlledDiscussions(s.options);
    assert.equal(s.records.size, 1); assert.equal(Object.keys((await s.journal()).operations).length, 1);
    assert.equal((await s.journal()).operations[first.externalId].to.qualifications.length, 1);
  });
});

test("batch, targeted wrapper and ordinary publisher retain mixed-mode references and three corpus observations", async t => {
  for (const entry of ["batch", "targeted", "publisher"]) await t.test(entry, async child => {
    const targeted = entry === "targeted";
    const s = await batchFixture(child, targeted ? 1 : 3, 7), before = await s.journal(), first = Object.values(before.operations)[0];
    for (const mode of ["simple", "full"]) await fs.writeFile(path.join(s.docsDir, `${mode}.md`), nativeSource("Read-only shared comments.", `discourseTopicId: ${first.topicId}\n`)
      .replace("discussionSync: true", "discussionSync: false").replace("discussionCommentsDisplay: interactive", `discussionCommentsDisplay: ${mode}`));
    const counts = await measure(s, () => entry === "publisher" ? publishControlledDiscussions(s.options) : qualify(s, undefined, targeted));
    if (entry !== "publisher") assert.equal(counts.markdownReads, 27, "one complete nine-file observation per proof phase, including both references");
    assert.equal(counts.corpusEnumerations, entry === "publisher" ? 8 : 6, "ordinary publication adds its normal census, not per-owner whole-corpus observations");
    const current = (await s.journal()).operations[first.externalId];
    assert.equal(current.to.qualifications.length, 1); assert.deepEqual(current.to.scope, first.to.scope);
    for (const [id, receipt] of Object.entries(first.to.receipts)) assert.deepEqual(current.to.receipts[id], receipt);
    assert.equal(current.resourceId, first.resourceId); assert.equal(current.topicId, first.topicId); assert.equal(current.to.acceptedRevision, first.to.acceptedRevision);
    assert.equal(s.records.size, targeted ? 1 : 3);
  });
});

test("disabled or incomplete publishing-owner metadata still claims its topic identity", async t => {
  for (const kind of ["enabled", "draft-enabled", "external", "resource", "revision", "malformed-owner", "full-copy-disabled"]) await t.test(kind, async child => {
    const s = await batchFixture(child, 1, 1), first = Object.values((await s.journal()).operations)[0];
    let reference = nativeSource("Not a plain comments reference.", `discourseTopicId: "${first.topicId}"\ndiscourseTopicUrl: ${first.topicUrl}\n`);
    if (kind !== "enabled" && kind !== "draft-enabled") reference = reference.replace("discussionSync: true", "discussionSync: false");
    const extra = { "draft-enabled": "draft: true", external: `discussionbridgeExternalId: ${first.externalId}`, resource: `discussionbridgeResourceId: ${first.resourceId}`,
      revision: `discussionbridgeSourcePublicationRevision: ${first.to.acceptedRevision}`, "malformed-owner": "discussionbridgeExternalId: null" }[kind];
    if (extra) reference = reference.replace("---\nNot a plain", `${extra}\n---\nNot a plain`);
    if (kind === "full-copy-disabled") reference = (await fs.readFile(s.file, "utf8")).replace("discussionSync: true", "discussionSync: false");
    await fs.writeFile(path.join(s.docsDir, "second-owner.md"), reference);
    const retained = await fs.readFile(s.options.stateFile, "utf8");
    await assert.rejects(qualify(s), /another claimant/);
    assert.equal(await fs.readFile(s.options.stateFile, "utf8"), retained); assert.equal(s.calls.resolves, 0);
  });
});

test("a comments reference becoming a publishing owner during qualification is rejected", async t => {
  for (const phase of ["before-save", "after-save"]) await t.test(phase, async child => {
    const s = await batchFixture(child, 1, 1), first = Object.values((await s.journal()).operations)[0];
    const file = path.join(s.docsDir, "comments-reference.md"), reference = nativeSource("Shared topic reference.", `discourseTopicId: "${first.topicId}"\ndiscourseTopicUrl: ${first.topicUrl}\n`).replace("discussionSync: true", "discussionSync: false");
    await fs.writeFile(file, reference);
    const change = () => fs.writeFile(file, reference.replace("discussionSync: false", "discussionSync: true"));
    if (phase === "before-save") s.calls.onRecord = async (_resource, count) => { if (count === 1) await change(); };
    await assert.rejects(qualify(s, phase === "after-save" ? change : undefined), /census identity changed|another claimant/);
    const current = (await s.journal()).operations[first.externalId];
    assert.equal(current.to.qualifications?.length ?? 0, phase === "after-save" ? 1 : 0);
    assert.deepEqual(current.to.receipts, first.to.receipts); assert.equal(s.calls.resolves, 0);
  });
});

test("multi-owner batch preserves duplicate, target, descriptor and Record race checks without partial publication", async t => {
  for (const kind of ["duplicate", "target", "descriptor", "record"]) await t.test(kind, async child => {
    const s = await batchFixture(child), before = await s.journal(), first = Object.values(before.operations)[0];
    s.calls.onRecord = async (_resource, count) => {
      if (count !== s.owners) return;
      if (kind === "duplicate") await fs.writeFile(path.join(s.docsDir, `inactive-${s.owners}.md`), nativeSource("Inactive copied identity.", `discussionbridgeExternalId: ${first.externalId}\n`).replace("discussionSync: true", "discussionSync: false"));
      if (kind === "target") await fs.appendFile(path.join(s.docsDir, first.to.nativeSource.relativePath), "Concurrent native edit.\n");
      if (kind === "descriptor") s.connection.scope_revision = "c".repeat(64);
      if (kind === "record") s.records.get(first.resourceId).source_revision = "unknown-current-edition";
    };
    await assert.rejects(qualify(s)); assert.equal(s.calls.resolves, 0);
    for (const operation of Object.values((await s.journal()).operations)) assert.equal(operation.to.qualifications, undefined);
  });
});

test("post-save multi-owner native race stops use but retains exact historical proof and receipts", async t => {
  const s = await batchFixture(t), before = await s.journal(), first = Object.values(before.operations)[0];
  await assert.rejects(qualify(s, () => fs.appendFile(path.join(s.docsDir, first.to.nativeSource.relativePath), "Concurrent post-save edit.\n")), /after durable qualification/);
  const after = await s.journal(); assert.equal(s.calls.resolves, 0);
  for (const [id, operation] of Object.entries(after.operations)) {
    assert.equal(operation.to.qualifications.length, 1); assert.deepEqual(operation.to.receipts, before.operations[id].to.receipts);
    assert.equal(operation.to.acceptedRevision, before.operations[id].to.acceptedRevision);
  }
});
