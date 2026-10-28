import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import test from "node:test";
import * as api from "../dist/index.js";
import { staticFixture } from "./fixtures/cms-static.mjs";
import { uuid } from "./fixtures/cms-coordinator.mjs";
import { createHash } from "node:crypto";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { claimCmsNativeWork, pollCmsSources, reserveCmsSource } from "../dist/cms-coordinator.js";
import { prepareCmsNativeWork } from "../dist/cms-static.js";
import { verifyCmsPublication, verifyCmsAbsence } from "../dist/cms-verification.js";
import { readAttentionState } from "../dist/cms-attention-state.js";
import { candidateId, validateCms } from "../src/private/cms-runtime.mjs";
import { spawn } from "node:child_process";
import { toFixture } from "./fixtures/cms-to.mjs";
import { publishControlledDiscussions } from "../dist/controlled-creation.js";
import { readPublicationOperationalState } from "../dist/operational-state.js";
const hash = value => createHash("sha256").update(value).digest("hex");
const interop = [];
const recordInterop = (id, inspection, observation, expected_status) => {
  validateCms("AttentionInspection", inspection); validateCms("AttentionObservation", observation);
  interop.push({ id, profile: "astro", publication_kind: "static", inspection: structuredClone(inspection), observation, expected_status });
};
test.after(async () => { if (process.env.ASTRO_CORE_INTEROP_FILE) await writeFile(process.env.ASTRO_CORE_INTEROP_FILE, JSON.stringify(interop, null, 2) + "\n"); });

const available = () => assert.equal(typeof api.inspectCmsAttentionNative, "function", "actual package exposes the native inspection path");
async function attentionFixture(t, prepare = true) {
  const f = await staticFixture(t, {}, undefined, "simple");
  if (prepare) await f.prepare();
  const state = JSON.parse(await readFile(f.options.stateFile, "utf8"));
  state.transactions[f.claimed.workId].stage = "attention";
  await writeFile(f.options.stateFile, JSON.stringify(state));
  f.nativeWork.state = "attention";
  const work = structuredClone(f.nativeWork), mapping = structuredClone(f.nativeMapping);
  const transaction = state.transactions[f.claimed.workId];
  const inspection = { sequence: 1, inspection_id: uuid(600), context_sha256: "a".repeat(64), work, mapping,
    source: structuredClone(f.sourceRecord), native_result: transaction.plan?.nativeResult ?? null,
    verified_native_result: null, verification: null, prepared_transaction: transaction.plan ? {
      transaction_id: transaction.transactionId, work_id: work.work_id, lease_generation: transaction.lease.lease_generation,
      action: work.action, source_revision: work.source_revision, policy_revision: work.policy_revision,
      native_result: transaction.plan.nativeResult, prepared_at: transaction.preparedAt, deployment_id: null, deployed_at: null,
    } : null, created_at: new Date().toISOString() };
  const original = f.options.fetchImplementation, requests = [];
  f.options.fetchImplementation = async (url, init) => {
    requests.push({ url, method: init.method });
    if (new URL(url).pathname === `/discussion-bridge/v4/work/${work.work_id}.json`) return Response.json({ work, mapping, lease_expires_at: null });
    return original(url, init);
  };
  return { ...f, inspection, state, transaction, requests };
}

test("actual package exports Check, Restore and recovery synchronization controls", () => {
  available();
  for (const name of ["checkCmsAttention", "restoreCmsAttentionBaseline", "synchronizeCmsAttentionRecoveries"]) assert.equal(typeof api[name], "function", name);
});

test("Check reports an applied static candidate without writing/replaying/claiming or granting readiness", async t => {
  available(); const f = await attentionFixture(t), file = f.transaction.plan.file;
  const stateBefore = await readFile(f.options.stateFile), nativeBefore = await readFile(file);
  const observed = await api.inspectCmsAttentionNative(f.options, f.inspection);
  assert.equal(observed.profile, "astro-static-1"); assert.equal(observed.native_state, "candidate_applied");
  assert.equal(observed.native_id, f.transaction.plan.nativeResult.native_id);
  assert.equal(observed.verification, null); assert.equal(Object.hasOwn(observed, "ready"), false);
  recordInterop("static_candidate_remains_blocked", f.inspection, observed, "not_ready");
  assert.deepEqual(await readFile(f.options.stateFile), stateBefore); assert.deepEqual(await readFile(file), nativeBefore);
  assert.ok(f.requests.every(request => request.method === "GET"));
  assert.equal(f.failures.length, 0); assert.equal(f.aborted.length, 0);
});

test("Check positively distinguishes never-applied initial work from missing previously owned native identity", async t => {
  available(); const f = await attentionFixture(t, false);
  const observed = await api.inspectCmsAttentionNative(f.options, f.inspection);
  assert.equal(observed.native_state, "never_applied"); assert.equal(observed.object_exists, false);
  recordInterop("actual_initial_native_absence", f.inspection, observed, "ready");
  f.inspection.mapping.destination_native_id = "missing-owned.md";
  const missing = await api.inspectCmsAttentionNative(f.options, f.inspection);
  assert.notEqual(missing.native_state, "never_applied"); assert.notEqual(missing.issue, "none");
});

test("Check preserves foreign edits and names the native conflict", async t => {
  available(); const f = await attentionFixture(t), file = f.transaction.plan.file;
  const edited = await readFile(file, "utf8") + "Unrelated current native edit.\n";
  await writeFile(file, edited); const stateBefore = await readFile(f.options.stateFile);
  const observed = await api.inspectCmsAttentionNative(f.options, f.inspection);
  assert.equal(observed.native_state, "conflict"); assert.equal(observed.issue, "native_conflict");
  recordInterop("actual_foreign_native_edit", f.inspection, observed, "not_ready");
  assert.equal(await readFile(file, "utf8"), edited); assert.deepEqual(await readFile(f.options.stateFile), stateBefore);
});

test("Check refuses active and uncertain native commands without executing a command", async t => {
  available(); const f = await attentionFixture(t);
  for (const phase of ["running", "uncertain"]) {
    f.state.nativeCommand = { commandId: uuid(601), phase, workIds: [f.inspection.work.work_id],
      executable: process.execPath, args: [], cwd: f.root, startedAt: new Date().toISOString(), pid: process.pid, deploymentId: uuid(602) };
    await writeFile(f.options.stateFile, JSON.stringify(f.state)); const before = await readFile(f.options.stateFile);
    const observed = await api.inspectCmsAttentionNative(f.options, f.inspection);
    assert.equal(observed.issue, phase === "running" ? "active_command" : "uncertain_command");
    assert.deepEqual(await readFile(f.options.stateFile), before);
  }
});

test("Check retains an uncertain exact settlement request and never resends it", async t => {
  available(); const f = await attentionFixture(t);
  f.state.transactions[f.inspection.work.work_id].finalizeBody = { mutation_id: uuid(603), retained_exact: "private synthetic pending" };
  await writeFile(f.options.stateFile, JSON.stringify(f.state)); const before = await readFile(f.options.stateFile);
  const observed = await api.inspectCmsAttentionNative(f.options, f.inspection);
  assert.equal(observed.pending_mutation, "uncertain"); assert.equal(observed.issue, "uncertain_mutation");
  recordInterop("actual_uncertain_native_settlement", f.inspection, observed, "not_ready");
  assert.deepEqual(await readFile(f.options.stateFile), before); assert.ok(f.requests.every(request => request.method === "GET"));
  assert.doesNotMatch(JSON.stringify(observed), /retained_exact|private synthetic pending|lease_token|content_html/);
});

async function restoredFixture(t) {
  const f = await staticFixture(t, {}, undefined, "simple"); await f.prepare();
  let state = JSON.parse(await readFile(f.options.stateFile, "utf8")); const baseline = state.transactions[f.claimed.workId];
  const rendered = await (await createMarkdownProcessor()).render(baseline.plan.output.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, ""));
  const built = `<html><body><article data-discussionbridge-cms-native="${baseline.plan.nativeResult.native_id}" data-discussionbridge-cms-resource="${f.nativeMapping.resource_id}" data-discussionbridge-cms-revision="${f.sourceRecord.source_revision}" data-discussionbridge-cms-mode="simple"><h1 data-discussionbridge-cms-title>${f.sourceRecord.title}</h1>${rendered.code}<section data-discussionbridge-mode="simple" data-discussionbridge-simple data-topic-id="${f.sourceRecord.topic_id}"></section></article></body></html>`;
  const deployedAt = new Date().toISOString(), publicFetchImplementation = async () => new Response(built, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  const verification = await verifyCmsPublication(await f.expectation(built), { deploymentId: uuid(610), deployedAt }, publicFetchImplementation);
  baseline.stage = "verified"; baseline.buildArtifact = { html: built, sha256: hash(built), builtAt: deployedAt };
  baseline.finalizeBody = { mutation_id: uuid(611), authority: { work_id: baseline.lease.work.work_id, lease_token: baseline.lease.lease_token, lease_generation: baseline.lease.lease_generation,
    source_revision: baseline.lease.work.source_revision, policy_revision: baseline.lease.work.policy_revision }, transaction_id: baseline.transactionId, deployment_id: uuid(610), deployed_at: deployedAt, verification };
  f.nativeMapping.publicly_verified_source_revision = baseline.lease.work.source_revision; f.nativeMapping.publicly_verified_at = verification.checked_at;
  state.mappings[f.sourceRecord.source_id] = structuredClone(f.nativeMapping); await writeFile(f.options.stateFile, JSON.stringify(state));
  const workId = f.queuePublication("<p>Second complete native revision.</p>"); await pollCmsSources(f.options); await reserveCmsSource(f.options, f.sourceRecord.source_id);
  await claimCmsNativeWork(f.options); await prepareCmsNativeWork(f.options, workId);
  state = JSON.parse(await readFile(f.options.stateFile, "utf8")); const transaction = state.transactions[workId]; transaction.stage = "attention";
  await writeFile(f.options.stateFile, JSON.stringify(state)); f.nativeWork.state = "attention";
  const work = structuredClone(f.nativeWork), mapping = structuredClone(f.nativeMapping);
  const inspection = { sequence: 1, inspection_id: uuid(612), context_sha256: "b".repeat(64), work, mapping, source: structuredClone(f.sourceRecord), native_result: transaction.plan.nativeResult,
    verified_native_result: baseline.plan.nativeResult, verification, prepared_transaction: { transaction_id: transaction.transactionId, work_id: workId, lease_generation: transaction.lease.lease_generation,
      action: work.action, source_revision: work.source_revision, policy_revision: work.policy_revision, native_result: transaction.plan.nativeResult, prepared_at: transaction.preparedAt, deployment_id: null, deployed_at: null }, created_at: new Date().toISOString() };
  const original = f.options.fetchImplementation;
  f.options = { ...f.options, publicFetchImplementation, fetchImplementation: async (url, init) => new URL(url).pathname === `/discussion-bridge/v4/work/${workId}.json`
    ? Response.json({ work, mapping, lease_expires_at: null }) : original(url, init) };
  return { ...f, inspection, transaction, state, baseline, built };
}
function recoveryService(f) {
  const original = f.options.fetchImplementation, oldWork = structuredClone(f.inspection.work); let mapping = structuredClone(f.inspection.mapping), admitted = false, lostReport = false, lostClaim = false, claimLease;
  const reports = [], claims = [], requests = []; let event;
  f.options.fetchImplementation = async (url, init) => {
    const endpoint = new URL(url), after = Number(endpoint.searchParams.get("after") ?? 0), body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ pathname: endpoint.pathname, method: init.method });
    if (endpoint.pathname.endsWith("attention-recovery.json")) return Response.json({ protocol_revision: "attention-recovery-1", candidate_id: candidateId, inspection_profiles: ["astro-static-1"] });
    if (endpoint.pathname.endsWith("attention-inspections.json")) return Response.json({ items: after === 0 ? [f.inspection] : [], next_after: 1, has_more: false });
    if (endpoint.pathname.endsWith("/report.json")) {
      reports.push(body); if (lostReport) { lostReport = false; throw new Error("synthetic report committed; response lost"); }
      return Response.json({ inspection_id: f.inspection.inspection_id, context_sha256: f.inspection.context_sha256,
        status: ["never_applied", "baseline", "restored_baseline"].includes(body.observation.native_state) && body.observation.issue === "none" ? "ready" : "not_ready", issue: body.observation.issue, observed_at: body.observation.observed_at });
    }
    if (endpoint.pathname.endsWith("work/recoveries.json")) return Response.json({ items: admitted && after === 0 ? [event] : [], next_after: admitted ? 1 : 0, has_more: false });
    if (endpoint.pathname.includes("work/recoveries/") && endpoint.pathname.endsWith("claim.json")) {
      claims.push(body); assert.equal(body.work_id, event.work.work_id);
      claimLease ??= { work: { ...event.work, state: "leased", attempt: 1, lease_generation: event.work.lease_generation + 1 }, lease_generation: event.work.lease_generation + 1,
        lease_token: Buffer.alloc(32, 31).toString("base64url"), server_time: new Date().toISOString(), expires_at: new Date(Date.now() + 300000).toISOString() };
      if (lostClaim) { lostClaim = false; throw new Error("synthetic exact claim committed; response lost"); }
      return Response.json(claimLease);
    }
    if (event && endpoint.pathname === `/discussion-bridge/v4/work/${event.work.work_id}/renew.json`) return Response.json(claimLease);
    if (event && endpoint.pathname === `/discussion-bridge/v4/work/${event.work.work_id}/prepare.json`) {
      assert.equal(body.authority.work_id, event.work.work_id); assert.equal(body.authority.lease_generation, claimLease.lease_generation);
      claimLease = { ...claimLease, work: { ...claimLease.work, state: "synchronized" } };
      mapping = { ...mapping, destination_native_id: body.native_result.native_id, destination_native_revision: body.native_result.native_revision,
        synchronized_source_revision: claimLease.work.source_revision, synchronized_at: body.prepared_at };
      return Response.json({ work: claimLease.work, mapping, lease_expires_at: claimLease.expires_at });
    }
    if (endpoint.pathname === `/discussion-bridge/v4/work/${oldWork.work_id}.json`) return Response.json({ work: oldWork, mapping, lease_expires_at: null });
    if (event && endpoint.pathname === `/discussion-bridge/v4/work/${event.work.work_id}.json`) return Response.json({ work: claimLease.work, mapping, lease_expires_at: claimLease.expires_at });
    return original(url, init);
  };
  return { reports, claims, requests, loseReport() { lostReport = true; }, loseClaim() { lostClaim = true; },
    admit() { admitted = true; oldWork.state = "superseded"; mapping = { ...mapping, mapping_state: "pending" };
      if (f.inspection.prepared_transaction) { mapping.destination_native_revision = f.inspection.verified_native_result.native_revision; mapping.synchronized_source_revision = mapping.publicly_verified_source_revision; }
      event = { sequence: 1, recovery_id: uuid(620), inspection_id: f.inspection.inspection_id, context_sha256: f.inspection.context_sha256, predecessor_work_id: oldWork.work_id,
        predecessor_attempt_cycle: oldWork.attempt_cycle, work: { ...oldWork, work_id: uuid(621), attempt_cycle: uuid(622), state: "pending", attempt: 0, retry_at: null, last_failure_code: null },
        mapping, source: f.inspection.source, mode: f.inspection.prepared_transaction ? "settle_restored_baseline" : "retry", native_baseline: f.inspection.verified_native_result ?? f.inspection.native_result,
        verification: f.inspection.verification, created_at: new Date().toISOString() }; return event; } };
}

test("native Restore journals exact baseline before writing, is restart-safe, and fresh Check proves actual public baseline", async t => {
  const f = await restoredFixture(t), before = await readFile(f.options.stateFile), observed = await api.inspectCmsAttentionNative(f.options, f.inspection);
  assert.equal(observed.native_state, "candidate_applied");
  await assert.rejects(api.restoreCmsAttentionBaseline({ ...f.options, afterRestoreRecorded: async () => { throw new Error("synthetic crash before restore write"); } }, f.inspection, observed.journal_sha256), /synthetic crash/);
  assert.equal(await readFile(f.transaction.plan.file, "utf8"), f.transaction.plan.output);
  const first = await api.restoreCmsAttentionBaseline(f.options, f.inspection, observed.journal_sha256);
  const replay = await api.restoreCmsAttentionBaseline(f.options, f.inspection, observed.journal_sha256);
  assert.equal(first.operationId, replay.operationId); assert.equal(first.publicRestored, false);
  assert.equal(await readFile(f.transaction.plan.file, "utf8"), f.transaction.plan.previous); assert.deepEqual(await readFile(f.options.stateFile), before);
  const restored = await api.inspectCmsAttentionNative(f.options, f.inspection);
  assert.equal(restored.native_state, "restored_baseline"); assert.equal(restored.issue, "none"); assert.equal(restored.current_sha256, restored.baseline_sha256);
  assert.equal(restored.verification.source_revision, f.baseline.plan.source.source_revision); assert.equal(restored.restoration_operation_id, first.operationId);
  recordInterop("actual_restored_baseline_public_proof", f.inspection, restored, "ready");
});

test("independent restored backup needs no fabricated restoration ID; unavailable public baseline remains blocked", async t => {
  const f = await restoredFixture(t); await writeFile(f.transaction.plan.file, f.transaction.plan.previous);
  const restored = await api.inspectCmsAttentionNative(f.options, f.inspection); assert.equal(restored.native_state, "restored_baseline"); assert.equal(restored.restoration_operation_id, null);
  recordInterop("external_backup_actual_restored_baseline", f.inspection, restored, "ready");
  const blocked = await api.inspectCmsAttentionNative({ ...f.options, publicFetchImplementation: async () => new Response("not restored", { status: 503 }) }, f.inspection);
  assert.equal(blocked.issue, "public_proof_unavailable"); recordInterop("restored_native_public_still_unproven", f.inspection, blocked, "not_ready");
});

test("attention before a new plan reads the retained actually verified native baseline without inventing a candidate", async t => {
  const f = await restoredFixture(t); await writeFile(f.transaction.plan.file, f.transaction.plan.previous);
  delete f.state.transactions[f.inspection.work.work_id].plan; delete f.state.transactions[f.inspection.work.work_id].prepareBody;
  delete f.state.transactions[f.inspection.work.work_id].preparedAt; await writeFile(f.options.stateFile, JSON.stringify(f.state));
  f.inspection.prepared_transaction = null; f.inspection.native_result = structuredClone(f.inspection.verified_native_result);
  f.inspection.mapping.destination_native_revision = f.baseline.plan.nativeResult.native_revision;
  f.inspection.mapping.synchronized_source_revision = f.baseline.plan.source.source_revision;
  const observed = await api.inspectCmsAttentionNative(f.options, f.inspection);
  assert.equal(observed.native_state, "baseline"); assert.equal(observed.issue, "none"); assert.equal(observed.candidate_sha256, null); assert.equal(observed.current_sha256, observed.baseline_sha256);
  recordInterop("actual_retained_baseline_before_new_plan", f.inspection, observed, "ready");
});

test("Check polls/reports durably and retries exact uncertain report without repair or duplicate native command", async t => {
  const f = await attentionFixture(t, false), service = recoveryService(f), before = await readFile(f.options.stateFile); service.loseReport();
  await assert.rejects(api.checkCmsAttention(f.options), /transport/);
  const pending = await readAttentionState(f.options); assert.equal(pending.inspectionsAfter, 1); assert.equal(pending.inspections[f.inspection.inspection_id].result, undefined);
  const result = await api.checkCmsAttention(f.options); assert.equal(result.inspections[0].status, "ready"); assert.deepEqual(service.reports[0], service.reports[1]);
  assert.deepEqual(await readFile(f.options.stateFile), before);
  assert.ok(service.requests.every(value => value.method === "GET" || value.pathname.endsWith("/report.json")));
});

test("positive successor uses exact new work/cycle/fence, retains old history, and survives lost claim response/restart", async t => {
  const f = await attentionFixture(t, false), service = recoveryService(f); await api.checkCmsAttention(f.options); const old = JSON.stringify(f.state.transactions[f.inspection.work.work_id]);
  const event = service.admit(); service.loseClaim(); await assert.rejects(api.synchronizeCmsAttentionRecoveries(f.options), /transport/);
  const resumed = await api.synchronizeCmsAttentionRecoveries(f.options); assert.deepEqual(resumed.installed, [event.work.work_id]); assert.deepEqual(service.claims[0], service.claims[1]);
  const state = JSON.parse(await readFile(f.options.stateFile, "utf8")); assert.equal(JSON.stringify(state.transactions[f.inspection.work.work_id]), old);
  const child = state.transactions[event.work.work_id]; assert.equal(child.stage, "claimed"); assert.equal(child.lease.work.attempt, 1); assert.notEqual(child.lease.work.attempt_cycle, f.inspection.work.attempt_cycle);
  assert.equal(child.lease.lease_generation, f.transaction.lease.lease_generation + 1); assert.deepEqual(child.attentionRecovery.source, event.source); assert.equal(child.plan, undefined);
  assert.deepEqual((await api.synchronizeCmsAttentionRecoveries(f.options)).installed, []);
});

test("new-lease reinspection blocks a foreign edit after admission without installing a child transaction", async t => {
  const f = await restoredFixture(t); await writeFile(f.transaction.plan.file, f.transaction.plan.previous); const service = recoveryService(f); await api.checkCmsAttention(f.options);
  const event = service.admit(); const foreign = f.transaction.plan.previous + "foreign native edit after admission\n"; await writeFile(f.transaction.plan.file, foreign);
  const result = await api.synchronizeCmsAttentionRecoveries(f.options); assert.deepEqual(result.blocked, [event.recovery_id]); assert.deepEqual(result.installed, []);
  assert.equal(JSON.parse(await readFile(f.options.stateFile, "utf8")).transactions[event.work.work_id], undefined); assert.equal(await readFile(f.transaction.plan.file, "utf8"), foreign);
});

test("restored-baseline successor prepares from its admitted Source without a new feed event and restart retains its own applied journal", async t => {
  const f = await restoredFixture(t); await writeFile(f.transaction.plan.file, f.transaction.plan.previous); const service = recoveryService(f); await api.checkCmsAttention(f.options);
  const before = JSON.parse(await readFile(f.options.stateFile, "utf8")), old = structuredClone(before.transactions[f.inspection.work.work_id]);
  const event = service.admit(); const installed = await api.synchronizeCmsAttentionRecoveries(f.options); assert.deepEqual(installed.installed, [event.work.work_id]);
  const staged = JSON.parse(await readFile(f.options.stateFile, "utf8")); staged.events = {}; await writeFile(f.options.stateFile, JSON.stringify(staged));
  const result = await prepareCmsNativeWork(f.options, event.work.work_id); assert.equal(result.stage, "prepared");
  const applied = await readFile(f.options.stateFile), actual = JSON.parse(applied); assert.deepEqual(actual.transactions[f.inspection.work.work_id], old);
  assert.equal(actual.transactions[event.work.work_id].plan.source.source_revision, event.source.source_revision); assert.equal(actual.transactions[event.work.work_id].plan.nativeResult.native_id, old.plan.nativeResult.native_id);
  assert.deepEqual((await api.synchronizeCmsAttentionRecoveries(f.options)).installed, []); assert.deepEqual(await readFile(f.options.stateFile), applied);
  assert.equal(service.claims.length, 1, "restart does not re-claim or re-inspect the predecessor after new native work");
});

test("native baseline command is explicit, durable and idempotent; Check does not run it", async t => {
  const f = await restoredFixture(t), observed = await api.inspectCmsAttentionNative(f.options, f.inspection);
  const restore = await api.restoreCmsAttentionBaseline(f.options, f.inspection, observed.journal_sha256); const before = await readFile(f.options.stateFile);
  const command = { executable: process.execPath, args: ["-e", "process.exit(0)"], cwd: f.root, timeoutMs: 5000 };
  const receipt = await api.runCmsAttentionBaselineCommand(f.options, restore.operationId, command); assert.equal(receipt.phase, "succeeded");
  assert.deepEqual(await api.runCmsAttentionBaselineCommand(f.options, restore.operationId, command), receipt); assert.deepEqual(await readFile(f.options.stateFile), before);
  await assert.rejects(api.runCmsAttentionBaselineCommand(f.options, restore.operationId, { ...command, args: ["-e", "process.exit(1)"] }), /unsettled or changed/);
  const journal = await readAttentionState(f.options); assert.equal(Object.keys(journal.commands).length, 1); assert.equal(Object.values(journal.commands)[0].terminationConfirmed, true);
});

test("restoration restart after actual write keeps native baseline even before public restoration; failed command never reruns implicitly", async t => {
  const f = await restoredFixture(t), observed = await api.inspectCmsAttentionNative(f.options, f.inspection);
  await assert.rejects(api.restoreCmsAttentionBaseline({ ...f.options, afterRestoreWritten: async () => { throw new Error("synthetic crash after actual native write"); } }, f.inspection, observed.journal_sha256), /synthetic crash/);
  assert.equal(await readFile(f.transaction.plan.file, "utf8"), f.transaction.plan.previous);
  const resumed = await api.restoreCmsAttentionBaseline({ ...f.options, publicFetchImplementation: async () => new Response("old public candidate", { status: 503 }) }, f.inspection, observed.journal_sha256);
  assert.equal(resumed.phase, "restored"); let starts = 0;
  const command = { executable: process.execPath, args: ["-e", "process.exit(1)"], cwd: f.root, timeoutMs: 5000 };
  const options = { ...f.options, spawnImplementation: (...args) => { starts++; return spawn(...args); } };
  await assert.rejects(api.runCmsAttentionBaselineCommand(options, resumed.operationId, command), /uncertain/);
  await assert.rejects(api.runCmsAttentionBaselineCommand(options, resumed.operationId, command), /unsettled/); assert.equal(starts, 1);
  const blocked = await api.inspectCmsAttentionNative(f.options, f.inspection); assert.equal(blocked.native_command, "uncertain"); assert.equal(blocked.issue, "uncertain_command");
});

test("one accepted inspection stays immutable; explicit later Core Check supplies a new instruction", async t => {
  const f = await attentionFixture(t, false), service = recoveryService(f); await api.checkCmsAttention(f.options); const report = structuredClone(service.reports[0]);
  await api.checkCmsAttention(f.options); assert.equal(service.reports.length, 1); assert.deepEqual(service.reports[0], report);
});

test("reversed inspection page stages no partial instruction or cursor; changed replay preserves prior evidence", async t => {
  const f = await attentionFixture(t, false), service = recoveryService(f), original = f.options.fetchImplementation;
  const first = { ...f.inspection, sequence: 2, inspection_id: uuid(630) }, second = { ...f.inspection, sequence: 1, inspection_id: uuid(631) };
  f.options.fetchImplementation = async (url, init) => new URL(url).pathname.endsWith("attention-inspections.json")
    ? Response.json({ items: [first, second], next_after: 2, has_more: false }) : original(url, init);
  // The shared codec can reject sequence ordering before the local continuation
  // guard. Either boundary must retain the entire prior journal and cursor.
  await assert.rejects(api.checkCmsAttention(f.options), /continuation|typed response/); assert.equal((await readAttentionState(f.options)).inspectionsAfter, 0); assert.equal(service.reports.length, 0);
  f.options.fetchImplementation = original; await api.checkCmsAttention(f.options); const before = await readFile(`${f.options.stateFile}.attention.json`);
  f.options.fetchImplementation = async (url, init) => new URL(url).pathname.endsWith("attention-inspections.json")
    ? Response.json({ items: [{ ...f.inspection, sequence: 2 }], next_after: 2, has_more: false }) : original(url, init);
  await assert.rejects(api.checkCmsAttention(f.options), /continuation/); assert.deepEqual(await readFile(`${f.options.stateFile}.attention.json`), before);
});

test("consumed CLI status and published file selection include the actual recovery controls without private body leakage", async t => {
  const f = await attentionFixture(t, false); recoveryService(f); await api.checkCmsAttention(f.options);
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "./test/register-runtime.mjs", "./dist/cli.js", "cms-attention-status", "--state-file", f.options.stateFile,
      "--docs-dir", f.options.docsDir, "--site-url", f.options.siteUrl], { cwd: new URL("../", import.meta.url), shell: false, windowsHide: true,
      env: { ...process.env, DISCUSSIONBRIDGE_SERVER_URL: f.options.serverUrl, DISCUSSIONBRIDGE_CONNECTION_ID: f.options.connectionId, DISCUSSIONBRIDGE_CONNECTION_SECRET: f.options.connectionSecret }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", errors = ""; child.stdout.on("data", data => { output += data; }); child.stderr.on("data", data => { errors += data; });
    child.once("error", reject); child.once("close", code => code === 0 ? resolve(output) : reject(new Error(errors)));
  });
  assert.equal(JSON.parse(result).inspections[0].workId, f.inspection.work.work_id); assert.doesNotMatch(result, /lease_token|connectionSecret|Complete native source|plan|before|candidate/);
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")); assert.ok(manifest.files.includes("dist")); assert.ok(manifest.files.includes("src/private"));
  for (const name of ["cms-attention", "cms-attention-state", "cms-attention-native", "cms-attention-types", "cms-attention-command"]) {
    await readFile(new URL(`../dist/${name}.js`, import.meta.url)); await readFile(new URL(`../dist/${name}.d.ts`, import.meta.url));
  }
  const artifacts = JSON.parse(await readFile(new URL("../src/private/ARTIFACTS.json", import.meta.url), "utf8")); assert.equal(artifacts.candidate_id, candidateId);
  for (const member of artifacts.members.filter(value => ["src/cms-schema.json", "src/cms-runtime.mjs"].includes(value.path))) assert.equal(hash(await readFile(new URL(`../src/private/${member.path.split("/").at(-1)}`, import.meta.url))), member.sha256);
});

test("r6 keeps historical r5 private refusal/capture/request provenance readable and never resends the terminal request", async t => {
  const f = await toFixture(t), original = f.options.controlledCreation.fetchImplementation; let requests = 0;
  f.options.controlledCreation.fetchImplementation = async (url, init) => {
    if (new URL(url).pathname.endsWith("/resolve.json")) { requests++; return Response.json({ outcome: "rejected", code: "invalid_field", retryable: false, retry_after_seconds: null, correlation_id: null, core_fallback: false }, { status: 422 }); }
    return original(url, init);
  };
  await assert.rejects(publishControlledDiscussions(f.options), /invalid_field/);
  const journal = await f.journal(), operation = Object.values(journal.operations)[0], id = operation.to.pending.body.mutation_id;
  for (const request of [operation.to.pending, operation.to.rejectedRequests[id]]) Object.assign(request.rejection.validatedResponse,
    { candidateId: "discussionbridge-v4-core-20261015-r5", schemaSha256: "7dee282601e4195459f38b2f2451a5f0f03af39a5f60affc65c49b34664e3f7a", contractSha256: "dcea4fb6ad3003e0c81e3aaf0e2c8d38c90270f9754c62e97859d10ead69d4fe" });
  await writeFile(f.options.stateFile, JSON.stringify(journal)); const pending = structuredClone(operation.to.pending), captures = structuredClone(operation.to.articleCaptures);
  await readPublicationOperationalState(f.options.stateFile); await assert.rejects(publishControlledDiscussions(f.options), /invalid_field/);
  const restored = Object.values((await f.journal()).operations)[0]; assert.deepEqual(restored.to.pending, pending); assert.deepEqual(restored.to.articleCaptures, captures);
  assert.deepEqual(restored.to.rejectedRequests[id], operation.to.rejectedRequests[id]); assert.equal(requests, 1); assert.equal(restored.to.pending.rejection.validatedResponse.candidateId, "discussionbridge-v4-core-20261015-r5");
});

async function withdrawnFixture(t, prepared = false) {
  const f = await staticFixture(t, {}, undefined, "simple"); await f.prepare();
  let state = JSON.parse(await readFile(f.options.stateFile, "utf8")); const published = state.transactions[f.claimed.workId];
  const rendered = await (await createMarkdownProcessor()).render(published.plan.output.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, ""));
  const built = `<html><body><article data-discussionbridge-cms-native="${published.plan.nativeResult.native_id}" data-discussionbridge-cms-resource="${f.nativeMapping.resource_id}" data-discussionbridge-cms-revision="${f.sourceRecord.source_revision}" data-discussionbridge-cms-mode="simple"><h1 data-discussionbridge-cms-title>${f.sourceRecord.title}</h1>${rendered.code}<section data-discussionbridge-mode="simple" data-discussionbridge-simple data-topic-id="${f.sourceRecord.topic_id}"></section></article></body></html>`;
  const publishedAt = new Date().toISOString(), publicationProof = await verifyCmsPublication(await f.expectation(built), { deploymentId: uuid(640), deployedAt: publishedAt }, async () => new Response(built, { headers: { "Content-Type": "text/html" } }));
  const finalize = (transaction, proof, deploymentId, deployedAt) => ({ mutation_id: uuid(deploymentId + 100), authority: { work_id: transaction.lease.work.work_id,
    lease_token: transaction.lease.lease_token, lease_generation: transaction.lease.lease_generation, source_revision: transaction.lease.work.source_revision, policy_revision: transaction.lease.work.policy_revision },
    transaction_id: transaction.transactionId, deployment_id: uuid(deploymentId), deployed_at: deployedAt, verification: proof });
  published.stage = "verified"; published.buildArtifact = { html: built, sha256: hash(built), builtAt: publishedAt }; published.finalizeBody = finalize(published, publicationProof, 640, publishedAt);
  f.nativeWork.state = "verified"; f.nativeMapping.publicly_verified_source_revision = published.lease.work.source_revision; f.nativeMapping.publicly_verified_at = publicationProof.checked_at;
  state.mappings[f.sourceRecord.source_id] = structuredClone(f.nativeMapping); await writeFile(f.options.stateFile, JSON.stringify(state));
  const withdrawal = await f.nextAction("withdraw"); await prepareCmsNativeWork(f.options, withdrawal.workId);
  state = JSON.parse(await readFile(f.options.stateFile, "utf8")); const withdrawn = state.transactions[withdrawal.workId], withdrawnAt = new Date().toISOString();
  const absence = await verifyCmsAbsence(f.nativeMapping.canonical_url, withdrawn.plan.nativeResult.native_id, withdrawn.preparedAt,
    { deploymentId: uuid(641), deployedAt: withdrawnAt }, async () => new Response(null, { status: 404 }));
  withdrawn.stage = "verified"; withdrawn.buildArtifact = { html: null, sha256: null, builtAt: withdrawnAt }; withdrawn.finalizeBody = finalize(withdrawn, absence, 641, withdrawnAt);
  f.nativeWork.state = "verified"; f.nativeMapping.publicly_verified_source_revision = null; f.nativeMapping.publicly_verified_at = absence.checked_at; f.nativeMapping.mapping_state = "withdrawn";
  state.mappings[f.sourceRecord.source_id] = structuredClone(f.nativeMapping); await writeFile(f.options.stateFile, JSON.stringify(state));
  const workId = f.queuePublication("<p>New source after a previously verified withdrawal.</p>"); await pollCmsSources(f.options); await reserveCmsSource(f.options, f.sourceRecord.source_id); await claimCmsNativeWork(f.options);
  if (prepared) await prepareCmsNativeWork(f.options, workId);
  state = JSON.parse(await readFile(f.options.stateFile, "utf8")); const transaction = state.transactions[workId]; transaction.stage = "attention";
  await writeFile(f.options.stateFile, JSON.stringify(state)); f.nativeWork.state = "attention";
  const work = structuredClone(f.nativeWork), mapping = structuredClone(f.nativeMapping), inspection = { sequence: 1, inspection_id: uuid(prepared ? 643 : 642), context_sha256: "c".repeat(64), work, mapping,
    source: structuredClone(f.sourceRecord), native_result: transaction.plan?.nativeResult ?? withdrawn.plan.nativeResult, verified_native_result: withdrawn.plan.nativeResult, verification: absence,
    prepared_transaction: transaction.plan ? { transaction_id: transaction.transactionId, work_id: workId, lease_generation: transaction.lease.lease_generation, action: work.action,
      source_revision: work.source_revision, policy_revision: work.policy_revision, native_result: transaction.plan.nativeResult, prepared_at: transaction.preparedAt, deployment_id: null, deployed_at: null } : null,
    created_at: new Date().toISOString() };
  const original = f.options.fetchImplementation;
  f.options = { ...f.options, publicFetchImplementation: async () => new Response(null, { status: 404 }), fetchImplementation: async (url, init) => new URL(url).pathname === `/discussion-bridge/v4/work/${workId}.json`
    ? Response.json({ work, mapping, lease_expires_at: null }) : original(url, init) };
  return { ...f, inspection, transaction, state, withdrawn, published };
}

test("withdrawn baseline uses the actual retained owned draft file, null build manifest and fresh public absence", async t => {
  const f = await withdrawnFixture(t), before = await readFile(f.options.stateFile), native = await readFile(f.withdrawn.plan.file);
  const observed = await api.inspectCmsAttentionNative(f.options, f.inspection);
  assert.equal(observed.native_state, "baseline"); assert.equal(observed.issue, "none"); assert.equal(observed.object_exists, true);
  assert.equal(observed.native_result.kind, "withdraw"); assert.equal(observed.verification.kind, "absent"); assert.equal(observed.verification.http_status, 404);
  assert.equal(observed.source_revision, f.published.plan.source.source_revision, "actual retained receipt revision is not fabricated as null");
  assert.equal(observed.current_sha256, observed.baseline_sha256); assert.deepEqual(await readFile(f.options.stateFile), before); assert.deepEqual(await readFile(f.withdrawn.plan.file), native);
  recordInterop("actual_owned_withdrawn_baseline", f.inspection, observed, "ready");
  const gone = await api.inspectCmsAttentionNative({ ...f.options, publicFetchImplementation: async () => new Response(null, { status: 410 }) }, f.inspection);
  assert.equal(gone.verification.http_status, 410); recordInterop("actual_owned_withdrawn_baseline_gone", f.inspection, gone, "ready");
});

test("restored withdrawn baseline can settle into a new fenced successor and resume normal publication without erasing history", async t => {
  const f = await withdrawnFixture(t, true), old = structuredClone(f.state.transactions[f.inspection.work.work_id]);
  const candidate = await api.inspectCmsAttentionNative(f.options, f.inspection); assert.equal(candidate.native_state, "candidate_applied");
  const restored = await api.restoreCmsAttentionBaseline(f.options, f.inspection, candidate.journal_sha256); assert.equal(restored.phase, "restored");
  const observed = await api.inspectCmsAttentionNative(f.options, f.inspection); assert.equal(observed.native_state, "restored_baseline"); assert.equal(observed.issue, "none"); assert.equal(observed.verification.kind, "absent");
  recordInterop("actual_restored_owned_withdrawn_baseline", f.inspection, observed, "ready");
  const service = recoveryService(f); await api.checkCmsAttention(f.options); const event = service.admit();
  assert.deepEqual((await api.synchronizeCmsAttentionRecoveries(f.options)).installed, [event.work.work_id]);
  assert.equal((await prepareCmsNativeWork(f.options, event.work.work_id)).stage, "prepared");
  const state = JSON.parse(await readFile(f.options.stateFile, "utf8")); assert.deepEqual(state.transactions[f.inspection.work.work_id], old); assert.equal(state.transactions[f.withdrawn.lease.work.work_id].stage, "verified");
  assert.equal(state.transactions[event.work.work_id].plan.nativeResult.native_id, f.withdrawn.plan.nativeResult.native_id); assert.doesNotMatch(state.transactions[event.work.work_id].plan.output, /^draft: true$/m);
  const before = await readFile(f.options.stateFile); assert.deepEqual((await api.synchronizeCmsAttentionRecoveries(f.options)).installed, []); assert.deepEqual(await readFile(f.options.stateFile), before);
});

test("withdrawn baseline refuses bad null-manifest hash, missing absence, foreign draft edit and deleted known native identity", async t => {
  const f = await withdrawnFixture(t), file = f.withdrawn.plan.file, original = await readFile(file, "utf8"), before = await readFile(f.options.stateFile);
  f.state.transactions[f.withdrawn.lease.work.work_id].buildArtifact.sha256 = "a".repeat(64); await writeFile(f.options.stateFile, JSON.stringify(f.state));
  const bad = await api.inspectCmsAttentionNative(f.options, f.inspection); assert.equal(bad.issue, "baseline_missing");
  await writeFile(f.options.stateFile, before);
  const publicMissing = await api.inspectCmsAttentionNative({ ...f.options, publicFetchImplementation: async () => new Response("still public", { status: 200 }) }, f.inspection);
  assert.equal(publicMissing.issue, "public_proof_unavailable"); recordInterop("withdrawn_baseline_without_current_absence", f.inspection, publicMissing, "not_ready");
  await writeFile(file, original + "foreign draft change\n"); const foreign = await api.inspectCmsAttentionNative(f.options, f.inspection); assert.equal(foreign.native_state, "conflict");
  await writeFile(file, original); await unlink(file); const deleted = await api.inspectCmsAttentionNative(f.options, f.inspection); assert.notEqual(deleted.native_state, "never_applied"); assert.notEqual(deleted.issue, "none");
  recordInterop("withdrawn_known_native_file_deleted", f.inspection, deleted, "not_ready"); assert.deepEqual(await readFile(f.options.stateFile), before);
});

test("native Restore refuses missing prior verified baseline and leaves current files/history unchanged", async t => {
  available(); assert.equal(typeof api.restoreCmsAttentionBaseline, "function");
  const f = await attentionFixture(t), before = await readFile(f.options.stateFile), nativeBefore = await readFile(f.transaction.plan.file);
  const observed = await api.inspectCmsAttentionNative(f.options, f.inspection);
  await assert.rejects(api.restoreCmsAttentionBaseline(f.options, f.inspection, observed.journal_sha256), /baseline/i);
  assert.deepEqual(await readFile(f.options.stateFile), before); assert.deepEqual(await readFile(f.transaction.plan.file), nativeBefore);
});
