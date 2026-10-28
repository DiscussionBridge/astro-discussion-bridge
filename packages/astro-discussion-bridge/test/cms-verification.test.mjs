import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { ASTRO_VERIFICATION_PROFILE, verifyCmsAbsence, verifyCmsPublication } from "../dist/cms-verification.js";
import { buildCmsConsumer, staticFixture } from "./fixtures/cms-static.mjs";

test("actual isolated Astro build and anonymous loopback bytes produce action/revision/mode-bound native proof", async t => {
  const state = await staticFixture(t, { source_authors: [{ id: "author:1", name: "First author" }, { id: "author:2", name: "Second author" }] });
  await state.prepare();
  const built = await buildCmsConsumer(state);
  assert.match(built, /First author/); assert.match(built, /Second author/);
  const expected = await state.expectation(built);
  const requests = [];
  const server = createServer((request, response) => { requests.push(request.headers); response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(built); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const deployment = { deploymentId: "synthetic-build-1", deployedAt: new Date().toISOString() };
  const proof = await verifyCmsPublication(expected, deployment, async (url, init) => {
    assert.equal(url, expected.url); assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error");
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, init);
    // Logical HTTPS canonical response for an explicitly isolated loopback IO seam.
    return new Response(response.body, { status: response.status, headers: response.headers });
  });
  assert.equal(proof.verification_profile, ASTRO_VERIFICATION_PROFILE);
  assert.equal(proof.source_content_sha256, state.sourceRecord.content_sha256);
  assert.notEqual(proof.native_publication_sha256, proof.source_content_sha256);
  assert.ok(Date.parse(proof.checked_at) >= Date.parse(deployment.deployedAt));
  assert.equal(requests.length, 1); assert.equal(requests[0].authorization, undefined); assert.equal(requests[0].cookie, undefined);
  assert.equal(requests[0]["x-discussionbridge-secret"], undefined); assert.equal(requests[0]["x-discussionbridge-connection"], undefined);
  const publicResponse = text => async () => new Response(text, { headers: { "Content-Type": "text/html" } });
  await assert.rejects(verifyCmsPublication(expected, deployment, publicResponse(built.replace("Complete native source.", "Stale content with copied markers."))), /differs/);
  await assert.rejects(verifyCmsPublication({ ...expected, builtHtml: built.replace("Complete native source.", "Stale build with copied markers.") }, deployment, publicResponse(built)), /complete prepared content/);
  await assert.rejects(verifyCmsPublication(expected, deployment, publicResponse(built.replace('data-discussionbridge-cms-mode="full"', 'data-discussionbridge-cms-mode="interactive"'))), /identity\/revision\/mode/);
  await assert.rejects(verifyCmsPublication(expected, deployment, publicResponse(built.replace("</body>", `${built.match(/<article[\s\S]*?<\/article>/u)[0]}</body>`))), /ambiguous/);
  await assert.rejects(verifyCmsPublication(expected, deployment, async () => new Response(null, { status: 302, headers: { Location: "https://astro.example/login" } })), /redirects/);
});

test("public withdrawal proof requires actual anonymous404/410, never marker or login success", async () => {
  const now = new Date().toISOString(), deployment = { deploymentId: "withdraw-build", deployedAt: now };
  for (const status of [404, 410]) assert.equal((await verifyCmsAbsence("https://astro.example/owned/", "owned.md", now, deployment, async () => new Response(null, { status }))).http_status, status);
  for (const status of [200, 403]) await assert.rejects(verifyCmsAbsence("https://astro.example/owned/", "owned.md", now, deployment, async () => new Response("login", { status })), /404 or410/);
});

test("complete large native content is not limited by CMS metadata response caps", async t => {
  const cooked = `<p>${"Large complete Unicode Ελληνικά source. ".repeat(12000)}</p>`;
  const state = await staticFixture(t, {}, cooked); await state.prepare();
  const built = await buildCmsConsumer(state); assert.ok(Buffer.byteLength(built) > 262144);
  const expected = await state.expectation(built), deployment = { deploymentId: "large-build", deployedAt: new Date().toISOString() };
  await verifyCmsPublication(expected, deployment, async () => new Response(built, { headers: { "Content-Type": "text/html" } }));
  await assert.rejects(verifyCmsPublication(expected, deployment, async () => new Response(new Uint8Array([0xc3, 0x28]), { headers: { "Content-Type": "text/html" } })), /encoded data/);
  await assert.rejects(verifyCmsPublication(expected, deployment, async () => new Response(built, { headers: { "Content-Type": "text/html", "Content-Length": "999999999" } })), /artifact budget/);
});
