import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { publishControlledDiscussions } from "../dist/controlled-creation.js";
import { NativePreparationLimitation } from "../dist/native-preparation.js";
import { completeNativePreparation } from "../dist/native-preparation.js";
import { CmsClient } from "../dist/cms-client.js";
import { resolveCmsToPage } from "../dist/cms-to.js";
import { readPublicationOperationalState, writePublicationOperationalState } from "../dist/operational-state.js";
import { withNativeSourceWriter } from "../dist/native-locks.js";
import { nativeSource, toFixture } from "./fixtures/cms-to.mjs";
import { buildToConsumer } from "./fixtures/native-to-consumer.mjs";
import { buildCmsConsumer, staticFixture } from "./fixtures/cms-static.mjs";

test("ordinary native To builds accept unformatted text and image-only articles with original/captured URL evidence", async t => {
  for (const [name, article] of [["unformatted", "0 — plain unformatted content"], ["image-only", '<img src="../media/diagram.png" alt="Native image">']]) await t.test(name, async child => {
    const state = await toFixture(child, nativeSource(article), "53");
    const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6qO8AAAAASUVORK5CYII=", "base64");
    if (name === "image-only") { await mkdir(path.join(state.root, "public/articles/media"), { recursive: true }); await writeFile(path.join(state.root, "public/articles/media/diagram.png"), image); }
    const output = await buildToConsumer(state);
    const operation = Object.values((await state.journal()).operations)[0], capture = operation.to.articleCaptures[operation.to.acceptedCaptureId], record = state.received[0].bridge_record;
    assert.equal(capture.original, article + "\n"); assert.equal(capture.sourceArticleUrl, "https://astro.example/articles/source/");
    assert.equal(capture.originalBytes, Buffer.byteLength(capture.original)); assert.equal(capture.originalSha256, state.digest(capture.original));
    assert.equal(record.source_content_sha256, state.digest(capture.preparedHtml)); assert.equal(record.source_content_bytes, Buffer.byteLength(capture.preparedHtml));
    assert.equal(record.content_html, capture.preparedHtml); assert.equal(record.representation.kind, "full");
    assert.equal((await readFile(state.file, "utf8")).split("---\n").at(-1), article + "\n", "native article remains intact");
    if (name === "image-only") { assert.match(record.content_html, /src="https:\/\/astro.example\/articles\/media\/diagram.png"/); assert.match(output, /alt="Native image"/); assert.deepEqual(await readFile(path.join(state.root, "dist/articles/media/diagram.png")), image); }
    else { assert.match(record.content_html, /plain unformatted content/); assert.match(output, /plain unformatted content/); }
  });
});

test("complete captured-base preparation precedes To excerpt/hash and exact pending/history remain immutable", async t => {
  const article = '[Target](../reference/?one=1&two=2)\n\n<img src="../media/one.png" alt="Image">\n\n' + "Complete original article λ. ".repeat(5000) + '\n\n[Tail](../final-target/)';
  const state = await toFixture(t, nativeSource(article), "53"); state.state.lostResponse = true;
  await assert.rejects(buildToConsumer(state));
  const lost = Object.values((await state.journal()).operations)[0], exact = structuredClone(lost.to.pending), captured = structuredClone(lost.to.articleCaptures[exact.captureId]);
  assert.equal(captured.original, article + "\n"); assert.ok(captured.preparedHtml.includes("https://astro.example/articles/reference/?one=1&amp;two=2"), "complete prepared link retains captured base/query");
  assert.ok(captured.preparedHtml.includes("https://astro.example/articles/media/one.png"), "complete image target retained"); assert.ok(captured.preparedHtml.includes("https://astro.example/articles/final-target/"), "complete tail precedes excerpt selection");
  assert.equal(exact.body.bridge_record.representation.kind, "generated_excerpt"); assert.equal(exact.body.bridge_record.source_content_sha256, state.digest(captured.preparedHtml));
  assert.equal(exact.body.bridge_record.source_content_bytes, Buffer.byteLength(captured.preparedHtml)); assert.ok(captured.preparedBytes > Buffer.byteLength(exact.body.bridge_record.content_html));
  await buildToConsumer(state); assert.deepEqual(state.received[1], state.received[0]);
  const accepted = Object.values((await state.journal()).operations)[0]; assert.deepEqual(accepted.to.articleCaptures[exact.captureId], captured);
  const receipt = structuredClone(accepted.to.receipts[exact.body.mutation_id]), oldRevision = accepted.to.acceptedRevision;
  await writeFile(state.file, (await readFile(state.file, "utf8")) + "\nActual native source edit.\n"); await buildToConsumer(state);
  const current = Object.values((await state.journal()).operations)[0]; assert.equal(state.received.at(-1).bridge_record.expected_source_revision, oldRevision);
  assert.notEqual(current.to.acceptedRevision, oldRevision); assert.deepEqual(current.to.articleCaptures[exact.captureId], captured); assert.deepEqual(current.to.receipts[exact.body.mutation_id], receipt);
});

test("uncaptured immutable pending/accepted source evidence is retained for reconciliation, never retrofitted", async t => {
  for (const phase of ["pending", "accepted"]) await t.test(phase, async child => {
    const state = await toFixture(child, nativeSource('[Original](../relative/)'), "53");
    if (phase === "pending") { state.state.lostResponse = true; await assert.rejects(publishControlledDiscussions(state.options)); }
    else await publishControlledDiscussions(state.options);
    const journal = await state.journal(), to = Object.values(journal.operations)[0].to;
    // Explicit saved-state fixture lacking capture evidence; no conversion is commissioned.
    if (to.pending) delete to.pending.captureId; delete to.acceptedCaptureId; delete to.articleCaptures;
    for (const receipt of Object.values(to.receipts)) delete receipt.captureId;
    const exact = structuredClone(to), count = state.received.length; await writeFile(state.options.stateFile, JSON.stringify(journal));
    await assert.rejects(publishControlledDiscussions(state.options), /lacks original article\/source-URL preparation evidence/);
    const retained = Object.values((await state.journal()).operations)[0].to;
    assert.deepEqual(retained, exact); assert.equal(state.received.length, count); assert.equal(state.withdrawals.length, 0);
  });
});

test("typed To snapshot mapping accepts genuine complete prepared normalization without inventing raw edits or dates", async t => {
  const state = await toFixture(t, nativeSource("An ordinary native article."), "53"); await publishControlledDiscussions(state.options);
  const actualNative = await readFile(state.file, "utf8");
  await withNativeSourceWriter(state.docsDir, state.options.stateFile, async () => {
    const journal = await readPublicationOperationalState(state.options.stateFile), operation = Object.values(journal.operations)[0], before = structuredClone(operation.to);
    const old = before.acceptedBody.bridge_record, capture = before.articleCaptures[before.acceptedCaptureId];
    // This typed-engine fixture supplies a real complete normalized snapshot;
    // it installs no normalization option or fabricated native edit in production.
    const preparation = completeNativePreparation(capture, capture.renderedHtml, capture.preparedHtml + "\n");
    const page = { pageUrl: old.canonical_url, title: old.title, externalId: old.external_id, contentHtml: preparation.preparedHtml, preparation,
      createdAt: old.source_created_at, updatedAt: old.source_updated_at, existingResourceId: operation.resourceId, existingTopicId: operation.topicId };
    const client = new CmsClient({ serverUrl: state.options.discourseUrl, ...state.options.controlledCreation }), connection = await client.connection();
    const input = { client, connection, operation, page, excerptArticle() { throw new Error("Full snapshot fixture needs no excerpt."); },
      persist: () => writePublicationOperationalState(state.options.stateFile, journal), assertCurrentNative: async () => assert.equal(await readFile(state.file, "utf8"), actualNative) };
    await resolveCmsToPage(input); const next = state.received.at(-1).bridge_record;
    assert.notEqual(next.source_revision, old.source_revision); assert.equal(next.expected_source_revision, old.source_revision);
    assert.equal(next.source_created_at, old.source_created_at); assert.equal(next.source_updated_at, old.source_updated_at);
    assert.equal(next.source_content_sha256, state.digest(preparation.preparedHtml)); assert.equal(await readFile(state.file, "utf8"), actualNative);
    assert.deepEqual(operation.to.receipts[before.acceptedBody.mutation_id], before.receipts[before.acceptedBody.mutation_id]);
    const exact = structuredClone(operation.to.pending.body); await resolveCmsToPage(input); assert.deepEqual(state.received.at(-1), exact);
    assert.equal(operation.to.acceptedRevision, next.source_revision); assert.equal(state.state.creations, 1);
  });
});

test("incoming From wire integrity stays original while plain/image/relative native copies use edition topic URL", async t => {
  for (const [name, original] of [["plain", "Plain unformatted native cooked text"], ["image-only", '<img src="../uploads/diagram.png" alt="Native diagram">'], ["links", '<p><a href="../reference/?a=1&amp;b=2">Target</a><img src="./media/image.png" alt="Image"></p>']]) await t.test(name, async child => {
    const state = await staticFixture(child, {}, original, "full", false), built = await buildCmsConsumer(state, true);
    const journal = JSON.parse(await readFile(state.options.stateFile, "utf8")), transaction = journal.transactions[state.expectedWorkId], capture = transaction.articleCapture;
    assert.equal(capture.original, original); assert.equal(capture.originalSha256, state.sourceRecord.content_sha256); assert.equal(capture.originalBytes, state.sourceRecord.content_bytes);
    assert.equal(capture.sourceArticleUrl, state.sourceRecord.topic_url); assert.equal(transaction.plan.source.content_sha256, state.sourceRecord.content_sha256);
    assert.equal(capture.preparedBytes, Buffer.byteLength(capture.preparedHtml)); assert.equal(transaction.buildArtifact.html, built);
    if (name === "plain") assert.match(built, /Plain unformatted native cooked text/);
    if (name === "image-only") { assert.match(capture.preparedHtml, /src="https:\/\/forum.example\/t\/uploads\/diagram.png"/); assert.match(built, /Native diagram/); assert.notEqual(capture.preparedSha256, capture.originalSha256); }
    if (name === "links") { assert.match(capture.preparedHtml, /href="https:\/\/forum.example\/t\/reference\/\?a=1&amp;b=2"/); assert.match(capture.preparedHtml, /src="https:\/\/forum.example\/t\/source\/media\/image.png"/); }
  });
});

test("From rejects an actual transport-integrity mismatch before capture/conversion/native mutation", async t => {
  const state = await staticFixture(t, { content_sha256: "0".repeat(64) }, '<img src="relative.png" alt="Article image">');
  await assert.rejects(state.prepare(), /complete source digest/);
  const transaction = JSON.parse(await readFile(state.options.stateFile, "utf8")).transactions[state.claimed.workId];
  assert.equal(transaction.articleCapture, undefined); assert.equal(transaction.plan, undefined); assert.equal(state.prepared.length, 0);
});

test("existing safety/media/excerpt inability is a Bridge limitation with originals retained and no replacement policy", async t => {
  for (const original of ['<p><a href="http://example.invalid/original">Original target</a></p>', '<img src="image.png" srcset="small.png 1x, large.png 2x">']) await t.test(original.includes("srcset") ? "responsive image recipe" : "existing native URI boundary", async child => {
    const state = await staticFixture(child, {}, original);
    await assert.rejects(state.prepare(), NativePreparationLimitation);
    const transaction = JSON.parse(await readFile(state.options.stateFile, "utf8")).transactions[state.claimed.workId];
    assert.equal(transaction.articleCapture.original, original); assert.equal(transaction.articleCapture.sourceArticleUrl, state.sourceRecord.topic_url);
    assert.equal(transaction.localLimitation.kind, "native_preparation"); assert.equal(transaction.plan, undefined); assert.equal(state.prepared.length, 0); assert.equal(state.failures.length, 0);
  });
  const imageOnly = '<img src="https://images.example/' + "a".repeat(50000) + '.png" alt="Original image">';
  const state = await toFixture(t, nativeSource(imageOnly), "53"); await assert.rejects(publishControlledDiscussions(state.options), NativePreparationLimitation);
  const operation = Object.values((await state.journal()).operations)[0], capture = Object.values(operation.to.articleCaptures)[0];
  assert.equal(capture.original, imageOnly + "\n"); assert.ok(capture.preparedBytes > 49152); assert.equal(state.received.length, 0); assert.equal(operation.to.pending, undefined);
});

test("native managed Markdown image target requires actual asset mapping; no intermediate empty image is published", async t => {
  const article = "![Native managed image](../assets/native.png)";
  const state = await toFixture(t, nativeSource(article), "53");
  const results = await publishControlledDiscussions(state.options);
  const journal = await state.journal(), handoff = Object.values(journal.operations)[0].nativeRender;
  assert.equal(results[0].status, "skipped"); assert.match(results[0].reason, /Awaiting actual native Content/);
  assert.equal(handoff.originalCapture.original, article + "\n"); assert.equal(handoff.originalCapture.sourceArticleUrl, "https://astro.example/articles/source/");
  assert.equal(handoff.originalCapture.preparedHtml, undefined); assert.equal(state.received.length, 0); assert.equal(state.withdrawals.length, 0);
});

test("actual To and From function/DATA loss retains originals before receiver or native mutation", async t => {
  for (const [label, article, message] of [["function", '<p onclick="nativeInteraction()">Native interaction</p>', /onclick handler FUNCTION/], ["data", '<script type="application/json">{"article":"data"}</script>', /article DATA/]]) await t.test(label, async child => {
    const to = await toFixture(child, nativeSource(article), "53");
    await assert.rejects(publishControlledDiscussions(to.options), message);
    const limitation = Object.values((await to.journal()).preparationLimitations)[0];
    assert.equal(limitation.capture.original, article + "\n"); assert.equal(to.received.length, 0);
    const from = await staticFixture(child, {}, article);
    await assert.rejects(from.prepare(), message);
    const transaction = JSON.parse(await readFile(from.options.stateFile, "utf8")).transactions[from.claimed.workId];
    assert.equal(transaction.articleCapture.original, article); assert.equal(transaction.plan, undefined);
    assert.equal(from.failures.length, 0); assert.equal(from.prepared.length, 0);
  });
});
