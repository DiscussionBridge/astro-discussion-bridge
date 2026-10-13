import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { resolveServerSecret } from "../dist/server-secret.js";
import { resolveControlledCreation } from "../dist/controlled-creation.js";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";

test("protected server secret is bounded, validated and supplied only to authenticated transport", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-secret-");
  const secretFile = path.join(root, "secret.txt");
  const secret = "s".repeat(40);
  await writeFile(secretFile, `${secret}\n`, { mode: 0o600 });
  const resolved = await resolveServerSecret({ secretFile });
  assert.equal(resolved.connectionSecret, secret);
  assert.equal(resolved.secretFile, undefined);
  const prior = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.headers["X-DiscussionBridge-Secret"], secret);
    assert.doesNotMatch(init.body, /secret.txt|ssssssss/);
    return new Response(JSON.stringify({ outcome: "created", resource_id: "11111111-1111-4111-8111-111111111111", topic_id: 53, topic_url: "https://forum.example/t/source/53", direction: "to_discourse", core_fallback: false }), { status: 201, headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = prior; });
  assert.equal((await resolveControlledCreation({ discourseUrl: "https://forum.example", options: { connectionId: "dbc_aaaaaaaaaaaaaaaaaaaaaaaa", secretFile }, sourceUrl: "https://site.example/source", title: "Source", contentHtml: "<p>Source</p>" })).topicId, 53);
});

test("ambiguous, relative, malformed and oversized secret files fail before dispatch", async (t) => {
  const root = await ownedTempFixture(t, "discussionbridge-astro-secret-");
  const secretFile = path.join(root, "secret.txt");
  await writeFile(secretFile, "s".repeat(40), { mode: 0o600 });
  await assert.rejects(() => resolveServerSecret({ connectionSecret: "s".repeat(40), secretFile }), /Choose one/);
  await assert.rejects(() => resolveServerSecret({ secretFile: "relative.txt" }), /absolute/);
  for (const bytes of [Buffer.from("s".repeat(31)), Buffer.from("s".repeat(400)), Buffer.from(`s${"s".repeat(39)}\ninside`), Buffer.from([0xff])]) {
    await writeFile(secretFile, bytes, { mode: 0o600 });
    await assert.rejects(() => resolveServerSecret({ secretFile }));
  }
});
