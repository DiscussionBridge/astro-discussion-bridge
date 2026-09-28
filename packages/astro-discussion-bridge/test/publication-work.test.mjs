import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  acknowledgeAstroPublicationWork,
  claimAstroPublicationWork,
  registerAstroPublicationFailure,
  renewAstroPublicationLease,
} from "../dist/publication-work.js";

const fixture = async (name) => JSON.parse(await readFile(
  new URL(`../node_modules/discussionbridge-adapter-contract/fixtures/${name}`, import.meta.url),
  "utf8",
));
const capabilityBase = await fixture("connection-capability.json");
const claimBase = await fixture("publication-work-claim.json");
const renewalBase = await fixture("publication-lease-renewal.json");
const acknowledgements = await fixture("publication-acknowledgement-responses.json");
const synchronizedBase = await fixture("publication-acknowledgement-static-pending.json");
const deployedBase = await fixture("publication-acknowledgement-static-deployed.json");
const verifiedBase = await fixture("publication-acknowledgement.json");
const credentialsBase = {
  discourseUrl: "https://forum.example/",
  connectionId: capabilityBase.connection_id,
  connectionSecret: "s".repeat(40),
};

function astroWork(correlationId) {
  const item = structuredClone(claimBase.publication_work[0]);
  item.destination_policy_id = "destination:astro:primary:1";
  item.catalog_revision = "catalog:astro:1";
  item.resolved_container = { id: "astro:collection:docs", kind: "content_collection" };
  item.correlation_id = correlationId;
  return item;
}

function capability(correlationId, overrides = {}) {
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
    ...overrides,
    correlation_id: correlationId,
  };
}

function response(payload, correlationId) {
  return new Response(JSON.stringify({ ...payload, correlation_id: correlationId }), {
    status: 200,
    headers: { "content-type": "application/json", "X-DiscussionBridge-Correlation": correlationId },
  });
}

test("Astro claims only receiver-resolved work matching exact authenticated policy", async () => {
  let claimBody;
  const fetchImplementation = async (url, init) => {
    const parsed = new URL(url);
    const correlationId = init.headers["X-DiscussionBridge-Correlation"];
    if (parsed.pathname.endsWith("/connection.json")) return response(capability(correlationId), correlationId);
    claimBody = JSON.parse(init.body);
    return response({ publication_work: [astroWork(correlationId)], claimed_at: claimBase.claimed_at }, correlationId);
  };
  const result = await claimAstroPublicationWork({ ...credentialsBase, fetchImplementation }, {
    workerId: "astro-worker-1",
    maximumItems: 8,
    requestedLeaseSeconds: 900,
  });
  assert.equal(result.work.length, 1);
  assert.equal(result.work[0].destinationPolicyId, "destination:astro:primary:1");
  assert.deepEqual(claimBody.maximum_items, 8);
  assert.equal(claimBody.correlation_id, claimBody.correlation_id.trim());
});

test("Astro rejects claimed work that contradicts the authenticated policy", async () => {
  const fetchImplementation = async (url, init) => {
    const parsed = new URL(url);
    const correlationId = init.headers["X-DiscussionBridge-Correlation"];
    if (parsed.pathname.endsWith("/connection.json")) return response(capability(correlationId), correlationId);
    const work = astroWork(correlationId);
    work.native_limit_policy.maximum_bytes += 1;
    return response({ publication_work: [work], claimed_at: claimBase.claimed_at }, correlationId);
  };
  await assert.rejects(() => claimAstroPublicationWork({ ...credentialsBase, fetchImplementation }, { workerId: "astro-worker-1" }), /contradicts authenticated/);
});

test("Astro renews a bounded lease and completes all three static acknowledgement stages", async () => {
  const work = astroWork("claim-identity");
  const parsedWork = (await claimAstroPublicationWork({
    ...credentialsBase,
    fetchImplementation: async (url, init) => {
      const correlationId = init.headers["X-DiscussionBridge-Correlation"];
      if (new URL(url).pathname.endsWith("/connection.json")) return response(capability(correlationId), correlationId);
      return response({ publication_work: [{ ...work, correlation_id: correlationId }], claimed_at: claimBase.claimed_at }, correlationId);
    },
  }, { workerId: "astro-worker-1" })).work[0];
  const calls = [];
  const credentials = {
    ...credentialsBase,
    fetchImplementation: async (url, init) => {
      const parsed = new URL(url);
      const correlationId = init.headers["X-DiscussionBridge-Correlation"];
      const body = JSON.parse(init.body);
      calls.push({ parsed, body });
      if (parsed.pathname.endsWith("/renew.json")) return response({ ...renewalBase.response, work_id: parsedWork.workId }, correlationId);
      if (body.stage === "synchronized") return response({ ...acknowledgements.synchronized, work_id: parsedWork.workId }, correlationId);
      if (body.stage === "deployed") return response({ ...acknowledgements.deployed, work_id: parsedWork.workId }, correlationId);
      return response({ ...acknowledgements.verified, work_id: parsedWork.workId }, correlationId);
    },
  };
  const renewed = await renewAstroPublicationLease(credentials, parsedWork, 900);
  assert.equal(renewed.totalLeaseSeconds, 1200);
  const binding = {
    bindingId: synchronizedBase.destination_binding.binding_id,
    externalId: "astro:page:roadmap",
    canonicalUrl: "https://publisher.example/roadmap/",
    publicationRevision: "astro:sha256:revision-7",
    contentDisposition: "complete",
  };
  const synchronized = await acknowledgeAstroPublicationWork(credentials, parsedWork, {
    stage: "synchronized",
    stageToken: parsedWork.stageToken,
    destinationBinding: binding,
    synchronizedAt: synchronizedBase.synchronized_at,
    deploymentState: "pending",
    verificationState: "pending",
  });
  const deployed = await acknowledgeAstroPublicationWork(credentials, parsedWork, {
    stage: "deployed",
    stageToken: synchronized.nextStageToken,
    destinationBinding: binding,
    synchronizedAt: synchronizedBase.synchronized_at,
    deploymentState: "deployed",
    deployedAt: deployedBase.deployed_at,
    verificationState: "pending",
  });
  const verified = await acknowledgeAstroPublicationWork(credentials, parsedWork, {
    stage: "verified",
    stageToken: deployed.nextStageToken,
    destinationBinding: binding,
    synchronizedAt: synchronizedBase.synchronized_at,
    deploymentState: "deployed",
    deployedAt: deployedBase.deployed_at,
    verificationState: "verified",
    publiclyVerifiedAt: verifiedBase.publicly_verified_at,
  });
  assert.equal(verified.terminal, true);
  assert.equal(calls.length, 4);
});

test("Astro registers bounded secret-free failures without choosing retryability", async () => {
  const work = {
    ...(await claimAstroPublicationWork({
      ...credentialsBase,
      fetchImplementation: async (url, init) => {
        const correlationId = init.headers["X-DiscussionBridge-Correlation"];
        if (new URL(url).pathname.endsWith("/connection.json")) return response(capability(correlationId), correlationId);
        return response({ publication_work: [astroWork(correlationId)], claimed_at: claimBase.claimed_at }, correlationId);
      },
    }, { workerId: "astro-worker-1" })).work[0],
  };
  let sent;
  const fetchImplementation = async (_url, init) => {
    const correlationId = init.headers["X-DiscussionBridge-Correlation"];
    sent = JSON.parse(init.body);
    return response({ work_id: work.workId, resulting_state: "retry_wait", attempt_count: 1, next_retry_at: "2026-09-27T18:32:00Z" }, correlationId);
  };
  const result = await registerAstroPublicationFailure({ ...credentialsBase, fetchImplementation }, work, {
    errorCode: "destination_unavailable",
    errorDetail: "Destination returned a temporary 503 response.",
    failedAt: "2026-09-27T18:31:00Z",
  });
  assert.equal(result.resultingState, "retry_wait");
  assert.equal(sent.error_code, "destination_unavailable");
  await assert.rejects(() => registerAstroPublicationFailure({ ...credentialsBase, fetchImplementation }, work, {
    errorCode: "destination_unavailable",
    errorDetail: `Leaked ${credentialsBase.connectionSecret}`,
  }), /protected material/);
});
