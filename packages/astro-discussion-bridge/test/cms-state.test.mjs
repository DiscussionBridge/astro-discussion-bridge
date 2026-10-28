import assert from "node:assert/strict";
import { readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { CmsClient } from "../dist/cms-client.js";
import { emptyCmsState, readCmsState, stageCmsClaim, stageCmsFeedPage, withCmsStateLock, writeCmsState } from "../dist/cms-state.js";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";

const uuid = index => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const connectionId = "dbc_0123456789abcdef01234567";
const client = new CmsClient({ serverUrl: "https://forum.example", connectionId, connectionSecret: "s".repeat(32), fetchImplementation: async () => { throw new Error("No network in journal tests."); } });
const empty = () => emptyCmsState(client, "https://astro.example", connectionId);
const source = id => ({ source_id: `topic:${id}`, source_revision: "revision-1", topic_id: String(id), topic_url: `https://forum.example/t/source/${id}`, title: "Source", content_sha256: "a".repeat(64), content_bytes: 20, source_created_at: null, source_updated_at: null, source_authors: [] });
const event = (index, sourceId = 53) => ({ event_type: "publication", event_id: uuid(index), event_sequence: String(index), source: source(sourceId) });
const lease = (generation, workId = 1) => ({ work: { work_id: uuid(workId), mapping_id: uuid(200), source_id: "topic:53", source_revision: "revision-1", policy_revision: "policy-1", action: "publish_revision", state: "leased", attempt_cycle: uuid(201), attempt: 1, lease_generation: generation, retry_at: null, last_failure_code: null }, lease_token: Buffer.alloc(32, generation).toString("base64url"), lease_generation: generation, expires_at: "2026-10-14T10:05:00.000Z", server_time: "2026-10-14T10:00:00.000Z" });

test("durable native source pages resume initial continuation then changes without losing staged entries", async t => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-cms-journal-");
  const file = path.join(root, "native-state.json");
  const state = await readCmsState(file, empty());
  stageCmsFeedPage(state, { stream: "initial", items: [event(20, 53)], next_cursor: "bmV4dA", checkpoint_cursor: null });
  assert.equal(state.checkpoint, null);
  assert.equal(state.stream, "initial");
  await writeCmsState(file, state);
  const resumed = await readCmsState(file, empty());
  assert.equal(resumed.cursor, "bmV4dA");
  stageCmsFeedPage(resumed, { stream: "initial", items: [event(10, 54)], next_cursor: null, checkpoint_cursor: "Y2hlY2twb2ludA" });
  await writeCmsState(file, resumed);
  const changes = await readCmsState(file, empty());
  assert.equal(changes.stream, "changes");
  assert.equal(Object.keys(changes.sources).length, 2);
  const revision = event(21, 53); revision.source.source_revision = "revision-2";
  stageCmsFeedPage(changes, { stream: "changes", items: [revision], next_cursor: "Y29udGludWU", checkpoint_cursor: "MjE" });
  assert.equal(changes.sources["topic:53"].source.source_revision, "revision-2");
  await writeCmsState(file, changes);
  const continuing = await readCmsState(file, empty());
  stageCmsFeedPage(continuing, { stream: "changes", items: [{ event_type: "revocation", event_id: uuid(22), event_sequence: "22", source_id: "topic:53", last_source_revision: "revision-2", reason: "source_ineligible" }], next_cursor: null, checkpoint_cursor: "MjI" });
  assert.equal(continuing.sources["topic:53"].event_type, "revocation");
  assert.equal(continuing.sources["topic:54"].event_type, "publication", "absence from a page does not withdraw another source");
});

test("event replay is harmless, typed semantic identity tolerates key order, and change sequence drift rejects", () => {
  const state = empty();
  stageCmsFeedPage(state, { stream: "initial", items: [event(10)], next_cursor: null, checkpoint_cursor: "MTA" });
  const replay = event(10); replay.source = Object.fromEntries(Object.entries(replay.source).reverse());
  stageCmsFeedPage(state, { stream: "changes", items: [replay], next_cursor: null, checkpoint_cursor: "MTA" });
  assert.equal(Object.keys(state.events).length, 1);
  const drift = event(10); drift.source.title = "Changed same event";
  assert.throws(() => stageCmsFeedPage(state, { stream: "changes", items: [drift], next_cursor: null, checkpoint_cursor: "MTA" }), /replay changed/);
  assert.throws(() => stageCmsFeedPage(state, { stream: "changes", items: [event(9, 54)], next_cursor: null, checkpoint_cursor: "OQ" }), /behind staged events/);
  assert.throws(() => stageCmsFeedPage(state, { stream: "changes", items: [event(12), event(11)], next_cursor: null, checkpoint_cursor: "MTE" }), /strictly increasing/);
  assert.equal(Object.keys(state.events).length, 1, "a rejected page stages no partial event or checkpoint");
  assert.equal(state.checkpoint, "MTA");
});

test("durable mapping generation fences an old worker across new work and same-work retry", async t => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-cms-fence-");
  const file = path.join(root, "state.json");
  const state = empty();
  const first = stageCmsClaim(state, lease(1));
  first.stage = "staged";
  const transactionId = first.transactionId;
  assert.equal(stageCmsClaim(state, lease(2)).transactionId, transactionId, "same desired work retains prepared transaction identity");
  assert.throws(() => stageCmsClaim(state, lease(1)), /generation is stale/);
  stageCmsClaim(state, lease(3, 2));
  await writeCmsState(file, state);
  const resumed = await readCmsState(file, empty());
  assert.equal(resumed.generations[uuid(200)], 3);
  assert.throws(() => stageCmsClaim(resumed, lease(2)), /generation is stale/);
  assert.throws(() => stageCmsClaim(resumed, lease(3, 3)), /cannot be reassigned/);
});

test("native journal scope/link protection and overlapping state writers fail closed", async t => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-cms-state-lock-");
  const file = path.join(root, "state.json");
  const state = empty();
  await writeCmsState(file, state);
  await assert.rejects(readCmsState(file, { ...empty(), destinationOrigin: "https://other.example" }), /scope requires reconciliation/);
  let release;
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  const first = withCmsStateLock(file, async () => { entered(); await hold; });
  await ready;
  try { await assert.rejects(withCmsStateLock(file, async () => assert.fail("Second writer entered")), /already in use/); }
  finally { release(); await first; }
  const link = path.join(root, "linked.json");
  try { await symlink(file, link); }
  catch (error) { if (error.code === "EPERM" || error.code === "EACCES") return; throw error; }
  await assert.rejects(readCmsState(link, empty()), /unlinked regular file/);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), JSON.parse(JSON.stringify(state)));
});
