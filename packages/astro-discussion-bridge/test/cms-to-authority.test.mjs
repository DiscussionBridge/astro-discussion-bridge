import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { publishControlledDiscussions, withdrawControlledSource, stageControlledSourceRetry } from "../dist/controlled-creation.js";
import { readPublicationOperationalState } from "../dist/operational-state.js";
import { effectiveToScope } from "../dist/cms-to-authority.js";
import { toFixture, nativeSource } from "./fixtures/cms-to.mjs";
import { buildToConsumer } from "./fixtures/native-to-consumer.mjs";

const op = async s => Object.values((await s.journal()).operations)[0];
const drift = (s, revision = "b".repeat(64)) => { s.connection.scope_revision = revision; };

test("normal From-policy scope drift automatically qualifies the same To owner without changing its historical provenance or native marker", async t => {
  const s = await toFixture(t); await buildToConsumer(s, undefined, true, true);
  const before = await op(s), file = await readFile(s.file, "utf8"), record = structuredClone(s.state.record);
  drift(s); await buildToConsumer(s, undefined, true, true);
  const after = await op(s);
  assert.equal(s.connection.policy.enabled, false, "From enablement is not a prerequisite for To authority");
  assert.deepEqual(after.to.scope, before.to.scope); assert.equal(effectiveToScope(after.to).scopeRevision, s.connection.scope_revision);
  assert.equal(after.to.qualifications.length, 1); assert.deepEqual(after.to.qualifications[0].nativeCapture, before.to.nativeCapture);
  assert.equal(after.to.nativeCapture.ownershipSha256, before.to.nativeCapture.ownershipSha256);
  assert.deepEqual(after.to.nativeCapture.ownership, before.to.nativeCapture.ownership);
  assert.equal(await readFile(s.file, "utf8"), file); assert.equal(after.to.acceptedRevision, before.to.acceptedRevision);
  for (const [id, receipt] of Object.entries(before.to.receipts)) assert.deepEqual(after.to.receipts[id], receipt);
  for (const key of ["resourceId", "topicId", "topicUrl", "externalId", "canonicalUrl"]) assert.equal(after[key], before[key]);
  for (const key of ["resource_id", "topic_id", "source_revision", "source_created_at", "source_updated_at"]) assert.equal(s.state.record[key], record[key]);
  assert.equal(s.state.creations, 1);
  await buildToConsumer(s, undefined, true, true); assert.equal((await op(s)).to.qualifications.length, 1, "restart/current scope does not append/reuse another grant");
});

test("qualification history survives a real later edition and A→B→A requires fresh linear evidence", async t => {
  const s = await toFixture(t); await publishControlledDiscussions(s.options); const originalScope = s.connection.scope_revision;
  drift(s); await publishControlledDiscussions(s.options); const first = structuredClone((await op(s)).to.qualifications[0]);
  await writeFile(s.file, (await readFile(s.file, "utf8")).replace("Native body.", "An actual new content edition."));
  await publishControlledDiscussions(s.options); await readPublicationOperationalState(s.options.stateFile);
  drift(s, originalScope); await publishControlledDiscussions(s.options); const current = await op(s);
  assert.deepEqual(current.to.qualifications[0], first); assert.equal(current.to.qualifications.length, 2);
  assert.equal(current.to.qualifications[1].parent, first.sha256); assert.notEqual(current.to.qualifications[1].sha256, first.sha256);
  assert.equal(current.to.qualifications[1].record.source_revision, current.to.acceptedRevision); assert.equal(s.state.creations, 1);
});

test("lost initial02 and lost update02 keep exact bytes/UUID and native intent across fresh current qualification", async t => {
  for (const update of [false, true]) await t.test(update ? "update" : "initial", async child => {
    const s = await toFixture(child); if (update) { await publishControlledDiscussions(s.options); await writeFile(s.file, (await readFile(s.file, "utf8")).replace("Native body.", "Edition B.")); }
    s.state.lostResponse = true; await assert.rejects(publishControlledDiscussions(s.options));
    const pending = structuredClone((await op(s)).to.pending), bytes = s.rawBodies.at(-1); assert.ok(pending.native);
    drift(s); await publishControlledDiscussions(s.options);
    assert.equal(s.rawBodies.at(-1), bytes); assert.deepEqual(s.received.at(-1), pending.body); assert.equal(s.state.creations, 1);
    assert.equal((await op(s)).to.qualifications.length, 1); assert.equal((await op(s)).to.pending, undefined);
  });
});

test("an old unbound uncertain request without pre-dispatch native provenance is not retroactively adopted", async t => {
  const s = await toFixture(t); s.state.lostResponse = true; await assert.rejects(publishControlledDiscussions(s.options));
  const journal = await s.journal(); delete Object.values(journal.operations)[0].to.pending.native; await writeFile(s.options.stateFile, JSON.stringify(journal));
  const retained = await readFile(s.options.stateFile, "utf8"), calls = s.received.length; drift(s);
  await assert.rejects(publishControlledDiscussions(s.options), /durable original native ownership/);
  assert.equal(await readFile(s.options.stateFile, "utf8"), retained); assert.equal(s.received.length, calls);
});

test("scope changes caused by the accepted publication itself are freshly checked before its native commit", async t => {
  const s = await toFixture(t); s.state.onResolve = () => drift(s);
  await publishControlledDiscussions(s.options); const current = await op(s);
  assert.equal(current.to.qualifications.length, 1); assert.equal(current.to.pending, undefined); assert.equal(s.received.length, 1);
  assert.equal(s.state.creations, 1); assert.equal(current.to.qualifications[0].record.source_revision, current.to.acceptedRevision);
  assert.ok((await readFile(s.file, "utf8")).includes(current.resourceId));
});

test("a known accepted response with interrupted native commit replays its exact request, not a guessed binding", async t => {
  for (const update of [false, true]) await t.test(update ? "existing native owner" : "initial native intent", async child => {
    const s = await toFixture(child); if (update) await publishControlledDiscussions(s.options);
    const source = (await readFile(s.file, "utf8")).replace("Native body.", "New actual source edition."); await writeFile(s.file, source);
    s.state.onResolve = () => writeFile(s.file, source + "Unexpected concurrent edit.\n");
    await assert.rejects(publishControlledDiscussions(s.options), /changed since capture/);
    const interrupted = await op(s); assert.ok(interrupted.to.acceptedResult); assert.ok(interrupted.to.pending.native);
    s.state.onResolve = undefined; await writeFile(s.file, source); drift(s); await publishControlledDiscussions(s.options);
    const settled = await op(s); assert.deepEqual(s.received.at(-1), interrupted.to.pending.body);
    assert.deepEqual(settled.to.receipts[interrupted.to.pending.body.mutation_id], interrupted.to.receipts[interrupted.to.pending.body.mutation_id]);
    assert.equal(settled.to.pending, undefined); assert.equal(s.state.creations, 1);
  });
});

test("fresh authority does not turn a definite refusal into an implicit Retry", async t => {
  const s = await toFixture(t), original = s.options.controlledCreation.fetchImplementation; let reject = true, calls = 0;
  s.options.controlledCreation.fetchImplementation = (url, init) => {
    if (new URL(url).pathname.endsWith("resolve.json")) { calls++; if (reject) return Response.json({ outcome: "rejected", code: "invalid_field", retryable: false, retry_after_seconds: null, correlation_id: null, core_fallback: false }, { status: 422 }); }
    return original(url, init);
  };
  await assert.rejects(publishControlledDiscussions(s.options)); const refused = structuredClone((await op(s)).to.pending); drift(s);
  await assert.rejects(publishControlledDiscussions(s.options)); assert.equal(calls, 1); assert.deepEqual((await op(s)).to.pending, refused);
  await stageControlledSourceRetry(s.options, s.file, refused.body.mutation_id); assert.equal(calls, 1);
  reject = false; await publishControlledDiscussions(s.options); assert.equal(calls, 2);
  assert.notEqual(s.received[0].mutation_id, refused.body.mutation_id); assert.deepEqual(s.received[0].bridge_record, refused.body.bridge_record);
  assert.deepEqual((await op(s)).to.rejectedRequests[refused.body.mutation_id], refused);
});

test("scope qualification permits proven source deletion and exact lost-withdrawal recovery, never implicit resume", async t => {
  const s = await toFixture(t); await publishControlledDiscussions(s.options); const source = await readFile(s.file, "utf8"), original = await op(s);
  await unlink(s.file); drift(s); s.state.lostWithdrawal = true; await assert.rejects(publishControlledDiscussions(s.options));
  const pending = structuredClone((await op(s)).to.withdrawal); assert.equal(s.state.record.state, "withdrawn");
  drift(s, "c".repeat(64)); await withdrawControlledSource(s.options, s.file, "source_deleted");
  const current = await op(s); assert.equal(current.to.withdrawal.phase, "withdrawn"); assert.deepEqual(current.to.withdrawal.body, pending.body);
  assert.equal(s.withdrawalMutations.size, 1); assert.deepEqual(current.to.scope, original.to.scope); assert.equal(s.state.creations, 1);
  await writeFile(s.file, source); drift(s, "d".repeat(64)); await assert.rejects(publishControlledDiscussions(s.options), /cannot silently resume/);
  assert.equal(s.received.length, 1);
});

test("revoked/wrong authority, copied ownership, native changes and descriptor/Record races cannot qualify", async t => {
  for (const kind of ["disabled", "direction", "origin", "lane", "resource", "revision", "duplicate", "native", "race"]) await t.test(kind, async child => {
    const s = await toFixture(child); await publishControlledDiscussions(s.options); const before = await op(s), count = s.received.length;
    drift(s);
    if (kind === "disabled") s.state.disabled = true;
    if (kind === "direction") s.connection.directions = ["from_discourse"];
    if (kind === "origin") s.connection.destination_origin = "https://other.example";
    if (kind === "lane") s.options.controlledCreation.lane = "other";
    if (kind === "resource") s.state.record.resource_id = "00000000-0000-4000-8000-000000000099";
    if (kind === "revision") s.state.record.source_revision = "unknown-revision";
    if (kind === "duplicate") await writeFile(path.join(s.docsDir, "copy.md"), await readFile(s.file));
    if (kind === "native") await writeFile(s.file, (await readFile(s.file, "utf8")).replace(before.resourceId, "00000000-0000-4000-8000-000000000099"));
    if (kind === "race") s.state.onDetail = () => { drift(s, "c".repeat(64)); };
    await assert.rejects(publishControlledDiscussions(s.options)); assert.equal(s.received.length, count); assert.equal((await op(s)).to.qualifications, undefined);
    assert.deepEqual((await op(s)).to.scope, before.to.scope);
  });
});

test("a damaged/reordered qualification chain is rejected on restart before network use", async t => {
  const s = await toFixture(t, nativeSource()); await publishControlledDiscussions(s.options); drift(s); await publishControlledDiscussions(s.options);
  const journal = await s.journal(); Object.values(journal.operations)[0].to.qualifications[0].record.topic_id = "99";
  await writeFile(s.options.stateFile, JSON.stringify(journal)); const count = s.received.length;
  await assert.rejects(publishControlledDiscussions(s.options), /linear historical record/); assert.equal(s.received.length, count);
});

test("a post-save authority race retains history but stops use; restart obtains another fresh qualification", async t => {
  const s = await toFixture(t); await publishControlledDiscussions(s.options); drift(s);
  const original = s.options.controlledCreation.fetchImplementation; let connections = 0;
  s.options.controlledCreation.fetchImplementation = (url, init) => {
    if (new URL(url).pathname.endsWith("connection.json") && ++connections === 3) drift(s, "c".repeat(64));
    return original(url, init);
  };
  const count = s.received.length; await assert.rejects(publishControlledDiscussions(s.options), /scope requires reconciliation/);
  const retained = await op(s); assert.equal(retained.to.qualifications.length, 1); assert.equal(s.received.length, count);
  s.options.controlledCreation.fetchImplementation = original; await publishControlledDiscussions(s.options);
  const current = await op(s); assert.equal(current.to.qualifications.length, 2);
  assert.deepEqual(current.to.qualifications[0], retained.to.qualifications[0]); assert.equal(s.state.creations, 1);
});
