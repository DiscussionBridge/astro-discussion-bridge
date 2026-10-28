import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile, mkdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ownedTempFixture } from './helpers/owned-temp.mjs';
import { validateQualificationInputs, qualificationPlan, planQualificationRun, materializeQualificationCorpus, completeRecordPages } from '../scripts/qualification-lib.mjs';

const configuration = root => ({ format: 1, runRoot: path.join(root, 'new-run'), targetCount: 2, contentFile: path.join(root, 'content.json'), subjectReceiptFile: path.join(root, 'package-receipt.json'),
  native: { siteUrl: 'https://native.test/', routeBase: 'articles' }, receiver: { origin: 'https://receiver.test/', connectionId: 'dbc_aaaaaaaaaaaaaaaaaaaaaaaa', scopeRevision: 'scope-unit', lane: 'qualification', categoryId: '71', actorId: '72', artifactSha256: 'a'.repeat(64), coreCommit: 'b'.repeat(40) },
  connectionSecretFile: path.join(root, 'secret'), caFile: path.join(root, 'ca.pem') });
const seeds = () => [1, 2].map(id => ({ seedKey: `content-${id}`, title: `Native content ${id}`, slug: `native-${id}`, markdown: `Plain native body ${id}.\n`, createdAt: null, updatedAt: null, authors: [] }));
// Closed metadata for continuation-validator unit cases only. This never calls
//02, creates native/receiver bindings, or represents an observed topic.
const metadata = id => ({ resource_id: `11111111-1111-4111-8111-${String(id).padStart(12, '0')}`, direction: 'to_discourse', state: 'active', topic_id: String(id), topic_url: `https://receiver.test/t/native/${id}`, external_id: `unit-metadata-${id}`, canonical_url: `https://native.test/articles/native-${id}/`, source_revision: `unit-revision-${id}`, source_created_at: null, source_updated_at: null, synchronized_at: null, mapping_id: null });

test('qualification requires explicit opaque receiver/native/artifact inputs without a publication action', () => {
  const input = configuration(path.dirname(fileURLToPath(import.meta.url)));
  assert.equal(qualificationPlan(input).qualification, 'NOT_RUN'); assert.equal(qualificationPlan(input).countBoundary, 'small fixture only');
  for (const field of ['categoryId', 'actorId', 'connectionId', 'scopeRevision', 'artifactSha256']) { const bad = structuredClone(input); delete bad.receiver[field]; assert.throws(() => validateQualificationInputs(bad)); }
  for (const value of ['http://native.test/', 'https://native.test/path/', 'https://name:secret@native.test/']) assert.throws(() => validateQualificationInputs({ ...input, native: { ...input.native, siteUrl: value } }));
  assert.throws(() => validateQualificationInputs({ ...input, transport: 'v1' }));
  assert.throws(() => validateQualificationInputs({ ...input, connectionSecretFile: path.join(input.runRoot, 'secret') }));
});

test('content-only generation rejects bindings, partial input and colliding native routes before allocating', async t => {
  const root = await ownedTempFixture(t, 'discussionbridge-qualification-input-'), input = configuration(root);
  for (const value of [[seeds()[0]], [{ ...seeds()[0], resource_id: 'invented' }, seeds()[1]], [seeds()[0], { ...seeds()[1], slug: seeds()[0].slug }], [{ ...seeds()[0], markdown: '\ud800' }, seeds()[1]]]) {
    await writeFile(input.contentFile, JSON.stringify(value)); await assert.rejects(materializeQualificationCorpus(input));
    await assert.rejects(lstat(input.runRoot), { code: 'ENOENT' });
  }
});

test('generation never adopts an existing root or creates a root when credentials are incomplete', async t => {
  const root = await ownedTempFixture(t, 'discussionbridge-qualification-root-'), input = configuration(root);
  await writeFile(input.contentFile, JSON.stringify(seeds())); await mkdir(input.runRoot); const marker = path.join(input.runRoot, 'unrelated.txt'); await writeFile(marker, 'preserve');
  await assert.rejects(planQualificationRun(input), /already exists/u);
  await assert.rejects(materializeQualificationCorpus(input), /already exists/u);
  const missing = { ...input, runRoot: path.join(root, 'another-new-run') };
  await assert.rejects(materializeQualificationCorpus(missing)); await assert.rejects(lstat(missing.runRoot), { code: 'ENOENT' });
});

test('complete current V4 record pages retain exact string IDs and require terminal coverage', () => {
  const first = { cursor: null, body: { items: [metadata(1)], next_cursor: 'opaque-next' } }, last = { cursor: 'opaque-next', body: { items: [metadata(2)], next_cursor: null } };
  const rows = completeRecordPages([first, last], 2); assert.equal(rows.length, 2); assert.equal(typeof rows[1].topic_id, 'string');
  assert.throws(() => completeRecordPages([first], 2), /not complete/u);
  assert.throws(() => completeRecordPages([{ ...first, cursor: 'not-first' }, last], 2));
  assert.throws(() => completeRecordPages([first, { ...last, cursor: 'skipped' }], 2));
  assert.throws(() => completeRecordPages([first, { ...last, body: { items: [metadata(1)], next_cursor: null } }], 2), /repeats/u);
  assert.throws(() => completeRecordPages([{ cursor: null, body: { items: [metadata(1)], next_cursor: null } }, last], 2));
  assert.throws(() => completeRecordPages([first, { ...last, body: { ...last.body, items: [{ ...metadata(2), topic_id: 2 }] } }], 2));
});
