import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright-core";
import integration from "../dist/index.js";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";
import { nativePackageAlias } from "./helpers/package-alias.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const installed = createRequire(new URL("../package.json", import.meta.url));
const { build } = await import(pathToFileURL(installed.resolve("astro")).href);
const runtimeRoot = path.dirname(path.dirname(installed.resolve("astro/package.json")));
const forum = "https://simple-startup-forum.example";
const site = "https://simple-startup-site.example";
const settings = '<script id="data-preloaded">' + JSON.stringify({ siteSettings: JSON.stringify({ title: "Startup test forum", enable_powered_by_discourse: false }) }) + '</script>';
const topic = (id, text) => JSON.stringify({ post_stream: { stream: [1, 2], posts: [{ id: 2, topic_id: Number(id), topic_slug: "startup", post_number: 2, username: "reader", created_at: "2026-11-02T00:00:00.000Z", cooked: `<p>${text}</p>` }] } });

test("native Simple has one initial refresh owner and retains navigation, failure and retry", async t => {
  const parent = path.join(packageRoot, ".tmp"); await mkdir(parent, { recursive: true });
  const root = await ownedTempFixture(t, "discussionbridge-simple-startup-", parent);
  await mkdir(path.join(root, "src/pages"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "owned-simple-startup-check", type: "module", private: true }));
  const component = path.join(packageRoot, "src/components/Discussion.astro").replaceAll("\\", "/");
  await writeFile(path.join(root, "src/pages/simple.astro"), `---
import Discussion from ${JSON.stringify(component)};
---
<!doctype html><html><head><title>Native Simple startup</title></head><body><h1>Consumer-owned page</h1><Discussion display="simple" topicId="53"/><Discussion display="simple" topicId="54"/></body></html>`);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (address, init) => {
      const url = new URL(address); assert.equal(url.origin, forum); assert.equal(init.redirect, "error");
      if (url.pathname === "/") return new Response(settings, { headers: { "content-type": "text/html" } });
      const match = /^\/t\/(53|54)\.json$/u.exec(url.pathname); assert.ok(match, url.href);
      return new Response(topic(match[1], "Build-time snapshot"), { headers: { "content-type": "application/json" } });
    };
    await build({ root: pathToFileURL(root + path.sep), configFile: false, site, logLevel: "silent", trailingSlash: "always",
      integrations: [integration({ discourseUrl: forum, comments: { credit: { enabled: false } } })],
      vite: { resolve: { alias: [
        { find: "astro", replacement: "astro", customResolver: source => installed.resolve(source) },
        { find: "astro-discussion-bridge", replacement: "astro-discussion-bridge", customResolver: source => nativePackageAlias(source, fileURLToPath(import.meta.resolve(source))) },
        { find: "sanitize-html", replacement: path.join(runtimeRoot, "sanitize-html") },
        { find: "dompurify", replacement: path.join(runtimeRoot, "dompurify") },
      ] } } });
  } finally { globalThis.fetch = originalFetch; }

  const executablePath = process.env.DISCUSSIONBRIDGE_BROWSER_EXECUTABLE;
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : { channel: "chrome" }) });
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: "block" });
  const counts = { "53": 0, "54": 0 }, errors = [];
  let fail = false;
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === forum) {
      assert.equal(request.method(), "GET"); assert.equal(request.headers()["x-discussionbridge-secret"], undefined); assert.equal(request.headers().cookie, undefined);
      const headers = { "access-control-allow-origin": site };
      if (url.pathname === "/") return route.fulfill({ status: 200, contentType: "text/html", headers, body: settings });
      const match = /^\/t\/(53|54)\.json$/u.exec(url.pathname); assert.ok(match, url.pathname);
      const id = match[1], revision = ++counts[id];
      return route.fulfill({ status: fail ? 503 : 200, contentType: "application/json", headers, body: topic(id, `Live revision ${revision}`) });
    }
    assert.equal(url.origin, site, "No unlisted browser destination is permitted");
    if (url.pathname === "/favicon.ico") return route.fulfill({ status: 204 });
    const relative = url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname;
    const file = path.resolve(root, "dist", "." + relative), dist = path.resolve(root, "dist");
    assert.ok(file.startsWith(dist + path.sep));
    const body = await readFile(file);
    return route.fulfill({ status: 200, contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css", body });
  });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(String(error)));
  await page.goto(site + "/simple/", { waitUntil: "networkidle" });
  assert.deepEqual(counts, { "53": 1, "54": 1 }, "Each native Simple root must make exactly one initial topic request");
  assert.equal(await page.locator('[data-discussionbridge-simple-state="live"]').count(), 2);
  assert.equal(await page.getByText("Live revision 1", { exact: true }).count(), 2);
  await page.evaluate(() => document.dispatchEvent(new Event("astro:page-load")));
  await page.waitForFunction(() => [...document.querySelectorAll("[data-discussionbridge-simple-live]")].every(root => root.textContent.includes("Live revision 2")));
  assert.deepEqual(counts, { "53": 2, "54": 2 }, "Intended native navigation refresh remains active once per root");
  fail = true;
  await page.reload({ waitUntil: "networkidle" });
  assert.deepEqual(counts, { "53": 3, "54": 3 });
  assert.equal(await page.locator('[data-discussionbridge-simple-state="snapshot"]').count(), 2);
  assert.equal(await page.getByText("Build-time snapshot", { exact: true }).count(), 2);
  assert.equal(await page.locator("[data-discussionbridge-simple-status]:visible").count(), 2);
  fail = false;
  await page.evaluate(() => document.dispatchEvent(new Event("astro:page-load")));
  await page.waitForFunction(() => [...document.querySelectorAll("[data-discussionbridge-simple-live]")].every(root => root.textContent.includes("Live revision 4")));
  assert.deepEqual(counts, { "53": 4, "54": 4 }, "A failed initial refresh remains retryable");
  assert.equal(await page.locator('[data-discussionbridge-simple-state="live"]').count(), 2);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: browser.version(), roots: 2, initialTopicRequestsPerRoot: 1, nativeNavigationRefresh: true, failedSnapshotRetained: true, retrySucceeded: true }));
});
