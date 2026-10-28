import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolveServerSecret } from "../dist/server-secret.js";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";

async function fixture(t) { const parent = fileURLToPath(new URL("../.tmp/", import.meta.url)); await mkdir(parent, { recursive: true }); return ownedTempFixture(t, "discussionbridge-astro-secret-", parent); }
test("protected native server secret is read without retaining its private path", async (t) => {
  const root = await fixture(t);
  const secretFile = path.join(root, "secret.txt");
  const secret = "s".repeat(40);
  await writeFile(secretFile, `${secret}\n`, { mode: 0o600 });
  const resolved = await resolveServerSecret({ secretFile });
  assert.equal(resolved.connectionSecret, secret);
  assert.equal(resolved.secretFile, undefined);
});

test("ambiguous, relative, malformed and oversized secret files fail before dispatch", async (t) => {
  const root = await fixture(t);
  const secretFile = path.join(root, "secret.txt");
  await writeFile(secretFile, "s".repeat(40), { mode: 0o600 });
  await assert.rejects(() => resolveServerSecret({ connectionSecret: "s".repeat(40), secretFile }), /Choose one/);
  await assert.rejects(() => resolveServerSecret({ secretFile: "relative.txt" }), /absolute/);
  for (const bytes of [Buffer.from("s".repeat(31)), Buffer.from("s".repeat(400)), Buffer.from(`s${"s".repeat(39)}\ninside`), Buffer.from([0xff])]) {
    await writeFile(secretFile, bytes, { mode: 0o600 });
    await assert.rejects(() => resolveServerSecret({ secretFile }));
  }
});
