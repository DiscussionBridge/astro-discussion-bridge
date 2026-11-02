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
function meaning(node) {
  if (node.type === 'text') return node.data;
  return [node.name, Object.entries(node.attribs ?? {}).filter(([key]) => key !== marker).sort(), (node.children ?? []).map(meaning)];
}
function expected(node) {
  if (node.type === 'text') return node.value;
  const attributes = Object.entries(node.properties ?? {}).map(([key, value]) => [key, value === true ? '' : Array.isArray(value) ? value.join(' ') : String(value)]).sort();
  return [node.tagName, attributes, (node.children ?? []).map(expected)];
}
function removeRanges(html, ranges) {
  let next = html;
  for (const [start, end] of ranges.sort((left, right) => right[0] - left[0])) next = next.slice(0, start) + next.slice(end);
  return next;
}
export function associateNativeRender({ markedHtml, body, filePath, bindings }) {
  assert.equal(bindings.starlight, '0.42.0');
  const records = new Map(bindings.records.map(record => [record.nonce, record]));
  assert.equal(records.size, bindings.records.length, 'Duplicate producer binding is not authority');
  const document = parser.parseDocument(markedHtml, { withStartIndices: true, withEndIndices: true, lowerCaseAttributeNames: false, lowerCaseTags: false });
  const pending = [document], seen = new Set(), controls = [], attributes = [];
  while (pending.length) {
    const node = pending.pop(), nonce = node.attribs?.[marker];
    if (nonce !== undefined) {
      assert.ok(!seen.has(nonce), 'A duplicated control marker is ambiguous'); seen.add(nonce);
      const record = records.get(nonce);
      assert.ok(record, 'An unknown marker is not a generated-control witness');
      assert.equal(path.resolve(fileURLToPath(record.fileURL)), path.resolve(filePath));
      assert.equal(record.sourceSha256, hash(record.source));
      assert.equal(record.physicalSourceSha256, hash(fs.readFileSync(filePath)));
      assert.equal(record.source.trim(), body.trim(), 'Bind the actual compiler input, not an HTML pattern');
      assert.deepEqual(meaning(node), expected(record.generatedControl));
      assert.equal(node.name, 'a');
      const start = node.startIndex, end = node.endIndex + 1;
      assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && end > start);
      const opening = markedHtml.slice(start, markedHtml.indexOf('>', start) + 1);
      const literal = ` ${marker}="${nonce}"`, offset = opening.indexOf(literal);
      assert.ok(offset >= 0, 'Observe the exact native attribute serialization');
      assert.equal(opening.indexOf(literal, offset + 1), -1);
      controls.push([start, end]); attributes.push([start + offset, start + offset + literal.length]);
    }
    pending.push(...(node.children ?? []));
  }
  if (bindings.phase !== 'baseline') assert.ok(seen.size > 0, 'No producer witness is associated with this actual native render');
  return { markedHtml, fullNativeHtml: removeRanges(markedHtml, attributes), portableHtml: removeRanges(markedHtml, controls), boundControls: seen.size };
}
export function captureProbeRender(input) {
  const evidence = process.env.DB_HEADING_PROBE_EVIDENCE, phase = process.env.DB_HEADING_PROBE_PHASE;
  assert.ok(path.isAbsolute(evidence));
  const bindings = JSON.parse(fs.readFileSync(path.join(evidence, `bindings-${phase}.json`)));
  const result = associateNativeRender({ ...input, bindings });
  fs.writeFileSync(path.join(evidence, `rendered-${phase}.json`), JSON.stringify({ ...result,
    filePath: input.filePath, body: input.body, actualNativeRenderSha256: hash(input.markedHtml) }, null, 2) + '\n');
  return result;
}
