import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ownedTempFixture } from './helpers/owned-temp.mjs';

test('exact retained normal artifact ships and executes current offline native qualification driver', async t => {
  const archive = process.env.DISCUSSIONBRIDGE_TEST_ARCHIVE; assert.ok(archive && path.isAbsolute(archive));
  const directory = path.dirname(archive), receiptFile = path.join(directory, 'package-receipt.json'), receipt = JSON.parse(await readFile(receiptFile, 'utf8'));
  const digest = value => createHash('sha256').update(value).digest('hex'), originalArchive = await readFile(archive);
  assert.equal(digest(originalArchive), receipt.sha256); assert.equal(originalArchive.length, receipt.bytes);
  const parent = fileURLToPath(new URL('../.tmp/', import.meta.url)); await mkdir(parent, { recursive: true });
  const root = await ownedTempFixture(t, 'discussionbridge-qualification-package-', parent);
  await promisify(execFile)('tar', ['-xf', archive, '-C', root], { windowsHide: true });
  const packed = path.join(root, 'package'), manifest = JSON.parse(await readFile(path.join(directory, 'package-members.json'), 'utf8'));
  assert.equal(manifest.members.length, receipt.memberCount);
  for (const member of manifest.members) { const actual = await readFile(path.join(packed, member.path)); assert.equal(actual.length, member.size); assert.equal(digest(actual), member.sha256); }
  const paths = manifest.members.map(member => member.path);
  for (const required of ['scripts/verify-thousand-pages.mjs', 'scripts/qualification-lib.mjs', 'docs/CURRENT_NATIVE_QUALIFICATION.md']) assert.ok(paths.includes(required));
  assert.equal(paths.filter(member => member.endsWith('cms-schema.json')).length, 1); assert.equal(paths.filter(member => member.endsWith('cms-runtime.mjs')).length, 1);
  assert.equal(paths.some(member => /(?:^|\/)(?:test|fixtures|\.tmp|\.artifacts|node_modules|\.git)(?:\/|$)/u.test(member)), false);
  const lib = await import(pathToFileURL(path.join(packed, 'scripts/qualification-lib.mjs')).href), native = await import(pathToFileURL(path.join(packed, 'dist/native-source.js')).href);
  const input = { format: 1, runRoot: path.join(root, 'new-owned-corpus'), targetCount: 12, contentFile: path.join(root, 'content.json'), subjectReceiptFile: receiptFile,
    native: { siteUrl: 'https://native.test/', routeBase: 'articles' }, receiver: { origin: 'https://receiver.test/', connectionId: 'dbc_aaaaaaaaaaaaaaaaaaaaaaaa', scopeRevision: 'unit-not-a-receiver', lane: 'qualification', categoryId: '71', actorId: '72', artifactSha256: 'a'.repeat(64), coreCommit: 'b'.repeat(40) },
    connectionSecretFile: path.join(root, 'fixture-secret'), caFile: path.join(root, 'fixture-ca.pem') };
  const seeds = Array.from({ length: input.targetCount }, (_, index) => ({ seedKey: `content-only-${index}`, title: `Native ${index}`, slug: `native-${index}`, markdown: `Native plain text ${index}.\n\n[Original target](../original/)\n`, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: null, authors: [] }));
  await writeFile(input.contentFile, JSON.stringify(seeds)); await writeFile(input.connectionSecretFile, 'unit-fixture-only-no-real-credential-0001', { mode: 0o600 }); await writeFile(input.caFile, rootCertificates[0]);
  const inputFile = path.join(root, 'inputs.json'); await writeFile(inputFile, JSON.stringify(input));
  const cli = path.join(packed, 'scripts/verify-thousand-pages.mjs'), register = new URL('../../../.tools/register.mjs', import.meta.url).href;
  const cliPlan = await promisify(execFile)(process.execPath, ['--import', register, cli, 'plan', inputFile], { cwd: packed, windowsHide: true });
  assert.equal(JSON.parse(cliPlan.stdout).qualification, 'NOT_RUN'); assert.equal(JSON.parse(cliPlan.stdout).artifact.sha256, receipt.sha256);
  const configured = await lib.readQualificationInputs(inputFile); assert.equal(configured.artifact.sha256, receipt.sha256);
  const planned = lib.qualificationPlan(configured.input); assert.equal(planned.qualification, 'NOT_RUN'); assert.equal(planned.countBoundary, 'small fixture only');
  const nativeManifest = await lib.materializeQualificationCorpus(configured.input), locations = lib.qualificationPaths(configured.input);
  assert.equal(nativeManifest.members.length, 12); assert.equal(nativeManifest.qualification, 'NOT_RUN');
  await assert.rejects(promisify(execFile)(process.execPath, ['--import', register, cli, 'plan', inputFile], { cwd: packed, windowsHide: true }), /run root already exists/u);
  const ids = [], originals = [];
  for (const member of nativeManifest.members) {
    const file = path.join(locations.docsDir, member.relativePath), contents = await readFile(file, 'utf8'), parsed = native.parseMarkdown(contents);
    assert.equal(digest(contents), member.originalFileSha256); assert.equal(digest(parsed.body), member.originalArticleSha256);
    assert.equal(parsed.frontmatter.discussionSync, member.ordinal <= 10);
    for (const forbidden of ['discussionbridgeExternalId', 'discussionbridgeResourceId', 'discourseTopicId', 'discussionbridgeSourcePublicationRevision']) assert.equal(Object.hasOwn(parsed.frontmatter, forbidden), false);
    ids.push(native.stableExternalId(new URL(input.native.siteUrl), locations.docsDir, file)); originals.push(digest(await readFile(path.join(locations.originals, member.relativePath))));
  }
  assert.equal(new Set(ids).size, 12); assert.equal(nativeManifest.members.some(member => Object.hasOwn(member, 'externalId') || Object.hasOwn(member, 'resourceId') || Object.hasOwn(member, 'topicId')), false);
  const admitted = await lib.admitQualificationCohort(configured.input, 12); assert.equal(admitted.newlyAdmitted, 2);
  for (const [index, member] of nativeManifest.members.entries()) { const parsed = native.parseMarkdown(await readFile(path.join(locations.docsDir, member.relativePath), 'utf8')); assert.equal(parsed.frontmatter.discussionSync, true); assert.equal(digest(parsed.body), member.originalArticleSha256); assert.equal(digest(await readFile(path.join(locations.originals, member.relativePath))), originals[index]); }
  assert.equal((await lib.nativeQualificationOptions(configured.input)).docsDir, locations.docsDir);
  await assert.rejects(lib.materializeQualificationCorpus(configured.input), /already exists/u);
  await assert.rejects(lib.checkQualificationCoverage(configured.input, inputFile, inputFile, inputFile), /actual publisher complete native scope/u);
  const previousCa = process.env.NODE_EXTRA_CA_CERTS; delete process.env.NODE_EXTRA_CA_CERTS;
  try { await assert.rejects(lib.collectQualificationRecords(configured.input), /explicit scoped CA/u); } finally { if (previousCa !== undefined) process.env.NODE_EXTRA_CA_CERTS = previousCa; }
  const extra = path.join(locations.docsDir, 'unrelated.md'); await writeFile(extra, 'unrelated'); await assert.rejects(lib.nativeQualificationOptions(configured.input), /census is partial/u); await unlink(extra);
  const saved = await readFile(path.join(packed, 'package.json')); await writeFile(path.join(packed, 'package.json'), Buffer.concat([saved, Buffer.from('\n')]));
  await assert.rejects(lib.verifyQualificationSubject(configured.input), /differs from the exact subject/u); await writeFile(path.join(packed, 'package.json'), saved);
  await lib.verifyQualificationSubject(configured.input); assert.equal(digest(await readFile(archive)), receipt.sha256);
  await writeFile(path.join(directory, 'consumer-qualification-results.json'), JSON.stringify({ format: 1, archive, archiveBytes: receipt.bytes, archiveSha256: receipt.sha256, memberCount: receipt.memberCount,
    checkedAt: new Date().toISOString(), actualSavedPackageDriver: true, everyMemberMatched: true, singlePortablePair: true, nativeMarkdownFilesCreated: 12,
    actualPhysicalPathIdentityDerivation: true, bindingIdsManufactured: false, immutableOriginals: true, fullCorpusScopeChecked: true, sharedWriterCohortAdmission: 2,
    actualCliPlanChecked: true, existingRootPlanRejected: true, missingNativeEvidenceRejected: true, partialCensusRejected: true, alteredInstalledPackageRejected: true, qualification: 'NOT_RUN', nativeBuilds: 0, httpRequests: 0, servicesLaunched: 0, thousandSourceRun: false,
    boundary: 'small offline packaged-driver fixture; synthetic configuration values are not actual receiver authority' }, null, 2) + '\n', { flag: 'wx' });
});
