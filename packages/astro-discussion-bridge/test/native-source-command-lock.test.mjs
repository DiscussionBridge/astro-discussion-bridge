import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lock } from "proper-lockfile";
import { sourceMoveFixture } from "./fixtures/source-move.mjs";
import { buildToConsumer } from "./fixtures/native-to-consumer.mjs";
import { beginControlledSourceUrlMove } from "../dist/cms-to-source-move.js";
import { readPublicationOperationalState, writePublicationOperationalState } from "../dist/operational-state.js";
import { withNativeSourceWriter, withPublicationOperationalStateLock } from "../dist/native-locks.js";
import { sourceCommandChildEnvironment } from "../dist/native-source-command-context.js";

const ENV = "DISCUSSIONBRIDGE_NATIVE_SOURCE_COMMAND_V4";
test("supervised source writers wait only for acquisition, under their exact live owner and original deadline", { timeout: 180000 }, async t => {
  const s = await sourceMoveFixture(t); await buildToConsumer(s, undefined, true, true);
  await beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/writer-barrier/");
  const state = await readPublicationOperationalState(s.options.stateFile), operation = Object.values(state.operations)[0], move = operation.to.sourceMove;
  const command = { commandId: randomUUID(), kind: "build", phase: "starting", executable: process.execPath, args: [], cwd: s.root, fence: move.fence, startedAt: new Date().toISOString(), deploymentId: randomUUID() };
  move.commands = { build: command };
  const context = () => ({ docsDir: s.docsDir, stateFile: s.options.stateFile, commandId: command.commandId, fence: command.fence, kind: command.kind, deadlineMs: Date.now() + 20000 });
  const save = () => writePublicationOperationalState(s.options.stateFile, structuredClone(state));
  async function child(t, mode = "ok", descriptor = context()) {
    const file = path.join(s.root, `writer-${randomUUID()}.json`);
    await writeFile(file, JSON.stringify({ docsDir: s.docsDir, stateFile: s.options.stateFile, mode }), { mode: 0o600 });
    const env = { ...process.env }; delete env[ENV]; if (descriptor !== null) env[ENV] = typeof descriptor === "string" ? descriptor : JSON.stringify(descriptor);
    const processChild = spawn(process.execPath, [fileURLToPath(new URL("./helpers/source-writer-child.mjs", import.meta.url)), file], { env, cwd: s.root, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    const events = [], waiters = new Map(); let result, output = "";
    processChild.stdout.on("data", data => { output += data; }); processChild.stderr.on("data", data => { output += data; });
    processChild.on("message", event => { events.push(event); if (event.event === "result") result = event; waiters.get(event.event)?.(event); });
    const closed = new Promise((resolve, reject) => { processChild.once("error", reject); processChild.once("close", code => resolve({ code, result, output, events })); });
    const timer = setTimeout(() => processChild.kill(), 25000);
    t.after(async () => { if (processChild.exitCode === null && processChild.signalCode === null) processChild.kill(); await closed; clearTimeout(timer); });
    const event = name => {
      const prior = events.find(event => event.event === name); if (prior) return Promise.resolve(prior);
      return Promise.race([new Promise(resolve => { waiters.set(name, resolve); }), closed.then(value => { throw new Error(`Child closed before ${name}: ${JSON.stringify(value)}`); })]);
    };
    return { closed, event, resume: () => processChild.send({ resume: true }) };
  }
  await t.test("a real parent-held writer is released only after the child observes acquisition contention", async t => {
    await save(); let running;
    await withNativeSourceWriter(s.docsDir, s.options.stateFile, async () => { running = await child(t); await running.event("blocked"); });
    const result = await running.closed;
    assert.equal(result.code, 0, JSON.stringify(result)); assert.equal(result.result.entered, 1); assert.ok(result.result.blocked > 0);
  });
  await t.test("unbound writers remain fail-fast under the same actual held lock", async t => {
    await save(); let result;
    await withNativeSourceWriter(s.docsDir, s.options.stateFile, async () => { result = await (await child(t, "ok", null)).closed; });
    assert.equal(result.code, 1); assert.equal(result.result.name, "NativeSourceWriterBusyError"); assert.equal(result.result.entered, 0);
  });
  await t.test("content acquired before a busy state lock is released before waiting", async t => {
    await save(); let running;
    await withPublicationOperationalStateLock(s.options.stateFile, async () => {
      running = await child(t); const event = await running.event("blocked"); assert.equal(event.path, s.options.stateFile);
      const release = await lock(s.docsDir, { realpath: false, retries: { retries: 40, minTimeout: 10, maxTimeout: 10 }, stale: 10000, update: 5000 });
      await release();
    });
    const result = await running.closed; assert.equal(result.code, 0, JSON.stringify(result)); assert.equal(result.result.entered, 1);
  });
  await t.test("the parent's legitimate running receipt also permits the same bounded writer", async t => {
    const running = structuredClone(state); Object.values(running.operations)[0].to.sourceMove.commands.build.phase = "running";
    await writePublicationOperationalState(s.options.stateFile, running);
    const result = await (await child(t)).closed; assert.equal(result.code, 0, JSON.stringify(result)); assert.equal(result.result.entered, 1);
  });
  await t.test("parallel build hooks wait but a nested writer fails without re-entering its action", async t => {
    await save(); const parallel = await (await child(t, "parallel")).closed;
    assert.equal(parallel.code, 0, JSON.stringify(parallel)); assert.equal(parallel.result.entered, 2); assert.ok(parallel.result.blocked > 0);
    const nested = await (await child(t, "nested")).closed; assert.equal(nested.code, 0, JSON.stringify(nested)); assert.equal(nested.result.entered, 1);
  });
  await t.test("an ELOCKED thrown by an already-entered action is propagated and never replayed", async t => {
    await save(); const result = await (await child(t, "action-error")).closed;
    assert.equal(result.code, 1); assert.equal(result.result.code, "ELOCKED"); assert.equal(result.result.name, "Error"); assert.equal(result.result.entered, 1); assert.equal(result.result.blocked, 0);
  });
  await t.test("ownership and fence replacement while contended prevent the guarded action", async t => {
    await save(); let running;
    await withNativeSourceWriter(s.docsDir, s.options.stateFile, async () => {
      running = await child(t); await running.event("blocked");
      const replacement = structuredClone(state), to = Object.values(replacement.operations)[0].to;
      to.sourceFence++; to.sourceMove.fence++; to.sourceMove.commands.build.fence++;
      await writePublicationOperationalState(s.options.stateFile, replacement);
    });
    const result = await running.closed; assert.equal(result.code, 1); assert.equal(result.result.entered, 0); assert.match(result.result.message, /owner|fence|reconciliation/);
  });
  await t.test("a held lock cannot extend the original child deadline", async t => {
    await save(); let result;
    await withNativeSourceWriter(s.docsDir, s.options.stateFile, async () => { result = await (await child(t, "ok", { ...context(), deadlineMs: Date.now() + 1800 })).closed; });
    assert.equal(result.code, 1); assert.equal(result.result.entered, 0); assert.match(result.result.message, /deadline/); assert.ok(result.result.blocked > 0);
  });
  await t.test("the original deadline is checked again after both actual locks were acquired", async t => {
    await save(); const descriptor = { ...context(), deadlineMs: Date.now() + 4000 }, running = await child(t, "acquisition-barrier", descriptor);
    await running.event("pair-acquired");
    await new Promise(resolve => setTimeout(resolve, Math.max(1, descriptor.deadlineMs - Date.now() + 30))); running.resume();
    const result = await running.closed; assert.equal(result.code, 1); assert.equal(result.result.entered, 0); assert.match(result.result.message, /deadline/);
  });
  await t.test("uncertain and succeeded owners cannot grant a new writer even when no lock is held", async t => {
    for (const phase of ["uncertain", "succeeded"]) {
      const changed = structuredClone(state), saved = Object.values(changed.operations)[0].to.sourceMove.commands.build;
      saved.phase = phase;
      if (phase === "succeeded") Object.assign(saved, { pid: process.pid, completedAt: new Date().toISOString(), childClosedAt: new Date().toISOString(), terminationConfirmed: true });
      await writePublicationOperationalState(s.options.stateFile, changed);
      const result = await (await child(t)).closed; assert.equal(result.code, 1); assert.equal(result.result.entered, 0); assert.match(result.result.message, /owner|reconciliation/);
    }
  });
  await t.test("wrong command and content-root context cannot grant a guarded action", async t => {
    await save();
    for (const descriptor of [{ ...context(), commandId: randomUUID() }, { ...context(), docsDir: s.root }]) {
      const result = await (await child(t, "ok", descriptor)).closed; assert.equal(result.code, 1); assert.equal(result.result.entered, 0);
    }
  });
  await t.test("malformed or deploy context is refused rather than falling back to an unbound writer", async t => {
    await save();
    for (const descriptor of ["not-json", { ...context(), extra: true }, { ...context(), kind: "deploy" }, { ...context(), deadlineMs: 0 }]) {
      const result = await (await child(t, "ok", descriptor)).closed; assert.equal(result.code, 1); assert.equal(result.result.entered, 0); assert.match(result.result.message, /scheduling context/);
    }
  });
  await t.test("only supervised builds inherit the bounded scheduling context", () => {
    const deadline = Date.now() + 20000, built = sourceCommandChildEnvironment(s.docsDir, s.options.stateFile, command, deadline);
    assert.deepEqual(JSON.parse(built[ENV]), { ...context(), deadlineMs: deadline });
    assert.equal(sourceCommandChildEnvironment(s.docsDir, s.options.stateFile, { ...command, kind: "deploy" }, deadline)[ENV], undefined);
    assert.equal(Object.hasOwn(process.env, ENV), false, "parent environment was not changed");
  });
});
