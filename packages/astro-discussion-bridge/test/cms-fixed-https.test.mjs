import assert from "node:assert/strict";
import fs from "node:fs";
import https from "node:https";
import { once } from "node:events";
import test from "node:test";
import { cmsFetch } from "../dist/cms-fetch.js";
import { CmsClient } from "../dist/cms-client.js";

const key = fs.readFileSync(new URL("./fixtures/idna-https-test-key.pem", import.meta.url));
const cert = fs.readFileSync(new URL("./fixtures/idna-https-test-cert.pem", import.meta.url));
const connectionId = "dbc_0123456789abcdef01234567", connectionSecret = "s".repeat(32);
const template = JSON.parse(fs.readFileSync(new URL("./fixtures/cms-v4/positive-examples.json", import.meta.url))).fixtures.find(item => item.type === "Connection").value;
const controls = signal => ({ method: "GET", credentials: "omit", redirect: "error", signal, headers: { Accept: "application/json", "Accept-Encoding": "identity" } });

async function localHttps(t, handler) {
  const requests = [], dns = [], optionsSeen = [], state = { trusted: true };
  const server = https.createServer({ key, cert }, async (request, response) => {
    requests.push({ host: request.headers.host, path: request.url, headers: request.headers });
    await handler(request, response);
  });
  server.on("tlsClientError", () => {});
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const original = https.request;
  // TEST-ONLY routing/trust seam. The actual product options are checked before
  // the local listener/CA is substituted. No product or global trust bypass.
  t.mock.method(https, "request", (options, callback) => {
    optionsSeen.push(options);
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.servername, options.hostname);
    assert.equal(options.headers["accept-encoding"], "identity");
    assert.equal(options.headers.cookie, undefined);
    return original({ ...options, agent: false, ca: state.trusted ? cert : undefined,
      lookup(hostname, options, callback) {
        dns.push(hostname);
        if (options.all) callback(null, [{ address: "127.0.0.1", family: 4 }]);
        else callback(null, "127.0.0.1", 4);
      },
    }, callback);
  });
  const origin = host => `https://${host}:${server.address().port}`;
  return { requests, dns, optionsSeen, state, origin };
}

test("actual client uses verified local HTTPS for all four fixed-policy origins and preserves request identity", async t => {
  let destination, echoed;
  const fixture = await localHttps(t, async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/echo") {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      echoed = Buffer.concat(chunks).toString("utf8"); response.end(echoed);
    } else response.end(JSON.stringify({ ...template, connection_id: connectionId, destination_origin: destination }));
  });
  const hosts = ["x-a\u0315\u0300\u05ae\u{1acf}b.example", "xn--x-b-bla93z87e2z2c.example", "\u{11db0}.example", "xn--7u3d.example"];
  for (const host of hosts) {
    destination = fixture.origin(host);
    const client = new CmsClient({ serverUrl: destination, connectionId, connectionSecret });
    assert.equal(client.origin, fixture.origin(host.startsWith("x-a") || host.startsWith("xn--x-b") ? "xn--x-b-bla93z87e2z2c.example" : "xn--7u3d.example"));
    assert.equal(client.options.serverUrl, destination);
    assert.equal((await client.connection()).destination_origin, destination);
    const body = JSON.stringify({ canonical_url: destination + "/Original%2F?q=%2F", native_id: "original-native-id", receipt: "unchanged-original-receipt" });
    const response = await cmsFetch(destination + "/echo", { ...controls(AbortSignal.timeout(5000)), method: "POST", body });
    assert.equal(response.url, destination + "/echo");
    assert.equal(await response.text(), body); assert.equal(echoed, body);
  }
  assert.equal(fixture.requests.length, 8);
  assert.ok(fixture.dns.every(host => ["xn--7u3d.example", "xn--x-b-bla93z87e2z2c.example"].includes(host)));
  for (const request of fixture.requests.filter(item => item.path.endsWith("connection.json"))) {
    assert.equal(request.headers["x-discussionbridge-connection"], connectionId);
    assert.equal(request.headers["x-discussionbridge-secret"], connectionSecret);
    assert.equal(request.path.includes(connectionSecret), false);
  }
});

test("fixed-domain HTTPS refuses untrusted and wrong-host certificates before HTTP, and never follows redirects", async t => {
  const fixture = await localHttps(t, async (_request, response) => { response.writeHead(302, { Location: "https://other.example/steal" }); response.end(); });
  fixture.state.trusted = false;
  await assert.rejects(cmsFetch(fixture.origin("xn--7u3d.example") + "/", controls(AbortSignal.timeout(5000))));
  assert.equal(fixture.requests.length, 0);
  fixture.state.trusted = true;
  await assert.rejects(cmsFetch(fixture.origin("xn--7u3d.other.example") + "/", controls(AbortSignal.timeout(5000))));
  assert.equal(fixture.requests.length, 0);
  await assert.rejects(cmsFetch(fixture.origin("xn--7u3d.example") + "/", controls(AbortSignal.timeout(5000))));
  assert.equal(fixture.requests.length, 1, "redirect target must not receive a second request");
});

test("actual fixed-domain client retains declared and streaming response bounds", async t => {
  let declared = true;
  const fixture = await localHttps(t, async (_request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (declared) response.setHeader("Content-Length", "262145");
    else response.flushHeaders();
    response.end(" ".repeat(262145));
  });
  const client = new CmsClient({ serverUrl: fixture.origin("xn--7u3d.example"), connectionId, connectionSecret });
  await assert.rejects(client.connection(), error => !error.message.includes(connectionSecret));
  declared = false;
  await assert.rejects(client.connection(), error => !error.message.includes(connectionSecret));
  assert.equal(fixture.requests.length, 2);
});

test("fixed-domain HTTPS aborts pending headers and an active response stream", async t => {
  let reached;
  let reachedPromise = new Promise(resolve => { reached = resolve; });
  const fixture = await localHttps(t, async (request, response) => {
    if (request.url === "/body") { response.writeHead(200); response.write("partial"); }
    reached();
  });
  let controller = new AbortController();
  const pending = cmsFetch(fixture.origin("xn--7u3d.example") + "/headers", controls(controller.signal));
  await reachedPromise; controller.abort(); await assert.rejects(pending);
  reachedPromise = new Promise(resolve => { reached = resolve; }); controller = new AbortController();
  const response = await cmsFetch(fixture.origin("xn--7u3d.example") + "/body", controls(controller.signal));
  await reachedPromise;
  const reader = response.body.getReader(); assert.equal((await reader.read()).done, false);
  controller.abort(); await assert.rejects(reader.read()); reader.releaseLock();
});

test("ordinary fetch remains unchanged and a failed mutation is not retried through HTTPS", async t => {
  let calls = 0, fallback = 0;
  t.mock.method(https, "request", () => { fallback++; throw new Error("unexpected fallback"); });
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("ordinary network failure"); });
  const client = new CmsClient({ serverUrl: "https://forum.example", connectionId, connectionSecret });
  await assert.rejects(client.connection());
  assert.equal(calls, 1); assert.equal(fallback, 0);
  const invalid = [
    { ...controls(), redirect: "follow" }, { ...controls(), credentials: "include" },
    { ...controls(), body: "not-a-GET-body" },
    { ...controls(), method: "POST", body: "x".repeat(65537) },
    { ...controls(), headers: { "Accept-Encoding": "identity", Cookie: "not-allowed" } },
  ];
  for (const init of invalid) await assert.rejects(cmsFetch("https://xn--7u3d.example/", init));
  assert.equal(fallback, 0);
});
