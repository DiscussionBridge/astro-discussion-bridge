// Probe-only association of actual producer witnesses with actual Content HTML.
// It neither sanitizes/adopts content nor authorizes any publication.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const parser = createRequire(createRequire(import.meta.url).resolve('sanitize-html'))('htmlparser2');
const hash = value => createHash('sha256').update(value).digest('hex');
const marker = 'data-native-heading-proof';
const documentMarker = 'data-native-document-proof';
function meaning(node) {
  if (node.type === 'text') return node.data;
  return [node.name, Object.entries(node.attribs ?? {}).filter(([key]) => key !== marker && key !== documentMarker).sort(), (node.children ?? []).map(meaning)];
}
function expected(node) {
  if (node.type === 'text') return node.value;
  const attributes = Object.entries(node.properties ?? {}).map(([key, value]) => [key, value === true ? '' : Array.isArray(value) ? value.join(' ') : String(value)]).sort();
  return [node.tagName, attributes, (node.children ?? []).map(expected)];
}
function removeRanges(html, ranges) {
  let next = html;
  let boundary = html.length;
  for (const [start, end] of ranges.sort((left, right) => right[0] - left[0])) {
    assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start && end <= boundary, 'Byte edits must be disjoint and bounded');
    next = next.slice(0, start) + next.slice(end); boundary = start;
  }
  return next;
}
function openingEnd(html, start) {
  let quote = '';
  for (let index = start; index < html.length; index++) {
    const value = html[index];
    if (quote) { if (value === quote) quote = ''; }
    else if (value === '"' || value === "'") quote = value;
    else if (value === '>') return index + 1;
  }
  throw new Error('Native opening tag is incomplete');
}
export function associateNativeRender({ markedHtml, body, filePath, bindings }) {
  assert.equal(bindings.starlight, '0.42.0');
  const records = new Map(bindings.records.map(record => [record.nonce, record]));
  assert.equal(records.size, bindings.records.length, 'Duplicate producer binding is not authority');
  const document = parser.parseDocument(markedHtml, { withStartIndices: true, withEndIndices: true, lowerCaseAttributeNames: false, lowerCaseTags: false });
  const pending = [document], nodes = [], seen = new Set(), controls = [], attributes = [];
  while (pending.length) { const node = pending.pop(); nodes.push(node); pending.push(...(node.children ?? [])); }
  const allMarkers = nodes.filter(node => node.attribs?.[marker] !== undefined).map(node => node.attribs[marker]);
  assert.equal(new Set(allMarkers).size, allMarkers.length, 'A duplicated control marker is ambiguous');
  const documents = nodes.filter(node => node.attribs?.[documentMarker] !== undefined);
  let selected;
  const unwrap = [];
  if (bindings.phase !== 'baseline') {
    assert.equal(documents.length, 1, 'Exactly one actual producer document wrapper is required');
    const owner = documents[0];
    selected = bindings.documents.find(value => value.nonce === owner.attribs[documentMarker]);
    assert.ok(selected?.complete, 'Actual producer document completion is required');
    assert.equal(path.resolve(fileURLToPath(selected.fileURL)), path.resolve(filePath));
    assert.equal(selected.sourceSha256, hash(selected.source));
    assert.equal(selected.source.trim(), body.trim(), 'Bind the actual compiler input, not an HTML pattern');
    assert.equal(selected.physicalSourceSha256, hash(fs.readFileSync(filePath)));
    const open = openingEnd(markedHtml, owner.startIndex), close = markedHtml.lastIndexOf('</', owner.endIndex);
    assert.ok(close >= open && markedHtml.slice(close, owner.endIndex + 1) === '</div>');
    unwrap.push([owner.startIndex, open], [close, owner.endIndex + 1]);
    assert.equal(new Set(selected.controls).size, selected.controls.length);
  }
  for (const node of nodes) {
    const nonce = node.attribs?.[marker];
    if (nonce !== undefined) {
      assert.ok(!seen.has(nonce), 'A duplicated control marker is ambiguous'); seen.add(nonce);
      const record = records.get(nonce);
      assert.ok(record, 'An unknown marker is not a generated-control witness');
      assert.equal(record.documentNonce, selected?.nonce, 'A control cannot cross document ownership');
      assert.equal(path.resolve(fileURLToPath(record.fileURL)), path.resolve(filePath));
      assert.equal(record.sourceSha256, hash(record.source));
      assert.equal(record.physicalSourceSha256, hash(fs.readFileSync(filePath)));
      assert.equal(record.source.trim(), body.trim(), 'Bind the actual compiler input, not an HTML pattern');
      assert.deepEqual(meaning(node), expected(record.generatedControl));
      assert.equal(node.name, 'a');
      const expectedParent = JSON.stringify(expected(record.generatedWrapper));
      assert.equal(JSON.stringify(meaning(node.parent)), expectedParent, 'A marker cannot move to an authored control');
      assert.equal(nodes.filter(value => value.name === node.parent.name && JSON.stringify(meaning(value)) === expectedParent).length, 1, 'Ambiguous heading context cannot grant an exemption');
      const start = node.startIndex, end = node.endIndex + 1;
      assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && end > start);
      const opening = markedHtml.slice(start, openingEnd(markedHtml, start));
      const literal = ` ${marker}="${nonce}"`, offset = opening.indexOf(literal);
      assert.ok(offset >= 0, 'Observe the exact native attribute serialization');
      assert.equal(opening.indexOf(literal, offset + 1), -1);
      controls.push([start, end]); attributes.push([start + offset, start + offset + literal.length]);
    }
  }
  if (selected) assert.deepEqual([...seen].sort(), [...selected.controls].sort(), 'Every expected control must be associated exactly once');
  return { markedHtml, fullNativeHtml: removeRanges(markedHtml, [...unwrap, ...attributes]), portableHtml: removeRanges(markedHtml, [...unwrap, ...controls]), boundControls: seen.size };
}
export function captureProbeRender(input) {
  const evidence = process.env.DB_HEADING_PROBE_EVIDENCE, phase = process.env.DB_HEADING_PROBE_PHASE;
  assert.ok(path.isAbsolute(evidence));
  const header = JSON.parse(fs.readFileSync(path.join(evidence, `bindings-${phase}.json`)));
  const registry = JSON.parse(fs.readFileSync(path.join(evidence, 'native-producer-registry.json')));
  const bindings = { ...header, records: registry.records, documents: registry.documents };
  const result = associateNativeRender({ ...input, bindings });
  const file = path.join(evidence, `rendered-${phase}${path.basename(input.filePath) === 'index.md' && !input.filePath.includes(`${path.sep}fr${path.sep}`) ? '' : '-' + hash(input.filePath)}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...result,
    filePath: input.filePath, body: input.body, actualNativeRenderSha256: hash(input.markedHtml) }, null, 2) + '\n');
  return result;
}
