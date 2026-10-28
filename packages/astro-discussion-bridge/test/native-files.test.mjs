import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { atomicWrite, readExistingPublication, removeOwnedPublication } from "../dist/native-files.js";
import { withNativeSourceWriter } from "../dist/native-locks.js";
import { writePrivateJournal, readPrivateJournal } from "../dist/native-journal.js";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";
async function fixture(t) { const parent = fileURLToPath(new URL("../.tmp/", import.meta.url)); await mkdir(parent, { recursive: true }); return ownedTempFixture(t, "discussionbridge-native-files-", parent); }

test("native first claim/update/remove preserve unowned or changed files", async t => {
  const root = await fixture(t), file = path.join(root, "source.md");
  await writeFile(file, "operator object"); await assert.rejects(atomicWrite(file, "overwrite", null)); assert.equal(await readFile(file, "utf8"), "operator object");
  const prior = await readExistingPublication(file); await writeFile(file, "operator edit");
  await assert.rejects(atomicWrite(file, "overwrite", prior)); await assert.rejects(removeOwnedPublication(file, prior)); assert.equal(await readFile(file, "utf8"), "operator edit");
  const current = await readExistingPublication(file); await atomicWrite(file, "owned update", current); assert.equal(await readFile(file, "utf8"), "owned update");
  await removeOwnedPublication(file, await readExistingPublication(file)); assert.equal(await readExistingPublication(file), null);
});

test("one native writer and private durable exact-state persistence survive completion without widening content scope", async t => {
  const root = await fixture(t), docs = path.join(root, "content"), journal = path.join(root, "private/state.json"); await mkdir(docs);
  const validate = value => { assert.equal(value.format, 1); assert.equal(value.mutation.id, "captured-exact-native-intent"); return value; };
  const state = { format: 1, mutation: { id: "captured-exact-native-intent", body: { quoted: '"λ"', nativeRevision: null } }, command: { phase: "uncertain" }, history: [{ exact: true }] };
  await withNativeSourceWriter(docs, journal, async () => {
    await assert.rejects(withNativeSourceWriter(docs, journal, async () => {}), /already in use/);
    await writePrivateJournal(journal, state, validate); assert.deepEqual(await readPrivateJournal(journal, validate), state);
  });
  await withNativeSourceWriter(docs, journal, async () => assert.deepEqual(await readPrivateJournal(journal, validate), state));
  await assert.rejects(withNativeSourceWriter(docs, path.join(docs, "private.json"), async () => {}), /outside native content/);
});
