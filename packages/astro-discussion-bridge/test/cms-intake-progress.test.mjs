import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, stat } from "node:fs/promises";
import { stageCmsNativePublications } from "../dist/cms-pipeline.js";
import { claimCmsNativeWork } from "../dist/cms-coordinator.js";
import { resumeFixture } from "./fixtures/cms-resume.mjs";
import { uuid, lease, html } from "./fixtures/cms-coordinator.mjs";

// Real pipeline/coordinator, private durable file and typed transport; historical
// mappings have no pending receiver work. This does not replace the tested loop.
async function intakeFixture(t, historyCount, maximum = 1) {
  const s = await resumeFixture(t, { initialClaim: false }), state = await s.journal();
  const target = structuredClone(s.base.nativeMapping), heldId = uuid(800001), heldWork = uuid(800002), heldSource = "topic:900001";
  const source = { ...s.base.sourceRecord, source_id: heldSource, topic_id: "900001", topic_url: "https://forum.example/t/held/900001" };
  const held = { ...target, mapping_id: heldId, source_id: heldSource, resource_id: uuid(800003), external_id: "held-source", canonical_url: "https://astro.example/comments/held/" };
  state.mappings = { [heldSource]: held };
  for (let index = 0; index < historyCount; index++) {
    const id = `topic:${910000 + index}`;
    state.mappings[id] = { ...target, source_id: id, mapping_id: uuid(810000 + index), resource_id: uuid(820000 + index),
      external_id: `historical-${index}`, canonical_url: `https://astro.example/comments/historical-${index}/`,
      destination_native_id: `comments/historical-${index}.md`, destination_native_revision: "historical-revision",
      synchronized_source_revision: target.desired_source_revision, publicly_verified_source_revision: target.desired_source_revision };
  }
  state.mappings[target.source_id] = target;
  state.generations[heldId] = 1;
  state.transactions[heldWork] = { transactionId: uuid(800004), stage: "claimed",
    lease: { ...structuredClone(lease), lease_generation: 1, work: { ...structuredClone(lease.work), work_id: heldWork, mapping_id: heldId,
      source_id: heldSource, source_revision: source.source_revision, policy_revision: s.base.nativeWork.policy_revision, lease_generation: 1 } },
    localLimitation: { kind: "native_preparation", detail: "Retained operator decision", source, content: html, recordedAt: new Date().toISOString() } };
  await writeFile(s.options.stateFile, JSON.stringify(state));
  return { ...s, heldId, heldWork, target, options: { ...s.options, maximumWorkPerBuild: maximum } };
}

test("positive-only intake reaches tail work beyond its budget across ordinary invocations", async t => {
  for (const maximum of [1, 32]) await t.test(`capacity ${maximum}`, async child => {
    const s = await intakeFixture(child, maximum * 2 + 1, maximum), before = await s.journal();
    const held = structuredClone(before.transactions[s.heldWork]);
    let result;
    for (let invocation = 0; invocation < 4 && s.effects.claim === 0; invocation++) {
      const requestCount = s.http.claim;
      result = await stageCmsNativePublications(s.options);
      assert.ok(s.http.claim - requestCount <= maximum * 2, "bounded transport budget per invocation");
    }
    assert.equal(s.effects.claim, 1, "eligible tail mapping is eventually claimed");
    assert.deepEqual(result.prepared, [s.workId]); assert.equal(s.effects.prepare, 1);
    const prepared = (await s.journal()).transactions[s.workId], bytes = await readFile(prepared.plan.file), inode = (await stat(prepared.plan.file)).ino;
    await stageCmsNativePublications(s.options);
    const after = await s.journal();
    assert.equal(s.effects.claim, 1); assert.equal(s.effects.prepare, 1);
    assert.deepEqual(after.transactions[s.heldWork], held);
    assert.equal(after.transactions[s.workId].transactionId, prepared.transactionId);
    assert.deepEqual(await readFile(prepared.plan.file), bytes); assert.equal((await stat(prepared.plan.file)).ino, inode);
    assert.equal(after.mappings[s.target.source_id].resource_id, s.target.resource_id);
    assert.equal(Object.keys(after.claimReceipts).length, 1, "idle history does not grow Claim receipts");
    assert.ok(s.requests.filter(request => request.kind === "claim").every(request => request.body.mapping_id !== s.heldId));
    assert.equal(after.nativeCommand, undefined);
  });
});

test("finite positive204 exhaustion at the exact budget is a normal bounded result", async t => {
  for (const maximum of [1, 32]) await t.test(`capacity ${maximum}`, async child => {
    const s = await intakeFixture(child, maximum * 2 - 1, maximum); s.base.nativeWork.state = "verified";
    for (let invocation = 0; invocation < 2; invocation++) {
      const count = s.http.claim, result = await stageCmsNativePublications(s.options);
      assert.deepEqual(result.prepared, []); assert.equal(result.localLimitations.length, 1);
      assert.equal(s.http.claim - count, maximum * 2);
    }
    const state = await s.journal(); assert.equal(s.effects.claim, 0); assert.equal(s.effects.prepare, 0);
    assert.equal(Object.keys(state.claimReceipts ?? {}).length, 0); assert.equal(state.pendingClaim, undefined);
    assert.equal(state.intakeAfterMappingId, s.target.mapping_id);
  });
});

test("lost positive204 intake resolves its exact durable request before advancing the bounded selector", async t => {
  const s = await intakeFixture(t, 3); s.loseNext("claim");
  await assert.rejects(stageCmsNativePublications(s.options));
  const before = await s.journal(), pending = before.pendingClaim;
  assert.equal(pending.intake, true); assert.equal(before.intakeAfterMappingId, undefined);
  for (let count = 0; count < 4 && s.effects.claim === 0; count++) await stageCmsNativePublications(s.options);
  const attempts = s.requests.filter(request => request.kind === "claim" && request.body.mutation_id === pending.body.mutation_id);
  assert.equal(attempts.length, 2); assert.deepEqual(attempts[0].body, pending.body); assert.deepEqual(attempts[1].body, pending.body);
  assert.equal(s.effects.claim, 1); assert.equal(s.effects.prepare, 1); assert.equal((await s.journal()).pendingClaim, undefined);
});

test("conflicting positive lease does not advance intake or adopt another mapping; exact replay recovers the actual receipt", async t => {
  const s = await intakeFixture(t, 0), transport = s.options.fetchImplementation;
  const wrong = { ...s.options, fetchImplementation: async (url, init) => {
    const response = await transport(url, init);
    if (!new URL(url).pathname.endsWith("claim.json") || response.status !== 200) return response;
    const body = await response.json(); body.work.mapping_id = uuid(999999); return Response.json(body);
  } };
  await assert.rejects(stageCmsNativePublications(wrong), /positively selected mapping/);
  const before = await s.journal(), pending = before.pendingClaim;
  assert.equal(before.intakeAfterMappingId, undefined); assert.equal(before.transactions[s.workId], undefined);
  assert.equal(pending.intake, true); assert.equal(pending.body.mapping_id, s.target.mapping_id);
  await stageCmsNativePublications(s.options);
  const after = await s.journal(); assert.equal(s.effects.claim, 1); assert.equal(s.effects.prepare, 1);
  assert.equal(after.transactions[s.workId].lease.work.mapping_id, s.target.mapping_id);
  assert.equal(after.intakeAfterMappingId, s.target.mapping_id); assert.equal(after.pendingClaim, undefined);
  assert.deepEqual(after.claimReceipts[pending.body.mutation_id].body, pending.body);
});

test("legacy uncertain positive Claim is never retagged as intake or given invented scan progress", async t => {
  const s = await intakeFixture(t, 1), state = await s.journal(), historical = Object.values(state.mappings)[1].mapping_id;
  s.loseNext("claim"); await assert.rejects(claimCmsNativeWork(s.options, historical));
  const pending = (await s.journal()).pendingClaim; assert.equal(pending.intake, undefined);
  await claimCmsNativeWork(s.options, historical, true);
  const after = await s.journal(); assert.equal(after.pendingClaim, undefined); assert.equal(after.intakeAfterMappingId, undefined);
  const attempts = s.requests.filter(request => request.kind === "claim" && request.body.mutation_id === pending.body.mutation_id);
  assert.equal(attempts.length, 2); assert.deepEqual(attempts[0].body, attempts[1].body);
  await claimCmsNativeWork(s.options, historical, true);
  assert.equal((await s.journal()).intakeAfterMappingId, historical);
});

test("repeated already-current positive lease is not counted as new work or prepared again", async t => {
  const s = await intakeFixture(t, 0, 2); await stageCmsNativePublications(s.options);
  const before = await s.journal(), transaction = before.transactions[s.workId];
  const original = Object.values(before.claimReceipts)[0], bytes = await readFile(transaction.plan.file);
  const transport = s.options.fetchImplementation;
  const repeated = { ...s.options, fetchImplementation: async (url, init) => {
    if (new URL(url).pathname.endsWith("claim.json")) return Response.json(structuredClone(original.response));
    return transport(url, init);
  } };
  await assert.rejects(stageCmsNativePublications(repeated), /already-current native owner/);
  const after = await s.journal(); assert.equal(s.effects.claim, 1); assert.equal(s.effects.prepare, 1);
  assert.equal(Object.keys(after.transactions).length, 2, "one held limitation and the original target only");
  assert.equal(after.transactions[s.workId].transactionId, transaction.transactionId);
  assert.deepEqual(after.transactions[s.workId].prepareBody, transaction.prepareBody);
  assert.deepEqual(after.claimReceipts[original.body.mutation_id], original);
  assert.deepEqual(await readFile(transaction.plan.file), bytes); assert.equal(after.nativeCommand, undefined);
});

test("malformed local intake metadata refuses before transport or state mutation", async t => {
  for (const fault of ["cursor", "marker", "unscoped"]) await t.test(fault, async child => {
    const s = await intakeFixture(child, 1), state = await s.journal();
    if (fault === "cursor") state.intakeAfterMappingId = [];
    else state.pendingClaim = { body: { mutation_id: uuid(899999), ...(fault === "marker" ? { mapping_id: s.target.mapping_id } : {}) }, intake: fault === "marker" ? false : true };
    await writeFile(s.options.stateFile, JSON.stringify(state)); const bytes = await readFile(s.options.stateFile), claims = s.http.claim;
    await assert.rejects(stageCmsNativePublications(s.options)); assert.equal(s.http.claim, claims);
    assert.deepEqual(await readFile(s.options.stateFile), bytes);
  });
});
