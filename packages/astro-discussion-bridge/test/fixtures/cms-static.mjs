import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { build } from "astro";
import discussionBridge from "../../dist/index.js";
import { claimCmsNativeWork, cmsNativeReservation, pollCmsSources, reserveCmsSource } from "../../dist/cms-coordinator.js";
import { prepareCmsNativeWork } from "../../dist/cms-static.js";
import { ownedTempFixture } from "../helpers/owned-temp.mjs";
import { connection, connectionId, event, html, lease, mapping, source, uuid } from "./cms-coordinator.mjs";

export async function staticFixture(t, modifications = {}, cooked = html, mode = "full", initialize = true) {
  const parent = fileURLToPath(new URL("../../.tmp/", import.meta.url)); await mkdir(parent, { recursive: true });
  const root = await ownedTempFixture(t, "discussionbridge-astro-cms-static-", parent);
  let nativeMapping;
  let nativeWork = structuredClone(lease.work);
  const sourceRecord = { ...source, content_bytes: Buffer.byteLength(cooked), content_sha256: createHash("sha256").update(cooked).digest("hex"), ...modifications };
  const receiverConnection = structuredClone(connection);
  receiverConnection.policy.presentation_mode = mode;
  const prepared = [], finalized = [], aborted = [], failures = [];
  const movePrepared = [], moveFinalized = [], moveAborted = [], moveReceipts = new Map(); let nativeMove;
  let contentCalls = 0, uncertain = "", queryMismatch = false;
  let claimedOnce = false;
  let changes = [], eventSequence = 10;
  const expires = new Date(Date.now() + 300000).toISOString();
  const query = () => ({ work: queryMismatch ? { ...nativeWork, source_revision: "wrong-current-revision" } : nativeWork, mapping: nativeMapping, lease_expires_at: expires });
  const options = { docsDir: path.join(root, "src/content/publications"), stateFile: path.join(root, ".discussionbridge/state.json"),
    siteUrl: "https://astro.example", serverUrl: "https://forum.example", connectionId, connectionSecret: "s".repeat(32),
    fetchImplementation: async (url, init) => {
      const endpoint = new URL(url);
      if (endpoint.pathname.endsWith("connection.json")) return Response.json(receiverConnection);
      if (endpoint.pathname.endsWith("sources.json")) { const items = endpoint.searchParams.get("stream") === "initial" ? [{ ...event, source: sourceRecord }] : changes; changes = []; return Response.json({ stream: endpoint.searchParams.get("stream"), items, next_cursor: null, checkpoint_cursor: "Y2hlY2s" }); }
      if (endpoint.pathname.endsWith("mappings/prepare.json")) { nativeMapping = { ...(nativeMapping ?? mapping(JSON.parse(init.body))), presentation_mode: mode, desired_source_revision: sourceRecord.source_revision }; return Response.json(nativeMapping, { status: 201 }); }
      if (endpoint.pathname.endsWith("claim.json")) { if (claimedOnce) return new Response(null, { status: 204 }); claimedOnce = true; }
      if (endpoint.pathname.endsWith("claim.json") || endpoint.pathname.endsWith("renew.json")) return Response.json({ ...lease, lease_generation: nativeWork.lease_generation, lease_token: Buffer.alloc(32, nativeWork.lease_generation + 6).toString("base64url"), work: nativeWork, server_time: new Date().toISOString(), expires_at: expires });
      if (endpoint.pathname.includes("/sources/") && endpoint.pathname.endsWith("content.json")) {
        contentCalls++;
        const offset = Number(endpoint.searchParams.get("offset")), bytes = Buffer.from(cooked), end = Math.min(offset + 32768, bytes.length);
        return Response.json({ source_id: sourceRecord.source_id, source_revision: sourceRecord.source_revision, content_sha256: sourceRecord.content_sha256, content_bytes: sourceRecord.content_bytes, offset, next_offset: end === bytes.length ? null : end, content_base64: bytes.subarray(offset, end).toString("base64") });
      }
      const body = init.body && JSON.parse(init.body);
      if (endpoint.pathname.includes("/url-moves")) {
        let result, operation;
        const previous = moveReceipts.get(body.mutation_id);
        if (previous) { assert.deepEqual(body, previous.body); return Response.json(previous.result); }
        assert.equal(body.authority.lease_generation, nativeWork.lease_generation);
        assert.equal(body.authority.work_id, nativeWork.work_id); assert.equal(nativeWork.state, "leased");
        if (endpoint.pathname.endsWith("url-moves.json")) {
          assert.equal(body.expected_mapping_revision, nativeMapping.mapping_revision); assert.equal(body.old_url, nativeMapping.canonical_url);
          assert.equal(body.ownership.source_revision, nativeMapping.synchronized_source_revision);
          operation = "move-prepare"; movePrepared.push(body);
          nativeMove = { move_id: uuid(800 + nativeWork.lease_generation), mapping_id: nativeMapping.mapping_id, expected_mapping_revision: body.expected_mapping_revision,
            old_url: body.old_url, new_url: body.new_url, proof_nonce: Buffer.alloc(32, 11).toString("base64url"), state: "prepared", prepared_at: new Date().toISOString() };
          result = structuredClone(nativeMove);
        } else if (endpoint.pathname.endsWith("finalize.json")) {
          operation = "move-finalize"; moveFinalized.push(body); assert.equal(body.proof_nonce, nativeMove.proof_nonce); assert.equal(body.verification.url, nativeMove.new_url);
          assert.equal(body.verification.source_revision, nativeWork.source_revision); assert.equal(body.ownership.native_id, nativeMapping.destination_native_id);
          nativeMove.state = "committed";
          nativeMapping = { ...nativeMapping, canonical_url: nativeMove.new_url, mapping_revision: `mapping-${nativeWork.lease_generation}`, retired_url_count: nativeMapping.retired_url_count + 1 };
          result = structuredClone(nativeMapping);
        } else {
          operation = "move-abort"; moveAborted.push(body); nativeMove.state = body.native_change_applied ? "attention" : "aborted";
          if (body.native_change_applied) nativeMapping = { ...nativeMapping, mapping_state: "attention" };
          result = structuredClone(nativeMove);
        }
        moveReceipts.set(body.mutation_id, { body: structuredClone(body), result });
        if (operation === uncertain) { uncertain = ""; throw new Error("URL move response lost after receiver commit"); }
        return Response.json(result);
      }
      let operation;
      if (endpoint.pathname.endsWith("/prepare.json")) {
        operation = "prepare"; prepared.push(body);
        nativeWork = { ...nativeWork, state: "synchronized" };
        nativeMapping = { ...nativeMapping, destination_native_id: body.native_result.native_id, destination_native_revision: body.native_result.native_revision, synchronized_source_revision: nativeWork.source_revision, synchronized_at: body.prepared_at };
      } else if (endpoint.pathname.endsWith("/finalize.json")) {
        operation = "finalize"; finalized.push(body); nativeWork = { ...nativeWork, state: "verified" };
        nativeMapping = { ...nativeMapping, mapping_state: nativeWork.action === "withdraw" ? "withdrawn" : "active", publicly_verified_source_revision: nativeWork.source_revision, publicly_verified_at: body.verification.checked_at };
      } else if (endpoint.pathname.endsWith("/abort.json")) { operation = "abort"; aborted.push(body); nativeWork = { ...nativeWork, state: "attention" }; }
      else if (endpoint.pathname.endsWith("/fail.json")) { operation = "fail"; failures.push(body); nativeWork = { ...nativeWork, state: "attention", last_failure_code: body.code }; }
      else assert.equal(endpoint.pathname, `/discussion-bridge/v4/work/${nativeWork.work_id}.json`);
      if (operation === uncertain) { uncertain = ""; throw new Error("Receipt response lost after receiver commit"); }
      return Response.json(query());
    },
  };
  if (initialize) { await pollCmsSources(options); await reserveCmsSource(options, sourceRecord.source_id); }
  const claimed = initialize ? await claimCmsNativeWork(options) : undefined;
  return { root, options, claimed, expectedWorkId: nativeWork.work_id, sourceRecord, prepared, finalized, aborted, failures, movePrepared, moveFinalized, moveAborted, get nativeWork() { return nativeWork; }, get contentCalls() { return contentCalls; }, get nativeMapping() { return nativeMapping; },
    loseNext(operation) { uncertain = operation; }, mismatchQuery() { queryMismatch = true; },
    async nextAction(action) {
      const generation = nativeWork.lease_generation + 1;
      nativeWork = { ...nativeWork, work_id: uuid(20 + generation), lease_generation: generation, source_revision: action === "withdraw" ? null : sourceRecord.source_revision, action, state: "leased" };
      nativeMapping = { ...nativeMapping, desired_source_revision: nativeWork.source_revision };
      claimedOnce = false;
      return claimCmsNativeWork(options);
    },
    queuePublication(nextCooked) {
      cooked = nextCooked; eventSequence++;
      Object.assign(sourceRecord, { title: "Continuing renamed source", source_revision: `revision-${eventSequence}`, source_updated_at: "2026-10-14T09:00:00.000Z", content_bytes: Buffer.byteLength(cooked), content_sha256: createHash("sha256").update(cooked).digest("hex") });
      changes = [{ ...event, event_id: uuid(100 + eventSequence), event_sequence: String(eventSequence), source: structuredClone(sourceRecord) }];
      const generation = nativeWork.lease_generation + 1;
      nativeWork = { ...nativeWork, work_id: uuid(20 + generation), lease_generation: generation, source_revision: sourceRecord.source_revision, action: "publish_revision", state: "leased" };
      nativeMapping = { ...nativeMapping, desired_source_revision: nativeWork.source_revision }; claimedOnce = false;
      return nativeWork.work_id;
    },
    async prepare() { return prepareCmsNativeWork(options, claimed.workId); },
    async expectation(builtHtml) {
      const journal = JSON.parse(await readFile(options.stateFile, "utf8")); const transaction = journal.transactions[claimed.workId];
      return { nativeId: transaction.plan.nativeResult.native_id, resourceId: nativeMapping.resource_id, url: nativeMapping.canonical_url, source: sourceRecord, mode,
        stagedMarkdownBody: transaction.plan.output.replace(/^---\n[\s\S]*?\n---\n/u, ""), builtHtml, preparedAt: transaction.preparedAt };
    },
  };
}

export async function buildCmsConsumer(state, fromEnabled = false, packedRoot, canonicalUrl) {
  const directory = async relative => { const target = path.join(state.root, relative); await mkdir(target, { recursive: true }); return target; };
  await directory("src/pages/comments");
  await writeFile(path.join(state.root, "package.json"), JSON.stringify({ name: "synthetic-cms-consumer", private: true, type: "module" }));
  await writeFile(path.join(state.root, "src/content.config.ts"), `import { defineCollection, z } from 'astro:content'; import { glob } from 'astro/loaders'; export const collections = { publications: defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/publications' }), schema: z.object({ title: z.string(), draft: z.boolean().optional() }).passthrough() }) };`);
  const component = (packedRoot ? path.join(packedRoot, "src/components/Discussion.astro") : fileURLToPath(new URL("../../src/components/Discussion.astro", import.meta.url))).replaceAll("\\", "/");
  await writeFile(path.join(state.root, "src/pages/comments/[slug].astro"), `---
import { getCollection, render } from 'astro:content';
import Discussion from ${JSON.stringify(component)};
export async function getStaticPaths() { return (await getCollection('publications', entry => !entry.data.draft)).map(entry => ({ params: { slug: entry.id.split('/').at(-1) }, props: { entry } })); }
const { entry } = Astro.props; const { Content } = await render(entry); const receipt = entry.data.discussionbridgeCmsOwnership;
---
<!doctype html><html lang="en"><head><title>{entry.data.title}</title></head><body><header>Consumer brand</header><article data-discussionbridge-cms-native={receipt.native_id} data-discussionbridge-cms-resource={receipt.resource_id} data-discussionbridge-cms-revision={entry.data.discussionbridgeSourceRevision} data-discussionbridge-cms-mode={entry.data.discussionCommentsDisplay} data-discussionbridge-cms-canonical={receipt.canonical_url} data-discussionbridge-cms-move={receipt.move_id} data-discussionbridge-cms-nonce={receipt.proof_nonce} data-discussionbridge-cms-ownership={entry.data.discussionbridgeCmsOwnershipSha256}><h1 data-discussionbridge-cms-title>{entry.data.title}</h1><Content/><Discussion frontmatter={entry.data}/></article><footer>Consumer footer</footer></body></html>`);
  const integration = packedRoot ? (await import(pathToFileURL(path.join(packedRoot, "dist/index.js")).href)).default : discussionBridge;
  const runtimeRoot = "C:/CodeProjects/Products/DiscussionBridge/codex crap/astro/packages/astro-discussion-bridge/node_modules";
  const nativeRuntime = createRequire(path.join(runtimeRoot, "astro/package.json"));
  const packedManifest = packedRoot ? JSON.parse(await readFile(path.join(packedRoot, "package.json"), "utf8")) : undefined;
  const packageResolve = value => {
    if (!packedRoot) return fileURLToPath(import.meta.resolve(value));
    const exported = packedManifest.exports[value === "astro-discussion-bridge" ? "." : "." + value.slice("astro-discussion-bridge".length)];
    const target = typeof exported === "string" ? exported : exported?.import;
    assert.equal(typeof target, "string", `actual packed import export for ${value}`);
    return path.resolve(packedRoot, target);
  };
  await build({ root: pathToFileURL(state.root + path.sep), configFile: false, site: state.options.siteUrl, trailingSlash: "always", logLevel: "silent", force: true,
    integrations: [integration({ discourseUrl: state.options.serverUrl, siteUrl: state.options.siteUrl,
      ...(fromEnabled ? { fromDiscourse: { enabled: true, docsDir: state.options.docsDir, stateFile: state.options.stateFile,
        connectionId: state.options.connectionId, connectionSecret: state.options.connectionSecret, fetchImplementation: state.options.fetchImplementation } } : {}) })],
    vite: { resolve: { alias: [
      { find: "astro", replacement: "astro", customResolver: value => nativeRuntime.resolve(value) },
      { find: "astro-discussion-bridge", replacement: "astro-discussion-bridge", customResolver: packageResolve },
      { find: "sanitize-html", replacement: path.join(runtimeRoot, "sanitize-html") },
      { find: "dompurify", replacement: path.join(runtimeRoot, "dompurify") },
    ] } } });
  const route = new URL(canonicalUrl ?? state.nativeMapping?.canonical_url ?? cmsNativeReservation(state.options, state.sourceRecord).canonicalUrl).pathname;
  return readFile(path.join(state.root, "dist", route, "index.html"), "utf8");
}
