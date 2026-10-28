import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { nativeSource, toFixture } from "./fixtures/cms-to.mjs";
import { buildToConsumer } from "./fixtures/native-to-consumer.mjs";

test("native V4 first and continuing Astro builds use the one publisher before collection loading", async t => {
  const state = await toFixture(t, nativeSource(), "53");
  const first = await buildToConsumer(state), initial = structuredClone(state.state.record), originalBody = state.received[0].bridge_record;
  assert.match(first, /Native body\./); assert.match(first, /data-discussionbridge-mode="interactive"/); assert.match(first, /Consumer owns navigation/);
  assert.match(first, new RegExp(initial.resource_id)); assert.doesNotMatch(first, /connectionSecret|lease_token|synthetic-secret|\.tools/);
  const source = await readFile(state.file, "utf8"); await writeFile(state.file, source.replace("Native title", "New native title").replace("Native body.", "Continuing source content."));
  const updated = await buildToConsumer(state), current = state.state.record;
  assert.match(updated, /Continuing source content/); assert.match(updated, /New native title/); assert.match(updated, /Consumer owns footer/);
  for (const key of ["resource_id", "topic_id", "external_id", "canonical_url"]) assert.equal(current[key], initial[key]);
  assert.equal(state.received[1].bridge_record.expected_source_revision, originalBody.source_revision); assert.notEqual(current.source_revision, initial.source_revision);
  assert.equal(state.state.creations, 1); assert.match(await readFile(state.file, "utf8"), /consumerField: retained/);
});
