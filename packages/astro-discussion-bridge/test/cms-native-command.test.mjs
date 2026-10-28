import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { deployCmsNativeBuild } from "../dist/cms-pipeline.js";
import { recordCmsNativeBuild } from "../dist/cms-static.js";
import { buildCmsConsumer, staticFixture } from "./fixtures/cms-static.mjs";

test("real disposable Node child supervision preserves authority and durable uncertain ownership", async t => {
  async function fixture(child, wait = false) {
    const state = await staticFixture(child); await state.prepare(); const built = await buildCmsConsumer(state);
    await recordCmsNativeBuild(state.options, path.join(state.root, "dist"));
    const script = path.join(state.root, "harmless-owned-child.mjs"), witness = path.join(state.root, "child-witness.txt"), heartbeat = path.join(state.root, "child-heartbeat.txt");
    await writeFile(script, `import { appendFileSync, writeFileSync } from 'node:fs';\nappendFileSync(process.argv[2], 'one harmless local child\\n');\n${wait ? "setInterval(() => writeFileSync(process.argv[3], String(Date.now())), 25);" : "writeFileSync(process.argv[3], 'closed normally');"}`);
    return { state, built, witness, heartbeat, command: { executable: process.execPath, args: [script, witness, heartbeat], cwd: state.root, timeoutMs: 20_000 } };
  }
  await t.test("real successful close receipt replays lost finalize without another OS child", async child => {
    const { state, built, witness, command } = await fixture(child);
    const options = { ...state.options, publicFetchImplementation: async () => new Response(built, { headers: { "Content-Type": "text/html" } }) };
    state.loseNext("finalize"); await assert.rejects(deployCmsNativeBuild(options, command));
    const pending = JSON.parse(await readFile(state.options.stateFile, "utf8"));
    assert.equal(pending.nativeCommand.phase, "succeeded"); assert.equal(pending.nativeCommand.terminationConfirmed, true);
    assert.ok(pending.nativeCommand.pid > 0); assert.ok(Date.parse(pending.nativeCommand.completedAt) >= Date.parse(pending.nativeCommand.childClosedAt));
    const result = await deployCmsNativeBuild(options, command); assert.equal(result.results[0].stage, "verified");
    assert.equal(await readFile(witness, "utf8"), "one harmless local child\n"); assert.deepEqual(state.finalized[1], state.finalized[0]);
  });
  for (const failure of ["renewal lost", "newer generation"]) await t.test(`real running child closes on ${failure} and uncertain owner prevents duplicate execution`, async child => {
    const { state, witness, heartbeat, command } = await fixture(child, true);
    child.mock.timers.enable({ apis: ["setInterval"] });
    let started = false;
    const options = { ...state.options, fetchImplementation: async (url, init) => {
      if (started && failure === "renewal lost" && new URL(url).pathname.endsWith("renew.json")) throw new Error("Isolated lost renewal response");
      const response = await state.options.fetchImplementation(url, init);
      if (started && failure === "newer generation" && /\/work\/[^/]+\.json$/u.test(new URL(url).pathname)) {
        const value = await response.json(); value.work.lease_generation += 1; return Response.json(value);
      }
      return response;
    } };
    const execution = deployCmsNativeBuild(options, command); let executionError;
    execution.catch(error => { executionError = error; });
    const deadline = Date.now() + 30_000;
    try {
      while (!started) {
        try { await readFile(heartbeat); started = true; }
        catch (error) { if (executionError) throw executionError; if (error.code !== "ENOENT" || Date.now() >= deadline) throw error; await new Promise(resolve => setTimeout(resolve, 20)); }
      }
      child.mock.timers.tick(60_000);
      await assert.rejects(execution, /effect is uncertain/);
    } finally { await execution.catch(() => undefined); child.mock.timers.reset(); }
    const journal = JSON.parse(await readFile(state.options.stateFile, "utf8"));
    assert.equal(journal.nativeCommand.phase, "uncertain"); assert.equal(journal.nativeCommand.terminationConfirmed, true);
    assert.ok(journal.nativeCommand.childClosedAt); assert.equal(journal.transactions[state.claimed.workId].publiclyVerifiedAt, undefined);
    assert.throws(() => process.kill(journal.nativeCommand.pid, 0), { code: "ESRCH" });
    const last = await readFile(heartbeat, "utf8"); await new Promise(resolve => setTimeout(resolve, 75)); assert.equal(await readFile(heartbeat, "utf8"), last);
    await assert.rejects(deployCmsNativeBuild(options, command), /must reconcile/);
    assert.equal(await readFile(witness, "utf8"), "one harmless local child\n"); assert.equal(state.finalized.length, 0);
  });
});
