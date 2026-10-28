import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import test from "node:test";
import { publishControlledDiscussions, withdrawControlledSource } from "../dist/controlled-creation.js";
import { generatedReadMore, measureToFullEnvelope } from "../src/private/cms-runtime.mjs";
import { nativeSource, toFixture } from "./fixtures/cms-to.mjs";
const operation = async state => Object.values((await state.journal()).operations)[0];

test("native V4 source updates preserve exact identities/all authors/null dates/current opaque predecessor", async t => {
  const fixture = await toFixture(t, nativeSource("Native body.", "authors:\n  - id: a:1\n    name: First\n    profileUrl: https://astro.example/authors/first\n  - id: a:2\n    name: Second\nprimaryAuthor: a:2\n"));
  const [first] = await publishControlledDiscussions(fixture.options), original = fixture.received[0].bridge_record;
  assert.equal(first.topicId, "9223372036854775807"); assert.equal(original.expected_source_revision, null); assert.deepEqual(original.source_authors, [{ id: "a:1", name: "First" }, { id: "a:2", name: "Second" }]);
  assert.equal(original.primary_source_author_id, "a:2"); assert.equal(original.source_created_at, "2026-09-01T08:00:00.000Z"); assert.equal(original.source_content_sha256, fixture.digest(original.content_html));
  const file = await readFile(fixture.file, "utf8"); await writeFile(fixture.file, file.replace("Native body.", "Continuing native edit."));
  const [second] = await publishControlledDiscussions(fixture.options), current = fixture.received[1].bridge_record;
  assert.equal(second.resourceId, first.resourceId); assert.equal(second.topicId, first.topicId); assert.equal(current.expected_source_revision, original.source_revision); assert.notEqual(current.source_revision, original.source_revision);
  assert.equal((await operation(fixture)).to.pending, undefined); assert.equal(fixture.state.creations, 1); assert.match(await readFile(fixture.file, "utf8"), /consumerField: retained/);
  const unknown = await toFixture(t, nativeSource().replace(/^date:.*\n|^lastUpdated:.*\n/gmu, "")); await publishControlledDiscussions(unknown.options); assert.equal(unknown.received[0].bridge_record.source_created_at, null); assert.equal(unknown.received[0].bridge_record.source_updated_at, null);
});

test("native fullJSON-overcap and large sources use exact owned generated suffix with truthful complete hashes and immutable selection snapshot", async t => {
  for (const body of ['"'.repeat(45000), "λ prose. ".repeat(10000)]) await t.test(Buffer.byteLength(body).toString(), async child => {
    const fixture = await toFixture(child, nativeSource(body)); await publishControlledDiscussions(fixture.options);
    const record = fixture.received[0].bridge_record, complete = `<p>${body.trimEnd()}</p>`, rep = record.representation;
    assert.equal(rep.kind, "generated_excerpt"); assert.equal(record.source_content_bytes, Buffer.byteLength(complete)); assert.equal(record.source_content_sha256, fixture.digest(complete));
    assert.equal(rep.selection_full_request_bytes, measureToFullEnvelope(record, complete)); assert.equal(rep.selection_source_revision, record.source_revision);
    assert.ok(record.content_html.endsWith(generatedReadMore(record.canonical_url))); assert.ok(Buffer.byteLength(record.content_html) <= 49152); assert.ok(Buffer.byteLength(fixture.rawBodies[0]) <= 65536);
    const initial = structuredClone(rep); await publishControlledDiscussions(fixture.options); assert.deepEqual(fixture.received[1].bridge_record.representation, initial);
    const receipts = (await operation(fixture)).to.receipts; assert.deepEqual(receipts[fixture.received[0].mutation_id].body, fixture.received[0]); assert.equal(fixture.state.creations, 1);
  });
});

test("lost accepted source response replays exact durable bytes while changed native source cannot replace intent", async t => {
  const fixture = await toFixture(t); fixture.state.lostResponse = true; await assert.rejects(publishControlledDiscussions(fixture.options));
  const pending = (await operation(fixture)).to.pending; assert.deepEqual(pending.body, fixture.received[0]);
  const original = await readFile(fixture.file, "utf8"); await writeFile(fixture.file, original.replace("Native body.", "Other native edit.")); await assert.rejects(publishControlledDiscussions(fixture.options), /exact source mutation/);
  assert.equal(fixture.received.length, 1); await writeFile(fixture.file, original); await publishControlledDiscussions(fixture.options);
  assert.equal(fixture.rawBodies[0], fixture.rawBodies[1]); assert.equal(fixture.mutations.size, 1); assert.equal(fixture.state.creations, 1);
});

test("current source lifecycle captures all four exact reasons, retains discussion/history and prevents implicit resolve", async t => {
  for (const reason of ["source_unpublished", "source_deleted", "source_ineligible", "policy_excluded"]) await t.test(reason, async child => {
    const fixture = await toFixture(child); await publishControlledDiscussions(fixture.options); const before = structuredClone(fixture.state.record);
    const source = await readFile(fixture.file, "utf8");
    if (reason === "source_deleted") await unlink(fixture.file);
    else if (reason === "source_unpublished") await writeFile(fixture.file, source.replace("consumerField: retained", "draft: true\nconsumerField: retained"));
    else if (reason === "source_ineligible") await writeFile(fixture.file, source.replace("discussionSync: true", "discussionSync: false"));
    const receipt = await withdrawControlledSource(fixture.options, fixture.file, reason); assert.deepEqual(receipt, { ...before, state: "withdrawn" });
    const saved = await operation(fixture); assert.equal(saved.to.withdrawal.phase, "withdrawn"); assert.equal(saved.to.withdrawal.body.reason, reason); assert.equal(saved.to.withdrawal.body.expected_source_revision, before.source_revision);
    if (reason !== "source_deleted") { await writeFile(fixture.file, source); await assert.rejects(publishControlledDiscussions(fixture.options), /cannot silently resume/); }
    assert.equal(fixture.received.length, 1); assert.equal(fixture.state.creations, 1);
  });
});

test("lost lifecycle response retains exact request and current disabled authority cannot fabricate success", async t => {
  const fixture = await toFixture(t); await publishControlledDiscussions(fixture.options); fixture.state.lostWithdrawal = true;
  await assert.rejects(withdrawControlledSource(fixture.options, fixture.file, "policy_excluded")); const original = structuredClone((await operation(fixture)).to.withdrawal.body);
  fixture.state.disabled = true; await assert.rejects(withdrawControlledSource(fixture.options, fixture.file, "policy_excluded")); assert.equal((await operation(fixture)).to.withdrawal.phase, "pending");
  fixture.state.disabled = false; await withdrawControlledSource(fixture.options, fixture.file, "policy_excluded"); assert.deepEqual(fixture.withdrawals[1], original); assert.equal(fixture.withdrawalMutations.size, 1);
});

test("current media silent-loss boundary is explicit and leaves original source before hash/receiver mutation", async t => {
  for (const markup of ['<video controls><source src="https://media.example/video.mp4"><track src="https://media.example/captions.vtt">Native fallback</video>', '<audio controls src="https://media.example/audio.mp3">Native fallback</audio>', '<iframe src="https://provider.example/embed/native"></iframe>']) await t.test(markup.slice(0, 12), async child => {
    const fixture = await toFixture(child, nativeSource(markup)), before = await readFile(fixture.file, "utf8");
    await assert.rejects(publishControlledDiscussions(fixture.options), /media preservation/); assert.equal(await readFile(fixture.file, "utf8"), before); assert.equal(fixture.received.length, 0);
  });
});
