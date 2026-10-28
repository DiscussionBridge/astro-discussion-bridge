import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { publishControlledDiscussions } from "../dist/controlled-creation.js";
import { nativeSource, toFixture } from "./fixtures/cms-to.mjs";
import { buildToConsumer } from "./fixtures/native-to-consumer.mjs";
const operation = async state => Object.values((await state.journal()).operations)[0];

test("ordinary actual Astro builds reconcile accepted unpublish/ineligible/deletion without rewriting discussion/native source", async t => {
  for (const reason of ["source_unpublished", "source_ineligible", "source_deleted"]) await t.test(reason, async child => {
    const state = await toFixture(child, nativeSource(), "53"); await buildToConsumer(state);
    const accepted = structuredClone(state.state.record), source = await readFile(state.file, "utf8");
    if (reason === "source_deleted") await unlink(state.file);
    else await writeFile(state.file, reason === "source_unpublished" ? source.replace("consumerField: retained", "draft: true\nconsumerField: retained") : source.replace("discussionSync: true", "discussionSync: false"));
    const actual = reason === "source_deleted" ? null : await readFile(state.file, "utf8");
    await buildToConsumer(state);
    assert.equal(state.withdrawals.length, 1); assert.equal(state.withdrawals[0].reason, reason); assert.equal(state.withdrawals[0].expected_source_revision, accepted.source_revision);
    assert.deepEqual(state.state.record, { ...accepted, state: "withdrawn" }); assert.equal(state.received.length, 1); assert.equal(state.state.creations, 1);
    if (actual !== null) assert.equal(await readFile(state.file, "utf8"), actual);
    if (reason !== "source_ineligible") await assert.rejects(readFile(path.join(state.root, "dist/articles/source/index.html")), { code: "ENOENT" });
    await buildToConsumer(state); assert.equal(state.withdrawals.length, 1, "later builds do not invent another withdrawal/resolve");
    if (reason !== "source_deleted") { await writeFile(state.file, source); await assert.rejects(buildToConsumer(state), /cannot silently resume/); assert.equal(state.received.length, 1); }
  });
});

test("ordinary close restart replays only the exact lost05 receipt", async t => {
  const state = await toFixture(t, nativeSource(), "53"); await buildToConsumer(state); const source = await readFile(state.file, "utf8");
  await writeFile(state.file, source.replace("consumerField: retained", "draft: true\nconsumerField: retained")); state.state.lostWithdrawal = true;
  await assert.rejects(buildToConsumer(state), /transport or typed response/); const pending = structuredClone((await operation(state)).to.withdrawal);
  await buildToConsumer(state); assert.deepEqual(state.withdrawals[1], pending.body); assert.equal(state.withdrawalMutations.size, 1);
  assert.equal((await operation(state)).to.withdrawal.phase, "withdrawn"); assert.equal(state.received.length, 1);
});

test("knownA close retains uncertain02B unreplayed;04B cannot promote a guessed predecessor", async t => {
  for (const committed of [false, true]) await t.test(committed ? "B committed but response lost" : "B not committed", async child => {
    const state = await toFixture(child); await publishControlledDiscussions(state.options); const acceptedA = state.state.record.source_revision;
    await writeFile(state.file, (await readFile(state.file, "utf8")).replace("Native body.", "Edition B."));
    const original = state.options.controlledCreation.fetchImplementation;
    if (committed) state.state.lostResponse = true;
    else state.options.controlledCreation.fetchImplementation = async (url, init) => new URL(url).pathname.endsWith("resolve.json") ? Promise.reject(new Error("Request B not delivered")) : original(url, init);
    await assert.rejects(publishControlledDiscussions(state.options)); state.options.controlledCreation.fetchImplementation = original;
    const pendingB = structuredClone((await operation(state)).to.pending), beforeRequests = state.received.length;
    await writeFile(state.file, (await readFile(state.file, "utf8")).replace("consumerField: retained", "draft: true\nconsumerField: retained"));
    if (committed) { await assert.rejects(publishControlledDiscussions(state.options), /exact current native\/receiver binding/); assert.equal(state.withdrawals.length, 0); }
    else { await publishControlledDiscussions(state.options); assert.equal(state.withdrawals[0].expected_source_revision, acceptedA); assert.equal((await operation(state)).to.withdrawal.phase, "withdrawn"); }
    assert.deepEqual((await operation(state)).to.pending, pendingB); assert.equal(state.received.length, beforeRequests, "closed source never replays published=true B");
  });
});

test("failed or changed corpus and missing pre-guard upgrade source never become deletion evidence", async t => {
  const state = await toFixture(t); await publishControlledDiscussions(state.options); await unlink(state.file);
  const invalid = path.join(state.docsDir, "invalid.md"); await writeFile(invalid, "---\ntitle: [broken\n---\nBody");
  await assert.rejects(publishControlledDiscussions(state.options)); assert.equal(state.withdrawals.length, 0); await unlink(invalid);
  await assert.rejects(publishControlledDiscussions({ ...state.options, routeBase: "changed" }), /scope\/root changed/); assert.equal(state.withdrawals.length, 0);
  const journal = await state.journal(); delete journal.nativeCensus; await writeFile(state.options.stateFile, JSON.stringify(journal));
  await assert.rejects(publishControlledDiscussions(state.options), /no prior complete native census/); assert.equal(state.withdrawals.length, 0); assert.equal(state.received.length, 1);
});
