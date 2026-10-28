import { createHash, randomUUID, X509Certificate } from 'node:crypto';
import { lstat, mkdir, open, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CmsClient } from '../dist/cms-client.js';
import { readPublicationOperationalState } from '../dist/operational-state.js';
import { findMarkdownFiles, parseMarkdown, pageUrlForFile, stableExternalId, validateSlug, validateRouteBase, nativeLifecycle } from '../dist/native-source.js';
import { inspectSourceArticle, validateSourceCapture, sourceHash, sourceDependencyMarkup } from '../dist/to-source-profile.js';
import { assertNativeArticleCapture } from '../dist/native-preparation.js';
import { resolveServerSecret } from '../dist/server-secret.js';
import { withNativeSourceWriter } from '../dist/native-locks.js';
import { readExistingPublication, atomicWrite } from '../dist/native-files.js';
import { validateCms, semanticIdentity, candidateId } from '../src/private/cms-runtime.mjs';

// This is evidence tooling. It owns no publication receipts or protocol state.
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(`Native qualification: ${message}`); };
const inside = (root, file) => { const relative = path.relative(root, file); return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
const absolute = (value, name) => { if (typeof value !== 'string' || !path.isAbsolute(value)) fail(`${name} must be an explicit absolute path.`); return path.resolve(value); };
const closed = (value, fields, name) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(value, key))) fail(`${name} requires its exact declared inputs.`); };
const origin = (value, name) => { validateCms('Url', value); const url = new URL(value); if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) fail(`${name} must be an HTTPS origin.`); return url.origin; };

async function unlinked(file) {
  const target = path.resolve(file), root = path.parse(target).root;
  let current = root;
  for (const part of path.relative(root, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, part); const entry = await lstat(current, { bigint: true });
    if (entry.isSymbolicLink()) fail('symlink/replaced input or fixture path.');
  }
  const actual = await realpath(target);
  if ((process.platform === 'win32' ? actual.toLowerCase() !== target.toLowerCase() : actual !== target)) fail('input path does not resolve to its stated location.');
}
async function bytes(file, maximum = 64 * 1024 * 1024) {
  await unlinked(file); const before = await lstat(file, { bigint: true });
  if (!before.isFile() || before.size > BigInt(maximum)) fail('input exceeds the explicit tooling budget or is not a regular file; nothing was truncated.');
  const handle = await open(file, 'r');
  try {
    const first = await handle.stat({ bigint: true });
    if (first.dev !== before.dev || first.ino !== before.ino) fail('input changed while opening.');
    const value = await handle.readFile(), last = await handle.stat({ bigint: true });
    if (last.dev !== first.dev || last.ino !== first.ino || last.size !== first.size || last.mtimeNs !== first.mtimeNs || BigInt(value.length) !== first.size) fail('input changed while reading.');
    return value;
  } finally { await handle.close(); }
}
const json = async (file, maximum) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await bytes(file, maximum)));
const writeJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });

export function validateQualificationInputs(value) {
  closed(value, ['format', 'runRoot', 'targetCount', 'contentFile', 'subjectReceiptFile', 'native', 'receiver', 'connectionSecretFile', 'caFile'], 'configuration');
  if (value.format !== 1 || !Number.isSafeInteger(value.targetCount) || value.targetCount < 1 || value.targetCount > 1000) fail('targetCount must be 1 through1000; a smaller fixture never qualifies1000.');
  closed(value.native, ['siteUrl', 'routeBase'], 'native binding');
  closed(value.receiver, ['origin', 'connectionId', 'scopeRevision', 'lane', 'categoryId', 'actorId', 'artifactSha256', 'coreCommit'], 'receiver binding');
  const result = structuredClone(value);
  for (const field of ['runRoot', 'contentFile', 'subjectReceiptFile', 'connectionSecretFile', 'caFile']) result[field] = absolute(value[field], field);
  result.native.siteUrl = origin(value.native.siteUrl, 'native site'); result.native.routeBase = validateRouteBase(value.native.routeBase);
  result.receiver.origin = origin(value.receiver.origin, 'receiver');
  if (result.receiver.origin === result.native.siteUrl) fail('source and receiver must have separate explicit origins.');
  for (const [field, type] of [['connectionId', 'ConnectionId'], ['scopeRevision', 'Revision'], ['lane', 'Lane'], ['categoryId', 'CoreId'], ['actorId', 'CoreId'], ['artifactSha256', 'Sha256']]) validateCms(type, result.receiver[field]);
  if (!/^[a-f0-9]{40}$/u.test(result.receiver.coreCommit)) fail('actual receiver Core commit is required.');
  for (const field of ['contentFile', 'subjectReceiptFile', 'connectionSecretFile', 'caFile']) if (inside(result.runRoot, result[field]) || result[field] === result.runRoot) fail('prerequisite files must exist outside the new run root.');
  return result;
}

export function qualificationPaths(input) {
  const root = input.runRoot;
  return { root, docsDir: path.join(root, 'native/src/content/docs'), stateFile: path.join(root, 'private/astro-to-state.json'), originals: path.join(root, 'originals'), evidence: path.join(root, 'evidence'), marker: path.join(root, 'owner.json'), manifest: path.join(root, 'native-manifest.json') };
}
export async function verifyQualificationSubject(input) {
  const receipt = await json(input.subjectReceiptFile, 65536);
  validateCms('Sha256', receipt.sha256); validateCms('Sha256', receipt.packageMembersSha256);
  if (receipt.candidateId !== candidateId || receipt.wireVersion !== 'v4' || receipt.releaseVersion !== null || !Number.isSafeInteger(receipt.memberCount) || receipt.memberCount < 1) fail('subject is not the current exact normal V4 development package.');
  const archive = absolute(receipt.archive, 'normal archive'), archiveBytes = await bytes(archive);
  if (archiveBytes.length !== receipt.bytes || hash(archiveBytes) !== receipt.sha256) fail('normal archive bytes/hash differ.');
  const memberFile = path.join(path.dirname(input.subjectReceiptFile), 'package-members.json'), memberBytes = await bytes(memberFile);
  if (hash(memberBytes) !== receipt.packageMembersSha256) fail('member-manifest pin differs.');
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(memberBytes));
  if (manifest.archive !== receipt.archive || manifest.members.length !== receipt.memberCount) fail('member manifest is incomplete.');
  const names = new Set();
  for (const member of manifest.members) {
    const file = path.resolve(packageRoot, member.path);
    if (!inside(packageRoot, file) || names.has(member.path)) fail('unsafe/duplicate package member.'); names.add(member.path);
    const actual = await bytes(file);
    if (actual.length !== member.size || hash(actual) !== member.sha256) fail('installed driver/package differs from the exact subject member.');
  }
  for (const required of ['scripts/verify-thousand-pages.mjs', 'scripts/qualification-lib.mjs', 'dist/controlled-creation.js', 'dist/cms-client.js', 'src/private/cms-schema.json', 'src/private/cms-runtime.mjs']) if (!names.has(required)) fail('current qualification/native/SDK material is missing from the normal artifact.');
  return { archive, bytes: receipt.bytes, sha256: receipt.sha256, memberCount: receipt.memberCount, candidateId };
}
export async function readQualificationInputs(file) {
  const input = validateQualificationInputs(await json(absolute(file, 'configuration'), 65536));
  await unlinked(path.dirname(input.runRoot));
  const parent = await lstat(path.dirname(input.runRoot)); if (!parent.isDirectory()) fail('explicit run parent is not a directory.');
  await prerequisiteFiles(input);
  await bytes(input.contentFile);
  const artifact = await verifyQualificationSubject(input);
  return { input, artifact };
}
async function prerequisiteFiles(input) {
  await unlinked(input.connectionSecretFile);
  await resolveServerSecret({ secretFile: input.connectionSecretFile });
  const ca = new X509Certificate(await bytes(input.caFile, 262144));
  if (!ca.ca) fail('explicit CA input is not a CA certificate; no TLS trust bypass is used.');
}
export function qualificationPlan(input) {
  input = validateQualificationInputs(input);
  return { format: 1, qualification: 'NOT_RUN', targetCount: input.targetCount, countBoundary: input.targetCount === 1000 ? '1000-native-source target' : 'small fixture only',
    paths: qualificationPaths(input), nativeOrigin: input.native.siteUrl, receiverOrigin: input.receiver.origin, receiverCategoryId: input.receiver.categoryId,
    receiverActorId: input.receiver.actorId, receiverArtifactSha256: input.receiver.artifactSha256,
    canary: Math.min(10, input.targetCount), maximumNextCohort: 100, completeRootRequired: true,
    nativeActions: ['normal installed Astro integration/build', 'actual build/deploy and anonymous full native article/assets', 'actual native receiver topic/category census'],
    pending: ['receiver readiness and scoped origin/configuration', 'normal native full/cached/incremental builds', 'actual HTTPS/browser evidence', 'lifecycle/restart/rollback'],
    credentials: 'protected file inputs; never public output', productPublicationStateOwnedBy: 'existing native publisher only' };
}
export async function planQualificationRun(input) {
  input = validateQualificationInputs(input); await requireNewRoot(input.runRoot); return qualificationPlan(input);
}
function contentSeeds(value, count) {
  if (!Array.isArray(value) || value.length !== count) fail('content input must contain every intended native source exactly once.');
  const keys = new Set(), slugs = new Set();
  return value.map(seed => {
    closed(seed, ['seedKey', 'title', 'slug', 'markdown', 'createdAt', 'updatedAt', 'authors'], 'content-only seed');
    if (typeof seed.seedKey !== 'string' || !seed.seedKey || keys.has(seed.seedKey)) fail('content seed keys must be distinct.'); keys.add(seed.seedKey);
    validateCms('Title', seed.title); validateSlug(seed.slug, 'content input'); if (slugs.has(seed.slug)) fail('native slugs collide.'); slugs.add(seed.slug);
    if (typeof seed.markdown !== 'string' || new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(seed.markdown)) !== seed.markdown || /^---(?:\r?\n)/u.test(seed.markdown)) fail('content body must be complete UTF8 Markdown without a second frontmatter block.');
    for (const field of ['createdAt', 'updatedAt']) if (seed[field] !== null) validateCms('Instant', seed[field]);
    if (seed.createdAt && seed.updatedAt && seed.updatedAt < seed.createdAt) fail('fixture authored dates have reversed chronology.');
    validateCms('SourceAuthors', seed.authors);
    return structuredClone(seed);
  });
}
async function requireNewRoot(root) {
  try { await lstat(root); fail('run root already exists; unrelated or previous fixture data is never adopted.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await unlinked(path.dirname(root));
}
async function freshRoot(root) {
  await requireNewRoot(root); await mkdir(root, { mode: 0o700 });
  const identity = await lstat(root, { bigint: true }); if (!identity.isDirectory() || identity.isSymbolicLink() || identity.ino <= 0n) fail('cannot bind new owned root.');
  return { dev: String(identity.dev), ino: String(identity.ino) };
}
export async function materializeQualificationCorpus(input) {
  input = validateQualificationInputs(input);
  // Check every seed BEFORE allocation. This writes native data only; no renderer,
  // receiver call, invented binding, excerpt or source-revision generation.
  const contentBytes = await bytes(input.contentFile), seeds = contentSeeds(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(contentBytes)), input.targetCount), paths = qualificationPaths(input);
  try { await lstat(paths.root); fail('run root already exists; unrelated or previous fixture data is never adopted.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await prerequisiteFiles(input); await verifyQualificationSubject(input);
  const identity = await freshRoot(paths.root), token = randomUUID();
  await writeJson(paths.marker, { format: 1, purpose: 'astro-v4-native-qualification', token, ...identity });
  for (const directory of [paths.docsDir, paths.originals, path.dirname(paths.stateFile), paths.evidence]) await mkdir(directory, { recursive: true, mode: 0o700 });
  const members = [];
  for (let ordinal = 0; ordinal < seeds.length; ordinal++) {
    const seed = seeds[ordinal], relativePath = `source-${String(ordinal + 1).padStart(4, '0')}.md`, file = path.join(paths.docsDir, relativePath);
    const source = `---\ntitle: ${JSON.stringify(seed.title)}\nslug: ${JSON.stringify(seed.slug)}\ndiscussionCommentsDisplay: interactive\ndiscussionSync: ${ordinal < Math.min(10, seeds.length)}\n${seed.createdAt === null ? '' : `date: ${JSON.stringify(seed.createdAt)}\n`}${seed.updatedAt === null ? '' : `lastUpdated: ${JSON.stringify(seed.updatedAt)}\n`}${seed.authors.length ? `authors: ${JSON.stringify(seed.authors)}\nprimaryAuthor: ${JSON.stringify(seed.authors[0].id)}\n` : ''}---\n${seed.markdown}`;
    await writeFile(file, source, { flag: 'wx', mode: 0o600 }); await writeFile(path.join(paths.originals, relativePath), source, { flag: 'wx', mode: 0o600 });
    const entry = await lstat(file, { bigint: true }), canonicalUrl = pageUrlForFile({ docsDir: paths.docsDir, filePath: file, siteBase: new URL(input.native.siteUrl), routeBase: input.native.routeBase, slug: seed.slug, hasSlug: true });
    members.push({ ordinal: ordinal + 1, seedKey: seed.seedKey, relativePath, dev: String(entry.dev), ino: String(entry.ino), canonicalUrl, originalFileBytes: Buffer.byteLength(source), originalFileSha256: hash(source), originalArticleBytes: Buffer.byteLength(seed.markdown), originalArticleSha256: hash(seed.markdown) });
  }
  const docs = await lstat(paths.docsDir, { bigint: true });
  const manifest = { format: 1, token, runIdentity: identity, docsIdentity: { dev: String(docs.dev), ino: String(docs.ino) }, targetCount: input.targetCount,
    native: input.native, receiver: input.receiver, contentInputSha256: hash(contentBytes), members, qualification: 'NOT_RUN' };
  if (hash(await bytes(input.contentFile)) !== manifest.contentInputSha256) fail('content input changed; owned partial fixture retained, not a completed manifest.');
  await writeJson(paths.manifest, manifest); return manifest;
}
async function ownedCorpus(input) {
  input = validateQualificationInputs(input); const paths = qualificationPaths(input), manifest = await json(paths.manifest), owner = await json(paths.marker, 65536);
  await unlinked(paths.docsDir); const root = await lstat(paths.root, { bigint: true }), docs = await lstat(paths.docsDir, { bigint: true });
  if (owner.purpose !== 'astro-v4-native-qualification' || owner.token !== manifest.token || owner.dev !== String(root.dev) || owner.ino !== String(root.ino)
    || manifest.runIdentity.dev !== String(root.dev) || manifest.runIdentity.ino !== String(root.ino) || manifest.docsIdentity.dev !== String(docs.dev) || manifest.docsIdentity.ino !== String(docs.ino)
    || manifest.targetCount !== input.targetCount || semanticIdentity(manifest.native) !== semanticIdentity(input.native) || semanticIdentity(manifest.receiver) !== semanticIdentity(input.receiver)) fail('owned corpus root/scope/configuration changed.');
  if (!Array.isArray(manifest.members) || manifest.members.some((member, ordinal) => member.ordinal !== ordinal + 1 || member.relativePath !== `source-${String(ordinal + 1).padStart(4, '0')}.md`)) fail('native manifest contains an invalid ordinal or physical source path.');
  const files = await findMarkdownFiles(paths.docsDir), expected = manifest.members.map(member => path.join(paths.docsDir, member.relativePath));
  if (new Set(expected).size !== input.targetCount || manifest.members.length !== input.targetCount || semanticIdentity([...files].sort()) !== semanticIdentity(expected.sort())) fail('native census is partial, duplicated or contains unrelated files.');
  return { input, paths, manifest };
}
export async function admitQualificationCohort(input, admittedCount) {
  input = validateQualificationInputs(input);
  const owned = await ownedCorpus(input);
  if (!Number.isSafeInteger(admittedCount) || admittedCount < 1 || admittedCount > input.targetCount) fail('admission count is outside the complete native corpus.');
  return withNativeSourceWriter(owned.paths.docsDir, owned.paths.stateFile, async () => {
  await ownedCorpus(input);
  const changes = [];
  for (const member of owned.manifest.members) {
    const file = path.join(owned.paths.docsDir, member.relativePath), source = new TextDecoder('utf-8', { fatal: true }).decode(await bytes(file)), parsed = parseMarkdown(source);
    const canonical = pageUrlForFile({ docsDir: owned.paths.docsDir, filePath: file, siteBase: new URL(input.native.siteUrl), routeBase: input.native.routeBase, slug: parsed.frontmatter.slug, hasSlug: Object.hasOwn(parsed.frontmatter, 'slug') });
    if (hash(parsed.body) !== member.originalArticleSha256 || canonical !== member.canonicalUrl || nativeLifecycle({ ...parsed.frontmatter, discussionSync: true }) !== 'published') fail('admission cannot alter edited/closed native source or repair an incomplete intent.');
    if (member.ordinal <= admittedCount && parsed.frontmatter.discussionSync === false) {
      if (Object.hasOwn(parsed.frontmatter, 'discussionbridgeResourceId')) fail('existing binding cannot be re-enabled as a new cohort.');
      if ((source.match(/^discussionSync: false\r?$/gmu) ?? []).length !== 1) fail('native opt-in field is ambiguous.');
      changes.push({ file, before: source, after: source.replace(/^discussionSync: false\r?$/mu, 'discussionSync: true') });
    }
  }
  if (changes.length > 100) fail('one qualification cohort may admit at most100 new sources.');
  // This is operator-controlled native test input, never an accepted receipt.
  for (const change of changes) { const prior = await readExistingPublication(change.file); if (!prior || prior.contents !== change.before) fail('native opt-in input changed before write.'); await atomicWrite(change.file, change.after, prior); }
  return { qualification: 'NOT_RUN', newlyAdmitted: changes.length, completeNativeCount: input.targetCount };
  });
}
export async function nativeQualificationOptions(input) {
  input = validateQualificationInputs(input);
  const { paths } = await ownedCorpus(input);
  return { docsDir: paths.docsDir, stateFile: paths.stateFile, siteUrl: input.native.siteUrl, discourseUrl: input.receiver.origin, routeBase: input.native.routeBase,
    controlledCreation: { connectionId: input.receiver.connectionId, secretFile: input.connectionSecretFile, lane: input.receiver.lane } };
}
export function completeRecordPages(pages, expectedCount) {
  if (!Array.isArray(pages) || !pages.length || pages.length > expectedCount + 1 || pages[0].cursor !== null) fail('receiver census must begin at the first page within its tooling budget.');
  const records = [], seenCursors = new Set(), ids = new Set(), external = new Set(), topics = new Set(); let cursor = null;
  for (const page of pages) {
    if (page.cursor !== cursor || cursor !== null && seenCursors.has(cursor)) fail('receiver page chain repeats or skips a cursor.');
    if (cursor !== null) seenCursors.add(cursor); validateCms('RecordPage', page.body);
    for (const record of page.body.items) { for (const [set, id] of [[ids, record.resource_id], [external, record.external_id], [topics, record.topic_id]]) { if (set.has(id)) fail('receiver census repeats a resource/external/topic identity.'); set.add(id); } records.push(record); }
    cursor = page.body.next_cursor;
    if (cursor === null && page !== pages.at(-1)) fail('receiver pages continue beyond the terminal page.');
  }
  if (cursor !== null || records.length !== expectedCount) fail('receiver census is not complete; a partial page set is not success.');
  return records;
}
export async function collectQualificationRecords(input) {
  input = validateQualificationInputs(input);
  const { paths } = await ownedCorpus(input);
  if (!process.env.NODE_EXTRA_CA_CERTS || path.resolve(process.env.NODE_EXTRA_CA_CERTS) !== input.caFile) fail('launch the dedicated process with the explicit scoped CA before any HTTPS request.');
  const client = new CmsClient({ serverUrl: input.receiver.origin, connectionId: input.receiver.connectionId, secretFile: input.connectionSecretFile });
  const connection = await client.connection();
  if (connection.profile !== 'astro' || connection.scope_revision !== input.receiver.scopeRevision || connection.publication_lane !== input.receiver.lane || origin(connection.destination_origin, 'actual receiver destination') !== input.native.siteUrl || !connection.directions.includes('to_discourse')) fail('actual current receiver connection scope/origin/lane differs.');
  const pages = [], seen = new Set(); let cursor;
  do {
    if (pages.length >= input.targetCount + 1 || cursor !== undefined && seen.has(cursor)) fail('receiver inventory exceeded bounded continuation; no partial census retained as success.');
    if (cursor !== undefined) seen.add(cursor);
    const body = await client.records(cursor); pages.push({ cursor: cursor ?? null, body }); cursor = body.next_cursor ?? undefined;
  } while (cursor !== undefined);
  const records = completeRecordPages(pages, input.targetCount), details = [];
  for (const record of records) { const current = await client.record(record.resource_id); if (semanticIdentity(current) !== semanticIdentity(record)) fail('receiver inventory changed before exact detail readback.'); details.push(current); }
  const result = { format: 1, kind: 'actual-sdk-readonly-inventory', observedAt: new Date().toISOString(), origin: input.receiver.origin, connectionId: input.receiver.connectionId, scopeRevision: connection.scope_revision, pages, details,
    qualification: 'NOT_RUN', missing: ['native receiver topic/category/actor census', 'anonymous whole native article/assets', 'browser/build/deploy/lifecycle evidence'] };
  const file = path.join(paths.evidence, `receiver-${randomUUID()}.json`); await writeJson(file, result); return { file, records: records.length, qualification: 'NOT_RUN' };
}

export async function checkQualificationCoverage(input, receiverSnapshotFile, nativeTopicCensusFile, publicSnapshotFile) {
  input = validateQualificationInputs(input);
  const { paths, manifest } = await ownedCorpus(input), state = await readPublicationOperationalState(paths.stateFile);
  if (!state.nativeCensus || state.nativeCensus.docsDir !== paths.docsDir || state.nativeCensus.siteBase !== new URL(input.native.siteUrl).href || state.nativeCensus.routeBase !== input.native.routeBase
    || state.nativeCensus.rootDev !== manifest.docsIdentity.dev || state.nativeCensus.rootIno !== manifest.docsIdentity.ino) fail('actual publisher complete native scope is unavailable/different.');
  const receiver = await json(absolute(receiverSnapshotFile, 'receiver snapshot')), census = await json(absolute(nativeTopicCensusFile, 'native topic census')), publicSnapshot = await json(absolute(publicSnapshotFile, 'public snapshot'));
  if (receiver.kind !== 'actual-sdk-readonly-inventory' || receiver.origin !== input.receiver.origin || receiver.connectionId !== input.receiver.connectionId || receiver.scopeRevision !== input.receiver.scopeRevision) fail('actual receiver snapshot scope is missing.');
  const records = completeRecordPages(receiver.pages, input.targetCount);
  if (!Array.isArray(receiver.details) || semanticIdentity(receiver.details) !== semanticIdentity(records)) fail('receiver details are missing or changed.');
  // Native/admin and public observers supply their own retained observations;
  // offline consistency cannot establish they were actually executed.
  if (census.origin !== input.receiver.origin || census.categoryId !== input.receiver.categoryId || census.actorId !== input.receiver.actorId || census.complete !== true || !Array.isArray(census.topics) || census.topics.length !== input.targetCount) fail('complete native category/topic/actor census is missing.');
  if (publicSnapshot.origin !== input.native.siteUrl || !Array.isArray(publicSnapshot.articles) || publicSnapshot.articles.length !== input.targetCount) fail('whole public native snapshot is missing.');
  const rows = [], used = new Set(), recordIds = new Set(), topicIds = new Set(), publicUrls = new Set();
  for (const member of manifest.members) {
    const file = path.join(paths.docsDir, member.relativePath), source = new TextDecoder('utf-8', { fatal: true }).decode(await bytes(file)), parsed = parseMarkdown(source);
    const original = await bytes(path.join(paths.originals, member.relativePath));
    if (hash(original) !== member.originalFileSha256 || hash(parsed.body) !== member.originalArticleSha256 || nativeLifecycle(parsed.frontmatter) !== 'published') fail('native original/body/lifecycle no longer matches this initial-corpus phase.');
    const expected = stableExternalId(new URL(input.native.siteUrl), paths.docsDir, file), operation = state.operations[expected], to = operation?.to;
    const actualUrl = pageUrlForFile({ docsDir: paths.docsDir, filePath: file, siteBase: new URL(input.native.siteUrl), routeBase: input.native.routeBase, slug: parsed.frontmatter.slug, hasSlug: Object.hasOwn(parsed.frontmatter, 'slug') });
    if (!to || to.pending || operation.nativeRender || to.withdrawal || !to.acceptedRevision || !to.acceptedCaptureId || !to.nativeCapture || !to.nativeSource
      || operation.canonicalUrl !== actualUrl || parsed.frontmatter.discussionbridgeExternalId !== expected || parsed.frontmatter.discussionbridgeResourceId !== operation.resourceId || String(parsed.frontmatter.discourseTopicId) !== operation.topicId
      || to.nativeSource.docsDir !== paths.docsDir || to.nativeSource.relativePath !== member.relativePath || to.scope.connectionId !== input.receiver.connectionId || to.scope.scopeRevision !== input.receiver.scopeRevision || to.scope.serverOrigin !== input.receiver.origin || to.scope.siteOrigin !== input.native.siteUrl || to.scope.lane !== input.receiver.lane) fail('exact accepted native source evidence is pending/missing/out of scope.');
    const prepared = to.articleCaptures?.[to.effectiveEdition?.captureId ?? to.acceptedCaptureId], record = to.effectiveEdition?.record ?? to.acceptedBody?.bridge_record, native = to.nativeCapture;
    assertNativeArticleCapture(prepared); validateSourceCapture(native);
    if (!record || record.external_id !== expected || record.canonical_url !== actualUrl || record.source_revision !== to.acceptedRevision || !native.build || native.file !== file || native.fileSha256 !== hash(source) || prepared.originalSha256 !== member.originalArticleSha256 || prepared.preparedSha256 !== record.source_content_sha256 || prepared.preparedBytes !== record.source_content_bytes || native.revision !== to.acceptedRevision || native.ownership.resourceId !== operation.resourceId || native.ownership.topicId !== operation.topicId) fail('prepared/accepted/native source hashes or IDs do not bind.');
    const nativeFile = path.resolve(native.build.file); if (!inside(paths.root, nativeFile) || sourceHash(new TextDecoder('utf-8', { fatal: true }).decode(await bytes(nativeFile))) !== native.build.sha256) fail('actual native output differs or left the owned run root.');
    inspectSourceArticle(native.build.html, native);
    const received = records.find(item => item.external_id === expected), topic = census.topics.find(item => item.topicId === operation.topicId), observed = publicSnapshot.articles.find(item => item.url === operation.canonicalUrl);
    if (!received || used.has(received.external_id) || received.resource_id !== operation.resourceId || received.topic_id !== operation.topicId || received.canonical_url !== operation.canonicalUrl || received.source_revision !== to.acceptedRevision || received.source_created_at !== record.source_created_at || received.source_updated_at !== record.source_updated_at || received.direction !== 'to_discourse' || received.state !== 'active'
      || !topic || topic.categoryId !== input.receiver.categoryId || topic.actorId !== input.receiver.actorId || !observed || observed.status !== 200 || observed.redirected !== false || observed.credentials !== 'omit') fail('native↔record↔topic↔anonymous source census differs.');
    for (const [set, value] of [[recordIds, received.resource_id], [topicIds, topic.topicId], [publicUrls, observed.url]]) { if (set.has(value)) fail('coverage repeats an observed identity.'); set.add(value); }
    validateCms('Instant', observed.checkedAt);
    const publicFile = absolute(observed.file, 'public HTML evidence'); if (!inside(paths.evidence, publicFile)) fail('public observation must be a retained owned evidence file.');
    const publicBytes = await bytes(publicFile); if (hash(publicBytes) !== observed.sha256 || publicBytes.length !== observed.bytes) fail('retained public observation bytes differ.');
    const publicHtml = new TextDecoder('utf-8', { fatal: true }).decode(publicBytes), inspected = inspectSourceArticle(publicHtml, native);
    if (semanticIdentity(sourceDependencyMarkup(publicHtml)) !== semanticIdentity(native.build.dependencyMarkup)) fail('public native script/style dependency footprint differs.');
    if (!Array.isArray(observed.assets) || observed.assets.length !== native.build.assets.length) fail('actual anonymous generated asset observations are incomplete.');
    for (const expectedAsset of native.build.assets) {
      if (!inside(paths.root, expectedAsset.file)) fail('native asset left its owned generated root.'); const nativeAsset = await bytes(expectedAsset.file);
      const actualAsset = observed.assets.find(item => item.url === expectedAsset.url);
      if (nativeAsset.length !== expectedAsset.bytes || hash(nativeAsset) !== expectedAsset.sha256 || !actualAsset || actualAsset.status !== 200 || actualAsset.redirected !== false || actualAsset.credentials !== 'omit' || actualAsset.bytes !== expectedAsset.bytes || actualAsset.sha256 !== expectedAsset.sha256) fail('anonymous native asset differs from its actual build.');
    }
    used.add(received.external_id); rows.push({ relativePath: member.relativePath, externalId: expected, resourceId: received.resource_id, topicId: received.topic_id, canonicalUrl: received.canonical_url,
      originalArticleSha256: prepared.originalSha256, preparedSourceSha256: prepared.preparedSha256, preparedSourceBytes: prepared.preparedBytes, nativeBuildSha256: native.build.sha256,
      publicHtmlSha256: observed.sha256, nativeArticleSha256: hash(inspected), sourceRevision: to.acceptedRevision });
  }
  if (Object.keys(state.operations).length !== input.targetCount || used.size !== input.targetCount || new Set(census.topics.map(item => item.topicId)).size !== input.targetCount) fail('native/receiver topic census includes unrelated or missing identities.');
  return { format: 1, kind: 'offline-evidence-consistency', count: rows.length, qualification: 'NOT_RUN', rows,
    limits: ['Offline consistency does not prove the observer ran or qualify public/browser/deployment/lifecycle behavior.', 'Lifecycle-edited or withdrawn cohorts need their own exact phase manifest; this is the initial published corpus only.'] };
}
