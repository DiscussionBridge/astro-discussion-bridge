import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = (await fs.readFile(new URL("../src/browser-rich-content.mjs", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gmu, "").replace("export async function", "async function") + "\nglobalThis.renderSelected = renderSelected;";

function fixture(selected = true) {
  const events = new Map();
  const diagrams = [];
  const math = [];
  const replacements = [];
  const root = { querySelectorAll(selector) { return selector.includes("mermaid") ? diagrams : math; } };
  const document = {
    readyState: "loading",
    querySelectorAll(selector) { return selector === "[data-discussionbridge-rich]" ? (selected ? [{ dataset: { root: "article" } }] : []) : [root]; },
    addEventListener(event, callback) { events.set(event, callback); },
    dispatchEvent() {},
    createElement() { return { isConnected: true, replaceWith(original) { replacements.push({ restored: original }); } }; },
  };
  const add = (kind, text) => {
    const collection = kind === "mermaid" ? diagrams : math;
    const original = { isConnected: true, replaceWith(container) { replacements.push({ kind, container }); collection.splice(collection.indexOf(code), 1); } };
    const code = { textContent: text, parentElement: original };
    collection.push(code);
    return code;
  };
  const calls = [];
  const context = vm.createContext({ document, Set, Symbol, CustomEvent: class {}, mermaid: { initialize(config) { calls.push({ initialize: config }); }, async run(options) { calls.push({ diagram: options }); } }, katex: { render(text, container, options) { calls.push({ math: text, options }); } } });
  vm.runInContext(source, context);
  return { context, events, add, calls, replacements };
}

test("optional renderer is inert without an operator marker", async () => {
  const current = fixture(false);
  current.add("mermaid", "graph TD; A-->B");
  await current.context.renderSelected();
  assert.equal(current.calls.length, 0);
  assert.equal(current.replacements.length, 0);
});

test("selected renderer uses text and safe math, then reruns for a later Astro page", async () => {
  const current = fixture();
  current.add("mermaid", '<img onerror="bad()"> graph TD; A-->B');
  current.add("math", "x^2");
  await current.context.renderSelected();
  assert.equal(current.calls[0].initialize.securityLevel, "strict");
  assert.equal(current.calls[0].initialize.htmlLabels, false);
  assert.match(current.replacements[0].container.textContent, /<img onerror=/);
  const math = current.calls.find(call => call.math);
  assert.equal(math.options.trust, false);
  assert.equal(math.options.output, "htmlAndMathml");
  const count = current.calls.length;
  current.add("mermaid", "graph TD; C-->D");
  await current.events.get("astro:page-load")();
  assert.ok(current.calls.length > count);
});

test("failed diagram rendering restores the native source block", async () => {
  const current = fixture();
  current.add("mermaid", "invalid diagram");
  current.context.mermaid.run = async () => { throw new Error("Parse failed"); };
  await current.context.renderSelected();
  assert.ok(current.replacements.some(item => item.restored));
});
