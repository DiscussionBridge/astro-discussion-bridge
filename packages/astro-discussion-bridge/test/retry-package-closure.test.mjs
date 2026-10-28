import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as creation from "../dist/controlled-creation.js";
import { CmsClient, CmsRequestError } from "../dist/cms-client.js";
import { resolveCmsToPage } from "../dist/cms-to.js";
import { captureNativeArticle, completeNativePreparation } from "../dist/native-preparation.js";
import { semanticIdentity } from "../src/private/cms-runtime.mjs";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";

const runCli = args => promisify(execFile)(process.execPath, ["--import", new URL("./register-runtime.mjs", import.meta.url).href,
  fileURLToPath(new URL("../dist/cli.js", import.meta.url)), ...args], {
  windowsHide: true, timeout: 30_000, env: { SYSTEMROOT: process.env.SYSTEMROOT, PATH: process.env.PATH },
});

test("packaged controlled-creation subpath exposes the selected-source retry action", () => {
  assert.equal(typeof creation.stageControlledSourceRetry, "function");
});

test("packaged CLI recognizes retry-source before checking its required local arguments", async () => {
  await assert.rejects(runCli(["retry-source"]), error => {
    assert.match(error.stderr, /Native command requires state-file/);
    assert.doesNotMatch(error.stderr, /A current native DiscussionBridge command is required/);
    return true;
  });
});

for (const code of ["invalid_field", "content_preservation_unavailable"]) test(`consumed source engine retains exact ${code}422 and suppresses unchanged retransmission`, async t => {
  const calls = [], snapshots = [], html = "<p>Native body.</p>", pageUrl = "https://astro.example/articles/source/";
  const client = new CmsClient({ serverUrl: "https://forum.example", connectionId: `dbc_${"a".repeat(24)}`,
    connectionSecret: "synthetic-unused-secret-value-0000", fetchImplementation: async (_url, init) => {
      calls.push(init.body);
      return Response.json({ outcome: "rejected", code, retryable: false, retry_after_seconds: null, correlation_id: null, core_fallback: false }, { status: 422 });
    } });
  const page = { preparation: completeNativePreparation(captureNativeArticle("Native body.", pageUrl, "markdown"), html, html),
    pageUrl, title: "Native source", externalId: "native-retry-package-source", contentHtml: html, createdAt: null, updatedAt: null };
  const operation = { externalId: page.externalId, canonicalUrl: pageUrl, correlationId: "11111111-1111-4111-8111-111111111111", attempts: 1, outcome: "pending" };
  const connection = { connection_id: `dbc_${"a".repeat(24)}`, profile: "astro", directions: ["to_discourse"], destination_origin: "https://astro.example", publication_lane: "docs", scope_revision: "scope-retry-package" };
  const input = { client, connection, operation, page, excerptArticle: () => { throw new Error("Unexpected excerpt"); },
    persist: async () => snapshots.push(structuredClone(operation)), assertCurrentNative: async () => {} };
  const refused = error => error instanceof CmsRequestError && error.code === code && error.routeId === "V4-02" && error.httpStatus === 422 && error.retryable === false;
  await assert.rejects(resolveCmsToPage(input), refused);
  const pending = structuredClone(operation.to.pending);
  await assert.rejects(resolveCmsToPage(input), refused);
  assert.equal(calls.length, 1, "a definite nonretryable refusal is not dispatched again");
  assert.equal(pending.rejection.code, code); assert.equal(pending.rejection.validatedResponse.envelope.code, code);
  assert.deepEqual(operation.to.pending, pending);
  assert.equal(semanticIdentity(operation.to.rejectedRequests[pending.body.mutation_id]), semanticIdentity(pending));
  assert.deepEqual(snapshots.at(-1).to.pending, pending);
  if (code === "invalid_field") {
    const root = await ownedTempFixture(t, "discussionbridge-retry-status-"), file = path.join(root, "state.json");
    t.diagnostic(`Owned CLI status fixture: ${root}`);
    await writeFile(file, JSON.stringify({ format: 1, wireVersion: "v4", adapterId: "astro-discussion-bridge", operations: { [operation.externalId]: operation } }));
    const { stdout } = await runCli(["source-status", "--state-file", file]);
    const status = JSON.parse(stdout)[0];
    assert.equal(status.rejection.mutationId, pending.body.mutation_id);
    assert.equal(status.rejection.code, code); assert.equal(status.rejection.httpStatus, 422);
    assert.deepEqual(status.retries, []);
    assert.doesNotMatch(stdout, /synthetic-unused-secret|content_html|Native body/);
  }
});

test("packaged declarations expose retry action, durable intent and both exact refusal types", async () => {
  const action = await readFile(new URL("../dist/controlled-creation.d.ts", import.meta.url), "utf8");
  const state = await readFile(new URL("../dist/cms-to.d.ts", import.meta.url), "utf8");
  assert.match(action, /stageControlledSourceRetry\(/);
  assert.match(state, /interface CmsToRetryIntent/);
  assert.match(state, /code: "invalid_field"/);
  assert.match(state, /code: "content_preservation_unavailable"/);
  assert.match(state, /retryOf\?: string/);
});
