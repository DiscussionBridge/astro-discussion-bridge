import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { nativeSource, toFixture } from "./fixtures/cms-to.mjs";
import { buildToConsumer } from "./fixtures/native-to-consumer.mjs";
import { ownedPng } from "./helpers/native-png.mjs";

async function fixture(t) {
  const article = "![Native original image](../assets/native.png)", state = await toFixture(t, nativeSource(article), "53");
  await mkdir(path.join(state.root, "src/content/assets"), { recursive: true });
  await writeFile(path.join(state.root, "src/content/assets/native.png"), ownedPng());
  return { ...state, article };
}
test("ordinary native Markdown asset capture uses the existing writer once across second build and native edits", async t => {
  const state = await fixture(t), first = await buildToConsumer(state, undefined, true), initial = structuredClone(state.state.record);
  assert.equal(state.received.length, 1); assert.equal(state.state.creations, 1);
  const operation = Object.values((await state.journal()).operations)[0], capture = operation.to.articleCaptures[operation.to.acceptedCaptureId];
  assert.equal(capture.original, state.article + "\n"); assert.equal(operation.nativeRender, undefined);
  assert.match(capture.preparedHtml, /src="https:\/\/astro.example\/_astro\//);
  assert.equal(state.received[0].bridge_record.source_content_sha256, state.digest(capture.preparedHtml));
  assert.equal(state.received[0].bridge_record.source_content_bytes, Buffer.byteLength(capture.preparedHtml));
  const asset = /\bsrc="([^"]+)"/u.exec(capture.preparedHtml)[1], assetUrl = new URL(asset);
  assert.ok(first.includes(assetUrl.pathname)); assert.ok(first.includes(initial.resource_id));
  assert.ok((await readFile(path.join(state.root, "dist", assetUrl.pathname))).length > 0);
  assert.doesNotMatch(first, /synthetic-secret|nativeRender|test-owned-native-source-binding/);
  const second = await buildToConsumer(state, undefined, true);
  assert.ok(second.includes(initial.resource_id)); assert.equal(state.received.length, 2, "existing engine confirms the same edition without a new native creation");
  assert.equal(state.received[1].bridge_record.source_revision, initial.source_revision);
  assert.equal(state.received[1].bridge_record.expected_source_revision, initial.source_revision);
  assert.equal(state.state.creations, 1);
  const old = structuredClone(operation.to.receipts);
  await writeFile(state.file, (await readFile(state.file, "utf8")).replace(state.article, state.article + "\n\nActual native source addition."));
  const updated = await buildToConsumer(state, undefined, true);
  assert.match(updated, /Actual native source addition/); assert.equal(state.received.length, 3); assert.equal(state.state.creations, 1);
  assert.equal(state.received[2].bridge_record.expected_source_revision, initial.source_revision);
  for (const key of ["resource_id", "external_id", "topic_id", "canonical_url"]) assert.equal(state.state.record[key], initial[key]);
  const current = Object.values((await state.journal()).operations)[0];
  for (const [id, receipt] of Object.entries(old)) assert.deepEqual(current.to.receipts[id], receipt);
});
test("lost02 actual native render restart replays the immutable intent without duplicate creation", async t => {
  const state = await fixture(t); state.state.lostResponse = true;
  await assert.rejects(buildToConsumer(state, undefined, true));
  const before = Object.values((await state.journal()).operations)[0], pending = structuredClone(before.to.pending.body), handoff = structuredClone(before.nativeRender);
  assert.equal(state.received.length, 1); assert.equal(state.state.creations, 1);
  const output = await buildToConsumer(state, undefined, true);
  assert.deepEqual(state.received[1], pending); assert.equal(state.state.creations, 1); assert.ok(output.includes(state.state.record.resource_id));
  const after = Object.values((await state.journal()).operations)[0];
  assert.equal(after.nativeRender, undefined); assert.equal(after.to.pending, undefined);
  assert.equal(after.to.articleCaptures[after.to.acceptedCaptureId].original, handoff.originalCapture.original);
});
test("missing consumer capture and actual source drift retain handoff without publication or false deletion", async t => {
  const state = await fixture(t);
  await assert.rejects(buildToConsumer(state), /requires one completed Bridge topic mapping/, "missing native capture cannot claim completed Interactive publication");
  const before = structuredClone(Object.values((await state.journal()).operations)[0].nativeRender);
  assert.equal(state.received.length, 0); assert.equal(state.withdrawals.length, 0);
  state.afterRender = async () => { await writeFile(state.file, (await readFile(state.file, "utf8")) + "Actual concurrent native edit.\n"); };
  await assert.rejects(buildToConsumer(state, undefined, true), /Native source changed during Content rendering/);
  const after = Object.values((await state.journal()).operations)[0];
  assert.deepEqual(after.nativeRender, before); assert.equal(after.to?.pending, undefined);
  assert.match(after.lastError, /Native source changed during Content rendering/);
  assert.equal(state.received.length, 0); assert.equal(state.withdrawals.length, 0);
});

test("stale native entry view records the specific preflight limitation before rendering or resolve", async t => {
  const state = await fixture(t);
  state.beforeCapture = async () => { await writeFile(state.file, (await readFile(state.file, "utf8")) + "Changed before capture.\n"); };
  await assert.rejects(buildToConsumer(state, undefined, true), /entry\/source\/base\/published binding changed/);
  const operation = Object.values((await state.journal()).operations)[0];
  assert.match(operation.lastError, /entry\/source\/base\/published binding changed/);
  assert.equal(operation.nativeRender.originalCapture.original, state.article + "\n");
  assert.equal(operation.to?.pending, undefined); assert.equal(state.received.length, 0); assert.equal(state.withdrawals.length, 0);
});
