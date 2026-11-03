import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, unlink, stat } from "node:fs/promises";
import { stageCmsNativePublications } from "../dist/cms-pipeline.js";
import { reconcileCmsNativeWork } from "../dist/cms-static.js";
import { CmsRequestError } from "../dist/cms-client.js";
import { resumeFixture } from "./fixtures/cms-resume.mjs";
import { uuid } from "./fixtures/cms-coordinator.mjs";
const tx = async s => (await s.journal()).transactions[s.workId];

test("ordinary pipeline resumes expired same prepared work before capacity, preserving native identity and exact old requests", async t => {
  for (const maximum of [1, 32]) await t.test(`capacity ${maximum}`, async child => {
    const s = await resumeFixture(child); await s.prepare(); const before = await tx(s), bytes = await readFile(before.plan.file), inode = (await stat(before.plan.file)).ino;
    const contentCalls = s.base.contentCalls; s.expire();
    const result = await stageCmsNativePublications({ ...s.options, maximumWorkPerBuild: maximum }), after = await tx(s);
    assert.deepEqual(result.prepared, [s.workId]); assert.equal(result.pendingDeployment, 1);
    assert.equal(after.stage, "prepared"); assert.equal(after.lease.lease_generation, 2); assert.equal(after.transactionId, before.transactionId);
    assert.deepEqual(after.plan, before.plan); assert.deepEqual(await readFile(before.plan.file), bytes); assert.equal((await stat(before.plan.file)).ino, inode);
    assert.equal(s.base.contentCalls, contentCalls); assert.equal(s.effects.prepare, 2); assert.equal(s.effects.claim, 2);
    assert.notEqual(after.prepareBody.mutation_id, before.prepareBody.mutation_id); assert.deepEqual(after.workRequestHistory[before.prepareBody.mutation_id].body, before.prepareBody);
    assert.deepEqual(after.workRequestHistory[before.prepareBody.mutation_id].response, before.workRequestHistory[before.prepareBody.mutation_id].response);
    assert.deepEqual(after.leaseHistory, [before.lease]); assert.equal(after.buildArtifact, undefined); assert.equal((await s.journal()).nativeCommand, undefined);
  });
});

test("still-current prepared work renews with a fresh mutation, without Claim, native rewrite or another Prepare effect", async t => {
  const s = await resumeFixture(t); await s.prepare(); const before = await tx(s), claims = s.effects.claim, renewals = s.effects.renew;
  assert.deepEqual((await stageCmsNativePublications({ ...s.options, maximumWorkPerBuild: 1 })).prepared, [s.workId]);
  const after = await tx(s); assert.equal(s.effects.claim, claims); assert.equal(s.effects.prepare, 1); assert.equal(s.effects.renew, renewals + 1);
  assert.equal(after.lease.lease_generation, before.lease.lease_generation); assert.deepEqual(after.prepareBody, before.prepareBody);
});

test("a positive same-mapping Claim cannot accept a different mapping or replace retained authority", async t => {
  const s = await resumeFixture(t); await s.prepare(); const before = await tx(s); s.expire();
  const transport = s.options.fetchImplementation;
  const options = { ...s.options, fetchImplementation: async (url, init) => {
    const result = await transport(url, init);
    if (!new URL(url).pathname.endsWith("claim.json") || result.status !== 200) return result;
    const body = await result.json(); body.work.mapping_id = uuid(999); return Response.json(body);
  } };
  await assert.rejects(stageCmsNativePublications(options), /positively selected mapping/);
  const state = await s.journal(), after = state.transactions[s.workId];
  assert.deepEqual(after.lease, before.lease); assert.deepEqual(after.plan, before.plan);
  assert.deepEqual(after.prepareBody, before.prepareBody); assert.equal(Object.keys(state.transactions).length, 1);
  assert.equal(state.pendingClaim.body.mapping_id, before.lease.work.mapping_id);
  assert.equal(state.claimReceipts[state.pendingClaim.body.mutation_id], undefined);
});

test("expired claimed and uncertain staged work recover through the normal pipeline without a second create", async t => {
  for (const phase of ["claimed", "staged"]) await t.test(phase, async child => {
    const s = await resumeFixture(child);
    if (phase === "staged") { s.loseNext("prepare", true); await assert.rejects(s.prepare()); }
    const before = await tx(s); assert.equal(before.stage, phase); const calls = s.base.contentCalls; s.expire();
    assert.deepEqual((await stageCmsNativePublications({ ...s.options, maximumWorkPerBuild: 1 })).prepared, [s.workId]);
    const after = await tx(s); assert.equal(after.transactionId, before.transactionId); assert.equal(after.stage, "prepared"); assert.equal(after.lease.lease_generation, 2);
    assert.equal(s.effects.prepare, 1); if (phase === "staged") assert.equal(s.base.contentCalls, calls);
    if (before.prepareBody) assert.deepEqual(after.workRequestHistory[before.prepareBody.mutation_id].body, before.prepareBody);
  });
});

test("lost fresh Claim, accepted Prepare and renewal responses retain exact replay and restart semantics", async t => {
  for (const phase of ["claim", "prepare", "renew"]) await t.test(phase, async child => {
    const s = await resumeFixture(child); await s.prepare(); const original = await tx(s);
    if (phase !== "renew") s.expire(); s.loseNext(phase);
    await assert.rejects(stageCmsNativePublications({ ...s.options, maximumWorkPerBuild: 1 }));
    const retained = await s.journal(), priorRequests = s.requests.filter(entry => entry.kind === phase), lost = priorRequests.at(-1).body;
    if (phase === "claim") assert.deepEqual(retained.pendingClaim.body, lost);
    if (phase === "prepare") assert.deepEqual(retained.transactions[s.workId].prepareBody, lost);
    if (phase === "renew") assert.deepEqual(retained.transactions[s.workId].pendingRenewal.body, lost);
    assert.deepEqual((await stageCmsNativePublications({ ...s.options, maximumWorkPerBuild: 1 })).prepared, [s.workId]);
    const requests = s.requests.filter(entry => entry.kind === phase && entry.body.mutation_id === lost.mutation_id);
    assert.equal(requests.length, 2); assert.deepEqual(requests[1].body, lost);
    const after = await tx(s); assert.equal(after.transactionId, original.transactionId); assert.deepEqual(after.plan, original.plan);
    assert.equal(s.effects.claim, phase === "renew" ? 1 : 2); assert.equal(s.effects.prepare, phase === "renew" ? 1 : 2);
    assert.equal(after.pendingRenewal, undefined); assert.equal((await s.journal()).pendingClaim, undefined);
  });
});

test("crash after durable fresh Claim and legacy prepared phase reenter with the owned lease, not another Claim", async t => {
  for (const legacy of [false, true]) await t.test(legacy ? "legacy prepared phase" : "staged phase", async child => {
    const s = await resumeFixture(child); await s.prepare(); const before = await tx(s); s.expire(); s.restartAfterClaim();
    await assert.rejects(stageCmsNativePublications({ ...s.options, maximumWorkPerBuild: 1 }));
    const state = await s.journal(), held = state.transactions[s.workId]; assert.equal(held.lease.lease_generation, 2); assert.equal(held.stage, "staged");
    if (legacy) { held.stage = "prepared"; delete held.workRequestHistory; delete held.leaseHistory; await writeFile(s.options.stateFile, JSON.stringify(state)); }
    assert.deepEqual((await stageCmsNativePublications({ ...s.options, maximumWorkPerBuild: 1 })).prepared, [s.workId]);
    const after = await tx(s); assert.equal(s.effects.claim, 2); assert.equal(s.effects.prepare, 2); assert.equal(after.transactionId, before.transactionId);
    assert.deepEqual(after.workRequestHistory[before.prepareBody.mutation_id].body, before.prepareBody);
  });
});

test("a cached successful renewal is historical and cannot authorize reclaim or readiness after expiry", async t => {
  const s = await resumeFixture(t); await s.prepare(); s.loseNext("renew"); await assert.rejects(stageCmsNativePublications(s.options));
  const pending = (await tx(s)).pendingRenewal.body; s.expire();
  assert.deepEqual((await stageCmsNativePublications({ ...s.options, maximumWorkPerBuild: 1 })).prepared, [s.workId]);
  const renewal = s.requests.filter(entry => entry.kind === "renew"), originalIndex = renewal.findIndex(entry => entry.body.mutation_id === pending.mutation_id);
  assert.deepEqual(renewal[originalIndex + 1].body, pending);
  assert.notEqual(renewal[originalIndex + 2].body.mutation_id, pending.mutation_id); assert.equal(s.effects.claim, 2); assert.equal((await tx(s)).lease.lease_generation, 2);
});

test("foreign authority, changed work/native state and fabricated expiry cannot authorize ordinary reclaim", async t => {
  for (const fault of ["foreign", "revision", "policy", "terminal", "edit", "missing", "fabricated", "malformed"]) await t.test(fault, async child => {
    const s = await resumeFixture(child); await s.prepare(); const before = await tx(s); s.expire();
    if (fault === "foreign") s.foreignLease();
    if (fault === "revision") s.base.nativeWork.source_revision = "another-source-revision";
    if (fault === "policy") s.base.nativeWork.policy_revision = uuid(900);
    if (fault === "terminal") s.base.nativeWork.state = "attention";
    if (fault === "edit") await writeFile(before.plan.file, (await readFile(before.plan.file, "utf8")) + "Foreign edit.\n");
    if (fault === "missing") await unlink(before.plan.file);
    if (fault === "fabricated") s.failRenewalOnce(() => { throw new CmsRequestError("lease_expired", false, null, "V4-15", 409); });
    if (fault === "malformed") s.failRenewalOnce(() => Response.json({ outcome: "rejected", code: "lease_expired", retryable: false, retry_after_seconds: null, correlation_id: null, core_fallback: true }, { status: 409 }));
    await assert.rejects(stageCmsNativePublications(s.options)); assert.equal(s.effects.claim, 1); assert.equal(s.effects.prepare, 1);
    assert.equal((await tx(s)).lease.lease_generation, 1);
  });
});

test("unknown original Prepare cannot be replaced on a fabricated or unvalidated expiry response", async t => {
  for (const fault of ["fabricated", "transport", "malformed"]) await t.test(fault, async child => {
    const s = await resumeFixture(child); s.loseNext("prepare", true); await assert.rejects(s.prepare()); const before = await tx(s); s.expire();
    s.failPreparationOnce(() => {
      if (fault === "fabricated") throw new CmsRequestError("lease_expired", false, null, "V4-18", 409);
      if (fault === "transport") throw new Error("Synthetic unresolved transport.");
      return Response.json({ outcome: "rejected", code: "lease_expired", retryable: false, retry_after_seconds: null, correlation_id: null, core_fallback: true }, { status: 409 });
    });
    await assert.rejects(stageCmsNativePublications(s.options)); assert.equal(s.effects.claim, 1); assert.equal(s.effects.prepare, 0);
    const after = await tx(s); assert.deepEqual(after.prepareBody, before.prepareBody); assert.equal(after.workRequestHistory[before.prepareBody.mutation_id].response, undefined);
    assert.equal(after.workRequestHistory[before.prepareBody.mutation_id].refusal, undefined);
  });
});

test("a schema-valid but differently bound renewal receipt does not become accepted current or historical authority", async t => {
  for (const field of ["attempt", "token", "work", "policy"]) await t.test(field, async child => {
    const s = await resumeFixture(child); await s.prepare(); const before = await tx(s);
    s.failRenewalOnce((_body, response) => {
      if (field === "attempt") response.work.attempt++;
      if (field === "token") response.lease_token = Buffer.alloc(32, 45).toString("base64url");
      if (field === "work") response.work.work_id = uuid(999);
      if (field === "policy") response.work.policy_revision = uuid(998);
      return Response.json(response);
    });
    await assert.rejects(stageCmsNativePublications(s.options)); const after = await tx(s);
    assert.deepEqual(after.lease, before.lease); assert.equal(s.effects.claim, 1);
    assert.ok(after.pendingRenewal); assert.equal(after.workRequestHistory[after.pendingRenewal.body.mutation_id].response, undefined);
  });
});

test("chosen settlements, moves and command owners block fresh authority before ordinary recovery", async t => {
  for (const hold of ["finalizeBody", "abortBody", "failureBody", "move", "starting", "running", "uncertain", "failed", "succeeded"]) await t.test(hold, async child => {
    const s = await resumeFixture(child); await s.prepare(); s.expire(); const state = await s.journal(), transaction = state.transactions[s.workId], renewals = s.effects.renew;
    if (hold.endsWith("Body")) transaction[hold] = { retainedChosenIntent: true };
    else if (hold === "move") transaction.presentationMove = { phase: "applied" };
    else state.nativeCommand = { commandId: uuid(700), phase: hold, workIds: [s.workId], executable: process.execPath, args: [], cwd: s.base.root,
      startedAt: new Date().toISOString(), deploymentId: uuid(701), ...(hold === "succeeded" ? { deployedAt: new Date().toISOString() } : {}) };
    await writeFile(s.options.stateFile, JSON.stringify(state)); const bytes = await readFile(s.options.stateFile);
    await assert.rejects(reconcileCmsNativeWork(s.options, s.workId)); assert.equal(s.effects.claim, 1); assert.equal(s.effects.renew, renewals);
    assert.deepEqual(await readFile(s.options.stateFile), bytes);
  });
});

test("legacy Prepare intent cannot be retrofitted into history for another source, policy or transaction", async t => {
  for (const field of ["source", "policy", "transaction"]) await t.test(field, async child => {
    const s = await resumeFixture(child); await s.prepare(); const state = await s.journal(), transaction = state.transactions[s.workId], renewals = s.effects.renew;
    delete transaction.workRequestHistory;
    if (field === "source") transaction.prepareBody.authority.source_revision = "another-source-revision";
    if (field === "policy") transaction.prepareBody.authority.policy_revision = uuid(991);
    if (field === "transaction") transaction.prepareBody.transaction_id = uuid(992);
    await writeFile(s.options.stateFile, JSON.stringify(state)); const original = await readFile(s.options.stateFile);
    await assert.rejects(reconcileCmsNativeWork(s.options, s.workId)); assert.deepEqual(await readFile(s.options.stateFile), original);
    assert.equal(s.effects.claim, 1); assert.equal(s.effects.renew, renewals);
  });
});
