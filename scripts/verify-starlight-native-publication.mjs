import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nativeSource, toFixture } from '../packages/astro-discussion-bridge/test/fixtures/cms-to.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli && path.isAbsolute(npmCli), 'Use the ordinary npm script entry.');
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
async function run(args, cwd, capture = false, expectedFailure = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, shell: false, windowsHide: true,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' }, timeout: 300_000,
      stdio: ['ignore', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'] });
    let output = '';
    if (capture) { child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; }); }
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (signal === null && (expectedFailure ? code !== 0 : code === 0)) resolve(output);
      else reject(new Error(`Packaged native Starlight command: exit ${code}, signal ${signal}.\n${output}`));
    });
  });
}
const receipt = JSON.parse(await run([path.join(repo, 'scripts/save-normal-package.mjs')], repo, true));
const evidence = path.dirname(receipt.archive);
// This standalone qualification intentionally retains its exact owned scratch
// directory and logs instead of running the node:test fixture cleanup callback.
const state = await toFixture({ after() {} }, nativeSource('## Native generated heading\n\nMeaningful native article.\n\n[Authored fragment](#authored)\n\n## Another native heading\n\n| Owner | Result |\n| --- | --- |\n| Starlight | Preserved |'), '53');
state.options.routeBase = '';
const root = state.root;
const fixtures = path.join(repo, 'scripts/fixtures/starlight-native-publication');
await mkdir(path.join(root, 'src/components'), { recursive: true });
await writeFile(path.join(root, 'package.json'), json({ name: 'ordinary-starlight-v4-publication-check', private: true, type: 'module',
  dependencies: { astro: '7.3.8', '@astrojs/starlight': '0.42.0', sharp: '0.35.5', 'astro-discussion-bridge': 'file:' + receipt.archive.replaceAll('\\', '/') } }), { flag: 'wx' });
for (const kind of ['user', 'global']) await writeFile(path.join(root, `${kind}.npmrc`), '# Qualification-owned empty npm configuration.\n', { flag: 'wx' });
console.log(json({ phase: 'ordinary-install', root, evidence, archive: receipt.archive, sourceCredentials: false, publicDeployment: false }));
await run([npmCli, 'install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=0',
  '--userconfig', path.join(root, 'user.npmrc'), '--globalconfig', path.join(root, 'global.npmrc'), '--cache', path.join(repo, '.tmp/normal-consumer-npm-cache')], root);
const { members } = JSON.parse(await readFile(path.join(evidence, 'package-members.json')));
for (const member of members) { const bytes = await readFile(path.join(root, 'node_modules/astro-discussion-bridge', member.path)); assert.equal(bytes.length, member.size); assert.equal(hash(bytes), member.sha256, member.path); }
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    assert.equal(entry.isSymbolicLink(), false);
    const name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(path.join(directory, entry.name), name + '/'));
    else { assert.ok(entry.isFile()); result.push(name); }
  }
  return result;
}
assert.deepEqual((await files(path.join(root, 'node_modules/astro-discussion-bridge'))).sort(), members.map(member => member.path).sort());
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json')));
assert.equal(lock.packages['node_modules/astro-discussion-bridge'].integrity, 'sha512-' + createHash('sha512').update(await readFile(receipt.archive)).digest('base64'));
await writeFile(path.join(evidence, 'starlight-consumer-lock.json'), await readFile(path.join(root, 'package-lock.json')), { flag: 'wx' });
const htmlParser = path.join(root, 'node_modules/astro-discussion-bridge/dist/native-render.js');
assert.ok((await readFile(htmlParser)).length > 0);

const server = createServer(async (request, response) => {
  try {
    assert.match(request.url, /^\/discussion-bridge\/v4\//u);
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const result = await state.options.controlledCreation.fetchImplementation('https://forum.example' + request.url,
      { method: request.method, headers: request.headers, redirect: 'error', body: request.method === 'GET' ? undefined : Buffer.concat(chunks).toString('utf8') });
    response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text());
  } catch (error) { response.writeHead(500, { 'content-type': 'application/json' }); response.end(json({ localTestReceiverError: String(error) })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const options = { ...state.options, controlledCreation: { ...state.options.controlledCreation } }; delete options.controlledCreation.fetchImplementation;
  await writeFile(path.join(root, 'test-options.json'), json({ options, port: server.address().port }), { flag: 'wx' });
  for (const name of ['server.mjs', 'build.mjs', 'NativeArticle.astro']) {
    await writeFile(path.join(root, name.endsWith('.astro') ? 'src/components/' + name : name), await readFile(path.join(fixtures, name)), { flag: 'wx' });
  }
  await writeFile(path.join(root, 'src/content.config.ts'), `import {defineCollection} from 'astro:content'; import {z} from 'astro/zod'; import {docsLoader} from '@astrojs/starlight/loaders'; import {docsSchema} from '@astrojs/starlight/schema'; export const collections={docs:defineCollection({loader:docsLoader(),schema:docsSchema({extend:z.object({}).passthrough()})})};\n`, { flag: 'wx' });
  const execute = async (phase, force = false, failure = false) => {
    const output = await run(['build.mjs', phase, force ? 'force' : 'cached'], root, true, failure);
    await writeFile(path.join(evidence, `starlight-${phase}.log`), output, { flag: 'wx' });
    process.stdout.write(output); return output;
  };
  const operation = async () => Object.values((await state.journal()).operations).find(value => value.topicId === '53' || value.nativeRender?.filePath === state.file);
  const initialLog = await execute('initial', true);
  assert.match(initialLog, /"actualProductOriginNegatives":6/u);
  assert.equal(state.state.creations, 1);
  assert.ok(state.received.length >= 1, 'Native census/complete-render confirmation share one creation, not necessarily one request');
  const initialRequests = state.received.length;
  const initial = await operation(), before = structuredClone(initial.to), record = structuredClone(state.state.record);
  const readPage = () => readFile(path.join(root, 'dist/source/index.html'), 'utf8');
  const firstHtml = await readPage();
  assert.ok(firstHtml.includes('sl-anchor-link') && firstHtml.includes('<svg'));
  assert.doesNotMatch(firstHtml, /data-discussionbridge-native-(?:document|heading)|synthetic-secret|test-options\.json/);
  const firstCapture = initial.to.articleCaptures[initial.to.acceptedCaptureId];
  assert.equal(firstCapture.nativePresentation.controls.length, 2);
  assert.ok(firstCapture.renderedHtml.includes('<svg')); assert.ok(!firstCapture.preparedHtml.includes('<svg'));
  assert.ok(firstCapture.preparedHtml.includes('Meaningful native article.') && firstCapture.preparedHtml.includes('<table'));
  await execute('unchanged-restarted');
  assert.equal(state.state.creations, 1); assert.equal(state.state.record.source_revision, record.source_revision);
  const currentSource = await readFile(state.file, 'utf8');
  await writeFile(state.file, currentSource + '\nNative update after publication.\n');
  await execute('updated', true);
  assert.ok((await readPage()).includes('Native update after publication.'));
  for (const key of ['resource_id', 'topic_id', 'external_id', 'canonical_url']) assert.equal(state.state.record[key], record[key]);
  assert.notEqual(state.state.record.source_revision, record.source_revision);
  const updated = await operation();
  for (const [id, value] of Object.entries(before.receipts)) assert.deepEqual(updated.to.receipts[id], value);
  for (const [id, value] of Object.entries(before.articleCaptures)) assert.deepEqual(updated.to.articleCaptures[id], value);
  await execute('updated-unchanged-restarted');
  assert.equal(state.state.creations, 1);
  await execute('settled-cached-restarted');
  for (const file of (await files(path.join(root, 'dist'))).filter(name => /\.(?:html|js|mjs)$/u.test(name))) {
    assert.doesNotMatch(await readFile(path.join(root, 'dist', file), 'utf8'), /data-discussionbridge-native-(?:heading|document)|synthetic-secret|test-options\.json|cms-runtime\.mjs|cms-schema\.json|X-DiscussionBridge-Secret|node:crypto/iu, file);
  }
  const beforeZero = await operation();
  const nonHeading = (await readFile(state.file, 'utf8')).replace(/^## [^\r\n]+\r?\n/gmu, '');
  await writeFile(state.file, nonHeading);
  await execute('zero-heading-update', true);
  const zero = await operation();
  assert.equal(zero.to.nativeCapture.nativePresentation.controls.length, 0,
    'Current FULL rendering has its own evidence; a historical same-byte portable capture is not retagged');
  assert.ok((await readPage()).includes('Meaningful native article.'));
  for (const [id, value] of Object.entries(beforeZero.to.articleCaptures)) assert.deepEqual(zero.to.articleCaptures[id], value);
  const full = (await operation()).to.nativeCapture;
  const receiverCalls = state.received.length;
  const sourceBeforeSvg = await readFile(state.file, 'utf8');
  await writeFile(state.file, sourceBeforeSvg + '\n<svg id="authored-drawing"><path d="M0 0L8 8"/></svg>\n');
  const refused = await execute('authored-svg-refused', true, true);
  assert.match(refused, /native svg drawing/u); assert.equal(state.received.length, receiverCalls, 'Authored SVG may not be silently discarded or sent');
  assert.equal(state.state.creations, 1);
  const result = { node: process.version, archiveSha256: receipt.sha256, packageMembersMatched: members.length,
    nativeVersions: { astro: '7.3.8', starlight: '0.42.0' }, ordinaryInstalledPackage: true, fixtureAliases: false, rootOverrides: false,
    actualFullSourceWriter: true, initialPublication: true, restartedCachedRetry: true, sourceUpdateSameIdentity: true,
    historicalReceiptsAndCapturesRetained: true, nativeButtonsPreserved: true, authoredSvgRefused: true,
    actualOriginNegatives: 6, multipleAndZeroNativeControls: true, publicOutputScan: true, installedIntegrityMatched: true,
    realReceiverOrCredentials: false, publicDeployment: false,
    limits: 'Ordinary package/native compiler/FULL source writer against local simulated R7 receiver. Not a live profile, browser, deployed URL move or release gate.',
    initialRequests, receivedRequests: state.received.length, creations: state.state.creations, root, sourceNativePresent: Boolean(full) };
  await writeFile(path.join(evidence, 'starlight-publication-results.json'), json(result), { flag: 'wx' });
  console.log(json(result));
} finally { await new Promise(resolve => server.close(resolve)); }
