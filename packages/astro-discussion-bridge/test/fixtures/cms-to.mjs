import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCmsRoute, validateGeneratedSelection } from "../../src/private/cms-runtime.mjs";
import { ownedTempFixture } from "../helpers/owned-temp.mjs";
import { connection as fromConnection, uuid } from "./cms-coordinator.mjs";
export const nativeSource = (body = "Native body.", extra = "") => `---\ntitle: Native title\ndiscussionCommentsDisplay: interactive\ndiscussionSync: true\ndate: 2026-09-01T08:00:00.000Z\nlastUpdated: 2026-10-01T09:00:00.000Z\nconsumerField: retained\n${extra}---\n${body}\n`;
export async function toFixture(t, source = nativeSource(), topicId = "9223372036854775807") {
  const parent = fileURLToPath(new URL("../../.tmp/", import.meta.url)); await mkdir(parent, { recursive: true });
  const root = await ownedTempFixture(t, "discussionbridge-v4-native-to-", parent), docsDir = path.join(root, "src/content/docs"), file = path.join(docsDir, "source.md");
  await mkdir(docsDir, { recursive: true }); await writeFile(file, source);
  const received = [], rawBodies = [], withdrawals = [], mutations = new Map(), withdrawalMutations = new Map();
  const state = { record: undefined, input: undefined, creations: 0, lostResponse: false, lostWithdrawal: false, disabled: false, onDetail: undefined, onResolve: undefined };
  const connection = { ...fromConnection, directions: ["to_discourse"], policy: { ...fromConnection.policy, enabled: false } };
  const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  const options = { docsDir, stateFile: path.join(root, ".discussionbridge/to-state.json"), siteUrl: "https://astro.example", discourseUrl: "https://forum.example", routeBase: "articles",
    controlledCreation: { connectionId: connection.connection_id, connectionSecret: "synthetic-secret".repeat(3), lane: "docs", fetchImplementation: async (value, init) => {
      const url = new URL(value); assert.equal(url.origin, "https://forum.example"); assert.match(url.pathname, /^\/discussion-bridge\/v4\//); assert.equal(init.redirect, "error");
      if (state.disabled) return response({ outcome: "rejected", code: "connection_disabled", retryable: false, retry_after_seconds: null, safe_detail: null }, 403);
      if (url.pathname.endsWith("connection.json")) return response(connection);
      if (url.pathname === `/discussion-bridge/v4/bridge-records/${uuid(41)}.json`) { await state.onDetail?.(); return response(state.record); }
      if (url.pathname.endsWith("withdraw.json")) {
        const body = JSON.parse(init.body); validateCmsRoute("V4-05", { body, path: { resource_id: uuid(41) } }); withdrawals.push(body);
        const old = withdrawalMutations.get(body.mutation_id); if (old) { assert.deepEqual(body, old.body); return response(old.result); }
        assert.equal(body.expected_source_revision, state.record.source_revision); state.record.state = "withdrawn";
        const result = structuredClone(state.record); withdrawalMutations.set(body.mutation_id, { body: structuredClone(body), result });
        if (state.lostWithdrawal) { state.lostWithdrawal = false; throw new Error("Synthetic lost accepted withdrawal."); } return response(result);
      }
      assert.equal(url.pathname, "/discussion-bridge/v4/bridge-records/resolve.json");
      const body = JSON.parse(init.body); validateCmsRoute("V4-02", { body }); received.push(body); rawBodies.push(init.body);
      const old = mutations.get(body.mutation_id); if (old) { assert.deepEqual(body, old.body); return response(old.result, old.result.outcome === "created" ? 201 : 200); }
      const record = body.bridge_record; assert.equal(record.expected_source_revision, state.record?.source_revision ?? null);
      if (record.representation.kind === "generated_excerpt") validateGeneratedSelection(record, state.input ?? null);
      const outcome = !state.record ? "created" : state.record.source_revision === record.source_revision ? "resolved" : "updated";
      if (!state.record) state.creations++;
      assert.notEqual(state.record?.state, "withdrawn");
      state.record = { resource_id: uuid(41), direction: "to_discourse", state: "active", topic_id: topicId, topic_url: `https://forum.example/t/native/${topicId}`,
        external_id: record.external_id, canonical_url: record.canonical_url, source_revision: record.source_revision, source_created_at: record.source_created_at, source_updated_at: record.source_updated_at, synchronized_at: new Date().toISOString(), mapping_id: null };
      state.input = structuredClone(record);
      const result = { outcome, reason: outcome === "created" ? "record_created" : outcome === "updated" ? "source_revision_updated" : "already_resolved", resource_id: state.record.resource_id,
        topic_id: state.record.topic_id, topic_url: state.record.topic_url, direction: "to_discourse", source_revision: record.source_revision, synchronized_at: state.record.synchronized_at, core_fallback: false };
      mutations.set(body.mutation_id, { body: structuredClone(body), result }); await state.onResolve?.();
      if (state.lostResponse) { state.lostResponse = false; throw new Error("Synthetic lost accepted source response."); } return response(result, outcome === "created" ? 201 : 200);
    } } };
  return { root, docsDir, file, options, state, received, rawBodies, withdrawals, mutations, withdrawalMutations, digest: value => createHash("sha256").update(value).digest("hex"), journal: async () => JSON.parse(await readFile(options.stateFile, "utf8")) };
}
