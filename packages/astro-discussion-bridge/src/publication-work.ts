import {
  fetchAlpha21ConnectionCapability,
  requestAlpha21Json,
  type Alpha21ConnectionCapability,
  type Alpha21Credentials,
  type Alpha21DestinationPolicy,
} from "./alpha21-client.js";

const WORK_ID = /^dbw_[a-f0-9]{32}$/;
const BINDING_ID = /^dbb_[a-f0-9]{32}$/;
const TOKEN = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = ["publish", "update", "hold", "unpublish", "restore"] as const;
const PRESENTATIONS = ["simple", "full", "interactive"] as const;
const OVERFLOW = ["complete", "excerpt_with_read_more", "operator_attention"] as const;
const FAILURE_CODES = [
  "transport_timeout", "source_unavailable", "destination_unavailable", "rate_limited",
  "build_failed", "deploy_failed", "public_verification_failed", "internal_error",
  "authentication_failed", "scope_denied", "validation_failed", "content_unsupported",
  "identity_conflict", "destination_collision", "reconciliation_required", "operator_action_required",
] as const;

export interface AstroPublicationWork {
  workId: string;
  resourceId: string;
  connectionId: string;
  action: typeof ACTIONS[number];
  sourceRevision: string;
  sourceRevisionSequence: number;
  policyRevision: string;
  destinationPolicyId: string;
  catalogRevision: string;
  presentationMode: typeof PRESENTATIONS[number];
  resolvedContainer: { id: string; kind: string };
  resolvedTaxonomy: Array<{ sourceId: string; destinationId: string }>;
  resolvedAuthor: { mode: "mapped_only" | "source_attribution"; destinationId: string | null };
  nativeLimitPolicy: { maximumBytes: number; overflowBehavior: typeof OVERFLOW[number] };
  leaseToken: string;
  stageToken: string;
  leaseExpiresAt: string;
  attemptCount: number;
  retryGeneration: number;
}

export interface AstroDestinationBinding {
  bindingId: string;
  externalId: string;
  canonicalUrl: string;
  publicationRevision: string;
  contentDisposition: "complete" | "excerpt";
}

export interface AstroWorkAcknowledgement {
  stage: "synchronized" | "deployed" | "verified";
  stageToken: string;
  destinationBinding: AstroDestinationBinding;
  synchronizedAt: string;
  deploymentState: "pending" | "deployed" | "not_required";
  verificationState: "pending" | "verified" | "not_required";
  deployedAt?: string;
  publiclyVerifiedAt?: string;
}

export interface AstroAcknowledgementResult {
  acceptedStage: AstroWorkAcknowledgement["stage"];
  resultingState: "awaiting_deployment" | "awaiting_verification" | "acknowledged";
  terminal: boolean;
  nextStageToken?: string;
}

export async function claimAstroPublicationWork(
  credentials: Alpha21Credentials,
  input: { workerId: string; maximumItems?: number; requestedLeaseSeconds?: number },
  capability?: Alpha21ConnectionCapability,
): Promise<{ work: AstroPublicationWork[]; claimedAt: string }> {
  const activeCapability = await requireWorkCapability(credentials, capability);
  const body: Record<string, unknown> = { worker_id: boundedText(input.workerId, 200, "worker ID") };
  if (input.maximumItems !== undefined) body.maximum_items = boundedInteger(input.maximumItems, 1, 32, "claim maximum items");
  if (input.requestedLeaseSeconds !== undefined) body.requested_lease_seconds = boundedInteger(input.requestedLeaseSeconds, 1, 3_600, "requested lease seconds");
  const response = await requestAlpha21Json({
    method: "POST",
    path: "/discussion-bridge/v1/publication-work/claim.json",
    credentials,
    body,
  });
  const value = response.payload;
  exactFields(value, ["publication_work", "claimed_at", "correlation_id"], "work claim response");
  const items = requiredArray(value.publication_work, "publication work");
  if (items.length > (input.maximumItems ?? 1) || items.length > 32) throw new Error("DiscussionBridge claim returned too much work.");
  const seen = new Set<string>();
  const work = items.map((item) => {
    const parsed = validateWork(item, credentials.connectionId, activeCapability, response.correlationId);
    if (seen.has(parsed.workId)) throw new Error("DiscussionBridge claim returned duplicate work.");
    seen.add(parsed.workId);
    return parsed;
  });
  return { work, claimedAt: timestamp(value.claimed_at, "work claim time") };
}

export async function renewAstroPublicationLease(
  credentials: Alpha21Credentials,
  work: AstroPublicationWork,
  requestedLeaseSeconds: number,
): Promise<{ leaseExpiresAt: string; totalLeaseSeconds: number }> {
  const response = await requestAlpha21Json({
    method: "POST",
    path: `/discussion-bridge/v1/publication-work/${work.workId}/renew.json`,
    credentials,
    body: {
      lease_token: requiredToken(work.leaseToken, "lease token"),
      requested_lease_seconds: boundedInteger(requestedLeaseSeconds, 1, 3_600, "requested lease seconds"),
    },
  });
  const value = response.payload;
  exactFields(value, ["work_id", "lease_expires_at", "total_lease_seconds", "correlation_id"], "lease renewal response");
  if (value.work_id !== work.workId) throw new Error("DiscussionBridge lease renewal returned the wrong work identity.");
  return {
    leaseExpiresAt: timestamp(value.lease_expires_at, "lease expiration"),
    totalLeaseSeconds: boundedInteger(value.total_lease_seconds, 1, 14_400, "total lease seconds"),
  };
}

export async function acknowledgeAstroPublicationWork(
  credentials: Alpha21Credentials,
  work: AstroPublicationWork,
  acknowledgement: AstroWorkAcknowledgement,
): Promise<AstroAcknowledgementResult> {
  const binding = destinationBinding(acknowledgement.destinationBinding);
  validateAcknowledgementStage(acknowledgement);
  const body: Record<string, unknown> = {
    lease_token: requiredToken(work.leaseToken, "lease token"),
    resource_id: work.resourceId,
    source_revision: work.sourceRevision,
    source_revision_sequence: work.sourceRevisionSequence,
    policy_revision: work.policyRevision,
    destination_policy_id: work.destinationPolicyId,
    action: work.action,
    stage: acknowledgement.stage,
    stage_token: requiredToken(acknowledgement.stageToken, "stage token"),
    destination_binding: {
      binding_id: binding.bindingId,
      external_id: binding.externalId,
      canonical_url: binding.canonicalUrl,
      publication_revision: binding.publicationRevision,
      content_disposition: binding.contentDisposition,
    },
    synchronized_at: timestamp(acknowledgement.synchronizedAt, "synchronization time"),
    deployment_state: acknowledgement.deploymentState,
    verification_state: acknowledgement.verificationState,
  };
  if (acknowledgement.deployedAt !== undefined) body.deployed_at = timestamp(acknowledgement.deployedAt, "deployment time");
  if (acknowledgement.publiclyVerifiedAt !== undefined) body.publicly_verified_at = timestamp(acknowledgement.publiclyVerifiedAt, "public verification time");
  const response = await requestAlpha21Json({
    method: "PUT",
    path: `/discussion-bridge/v1/publication-work/${work.workId}/acknowledgement.json`,
    credentials,
    body,
  });
  const value = response.payload;
  exactFields(value, ["work_id", "accepted_stage", "resulting_state", "terminal", "correlation_id"], "work acknowledgement response", ["next_stage_token"]);
  if (value.work_id !== work.workId || value.accepted_stage !== acknowledgement.stage) throw new Error("DiscussionBridge acknowledgement returned the wrong work stage.");
  const terminal = requiredBoolean(value.terminal, "acknowledgement terminal state");
  const resultingState = boundedText(value.resulting_state, 64, "acknowledgement resulting state") as AstroAcknowledgementResult["resultingState"];
  const expectedState = acknowledgement.stage === "synchronized"
    ? (acknowledgement.deploymentState === "not_required" ? "acknowledged" : "awaiting_deployment")
    : acknowledgement.stage === "deployed" ? "awaiting_verification" : "acknowledged";
  const expectedTerminal = acknowledgement.stage === "verified" || acknowledgement.deploymentState === "not_required";
  if (resultingState !== expectedState || terminal !== expectedTerminal) throw new Error("DiscussionBridge acknowledgement response transition is invalid.");
  const nextStageToken = value.next_stage_token === undefined ? undefined : requiredToken(value.next_stage_token, "next stage token");
  if (expectedTerminal === (nextStageToken !== undefined)) throw new Error("DiscussionBridge acknowledgement stage token transition is invalid.");
  return { acceptedStage: acknowledgement.stage, resultingState, terminal, nextStageToken };
}

export async function registerAstroPublicationFailure(
  credentials: Alpha21Credentials,
  work: AstroPublicationWork,
  input: { errorCode: typeof FAILURE_CODES[number]; errorDetail: string; failedAt?: string },
): Promise<{ resultingState: "retry_wait" | "operator_attention"; attemptCount: number; nextRetryAt: string | null }> {
  if (!FAILURE_CODES.includes(input.errorCode)) throw new Error("DiscussionBridge publication failure code is invalid.");
  const detail = boundedText(input.errorDetail, 2_048, "publication failure detail");
  if ([credentials.connectionSecret, credentials.connectionId, work.leaseToken, "X-DiscussionBridge-Secret", "Authorization:"].some((value) => detail.includes(value))) {
    throw new Error("DiscussionBridge publication failure detail contains protected material.");
  }
  const response = await requestAlpha21Json({
    method: "PUT",
    path: `/discussion-bridge/v1/publication-work/${work.workId}/failure.json`,
    credentials,
    body: {
      lease_token: requiredToken(work.leaseToken, "lease token"),
      error_code: input.errorCode,
      error_detail: detail,
      failed_at: timestamp(input.failedAt ?? new Date().toISOString(), "failure time"),
    },
  });
  const value = response.payload;
  exactFields(value, ["work_id", "resulting_state", "attempt_count", "next_retry_at", "correlation_id"], "work failure response");
  if (value.work_id !== work.workId || !["retry_wait", "operator_attention"].includes(String(value.resulting_state))) throw new Error("DiscussionBridge failure response is invalid.");
  const nextRetryAt = value.next_retry_at === null ? null : timestamp(value.next_retry_at, "next retry time");
  if (value.resulting_state === "retry_wait" && nextRetryAt === null) throw new Error("DiscussionBridge retry response omitted its next retry time.");
  if (value.resulting_state === "operator_attention" && nextRetryAt !== null) throw new Error("DiscussionBridge terminal failure response scheduled an automatic retry.");
  return {
    resultingState: value.resulting_state as "retry_wait" | "operator_attention",
    attemptCount: boundedInteger(value.attempt_count, 1, 4, "failure attempt count"),
    nextRetryAt,
  };
}

async function requireWorkCapability(credentials: Alpha21Credentials, supplied?: Alpha21ConnectionCapability): Promise<Alpha21ConnectionCapability> {
  const capability = supplied ?? await fetchAlpha21ConnectionCapability(credentials);
  if (!capability.enabled || !capability.directions.includes("from_discourse") || !capability.supportedOperations.includes("claim")) {
    throw new Error("DiscussionBridge connection does not allow publication work.");
  }
  if (!capability.destinationPolicies.some((policy) => policy.profile === "astro")) throw new Error("DiscussionBridge connection has no Astro destination policy.");
  return capability;
}

function validateWork(value: unknown, connectionId: string, capability: Alpha21ConnectionCapability, correlationId: string): AstroPublicationWork {
  const item = requiredObject(value, "publication work");
  exactFields(item, [
    "work_id", "resource_id", "connection_id", "action", "source_revision", "source_revision_sequence",
    "policy_revision", "destination_policy_id", "catalog_revision", "presentation_mode", "resolved_container",
    "resolved_taxonomy", "resolved_author", "native_limit_policy", "lease_token", "stage_token", "lease_expires_at",
    "attempt_count", "retry_generation", "correlation_id",
  ], "publication work");
  const workId = boundedText(item.work_id, 36, "work ID");
  if (!WORK_ID.test(workId) || item.connection_id !== connectionId || item.correlation_id !== correlationId) throw new Error("DiscussionBridge publication work identity is invalid.");
  const action = boundedText(item.action, 32, "work action");
  const presentationMode = boundedText(item.presentation_mode, 32, "work presentation mode");
  if (!ACTIONS.includes(action as typeof ACTIONS[number]) || !PRESENTATIONS.includes(presentationMode as typeof PRESENTATIONS[number])) throw new Error("DiscussionBridge publication work behavior is invalid.");
  const destinationPolicyId = boundedText(item.destination_policy_id, 255, "destination policy ID");
  const policy = capability.destinationPolicies.find((candidate) => candidate.profile === "astro" && candidate.destinationPolicyId === destinationPolicyId);
  if (!policy) throw new Error("DiscussionBridge publication work is outside the authenticated Astro policy.");
  validatePolicyIdentity(item, capability, policy, presentationMode);
  const container = requiredObject(item.resolved_container, "resolved container");
  exactFields(container, ["id", "kind"], "resolved container");
  const taxonomy = requiredArray(item.resolved_taxonomy, "resolved taxonomy").map((candidate) => {
    const mapping = requiredObject(candidate, "resolved taxonomy item");
    exactFields(mapping, ["source_id", "destination_id"], "resolved taxonomy item");
    return { sourceId: boundedText(mapping.source_id, 255, "taxonomy source ID"), destinationId: boundedText(mapping.destination_id, 255, "taxonomy destination ID") };
  });
  const author = requiredObject(item.resolved_author, "resolved author");
  exactFields(author, ["mode", "destination_id"], "resolved author");
  const authorMode = boundedText(author.mode, 64, "author mapping mode");
  if (authorMode !== "mapped_only" && authorMode !== "source_attribution") throw new Error("DiscussionBridge author mapping mode is invalid.");
  const nativeLimit = requiredObject(item.native_limit_policy, "native limit policy");
  exactFields(nativeLimit, ["maximum_bytes", "overflow_behavior"], "native limit policy");
  return {
    workId,
    resourceId: requiredUuid(item.resource_id, "work resource ID"),
    connectionId,
    action: action as AstroPublicationWork["action"],
    sourceRevision: boundedText(item.source_revision, 255, "work source revision"),
    sourceRevisionSequence: positiveInteger(item.source_revision_sequence, "work source revision sequence"),
    policyRevision: capability.policyRevision,
    destinationPolicyId,
    catalogRevision: policy.catalogRevision,
    presentationMode: presentationMode as AstroPublicationWork["presentationMode"],
    resolvedContainer: { id: boundedText(container.id, 255, "container ID"), kind: boundedText(container.kind, 255, "container kind") },
    resolvedTaxonomy: taxonomy,
    resolvedAuthor: { mode: authorMode, destinationId: author.destination_id === null ? null : boundedText(author.destination_id, 255, "author destination ID") },
    nativeLimitPolicy: {
      maximumBytes: positiveInteger(nativeLimit.maximum_bytes, "native maximum bytes"),
      overflowBehavior: boundedText(nativeLimit.overflow_behavior, 64, "native overflow behavior") as AstroPublicationWork["nativeLimitPolicy"]["overflowBehavior"],
    },
    leaseToken: requiredToken(item.lease_token, "lease token"),
    stageToken: requiredToken(item.stage_token, "stage token"),
    leaseExpiresAt: timestamp(item.lease_expires_at, "lease expiration"),
    attemptCount: boundedInteger(item.attempt_count, 1, 4, "work attempt count"),
    retryGeneration: boundedInteger(item.retry_generation, 0, Number.MAX_SAFE_INTEGER, "work retry generation"),
  };
}

function validatePolicyIdentity(item: Record<string, unknown>, capability: Alpha21ConnectionCapability, policy: Alpha21DestinationPolicy, presentationMode: string): void {
  const native = requiredObject(item.native_limit_policy, "native limit policy");
  if (
    item.policy_revision !== capability.policyRevision
    || item.catalog_revision !== policy.catalogRevision
    || presentationMode !== policy.presentationMode
    || native.maximum_bytes !== policy.nativeLimitPolicy.maximumBytes
    || native.overflow_behavior !== policy.nativeLimitPolicy.overflowBehavior
  ) throw new Error("DiscussionBridge publication work contradicts authenticated destination policy.");
}

function destinationBinding(value: AstroDestinationBinding): AstroDestinationBinding {
  if (!BINDING_ID.test(value.bindingId)) throw new Error("DiscussionBridge destination binding ID is invalid.");
  if (value.contentDisposition !== "complete" && value.contentDisposition !== "excerpt") throw new Error("DiscussionBridge destination content disposition is invalid.");
  return {
    bindingId: value.bindingId,
    externalId: boundedText(value.externalId, 255, "destination external ID"),
    canonicalUrl: boundedText(value.canonicalUrl, 2_048, "destination canonical URL"),
    publicationRevision: boundedText(value.publicationRevision, 255, "destination publication revision"),
    contentDisposition: value.contentDisposition,
  };
}

function validateAcknowledgementStage(value: AstroWorkAcknowledgement): void {
  const hasDeployed = value.deployedAt !== undefined;
  const hasVerified = value.publiclyVerifiedAt !== undefined;
  const valid = value.stage === "synchronized"
    ? !hasDeployed && !hasVerified && ((value.deploymentState === "pending" && value.verificationState === "pending") || (value.deploymentState === "not_required" && value.verificationState === "not_required"))
    : value.stage === "deployed"
      ? hasDeployed && !hasVerified && value.deploymentState === "deployed" && value.verificationState === "pending"
      : value.stage === "verified" && hasDeployed && hasVerified && value.deploymentState === "deployed" && value.verificationState === "verified";
  if (!valid) throw new Error("DiscussionBridge acknowledgement stage is invalid.");
  if (hasDeployed && Date.parse(value.deployedAt!) < Date.parse(value.synchronizedAt)) throw new Error("DiscussionBridge deployment precedes synchronization.");
  if (hasVerified && Date.parse(value.publiclyVerifiedAt!) < Date.parse(value.deployedAt!)) throw new Error("DiscussionBridge verification precedes deployment.");
}

function exactFields(value: Record<string, unknown>, required: readonly string[], label: string, optional: readonly string[] = []): void {
  for (const field of required) if (!Object.hasOwn(value, field)) throw new Error(`DiscussionBridge ${label}.${field} is required.`);
  const allowed = new Set([...required, ...optional]);
  for (const field of Object.keys(value)) if (!allowed.has(field)) throw new Error(`DiscussionBridge ${label}.${field} is unknown.`);
}

function requiredObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return value as Record<string, unknown>;
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`DiscussionBridge ${label} are invalid.`);
  return value;
}

function boundedText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() || new TextEncoder().encode(value).byteLength > maximum || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  return boundedInteger(value, 1, Number.MAX_SAFE_INTEGER, label);
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return Number(value);
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`DiscussionBridge ${label} is invalid.`);
  return value;
}

function requiredToken(value: unknown, label: string): string {
  const token = boundedText(value, 64, label);
  if (!TOKEN.test(token)) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return token;
}

function requiredUuid(value: unknown, label: string): string {
  const id = boundedText(value, 36, label).toLowerCase();
  if (!UUID.test(id)) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return id;
}

function timestamp(value: unknown, label: string): string {
  const text = boundedText(value, 64, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(text) || !Number.isFinite(Date.parse(text))) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return text;
}
