import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { toFixture, nativeSource } from "./cms-to.mjs";
import { validateCmsRoute, projectGeneratedReadMoreMove } from "../../src/private/cms-runtime.mjs";

export async function sourceMoveFixture(t, article = "Native body. [Original target](../target/)\n\n![Public native image](/image.png)") {
  const state = await toFixture(t, nativeSource(article, 'authors:\n  - id: native-one\n    name: First native\n  - id: native-two\n    name: Second native\nprimaryAuthor: native-one\n'), "53");
  const original = state.options.controlledCreation.fetchImplementation, mutations = new Map(), moves = new Map(), calls = [], history = [];
  const control = { losePrepare: false, loseFinalize: false, loseAbort: false, rejectFinalize: false, publicMode: "valid" };
  state.options.controlledCreation.fetchImplementation = async (value, init) => {
    const url = new URL(value), body = init.body && JSON.parse(init.body), prefix = `/discussion-bridge/v4/bridge-records/${state.state.record?.resource_id}/`;
    if (!url.pathname.startsWith(prefix) || !url.pathname.includes("source-url-moves") && !url.pathname.endsWith("url-history.json")) return original(value, init);
    if (url.pathname.endsWith("url-history.json")) return Response.json({ items: history, next_cursor: null });
    const kind = url.pathname.endsWith("finalize.json") ? "V4-29" : url.pathname.endsWith("abort.json") ? "V4-30" : "V4-28", moveId = url.pathname.split("/").at(-2);
    validateCmsRoute(kind, { body, path: { resource_id: state.state.record.resource_id, ...(kind === "V4-28" ? {} : { move_id: moveId }) } });
    calls.push({ kind, body: structuredClone(body), raw: init.body });
    const prior = mutations.get(body.mutation_id);
    if (prior) { assert.deepEqual(body, prior.body); return Response.json(prior.result, { status: prior.status }); }
    assert.equal(body.expected_source_revision, state.state.record.source_revision);
    let result, status = 200;
    if (kind === "V4-28") {
      assert.equal(body.old_url, state.state.record.canonical_url); assert.equal(body.external_id, state.state.record.external_id);
      result = { move_id: randomUUID(), resource_id: state.state.record.resource_id, expected_source_revision: body.expected_source_revision, old_url: body.old_url, new_url: body.new_url,
        proof_nonce: randomBytes(32).toString("base64url"), state: "prepared", prepared_at: new Date().toISOString() };
      moves.set(result.move_id, result); status = 201;
    } else {
      const move = moves.get(moveId); assert.ok(move); assert.equal(body.move_id, moveId);
      if (kind === "V4-29") {
        if (control.rejectFinalize) return Response.json({ outcome: "rejected", code: "content_preservation_unavailable", retryable: false, retry_after_seconds: null, correlation_id: null, core_fallback: false }, { status: 422 });
        assert.equal(body.proof_nonce, move.proof_nonce); assert.equal(body.verification.url, move.new_url); assert.equal(body.verification.source_revision, body.new_source_revision);
        assert.equal(body.verification.source_content_sha256, state.state.input.source_content_sha256);
        const before = structuredClone(state.state.input);
        state.state.input = before.representation.kind === "generated_excerpt" ? projectGeneratedReadMoreMove(before, move.new_url, body.new_source_revision, body.source_updated_at)
          : { ...before, canonical_url: move.new_url, source_revision: body.new_source_revision, expected_source_revision: before.source_revision };
        state.state.record.canonical_url = move.new_url; state.state.record.source_revision = body.new_source_revision; move.state = "committed";
        history.push({ url: move.old_url, retired_at: new Date().toISOString(), move_id: moveId }); result = structuredClone(state.state.record);
      } else { move.state = body.native_change_applied ? "attention" : "aborted"; result = structuredClone(move); }
    }
    mutations.set(body.mutation_id, { body: structuredClone(body), result: structuredClone(result), status });
    const lost = kind === "V4-28" ? "losePrepare" : kind === "V4-29" ? "loseFinalize" : "loseAbort";
    if (control[lost]) { control[lost] = false; throw new Error("Test-owned lost accepted move response"); }
    return Response.json(result, { status });
  };
  const requests = [];
  const server = createServer(async (req, res) => {
    requests.push({ url: req.url, headers: req.headers });
    try {
      if (control.publicMode === "redirect") { res.writeHead(302, { location: "/wrong/" }); return res.end(); }
      const url = new URL(req.url, "http://fixture.invalid"), relative = decodeURIComponent(url.pathname), file = path.join(state.root, "dist", relative.endsWith("/") ? relative + "index.html" : relative);
      let data = await readFile(file);
      if (file.endsWith(".html")) {
        if (control.publicMode === "body") data = Buffer.from(data.toString().replace("Native body.", "Changed public body."));
        if (control.publicMode === "nonce") data = Buffer.from(data.toString().replace(/data-discussionbridge-source-nonce="[^"]+"/u, 'data-discussionbridge-source-nonce="wrong"'));
        res.setHeader("content-type", "text/html; charset=utf-8");
      }
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  // Actual anonymous loopback bytes are used; this explicit test transport
  // maps the configured example origin to the owned local server only.
  const fetchPublic = async (url, init) => {
    assert.equal(new URL(url).origin, "https://astro.example"); assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error");
    assert.deepEqual(Object.keys(init.headers).sort(), ["Accept", "Accept-Encoding"].sort());
    const response = await fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, init);
    return new Response(response.body, { status: response.status, headers: response.headers });
  };
  async function receiverBridge() {
    const receiver = createServer(async (req, res) => {
      try { const chunks = []; for await (const chunk of req) chunks.push(chunk); const body = Buffer.concat(chunks).toString("utf8");
        const response = await state.options.controlledCreation.fetchImplementation(`https://forum.example${req.url}`, { method: req.method, ...(body ? { body } : {}), headers: req.headers, redirect: "error", credentials: "omit" });
        res.writeHead(response.status, { "content-type": "application/json" }); res.end(await response.text());
      } catch { res.writeHead(500, { "content-type": "text/plain" }); res.end("Test-owned receiver bridge failed"); }
    });
    await new Promise(resolve => receiver.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise(resolve => { receiver.close(resolve); receiver.closeAllConnections(); }));
    return `http://127.0.0.1:${receiver.address().port}`;
  }
  return { ...state, moveCalls: calls, moves, control, requests, fetchPublic, receiverBridge };
}
