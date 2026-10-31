import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { closeResponse, consumeBoundedResponseBody, readBoundedResponseBytes } from "../dist/response-body.js";
import { readPublicForumSettings } from "../dist/cms-web-url.js";
import { CmsClient } from "../dist/cms-client.js";
import { publicResponse } from "../dist/cms-verification.js";

const maximum = 512 * 1024;
const bootstrap = '<script id="data-preloaded">' + JSON.stringify({ siteSettings: JSON.stringify({ title: "Forum", enable_powered_by_discourse: true }) }) + '</script>';

function streamed(total, headers = {}, cancellation = undefined) {
  const record = { produced: 0, cancelled: false, textCalled: false };
  const response = new Response(new ReadableStream({
    pull(controller) {
      if (record.produced === total) { controller.close(); return; }
      const size = Math.min(32768, total - record.produced);
      record.produced += size;
      controller.enqueue(new Uint8Array(size).fill(32));
    },
    cancel() { record.cancelled = true; return cancellation; },
  }, { highWaterMark: 0 }), { headers });
  response.text = () => { record.textCalled = true; throw new Error("Unbounded text() must not be used"); };
  return { response, record };
}

async function deadline(promise, milliseconds = 1000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Test cleanup did not settle")), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

test("bounded reader cancels declared/chunked overflow before consuming the whole document", async () => {
  for (const declared of [true, false]) {
    const { response, record } = streamed(maximum * 10, declared ? { "content-length": String(maximum + 1) } : {});
    await assert.rejects(readBoundedResponseBytes(response, maximum, new AbortController().signal), /byte limit/u);
    assert.equal(record.cancelled, true); assert.equal(record.textCalled, false);
    assert.ok(record.produced <= (declared ? 0 : maximum + 32768));
    assert.equal(response.body.locked, false);
  }
});

test("bounded reader accepts exact bytes/empty responses and rejects malformed byte streams", async () => {
  const exact = streamed(maximum);
  assert.equal((await readBoundedResponseBytes(exact.response, maximum, new AbortController().signal)).byteLength, maximum);
  assert.equal(exact.record.cancelled, false);
  assert.equal((await readBoundedResponseBytes(new Response(null, { status: 204 }), 0, new AbortController().signal)).byteLength, 0);
  assert.equal(new TextDecoder().decode(await readBoundedResponseBytes(new Response("ok", { headers: { "content-length": "0002" } }), 2, new AbortController().signal)), "ok");
  await assert.rejects(readBoundedResponseBytes(new Response("ok", { headers: { "content-length": "0002" } }), 2, new AbortController().signal, { canonicalContentLength: true }), /byte limit/u);
  let cancelled = false;
  const invalid = new Response(new ReadableStream({ start(controller) { controller.enqueue("not bytes"); }, cancel() { cancelled = true; } }));
  await assert.rejects(readBoundedResponseBytes(invalid, maximum, new AbortController().signal), /non-byte/u);
  assert.equal(cancelled, true);
  const sinkFailure = streamed(maximum);
  await assert.rejects(consumeBoundedResponseBody(sinkFailure.response, maximum, new AbortController().signal, () => { throw new Error("Digest rejected"); }), /Digest rejected/u);
  assert.equal(sinkFailure.record.cancelled, true); assert.equal(sinkFailure.response.body.locked, false);
});

test("abort and unresolved cancellation do not strand the bounded reader or response cleanup", async () => {
  const never = new Promise(() => {});
  const controller = new AbortController();
  const before = streamed(1024);
  controller.abort();
  await assert.rejects(deadline(readBoundedResponseBytes(before.response, maximum, controller.signal)));
  assert.equal(before.record.cancelled, true); assert.equal(before.record.produced, 0);

  const during = new AbortController(); let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; return never; } }));
  const pending = readBoundedResponseBytes(response, maximum, during.signal);
  during.abort(); await assert.rejects(deadline(pending), error => error.name === "AbortError");
  assert.equal(cancelled, true); assert.equal(response.body.locked, false);

  const overflow = streamed(maximum * 10, { "content-length": String(maximum + 1) }, never);
  await assert.rejects(deadline(readBoundedResponseBytes(overflow.response, maximum, new AbortController().signal)), /byte limit/u);
  const cleanup = new AbortController();
  closeResponse(overflow.response, cleanup);
  assert.equal(cleanup.signal.aborted, true); assert.equal(overflow.record.cancelled, true);
});

test("public bootstrap uses the same streamed cap for ordinary and fixed-policy origins", async () => {
  for (const origin of ["https://forum.example", "https://xn--7u3d.example"]) {
    for (const declared of [true, false]) {
      const { response, record } = streamed(maximum * 10, { "content-type": "text/html", ...(declared ? { "content-length": String(maximum + 1) } : {}) });
      let signal;
      await assert.rejects(readPublicForumSettings(origin, async (_url, init) => { signal = init.signal; return response; }), /configuration attention/u);
      assert.equal(signal.aborted, true); assert.equal(record.cancelled, true); assert.equal(record.textCalled, false);
      assert.ok(record.produced <= (declared ? 0 : maximum + 32768));
    }
    let signal;
    assert.deepEqual(await readPublicForumSettings(origin, async (_url, init) => {
      signal = init.signal;
      return new Response(bootstrap + " ".repeat(maximum - new TextEncoder().encode(bootstrap).byteLength), { headers: { "content-type": "text/html" } });
    }), { title: "Forum", poweredBy: true });
    assert.equal(signal.aborted, true);
  }
});

test("custom fetch rejection cancels media/canonical failures without awaiting an uncooperative cleanup", async () => {
  for (const kind of ["media", "origin", "public-canonical"]) {
    const { response, record } = streamed(maximum * 10, { "content-type": kind === "media" ? "text/plain" : "application/json" }, new Promise(() => {}));
    if (kind !== "media") Object.defineProperty(response, "url", { value: "https://other.example/wrong" });
    let signal, calls = 0;
    const fetchImplementation = async (_url, init) => { signal = init.signal; calls++; return response; };
    const promise = kind === "public-canonical"
      ? publicResponse("https://site.example/page", fetchImplementation)
      : new CmsClient({ serverUrl: "https://forum.example", connectionId: "dbc_0123456789abcdef01234567", connectionSecret: "s".repeat(32), fetchImplementation }).connection();
    await assert.rejects(deadline(promise));
    assert.equal(signal.aborted, true); assert.equal(record.cancelled, true);
    assert.equal(record.produced, 0); assert.equal(calls, 1);
  }
});

test("actual compiled browser refresh bounds streaming input and preserves the snapshot on failure", async () => {
  const compiled = await build({ entryPoints: [fileURLToPath(new URL("../dist/simple-live.js", import.meta.url))], bundle: true, format: "iife", globalName: "discussionBridgeLiveTest", platform: "browser", write: false });
  const executablePath = process.env.DISCUSSIONBRIDGE_BROWSER_EXECUTABLE;
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : { channel: "chrome" }) });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const requests = [];
    await context.route("**/*", route => { requests.push(route.request().url()); return route.abort(); });
    const page = await context.newPage();
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ content: compiled.outputFiles[0].text });
    for (const kind of ["declared", "chunked", "exact"]) {
      await page.evaluate(({ kind, maximum, bootstrap }) => {
        window.__bodyProof = { produced: 0, cancelled: false, textCalled: false, signals: [] };
        const record = window.__bodyProof, origin = `https://${kind}.example`;
        document.body.innerHTML = `<section data-discussionbridge-simple-live data-discourse-origin="${origin}" data-topic-id="53" data-topic-url="${origin}/t/53" data-forum-name="Forum"><p>Retained snapshot</p><p data-discussionbridge-simple-status hidden>Live comments unavailable</p></section>`;
        window.fetch = async (address, init) => {
          record.signals.push(init.signal);
          if (init.credentials !== "omit" || init.redirect !== "error") throw new Error("Unsafe public controls");
          if (new URL(address).pathname === "/") return new Response(bootstrap, { headers: { "content-type": "text/html" } });
          const text = '{"post_stream":{"stream":[1],"posts":[]}}';
          const total = kind === "exact" ? maximum : maximum * 10;
          const bytes = new TextEncoder().encode(kind === "exact" ? text + " ".repeat(maximum - text.length) : " ".repeat(32768));
          const response = new Response(new ReadableStream({
            pull(controller) {
              if (record.produced === total) { controller.close(); return; }
              const chunk = kind === "exact" ? bytes.subarray(record.produced, Math.min(record.produced + 32768, total)) : bytes;
              record.produced += chunk.byteLength; controller.enqueue(chunk);
            }, cancel() { record.cancelled = true; },
          }, { highWaterMark: 0 }), { headers: { "content-type": "application/json", ...(kind === "declared" ? { "content-length": String(maximum + 1) } : {}) } });
          response.text = () => { record.textCalled = true; throw new Error("Unbounded text() called"); };
          return response;
        };
        window.discussionBridgeLiveTest.startSimpleComments();
      }, { kind, maximum, bootstrap });
      await page.waitForFunction(() => ["snapshot", "live"].includes(document.querySelector("section").dataset.discussionbridgeSimpleState));
      const result = await page.evaluate(() => ({ ...window.__bodyProof, signals: window.__bodyProof.signals.map(signal => signal.aborted), state: document.querySelector("section").dataset.discussionbridgeSimpleState, text: document.body.textContent, fallbackHidden: document.querySelector("[data-discussionbridge-simple-status]")?.hidden }));
      assert.equal(result.textCalled, false); assert.ok(result.signals.every(Boolean));
      if (kind === "exact") { assert.equal(result.state, "live"); assert.match(result.text, /No comments yet/u); assert.equal(result.produced, maximum); }
      else { assert.equal(result.state, "snapshot"); assert.match(result.text, /Retained snapshot/u); assert.equal(result.fallbackHidden, false); assert.equal(result.cancelled, true); assert.ok(result.produced <= (kind === "declared" ? 0 : maximum + 32768)); }
    }
    assert.deepEqual(requests, []);
  } finally { await browser.close(); }
});
