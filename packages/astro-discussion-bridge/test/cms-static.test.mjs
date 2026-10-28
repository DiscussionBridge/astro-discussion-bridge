import assert from "node:assert/strict";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";
import { claimCmsNativeWork, cmsNativeReservation, pollCmsSources, reserveCmsSource } from "../dist/cms-coordinator.js";
import { prepareCmsNativeWork } from "../dist/cms-static.js";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";
import { connection, connectionId, event, html, lease, mapping, source } from "./fixtures/cms-coordinator.mjs";
import { staticFixture } from "./fixtures/cms-static.mjs";
import { renewCmsNativeBuild, stageCmsNativePublications } from "../dist/cms-pipeline.js";

const metadata = source => parseYaml(/^---\n([\s\S]*?)\n---\n/u.exec(source)[1]);
test("actual unsupported media remains a durable local limitation with complete source and no fabricated receiver failure", async t => {
  const complete = '<p>Retained native source.</p><video controls src="https://media.example/native.mp4">Underlying fallback</video>';
  const state = await staticFixture(t, {}, complete);
  await assert.rejects(state.prepare(), /media preservation/);
  const held = JSON.parse(await readFile(state.options.stateFile, "utf8")).transactions[state.claimed.workId];
  assert.equal(held.stage, "claimed"); assert.equal(held.localLimitation.content, complete); assert.deepEqual(held.localLimitation.source, state.sourceRecord);
  assert.equal(held.failureBody, undefined); assert.equal(held.plan, undefined); assert.equal(held.publiclyVerifiedAt, undefined);
  assert.equal(state.prepared.length, 0); assert.equal(state.failures.length, 0);
  await assert.rejects(readFile(cmsNativeReservation(state.options, state.sourceRecord).file), { code: "ENOENT" });
  await assert.rejects(state.prepare(), /media preservation/);
  const continuing = await stageCmsNativePublications(state.options); assert.equal(continuing.localLimitations[0].workId, state.claimed.workId); assert.deepEqual(continuing.prepared, []);
  await assert.rejects(claimCmsNativeWork(state.options), /local media limitation/); await renewCmsNativeBuild(state.options);
  assert.equal(state.contentCalls, 1); assert.equal(state.failures.length, 0); assert.equal(state.prepared.length, 0);
  const journal = JSON.parse(await readFile(state.options.stateFile, "utf8")), currentMapping = Object.values(journal.mappings)[0];
  journal.mappings["other-native-source"] = { ...currentMapping, mapping_id: "12345678-1234-4234-8234-123456789088", source_id: "other-native-source", resource_id: "12345678-1234-4234-8234-123456789089", external_id: "other-native-source", canonical_url: "https://astro.example/other/" };
  await writeFile(state.options.stateFile, JSON.stringify(journal));
  const claims = [];
  const isolated = await stageCmsNativePublications({ ...state.options, fetchImplementation: async (url, init) => {
    if (new URL(url).pathname.endsWith("claim.json")) { claims.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
    return state.options.fetchImplementation(url, init);
  } });
  assert.equal(isolated.localLimitations.length, 1); assert.equal(claims.length, 1); assert.equal(claims[0].mapping_id, journal.mappings["other-native-source"].mapping_id);
  state.queuePublication("<p>Source changed while held; new receiver work still needs reconciliation.</p>");
  await stageCmsNativePublications({ ...state.options, fetchImplementation: async (url, init) => new URL(url).pathname.endsWith("claim.json") ? new Response(null, { status: 204 }) : state.options.fetchImplementation(url, init) });
  const refreshed = JSON.parse(await readFile(state.options.stateFile, "utf8"));
  assert.equal(refreshed.sources[state.sourceRecord.source_id].source.source_revision, state.sourceRecord.source_revision);
  assert.equal(refreshed.transactions[state.claimed.workId].localLimitation.content, complete, "original cause/complete source remains bound; new source feed is not hidden");
});
async function fixture(t, modifications = {}) {
  const root = await ownedTempFixture(t, "discussionbridge-astro-cms-static-");
  let nativeMapping;
  let nativeWork = structuredClone(lease.work);
  const sourceRecord = { ...source, ...modifications };
  const prepared = [];
  let contentCalls = 0;
  let uncertain = false;
  let queryMismatch = false;
  const expires = new Date(Date.now() + 300000).toISOString();
  const leaseValue = () => ({ ...lease, work: nativeWork, server_time: new Date().toISOString(), expires_at: expires });
  const options = { docsDir: path.join(root, "content"), stateFile: path.join(root, ".discussionbridge/state.json"),
    siteUrl: "https://astro.example", serverUrl: "https://forum.example", connectionId, connectionSecret: "s".repeat(32),
    fetchImplementation: async (url, init) => {
      const endpoint = new URL(url);
      const query = () => ({ work: queryMismatch ? { ...nativeWork, source_revision: "wrong-current-revision" } : nativeWork, mapping: nativeMapping, lease_expires_at: expires });
      if (endpoint.pathname.endsWith("connection.json")) return Response.json(connection);
      if (endpoint.pathname.endsWith("sources.json")) return Response.json({ stream: "initial", items: [{ ...event, source: sourceRecord }], next_cursor: null, checkpoint_cursor: "Y2hlY2s" });
      if (endpoint.pathname.endsWith("mappings/prepare.json")) { nativeMapping = mapping(JSON.parse(init.body)); return Response.json(nativeMapping, { status: 201 }); }
      if (endpoint.pathname.endsWith("claim.json") || endpoint.pathname.endsWith("renew.json")) return Response.json(leaseValue());
      if (endpoint.pathname.includes("/sources/") && endpoint.pathname.endsWith("content.json")) {
        contentCalls++;
        return Response.json({ source_id: sourceRecord.source_id, source_revision: sourceRecord.source_revision, content_sha256: sourceRecord.content_sha256, content_bytes: sourceRecord.content_bytes, offset: 0, next_offset: null, content_base64: Buffer.from(html).toString("base64") });
      }
      if (endpoint.pathname.endsWith("/prepare.json")) {
        const body = JSON.parse(init.body); prepared.push(body);
        nativeWork = { ...nativeWork, state: "synchronized" };
        nativeMapping = { ...nativeMapping, destination_native_id: body.native_result.native_id, destination_native_revision: body.native_result.native_revision, synchronized_source_revision: sourceRecord.source_revision, synchronized_at: body.prepared_at };
        if (uncertain) { uncertain = false; throw new Error("Receipt response lost after receiver commit"); }
        return Response.json(query());
      }
      assert.equal(endpoint.pathname, `/discussion-bridge/v4/work/${lease.work.work_id}.json`);
      return Response.json(query());
    },
  };
  await pollCmsSources(options);
  await reserveCmsSource(options, sourceRecord.source_id);
  const claimed = await claimCmsNativeWork(options);
  return { options, claimed, prepared, sourceRecord, get contentCalls() { return contentCalls; }, loseNextPrepare() { uncertain = true; }, mismatchQuery() { queryMismatch = true; } };
}

test("CMS native stage writes complete owned source with feedback guards, then prepares synchronized only", async t => {
  const state = await fixture(t);
  const result = await prepareCmsNativeWork(state.options, state.claimed.workId);
  assert.equal(result.stage, "prepared");
  const file = cmsNativeReservation(state.options, source).file;
  const contents = await readFile(file, "utf8");
  const fields = metadata(contents);
  assert.match(contents, /Complete native source/);
  assert.equal(fields.discussionSync, false);
  assert.equal(fields.discussionCommentsDisplay, "full");
  assert.equal(fields.discourseTopicId, "53");
  assert.equal(fields.discussionbridgeSourceCreatedAt, source.source_created_at);
  assert.equal(fields.discussionbridgeSourceUpdatedAt, source.source_updated_at);
  assert.equal(fields.discussionbridgeCmsOwnership.source_revision, source.source_revision);
  assert.equal(fields.discussionbridgeCmsOwnership.last_lease_generation, 1);
  assert.equal(fields.discussionbridgeCmsOwnership.schema_version, "db-native-ownership-1");
  assert.doesNotMatch(contents, new RegExp(lease.lease_token));
  assert.doesNotMatch(contents, /ssssssssssssssssssssssssssssssss/);
  const journal = JSON.parse(await readFile(state.options.stateFile, "utf8"));
  assert.equal(journal.transactions[result.workId].stage, "prepared");
  assert.equal(journal.transactions[result.workId].publiclyVerifiedAt, undefined);
  assert.equal(state.prepared.length, 1);
  assert.equal(state.prepared[0].native_result.representation.source_content_sha256, source.content_sha256);
  assert.notEqual(state.prepared[0].native_result.native_revision, source.content_sha256, "native revision is not copied source SHA");
  assert.equal(state.contentCalls, 1);
});

test("uncertain static prepare replays the same transaction/receipt without rewriting or refetching native content", async t => {
  const state = await fixture(t);
  state.loseNextPrepare();
  await assert.rejects(prepareCmsNativeWork(state.options, state.claimed.workId));
  const file = cmsNativeReservation(state.options, source).file;
  const before = await readFile(file, "utf8");
  const allocation = await stat(file, { bigint: true });
  const resumed = await prepareCmsNativeWork(state.options, state.claimed.workId);
  assert.equal(resumed.stage, "prepared");
  assert.deepEqual(state.prepared[1], state.prepared[0]);
  assert.equal(await readFile(file, "utf8"), before);
  assert.equal((await stat(file, { bigint: true })).ino, allocation.ino);
  assert.equal(state.contentCalls, 1);
});

test("changed current source authority refuses native mutation and does not prepare", async t => {
  const state = await fixture(t);
  state.mismatchQuery();
  await assert.rejects(prepareCmsNativeWork(state.options, state.claimed.workId), /authority changed/);
  assert.deepEqual(await readdir(state.options.docsDir), []);
  assert.equal(state.prepared.length, 0);
});

test("actual local edits of an uncertain staged native object are preserved and require reconciliation", async t => {
  const state = await fixture(t);
  state.loseNextPrepare();
  await assert.rejects(prepareCmsNativeWork(state.options, state.claimed.workId));
  const file = cmsNativeReservation(state.options, source).file;
  const edited = (await readFile(file, "utf8")).replace("Complete native source.", "Native operator edit.");
  await writeFile(file, edited);
  await assert.rejects(prepareCmsNativeWork(state.options, state.claimed.workId), /target changed/);
  assert.equal(await readFile(file, "utf8"), edited);
  assert.equal(state.prepared.length, 1);
});

test("CMS stage preserves unknown actual dates and decimal Core IDs without Number coercion", async t => {
  const largeId = "9007199254740993";
  const state = await fixture(t, { topic_id: largeId, topic_url: `https://forum.example/t/source/${largeId}`, source_created_at: null, source_updated_at: null });
  await prepareCmsNativeWork(state.options, state.claimed.workId);
  const contents = await readFile(cmsNativeReservation(state.options, source).file, "utf8");
  const fields = metadata(contents);
  assert.equal(fields.discourseTopicId, largeId);
  assert.equal(fields.discussionbridgeSourceCreatedAt, null);
  assert.equal(fields.discussionbridgeSourceUpdatedAt, null);
  assert.equal(fields.date, undefined);
  assert.match(contents, /Source update date unknown/);
});
