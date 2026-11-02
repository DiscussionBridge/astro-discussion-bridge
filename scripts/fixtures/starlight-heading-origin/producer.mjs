// Credential-free native feasibility probe. This is not a product recipe.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'astro';
import starlight from '@astrojs/starlight';

const phase = process.argv[2], evidence = process.argv[3], root = process.cwd();
assert.ok(['baseline', 'observed', 'authored'].includes(phase));
assert.ok(path.isAbsolute(evidence));
process.env.DB_HEADING_PROBE_PHASE = phase;
process.env.DB_HEADING_PROBE_EVIDENCE = evidence;
const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = name => JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json')));
assert.equal(manifest('astro').version, '7.3.8');
assert.equal(manifest('@astrojs/starlight').version, '0.42.0');
const native = starlight({ title: 'Native producer feasibility', pagefind: false, expressiveCode: false,
  sidebar: [], components: { MarkdownContent: './src/components/NativeProbe.astro' } });
const setup = native.hooks['astro:config:setup'];
const bindings = { feasibilityOnly: true, phase, node: process.version, astro: '7.3.8', starlight: '0.42.0',
  publicEntrySha256: hash(fs.readFileSync(fileURLToPath(import.meta.resolve('@astrojs/starlight')))),
  setupSha256: hash(String(setup)), nativeFactoryCount: 0, records: [] };
const proofFile = path.join(evidence, `bindings-${phase}.json`);
const save = () => fs.writeFileSync(proofFile, JSON.stringify(bindings, null, 2) + '\n');
save();
if (phase !== 'baseline') native.hooks['astro:config:setup'] = async function (context) {
  const processor = context.config.markdown.processor;
  assert.ok(Array.isArray(processor.options?.hastPlugins), 'Actual public processor must expose its native plugin list');
  const before = [...processor.options.hastPlugins];
  await setup.call(this, context);
  assert.equal(context.config.markdown.processor, processor, 'Do not substitute another native renderer');
  const added = processor.options.hastPlugins.filter(value => !before.includes(value));
  assert.equal(added.length, 1, 'Bind exactly the factory added by the actual Starlight setup operation');
  const factory = added[0];
  assert.equal(typeof factory, 'function');
  bindings.nativeFactoryCount = added.length;
  bindings.processor = processor.name;
  bindings.factorySha256 = hash(String(factory));
  function observe(value, input) {
    if (Array.isArray(value)) return value.map(member => observe(member, input));
    if (typeof value === 'function') return context => observe(value(context), context);
    if (!value?.element || typeof value.element.visit !== 'function') return value;
    const visit = value.element.visit;
    return { ...value, element: { ...value.element, visit(node, context) {
      const originalHeading = /^h[1-6]$/u.test(node.tagName ?? '') ? JSON.stringify(node) : undefined;
      const result = visit.call(this, node, context);
      if (!originalHeading || result === undefined || result === null || result === node) return result;
      assert.equal(result.tagName, 'div');
      assert.equal(result.children?.length, 2);
      assert.equal(result.children[0], node, 'Only the actual producer return proves the original heading identity');
      assert.equal(JSON.stringify(node), originalHeading, 'Do not edit authored heading descendants');
      const control = result.children[1];
      assert.equal(control.tagName, 'a');
      assert.equal(control.properties.href, '#' + node.properties.id);
      assert.ok(!Object.hasOwn(control.properties, 'data-native-heading-proof'));
      assert.ok(input.fileURL instanceof URL);
      assert.equal(typeof input.source, 'string');
      const nonce = 'db-heading-' + randomUUID();
      const record = { nonce, fileURL: input.fileURL.href, sourceFormat: input.sourceFormat,
        source: input.source, sourceSha256: hash(input.source),
        physicalSourceSha256: hash(fs.readFileSync(fileURLToPath(input.fileURL))),
        headingId: node.properties.id, originalHeadingUnchanged: true,
        generatedControl: structuredClone(control) };
      bindings.records.push(record);
      // Probe-only metadata goes on the newly constructed control, never the
      // original heading. The actual Content render binds/removes this metadata.
      control.properties['data-native-heading-proof'] = nonce;
      save();
      return result;
    } } };
  }
  processor.options.hastPlugins = processor.options.hastPlugins.map(value => value === factory
    ? input => observe(factory(input), input) : value);
  save();
};
await build({ root: pathToFileURL(root + path.sep), configFile: false, site: 'https://starlight-probe.invalid',
  output: 'static', trailingSlash: 'always', force: true, logLevel: 'warn', integrations: [native] });
save();
const rendered = JSON.parse(fs.readFileSync(path.join(evidence, `rendered-${phase}.json`)));
assert.ok(rendered.fullNativeHtml.includes('sl-anchor-link'));
if (phase !== 'baseline') {
  assert.ok(bindings.records.length >= 1);
  assert.equal(rendered.boundControls, 1, 'Exactly the one generated Markdown heading control is bound');
}
fs.copyFileSync(path.join(root, 'dist/index.html'), path.join(evidence, `page-${phase}.html`));
console.log(JSON.stringify({ phase, nativeFactoryCount: bindings.nativeFactoryCount, actualProducerRecords: bindings.records.length,
  boundControls: rendered.boundControls, fullNativeSha256: hash(rendered.fullNativeHtml), portableSha256: hash(rendered.portableHtml) }));
