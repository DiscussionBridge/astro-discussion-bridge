import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";
import { buildCmsConsumer, staticFixture } from "./fixtures/cms-static.mjs";
import { nativeSource, toFixture } from "./fixtures/cms-to.mjs";
import { buildToConsumer } from "./fixtures/native-to-consumer.mjs";
import { ownedPng } from "./helpers/native-png.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
async function run(executable, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stdout.on("data", bytes => { output += bytes; }); child.stderr.on("data", bytes => { errors += bytes; });
    child.once("error", reject); child.once("close", code => code === 0 ? resolve(output) : reject(new Error(`Owned package command rejected: ${errors}`)));
  });
}

test("actual current V4 archive contains one pinned pair and compiles native To/From consumers", async t => {
  const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  assert.ok(path.isAbsolute(npmCli)); await readFile(npmCli);
  const parent = path.join(packageRoot, ".tmp"); await mkdir(parent, { recursive: true });
  const root = await ownedTempFixture(t, "discussionbridge-v4-package-", parent);
  const savedArchive = process.env.DISCUSSIONBRIDGE_TEST_ARCHIVE;
  const result = savedArchive ? JSON.parse(await readFile(path.join(path.dirname(savedArchive), "npm-pack.json"), "utf8")) : JSON.parse(await run(process.execPath, [npmCli, "pack", "--ignore-scripts", "--json", "--pack-destination", root, "--cache", path.join(root, "npm-cache")], packageRoot))[0];
  const archive = savedArchive ?? path.join(root, result.filename);
  const archiveBytes = await readFile(archive), archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
  if (savedArchive) {
    assert.ok(path.isAbsolute(savedArchive));
    const receipt = JSON.parse(await readFile(path.join(path.dirname(savedArchive), "package-receipt.json"), "utf8"));
    assert.equal(receipt.archive, savedArchive); assert.equal(receipt.sha256, archiveSha256); assert.equal(receipt.bytes, archiveBytes.length); assert.equal(receipt.memberCount, result.entryCount);
  }
  const members = result.files.map(member => member.path);
  for (const required of ["dist/index.js", "dist/cli.js", "dist/cms-to.js", "dist/controlled-creation.js", "dist/cms-pipeline.js", "dist/cms-static.js", "dist/cms-verification.js", "src/web-url.ts", "src/private/cms-schema.json", "src/private/cms-runtime.mjs", "src/private/CANDIDATE.json", "src/private/ARTIFACTS.json", "src/private/ROUTES.md", "docs/NATIVE_V4.md", "src/assets/discussionbridge-rich-content.js"]) assert.ok(members.includes(required), required);
  assert.equal(members.filter(member => member.endsWith("cms-schema.json")).length, 1);
  assert.equal(members.filter(member => member.endsWith("cms-runtime.mjs")).length, 1);
  assert.equal(members.some(member => /(?:^|\/)(?:test|fixtures|\.tools|\.tmp|\.artifacts|\.git|\.discussionbridge|node_modules)(?:\/|$)|generated-excerpt-20261014|cms-to-profile|legacy|initializer/iu.test(member)), false);
  await run("tar", ["-xf", archive, "-C", root], packageRoot);
  const packed = path.join(root, "package"), artifacts = JSON.parse(await readFile(path.join(packed, "src/private/ARTIFACTS.json"), "utf8"));
  assert.equal(artifacts.wire_version, "v4"); assert.equal(artifacts.implementation_version, "0.4.0-alpha.1"); assert.equal(artifacts.release_version, null);
  for (const member of artifacts.members.filter(member => ["src/cms-schema.json", "src/cms-runtime.mjs"].includes(member.path))) {
    const actual = await readFile(path.join(packed, "src/private", path.basename(member.path)));
    assert.equal(actual.length, member.bytes); assert.equal(createHash("sha256").update(actual).digest("hex"), member.sha256);
  }
  const from = await staticFixture(t, {}, undefined, "full", false), fromOutput = await buildCmsConsumer(from, true, packed);
  assert.match(fromOutput, /Complete native source/); assert.match(fromOutput, /Consumer footer/);
  const fromJournal = JSON.parse(await readFile(from.options.stateFile, "utf8"));
  assert.equal(fromJournal.transactions[from.expectedWorkId].stage, "prepared"); assert.equal(fromJournal.transactions[from.expectedWorkId].buildArtifact.html, fromOutput);
  const nativePackage = await import(pathToFileURL(path.join(packed, "dist/index.js")).href);
  await nativePackage.finalizeCmsNativeWork({ ...from.options, publicFetchImplementation: async () => new Response(fromOutput, { headers: { "Content-Type": "text/html" } }) }, from.expectedWorkId, { deploymentId: "packaged-consumer-response-seam", deployedAt: new Date().toISOString() });
  const movedWork = await from.nextAction("publish_revision"), movedUrl = "https://astro.example/comments/packaged-native-move/";
  await nativePackage.beginCmsNativeUrlMove(from.options, from.nativeMapping.mapping_id, movedUrl);
  const movedOutput = await buildCmsConsumer(from, false, packed, movedUrl);
  await nativePackage.recordCmsNativeBuild(from.options, path.join(from.root, "dist"));
  const movedJournal = JSON.parse(await readFile(from.options.stateFile, "utf8")), moved = movedJournal.transactions[movedWork.workId].presentationMove;
  assert.equal(moved.phase, "applied"); assert.equal(moved.build.html, movedOutput); assert.equal(moved.mapping.destination_native_id, from.nativeMapping.destination_native_id);
  assert.ok(movedOutput.includes(`data-discussionbridge-cms-nonce="${moved.receipt.proof_nonce}"`)); assert.ok(movedOutput.includes(`data-discussionbridge-cms-canonical="${movedUrl}"`));
  const to = await toFixture(t, nativeSource('"'.repeat(45000)), "53"), toOutput = await buildToConsumer(to, packed);
  assert.match(toOutput, /Consumer owns navigation/); assert.equal(to.received[0].bridge_record.representation.kind, "generated_excerpt"); assert.equal(to.state.creations, 1);
  assert.doesNotMatch(fromOutput + toOutput, /lease_token|connectionSecret|synthetic-secret|cms-runtime|\.tools/);
  const acceptedRevision = to.state.record.source_revision;
  await writeFile(to.file, (await readFile(to.file, "utf8")).replace("consumerField: retained", "draft: true\nconsumerField: retained"));
  assert.equal(await buildToConsumer(to, packed), null, "the same packaged normal build removes the unpublished consumer route");
  assert.equal(to.withdrawals.length, 1); assert.equal(to.withdrawals[0].reason, "source_unpublished"); assert.equal(to.withdrawals[0].expected_source_revision, acceptedRevision);
  assert.equal(to.state.record.state, "withdrawn"); assert.equal(to.received.length, 1, "ordinary close never republishes through02");
  const assetTo = await toFixture(t, nativeSource('![Packaged native image](../assets/native.png)'), "53");
  await mkdir(path.join(assetTo.root, "src/content/assets"), { recursive: true });
  await writeFile(path.join(assetTo.root, "src/content/assets/native.png"), ownedPng());
  const assetOutput = await buildToConsumer(assetTo, packed, true);
  const assetOperation = Object.values((await assetTo.journal()).operations)[0], assetCapture = assetOperation.to.articleCaptures[assetOperation.to.acceptedCaptureId];
  const assetUrl = new URL(/\bsrc="([^"]+)"/u.exec(assetCapture.preparedHtml)[1]);
  const emittedAsset = await readFile(path.join(assetTo.root, "dist", assetUrl.pathname));
  assert.ok(assetOutput.includes(assetUrl.pathname)); assert.ok(emittedAsset.length > 0);
  assert.equal(assetTo.received[0].bridge_record.source_content_sha256, assetTo.digest(assetCapture.preparedHtml));
  assert.equal(assetOperation.nativeRender, undefined); assert.equal(assetTo.state.creations, 1);
  assert.doesNotMatch(assetOutput, /synthetic-secret|test-owned-native-source-binding|nativeRender/);
  if (savedArchive) {
    const destination = path.dirname(savedArchive), sha256 = contents => createHash("sha256").update(contents).digest("hex");
    const memberManifest = JSON.parse(await readFile(path.join(destination, "package-members.json"), "utf8"));
    for (const member of memberManifest.members) { const actual = await readFile(path.join(packed, member.path)); assert.equal(actual.length, member.size); assert.equal(sha256(actual), member.sha256); }
    assert.equal(sha256(await readFile(savedArchive)), archiveSha256, "consumer extraction used the unchanged saved archive");
    await writeFile(path.join(destination, "consumer-from.html"), fromOutput, { flag: "wx" });
    await writeFile(path.join(destination, "consumer-to.html"), toOutput, { flag: "wx" });
    await writeFile(path.join(destination, "consumer-move.html"), movedOutput, { flag: "wx" });
    await writeFile(path.join(destination, "consumer-native-image.html"), assetOutput, { flag: "wx" });
    await writeFile(path.join(destination, "consumer-native-image-asset.bin"), emittedAsset, { flag: "wx" });
    await writeFile(path.join(destination, "consumer-results.json"), JSON.stringify({ format: 1, archive: savedArchive, archiveBytes: archiveBytes.length, archiveSha256,
      checkedAt: new Date().toISOString(), memberCount: result.entryCount, memberHashesMatched: true, portablePairMatched: true, privateMaterialExcluded: true,
      from: { actualAstroBuild: true, state: fromJournal.transactions[from.expectedWorkId].stage, bytes: Buffer.byteLength(fromOutput), sha256: sha256(fromOutput) },
      presentationMove: { actualPackagedCaller: true, actualAstroBuild: true, state: moved.phase, sameNativeId: true, ownedNonceRendered: true, bytes: Buffer.byteLength(movedOutput), sha256: sha256(movedOutput), publicMoveProof: "NOT_RUN", moveSettlement: "NOT_RUN", initialPublicationProof: "in-memory response seam" },
      to: { actualAstroBuild: true, buildMode: "Astro force:true full build for repeated in-process fixture", representation: to.received[0].bridge_record.representation.kind, creations: to.state.creations, bytes: Buffer.byteLength(toOutput), sha256: sha256(toOutput), ordinaryUnpublishBuild: true, withdrawalCount: to.withdrawals.length, acceptedRevision, finalState: to.state.record.state },
      nativeImage: { actualPackagedHelper: true, actualNativeContentRender: true, actualAstroBuild: true, sourceArticleUrl: assetCapture.sourceArticleUrl, originalSha256: assetCapture.originalSha256, preparedBytes: assetCapture.preparedBytes, preparedSha256: assetCapture.preparedSha256, assetUrl: assetUrl.href, emittedAssetBytes: emittedAsset.length, emittedAssetSha256: sha256(emittedAsset), creations: assetTo.state.creations, htmlBytes: Buffer.byteLength(assetOutput), htmlSha256: sha256(assetOutput) },
      dependencies: "existing readonly local modules", installedQualification: false, publicQualification: false, releaseQualification: false }, null, 2) + "\n", { flag: "wx" });
  }
  t.diagnostic(`Actual npm archive ${result.entryCount} members; exact V4 pair and packaged To/From Astro builds. Existing readonly dependencies only; no install/deployment/release qualification.`);
});
