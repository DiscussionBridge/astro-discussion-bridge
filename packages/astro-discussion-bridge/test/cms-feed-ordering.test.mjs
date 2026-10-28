import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pollCmsSources } from "../dist/cms-coordinator.js";
import { connection, connectionId } from "./fixtures/cms-coordinator.mjs";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";

const uuid = index => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const event = (index, sequence, sourceId = "source-a") => ({
  event_type: "publication", event_id: uuid(index), event_sequence: sequence,
  source: { source_id: sourceId, source_revision: `revision-${sequence}`, topic_id: "53",
    topic_url: "https://forum.example/t/source/53", title: `Source ${sourceId}`,
    content_sha256: createHash("sha256").update("x").digest("hex"), content_bytes: 1,
    source_created_at: null, source_updated_at: null, source_authors: [] },
});
const feed = (stream, items, checkpoint, next = null) => ({ stream, items, next_cursor: next, checkpoint_cursor: checkpoint });

async function fixture(t) {
  const root = await ownedTempFixture(t, "discussionbridge-astro-feed-ordering-");
  const pending = [];
  const options = { docsDir: path.join(root, "content"), stateFile: path.join(root, "private", "state.json"),
    siteUrl: "https://astro.example", serverUrl: "https://forum.example", connectionId, connectionSecret: "s".repeat(32),
    fetchImplementation: async address => {
      const url = new URL(address);
      assert.equal(url.origin, "https://forum.example");
      if (url.pathname.endsWith("connection.json")) return Response.json(connection);
      assert.equal(url.pathname, "/discussion-bridge/v4/sources.json");
      assert.ok(pending.length, "unexpected source request");
      const { value, cursor } = pending.shift();
      assert.equal(url.searchParams.get("stream"), value.stream);
      assert.equal(url.searchParams.get("cursor"), cursor);
      return Response.json(value);
    } };
  return {
    async poll(value, cursor = null) { pending.push({ value, cursor }); return pollCmsSources(options); },
    raw: () => readFile(options.stateFile, "utf8"),
    state: async () => JSON.parse(await readFile(options.stateFile, "utf8")),
  };
}

test("actual Astro intake persists descending initial sequences then increasing change pages across reloads", async t => {
  const f = await fixture(t);
  await f.poll(feed("initial", [event(1, "20", "source-a")], null, "initial_2"));
  assert.equal((await f.state()).checkpoint, null);
  await f.poll(feed("initial", [event(2, "10", "source-b")], "cp_initial"), "initial_2");
  assert.equal((await f.state()).stream, "changes");
  await f.poll(feed("changes", [event(3, "21"), event(4, "22", "source-b")], "cp_22", "changes_2"), "cp_initial");
  const staged = await f.state();
  assert.equal(staged.cursor, "changes_2");
  assert.equal(staged.checkpoint, "cp_22");
  assert.equal(Object.keys(staged.events).length, 4);
  await f.poll(feed("changes", [event(5, "23")], "cp_23"), "changes_2");
  const final = await f.state();
  assert.equal(final.checkpoint, "cp_23");
  assert.equal(final.sources["source-a"].event_sequence, "23");
  assert.equal(final.sources["source-b"].event_sequence, "22");
});

for (const [name, secondSequence] of [["equal", "12"], ["descending", "11"]]) {
  test(`actual Astro ${name} second change event leaves durable page/checkpoint unchanged and permits restart`, async t => {
    const f = await fixture(t);
    await f.poll(feed("initial", [event(1, "10")], "cp_10"));
    const before = await f.raw();
    await assert.rejects(f.poll(feed("changes", [event(2, "12"), event(3, secondSequence, "source-b")], "bad_cp"), "cp_10"), /strictly increasing/);
    assert.equal(await f.raw(), before, "invalid second event must not persist the first event or checkpoint");
    await f.poll(feed("changes", [event(2, "12"), event(3, "13", "source-b")], "cp_13"), "cp_10");
    const resumed = await f.state();
    assert.equal(resumed.checkpoint, "cp_13");
    assert.equal(Object.keys(resumed.events).length, 3);
  });
}

for (const [name, sequence] of [["equal", "12"], ["descending", "11"]]) {
  test(`actual Astro ${name} unseen cross-page sequence rejects after durable reload`, async t => {
    const f = await fixture(t);
    await f.poll(feed("initial", [event(1, "10")], "cp_10"));
    await f.poll(feed("changes", [event(2, "12")], "cp_12"), "cp_10");
    const before = await f.raw();
    await assert.rejects(f.poll(feed("changes", [event(3, sequence, "source-b")], "bad_cp"), "cp_12"), /behind staged events/);
    assert.equal(await f.raw(), before);
    await f.poll(feed("changes", [event(4, "13", "source-b")], "cp_13"), "cp_12");
    assert.equal((await f.state()).sources["source-b"].event_sequence, "13");
  });
}

for (const [name, sequences] of [
  ["above Number.MAX_SAFE_INTEGER", ["9007199254740992", "9007199254740993", "9007199254740994"]],
  ["near signed64 maximum", ["9223372036854775805", "9223372036854775806", "9223372036854775807"]],
]) {
  test(`actual Astro keeps adjacent decimal sequences exact ${name}`, async t => {
    const f = await fixture(t);
    await f.poll(feed("initial", [event(1, sequences[0])], "cp_initial"));
    await f.poll(feed("changes", [event(2, sequences[1])], "cp_second"), "cp_initial");
    await f.poll(feed("changes", [event(3, sequences[2])], "cp_third"), "cp_second");
    assert.equal((await f.state()).sources["source-a"].event_sequence, sequences[2]);
    const before = await f.raw();
    await assert.rejects(f.poll(feed("changes", [event(4, sequences[1], "source-b")], "bad_cp"), "cp_third"), /behind staged events/);
    assert.equal(await f.raw(), before);
  });
}

test("actual Astro accepts exact retained replay without replacing newer source and rejects changed replay/reused sequence", async t => {
  const f = await fixture(t), original = event(1, "10");
  await f.poll(feed("initial", [original], "cp_10"));
  await f.poll(feed("changes", [event(2, "20")], "cp_20"), "cp_10");
  const replay = structuredClone(original);
  replay.source = Object.fromEntries(Object.entries(replay.source).reverse());
  await f.poll(feed("changes", [replay], "cp_20"), "cp_20");
  assert.equal(Object.keys((await f.state()).events).length, 2);
  assert.equal((await f.state()).sources["source-a"].event_sequence, "20");
  const before = await f.raw();
  const changed = structuredClone(original); changed.source.title = "Changed retained event";
  await assert.rejects(f.poll(feed("changes", [changed], "bad_cp"), "cp_20"), /replay changed/);
  assert.equal(await f.raw(), before);
  await assert.rejects(f.poll(feed("changes", [event(3, "20", "source-b")], "bad_cp"), "cp_20"), /behind staged events/);
  assert.equal(await f.raw(), before);
});

test("actual Astro transport rejects a typed-invalid second event before staging or advancing its checkpoint", async t => {
  const f = await fixture(t);
  await f.poll(feed("initial", [event(1, "10")], "cp_10"));
  const before = await f.raw();
  const invalid = event(3, "13", "source-b"); invalid.source.content_bytes = 1.5;
  await assert.rejects(f.poll(feed("changes", [event(2, "12"), invalid], "bad_cp"), "cp_10"), /transport or typed response requires attention/);
  assert.equal(await f.raw(), before);
  await f.poll(feed("changes", [event(2, "12"), event(3, "13", "source-b")], "cp_13"), "cp_10");
  assert.equal((await f.state()).checkpoint, "cp_13");
});
