import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import discussionBridge from "../dist/index.js";
import { deployCmsNativeBuild, stageCmsNativePublications } from "../dist/cms-pipeline.js";
import { recordCmsNativeBuild, finalizeCmsNativeWork } from "../dist/cms-static.js";
import { buildCmsConsumer, staticFixture } from "./fixtures/cms-static.mjs";
import { html } from "./fixtures/cms-coordinator.mjs";

test("actual Astro hooks automatically stage From CMS and capture native output with private transport config", async t => {
  const state = await staticFixture(t, {}, html, "full", false);
  await assert.rejects(readFile(state.options.stateFile), { code: "ENOENT" });
  const built = await buildCmsConsumer(state, true);
  const journal = JSON.parse(await readFile(state.options.stateFile, "utf8"));
  const transaction = journal.transactions[state.expectedWorkId];
  assert.equal(transaction.stage, "prepared"); assert.equal(transaction.buildArtifact.html, built);
  assert.equal(transaction.publiclyVerifiedAt, undefined); assert.equal(journal.nativeCommand, undefined); assert.equal(state.finalized.length, 0);
  const resumed = await stageCmsNativePublications(state.options);
  assert.deepEqual(resumed.prepared, [state.expectedWorkId]); assert.equal(state.prepared.length, 1); assert.equal(state.contentCalls, 1);
  await finalizeCmsNativeWork({ ...state.options, publicFetchImplementation: async () => new Response(built, { headers: { "Content-Type": "text/html" } }) }, state.expectedWorkId, { deploymentId: "synthetic-initial-build", deployedAt: new Date().toISOString() });
  const original = { ...state.nativeMapping };
  const nextWorkId = state.queuePublication("<p>Actual continuing source update.</p>");
  const updated = await buildCmsConsumer(state, true);
  assert.match(updated, /Actual continuing source update/); assert.match(updated, /Continuing renamed source/);
  const nextJournal = JSON.parse(await readFile(state.options.stateFile, "utf8"));
  const next = nextJournal.transactions[nextWorkId];
  assert.equal(next.stage, "prepared"); assert.equal(next.lease.lease_generation, 2); assert.equal(next.buildArtifact.html, updated);
  assert.equal(state.nativeMapping.destination_native_id, original.destination_native_id); assert.equal(state.nativeMapping.resource_id, original.resource_id);
  assert.equal(state.nativeMapping.external_id, original.external_id); assert.equal(state.nativeMapping.canonical_url, original.canonical_url);
  assert.equal(state.nativeMapping.publicly_verified_source_revision, "revision-1", "older verified revision remains identified while desired work is pending");
  await finalizeCmsNativeWork({ ...state.options, publicFetchImplementation: async () => new Response(updated, { headers: { "Content-Type": "text/html" } }) }, nextWorkId, { deploymentId: "synthetic-continuing-build", deployedAt: new Date().toISOString() });
  assert.equal(state.nativeMapping.publicly_verified_source_revision, state.sourceRecord.source_revision);
  const integration = discussionBridge({ discourseUrl: state.options.serverUrl, fromDiscourse: { enabled: true, stateFile: state.options.stateFile,
    connectionId: state.options.connectionId, connectionSecret: state.options.connectionSecret, fetchImplementation: state.options.fetchImplementation } });
  let plugin; await integration.hooks["astro:config:setup"]({ config: { root: pathToFileURL(state.root + path.sep) }, updateConfig(config) { plugin = config.vite.plugins[0]; }, injectScript() {} });
  const publicModule = plugin.load(plugin.resolveId("virtual:discussion-bridge/config"));
  assert.doesNotMatch(publicModule, /stateFile|transport|connectionId|connectionSecret|fetchImplementation/u);
  assert.doesNotMatch(publicModule, new RegExp(state.options.connectionSecret));
});

test("native command owner receipt resumes uncertain finalize without executing a second deployment", async t => {
  const state = await staticFixture(t); await state.prepare(); const built = await buildCmsConsumer(state);
  await recordCmsNativeBuild(state.options, path.join(state.root, "dist"));
  const command = { executable: process.execPath, args: ["synthetic-never-executed"], cwd: state.root };
  let executions = 0;
  const options = { ...state.options, publicFetchImplementation: async () => new Response(built, { headers: { "Content-Type": "text/html" } }),
    spawnImplementation(executable, args, configuration) {
      executions++; assert.equal(executable, command.executable); assert.deepEqual(args, command.args);
      assert.equal(configuration.shell, false); assert.equal(configuration.windowsHide, true); assert.equal(configuration.stdio, "ignore");
      const child = new EventEmitter(); child.pid = 999999; queueMicrotask(() => child.emit("close", 0, null)); return child;
    } };
  state.loseNext("finalize"); await assert.rejects(deployCmsNativeBuild(options, command));
  const pending = JSON.parse(await readFile(state.options.stateFile, "utf8")); assert.equal(pending.nativeCommand.phase, "succeeded");
  assert.equal(pending.nativeCommand.pid, 999999); assert.equal(pending.transactions[state.claimed.workId].stage, "prepared");
  const result = await deployCmsNativeBuild(options, command);
  assert.equal(executions, 1, "only the isolated process seam ran once; no native deployment command was executed");
  assert.equal(result.results[0].stage, "verified"); assert.equal(result.deploymentId, pending.nativeCommand.deploymentId);
  assert.deepEqual(state.finalized[1], state.finalized[0]);
});

test("uncertain command effect is durably stopped and not automatically rerun", async t => {
  const state = await staticFixture(t); await state.prepare(); await buildCmsConsumer(state);
  await recordCmsNativeBuild(state.options, path.join(state.root, "dist")); let executions = 0;
  const options = { ...state.options, spawnImplementation() { executions++; const child = new EventEmitter(); child.pid = 999998; queueMicrotask(() => child.emit("close", 1, null)); return child; } };
  const command = { executable: process.execPath, args: ["synthetic-never-executed"], cwd: state.root };
  await assert.rejects(deployCmsNativeBuild(options, command), /effect is uncertain/);
  assert.equal(JSON.parse(await readFile(state.options.stateFile, "utf8")).nativeCommand.phase, "uncertain");
  await assert.rejects(deployCmsNativeBuild(options, command), /must reconcile/); assert.equal(executions, 1); assert.equal(state.finalized.length, 0);
});

test("current receiver rejection makes no alternate protocol request and old transport selectors are refused", async t => {
  const state = await staticFixture(t); const requests = [];
  const options = { ...state.options, fetchImplementation: async url => { requests.push(new URL(url).pathname); return new Response("not a current CMS receiver", { status: 404, headers: { "Content-Type": "text/plain" } }); } };
  await assert.rejects(stageCmsNativePublications(options)); assert.deepEqual(requests, ["/discussion-bridge/v4/connection.json"]);
  const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  for (const args of [["--transport", "unknown"], ["--transport", "v2", "--docs-dir", state.options.docsDir, "--site-url", state.options.siteUrl]]) {
    const result = spawnSync(process.execPath, [...process.execArgv, cli, "sync-publications", ...args], { encoding: "utf8", windowsHide: true });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /transport|state-file/); assert.doesNotMatch(result.stdout, /secret|lease_token/u);
  }
});
