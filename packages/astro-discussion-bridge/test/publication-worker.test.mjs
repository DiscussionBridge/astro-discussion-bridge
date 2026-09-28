import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runAstroPublicationWorker } from "../dist/publication-worker.js";
import {
  advanceSourceInventoryCheckpoint,
  persistSourceTopicDetail,
  readSourcePublicationState,
  writeSourcePublicationState,
} from "../dist/source-publication-state.js";

const fixture = async (name) => JSON.parse(await readFile(
  new URL(`../node_modules/discussionbridge-adapter-contract/fixtures/${name}`, import.meta.url),
  "utf8",
));
const capabilityBase = await fixture("connection-capability.json");
const claimBase = await fixture("publication-work-claim.json");
const detailBase = await fixture("source-detail-inline.json");
const acknowledgementResponses = await fixture("publication-acknowledgement-responses.json");

function response(payload, correlationId) {
  return new Response(JSON.stringify({ ...payload, correlation_id: correlationId }), {
    status: 200,
    headers: { "content-type": "application/json", "X-DiscussionBridge-Correlation": correlationId },
  });
}

function astroWork(correlationId) {
  const work = structuredClone(claimBase.publication_work[0]);
  work.destination_policy_id = "destination:astro:primary:1";
  work.catalog_revision = "catalog:astro:1";
  work.resolved_container = { id: "astro:collection:docs", kind: "content_collection" };
  work.lease_expires_at = "2026-09-27T18:35:00Z";
  work.correlation_id = correlationId;
  return work;
}

function capability(correlationId) {
  const work = astroWork(correlationId);
  return {
    ...structuredClone(capabilityBase),
    destination_policies: [{
      ...structuredClone(capabilityBase.destination_policies[0]),
      destination_policy_id: work.destination_policy_id,
      profile: "astro",
      presentation_mode: work.presentation_mode,
      native_limit_policy: work.native_limit_policy,
      catalog_revision: work.catalog_revision,
    }],
    correlation_id: correlationId,
  };
}

async function createSourceState(file) {
  const state = await readSourcePublicationState(file);
  persistSourceTopicDetail(state, {
    resourceId: detailBase.resource_id,
    topicId: detailBase.topic_id,
    topicUrl: detailBase.topic_url,
    title: detailBase.title,
    sourceRevision: detailBase.source_revision,
    sourceRevisionSequence: detailBase.source_revision_sequence,
    sourceCreatedAt: detailBase.source_created_at,
    sourceUpdatedAt: detailBase.source_updated_at,
    sourceAuthors: detailBase.source_authors,
    categories: detailBase.categories,
    tags: detailBase.tags,
    presentationMode: detailBase.presentation_mode,
    contentDisposition: detailBase.content_disposition,
    networkProvenance: detailBase.network_provenance,
    contentHtml: detailBase.content_transport.content_html,
    sanitizedContentHtml: detailBase.content_transport.content_html,
    sourceContentBytes: detailBase.content_transport.byte_length,
    sourceContentSha256: detailBase.content_transport.sha256,
  });
  advanceSourceInventoryCheckpoint(state, {
    snapshot: "dbs_complete",
    policyRevision: capabilityBase.policy_revision,
    items: [],
    nextCursor: null,
    complete: true,
  });
  await writeSourcePublicationState(file, state);
}

test("worker resumes after native synchronization without repeating the native mutation", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-worker-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const stateFile = path.join(directory, "worker-state.json");
  const sourceStateFile = path.join(directory, "source-state.json");
  await createSourceState(sourceStateFile);
  let claimCount = 0;
  let failFirstAcknowledgement = true;
  const requestStages = [];
  const fetchImplementation = async (url, init) => {
    const parsed = new URL(url);
    const correlationId = init.headers["X-DiscussionBridge-Correlation"];
    if (parsed.pathname.endsWith("/connection.json")) return response(capability(correlationId), correlationId);
    if (parsed.pathname.endsWith("/publication-work/claim.json")) {
      claimCount++;
      return response({
        publication_work: claimCount === 1 ? [astroWork(correlationId)] : [],
        claimed_at: "2026-09-27T18:30:00Z",
      }, correlationId);
    }
    if (parsed.pathname.endsWith("/source-topics/8.json")) return response(detailBase, correlationId);
    if (parsed.pathname.endsWith("/acknowledgement.json")) {
      const body = JSON.parse(init.body);
      requestStages.push(body.stage);
      if (body.stage === "synchronized" && failFirstAcknowledgement) {
        failFirstAcknowledgement = false;
        throw new Error("simulated acknowledgement outage");
      }
      const fixtureResponse = acknowledgementResponses[body.stage];
      return response({ ...fixtureResponse, work_id: astroWork(correlationId).work_id }, correlationId);
    }
    throw new Error(`Unexpected request ${parsed.pathname}`);
  };
  const calls = { synchronize: 0, deploy: 0, verify: 0 };
  const options = {
    credentials: {
      discourseUrl: "https://forum.example/",
      connectionId: capabilityBase.connection_id,
      connectionSecret: "s".repeat(40),
      fetchImplementation,
    },
    stateFile,
    sourceStateFile,
    workerId: "astro-worker-1",
    now: () => new Date("2026-09-27T18:30:30Z"),
    destination: {
      synchronize: async ({ publication }) => {
        calls.synchronize++;
        assert.equal(publication.contentDisposition, "complete");
        return {
          destinationBinding: {
            bindingId: "dbb_11111111111111111111111111111111",
            externalId: "astro:page:roadmap",
            canonicalUrl: "https://publisher.example/roadmap/",
            publicationRevision: `astro:sha256:${createHash("sha256").update(publication.contentHtml).digest("hex")}`,
            contentDisposition: publication.contentDisposition,
          },
          synchronizedAt: "2026-09-27T18:31:00Z",
        };
      },
      deploy: async () => { calls.deploy++; return { deployedAt: "2026-09-27T18:31:30Z" }; },
      verify: async () => { calls.verify++; return { publiclyVerifiedAt: "2026-09-27T18:32:00Z" }; },
    },
  };
  await assert.rejects(() => runAstroPublicationWorker(options), /simulated acknowledgement outage/);
  const persisted = JSON.parse(await readFile(stateFile, "utf8"));
  assert.equal(Object.values(persisted.operations)[0].phase, "native_synchronized");
  const result = await runAstroPublicationWorker(options);
  assert.deepEqual(result, { claimed: 0, completed: 1, failed: 0, resumed: 1 });
  assert.deepEqual(calls, { synchronize: 1, deploy: 1, verify: 1 });
  assert.deepEqual(requestStages, ["synchronized", "synchronized", "deployed", "verified"]);
  assert.deepEqual(JSON.parse(await readFile(stateFile, "utf8")).operations, {});
});
