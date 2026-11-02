import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { assertNativeRenderSource, editNativeRenderedArticle, fullNativeHtml, nativePresentation, nativeRenderHash, issueNativeRenderedArticle, portableNativeHtml, validateNativePresentation } from '../dist/native-render.js';
import { captureNativeArticle, nativeCaptureId } from '../dist/native-preparation.js';
import { prepareNativeRenderedArticle } from '../dist/native-source.js';
import { resolveNativeSourceTargets } from '../dist/to-source-profile.js';

const original = '## Article\n\nNative author content.';
const file = path.resolve('synthetic-native-source.md');
const button = '<a class="sl-anchor-link" href="#heading"><span aria-hidden="true"><svg viewBox="0 0 8 8"><path d="M0 0L8 8"></path></svg></span><span>Section titled Article</span></a>';
const source = () => captureNativeArticle(original, 'https://astro.example/old/', 'markdown');
function issued(html, controls = [button]) {
  return issueNativeRenderedArticle(html, { nativeFile: file, originalMarkdownSha256: nativeRenderHash(original),
    originalKey: '1'.repeat(64), producerKey: '2'.repeat(64), artifactSha256: '3'.repeat(64),
    controls: controls.map(value => ({ start: html.indexOf(value), end: html.indexOf(value) + value.length, sha256: nativeRenderHash(value) })).sort((a, b) => a.start - b.start) });
}

test('a caller-shaped object cannot grant a native presentation exemption', () => {
  assert.throws(() => fullNativeHtml({ kind: 'native-rendered-article', html: button, controls: [button] }), /not issued/);
  assert.throws(() => prepareNativeRenderedArticle(source(), '<h2>Article</h2>' + button), /native svg drawing/);
});

test('private native projection keeps complete native markup and preserves the unchanged cleaner', () => {
  const html = '<div><h2 id="heading">Article</h2>' + button + '</div><p>Native author content.</p>';
  const render = issued(html), capture = prepareNativeRenderedArticle(source(), render);
  assert.equal(fullNativeHtml(render), html); assert.equal(capture.renderedHtml, html);
  assert.ok(!capture.preparedHtml.includes('<svg')); assert.ok(!capture.preparedHtml.includes('Section titled Article'));
  assert.ok(capture.preparedHtml.includes('Article') && capture.preparedHtml.includes('Native author content.'));
  assert.equal(capture.nativePresentation.artifactSha256, '3'.repeat(64));
  assertNativeRenderSource(render, file, original);
  assert.throws(() => assertNativeRenderSource(render, file + '-other', original), /another physical article/);
  assert.throws(() => assertNativeRenderSource(render, file, original + ' changed'), /another physical article/);
});

test('authored SVG outside the witnessed UI remains refused with complete original evidence', () => {
  const html = '<h2>Article</h2>' + button + '<svg id="authored-drawing"><path d="M1 1L2 2"></path></svg>';
  const render = issued(html);
  assert.ok(portableNativeHtml(render).includes('authored-drawing'));
  assert.throws(() => prepareNativeRenderedArticle(source(), render), error => {
    assert.match(error.message, /native svg drawing/); assert.equal(error.capture.original, original);
    assert.equal(error.capture.renderedHtml, html); assert.equal(error.capture.preparedHtml, undefined); return true;
  });
});

test('only witnessed native button fragments stay local while authored targets retain the birth base', () => {
  const html = '<p><a href="#authored">Authored link</a></p><h2 id="heading">Article</h2>' + button;
  const render = issued(html), moved = resolveNativeSourceTargets(render, 'https://astro.example/old/');
  const actual = fullNativeHtml(moved);
  assert.ok(actual.includes('href="https://astro.example/old/#authored"')); assert.ok(actual.includes(button));
  assert.equal(nativePresentation(moved).artifactSha256, nativePresentation(render).artifactSha256);
  assert.notEqual(nativePresentation(moved).controls[0].start, nativePresentation(render).controls[0].start);
  validateNativePresentation(nativePresentation(moved), actual);
  const ordinary = resolveNativeSourceTargets(button, 'https://astro.example/old/');
  assert.ok(ordinary.includes('href="https://astro.example/old/#heading"'), 'An HTML class never authorizes a native UI exception');
});

test('render evidence cannot silently change a control range or rewrite historical preparation identity', () => {
  const html = '<h2 id="heading">Article</h2>' + button + '<p>Native author content.</p>';
  const capture = prepareNativeRenderedArticle(source(), issued(html));
  const saved = structuredClone(capture), meta = structuredClone(capture.nativePresentation);
  meta.controls[0].end--;
  assert.throws(() => validateNativePresentation(meta, html), /exact rendered anchor/);
  const later = prepareNativeRenderedArticle(source(), issued(html.replace('class="sl-anchor-link"', 'class="sl-anchor-link later"'), [button.replace('class="sl-anchor-link"', 'class="sl-anchor-link later"')]));
  assert.equal(nativeCaptureId(later), nativeCaptureId(capture), 'Portable/original identity remains separate from native rendering evidence');
  assert.notEqual(later.nativePresentation.fullHtmlSha256, capture.nativePresentation.fullHtmlSha256);
  assert.deepEqual(capture, saved, 'A later rendering never mutates the retained historical capture');
});

test('reference edits cannot replace native UI, overlap, or insert at an ambiguous boundary', () => {
  const html = '<h2 id="heading">Article</h2>' + button;
  const render = issued(html), start = html.indexOf(button);
  assert.throws(() => editNativeRenderedArticle(render, [{ start, end: start + 1, value: '' }]), /overlap/);
  assert.throws(() => editNativeRenderedArticle(render, [{ start, end: start, value: 'inserted' }]), /overlap/);
  assert.throws(() => editNativeRenderedArticle(render, [{ start: 0, end: 4, value: '' }, { start: 3, end: 6, value: '' }]), /overlap/);
  assert.equal(fullNativeHtml(render), html);
});
