import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { sourceMoveFixture } from "./fixtures/source-move.mjs";
import { buildToConsumer } from "./fixtures/native-to-consumer.mjs";
import { beginControlledSourceUrlMove, finalizeControlledSourceUrlMove, abortControlledSourceUrlMove } from "../dist/cms-to-source-move.js";
import { runControlledSourceCommand } from "../dist/cms-to-source-command.js";
import { readPublicationOperationalState } from "../dist/operational-state.js";
const op = async s => Object.values((await s.journal()).operations)[0];
const build = s => buildToConsumer(s, undefined, true, true);
const drift = (s, char) => { s.connection.scope_revision = char.repeat(64); };

test("fresh current authority across uncertain prepare, applied move, completed command and lost finalize preserves every original identity/proof", async t => {
  const s = await sourceMoveFixture(t); await build(s); const original = await op(s), source = await readFile(s.file, "utf8");
  s.control.losePrepare = true;
  await assert.rejects(beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/qualified-move/"));
  const intent = structuredClone((await op(s)).to.sourceMove); assert.equal(await readFile(s.file, "utf8"), source);
  drift(s, "b"); await beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/qualified-move/");
  s.expectedSlug = "qualified-move"; const applied = structuredClone((await op(s)).to.sourceMove);
  assert.deepEqual(s.moveCalls[0].body, s.moveCalls[1].body); assert.deepEqual(applied.prepareBody, intent.prepareBody);
  assert.deepEqual(applied.issuingScope, original.to.scope); assert.deepEqual(applied.beforeCapture, intent.beforeCapture);
  drift(s, "c"); await build(s); const built = structuredClone((await op(s)).to.sourceMove);
  assert.equal(await readFile(s.file, "utf8"), applied.output); assert.equal(built.nativeCapture.ownership.scopeRevision, original.to.scope.scopeRevision);
  assert.equal(built.nativeCapture.ownershipSha256, (await op(s)).to.sourceMove.nativeCapture.ownershipSha256);
  const command = { executable: process.execPath, args: ["--eval", "process.exit(0)"], cwd: s.root, timeoutMs: 20000 };
  const deployed = await runControlledSourceCommand(s.options, s.file, "deploy", command);
  drift(s, "d"); assert.deepEqual(await runControlledSourceCommand(s.options, s.file, "deploy", command), deployed, "completed deploy cannot be relabeled or executed again");
  s.control.loseFinalize = true; await assert.rejects(finalizeControlledSourceUrlMove(s.options, s.file, { fetchImplementation: s.fetchPublic }));
  const pending = structuredClone((await op(s)).to.sourceMove); assert.equal(s.state.record.canonical_url, applied.prepareBody.new_url);
  drift(s, "e"); await finalizeControlledSourceUrlMove(s.options, s.file, { fetchImplementation: s.fetchPublic });
  const settled = await op(s);
  assert.deepEqual(settled.to.sourceMove.finalizeBody, pending.finalizeBody); assert.deepEqual(settled.to.sourceMove.commands, pending.commands);
  assert.deepEqual(s.moveCalls.filter(c => c.kind === "V4-29").map(c => c.body), [pending.finalizeBody, pending.finalizeBody]);
  assert.deepEqual(settled.to.receipts, original.to.receipts); assert.deepEqual(settled.to.scope, original.to.scope);
  assert.equal(settled.resourceId, original.resourceId); assert.equal(settled.topicId, original.topicId); assert.equal(s.state.creations, 1);
  await readPublicationOperationalState(s.options.stateFile); await build(s); await readPublicationOperationalState(s.options.stateFile);
  assert.equal((await op(s)).to.sourceMove.phase, "committed"); assert.equal(s.moves.size, 1);
});

test("targeted native Content capture can qualify a newly changed current scope without rewriting the existing ownership marker", async t => {
  const s = await sourceMoveFixture(t); await build(s); const original = await op(s), source = await readFile(s.file, "utf8");
  s.beforeCapture = () => { drift(s, "b"); };
  await build(s); const after = await op(s);
  assert.equal(after.to.qualifications.length, 1); assert.equal(after.to.nativeCapture.ownershipSha256, original.to.nativeCapture.ownershipSha256);
  assert.equal(await readFile(s.file, "utf8"), source); assert.equal(after.to.acceptedRevision, original.to.acceptedRevision); assert.equal(s.state.creations, 1);
});

test("a genuinely new move after qualification issues its own current-scope proof, retaining the historical native capture", async t => {
  const s = await sourceMoveFixture(t); await build(s); const original = await op(s);
  drift(s, "b"); await build(s); const qualified = await op(s);
  await beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/new-current-grant/");
  s.expectedSlug = "new-current-grant"; await build(s); const current = await op(s), move = current.to.sourceMove;
  assert.equal(move.issuingScope.scopeRevision, s.connection.scope_revision);
  assert.equal(move.nativeCapture.ownership.scopeRevision, s.connection.scope_revision);
  assert.deepEqual(move.beforeCapture, qualified.to.nativeCapture);
  assert.deepEqual(current.to.qualifications[0].nativeCapture, original.to.nativeCapture);
  assert.deepEqual(current.to.receipts, qualified.to.receipts); assert.equal(s.state.creations, 1);
});

test("an uncertain abort retains its issuing scope and exact request through a new current grant", async t => {
  const s = await sourceMoveFixture(t); await build(s); s.control.losePrepare = true;
  await assert.rejects(beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/abort-qualified/"));
  // Recover the real prepare receipt without manufacturing a different intent.
  await beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/abort-qualified/");
  s.control.loseAbort = true; await assert.rejects(abortControlledSourceUrlMove(s.options, s.file, true));
  const before = structuredClone((await op(s)).to.sourceMove); drift(s, "b");
  await abortControlledSourceUrlMove(s.options, s.file, true); const after = (await op(s)).to.sourceMove;
  assert.deepEqual(after.abortBody, before.abortBody); assert.deepEqual(after.issuingScope, before.issuingScope);
  assert.equal(after.phase, "attention"); assert.deepEqual(s.moveCalls.filter(c => c.kind === "V4-30").map(c => c.body), [before.abortBody, before.abortBody]);
});
