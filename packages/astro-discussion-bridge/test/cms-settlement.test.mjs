import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";
import { cmsNativeReservation } from "../dist/cms-coordinator.js";
import { abortCmsNativeWork, finalizeCmsNativeWork, prepareCmsNativeWork, recordCmsNativeBuild } from "../dist/cms-static.js";
import { buildCmsConsumer, staticFixture } from "./fixtures/cms-static.mjs";

const deployment = () => ({ deploymentId: "synthetic-deployment-receipt", deployedAt: new Date().toISOString() });
const served = html => async () => new Response(html, { headers: { "Content-Type": "text/html" } });
const journal = state => readFile(state.options.stateFile, "utf8").then(JSON.parse);

test("static settlement retains exact transactions, observed artifacts and actual verification receipts", async t => {
  const builtState = await staticFixture(t); await builtState.prepare();
  const built = await buildCmsConsumer(builtState);
  async function fixture(child) {
    const state = await staticFixture(child); await state.prepare();
    const output = path.join(state.root, "dist", new URL(state.nativeMapping.canonical_url).pathname, "index.html");
    await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, built);
    await recordCmsNativeBuild(state.options, path.join(state.root, "dist"));
    return state;
  }
  await t.test("uncertain finalize replays the exact proof/id without another public fetch", async child => {
    const state = await fixture(child), receipt = deployment(); let calls = 0;
    const options = { ...state.options, publicFetchImplementation: async (...args) => { calls++; return served(built)(...args); } };
    state.loseNext("finalize"); await assert.rejects(finalizeCmsNativeWork(options, state.claimed.workId, receipt));
    const pending = (await journal(state)).transactions[state.claimed.workId];
    assert.equal(pending.publiclyVerifiedAt, undefined); assert.equal(pending.stage, "prepared");
    await assert.rejects(finalizeCmsNativeWork(options, state.claimed.workId, { ...receipt, deploymentId: "different" }), /exact deployment/);
    const result = await finalizeCmsNativeWork(options, state.claimed.workId, receipt);
    assert.equal(result.stage, "verified"); assert.equal(calls, 1); assert.deepEqual(state.finalized[1], state.finalized[0]);
    assert.equal(result.publiclyVerifiedAt, state.finalized[0].verification.checked_at);
    assert.notEqual(state.finalized[0].verification.native_publication_sha256, state.finalized[0].verification.source_content_sha256);
  });
  await t.test("public failure enters attention and exact uncertain failure replay grants no new abort authority", async child => {
    const state = await fixture(child), receipt = deployment(); let calls = 0;
    const options = { ...state.options, publicFetchImplementation: async () => { calls++; return new Response("copied marker without actual source", { headers: { "Content-Type": "text/html" } }); } };
    state.loseNext("fail"); await assert.rejects(finalizeCmsNativeWork(options, state.claimed.workId, receipt));
    await assert.rejects(finalizeCmsNativeWork(options, state.claimed.workId, receipt), /public verification failed/);
    assert.equal(calls, 1); assert.deepEqual(state.failures[1], state.failures[0]); assert.equal(state.failures[0].code, "public_verification_failed");
    assert.equal((await journal(state)).transactions[state.claimed.workId].stage, "attention"); assert.equal(state.finalized.length, 0);
    await assert.rejects(abortCmsNativeWork(state.options, state.claimed.workId), /eligible/);
    assert.match(await readFile(cmsNativeReservation(state.options, state.sourceRecord).file, "utf8"), /Complete native source/);
  });
  await t.test("explicit abort removes only exact new owned file and replays uncertain receipt", async child => {
    const state = await staticFixture(child); await state.prepare(); state.loseNext("abort");
    await assert.rejects(abortCmsNativeWork(state.options, state.claimed.workId));
    await assert.rejects(readFile(cmsNativeReservation(state.options, state.sourceRecord).file), { code: "ENOENT" });
    const result = await abortCmsNativeWork(state.options, state.claimed.workId);
    assert.equal(result.nativeRestored, true); assert.equal(result.stage, "aborted"); assert.deepEqual(state.aborted[1], state.aborted[0]);
    assert.equal((await journal(state)).generations[state.nativeMapping.mapping_id], 1, "abort never resets the fence");
  });
  await t.test("unsafe restoration reports false and preserves actual operator edits", async child => {
    const state = await staticFixture(child); await state.prepare(); const file = cmsNativeReservation(state.options, state.sourceRecord).file;
    const edited = (await readFile(file, "utf8")).replace("Complete native source.", "Operator local edit."); await writeFile(file, edited);
    const result = await abortCmsNativeWork(state.options, state.claimed.workId);
    assert.equal(result.nativeRestored, false); assert.equal(result.stage, "attention"); assert.equal(await readFile(file, "utf8"), edited);
    assert.equal(state.aborted[0].native_restored, false); assert.equal(state.finalized.length, 0);
  });
  await t.test("actual native withdrawal build plus404 proof preserves identity across restored source", async child => {
    const state = await fixture(child); await finalizeCmsNativeWork({ ...state.options, publicFetchImplementation: served(built) }, state.claimed.workId, deployment());
    const identity = { ...state.nativeMapping }, file = cmsNativeReservation(state.options, state.sourceRecord).file;
    await writeFile(file, (await readFile(file, "utf8")).replace(/^---\n/u, "---\nconsumerAssignment: Keep native default\n"));
    const withdrawal = await state.nextAction("withdraw"); await prepareCmsNativeWork(state.options, withdrawal.workId);
    await assert.rejects(buildCmsConsumer(state), { code: "ENOENT" });
    await recordCmsNativeBuild(state.options, path.join(state.root, "dist"));
    const result = await finalizeCmsNativeWork({ ...state.options, publicFetchImplementation: async () => new Response(null, { status: 404 }) }, withdrawal.workId, deployment());
    assert.equal(result.stage, "verified"); assert.equal(state.finalized.at(-1).verification.kind, "absent");
    const restored = await state.nextAction("publish_revision"); await prepareCmsNativeWork(state.options, restored.workId);
    const fields = parseYaml(/^---\n([\s\S]*?)\n---\n/u.exec(await readFile(file, "utf8"))[1]);
    assert.equal(fields.draft, undefined); assert.equal(fields.consumerAssignment, "Keep native default"); assert.equal(fields.discussionSync, false);
    assert.equal(fields.discussionbridgeCmsOwnership.native_id, identity.destination_native_id); assert.equal(fields.discussionbridgeCmsOwnership.resource_id, identity.resource_id);
    assert.equal(fields.discussionbridgeCmsOwnership.last_lease_generation, 3);
    await abortCmsNativeWork(state.options, restored.workId);
    const prior = parseYaml(/^---\n([\s\S]*?)\n---\n/u.exec(await readFile(file, "utf8"))[1]);
    assert.equal(prior.draft, true); assert.equal(prior.discussionbridgeSourceStatus, "withdrawn");
  });
});
