import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CmsClient } from "../dist/cms-client.js";
import { emptyCmsState, assertCmsConnection, readCmsState, writeCmsState } from "../dist/cms-state.js";
import { cmsNativeReservation } from "../dist/cms-coordinator.js";
import { assertCmsTopicUrl } from "../dist/cms-to.js";
import { validateCms, cmsUrlAuthority } from "../src/private/cms-runtime.mjs";
import { cmsUrl, nativeUrl, cmsOrigin, sameCmsOrigin } from "../dist/native-url.js";
import * as presentation from "../dist/cms-web-url.js";
import { nativePackageAlias } from "./helpers/package-alias.mjs";
import discussionBridge from "../dist/index.js";

const connectionId = "dbc_0123456789abcdef01234567", connectionSecret = "s".repeat(32);
const fixtures = JSON.parse(fs.readFileSync(new URL("./fixtures/cms-v4/url-domain-policy.json", import.meta.url)));
const positive = JSON.parse(fs.readFileSync(new URL("./fixtures/cms-v4/positive-examples.json", import.meta.url)));
const template = positive.fixtures.find(item => item.type === "Connection").value;
const hosts = ["x-a\u0315\u0300\u05ae\u{1acf}b", "xn--x-b-bla93z87e2z2c", "\u{11db0}", "xn--7u3d"].map(host => host + ".example");
const scratch = fileURLToPath(new URL("../.tmp/", import.meta.url));
fs.mkdirSync(scratch, { recursive: true });

test("no-install native fixtures preserve only the real server entry as external", () => {
  const file = fileURLToPath(new URL("../dist/cms-web-url.js", import.meta.url));
  const resolved = nativePackageAlias("astro-discussion-bridge/server-url", file);
  assert.deepEqual(resolved, { id: new URL("../dist/cms-web-url.js", import.meta.url).href, external: true });
  for (const specifier of ["astro-discussion-bridge", "astro-discussion-bridge/Discussion.astro", "astro-discussion-bridge/simple-live", "astro-discussion-bridge/web-url"]) {
    assert.equal(nativePackageAlias(specifier, file), file);
  }
});

test("the shipped integration preserves the exact installed server entry and refuses browser imports", () => {
  const integration = discussionBridge({ discourseUrl: "https://forum.example" });
  let config;
  integration.hooks["astro:config:setup"]({ config: { root: new URL("../.tmp/", import.meta.url) }, command: "build", updateConfig(value) { config = value; }, injectScript() {} });
  const plugin = config.vite.plugins.find(item => item.name === "astro-discussion-bridge-config");
  assert.equal(plugin.enforce, "pre");
  assert.deepEqual(plugin.resolveId("astro-discussion-bridge/server-url", undefined, { ssr: true }), { id: "astro-discussion-bridge/server-url", external: true });
  assert.throws(() => plugin.resolveId("astro-discussion-bridge/server-url", undefined, { ssr: false }), /server-only/);
  assert.throws(() => plugin.resolveId("astro-discussion-bridge/server-url"), /server-only/);
  for (const id of ["astro-discussion-bridge", "astro-discussion-bridge/simple-live", "astro-discussion-bridge/Discussion.astro"]) assert.equal(plugin.resolveId(id, undefined, { ssr: true }), undefined);
});

for (const [index, host] of hosts.entries()) test(`actual V4 client/state/topic/reservation callers admit fixed-policy origin ${host}`, async () => {
  const origin = `https://${host}`, derivedOrigin = `https://${index < 2 ? hosts[1] : hosts[3]}`, calls = [];
  assert.equal(validateCms("Url", origin + "/"), origin + "/");
  const client = new CmsClient({ serverUrl: origin + "/", connectionId, connectionSecret, fetchImplementation: async (url, init) => {
    calls.push({ url, init });
    const response = Response.json({ ...template, connection_id: connectionId, profile: "astro", destination_origin: origin,
      policy: { ...template.policy, publication_kind: "static" },
      native_capabilities: { ...template.native_capabilities, publication_kind: "static" } });
    Object.defineProperty(response, "url", { value: origin + "/discussion-bridge/v4/connection.json" });
    return response;
  } });
  const state = emptyCmsState(client, origin + "/", connectionId);
  assert.equal(client.origin, derivedOrigin); assert.equal(state.serviceOrigin, derivedOrigin); assert.equal(state.destinationOrigin, derivedOrigin);
  assert.equal(client.options.serverUrl, origin + "/", "original configured URL is not rewritten");
  assertCmsConnection(await client.connection(), state);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, derivedOrigin + "/discussion-bridge/v4/connection.json");
  assert.equal(calls[0].init.redirect, "error"); assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.headers["X-DiscussionBridge-Secret"], connectionSecret);
  assertCmsTopicUrl(origin + "/t/original/53", "53", client.origin);
  assert.throws(() => assertCmsTopicUrl(origin + "/t/original/54", "53", client.origin));
  assert.throws(() => assertCmsTopicUrl("https://other.example/t/original/53", "53", client.origin));
  const reservation = cmsNativeReservation({ docsDir: ".", siteUrl: origin, routeBase: "comments" }, { source_id: "topic:53" });
  assert.ok(reservation.canonicalUrl.startsWith(derivedOrigin + "/comments/"));
  assert.equal(state.destinationOrigin, derivedOrigin, "derived scope must be independent of native ICU");
  const folder = await mkdtemp(path.join(scratch, "cms-url-state-"));
  try {
    const file = path.join(folder, "state.json");
    state.nativeLocations = { "topic:53": { canonicalUrl: origin + "/comments/Original%2F?q=%2F", nativeId: "original-native-file.md",
      moveId: "00000000-0000-4000-8000-000000000001", mappingRevision: "original-revision" } };
    await writeCmsState(file, state);
    const original = await readFile(file, "utf8"), restarted = await readCmsState(file, emptyCmsState(client, origin, connectionId));
    assert.equal(restarted.nativeLocations["topic:53"].canonicalUrl, state.nativeLocations["topic:53"].canonicalUrl);
    assert.equal(restarted.nativeLocations["topic:53"].nativeId, "original-native-file.md");
    await writeCmsState(file, restarted); assert.equal(await readFile(file, "utf8"), original);
  } finally {
    assert.ok(folder.startsWith(path.join(scratch, "cms-url-state-")));
    await rm(folder, { recursive: true, force: true });
  }
  assert.equal(presentation.normalizeServiceBaseUrl(origin + "/"), derivedOrigin);
  assert.equal(presentation.normalizePublicHttpUrl(origin + "/Original%2F?q=%2F", undefined, { allowQuery: true }), derivedOrigin + "/Original%2F?q=%2F");
  const topic = presentation.parsePublicDiscourseTopicUrl(origin + "/t/original/53", origin);
  assert.equal(topic.href, derivedOrigin + "/t/original/53"); assert.equal(String(topic.topicId), "53"); assert.equal(topic.serviceBase, derivedOrigin);
  for (const value of [origin + "/t/original/53?query=1", origin + "/t//original/53", origin + "/t/%252e%252e/53", origin + "/t/original/53#fragment"]) {
    assert.throws(() => presentation.parsePublicDiscourseTopicUrl(value, origin));
  }
  assert.throws(() => presentation.parsePublicDiscourseTopicUrl(origin + "/t/original/53", "https://other.example"));
});

test("actual client admission keeps every fixed negative and rejects non-origin configuration before fetch", () => {
  let calls = 0;
  const options = { connectionId, connectionSecret, fetchImplementation: async () => { calls++; throw new Error("unexpected"); } };
  for (const item of fixtures.cases.filter(item => !item.accepted)) assert.throws(() => new CmsClient({ ...options, serverUrl: item.url }), undefined, item.id);
  for (const value of ["https://forum.example/path", "https://forum.example/?a=1", "https://forum.example/#fragment", "http://forum.example/", "https://user:password@forum.example/"]) {
    assert.throws(() => new CmsClient({ ...options, serverUrl: value }));
    assert.throws(() => emptyCmsState(new CmsClient({ ...options, serverUrl: "https://forum.example/" }), value, connectionId));
  }
  assert.equal(calls, 0);
});

test("fixed origin comparisons preserve ordinary origin serialization and raw URL bytes", () => {
  for (const item of fixtures.cases.filter(item => item.accepted)) {
    const original = item.url, origin = /^https:\/\/[^/?#]+/iu.exec(original)[0];
    const facts = cmsUrlAuthority(origin), ascii = `https://${facts.asciiHost}${facts.effectivePort === 443 ? "" : ":" + facts.effectivePort}`;
    let expected; try { expected = new URL(ascii).origin; } catch { expected = ascii; }
    const client = new CmsClient({ serverUrl: origin, connectionId, connectionSecret });
    assert.equal(client.origin, expected, item.id);
    assert.equal(cmsOrigin(origin), expected, item.id);
    assert.equal(cmsUrl(original).origin, expected, item.id);
    assert.equal(item.url, original, item.id);
  }
  assert.equal(sameCmsOrigin("https://\u{11db0}.example/Original", "https://xn--7u3d.example:443/Other"), true);
  assert.equal(sameCmsOrigin("https://xn--7u3d.example/", "https://xn--7u3d.example:444/"), false);
  for (const [left, right] of [["https://127.1", "https://127.0.0.1"], ["https://0x", "https://0.0.0.0"], ["https://[0:0:0:0:0:0:0:1]", "https://[::1]"]]) assert.equal(sameCmsOrigin(left, right), true);
  const base = "https://xn--7u3d.example/base/";
  assert.equal(nativeUrl("../Original%2F?q=%2F#anchor", base).href, "https://xn--7u3d.example/Original%2F?q=%2F#anchor");
  assert.equal(nativeUrl("https://ordinary.example/path", base).href, "https://ordinary.example/path");
  assert.equal(nativeUrl("//xn--7u3d.example/path", base).href, "https://xn--7u3d.example/path");
  assert.equal(nativeUrl("https://xn--7u3d.example/?").href, "https://xn--7u3d.example/?");
  assert.equal(nativeUrl("http://b\u00fccher.example/path").href, "http://xn--bcher-kva.example/path", "legacy HTTP presentation behavior is not changed by the HTTPS V4 fix");
});

test("a retained incompatible native-domain scope is refused without rewriting its bytes or identities", async () => {
  const client = new CmsClient({ serverUrl: `https://${hosts[0]}`, connectionId, connectionSecret });
  assert.equal(client.origin, `https://${hosts[1]}`);
  const expected = emptyCmsState(client, "https://astro.example", connectionId);
  const retained = { ...expected, serviceOrigin: "https://xn--x-b-bla93z87e3z2c.example" };
  const folder = await mkdtemp(path.join(scratch, "cms-url-state-"));
  try {
    const file = path.join(folder, "state.json"); await writeCmsState(file, retained);
    const before = await readFile(file, "utf8");
    await assert.rejects(readCmsState(file, expected), /scope requires reconciliation/);
    assert.equal(await readFile(file, "utf8"), before);
  } finally { assert.ok(folder.startsWith(path.join(scratch, "cms-url-state-"))); await rm(folder, { recursive: true, force: true }); }
});

test("server presentation reads the same public settings without exposing its placeholder or server transport to the browser helper", async () => {
  const origin = "https://xn--7u3d.example", settings = { title: "Original forum", enable_powered_by_discourse: true };
  const html = `<script id="data-preloaded">${JSON.stringify({ siteSettings: JSON.stringify(settings) })}</script>`;
  const actual = await presentation.readPublicForumSettings(origin, async (url, init) => {
    assert.equal(url, origin + "/"); assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error");
    const response = new Response(html, { headers: { "Content-Type": "text/html" } });
    Object.defineProperty(response, "url", { value: url }); return response;
  });
  assert.deepEqual(actual, { title: "Original forum", poweredBy: true });
  for (const name of ["forum-name.js", "web-url.js"]) {
    const browserModule = fs.readFileSync(new URL(`../dist/${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(browserModule, /cms-fetch|native-url|cms-runtime|node:https/);
  }
});
