import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";
import { sourceMoveFixture } from "./fixtures/source-move.mjs";
import { buildToConsumer } from "./fixtures/native-to-consumer.mjs";

test("exact retained normal package executes full native source move and later02 retains actual29 ancestry", async t => {
  const archive = process.env.DISCUSSIONBRIDGE_TEST_ARCHIVE; assert.ok(archive && path.isAbsolute(archive));
  const directory = path.dirname(archive), receipt = JSON.parse(await readFile(path.join(directory, "package-receipt.json"), "utf8"));
  const digest = value => createHash("sha256").update(value).digest("hex"), original = await readFile(archive);
  assert.equal(digest(original), receipt.sha256); assert.equal(original.length, receipt.bytes);
  const parent = fileURLToPath(new URL("../.tmp/", import.meta.url)); await mkdir(parent, { recursive: true });
  const root = await ownedTempFixture(t, "discussionbridge-source-package-", parent);
  await promisify(execFile)("tar", ["-xf", archive, "-C", root], { windowsHide: true });
  const packed = path.join(root, "package"), members = JSON.parse(await readFile(path.join(directory, "package-members.json"), "utf8"));
  assert.equal(members.members.length, receipt.memberCount);
  for (const member of members.members) { const actual = await readFile(path.join(packed, member.path)); assert.equal(actual.length, member.size); assert.equal(digest(actual), member.sha256); }
  const paths = members.members.map(member => member.path);
  assert.equal(paths.filter(name => name.endsWith("cms-schema.json")).length, 1); assert.equal(paths.filter(name => name.endsWith("cms-runtime.mjs")).length, 1);
  assert.equal(paths.some(name => /(?:^|\/)(?:test|fixtures|\.tools|\.tmp|\.artifacts|\.git|\.discussionbridge|node_modules)(?:\/|$)/u.test(name)), false);
  const artifacts = JSON.parse(await readFile(path.join(packed, "src/private/ARTIFACTS.json"), "utf8"));
  for (const pin of artifacts.members.filter(member => ["src/cms-schema.json", "src/cms-runtime.mjs", "CANDIDATE.json", "ROUTES.md"].includes(member.path))) { const actual = await readFile(path.join(packed, "src/private", path.basename(pin.path))); assert.equal(actual.length, pin.bytes); assert.equal(digest(actual), pin.sha256); }
  const api = await import(pathToFileURL(path.join(packed, "dist/index.js")).href), s = await sourceMoveFixture(t);
  const build = () => buildToConsumer(s, packed, true, true);
  const initial = await build(), before = structuredClone(Object.values((await s.journal()).operations)[0]);
  await api.beginControlledSourceUrlMove(s.options, s.file, "https://astro.example/articles/packaged-move/"); s.expectedSlug = "packaged-move";
  const moved = await build(); assert.equal(s.received.length, Object.keys(before.to.receipts).length);
  const deployed = path.join(s.root, "native-deployment.txt"), command = { executable: process.execPath, cwd: s.root, timeoutMs: 20000,
    args: ["--input-type=module", "-e", "import{writeFile}from'node:fs/promises';await writeFile(process.argv[1],'actual local disposable deploy child');", deployed] };
  const deployment = await api.runControlledSourceCommand(s.options, s.file, "deploy", command);
  const result = await api.finalizeControlledSourceUrlMove(s.options, s.file, { fetchImplementation: s.fetchPublic });
  const committed = structuredClone(Object.values((await s.journal()).operations)[0]);
  assert.equal(result.source_revision, committed.to.sourceMove.newRevision); assert.equal(result.canonical_url, "https://astro.example/articles/packaged-move/");
  assert.deepEqual(committed.to.acceptedBody, before.to.acceptedBody); assert.deepEqual(committed.to.receipts, before.to.receipts);
  assert.equal(committed.to.nativeCapture.nativeHtml, before.to.nativeCapture.nativeHtml); assert.equal(committed.topicId, before.topicId); assert.equal(committed.resourceId, before.resourceId);
  const after = await build(), last = s.received.at(-1).bridge_record;
  assert.equal(last.source_revision, result.source_revision); assert.equal(last.expected_source_revision, result.source_revision); assert.equal(last.content_html, before.to.acceptedBody.bridge_record.content_html);
  assert.equal(s.state.creations, 1); assert.equal(deployment.terminationConfirmed, true);
  assert.equal(digest(await readFile(archive)), receipt.sha256);
  for (const [name, html] of [["before", initial], ["moved", moved], ["after", after]]) await writeFile(path.join(directory, `consumer-source-${name}.html`), html, { flag: "wx" });
  await writeFile(path.join(directory, "consumer-source-results.json"), JSON.stringify({ format: 1, archive, archiveBytes: receipt.bytes, archiveSha256: receipt.sha256, memberCount: receipt.memberCount,
    memberHashesMatched: true, portablePairMatched: true, candidateId: artifacts.candidate_id, checkedAt: new Date().toISOString(), actualSavedPackageCaller: true,
    nativeSamePhysicalFileSlugRoute: true, nativeFullArticlePreserved: true, sourceIdentityPreserved: true, laterUnchanged02Retains29Revision: true, actualAnonymousLoopbackProof: true,
    verification: committed.to.sourceMove.finalizeBody.verification, actualLocalChild: { pid: deployment.pid, terminationConfirmed: deployment.terminationConfirmed, deploymentId: deployment.deploymentId },
    output: [initial, moved, after].map(html => ({ bytes: Buffer.byteLength(html), sha256: digest(html) })), installedQualification: false, publicDeploymentQualification: false, browserFunctionQualification: false,
    dependencies: "existing readonly local dependencies; no install/network" }, null, 2) + "\n", { flag: "wx" });
});
