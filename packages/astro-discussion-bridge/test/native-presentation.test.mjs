import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { build } from "astro";
import test from "node:test";
import integration from "../dist/index.js";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";

test("actual native Astro renders all three current modes and fresh local rich assets with consumer theme ownership", async t => {
  const packageRoot = fileURLToPath(new URL("../", import.meta.url)), parent = path.join(packageRoot, ".tmp"); await mkdir(parent, { recursive: true });
  const root = await ownedTempFixture(t, "discussionbridge-native-presentation-", parent), pages = path.join(root, "src/pages"); await mkdir(pages, { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "test-owned-v4-native-consumer", type: "module", private: true }));
  const runtimeRoot = "C:/CodeProjects/Products/DiscussionBridge/codex crap/astro/packages/astro-discussion-bridge/node_modules";
  const nativeRuntime = createRequire(path.join(runtimeRoot, "astro/package.json"));
  const requests = [], priorFetch = globalThis.fetch;
  globalThis.fetch = async (value, init = {}) => {
    const url = new URL(value); requests.push(url.pathname); assert.equal(url.origin, "https://forum.example"); assert.equal(init.redirect, "error");
    assert.equal(init.headers?.["X-DiscussionBridge-Secret"], undefined);
    if (url.pathname === "/") return new Response('<script id="data-preloaded">' + JSON.stringify({ siteSettings: JSON.stringify({ title: "Native forum", enable_powered_by_discourse: false }) }) + '</script>', { headers: { "content-type": "text/html" } });
    assert.equal(url.pathname, "/t/53.json");
    return new Response(JSON.stringify({ post_stream: { stream: [1, 2], posts: [{ id: 2, topic_id: 53, post_number: 2, topic_slug: "native", username: "native-user", created_at: "2026-10-14T03:00:00.000Z", cooked: "<p>Current native reply</p>" }] } }), { headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = priorFetch; });
  for (const mode of ["simple", "full", "interactive"]) {
    await writeFile(path.join(pages, `${mode}.astro`), `---
import Discussion from ${JSON.stringify(path.join(packageRoot, "src/components/Discussion.astro").replaceAll("\\", "/"))};
import RichContent from ${JSON.stringify(path.join(packageRoot, "src/components/RichContent.astro").replaceAll("\\", "/"))};
---
<!doctype html><html><head><title>Native consumer</title></head><body><header>Consumer-owned brand</header><nav>Consumer-owned menu</nav><article><h1>Current native article</h1><pre><code class="language-mermaid">graph TD; A--&gt;B</code></pre><RichContent/></article><Discussion display="${mode}" topicId="53" topicUrl="https://forum.example/t/native/53"/><footer>Consumer-owned footer</footer></body></html>`);
  }
  await build({ root: pathToFileURL(root + path.sep), configFile: false, site: "https://site.example", logLevel: "silent", trailingSlash: "always",
    integrations: [integration({ discourseUrl: "https://forum.example", comments: { credit: { enabled: false } } })],
    vite: { resolve: { alias: [
      { find: "astro", replacement: "astro", customResolver: source => nativeRuntime.resolve(source) },
      { find: "astro-discussion-bridge", replacement: "astro-discussion-bridge", customResolver: source => fileURLToPath(import.meta.resolve(source)) },
      { find: "sanitize-html", replacement: path.join(runtimeRoot, "sanitize-html") },
      { find: "dompurify", replacement: path.join(runtimeRoot, "dompurify") },
    ] } } });
  const simple = await readFile(path.join(root, "dist/simple/index.html"), "utf8"), full = await readFile(path.join(root, "dist/full/index.html"), "utf8"), interactive = await readFile(path.join(root, "dist/interactive/index.html"), "utf8");
  assert.match(simple, /Current native reply/); assert.match(simple, /data-discussionbridge-simple-live/); assert.ok(requests.includes("/t/53.json"));
  assert.match(full, /data-discussionbridge-mode="full"/); assert.match(interactive, /data-discussionbridge-mode="interactive"/);
  assert.match(full, /javascripts\/embed\.js/); assert.match(interactive, /fullApp/);
  for (const output of [simple, full, interactive]) { assert.match(output, /Consumer-owned brand/); assert.match(output, /Consumer-owned menu/); assert.match(output, /Consumer-owned footer/); assert.match(output, /data-discussionbridge-rich/); assert.doesNotMatch(output, /X-DiscussionBridge|\.tools|cms-schema|cms-runtime|0\.3\.0-alpha/); }
  assert.ok((await readdir(path.join(root, "dist/_astro"))).some(name => name.endsWith(".js")), "fresh local browser asset emitted through native build");
});
