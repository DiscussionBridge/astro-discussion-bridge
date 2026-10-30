import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { chromium } from "playwright-core";

const js = fs.readFileSync(new URL("../src/assets/discussionbridge-rich-content.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/assets/discussionbridge-rich-content.css", import.meta.url), "utf8");
test("actual Astro compiled rich assets preserve strict diagrams, math and failed source in Chrome", async () => {
  const executablePath = process.env.DISCUSSIONBRIDGE_BROWSER_EXECUTABLE;
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : { channel: "chrome" }) });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" }), requests = [];
    await context.route("**/*", route => { requests.push(route.request().url()); return route.abort(); });
    const page = await context.newPage();
    await page.setContent("<!doctype html><html><head><meta charset='utf-8'></head><body><div data-discussionbridge-rich data-root='article'></div><article></article></body></html>");
    await page.addStyleTag({ content: css });
    await page.evaluate(() => {
      window.__bridgeXss = 0;
      const add = (kind, value) => { const pre = document.createElement("pre"), code = document.createElement("code"); code.className = `language-${kind}`; code.textContent = value; pre.append(code); document.querySelector("article").append(pre); };
      add("mermaid", "flowchart LR\n A[Source] --> B[Destination]");
      add("mermaid", 'flowchart TD\n A["<img src=x onerror=window.__bridgeXss=1>"] --> B[Safe]');
      add("mermaid", 'flowchart LR\n A["$$x^2$$"] --> B[Done]');
      add("math", "\\int_0^1 x^2\\,dx=\\frac{1}{3}");
      add("math", "\\href{javascript:window.__bridgeXss=1}{unsafe}");
      add("math", "\\notARealMathCommand{");
    });
    await page.addScriptTag({ content: js });
    await page.waitForFunction(() => document.querySelectorAll(".discussionbridge-rich-diagram svg").length === 3 && document.querySelectorAll(".discussionbridge-rich-math .katex").length >= 2, undefined, { timeout: 20000 });
    const actual = await page.evaluate(() => ({ diagrams: document.querySelectorAll(".discussionbridge-rich-diagram svg").length, mathml: document.querySelectorAll(".discussionbridge-rich-math .katex-mathml").length, xss: window.__bridgeXss, active: document.querySelectorAll("article script,article [onerror],article [onclick],article a[href^='javascript:']").length, source: [...document.querySelectorAll("pre code")].map(code => code.textContent), styles: [...document.querySelectorAll("head style")].map(node => node.textContent).join("\n") }));
    assert.equal(actual.diagrams, 3); assert.equal(actual.mathml, 2); assert.equal(actual.xss, 0); assert.equal(actual.active, 0); assert.ok(actual.source.includes("\\notARealMathCommand{")); assert.match(actual.styles, /data:font\//); assert.deepEqual(requests, []);
    console.log(JSON.stringify({ browser: browser.version(), diagrams: actual.diagrams, mathml: actual.mathml, unsafeExecution: actual.xss, networkRequests: requests.length, failedSourcePreserved: true }));
  } finally { await browser.close(); }
});
