import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CmsClient, CmsRequestError, validatedCmsErrorResponse } from "../dist/cms-client.js";
import { publishControlledDiscussions } from "../dist/controlled-creation.js";
import { semanticIdentity } from "../src/private/cms-runtime.mjs";
import { nativeSource, toFixture } from "./fixtures/cms-to.mjs";
import { buildToConsumer } from "./fixtures/native-to-consumer.mjs";
import { ownedPng } from "./helpers/native-png.mjs";

const errorBody = { outcome: "rejected", code: "content_preservation_unavailable", retryable: false, retry_after_seconds: null, correlation_id: null, core_fallback: false };
const rejected = error => error instanceof CmsRequestError && error.code === errorBody.code && error.routeId === "V4-02" && error.httpStatus === 422 && error.retryable === false && error.retryAfterSeconds === null;
const operation = async state => Object.values((await state.journal()).operations)[0];
function intercept(state, response = () => Response.json(errorBody, { status: 422 })) {
  const original = state.options.controlledCreation.fetchImplementation, calls = [];
  let reject = true;
  state.options.controlledCreation.fetchImplementation = async (url, init) => {
    if (new URL(url).pathname.endsWith("/resolve.json")) { calls.push(init.body); if (reject) return response(); }
    return original(url, init);
  };
  return { calls, allow() { reject = false; } };
}

test("definitive typed422 survives native build restart/status without repeat; changed current first snapshot uses ordinary creation", async t => {
  const state = await toFixture(t, nativeSource(), "53"), intercepted = intercept(state), before = await readFile(state.file, "utf8");
  await assert.rejects(buildToConsumer(state), rejected);
  const first = await operation(state), pending = structuredClone(first.to.pending), history = structuredClone(first.to.rejectedRequests);
  assert.equal(pending.rejection.requestSha256, state.digest(semanticIdentity(pending.body)));
  assert.equal(await readFile(state.file, "utf8"), before); assert.equal(state.state.creations, 0);
  await assert.rejects(buildToConsumer(state), rejected);
  assert.equal(intercepted.calls.length, 1); assert.deepEqual((await operation(state)).to.pending, pending);
  const { stdout } = await promisify(execFile)(process.execPath, ["--import", new URL("./register-runtime.mjs", import.meta.url).href, fileURLToPath(new URL("../dist/cli.js", import.meta.url)), "source-status", "--state-file", state.options.stateFile], { windowsHide: true });
  const status = JSON.parse(stdout)[0]; assert.equal(status.rejection.code, errorBody.code); assert.equal(status.rejection.httpStatus, 422); assert.equal(status.rejection.retryable, false);
  assert.doesNotMatch(stdout, /synthetic-secret|content_html|lease_token/);
  intercepted.allow();
  // A receiver-side change alone is not a readiness signal for identical input.
  await assert.rejects(publishControlledDiscussions(state.options), rejected); assert.equal(intercepted.calls.length, 1);
  await writeFile(state.file, before.replace("Native body.", "Genuinely changed current native source."));
  const output = await buildToConsumer(state); assert.match(output, /Genuinely changed/);
  const next = await operation(state);
  assert.equal(intercepted.calls.length, 2); assert.equal(state.state.creations, 1);
  assert.equal(state.received[0].bridge_record.expected_source_revision, null);
  assert.notEqual(state.received[0].mutation_id, pending.body.mutation_id);
  assert.deepEqual(next.to.rejectedRequests, history); assert.equal(next.to.pending, undefined);
});

test("changed snapshot after known rejection requires the actual current accepted predecessor and preserves prior history", async t => {
  const state = await toFixture(t); await publishControlledDiscussions(state.options);
  const accepted = structuredClone(await operation(state)), source = await readFile(state.file, "utf8"), intercepted = intercept(state);
  await writeFile(state.file, source.replace("Native body.", "Rejected current native edition."));
  await assert.rejects(publishControlledDiscussions(state.options), rejected);
  const known = structuredClone((await operation(state)).to.pending);
  await writeFile(state.file, source.replace("Native body.", "Another genuine current native edition."));
  intercepted.allow(); state.state.record.source_revision = "unrelated-receiver-revision";
  await assert.rejects(publishControlledDiscussions(state.options), /exact current accepted predecessor/);
  assert.equal(intercepted.calls.length, 1); assert.deepEqual((await operation(state)).to.pending, known);
  state.state.record.source_revision = accepted.to.acceptedRevision;
  await publishControlledDiscussions(state.options);
  const current = await operation(state);
  assert.equal(state.received.at(-1).bridge_record.expected_source_revision, accepted.to.acceptedRevision);
  assert.equal(state.state.creations, 1); assert.deepEqual(current.to.rejectedRequests[known.body.mutation_id], known);
  assert.deepEqual(current.to.receipts[accepted.to.acceptedBody.mutation_id], accepted.to.receipts[accepted.to.acceptedBody.mutation_id]);
});

test("malformed/invalid/transport outcomes remain uncertain exact replay rather than known rejection", async t => {
  for (const [name, response] of [["invalid retry", () => Response.json({ ...errorBody, retryable: true }, { status: 422 })], ["wrong status", () => Response.json(errorBody, { status: 400 })], ["extra field", () => Response.json({ ...errorBody, extra: true }, { status: 422 })], ["unknown code", () => Response.json({ ...errorBody, code: "unknown_preservation_code" }, { status: 422 })], ["spoofed local error", () => { throw new CmsRequestError(errorBody.code, false, null, "V4-02", 422); }], ["transport", () => { throw new Error("Synthetic interrupted response"); }]]) await t.test(name, async child => {
    const state = await toFixture(child), intercepted = intercept(state, response);
    await assert.rejects(publishControlledDiscussions(state.options), error => !rejected(error));
    const before = structuredClone((await operation(state)).to.pending);
    assert.equal(before.rejection, undefined); assert.equal((await operation(state)).to.rejectedRequests, undefined);
    intercepted.allow(); await publishControlledDiscussions(state.options);
    assert.equal(intercepted.calls[0], intercepted.calls[1]); assert.deepEqual(JSON.parse(intercepted.calls[1]), before.body); assert.equal(state.state.creations, 1);
  });
});

test("wrong-route newcode cannot become a rejection receipt or change an uncertain exact source request", async t => {
  const state = await toFixture(t); await publishControlledDiscussions(state.options);
  const source = await readFile(state.file, "utf8"); await writeFile(state.file, source.replace("Native body.", "Current native edit."));
  const original = state.options.controlledCreation.fetchImplementation; let rejectResolve = true, rejectDetail = false;
  state.options.controlledCreation.fetchImplementation = async (url, init) => {
    if (new URL(url).pathname.endsWith("/resolve.json") && rejectResolve) throw new Error("Synthetic unresolved transport");
    if (new URL(url).pathname.endsWith(`/${state.state.record.resource_id}.json`) && rejectDetail) return Response.json(errorBody, { status: 422 });
    return original(url, init);
  };
  await assert.rejects(publishControlledDiscussions(state.options));
  const pending = structuredClone((await operation(state)).to.pending);
  rejectDetail = true;
  await assert.rejects(publishControlledDiscussions(state.options), error => !rejected(error));
  assert.deepEqual((await operation(state)).to.pending, pending); assert.equal((await operation(state)).to.rejectedRequests, undefined);
  rejectDetail = false; rejectResolve = false; await publishControlledDiscussions(state.options);
  assert.deepEqual(state.received.at(-1), pending.body);
});

test("a locally constructed matching error has no active-codec request provenance", () => {
  const state = { serverUrl: "https://forum.example", connectionId: "dbc_0123456789abcdef01234567", connectionSecret: "s".repeat(32) };
  const client = new CmsClient(state), fake = new CmsRequestError(errorBody.code, false, null, "V4-02", 422);
  assert.equal(validatedCmsErrorResponse(fake, client, "V4-02", {}), undefined);
});

test("actual native asset handoff can capture a genuine new snapshot after definite rejection without rewriting the old one", async t => {
  const article = "![Native image](../assets/native.png)", state = await toFixture(t, nativeSource(article), "53"), intercepted = intercept(state);
  await mkdir(path.join(state.root, "src/content/assets"), { recursive: true }); await writeFile(path.join(state.root, "src/content/assets/native.png"), ownedPng());
  await assert.rejects(buildToConsumer(state, undefined, true), rejected);
  const known = structuredClone((await operation(state)).to.pending);
  await assert.rejects(buildToConsumer(state, undefined, true), rejected); assert.equal(intercepted.calls.length, 1);
  await writeFile(state.file, (await readFile(state.file, "utf8")) + "Genuine current native addition.\n"); intercepted.allow();
  const output = await buildToConsumer(state, undefined, true); assert.match(output, /Genuine current native addition/);
  const after = await operation(state);
  assert.deepEqual(after.to.rejectedRequests[known.body.mutation_id], known); assert.equal(after.nativeRender, undefined); assert.equal(state.state.creations, 1);
});
