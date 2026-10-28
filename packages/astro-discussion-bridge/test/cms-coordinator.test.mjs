import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { claimCmsNativeWork, cmsNativeReservation, pollCmsSources, reserveCmsSource } from "../dist/cms-coordinator.js";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";
import { connection, connectionId, event, lease, mapping, source } from "./fixtures/cms-coordinator.mjs";

async function fixture(t, fetchImplementation) {
  const root = await ownedTempFixture(t, "discussionbridge-astro-cms-coordinator-");
  return { docsDir: path.join(root, "content"), stateFile: path.join(root, ".discussionbridge/state.json"), siteUrl: "https://astro.example", serverUrl: "https://forum.example", connectionId, connectionSecret: "s".repeat(32), fetchImplementation };
}
const journal = options => readFile(options.stateFile, "utf8").then(JSON.parse);

test("actual coordinator drains initial continuation then starts changes from its durable checkpoint", async t => {
  let feedCalls = 0;
  const options = await fixture(t, async url => {
    const endpoint = new URL(url);
    if (endpoint.pathname.endsWith("connection.json")) return Response.json(connection);
    feedCalls++;
    if (feedCalls === 1) {
      assert.equal(endpoint.search, "?stream=initial");
      return Response.json({ stream: "initial", items: [event], next_cursor: "bmV4dA", checkpoint_cursor: null });
    }
    if (feedCalls === 2) {
      assert.equal(endpoint.searchParams.get("stream"), "initial"); assert.equal(endpoint.searchParams.get("cursor"), "bmV4dA");
      return Response.json({ stream: "initial", items: [], next_cursor: null, checkpoint_cursor: "Y2hlY2twb2ludA" });
    }
    assert.equal(endpoint.searchParams.get("stream"), "changes"); assert.equal(endpoint.searchParams.get("cursor"), "Y2hlY2twb2ludA");
    return Response.json({ stream: "changes", items: [], next_cursor: null, checkpoint_cursor: "YWR2YW5jZWQ" });
  });
  assert.equal((await pollCmsSources(options)).checkpoint, null);
  assert.equal((await journal(options)).sources[source.source_id].source.source_revision, source.source_revision);
  assert.equal((await pollCmsSources(options)).stream, "changes");
  assert.equal((await pollCmsSources(options)).checkpoint, "YWR2YW5jZWQ");
  assert.equal(Object.keys((await journal(options)).sources).length, 1);
});

test("uncertain native reservation replays the exact durable mutation and stable file identity", async t => {
  const bodies = [];
  const options = await fixture(t, async (url, init) => {
    const endpoint = new URL(url);
    if (endpoint.pathname.endsWith("connection.json")) return Response.json(connection);
    if (endpoint.pathname.endsWith("sources.json")) return Response.json({ stream: "initial", items: [event], next_cursor: null, checkpoint_cursor: "Y2hlY2s" });
    assert.equal(endpoint.pathname, "/discussion-bridge/v4/mappings/prepare.json");
    const body = JSON.parse(init.body); bodies.push(body);
    if (bodies.length === 1) throw new Error("Uncertain receiver response");
    return Response.json(mapping(body), { status: 201 });
  });
  await pollCmsSources(options);
  const initial = cmsNativeReservation(options, source);
  const renamed = cmsNativeReservation(options, { ...source, title: "Changed title" });
  assert.deepEqual(initial, renamed);
  await assert.rejects(reserveCmsSource(options, source.source_id));
  assert.equal(Object.keys((await journal(options)).reservations).length, 1);
  const accepted = await reserveCmsSource(options, source.source_id);
  assert.equal(accepted.canonical_url, initial.canonicalUrl);
  assert.deepEqual(bodies[1], bodies[0]);
  assert.equal(Object.keys((await journal(options)).reservations).length, 0);
  assert.equal((await journal(options)).mappings[source.source_id].resource_id, accepted.resource_id);
});

test("uncertain claim keeps its exact mutation until held authority is durably recorded", async t => {
  const bodies = [];
  const options = await fixture(t, async (url, init) => {
    if (new URL(url).pathname.endsWith("connection.json")) return Response.json(connection);
    assert.equal(new URL(url).pathname, "/discussion-bridge/v4/work/claim.json");
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) throw new Error("Uncertain claim response");
    return Response.json(lease);
  });
  await assert.rejects(claimCmsNativeWork(options));
  const before = (await journal(options)).pendingClaim.body;
  const result = await claimCmsNativeWork(options);
  assert.equal(result.workId, lease.work.work_id);
  assert.deepEqual(bodies[1], before);
  const state = await journal(options);
  assert.equal(state.pendingClaim, undefined);
  assert.equal(state.generations[lease.work.mapping_id], lease.lease_generation);
  assert.equal(state.transactions[result.workId].lease.lease_token, lease.lease_token);
  assert.equal(Object.hasOwn(result, "lease_token"), false);
});

test("disabled policy, wrong origin and nonempty unresolved native metadata stop before source/claim", async t => {
  for (const denied of [
    { ...connection, policy: { ...connection.policy, enabled: false } },
    { ...connection, destination_origin: "https://other.example" },
    { ...connection, policy: { ...connection.policy, author_ids: ["native-author:1"] } },
  ]) {
    let calls = 0;
    const options = await fixture(t, async url => { calls++; assert.match(url, /connection.json$/); return Response.json(denied); });
    await assert.rejects(claimCmsNativeWork(options));
    assert.equal(calls, 1);
  }
  const options = await fixture(t, async () => assert.fail("No request for unselected transport"));
});

test("native reservation preserves a preexisting unowned or legacy file without conversion or receiver request", async t => {
  let requests = 0;
  const options = await fixture(t, async url => {
    const endpoint = new URL(url);
    if (endpoint.pathname.endsWith("connection.json")) return Response.json(connection);
    if (endpoint.pathname.endsWith("sources.json")) return Response.json({ stream: "initial", items: [event], next_cursor: null, checkpoint_cursor: "Y2hlY2s" });
    requests++; assert.fail("No reservation request after native collision");
  });
  await pollCmsSources(options);
  const reservation = cmsNativeReservation(options, source);
  await mkdir(path.dirname(reservation.file));
  const unowned = "---\ntitle: Native operator page\n---\n\nKeep this content.\n";
  await writeFile(reservation.file, unowned);
  await assert.rejects(reserveCmsSource(options, source.source_id), /explicit ownership reconciliation/);
  assert.equal(await readFile(reservation.file, "utf8"), unowned);
  assert.equal(requests, 0);
});
