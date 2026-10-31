import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import integration from "../dist/index.js";
import { parsePublicDiscourseTopicUrl } from "../dist/web-url.js";
import { refreshSimpleComments } from "../dist/simple-live.js";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";
import { nativePackageAlias } from "./helpers/package-alias.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const installed = createRequire(new URL("../package.json", import.meta.url));
const { build } = await import(pathToFileURL(installed.resolve("astro")).href);
const runtimeRoot = path.dirname(path.dirname(installed.resolve("astro/package.json")));
const topicIds = ["53", "9007199254740991", "9007199254740992", "9007199254740993", "9223372036854775807"];
const forum = "https://forum.example";

async function render(t, pages, comments = {}) {
  const parent = path.join(packageRoot, ".tmp"); await mkdir(parent, { recursive: true });
  const root = await ownedTempFixture(t, "discussionbridge-mode-regression-", parent);
  await mkdir(path.join(root, "src/pages"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "owned-mode-regression", type: "module", private: true }));
  for (const [name, props] of Object.entries(pages)) {
    await writeFile(path.join(root, "src/pages", `${name}.astro`), `---\nimport Discussion from ${JSON.stringify(path.join(packageRoot, "src/components/Discussion.astro").replaceAll("\\", "/"))};\nconst props = ${JSON.stringify(props)};\n---\n<html><body><header>Consumer header</header><Discussion {...props}/><footer>Consumer footer</footer></body></html>`);
  }
  await build({ root: pathToFileURL(root + path.sep), configFile: false, site: "https://site.example", logLevel: "silent", trailingSlash: "always",
    integrations: [integration({ discourseUrl: forum, comments: { credit: { enabled: false }, ...comments } })],
    vite: { resolve: { alias: [
      { find: "astro", replacement: "astro", customResolver: source => installed.resolve(source) },
      { find: "astro-discussion-bridge", replacement: "astro-discussion-bridge", customResolver: source => nativePackageAlias(source, fileURLToPath(import.meta.resolve(source))) },
      { find: "sanitize-html", replacement: path.join(runtimeRoot, "sanitize-html") },
      { find: "dompurify", replacement: path.join(runtimeRoot, "dompurify") },
    ] } } });
  return Object.fromEntries(await Promise.all(Object.keys(pages).map(async name => [name, await readFile(path.join(root, `dist/${name}/index.html`), "utf8")])));
}

function publicFetch(requests, numericTopic = false) {
  return async (address, init = {}) => {
    const url = new URL(address); requests.push(url.pathname); assert.equal(url.origin, forum); assert.equal(init.redirect, "error");
    assert.equal(init.headers?.["X-DiscussionBridge-Secret"], undefined);
    if (url.pathname === "/") return new Response('<script id="data-preloaded">' + JSON.stringify({ siteSettings: JSON.stringify({ title: "Forum", enable_powered_by_discourse: false }) }) + '</script>', { headers: { "content-type": "text/html" } });
    const match = /^\/t\/([1-9][0-9]*)\.json$/u.exec(url.pathname); assert.ok(match, url.pathname);
    let body = JSON.stringify({ post_stream: { stream: [1, 2], posts: [{ id: 2, topic_id: match[1], post_number: 2, topic_slug: "exact", username: "reader", created_at: "2026-10-24T00:00:00.000Z", cooked: "<p>Exact public reply</p>" }] } });
    if (numericTopic) body = body.replace(`"topic_id":"${match[1]}"`, `"topic_id":${match[1]}`);
    return new Response(body, { headers: { "content-type": "application/json" } });
  };
}

test("explicit invalid component and frontmatter modes fail through the actual Astro renderer", async t => {
  const previous = globalThis.fetch; globalThis.fetch = publicFetch([]); t.after(() => { globalThis.fetch = previous; });
  for (const value of ["typo", "fullInteractive", "", null]) {
    for (const field of ["prop", "frontmatter"]) await t.test(`${field} ${JSON.stringify(value)}`, async child => {
      const props = { topicId: "53", ...(field === "prop" ? { display: value } : { frontmatter: { discussionCommentsDisplay: value } }) };
      await assert.rejects(render(child, { invalid: props }), /display must be simple, full, or interactive/i);
    });
  }
});

test("missing mode defaults to Full and disabled discussions remain disabled", async t => {
  const { default: html } = await render(t, { default: { topicId: "53" } });
  assert.match(html, /data-discussionbridge-mode="full"/u); assert.match(html, /javascripts\/embed\.js/u);
  const disabled = await render(t, { disabled: { display: "typo", topicId: "53" } }, { enabled: false });
  assert.doesNotMatch(disabled.disabled, /data-discussionbridge-mode|discourse-comments|javascripts\/embed\.js/u);
  assert.match(disabled.disabled, /Consumer header/u); assert.match(disabled.disabled, /Consumer footer/u);
});

test("all three actual rendered modes preserve exact mapped topic strings and numeric public JSON", async t => {
  const requests = [], previous = globalThis.fetch; globalThis.fetch = publicFetch(requests, true); t.after(() => { globalThis.fetch = previous; });
  const pages = {};
  for (const mode of ["simple", "full", "interactive"]) for (const id of topicIds) pages[`${mode}-${id}`] = { display: mode, topicId: id, topicUrl: `${forum}/t/exact/${id}` };
  const output = await render(t, pages);
  for (const mode of ["simple", "full", "interactive"]) for (const id of topicIds) {
    const html = output[`${mode}-${id}`]; assert.match(html, new RegExp(`data-(?:discussionbridge-)?topic-id="${id}"`, "u"));
    assert.match(html, new RegExp(`${forum}/t/exact/${id}`, "u"));
    if (mode === "simple") { assert.match(html, /Exact public reply/u); assert.ok(requests.includes(`/t/${id}.json`)); }
    else { assert.match(html, new RegExp(`resolvedTopicId = "${id}"`, "u")); assert.match(html, new RegExp(`fullApp = ${mode === "interactive"}`, "u")); }
  }
});

test("adjacent large topic IDs cannot satisfy URL/topic agreement", async t => {
  for (const mode of ["simple", "full", "interactive"]) await t.test(mode, async child => {
    await assert.rejects(render(child, { mismatch: { display: mode, topicId: "9007199254740993", topicUrl: `${forum}/t/exact/9007199254740992` } }), /must identify the same topic/u);
  });
});

test("topic URLs accept signed64 maximum exactly and reject out-of-range or malformed identity", () => {
  for (const id of topicIds) assert.equal(String(parsePublicDiscourseTopicUrl(`${forum}/t/exact/${id}`).topicId), id);
  for (const id of ["0", "-1", "01", "9223372036854775808", "9999999999999999999999999"]) assert.throws(() => parsePublicDiscourseTopicUrl(`${forum}/t/${id}`));
});

// A minimal DOM sink exercises the real consumed live-fetch/identity path for
// an empty discussion. Sanitizer/browser UI qualification is a separate check.
class EmptyNode {
  constructor(tag = "div") { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelector() { return null; }
  setAttribute() {}
}
test("consumed live refresh keeps exact large IDs in requests and discussion links", async t => {
  const priorFetch = globalThis.fetch, priorDocument = globalThis.document, requests = [];
  globalThis.document = { createDocumentFragment: () => new EmptyNode(), createElement: tag => new EmptyNode(tag) };
  globalThis.fetch = async (address, init) => {
    const url = new URL(address); requests.push(url.pathname); assert.equal(init.credentials, "omit");
    if (url.pathname === "/") throw new Error("Optional branding unavailable");
    return new Response('{"post_stream":{"stream":[1],"posts":[]}}', { headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = priorFetch; globalThis.document = priorDocument; });
  for (const id of topicIds) {
    const root = new EmptyNode(); root.dataset = { discourseOrigin: forum, topicId: id, topicUrl: `${forum}/t/exact/${id}`, forumName: "Forum" };
    await refreshSimpleComments(root); assert.equal(root.dataset.discussionbridgeSimpleState, "live");
    assert.ok(requests.includes(`/t/${id}.json`));
    const links = []; const walk = n => { if (n?.href) links.push(n.href); for (const child of n?.children ?? []) walk(child); }; walk(root);
    assert.ok(links.includes(`${forum}/t/exact/${id}`));
  }
  const unsafe = new EmptyNode(); unsafe.dataset = { discourseOrigin: forum, topicId: "9223372036854775808", topicUrl: `${forum}/t/9223372036854775808`, forumName: "Forum" };
  await assert.rejects(refreshSimpleComments(unsafe));
});

test("consumed live refresh rejects an adjacent large topic in raw numeric public JSON", async t => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (address, init) => {
    const url = new URL(address); assert.equal(init.credentials, "omit");
    if (url.pathname === "/") throw new Error("Optional branding unavailable");
    return new Response('{"post_stream":{"stream":[1,2],"posts":[{"id":2,"topic_id":9007199254740992,"post_number":2,"username":"reader","created_at":"2026-10-24T00:00:00.000Z","cooked":"<p>Wrong discussion</p>"}]}}', { headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = previous; });
  const root = new EmptyNode(); root.dataset = { discourseOrigin: forum, topicId: "9007199254740993", topicUrl: `${forum}/t/exact/9007199254740993`, forumName: "Forum" };
  await assert.rejects(refreshSimpleComments(root), /Invalid public reply/u);
  assert.equal(root.children.length, 0);
});

test("actual SSR replies stream within the existing public cap and cancel overflow", async t => {
  const previous = globalThis.fetch, maximum = 512 * 1024;
  t.after(() => { globalThis.fetch = previous; });
  for (const kind of ["declared", "chunked", "exact"]) await t.test(kind, async child => {
    const record = { produced: 0, cancelled: false, textCalled: false, signal: undefined };
    globalThis.fetch = async (address, init) => {
      if (new URL(address).pathname === "/") return publicFetch([])(address, init);
      record.signal = init.signal;
      const text = JSON.stringify({ post_stream: { stream: [1, 2], posts: [{ id: 2, topic_id: "53", post_number: 2, topic_slug: "exact", username: "reader", created_at: "2026-10-24T00:00:00.000Z", cooked: "<p>Exact public reply</p>" }] } });
      const total = kind === "exact" ? maximum : maximum * 10;
      const bytes = new TextEncoder().encode(kind === "exact" ? text + " ".repeat(maximum - text.length) : " ".repeat(32768));
      const response = new Response(new ReadableStream({
        pull(controller) {
          if (record.produced === total) { controller.close(); return; }
          const chunk = kind === "exact" ? bytes.subarray(record.produced, Math.min(record.produced + 32768, total)) : bytes;
          record.produced += chunk.byteLength; controller.enqueue(chunk);
        }, cancel() { record.cancelled = true; },
      }, { highWaterMark: 0 }), { headers: { "content-type": "application/json", ...(kind === "declared" ? { "content-length": String(maximum + 1) } : {}) } });
      response.text = () => { record.textCalled = true; throw new Error("Unbounded SSR text() called"); };
      return response;
    };
    const pending = render(child, { bounded: { display: "simple", topicId: "53" } });
    if (kind === "exact") {
      assert.match((await pending).bounded, /Exact public reply/u);
      assert.equal(record.produced, maximum);
    } else {
      await assert.rejects(pending, /byte limit/u);
      assert.equal(record.cancelled, true);
      assert.ok(record.produced <= (kind === "declared" ? 0 : maximum + 32768));
    }
    assert.equal(record.textCalled, false); assert.equal(record.signal.aborted, true);
  });
});
