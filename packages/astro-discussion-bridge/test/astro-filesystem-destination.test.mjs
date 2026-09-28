import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAstroFilesystemDestination } from "../dist/astro-filesystem-destination.js";

const resourceId = "11111111-1111-4111-8111-111111111111";

function work(action = "publish", sequence = 1) {
  return {
    workId: "dbw_11111111111111111111111111111111",
    resourceId,
    connectionId: "dbc_0123456789abcdef01234567",
    action,
    sourceRevision: `post:149:version:${sequence}`,
    sourceRevisionSequence: sequence,
    policyRevision: "policy:1",
    destinationPolicyId: "destination:astro:primary:1",
    catalogRevision: "catalog:astro:1",
    presentationMode: "interactive",
    resolvedContainer: { id: "astro:collection:docs", kind: "content_collection" },
    resolvedTaxonomy: [],
    resolvedAuthor: { mode: "source_attribution", destinationId: null },
    nativeLimitPolicy: { maximumBytes: 49_152, overflowBehavior: "excerpt_with_read_more" },
    leaseToken: "1".repeat(64),
    stageToken: "2".repeat(64),
    leaseExpiresAt: "2026-09-28T18:00:00Z",
    attemptCount: 1,
    retryGeneration: 0,
  };
}

function publication(sequence = 1, title = "The Bridge publishes everywhere") {
  const contentHtml = `<h2>One source</h2><pre><code class="lang-mermaid">flowchart TD</code></pre><table><tbody><tr><td>Native Astro ${sequence}</td></tr></tbody></table>`;
  return {
    source: {
      resourceId,
      topicId: 53,
      topicUrl: "https://forum.example/t/publisher/53",
      title,
      sourceRevision: `post:149:version:${sequence}`,
      sourceRevisionSequence: sequence,
      sourceCreatedAt: "2026-09-01T08:00:00.000Z",
      sourceUpdatedAt: `2026-09-0${sequence}T09:00:00.000Z`,
      sourceAuthors: [{ display_name: "Author: [One]" }],
      categories: [],
      tags: [],
      presentationMode: "interactive",
      contentDisposition: "complete",
      networkProvenance: null,
      contentHtml,
      sanitizedContentHtml: contentHtml,
      sourceContentBytes: Buffer.byteLength(contentHtml),
      sourceContentSha256: "a".repeat(64),
    },
    contentHtml,
    contentDisposition: "complete",
  };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-destination-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const docsDir = path.join(root, "src", "content");
  const stateFile = path.join(root, "protected", "native-state.json");
  const destination = createAstroFilesystemDestination({
    docsDir,
    stateFile,
    siteUrl: "https://site.example/base/",
    routeBase: "published/topics",
    forumName: "The [Bridge] Forum",
    now: () => new Date("2026-09-28T17:00:00Z"),
    deploy: async () => ({ deployedAt: "2026-09-28T17:01:00Z" }),
    verify: async () => ({ publiclyVerifiedAt: "2026-09-28T17:02:00Z" }),
  });
  return { root, docsDir, stateFile, destination };
}

test("Astro filesystem destination preserves identity through publish, update, hold, and restore", async (t) => {
  const { docsDir, stateFile, destination } = await fixture(t);
  const created = await destination.synchronize({ work: work(), publication: publication() });
  assert.equal(created.synchronizedAt, "2026-09-28T17:00:00.000Z");
  assert.match(created.destinationBinding.bindingId, /^dbb_[a-f0-9]{32}$/);
  assert.match(created.destinationBinding.externalId, /^astro:page:[a-f0-9]{32}$/);
  assert.equal(created.destinationBinding.canonicalUrl, "https://site.example/base/published/topics/the-bridge-publishes-everywhere-53/");

  const stateAfterCreate = JSON.parse(await readFile(stateFile, "utf8"));
  const relativeFile = stateAfterCreate.publications[resourceId].relativeFile;
  const sourceFile = path.join(docsDir, relativeFile);
  const first = await readFile(sourceFile, "utf8");
  assert.match(first, /updatedDate: 2026-09-01T09:00:00\.000Z/);
  assert.match(first, /discussionCommentsDisplay: interactive/);
  assert.match(first, /discussionbridgeSourceRevisionSequence: 1/);
  assert.match(first, /The \\\[Bridge\\\] Forum/);
  assert.match(first, /lang-mermaid/);

  const updated = await destination.synchronize({ work: work("update", 2), publication: publication(2, "A changed title does not move identity") });
  assert.equal(updated.destinationBinding.bindingId, created.destinationBinding.bindingId);
  assert.equal(updated.destinationBinding.externalId, created.destinationBinding.externalId);
  assert.equal(updated.destinationBinding.canonicalUrl, created.destinationBinding.canonicalUrl);
  assert.match(await readFile(sourceFile, "utf8"), /discussionbridgeSourceRevisionSequence: 2/);

  await destination.synchronize({ work: work("hold", 2), publication: publication(2) });
  await assert.rejects(() => readFile(sourceFile, "utf8"), /ENOENT/);
  const held = JSON.parse(await readFile(stateFile, "utf8"));
  assert.equal(held.publications[resourceId].status, "held");

  const restored = await destination.synchronize({ work: work("restore", 2), publication: publication(2) });
  assert.equal(restored.destinationBinding.externalId, created.destinationBinding.externalId);
  assert.match(await readFile(sourceFile, "utf8"), /discussionbridgeNativePublication: true/);
  await assert.rejects(() => readFile(`${stateFile}.mutation.json`, "utf8"), /ENOENT/);
});

test("Astro filesystem destination rejects unowned targets, moved identities, and symlinks", async (t) => {
  const first = await fixture(t);
  const expected = path.join(first.docsDir, "published", "topics", "the-bridge-publishes-everywhere-53.md");
  await mkdir(path.dirname(expected), { recursive: true });
  await writeFile(expected, "---\ntitle: User content\n---\n", "utf8");
  await assert.rejects(() => first.destination.synchronize({ work: work(), publication: publication() }), /owned by different content/);

  const second = await fixture(t);
  await second.destination.synchronize({ work: work(), publication: publication() });
  const state = JSON.parse(await readFile(second.stateFile, "utf8"));
  const source = path.join(second.docsDir, state.publications[resourceId].relativeFile);
  const moved = path.join(second.docsDir, "moved.md");
  await writeFile(moved, await readFile(source, "utf8"), "utf8");
  await rm(source);
  await assert.rejects(() => second.destination.synchronize({ work: work("update", 2), publication: publication(2) }), /moved without an approved URL migration/);

  const third = await fixture(t);
  await mkdir(third.docsDir, { recursive: true });
  const target = path.join(third.root, "linked-target");
  await mkdir(target);
  await symlink(target, path.join(third.docsDir, "linked"), "junction");
  await assert.rejects(() => third.destination.synchronize({ work: work(), publication: publication() }), /symbolic link/);
});

test("Astro filesystem destination recovers a file mutation committed before protected state", async (t) => {
  const interrupted = await fixture(t);
  await interrupted.destination.synchronize({ work: work(), publication: publication() });
  const before = JSON.parse(await readFile(interrupted.stateFile, "utf8"));
  const sourceFile = path.join(interrupted.docsDir, before.publications[resourceId].relativeFile);

  const completed = await fixture(t);
  await completed.destination.synchronize({ work: work(), publication: publication() });
  await completed.destination.synchronize({ work: work("update", 2), publication: publication(2) });
  const completedState = JSON.parse(await readFile(completed.stateFile, "utf8"));
  const completedFile = path.join(completed.docsDir, completedState.publications[resourceId].relativeFile);
  const expectedOutput = await readFile(completedFile, "utf8");
  await writeFile(sourceFile, expectedOutput, "utf8");
  await writeFile(`${interrupted.stateFile}.mutation.json`, `${JSON.stringify({
    schemaVersion: 1,
    resourceId,
    workId: work("update", 2).workId,
    action: "update",
    relativeFile: before.publications[resourceId].relativeFile,
    expectedContentSha256: createHash("sha256").update(expectedOutput).digest("hex"),
    nextState: completedState.publications[resourceId],
  }, null, 2)}\n`, "utf8");

  const recovered = await interrupted.destination.synchronize({ work: work("update", 2), publication: publication(2) });
  assert.equal(recovered.destinationBinding.publicationRevision, completedState.publications[resourceId].publicationRevision);
  assert.equal(JSON.parse(await readFile(interrupted.stateFile, "utf8")).publications[resourceId].sourceRevisionSequence, 2);
  await assert.rejects(() => readFile(`${interrupted.stateFile}.mutation.json`, "utf8"), /ENOENT/);
});

test("Astro filesystem destination rejects impossible actions and source revision regression", async (t) => {
  const { destination } = await fixture(t);
  await assert.rejects(() => destination.synchronize({ work: work("update"), publication: publication() }), /requires an existing/);
  await destination.synchronize({ work: work(), publication: publication() });
  await destination.synchronize({ work: work("update", 2), publication: publication(2) });
  await assert.rejects(() => destination.synchronize({ work: work("update", 1), publication: publication(1) }), /revision regressed/);
  await assert.rejects(() => destination.synchronize({ work: work("restore", 2), publication: publication(2) }), /invalid from published/);
});
