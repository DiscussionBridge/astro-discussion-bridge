import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli && path.isAbsolute(npmCli), 'Use the normal npm script entry');
const scratch = path.join(repo, '.tmp'); await mkdir(scratch, { recursive: true });
const consumer = await mkdtemp(path.join(scratch, 'starlight-heading-origin-'));
const artifactParent = path.join(repo, '.artifacts'); await mkdir(artifactParent, { recursive: true });
const evidence = await mkdtemp(path.join(artifactParent, 'astro-v4-starlight-producer-'));
const fixtures = path.join(repo, 'scripts/fixtures/starlight-heading-origin');
const json = value => JSON.stringify(value, null, 2) + '\n';
async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: consumer, shell: false, windowsHide: true,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' }, stdio: 'inherit', timeout: 300_000 });
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 && signal === null ? resolve() : reject(new Error(`Native producer probe failed: exit ${code}, signal ${signal}`)));
  });
}
await writeFile(path.join(consumer, 'package.json'), json({ name: 'starlight-native-producer-feasibility', version: '0.0.0', private: true, type: 'module',
  dependencies: { astro: '7.3.8', '@astrojs/starlight': '0.42.0', sharp: '0.35.5', 'sanitize-html': '2.18.1' } }));
for (const name of ['user', 'global']) await writeFile(path.join(consumer, `${name}.npmrc`), '# Empty probe-owned npm config.\n');
for (const name of ['producer.mjs', 'render.mjs']) await copyFile(path.join(fixtures, name), path.join(consumer, name));
await mkdir(path.join(consumer, 'src/content/docs'), { recursive: true });
await mkdir(path.join(consumer, 'src/components'), { recursive: true });
await writeFile(path.join(consumer, 'src/content.config.ts'), `import {defineCollection} from 'astro:content'; import {docsLoader} from '@astrojs/starlight/loaders'; import {docsSchema} from '@astrojs/starlight/schema'; export const collections = {docs:defineCollection({loader:docsLoader(),schema:docsSchema()})};\n`);
await writeFile(path.join(consumer, 'src/components/NativeProbe.astro'), `---
import {render} from 'astro:content';
import {experimental_AstroContainer as Container} from 'astro/container';
import path from 'node:path';
import DefaultContent from '@astrojs/starlight/components/MarkdownContent.astro';
import {captureProbeRender} from '../../render.mjs';
const entry=Astro.locals.starlightRoute.entry;
let result;
const relative=typeof entry?.filePath === 'string' ? path.relative(path.resolve('src/content/docs'),path.resolve(entry.filePath)) : undefined;
const eligibleRoutes=new Set(['/','/multiple/','/zero/']);
if (eligibleRoutes.has(Astro.url.pathname) && relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
  const {Content}=await render(entry);
  const container=await Container.create();
  const markedHtml=await container.renderToString(Content,{request:Astro.request});
  result=captureProbeRender({markedHtml,body:entry.body,filePath:path.resolve(entry.filePath)});
}
---
<DefaultContent>{result ? <article data-native-probe-content set:html={result.fullNativeHtml}/> : <slot/>}</DefaultContent>
`);
const markdown = '---\ntitle: Native producer feasibility\n---\n\n## Generated heading\n\nNative article text remains intact.\n\n| Owner | Content |\n| --- | --- |\n| Starlight | Native page |\n';
const source = path.join(consumer, 'src/content/docs/index.md');
await writeFile(source, markdown);
await writeFile(path.join(consumer, 'src/content/docs/multiple.md'), '---\ntitle: Multiple native headings\n---\n\n## First native heading\n\nFirst body.\n\n## Second native heading\n\nSecond body.\n');
await writeFile(path.join(consumer, 'src/content/docs/zero.md'), '---\ntitle: Native article without headings\n---\n\nA complete paragraph-only native article.\n');
console.log(json({ feasibilityOnly: true, consumer, evidence, phase: 'ordinary-install', productDependenciesUnchanged: true }));
await run([npmCli, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=0',
  '--userconfig', path.join(consumer, 'user.npmrc'), '--globalconfig', path.join(consumer, 'global.npmrc')]);
await copyFile(path.join(consumer, 'package-lock.json'), path.join(evidence, 'native-consumer-lock.json'));
for (const phase of ['baseline', 'observed']) await run(['producer.mjs', phase, evidence]);
const baseline = JSON.parse(await readFile(path.join(evidence, 'rendered-baseline.json')));
const observed = JSON.parse(await readFile(path.join(evidence, 'rendered-observed.json')));
assert.equal(observed.fullNativeHtml, baseline.fullNativeHtml, 'Native buttons/markup must remain byte-identical after probe metadata removal');
assert.ok(!observed.portableHtml.includes('<svg'));
assert.ok(observed.portableHtml.includes('Generated heading') && observed.portableHtml.includes('Native article text remains intact'));
const anchors = [...observed.fullNativeHtml.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gu)];
assert.equal(anchors.length, 1, 'Controlled baseline contains exactly the native heading link');
const authoredCopy = anchors[0][0];
await writeFile(source, markdown + `\n<div data-authored-copy>${authoredCopy}</div>\n\n<svg id="authored-drawing" viewBox="0 0 8 8"><path d="M0 0L8 8"/></svg>\n`);
await run(['producer.mjs', 'authored', evidence]);
const authored = JSON.parse(await readFile(path.join(evidence, 'rendered-authored.json')));
assert.equal(authored.boundControls, 1, 'Authored byte-identical controls do not acquire a producer witness');
assert.ok(authored.portableHtml.includes(authoredCopy));
assert.ok(authored.portableHtml.includes('id="authored-drawing"'));
const { associateNativeRender } = await import(pathToFileURL(path.join(consumer, 'render.mjs')).href);
const binding = JSON.parse(await readFile(path.join(evidence, 'bindings-authored.json')));
const input = { markedHtml: authored.markedHtml, body: authored.body, filePath: source, bindings: binding };
assert.throws(() => associateNativeRender({ ...input, bindings: { ...binding, records: [] } }), /unknown marker/);
const markedControl = input.markedHtml.match(/<a\b[^>]*data-native-heading-proof="([^"]+)"[^>]*>[\s\S]*?<\/a>/u);
assert.ok(markedControl);
const beforeClose = input.markedHtml.lastIndexOf('</div>');
assert.throws(() => associateNativeRender({ ...input, markedHtml: input.markedHtml.slice(0, beforeClose) + markedControl[0] + input.markedHtml.slice(beforeClose) }), /duplicated control/);
assert.throws(() => associateNativeRender({ ...input, body: input.body + '\nChanged source.' }), /actual compiler input/);
const attribute = ` data-native-heading-proof="${markedControl[1]}"`;
const moved = input.markedHtml.replace(attribute, '').replace('<div data-authored-copy>' + authoredCopy,
  '<div data-authored-copy>' + authoredCopy.replace('<a ', '<a' + attribute + ' '));
assert.notEqual(moved, input.markedHtml);
assert.throws(() => associateNativeRender({ ...input, markedHtml: moved }), /cannot move to an authored control/);
const renderedFiles = (await import('node:fs/promises')).readdir;
const files = await renderedFiles(evidence);
const other = await Promise.all(files.filter(name => /^rendered-observed-.*\.json$/u.test(name)).map(async name => JSON.parse(await readFile(path.join(evidence, name)))));
const multiple = other.find(value => value.filePath.endsWith('multiple.md'));
const zero = other.find(value => value.filePath.endsWith('zero.md'));
assert.equal(multiple?.boundControls, 2); assert.equal(zero?.boundControls, 0);
assert.ok(zero.portableHtml.includes('A complete paragraph-only native article.'));
await run(['producer.mjs', 'cached', evidence]);
const cached = JSON.parse(await readFile(path.join(evidence, 'rendered-cached.json')));
assert.equal(cached.fullNativeHtml, authored.fullNativeHtml, 'Normal restarted non-force build must retain native markup');
const result = { feasibilityOnly: true, node: process.version, astro: '7.3.8', starlight: '0.42.0', nativeButtonsUnchanged: true,
  actualProducerBound: true, authoredIdenticalControlUnexempt: true, authoredSvgRetained: true,
  missingDuplicateAndChangedBodyArgumentRefused: true, relocatedMarkerRefused: true,
  completeMultiAndZeroControlDocuments: true, normalNonForceRestartedBuild: true,
  localReceiverOrCredentialsUsed: false, publicDeployment: false, productRecipeImplemented: false,
  limitations: 'Native producer/render feasibility only, including a normal restarted non-force native build. No production private authority, sanitizer exemption, publication/source-move/history, installed profile, independent review or release acceptance.' };
await writeFile(path.join(evidence, 'FEASIBILITY.json'), json(result));
console.log(json(result));
