import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { registerHooks } from "node:module";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as nativeFiles from "../dist/native-files.js";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";

async function fixture(t) {
  const parent = fileURLToPath(new URL("../.tmp/", import.meta.url));
  await mkdir(parent, { recursive: true });
  return ownedTempFixture(t, "discussionbridge-journal-durability-", parent);
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}

async function loadWithFiles(t, name, overrides) {
  const key = `discussionbridge-durability-${randomUUID()}`;
  const target = new URL(`../dist/${name}.js?${key}`, import.meta.url).href;
  globalThis[Symbol.for(key)] = { ...nativeFiles, ...overrides };
  const proxy = `const files = globalThis[Symbol.for(${JSON.stringify(key)})];
    export const assertPublicationDirectory = files.assertPublicationDirectory;
    export const mkdirDurably = files.mkdirDurably;
    export const syncDirectory = files.syncDirectory;`;
  const hook = registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier === "./native-files.js" && context.parentURL === target) {
      return { url: `data:text/javascript,${encodeURIComponent(proxy)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  } });
  t.after(() => { hook.deregister(); delete globalThis[Symbol.for(key)]; });
  return import(target);
}

const state = { format: 1, mutation: { id: "exact-durable-intent", body: '"λ"' }, phase: "uncertain" };
const validate = value => { assert.equal(value.mutation.id, state.mutation.id); return value; };
const ioFailure = () => Object.assign(new Error("directory flush failed"), { code: "EIO" });

test("private journal success awaits the renamed parent directory flush", { timeout: 10000 }, async t => {
  const root = await fixture(t), file = path.join(root, "private/state.json");
  const entered = deferred(), acknowledgment = deferred();
  t.after(() => acknowledgment.resolve());
  const journal = await loadWithFiles(t, "native-journal", { syncDirectory: async directory => {
    assert.equal(directory, path.dirname(file));
    await nativeFiles.syncDirectory(directory);
    entered.resolve();
    await acknowledgment.promise;
  } });
  let settled = false;
  const writing = journal.writePrivateJournal(file, state, validate);
  const finished = writing.then(() => { settled = true; return "finished"; }, error => { settled = true; throw error; });
  assert.equal(await Promise.race([entered.promise.then(() => "flush"), finished]), "flush", "success must reach the directory flush before returning");
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), state);
  await setImmediate();
  assert.equal(settled, false, "success cannot precede the flush acknowledgment");
  acknowledgment.resolve();
  await writing;
  assert.deepEqual(await journal.readPrivateJournal(file, validate), state);
});

test("private journal propagates a parent flush failure after complete rename", { timeout: 10000 }, async t => {
  const root = await fixture(t), file = path.join(root, "private/state.json");
  const journal = await loadWithFiles(t, "native-journal", { syncDirectory: async directory => {
    assert.equal(directory, path.dirname(file));
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), state);
    throw ioFailure();
  } });
  await assert.rejects(journal.writePrivateJournal(file, state, validate), { code: "EIO" });
  assert.deepEqual(await journal.readPrivateJournal(file, validate), state);
});

for (const name of ["withNativeSourceWriter", "withPublicationOperationalStateLock"]) {
  test(`${name} rejects new private parent durability failure before action`, { timeout: 10000 }, async t => {
    const root = await fixture(t), docs = path.join(root, "content"), file = path.join(root, "new-private/nested/state.json");
    await mkdir(docs);
    const locks = await loadWithFiles(t, "native-locks", { mkdirDurably: async directory => {
      assert.equal(directory, path.dirname(file));
      await nativeFiles.mkdirDurably(directory);
      assert.equal((await stat(directory)).isDirectory(), true);
      throw ioFailure();
    } });
    let acted = false, failure;
    const action = async () => { acted = true; };
    try {
      if (name === "withNativeSourceWriter") await locks[name](docs, file, action);
      else await locks[name](file, action);
    } catch (error) { failure = error; }
    assert.equal(acted, false, "a failed new-parent durability step must prevent the action");
    assert.equal(failure?.code, "EIO");
    assert.equal((await stat(path.dirname(file))).isDirectory(), true);
  });
}
