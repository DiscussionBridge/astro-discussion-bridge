import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const config = JSON.parse(await readFile(process.argv[2], "utf8"));
const send = value => process.send?.(value);
// Observe actual library contention without changing its result or the real
// filesystem. The parent releases its barrier only after an actual ELOCKED.
const lockfile = createRequire(import.meta.url)("proper-lockfile"), original = lockfile.lock;
let blocked = 0, entered = 0, releaseFirst;
lockfile.lock = async (...args) => {
  try {
    const release = await original(...args);
    if (config.mode === "acquisition-barrier" && args[0] === config.stateFile) {
      const resume = new Promise(resolve => { process.once("message", resolve); });
      send({ event: "pair-acquired" }); await resume;
    }
    return release;
  }
  catch (error) { if (error.code === "ELOCKED") { blocked++; send({ event: "blocked", path: args[0] }); releaseFirst?.(); } throw error; }
};
const { withNativeSourceWriter } = await import("../../dist/native-locks.js");
const write = action => withNativeSourceWriter(config.docsDir, config.stateFile, action);
try {
  if (config.mode === "parallel") {
    let started;
    const ready = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { releaseFirst = resolve; });
    const first = write(async () => { entered++; started(); await gate; });
    await ready;
    await Promise.all([first, write(async () => { entered++; })]);
  } else await write(async () => {
    entered++; send({ event: "entered" });
    if (config.mode === "action-error") throw Object.assign(new Error("Test-owned guarded action ELOCKED, not an acquisition failure."), { code: "ELOCKED" });
    if (config.mode === "nested") {
      try { await write(async () => { entered++; }); throw new Error("Nested writer unexpectedly entered."); }
      catch (error) { if (error.name !== "NativeSourceWriterBusyError") throw error; }
    }
  });
  send({ event: "result", ok: true, blocked, entered });
} catch (error) { send({ event: "result", ok: false, blocked, entered, name: error.name, code: error.code, message: error.message }); process.exitCode = 1; }
process.disconnect?.();
