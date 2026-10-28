import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { beginCmsNativeUrlMove, prepareCmsNativeUrlMove, abortCmsNativeUrlMove } from "../dist/cms-presentation.js";
import { deployCmsNativeBuild, recordCmsNativeBuild } from "../dist/cms-pipeline.js";
import { prepareCmsNativeWork } from "../dist/cms-static.js";
import { nativePublicationFiles } from "../dist/native-publication.js";
import { buildCmsConsumer, staticFixture } from "./fixtures/cms-static.mjs";

async function nativeFixture(t, cooked) {
  const state = await staticFixture(t, {}, cooked); await state.prepare();
  const built = await buildCmsConsumer(state); await recordCmsNativeBuild(state.options, path.join(state.root, "dist"));
  const publicRoot = path.join(state.root, "local-public"); await mkdir(publicRoot);
  let tamper = false;
  const server = createServer(async (request, response) => {
    assert.equal(request.headers["x-discussionbridge-secret"], undefined); assert.equal(request.headers.authorization, undefined);
    const file = path.resolve(publicRoot, "." + new URL(request.url, "http://localhost").pathname, "index.html");
    assert.ok(file.startsWith(publicRoot + path.sep));
    try { let html = await readFile(file, "utf8"); if (tamper) html = html.replace(/data-discussionbridge-cms-nonce="[^"]+"/u, 'data-discussionbridge-cms-nonce="wrong"'); response.writeHead(200, { "Content-Type": "text/html" }); response.end(html); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const options = { ...state.options, publicFetchImplementation: async (url, init) => {
    assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error"); assert.equal(new URL(url).origin, state.options.siteUrl);
    const actual = await fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, init);
    const result = new Response(actual.body, { status: actual.status, headers: actual.headers }); Object.defineProperty(result, "url", { value: url }); return result;
  } };
  const script = path.join(state.root, "owned-deploy.mjs"), witness = path.join(state.root, "commands.txt");
  await writeFile(script, "import {cpSync,appendFileSync} from 'node:fs'; cpSync(process.argv[2],process.argv[3],{recursive:true}); appendFileSync(process.argv[4],'actual local command\\n');");
  const command = { executable: process.execPath, args: [script, path.join(state.root, "dist"), publicRoot, witness], cwd: state.root };
  await deployCmsNativeBuild(options, command);
  const journal = () => readFile(state.options.stateFile, "utf8").then(JSON.parse);
  const initial = await journal(), first = initial.transactions[state.claimed.workId];
  return { state, options, command, witness, journal, first: structuredClone(first), built, setTamper(value) { tamper = value; } };
}

test("ordinary native From URL move keeps the same object/source and requires a fresh post18 build/deploy", async t => {
  const fixture = await nativeFixture(t); const { state, options, command, witness, journal, first } = fixture;
  const original = structuredClone(state.nativeMapping), originalFile = first.plan.file;
  const originalBytes = await readFile(originalFile, "utf8");
  const extraFields = nativePublicationFiles.metadata(originalBytes); extraFields.consumerField = "retained consumer choice";
  // A native consumer-owned unrelated field does not alter managed content revision.
  const { stringify } = await import("yaml");
  await writeFile(originalFile, `---\n${stringify(extraFields).trim()}\n---\n${originalBytes.replace(/^---\n[\s\S]*?\n---\n/u, "")}`);
  const claimed = await state.nextAction("publish_revision"); // synthetic receiver-created audited unchanged-source cycle
  const target = "https://astro.example/comments/native-renamed/";
  state.loseNext("move-prepare"); await assert.rejects(beginCmsNativeUrlMove(options, original.mapping_id, target));
  const pending = (await journal()).transactions[claimed.workId].presentationMove.prepare;
  await beginCmsNativeUrlMove(options, original.mapping_id, target);
  assert.deepEqual((await journal()).transactions[claimed.workId].presentationMove.prepare, pending);
  assert.equal(state.movePrepared.length, 1, "uncertain21 exact mutation replay does not reserve a second move");
  await assert.rejects(prepareCmsNativeWork(options, claimed.workId), /commit before static/);
  const movedHtml = await buildCmsConsumer(state, true, undefined, target);
  assert.match(movedHtml, /Consumer brand/); assert.match(movedHtml, /data-discussionbridge-cms-nonce=/);
  state.loseNext("move-finalize"); await assert.rejects(deployCmsNativeBuild(options, command), /settlements/);
  const lost = await journal(); assert.equal(lost.nativeCommand.phases[claimed.workId], "move");
  assert.equal(lost.transactions[claimed.workId].prepareBody, undefined, "URL22 receipt uncertainty cannot prepare18");
  const result = await deployCmsNativeBuild(options, command);
  assert.equal(result.requiresFreshBuild, true); assert.equal(state.moveFinalized.length, 1);
  assert.equal((await readFile(witness, "utf8")).trim().split("\n").length, 2, "initial plus move OS command; lost22 replay ran no command");
  const after22 = await journal(), transaction = after22.transactions[claimed.workId];
  assert.equal(transaction.stage, "prepared"); assert.equal(transaction.buildArtifact, undefined);
  assert.deepEqual(after22.transactions[state.claimed.workId], first, "prior verified transaction remains immutable");
  assert.equal(transaction.plan.file, originalFile); assert.equal(transaction.plan.nativeResult.native_id, original.destination_native_id);
  assert.equal(transaction.plan.nativeResult.native_revision, original.destination_native_revision, "existing content revision truthfully excludes URL/slug/receipt");
  assert.equal(nativePublicationFiles.metadata(transaction.plan.output).consumerField, "retained consumer choice");
  assert.equal(transaction.plan.output.replace(/^---\n[\s\S]*?\n---\n/u, ""), first.plan.output.replace(/^---\n[\s\S]*?\n---\n/u, ""));
  for (const key of ["resource_id", "external_id", "source_id", "destination_native_id", "desired_source_revision", "source_created_at", "source_updated_at"]) assert.equal(state.nativeMapping[key], original[key]);
  assert.equal(state.nativeMapping.canonical_url, target); assert.equal(transaction.publiclyVerifiedAt, undefined);
  await assert.rejects(deployCmsNativeBuild(options, command), /no observed prepared native build/);
  await assert.rejects(recordCmsNativeBuild(options, path.join(state.root, "dist")), /newly built artifact/);
  await buildCmsConsumer(state, true, undefined, target);
  const final = await deployCmsNativeBuild(options, command); assert.equal(final.requiresFreshBuild, false);
  const settled = (await journal()).transactions[claimed.workId]; assert.equal(settled.stage, "verified");
  assert.equal(settled.finalizeBody.verification.verification_profile, "discussionbridge-astro-static-html-move-1");
  assert.ok(Date.parse(settled.finalizeBody.deployed_at) >= Date.parse(settled.preparedAt));
  assert.equal((await readFile(witness, "utf8")).trim().split("\n").length, 3, "fresh post18 native command actually ran");
});

test("actual public nonce mismatch never commits; applied abort restores bytes and retains reservations without invented Work failure", async t => {
  const fixture = await nativeFixture(t); const { state, options, command, journal } = fixture;
  const before = structuredClone(state.nativeMapping), claimed = await state.nextAction("publish_revision"), target = "https://astro.example/comments/rejected-public-proof/";
  await beginCmsNativeUrlMove(options, before.mapping_id, target); await buildCmsConsumer(state, true, undefined, target);
  fixture.setTamper(true); await assert.rejects(deployCmsNativeBuild(options, command), /settlements/);
  assert.equal(state.moveFinalized.length, 0); assert.equal(state.failures.length, 0); assert.equal(state.nativeMapping.canonical_url, before.canonical_url);
  const aborted = await abortCmsNativeUrlMove(options, claimed.workId); assert.equal(aborted.nativeRestored, true); assert.equal(aborted.receiverReservationsRetained, true);
  assert.equal(state.moveAborted[0].native_change_applied, true); assert.equal(state.nativeMapping.mapping_state, "attention"); assert.equal(state.nativeWork.state, "leased");
  const current = await journal(), move = current.transactions[claimed.workId].presentationMove;
  assert.equal(move.phase, "attention"); assert.equal(await readFile(move.file, "utf8"), move.oldOutput);
  await assert.rejects(deployCmsNativeBuild(options, command), /settlements|reconciliation/);
});

test("new captured relative targets survive a native canonical move without rewriting article; stale authority still stops", async t => {
  const fixture = await nativeFixture(t, '<p><a href="relative-target">Native article link</a></p>');
  const { state, options, journal } = fixture, before = structuredClone(state.nativeMapping), claimed = await state.nextAction("publish_revision");
  const original = await readFile(fixture.first.plan.file, "utf8");
  await beginCmsNativeUrlMove(options, before.mapping_id, "https://astro.example/comments/relative-target-move/");
  const moved = await readFile(fixture.first.plan.file, "utf8");
  const body = value => value.replace(/^---\n[\s\S]*?\n---\n/u, "");
  assert.equal(body(moved), body(original)); assert.match(body(moved), /href="https:\/\/forum.example\/t\/source\/relative-target"/);
  assert.equal((await journal()).transactions[state.claimed.workId].articleCapture.original, '<p><a href="relative-target">Native article link</a></p>');
  const mismatched = { ...options, fetchImplementation: async (url, init) => {
    const response = await options.fetchImplementation(url, init);
    if (/\/work\/[^/]+\.json$/u.test(new URL(url).pathname)) { const body = await response.json(); body.work.lease_generation++; return Response.json(body); }
    return response;
  } };
  await assert.rejects(prepareCmsNativeUrlMove(mismatched, claimed.workId, "https://astro.example/comments/relative-target-move/"), /authority changed/);
  assert.equal(state.movePrepared.length, 1);
});

test("applied native move cannot proceed under changed mapping CAS or replacement generation", async t => {
  const fixture = await nativeFixture(t), { state, options, journal, command } = fixture;
  const claimed = await state.nextAction("publish_revision"), target = "https://astro.example/comments/cas-guarded/";
  await beginCmsNativeUrlMove(options, state.nativeMapping.mapping_id, target); await buildCmsConsumer(state, true, undefined, target);
  const before = await journal();
  for (const change of ["mapping_revision", "lease_generation"]) {
    const stale = { ...options, fetchImplementation: async (url, init) => {
      const response = await options.fetchImplementation(url, init);
      if (/\/work\/[^/]+\.json$/u.test(new URL(url).pathname)) { const body = await response.json(); if (change === "mapping_revision") body.mapping.mapping_revision = "superseding-mapping"; else body.work.lease_generation++; return Response.json(body); }
      return response;
    } };
    await assert.rejects(deployCmsNativeBuild(stale, command), /CAS|authority changed/);
  }
  const after = await journal(); assert.deepEqual(after.transactions[claimed.workId], before.transactions[claimed.workId]);
  assert.equal(after.transactions[claimed.workId].presentationMove.phase, "applied"); assert.equal(state.moveFinalized.length, 0);
  assert.equal(after.nativeCommand.commandId, before.nativeCommand.commandId, "no new OS child owner was started after either fence changed");
});
