import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { CmsRequestError } from "../dist/cms-client.js";
import { publishControlledDiscussions, stageControlledSourceRetry } from "../dist/controlled-creation.js";
import { readPublicationOperationalState } from "../dist/operational-state.js";
import { semanticIdentity } from "../src/private/cms-runtime.mjs";
import { nativeSource, toFixture } from "./fixtures/cms-to.mjs";
import { buildToConsumer } from "./fixtures/native-to-consumer.mjs";
import { ownedPng } from "./helpers/native-png.mjs";

const refusal = { outcome: "rejected", code: "invalid_field", retryable: false, retry_after_seconds: null, correlation_id: null, core_fallback: false };
const isRefused = error => error instanceof CmsRequestError && error.code === "invalid_field" && error.routeId === "V4-02" && error.httpStatus === 422 && error.retryable === false;
const operation = async state => Object.values((await state.journal()).operations)[0];
function intercept(state, response = () => Response.json(refusal, { status: 422 })) {
  const original = state.options.controlledCreation.fetchImplementation, calls = [];
  let rejecting = true, beforeDispatch;
  state.options.controlledCreation.fetchImplementation = async (url, init) => {
    if (new URL(url).pathname.endsWith("/resolve.json")) {
      calls.push(init.body); await beforeDispatch?.(JSON.parse(init.body));
      if (rejecting) return response();
    }
    return original(url, init);
  };
  return { calls, allow() { rejecting = false; }, inspect(callback) { beforeDispatch = callback; } };
}
async function rejectCurrent(state, intercepted = intercept(state)) {
  await assert.rejects(publishControlledDiscussions(state.options), isRefused);
  return { intercepted, rejected: structuredClone((await operation(state)).to.pending) };
}

test("typed invalid_field422 stops unchanged builds; explicit first-source Retry persists one linked fresh request with unchanged edition", async t => {
  const state = await toFixture(t), original = await readFile(state.file, "utf8");
  const { intercepted, rejected } = await rejectCurrent(state);
  assert.equal(rejected.rejection.requestSha256, state.digest(semanticIdentity(rejected.body)));
  await assert.rejects(publishControlledDiscussions(state.options), isRefused); assert.equal(intercepted.calls.length, 1);
  const staged = await stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id);
  assert.deepEqual(staged, { externalId: (await operation(state)).externalId, refusedMutationId: rejected.body.mutation_id, phase: "armed", requestCreated: false, requiresNativeBuild: true });
  assert.deepEqual((await operation(state)).to.pending, rejected); assert.equal(intercepted.calls.length, 1);
  await assert.rejects(stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id), /already staged or consumed/);
  intercepted.allow();
  intercepted.inspect(async body => {
    const current = await operation(state), link = current.to.retryIntents[rejected.body.mutation_id];
    assert.equal(link.phase, "pending"); assert.equal(link.freshMutationId, body.mutation_id);
    assert.equal(current.to.pending.retryOf, rejected.body.mutation_id);
    assert.deepEqual(current.to.pending.body, body); assert.deepEqual(current.to.rejectedRequests[rejected.body.mutation_id], rejected);
  });
  await publishControlledDiscussions(state.options);
  const final = await operation(state), sent = JSON.parse(intercepted.calls[1]);
  assert.notEqual(sent.mutation_id, rejected.body.mutation_id); assert.deepEqual(sent.bridge_record, rejected.body.bridge_record);
  assert.equal(final.to.acceptedRevision, rejected.body.bridge_record.source_revision); assert.equal(state.state.creations, 1);
  assert.equal(final.to.retryIntents[rejected.body.mutation_id].phase, "accepted"); assert.equal(final.to.pending, undefined);
  assert.equal(final.to.receipts[sent.mutation_id].retryOf, rejected.body.mutation_id);
  assert.deepEqual(final.to.rejectedRequests[rejected.body.mutation_id], rejected);
  await assert.rejects(stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id), /exact current request/);
  assert.equal(intercepted.calls.length, 2); assert.equal((await readFile(state.file, "utf8")).includes(original.split("---\n").at(-1)), true);
});

test("bound Retry checks actual scoped predecessor, retains accepted A, and does not mint a new refused edition", async t => {
  const state = await toFixture(t); await publishControlledDiscussions(state.options);
  const accepted = structuredClone(await operation(state)), source = await readFile(state.file, "utf8");
  await writeFile(state.file, source.replace("Native body.", "Genuine native B."));
  const { intercepted, rejected } = await rejectCurrent(state);
  state.state.record.source_revision = "unrelated-current-revision";
  await assert.rejects(stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id), /exact current scoped accepted predecessor/);
  assert.equal((await operation(state)).to.retryIntents, undefined);
  state.state.record.source_revision = accepted.to.acceptedRevision;
  await stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id);
  state.state.record.source_revision = "changed-after-operator-action"; intercepted.allow();
  await assert.rejects(publishControlledDiscussions(state.options), /exact current accepted predecessor/); assert.equal(intercepted.calls.length, 1);
  state.state.record.source_revision = accepted.to.acceptedRevision;
  await publishControlledDiscussions(state.options);
  const current = await operation(state), body = JSON.parse(intercepted.calls[1]);
  assert.deepEqual(body.bridge_record, rejected.body.bridge_record); assert.equal(body.bridge_record.expected_source_revision, accepted.to.acceptedRevision);
  assert.equal(current.resourceId, accepted.resourceId); assert.equal(current.topicId, accepted.topicId); assert.equal(state.state.creations, 1);
  assert.deepEqual(current.to.receipts[accepted.to.acceptedBody.mutation_id], accepted.to.receipts[accepted.to.acceptedBody.mutation_id]);
});

test("successful unchanged Retry does not let an older same-revision refusal poison later ordinary no-change publication", async t => {
  const state = await toFixture(t); await publishControlledDiscussions(state.options);
  const accepted = structuredClone(await operation(state)), { intercepted, rejected } = await rejectCurrent(state);
  assert.equal(rejected.body.bridge_record.source_revision, accepted.to.acceptedRevision);
  assert.equal(rejected.body.bridge_record.expected_source_revision, accepted.to.acceptedRevision);
  await stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id); intercepted.allow();
  await publishControlledDiscussions(state.options); await publishControlledDiscussions(state.options);
  const current = await operation(state);
  assert.equal(intercepted.calls.length, 3); assert.equal(state.state.creations, 1); assert.equal(current.to.acceptedRevision, accepted.to.acceptedRevision);
  assert.deepEqual(JSON.parse(intercepted.calls[1]).bridge_record, rejected.body.bridge_record);
  assert.deepEqual(current.to.rejectedRequests[rejected.body.mutation_id], rejected);
});

test("another definitive refusal is terminal with both exact requests retained; stale original action cannot mint another", async t => {
  const state = await toFixture(t), { intercepted, rejected } = await rejectCurrent(state);
  await stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id);
  await assert.rejects(publishControlledDiscussions(state.options), isRefused);
  const current = await operation(state), second = structuredClone(current.to.pending);
  assert.equal(intercepted.calls.length, 2); assert.notEqual(second.body.mutation_id, rejected.body.mutation_id);
  assert.deepEqual(second.body.bridge_record, rejected.body.bridge_record); assert.equal(second.retryOf, rejected.body.mutation_id);
  assert.deepEqual(current.to.rejectedRequests[rejected.body.mutation_id], rejected);
  assert.deepEqual(current.to.rejectedRequests[second.body.mutation_id], second);
  assert.equal(current.to.retryIntents[rejected.body.mutation_id].phase, "rejected");
  await assert.rejects(publishControlledDiscussions(state.options), isRefused); assert.equal(intercepted.calls.length, 2);
  await assert.rejects(stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id), /exact current request/);
  await stageControlledSourceRetry(state.options, state.file, second.body.mutation_id); intercepted.allow();
  await publishControlledDiscussions(state.options);
  const final = await operation(state), third = JSON.parse(intercepted.calls[2]);
  assert.notEqual(third.mutation_id, second.body.mutation_id); assert.deepEqual(third.bridge_record, rejected.body.bridge_record);
  assert.equal(final.to.receipts[third.mutation_id].retryOf, second.body.mutation_id);
  assert.deepEqual(final.to.rejectedRequests[rejected.body.mutation_id], rejected); assert.deepEqual(final.to.rejectedRequests[second.body.mutation_id], second);
});

test("uncertain explicit successor is replayed exactly after restart; no second Retry action replaces it", async t => {
  const state = await toFixture(t), { intercepted, rejected } = await rejectCurrent(state);
  await stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id); intercepted.allow(); state.state.lostResponse = true;
  await assert.rejects(publishControlledDiscussions(state.options));
  const pending = structuredClone((await operation(state)).to.pending);
  assert.equal(pending.rejection, undefined); assert.equal(pending.retryOf, rejected.body.mutation_id); assert.equal(state.state.creations, 1);
  await assert.rejects(stageControlledSourceRetry(state.options, state.file, pending.body.mutation_id), /witnessed typed/);
  await publishControlledDiscussions(state.options);
  assert.equal(intercepted.calls[1], intercepted.calls[2]); assert.deepEqual(JSON.parse(intercepted.calls[2]), pending.body); assert.equal(state.state.creations, 1);
  assert.equal((await operation(state)).to.retryIntents[rejected.body.mutation_id].phase, "accepted");
});

test("absent historical diagnostics and capture remain unknown, without waiving current complete capture or request linkage", async t => {
  const state = await toFixture(t), { intercepted, rejected } = await rejectCurrent(state), journal = await state.journal();
  const saved = Object.values(journal.operations)[0].to;
  for (const entry of [saved.pending, saved.rejectedRequests[rejected.body.mutation_id]]) {
    delete entry.captureId; delete entry.rejection.recordedAt;
    for (const key of ["requestSha256", "candidateId", "schemaSha256", "contractSha256"]) delete entry.rejection.validatedResponse[key];
    delete entry.rejection.validatedResponse.envelope.correlation_id;
  }
  await writeFile(state.options.stateFile, JSON.stringify(journal));
  await readPublicationOperationalState(state.options.stateFile);
  const historical = structuredClone(saved.rejectedRequests[rejected.body.mutation_id]);
  await stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id); intercepted.allow();
  await publishControlledDiscussions(state.options);
  const current = await operation(state);
  assert.deepEqual(current.to.rejectedRequests[rejected.body.mutation_id], historical);
  assert.deepEqual(JSON.parse(intercepted.calls[1]).bridge_record, rejected.body.bridge_record);
  assert.ok(current.to.acceptedCaptureId); assert.equal(current.to.articleCaptures[current.to.acceptedCaptureId].preparedSha256, rejected.body.bridge_record.source_content_sha256);
});

test("generic, spoofed or malformed refusals cannot authorize Retry or discard an uncertain request", async t => {
  for (const [name, response] of [
    ["transport", () => { throw new Error("Synthetic transport uncertainty"); }],
    ["spoofed", () => { throw new CmsRequestError("invalid_field", false, null, "V4-02", 422); }],
    ["wrong status", () => Response.json(refusal, { status: 400 })],
    ["malformed", () => Response.json({ ...refusal, extra: true }, { status: 422 })],
  ]) await t.test(name, async child => {
    const state = await toFixture(child), intercepted = intercept(state, response);
    await assert.rejects(publishControlledDiscussions(state.options));
    const before = structuredClone((await operation(state)).to.pending);
    assert.equal(before.rejection, undefined);
    await assert.rejects(stageControlledSourceRetry(state.options, state.file, before.body.mutation_id), /witnessed typed/);
    assert.deepEqual((await operation(state)).to.pending, before); assert.equal((await operation(state)).to.retryIntents, undefined);
    intercepted.allow(); await publishControlledDiscussions(state.options); assert.equal(intercepted.calls[0], intercepted.calls[1]);
  });
});

test("a validated invalid_field from another route cannot classify or replace the exact uncertain To02 request", async t => {
  const state = await toFixture(t); await publishControlledDiscussions(state.options);
  await writeFile(state.file, (await readFile(state.file, "utf8")).replace("Native body.", "Genuine current edit."));
  const original = state.options.controlledCreation.fetchImplementation;
  let rejectResolve = true, rejectDetail = false;
  state.options.controlledCreation.fetchImplementation = async (url, init) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/resolve.json") && rejectResolve) throw new Error("Synthetic uncertain To02");
    if (pathname.endsWith(`/${state.state.record.resource_id}.json`) && rejectDetail) return Response.json(refusal, { status: 422 });
    return original(url, init);
  };
  await assert.rejects(publishControlledDiscussions(state.options)); const pending = structuredClone((await operation(state)).to.pending);
  rejectDetail = true;
  await assert.rejects(publishControlledDiscussions(state.options));
  assert.deepEqual((await operation(state)).to.pending, pending); assert.equal((await operation(state)).to.rejectedRequests, undefined);
  await assert.rejects(stageControlledSourceRetry(state.options, state.file, pending.body.mutation_id), /witnessed typed/);
  rejectDetail = false; rejectResolve = false; await publishControlledDiscussions(state.options);
  assert.deepEqual(state.received.at(-1), pending.body);
});

test("a genuine changed snapshot after staging follows ordinary edition flow and retains the superseded action/refusal", async t => {
  const state = await toFixture(t), { intercepted, rejected } = await rejectCurrent(state);
  await stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id);
  await writeFile(state.file, (await readFile(state.file, "utf8")).replace("Native body.", "Actual later current native edit.")); intercepted.allow();
  await publishControlledDiscussions(state.options);
  const current = await operation(state), body = JSON.parse(intercepted.calls[1]);
  assert.notEqual(body.bridge_record.source_revision, rejected.body.bridge_record.source_revision);
  assert.equal(current.to.retryIntents[rejected.body.mutation_id].phase, "superseded");
  assert.equal(current.to.retryIntents[rejected.body.mutation_id].freshMutationId, undefined);
  assert.equal(current.to.receipts[body.mutation_id].retryOf, undefined); assert.deepEqual(current.to.rejectedRequests[rejected.body.mutation_id], rejected);
});

test("source byte CAS, current eligibility and exact request linkage remain required for selected Retry", async t => {
  const state = await toFixture(t), { intercepted, rejected } = await rejectCurrent(state);
  const original = await readFile(state.file, "utf8");
  await writeFile(state.file, original.replace("discussionSync: true", "discussionSync: false"));
  await assert.rejects(stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id), /published eligible/);
  await writeFile(state.file, original); await stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id);
  await writeFile(state.file, original.replace("consumerField: retained", "consumerField: changed")); intercepted.allow();
  await assert.rejects(publishControlledDiscussions(state.options), /native file changed after the explicit action/); assert.equal(intercepted.calls.length, 1);
  const journal = await state.journal(), to = Object.values(journal.operations)[0].to;
  to.pending.rejection.requestSha256 = "0".repeat(64); to.rejectedRequests[rejected.body.mutation_id].rejection.requestSha256 = "0".repeat(64);
  await writeFile(state.options.stateFile, JSON.stringify(journal));
  await assert.rejects(readPublicationOperationalState(state.options.stateFile), /exact retained request/);
});

test("native asset Retry consumes fresh actual Content capture through the existing build handoff", async t => {
  const article = "![Native image](../assets/native.png)", state = await toFixture(t, nativeSource(article), "53"), intercepted = intercept(state);
  await mkdir(path.join(state.root, "src/content/assets"), { recursive: true }); await writeFile(path.join(state.root, "src/content/assets/native.png"), ownedPng());
  await assert.rejects(buildToConsumer(state, undefined, true), isRefused);
  const rejected = structuredClone((await operation(state)).to.pending);
  await stageControlledSourceRetry(state.options, state.file, rejected.body.mutation_id); intercepted.allow();
  const html = await buildToConsumer(state, undefined, true), current = await operation(state);
  assert.match(html, /Native image/); assert.equal(state.state.creations, 1); assert.equal(intercepted.calls.length, 2);
  assert.deepEqual(JSON.parse(intercepted.calls[1]).bridge_record, rejected.body.bridge_record);
  assert.equal(current.to.retryIntents[rejected.body.mutation_id].phase, "accepted"); assert.equal(current.nativeRender, undefined);
});

test("a native Content refusal resumes its actual capture phase without publishing the earlier pre-build representation", async t => {
  const state = await toFixture(t, nativeSource('```json\n{"native":true}\n```'), "53"), original = state.options.controlledCreation.fetchImplementation, requests = [];
  let rejectNative = true;
  state.options.controlledCreation.fetchImplementation = async (url, init) => {
    if (new URL(url).pathname.endsWith("/resolve.json")) {
      requests.push(JSON.parse(init.body));
      if (requests.length > 1 && rejectNative) return Response.json(refusal, { status: 422 });
    }
    return original(url, init);
  };
  await assert.rejects(buildToConsumer(state, undefined, true, true), isRefused);
  const current = await operation(state), refused = structuredClone(current.to.pending), before = await readFile(state.file, "utf8");
  assert.equal(requests.length, 2); assert.ok(current.nativeRender); assert.equal(state.state.creations, 1);
  assert.notEqual(requests[0].bridge_record.source_content_sha256, refused.body.bridge_record.source_content_sha256);
  await stageControlledSourceRetry(state.options, state.file, refused.body.mutation_id); rejectNative = false;
  const waiting = await publishControlledDiscussions(state.options);
  assert.equal(waiting[0].status, "skipped"); assert.equal(requests.length, 2);
  assert.deepEqual((await operation(state)).to.pending, refused);
  assert.equal((await operation(state)).to.retryIntents[refused.body.mutation_id].phase, "armed");
  await buildToConsumer(state, undefined, true, true);
  const settled = await operation(state);
  assert.equal(requests.length, 3); assert.deepEqual(requests[2].bridge_record, refused.body.bridge_record);
  assert.equal(settled.to.retryIntents[refused.body.mutation_id].phase, "accepted"); assert.equal(settled.nativeRender, undefined);
  assert.equal(state.state.creations, 1); assert.equal(settled.resourceId, current.resourceId); assert.equal(settled.topicId, current.topicId);
  assert.equal((await readFile(state.file, "utf8")).split("---\n").at(-1), before.split("---\n").at(-1));
});
