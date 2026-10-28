import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildToConsumer } from "./fixtures/native-to-consumer.mjs";
import { sourceMoveFixture } from "./fixtures/source-move.mjs";
import { beginControlledSourceUrlMove, finalizeControlledSourceUrlMove, abortControlledSourceUrlMove, controlledSourceUrlHistory } from "../dist/cms-to-source-move.js";
import { runControlledSourceCommand } from "../dist/cms-to-source-command.js";
import { sourceHash, inspectSourceArticle, resolveNativeSourceTargets } from "../dist/to-source-profile.js";
import { prepareNativeRenderedArticle } from "../dist/native-source.js";
import { readPublicationOperationalState, writePublicationOperationalState } from "../dist/operational-state.js";
import { ownedPng } from "./helpers/native-png.mjs";
const op = async s => Object.values((await s.journal()).operations)[0];
const build = async s => {
  const after = s.afterRender; s.afterRender = async html => { s.lastNativeHtml = html; await after?.(html); };
  try { return await buildToConsumer(s, undefined, true, true); }
  catch (error) {
    const current = await op(s), capture = current?.to?.articleCaptures?.[current.to.acceptedCaptureId];
    if (capture && s.lastNativeHtml) { const html = resolveNativeSourceTargets(s.lastNativeHtml, capture.sourceArticleUrl), prepared = prepareNativeRenderedArticle(capture, html);
      console.error(JSON.stringify({ testOwnedSourceDifference: true, phase: current.to.sourceMove?.phase ?? "initial", expected: capture.preparedHtml?.slice(0, 1600), actual: prepared.preparedHtml?.slice(0, 1600), native: html.slice(0, 1600), beforeNative: current.to.sourceMove?.beforeCapture.nativeHtml.slice(0, 1600) })); }
    throw error;
  } finally { s.afterRender = after; }
};
async function deploy(s) {
  const file = path.join(s.root, "deploy-count.txt"), argv = ["--input-type=module", "-e", `import{readFile,writeFile}from'node:fs/promises';const p=process.argv[1];let n=0;try{n=Number(await readFile(p,'utf8'))}catch{}await writeFile(p,String(n+1));`, file];
  const command = { executable: process.execPath, args: argv, cwd: s.root, timeoutMs: 20000 };
  const receipt = await runControlledSourceCommand(s.options, s.file, "deploy", command);
  assert.equal(receipt.phase, "succeeded"); assert.equal(receipt.terminationConfirmed, true);
  assert.deepEqual(await runControlledSourceCommand(s.options, s.file, "deploy", command), receipt);
  assert.equal(await readFile(file, "utf8"), "1"); return receipt;
}
test("actual native same-file slug move/full article/anonymous nonce proof and lost29 restart preserve identities and later02 ancestry", async t => {
  const s = await sourceMoveFixture(t), firstHtml = await build(s), before = structuredClone(await op(s)), original = await readFile(s.file, "utf8");
  assert.ok(before.to.nativeCapture.build); assert.equal(before.to.nativeCapture.nativeHtml.includes('href="https://astro.example/articles/target/"'), true);
  s.control.losePrepare = true;
  await assert.rejects(beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/new-slug/"));
  assert.equal(await readFile(s.file, "utf8"), original);
  await beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/new-slug/"); s.expectedSlug = "new-slug";
  assert.deepEqual(s.moveCalls[0].body, s.moveCalls[1].body); assert.equal(s.moves.size, 1);
  const applied = await op(s); assert.equal(applied.to.sourceMove.phase, "native_applied");
  const callsBefore = s.received.length, html = await build(s), built = await op(s);
  assert.equal(s.received.length, callsBefore); assert.match(html, /data-discussionbridge-source-nonce=/); assert.match(html, /https:\/\/astro.example\/articles\/target\//);
  assert.equal(built.to.sourceMove.nativeCapture.nativeHtml, before.to.nativeCapture.nativeHtml);
  assert.equal(sourceHash(inspectSourceArticle(html, built.to.sourceMove.nativeCapture)), sourceHash(inspectSourceArticle(built.to.sourceMove.nativeCapture.build.html, built.to.sourceMove.nativeCapture)));
  await deploy(s);
  s.control.publicMode = "body"; await assert.rejects(finalizeControlledSourceUrlMove(s.options, s.file, { fetchImplementation: s.fetchPublic }), /COMPLETE|native source/);
  assert.equal(s.moveCalls.filter(c => c.kind === "V4-29").length, 0);
  s.control.publicMode = "nonce"; await assert.rejects(finalizeControlledSourceUrlMove(s.options, s.file, { fetchImplementation: s.fetchPublic }), /challenge/);
  s.control.publicMode = "redirect"; await assert.rejects(finalizeControlledSourceUrlMove(s.options, s.file, { fetchImplementation: s.fetchPublic }));
  s.control.publicMode = "valid"; s.control.loseFinalize = true;
  await assert.rejects(finalizeControlledSourceUrlMove(s.options, s.file, { fetchImplementation: s.fetchPublic }));
  const pending29 = structuredClone((await op(s)).to.sourceMove.finalizeBody);
  const result = await finalizeControlledSourceUrlMove(s.options, s.file, { fetchImplementation: s.fetchPublic });
  assert.equal(result.canonical_url, "https://astro.example/articles/new-slug/");
  const current = await op(s); assert.equal(current.to.acceptedRevision, pending29.new_source_revision); assert.notEqual(current.to.acceptedRevision, before.to.acceptedRevision);
  assert.deepEqual(current.to.acceptedBody, before.to.acceptedBody); assert.deepEqual(current.to.receipts, before.to.receipts);
  assert.equal(current.resourceId, before.resourceId); assert.equal(current.topicId, before.topicId); assert.equal(current.externalId, before.externalId); assert.equal(s.state.creations, 1);
  assert.deepEqual(s.moveCalls.filter(c => c.kind === "V4-29").map(c => c.body), [pending29, pending29]);
  assert.equal((await controlledSourceUrlHistory(s.options, s.file)).items[0].url, before.canonicalUrl);
  await build(s); const subsequent = s.received.at(-1).bridge_record;
  assert.equal(subsequent.source_revision, pending29.new_source_revision); assert.equal(subsequent.expected_source_revision, pending29.new_source_revision);
  assert.equal(subsequent.content_html, before.to.acceptedBody.bridge_record.content_html); assert.equal(subsequent.source_updated_at, before.to.acceptedBody.bridge_record.source_updated_at);
  assert.ok(s.requests.length); for (const request of s.requests) assert.equal(Object.keys(request.headers).some(k => /discussionbridge|authorization|cookie/iu.test(k)), false);
});
test("generated excerpt source move changes only owned Read More and retains complete/native article and selection through later02", async t => {
  const s = await sourceMoveFixture(t, Array.from({ length: 650 }, () => "Ordinary complete native article with every meaningful word retained.").join("\n\n"));
  await build(s); const before = structuredClone(await op(s)), record = before.to.acceptedBody.bridge_record;
  assert.equal(record.representation.kind, "generated_excerpt"); assert.ok(record.source_content_bytes > 49152);
  await beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/new-excerpt/"); s.expectedSlug = "new-excerpt"; await build(s); await deploy(s);
  await finalizeControlledSourceUrlMove(s.options, s.file, { fetchImplementation: s.fetchPublic });
  const moved = structuredClone(s.state.input);
  assert.equal(moved.representation.read_more_url, "https://astro.example/articles/new-excerpt/");
  for (const key of ["article_content_bytes", "article_content_sha256", "selection_source_revision", "selection_full_request_bytes"]) assert.equal(moved.representation[key], record.representation[key]);
  assert.equal(moved.source_content_sha256, record.source_content_sha256); assert.equal(moved.source_content_bytes, record.source_content_bytes);
  assert.equal(moved.content_html.slice(0, moved.representation.article_content_bytes), record.content_html.slice(0, record.representation.article_content_bytes));
  await build(s); assert.equal(s.received.at(-1).bridge_record.source_revision, moved.source_revision); assert.deepEqual(s.received.at(-1).bridge_record.representation, moved.representation);
});
test("actual imported Markdown PNG source capture retains real emitted asset bytes across slug move", async t => {
  const s = await sourceMoveFixture(t, "Native body.\n\n![Native PNG](../assets/native.png)");
  await mkdir(path.join(s.root, "src/content/assets"), { recursive: true }); await writeFile(path.join(s.root, "src/content/assets/native.png"), ownedPng());
  await build(s); const before = (await op(s)).to.nativeCapture;
  assert.ok(before.build.assets.some(a => /\/_astro\//u.test(a.url)));
  await beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/image-moved/"); s.expectedSlug = "image-moved"; await build(s); await deploy(s);
  await finalizeControlledSourceUrlMove(s.options, s.file, { fetchImplementation: s.fetchPublic });
  assert.ok(s.requests.some(r => /\/_astro\//u.test(r.url))); assert.equal((await op(s)).to.nativeCapture.nativeHtml, before.nativeHtml);
});
test("native edit or receiver predecessor drift prevents move dispatch; applied abort truthfully retains both reservations", async t => {
  const s = await sourceMoveFixture(t); await build(s); const before = await readFile(s.file, "utf8");
  s.state.record.source_revision = "different-current-revision";
  await assert.rejects(beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/moved/"), /reconciliation/); assert.equal(s.moveCalls.length, 0);
  s.state.record.source_revision = (await op(s)).to.acceptedRevision;
  await writeFile(s.file, before + "Actual concurrent native edit.\n");
  await assert.rejects(beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/moved/")); assert.equal(s.moveCalls.length, 0);
  await writeFile(s.file, before); await beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/moved/");
  s.control.loseAbort = true; await assert.rejects(abortControlledSourceUrlMove(s.options, s.file, true));
  assert.equal(await readFile(s.file, "utf8"), before);
  const result = await abortControlledSourceUrlMove(s.options, s.file, true); assert.equal(result.state, "attention"); assert.equal((await op(s)).to.sourceMove.abortBody.native_change_applied, true);
  assert.deepEqual(s.moveCalls.filter(c => c.kind === "V4-30").map(c => c.body)[0], s.moveCalls.filter(c => c.kind === "V4-30").map(c => c.body)[1]);
  await assert.rejects(beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/another/"));
});
test("known validated29 rejection is durable and cannot retransmit; uncertain process owner blocks duplicate command", async t => {
  const s = await sourceMoveFixture(t); await build(s); await beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/rejected/"); s.expectedSlug = "rejected"; await build(s); await deploy(s);
  s.control.rejectFinalize = true;
  await assert.rejects(finalizeControlledSourceUrlMove(s.options, s.file, { fetchImplementation: s.fetchPublic }));
  const rejected = (await op(s)).to.sourceMove; assert.equal(rejected.phase, "known_rejected"); assert.equal(rejected.knownRejection.routeId, "V4-29");
  await assert.rejects(finalizeControlledSourceUrlMove(s.options, s.file, { fetchImplementation: s.fetchPublic })); assert.equal(s.moveCalls.filter(c => c.kind === "V4-29").length, 1);
});
test("REAL disposable child builds slug route under the same source fence; successful command receipt never runs it twice", async t => {
  const s = await sourceMoveFixture(t); await build(s); const before = structuredClone(await op(s));
  await beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/child-built/"); s.expectedSlug = "child-built";
  const config = path.join(s.root, "protected-test-build.json"), receiverOrigin = await s.receiverBridge();
  await writeFile(config, JSON.stringify({ root: s.root, docsDir: s.docsDir, file: s.file, expectedSlug: s.expectedSlug, receiverOrigin, holdNativeWriterMs: 2500, options: s.options }), { mode: 0o600 });
  const command = { executable: process.execPath, cwd: s.root, timeoutMs: 90000, args: ["--import", new URL("../../../.tools/register.mjs", import.meta.url).href, fileURLToPath(new URL("./helpers/source-build-child.mjs", import.meta.url)), config] };
  let receipt;
  try { receipt = await runControlledSourceCommand(s.options, s.file, "build", command); }
  catch (error) { let diagnostic; try { diagnostic = JSON.parse(await readFile(path.join(s.root, "child-native-error.json"), "utf8")); } catch {}
    const logs = {}; for (const name of ["stdout", "stderr"]) { try { logs[name] = await readFile(path.join(s.root, `child-native-${name}.txt`), "utf8"); } catch {} }
    const owner = (await op(s)).to.sourceMove.commands.build; let processObservation; try { processObservation = JSON.parse(await readFile(owner.processReceiptFile ?? path.join(`${s.options.stateFile}.source-commands`, `${owner.commandId}.json`), "utf8")); } catch {}
    const evidence = { testOwnedChildFailure: true, diagnostic, logs, owner, processObservation, phase: (await op(s)).to.sourceMove.phase };
    const directory = path.join(fileURLToPath(new URL("../.tmp/", import.meta.url)), `source-child-diagnostic-${Date.now()}`); await mkdir(directory); await writeFile(path.join(directory, "result.json"), JSON.stringify(evidence, null, 2));
    console.error(JSON.stringify({ ...evidence, evidenceFile: path.join(directory, "result.json") })); throw error; }
  assert.equal(receipt.phase, "succeeded"); assert.ok(receipt.pid); assert.equal(receipt.terminationConfirmed, true); assert.ok(receipt.writerBusyDeferrals > 0, "real child-held native writer was observed and deferred, not treated as authority success/loss");
  const evidenceDirectory = path.join(fileURLToPath(new URL("../.tmp/", import.meta.url)), `source-child-diagnostic-${Date.now()}`); await mkdir(evidenceDirectory);
  const built = (await op(s)).to.sourceMove.nativeCapture.build;
  const processObservation = JSON.parse(await readFile(receipt.processReceiptFile, "utf8")); assert.equal(processObservation.commandId, receipt.commandId); assert.equal(processObservation.exitCode, 0); assert.equal(processObservation.terminationConfirmed, true);
  await writeFile(path.join(evidenceDirectory, "result.json"), JSON.stringify({ testOwnedChildSuccess: true, owner: receipt, processObservation, actualNativeBuild: { file: built.file, sha256: built.sha256, builtAt: built.builtAt, bytes: Buffer.byteLength(built.html) },
    stdout: await readFile(path.join(s.root, "child-native-stdout.txt"), "utf8"), stderr: await readFile(path.join(s.root, "child-native-stderr.txt"), "utf8"), installedQualification: false }, null, 2));
  console.log(JSON.stringify({ sourceChildEvidence: path.join(evidenceDirectory, "result.json") }));
  assert.deepEqual(await runControlledSourceCommand(s.options, s.file, "build", command), receipt); assert.equal(await readFile(path.join(s.root, "child-build-count.txt"), "utf8"), "1");
  await deploy(s); await finalizeControlledSourceUrlMove(s.options, s.file, { fetchImplementation: s.fetchPublic });
  assert.equal((await op(s)).to.nativeCapture.nativeHtml, before.to.nativeCapture.nativeHtml); assert.equal(s.state.creations, 1);
});
test("REAL child is terminated on actual current-revision loss and its uncertain owner prevents another command", async t => {
  const s = await sourceMoveFixture(t); await build(s); await beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/fenced/"); s.expectedSlug = "fenced"; await build(s);
  let details = 0; s.state.onDetail = () => { if (++details >= 3) s.state.record.source_revision = "actual-different-receiver-revision"; };
  const command = { executable: process.execPath, cwd: s.root, timeoutMs: 15000, args: ["--input-type=module", "-e", "await new Promise(resolve=>setTimeout(resolve,10000));"] };
  await assert.rejects(runControlledSourceCommand(s.options, s.file, "deploy", command), /uncertain|reconciliation/);
  const receipt = (await op(s)).to.sourceMove.commands.deploy;
  assert.equal(receipt.phase, "uncertain"); assert.ok(receipt.pid); assert.equal(receipt.terminationConfirmed, true); assert.throws(() => process.kill(receipt.pid, 0));
  s.state.onDetail = undefined; s.state.record.source_revision = (await op(s)).to.acceptedRevision;
  await assert.rejects(runControlledSourceCommand(s.options, s.file, "deploy", command), /uncertain.*owner/);
  assert.deepEqual((await op(s)).to.sourceMove.commands.deploy, receipt);
});
