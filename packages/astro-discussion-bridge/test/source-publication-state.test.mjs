import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  advanceSourceInventoryCheckpoint,
  advanceSourceRevocationCheckpoint,
  persistSourceTopicDetail,
  readSourcePublicationState,
  synchronizeInitialSourceSnapshot,
  writeSourcePublicationState,
} from "../dist/source-publication-state.js";
import { readFile as readContractFixture } from "node:fs/promises";

const contractFixture = async (name) => JSON.parse(await readContractFixture(
  new URL(`../node_modules/discussionbridge-adapter-contract/fixtures/${name}`, import.meta.url),
  "utf8",
));

function detail(overrides = {}) {
  return {
    resourceId: "a4965d46-e657-4af4-af47-6439e544eeb9",
    topicId: 8,
    topicUrl: "https://forum.example/t/forum-originated-roadmap/8",
    title: "Forum-Originated Roadmap",
    sourceRevision: "post:12:version:4",
    sourceRevisionSequence: 4,
    sourceCreatedAt: "2026-09-01T16:00:00Z",
    sourceUpdatedAt: "2026-09-27T18:30:00Z",
    sourceAuthors: [{ name: "Editor" }],
    categories: [{ id: 2, name: "Roadmap" }],
    tags: [{ id: 9, name: "release" }],
    presentationMode: "interactive",
    contentDisposition: "complete",
    networkProvenance: null,
    contentHtml: "<p>This discussion started in Discourse.</p>",
    sanitizedContentHtml: "<p>This discussion started in Discourse.</p>",
    sourceContentBytes: 44,
    sourceContentSha256: "6a53e7c575a7b194305b793db9d549e43effbc443e3a9106629b2305884c63e6",
    ...overrides,
  };
}

test("source state persists source metadata separately from synchronization time", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-source-state-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "state.json");
  const state = await readSourcePublicationState(file);
  const synchronizedAt = new Date("2026-09-28T12:00:00Z");
  const persisted = persistSourceTopicDetail(state, detail(), synchronizedAt);
  assert.equal(persisted.sourceUpdatedAt, "2026-09-27T18:30:00Z");
  assert.equal(persisted.synchronizedAt, "2026-09-28T12:00:00.000Z");
  advanceSourceInventoryCheckpoint(state, {
    snapshot: "dbs_snapshot_001",
    policyRevision: "policy:2026-09-27:1",
    items: [],
    nextCursor: "cursor-2",
    complete: false,
  }, synchronizedAt);
  await writeSourcePublicationState(file, state);
  const reloaded = await readSourcePublicationState(file);
  assert.deepEqual(reloaded, state);
  const raw = await readFile(file, "utf8");
  assert.match(raw, /"sourceUpdatedAt": "2026-09-27T18:30:00Z"/);
  assert.match(raw, /"synchronizedAt": "2026-09-28T12:00:00.000Z"/);
});

test("source state rejects revision conflicts, regressions, and mixed incomplete snapshots", async () => {
  const state = await readSourcePublicationState("Z:/path-that-does-not-exist/source-state.json");
  persistSourceTopicDetail(state, detail());
  assert.throws(() => persistSourceTopicDetail(state, detail({
    sourceContentSha256: "0".repeat(64),
  })), /conflicts/);
  assert.throws(() => persistSourceTopicDetail(state, detail({
    sourceRevision: "post:12:version:3",
    sourceRevisionSequence: 3,
  })), /regressed/);
  advanceSourceInventoryCheckpoint(state, {
    snapshot: "dbs_snapshot_001",
    policyRevision: "policy:1",
    items: [],
    nextCursor: "cursor-2",
    complete: false,
  });
  assert.throws(() => advanceSourceInventoryCheckpoint(state, {
    snapshot: "dbs_snapshot_002",
    policyRevision: "policy:1",
    items: [],
    nextCursor: null,
    complete: true,
  }), /cannot mix/);
});

test("revocation checkpoint persists deduplicated identities and rejects conflicting replay", async () => {
  const state = await readSourcePublicationState("Z:/path-that-does-not-exist/revocation-state.json");
  const item = {
    revocationId: "dbr_11111111111111111111111111111111",
    resourceId: "a4965d46-e657-4af4-af47-6439e544eeb9",
    sourceRevision: "post:12:version:5",
    sourceRevisionSequence: 5,
    reason: "source_unpublished",
    effectiveAt: "2026-09-28T18:00:00Z",
    restorable: true,
  };
  const page = {
    highWater: "dbrh_001",
    policyRevision: "policy:1",
    items: [item],
    nextCursor: null,
    complete: true,
  };
  const at = new Date("2026-09-28T19:00:00Z");
  advanceSourceRevocationCheckpoint(state, page, at);
  advanceSourceRevocationCheckpoint(state, page, at);
  assert.equal(Object.keys(state.revocations).length, 1);
  assert.equal(state.revocations[item.revocationId].effectiveAt, item.effectiveAt);
  assert.throws(() => advanceSourceRevocationCheckpoint(state, {
    ...page,
    items: [{ ...item, reason: "source_deleted" }],
  }, at), /conflicts/);
});

test("initial snapshot persists exact pages once and becomes inert after completion", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-initial-snapshot-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "source-state.json");
  const capabilityBase = await contractFixture("connection-capability.json");
  const inventoryBase = await contractFixture("source-inventory-page.json");
  const detailBase = await contractFixture("source-detail-inline.json");
  let requests = 0;
  const fetchImplementation = async (url, init) => {
    requests++;
    const parsed = new URL(url);
    const correlationId = init.headers["X-DiscussionBridge-Correlation"];
    const respond = (payload) => new Response(JSON.stringify({ ...payload, correlation_id: correlationId }), {
      status: 200,
      headers: { "content-type": "application/json", "X-DiscussionBridge-Correlation": correlationId },
    });
    if (parsed.pathname.endsWith("/connection.json")) return respond({
      ...structuredClone(capabilityBase),
      destination_policies: capabilityBase.destination_policies.map((policy) => ({ ...policy, profile: "astro" })),
    });
    if (parsed.pathname.endsWith("/source-topics.json")) return respond(inventoryBase);
    return respond(detailBase);
  };
  const credentials = {
    discourseUrl: "https://forum.example/",
    connectionId: capabilityBase.connection_id,
    connectionSecret: "s".repeat(40),
    fetchImplementation,
  };
  const first = await synchronizeInitialSourceSnapshot(credentials, file, {
    now: () => new Date("2026-09-28T12:00:00Z"),
  });
  assert.deepEqual(first, { pages: 1, resources: 1, resumed: false });
  const afterFirst = requests;
  const second = await synchronizeInitialSourceSnapshot(credentials, file);
  assert.deepEqual(second, { pages: 0, resources: 1, resumed: false });
  assert.equal(requests, afterFirst);
  assert.equal((await readSourcePublicationState(file)).inventory.complete, true);
});
