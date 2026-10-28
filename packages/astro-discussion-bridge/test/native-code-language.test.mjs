import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { captureNativeArticle, nativeCodeLanguagePreparation, NativePreparationLimitation } from "../dist/native-preparation.js";
import { nativeContentIdentity, prepareNativeRenderedArticle } from "../dist/native-source.js";

const sanitizerRequire = createRequire(createRequire(import.meta.url).resolve("sanitize-html"));
const { parseDocument } = sanitizerRequire("htmlparser2");
const captured = JSON.parse(await readFile(new URL("./fixtures/native-shiki-code-language.json", import.meta.url), "utf8"));
const browserSource = (await readFile(new URL("../src/browser-rich-content.mjs", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gmu, "").replace("export async function", "async function") + "\nglobalThis.renderSelected = renderSelected;";
const text = node => node.type === "text" ? node.data : (node.children ?? []).map(text).join("");
function codeBlocks(html) {
  const result = [];
  function visit(node, parent) {
    if (node.name === "code" && parent?.name === "pre") result.push({ node, pre: parent, text: text(node) });
    for (const child of node.children ?? []) visit(child, node);
  }
  visit(parseDocument(html)); return result;
}
function matches(block, selector) {
  const classes = new Set((block.node.attribs.class ?? "").split(/\s+/u));
  return [...selector.matchAll(/code\.([\w-]+)/gu)].some(match => classes.has(match[1]));
}
const capture = () => captureNativeArticle(captured.originalMarkdown, captured.sourceArticleUrl, "markdown");

test("captured native Shiki languages survive the real complete preparation boundary", () => {
  const original = capture(), before = structuredClone(original);
  const prepared = prepareNativeRenderedArticle(original, captured.renderedHtml);
  const raw = codeBlocks(captured.renderedHtml), actual = codeBlocks(prepared.preparedHtml);
  assert.equal(raw[0].pre.attribs["data-language"], "mermaid");
  assert.equal(raw[1].pre.attribs["data-language"], "json");
  assert.equal(codeBlocks(captured.historicalPreparedHtml).filter(block => /\blanguage-/u.test(block.node.attribs.class ?? "")).length, 0, "saved prior result demonstrates actual identity loss");
  assert.equal(actual[0].node.attribs.class, "language-mermaid");
  assert.equal(actual[1].node.attribs.class, "language-json");
  assert.deepEqual(actual.map(block => block.text), raw.map(block => block.text), "complete decoded native code text is unchanged, including its actual final-newline state");
  assert.match(prepared.preparedHtml, /<pre class="astro-code github-dark"><code class="language-mermaid"><span><span>/u);
  assert.equal(prepared.renderedHtml, captured.renderedHtml);
  assert.equal(prepared.original, captured.originalMarkdown); assert.deepEqual(original, before);
  assert.match(prepared.preparedHtml, /Fixture link/u); assert.match(prepared.preparedHtml, /Inline mathematics/u);
  const identity = nativeContentIdentity(prepared.preparedHtml);
  assert.equal(prepared.preparedBytes, identity.bytes); assert.equal(prepared.preparedSha256, identity.sha256);
  assert.equal(identity.sha256, createHash("sha256").update(prepared.preparedHtml).digest("hex"));
  assert.equal(identity.bytes, Buffer.byteLength(prepared.preparedHtml));
});

test("actual rich runtime selects the preserved native Mermaid code and receives its exact decoded text", async () => {
  const prepared = prepareNativeRenderedArticle(capture(), captured.renderedHtml);
  const blocks = codeBlocks(prepared.preparedHtml), calls = [], replacements = [];
  const root = { querySelectorAll(selector) { return blocks.filter(block => matches(block, selector)).map(block => ({
    textContent: block.text,
    parentElement: { isConnected: true, replaceWith(container) { replacements.push(container); } },
  })); } };
  const document = {
    readyState: "loading",
    querySelectorAll(selector) { return selector === "[data-discussionbridge-rich]" ? [{ dataset: { root: "article" } }] : [root]; },
    addEventListener() {}, dispatchEvent() { throw new Error("Unexpected rich renderer failure"); },
    createElement() { return { isConnected: true }; },
  };
  const context = vm.createContext({ document, Set, Symbol, CustomEvent: class {},
    mermaid: { initialize(options) { calls.push({ initialize: options }); }, async run(options) { calls.push({ source: options.nodes[0].textContent }); } },
    katex: { render() { throw new Error("No math-language block exists in this captured fixture"); } },
  });
  vm.runInContext(browserSource, context); await context.renderSelected();
  assert.equal(calls.length, 2); assert.equal(calls[0].initialize.securityLevel, "strict");
  assert.equal(calls[1].source, codeBlocks(captured.renderedHtml)[0].text);
  assert.equal(replacements.length, 1); assert.equal(replacements[0].className, "mermaid discussionbridge-rich-diagram");
  // This is the actual runtime's selector/API path with a deterministic renderer
  // seam. It does not claim native browser/SVG/public receiver qualification.
});

test("native code metadata is explicit, scoped and independent of code contents", () => {
  for (const [language, content] of [["json", "flowchart LR; A-->B"], ["math", "x^2"], ["custom-native-language", "ordinary code"]]) {
    const html = `<pre data-language="${language}" class="astro-code"><code><span>${content}</span></code></pre>`;
    const prepared = prepareNativeRenderedArticle(capture(), html);
    assert.equal(codeBlocks(prepared.preparedHtml)[0].node.attribs.class, `language-${language}`);
    assert.equal(codeBlocks(prepared.preparedHtml)[0].text, codeBlocks(html)[0].text);
  }
  const generic = prepareNativeRenderedArticle(capture(), '<pre><code>flowchart LR; A--&gt;B</code></pre>');
  assert.equal(codeBlocks(generic.preparedHtml)[0].node.attribs.class, undefined, "no diagram identity is inferred from code contents");
  const explicit = prepareNativeRenderedArticle(capture(), '<pre data-language="mermaid"><code class="sample lang-mermaid">graph TD; A--&gt;B</code></pre>');
  assert.equal(codeBlocks(explicit.preparedHtml)[0].node.attribs.class, "sample lang-mermaid", "existing compatible native marker is retained");
});

test("actual contradictory or unrepresentable native code identity is a precise limitation", () => {
  for (const html of ['<pre data-language="mermaid"><code class="language-json">graph TD; A--&gt;B</code></pre>', '<pre data-language="two languages"><code>code</code></pre>']) {
    const original = capture(), before = structuredClone(original);
    assert.throws(() => prepareNativeRenderedArticle(original, html), error => error instanceof NativePreparationLimitation && error.capture.original === original.original && error.capture.renderedHtml === html);
    assert.deepEqual(original, before);
  }
});

test("native language retention checks both identity and complete decoded code text", () => {
  const html = '<pre data-language="mermaid"><code>graph TD; A--&gt;B</code></pre>';
  const retention = nativeCodeLanguagePreparation(html);
  assert.throws(() => retention.assertRetained('<pre><code>graph TD; A--&gt;B</code></pre>'), NativePreparationLimitation);
  assert.throws(() => retention.assertRetained('<pre><code class="language-mermaid">graph TD; A--&gt;C</code></pre>'), NativePreparationLimitation);
  assert.doesNotThrow(() => retention.assertRetained('<pre><code class="language-mermaid">graph TD; A--&gt;B</code></pre>'));
});
