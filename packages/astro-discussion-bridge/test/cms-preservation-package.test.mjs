import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";
import { nativeSource, toFixture } from "./fixtures/cms-to.mjs";
import { buildToConsumer } from "./fixtures/native-to-consumer.mjs";

test("exact normal saved package retains typed rejection/restart history and builds a genuine current new snapshot", async t => {
  const archive = process.env.DISCUSSIONBRIDGE_TEST_ARCHIVE; assert.ok(archive && path.isAbsolute(archive));
  const directory = path.dirname(archive), receipt = JSON.parse(await readFile(path.join(directory, "package-receipt.json"), "utf8"));
  const digest = bytes => createHash("sha256").update(bytes).digest("hex"), archiveBytes = await readFile(archive);
  assert.equal(digest(archiveBytes), receipt.sha256); assert.equal(archiveBytes.length, receipt.bytes); assert.equal(archive, receipt.archive);
  const parent = fileURLToPath(new URL("../.tmp/", import.meta.url)); await mkdir(parent, { recursive: true });
  const root = await ownedTempFixture(t, "discussionbridge-preservation-package-", parent);
  await promisify(execFile)("tar", ["-xf", archive, "-C", root], { windowsHide: true });
  const packed = path.join(root, "package"), members = JSON.parse(await readFile(path.join(directory, "package-members.json"), "utf8"));
  assert.equal(members.members.length, receipt.memberCount);
  for (const member of members.members) { const actual = await readFile(path.join(packed, member.path)); assert.equal(actual.length, member.size); assert.equal(digest(actual), member.sha256); }
  const paths = members.members.map(member => member.path);
  assert.equal(paths.filter(name => name.endsWith("cms-schema.json")).length, 1); assert.equal(paths.filter(name => name.endsWith("cms-runtime.mjs")).length, 1);
  assert.equal(paths.some(name => /(?:^|\/)(?:test|fixtures|\.tools|\.tmp|\.artifacts|\.git|\.discussionbridge|node_modules)(?:\/|$)/u.test(name)), false);
  const artifacts = JSON.parse(await readFile(path.join(packed, "src/private/ARTIFACTS.json"), "utf8"));
  assert.equal(artifacts.candidate_id, "discussionbridge-v4-core-20261029-r7");
  for (const pin of artifacts.members.filter(member => ["src/cms-schema.json", "src/cms-runtime.mjs", "CANDIDATE.json", "ROUTES.md"].includes(member.path))) { const actual = await readFile(path.join(packed, "src/private", path.basename(pin.path))); assert.equal(actual.length, pin.bytes); assert.equal(digest(actual), pin.sha256); }
  const candidate = JSON.parse(await readFile(path.join(packed, "src/private/CANDIDATE.json"), "utf8")), schema = JSON.parse(await readFile(path.join(packed, "src/private/cms-schema.json"), "utf8"));
  const runtime = await import(pathToFileURL(path.join(packed, "src/private/cms-runtime.mjs")).href);
  assert.equal(candidate.candidate_id, artifacts.candidate_id); assert.equal(schema.candidate_id, artifacts.candidate_id); assert.equal(runtime.candidateId, artifacts.candidate_id);
  assert.deepEqual(candidate.normative, artifacts.normative); assert.deepEqual(runtime.specIdentity, artifacts.normative); assert.equal(receipt.candidateId, artifacts.candidate_id);
  const state = await toFixture(t, nativeSource("Original current source."), "53"), originalFetch = state.options.controlledCreation.fetchImplementation, requests = [];
  let reject = true;
  state.options.controlledCreation.fetchImplementation = async (url, init) => {
    if (new URL(url).pathname.endsWith("/resolve.json")) {
      requests.push(init.body);
      if (reject) return Response.json({ outcome: "rejected", code: "content_preservation_unavailable", retryable: false, retry_after_seconds: null, correlation_id: null, core_fallback: false }, { status: 422 });
    }
    return originalFetch(url, init);
  };
  const api = await import(pathToFileURL(path.join(packed, "dist/controlled-creation.js")).href);
  await assert.rejects(api.publishControlledDiscussions(state.options), error => error.code === "content_preservation_unavailable" && error.httpStatus === 422 && error.retryable === false);
  const first = Object.values((await state.journal()).operations)[0], rejectedRequest = structuredClone(first.to.pending);
  assert.equal(rejectedRequest.rejection.validatedResponse.candidateId, artifacts.candidate_id);
  assert.equal(rejectedRequest.rejection.validatedResponse.schemaSha256, artifacts.members.find(member => member.path === "src/cms-schema.json").sha256);
  await assert.rejects(buildToConsumer(state, packed), error => error.code === "content_preservation_unavailable");
  assert.equal(requests.length, 1); assert.deepEqual(Object.values((await state.journal()).operations)[0].to.pending, rejectedRequest);
  await writeFile(state.file, (await readFile(state.file, "utf8")).replace("Original current source.", "Genuinely changed packaged native source.")); reject = false;
  const html = await buildToConsumer(state, packed); assert.match(html, /Genuinely changed packaged native source/);
  assert.equal(requests.length, 2); assert.equal(state.state.creations, 1); assert.doesNotMatch(html, /synthetic-secret|content_preservation_unavailable|requestSha256/);
  const final = Object.values((await state.journal()).operations)[0];
  assert.deepEqual(final.to.rejectedRequests[rejectedRequest.body.mutation_id], rejectedRequest); assert.equal(final.to.pending, undefined);
  assert.equal(state.received[0].bridge_record.expected_source_revision, null); assert.notEqual(state.received[0].mutation_id, rejectedRequest.body.mutation_id);
  assert.equal(digest(await readFile(archive)), receipt.sha256);
  await writeFile(path.join(directory, "consumer-preservation.html"), html, { flag: "wx" });
  await writeFile(path.join(directory, "consumer-preservation-results.json"), JSON.stringify({ format: 1, archive, archiveBytes: receipt.bytes, archiveSha256: receipt.sha256, memberCount: receipt.memberCount, memberHashesMatched: true, portablePairMatched: true, privateMaterialExcluded: true,
    checkedAt: new Date().toISOString(), candidateId: artifacts.candidate_id, knownRejection: { routeId: "V4-02", status: 422, code: rejectedRequest.rejection.code, retryable: false, actualCodecValidated: true, noRepeatAfterNativeRestart: true, exactRequestCaptureHistoryRetained: true, provenanceRetained: true },
    changedCurrentNativeSnapshot: { actualPackagedCaller: true, actualAstroBuild: true, expectedPredecessor: null, creations: state.state.creations, htmlBytes: Buffer.byteLength(html), htmlSha256: digest(html) },
    dependencies: "existing readonly local modules", installedQualification: false, publicQualification: false, releaseQualification: false }, null, 2) + "\n", { flag: "wx" });
});
