import { randomUUID } from "node:crypto";
import { ADAPTER_CONTRACT_VERSION } from "./version.js";
import {
  assertServiceResponseUrl,
  parseServiceBaseUrl,
  resolveServiceRequestUrl,
} from "./web-url.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 65_536;
const MAX_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const MAX_CORRELATION_BYTES = 200;
const MAX_FORUM_NAME_BYTES = 200;
const MAX_POLICY_REVISION_BYTES = 255;
const CONNECTION_ID = /^dbc_[a-f0-9]{24}$/;
const PRESENTATION_MODES = ["simple", "full", "interactive"] as const;
const DIRECTIONS = new Set(["to_discourse", "from_discourse", "discourse_network"]);
const OPERATIONS = new Set([
  "resolve",
  "inventory",
  "claim",
  "renew",
  "acknowledge",
  "fail",
  "revocations",
  "catalog",
]);
const PROFILES = new Set([
  "astro",
  "discourse_as_publisher",
]);
const MAPPING_MODES = new Set(["mapped_only", "source_attribution"]);
const OVERFLOW_BEHAVIORS = new Set(["complete", "excerpt_with_read_more", "operator_attention"]);
const REQUIRED_CAPABILITY_FIELDS = [
  "contract_version",
  "connection_id",
  "enabled",
  "directions",
  "lanes",
  "allowed_presentation_modes",
  "supported_operations",
  "bounds",
  "destination_policies",
  "catalog_required",
  "policy_revision",
  "correlation_id",
] as const;

export interface Alpha21Credentials {
  discourseUrl: string;
  connectionId: string;
  connectionSecret: string;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  fetchImplementation?: typeof fetch;
}

export interface Alpha21JsonRequest {
  method: "GET" | "POST" | "PUT";
  path: string;
  credentials: Alpha21Credentials;
  body?: Record<string, unknown>;
  correlationId?: string;
  correlationBody?: "top_level" | "bridge_record";
  maximumRequestBytes?: number;
  maximumResponseBytes?: number;
}

export interface Alpha21JsonResponse {
  payload: Record<string, unknown>;
  correlationId: string;
  status: number;
}

export interface Alpha21DestinationPolicy {
  destinationPolicyId: string;
  profile: string;
  presentationMode: "simple" | "full" | "interactive";
  catalogRevision: string;
  nativeLimitPolicy: {
    maximumBytes: number;
    overflowBehavior: "complete" | "excerpt_with_read_more" | "operator_attention";
  };
}

export interface Alpha21ConnectionCapability {
  contractVersion: typeof ADAPTER_CONTRACT_VERSION;
  connectionId: string;
  enabled: boolean;
  directions: string[];
  lanes: string[];
  forumName?: string;
  allowedPresentationModes: Array<"simple" | "full" | "interactive">;
  supportedOperations: string[];
  bounds: {
    resolveJsonBytes: 65_536;
    sourceContentBytes: 16_777_216;
    claimMaximumItems: 32;
    leaseMaximumSeconds: 14_400;
    catalogSegmentItems: 100;
  };
  destinationPolicies: Alpha21DestinationPolicy[];
  catalogRequired: boolean;
  policyRevision: string;
}

export class Alpha21RequestError extends Error {
  readonly errorCode: string;
  readonly status: number;
  readonly correlationId: string;

  constructor(errorCode: string, message: string, status: number, correlationId: string) {
    super(message);
    this.name = "Alpha21RequestError";
    this.errorCode = errorCode;
    this.status = status;
    this.correlationId = correlationId;
  }
}

export async function requestAlpha21Json(input: Alpha21JsonRequest): Promise<Alpha21JsonResponse> {
  validateCredentials(input.credentials);
  const correlationId = boundedNonblank(
    input.correlationId ?? randomUUID(),
    MAX_CORRELATION_BYTES,
    "correlation ID",
  );
  const serviceBase = parseServiceBaseUrl(input.credentials.discourseUrl);
  if (serviceBase.protocol !== "https:") throw new Error("DiscussionBridge requests require HTTPS.");
  const endpoint = resolveServiceRequestUrl(input.path, serviceBase);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-DiscussionBridge-Connection": input.credentials.connectionId,
    "X-DiscussionBridge-Secret": input.credentials.connectionSecret,
    "X-DiscussionBridge-Contract": ADAPTER_CONTRACT_VERSION,
    "X-DiscussionBridge-Correlation": correlationId,
  };
  let requestBody: string | undefined;
  if (input.body !== undefined) {
    if (!isObject(input.body)) throw new Error("DiscussionBridge request body must be an object.");
    const correlationBody = input.correlationBody ?? "top_level";
    const correlatedBody = correlationBody === "bridge_record"
      ? withNestedBridgeRecordCorrelation(input.body, correlationId)
      : withTopLevelCorrelation(input.body, correlationId);
    requestBody = JSON.stringify(correlatedBody);
    const maximumRequestBytes = positiveBoundedInteger(
      input.maximumRequestBytes,
      65_536,
      MAX_RESPONSE_BYTES,
      "maximum request bytes",
    );
    if (byteLength(requestBody) > maximumRequestBytes) {
      throw new Error("DiscussionBridge request exceeds the configured size limit.");
    }
    headers["Content-Type"] = "application/json";
  }
  const response = await (input.credentials.fetchImplementation ?? fetch)(endpoint, {
    method: input.method,
    redirect: "error",
    signal: AbortSignal.timeout(positiveBoundedInteger(
      input.credentials.requestTimeoutMs,
      DEFAULT_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
      "request timeout",
    )),
    headers,
    body: requestBody,
  });
  if (response.url) assertServiceResponseUrl(response.url, serviceBase, "DiscussionBridge response URL");
  const payload = await boundedJson(
    response,
    positiveBoundedInteger(
      input.maximumResponseBytes ?? input.credentials.maxResponseBytes,
      DEFAULT_MAX_RESPONSE_BYTES,
      MAX_RESPONSE_BYTES,
      "maximum response bytes",
    ),
  );
  const responseHeader = response.headers.get("X-DiscussionBridge-Correlation");
  if (responseHeader !== correlationId || payload.correlation_id !== correlationId) {
    throw new Error("DiscussionBridge response correlation does not match the request.");
  }
  if (!response.ok) throw responseError(
    response,
    payload,
    correlationId,
    [input.credentials.connectionSecret, input.credentials.connectionId],
  );
  return { payload, correlationId, status: response.status };
}

function withTopLevelCorrelation(
  body: Record<string, unknown>,
  correlationId: string,
): Record<string, unknown> {
  const bodyCorrelation = body.correlation_id;
  if (bodyCorrelation !== undefined && bodyCorrelation !== correlationId) {
    throw new Error("DiscussionBridge request correlation header and body must match.");
  }
  return { ...body, correlation_id: correlationId };
}

function withNestedBridgeRecordCorrelation(
  body: Record<string, unknown>,
  correlationId: string,
): Record<string, unknown> {
  if (Object.hasOwn(body, "correlation_id")) {
    throw new Error("DiscussionBridge resolve correlation belongs inside bridge_record.");
  }
  const bridgeRecord = body.bridge_record;
  if (!isObject(bridgeRecord)) {
    throw new Error("DiscussionBridge resolve request requires a bridge_record object.");
  }
  const bodyCorrelation = bridgeRecord.correlation_id;
  if (bodyCorrelation !== undefined && bodyCorrelation !== correlationId) {
    throw new Error("DiscussionBridge request correlation header and body must match.");
  }
  return {
    ...body,
    bridge_record: { ...bridgeRecord, correlation_id: correlationId },
  };
}

export async function fetchAlpha21ConnectionCapability(
  credentials: Alpha21Credentials,
  correlationId?: string,
): Promise<Alpha21ConnectionCapability> {
  const response = await requestAlpha21Json({
    method: "GET",
    path: "/discussion-bridge/v1/connection.json",
    credentials,
    correlationId,
  });
  return validateConnectionCapability(response.payload, credentials.connectionId);
}

function validateConnectionCapability(
  value: Record<string, unknown>,
  expectedConnectionId: string,
): Alpha21ConnectionCapability {
  exactFields(value, REQUIRED_CAPABILITY_FIELDS, ["forum_name"], "connection capability");
  if (value.contract_version !== ADAPTER_CONTRACT_VERSION) {
    throw new Error("DiscussionBridge connection capability has the wrong contract version.");
  }
  if (value.connection_id !== expectedConnectionId) {
    throw new Error("DiscussionBridge connection capability has the wrong connection identity.");
  }
  if (typeof value.enabled !== "boolean") throw new Error("DiscussionBridge connection enabled state is invalid.");
  const directions = stringArray(value.directions, "connection directions");
  if (directions.length === 0 || directions.some((direction) => !DIRECTIONS.has(direction))) {
    throw new Error("DiscussionBridge connection directions are invalid.");
  }
  const lanes = stringArray(value.lanes, "connection lanes", 64);
  const presentationModes = stringArray(value.allowed_presentation_modes, "presentation modes");
  if (presentationModes.join("|") !== PRESENTATION_MODES.join("|")) {
    throw new Error("DiscussionBridge connection presentation modes are invalid.");
  }
  const supportedOperations = stringArray(value.supported_operations, "supported operations");
  if (supportedOperations.some((operation) => !OPERATIONS.has(operation))) {
    throw new Error("DiscussionBridge connection operations are invalid.");
  }
  const bounds = requiredObject(value.bounds, "connection bounds");
  exactFields(bounds, [
    "resolve_json_bytes",
    "source_content_bytes",
    "claim_maximum_items",
    "lease_maximum_seconds",
    "catalog_segment_items",
  ], [], "connection bounds");
  if (
    bounds.resolve_json_bytes !== 65_536
    || bounds.source_content_bytes !== 16_777_216
    || bounds.claim_maximum_items !== 32
    || bounds.lease_maximum_seconds !== 14_400
    || bounds.catalog_segment_items !== 100
  ) {
    throw new Error("DiscussionBridge connection bounds do not match Adapter Protocol Alpha.21.");
  }
  const forumName = value.forum_name === undefined
    ? undefined
    : boundedNonblank(value.forum_name, MAX_FORUM_NAME_BYTES, "forum name");
  if ((directions.includes("from_discourse") || directions.includes("discourse_network")) && !forumName) {
    throw new Error("DiscussionBridge forum name is required for this connection.");
  }
  if (!Array.isArray(value.destination_policies) || value.destination_policies.length === 0) {
    throw new Error("DiscussionBridge destination policies are invalid.");
  }
  const destinationPolicies = value.destination_policies.map(validateDestinationPolicy);
  if (typeof value.catalog_required !== "boolean") {
    throw new Error("DiscussionBridge catalog requirement is invalid.");
  }
  const policyRevision = boundedNonblank(value.policy_revision, MAX_POLICY_REVISION_BYTES, "policy revision");
  return {
    contractVersion: ADAPTER_CONTRACT_VERSION,
    connectionId: expectedConnectionId,
    enabled: value.enabled,
    directions,
    lanes,
    forumName,
    allowedPresentationModes: [...PRESENTATION_MODES],
    supportedOperations,
    bounds: {
      resolveJsonBytes: 65_536,
      sourceContentBytes: 16_777_216,
      claimMaximumItems: 32,
      leaseMaximumSeconds: 14_400,
      catalogSegmentItems: 100,
    },
    destinationPolicies,
    catalogRequired: value.catalog_required,
    policyRevision,
  };
}

function validateDestinationPolicy(value: unknown): Alpha21DestinationPolicy {
  const policy = requiredObject(value, "destination policy");
  exactFields(policy, [
    "destination_policy_id",
    "profile",
    "presentation_mode",
    "container_mapping",
    "taxonomy_mapping",
    "author_mapping",
    "native_limit_policy",
    "catalog_revision",
  ], [], "destination policy");
  const destinationPolicyId = boundedNonblank(policy.destination_policy_id, 255, "destination policy ID");
  const profile = boundedNonblank(policy.profile, 100, "destination profile");
  if (!PROFILES.has(profile)) throw new Error("DiscussionBridge destination profile is invalid.");
  const presentationMode = boundedNonblank(policy.presentation_mode, 32, "destination presentation mode");
  if (!PRESENTATION_MODES.includes(presentationMode as typeof PRESENTATION_MODES[number])) {
    throw new Error("DiscussionBridge destination presentation mode is invalid.");
  }
  const containerMapping = requiredObject(policy.container_mapping, "container mapping");
  exactFields(containerMapping, ["source", "destination"], [], "container mapping");
  boundedNonblank(containerMapping.source, 255, "container source");
  boundedNonblank(containerMapping.destination, 255, "container destination");
  validateMapping(policy.taxonomy_mapping, "taxonomy mapping");
  validateMapping(policy.author_mapping, "author mapping");
  const nativeLimit = requiredObject(policy.native_limit_policy, "native limit policy");
  exactFields(nativeLimit, ["maximum_bytes", "overflow_behavior"], [], "native limit policy");
  if (!Number.isSafeInteger(nativeLimit.maximum_bytes) || Number(nativeLimit.maximum_bytes) < 1) {
    throw new Error("DiscussionBridge native content limit is invalid.");
  }
  const overflowBehavior = boundedNonblank(nativeLimit.overflow_behavior, 64, "overflow behavior");
  if (!OVERFLOW_BEHAVIORS.has(overflowBehavior)) {
    throw new Error("DiscussionBridge overflow behavior is invalid.");
  }
  return {
    destinationPolicyId,
    profile,
    presentationMode: presentationMode as Alpha21DestinationPolicy["presentationMode"],
    catalogRevision: boundedNonblank(policy.catalog_revision, 255, "catalog revision"),
    nativeLimitPolicy: {
      maximumBytes: Number(nativeLimit.maximum_bytes),
      overflowBehavior: overflowBehavior as Alpha21DestinationPolicy["nativeLimitPolicy"]["overflowBehavior"],
    },
  };
}

function validateMapping(value: unknown, label: string): void {
  const mapping = requiredObject(value, label);
  exactFields(mapping, ["mode"], ["destination_id", "items"], label);
  const mode = boundedNonblank(mapping.mode, 64, `${label} mode`);
  if (!MAPPING_MODES.has(mode)) throw new Error(`DiscussionBridge ${label} mode is invalid.`);
  if (mapping.destination_id !== undefined) boundedNonblank(mapping.destination_id, 255, `${label} destination ID`);
  if (mapping.items !== undefined && !Array.isArray(mapping.items)) {
    throw new Error(`DiscussionBridge ${label} items are invalid.`);
  }
}

function responseError(
  response: Response,
  payload: Record<string, unknown>,
  correlationId: string,
  protectedValues: string[],
): Alpha21RequestError {
  exactFields(payload, ["error_code", "message", "correlation_id"], [], "error response");
  const errorCode = boundedNonblank(payload.error_code, 100, "error code");
  const message = protectedValues.reduce(
    (redacted, value) => redacted.split(value).join("[REDACTED]"),
    boundedNonblank(payload.message, 2_048, "error message"),
  );
  return new Alpha21RequestError(
    errorCode,
    `DiscussionBridge request failed (${response.status}, ${errorCode}): ${message}`,
    response.status,
    correlationId,
  );
}

async function boundedJson(response: Response, maximum: number): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (!contentType || !(contentType === "application/json" || contentType.endsWith("+json"))) {
    response.body?.cancel().catch(() => undefined);
    throw new Error("DiscussionBridge response is not JSON.");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) {
    response.body?.cancel().catch(() => undefined);
    throw new Error("DiscussionBridge response exceeds the configured size limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("DiscussionBridge response body is empty.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) {
      await reader.cancel();
      throw new Error("DiscussionBridge response exceeds the configured size limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("DiscussionBridge response JSON is invalid.");
  }
  return requiredObject(parsed, "response JSON");
}

function validateCredentials(credentials: Alpha21Credentials): void {
  if (!CONNECTION_ID.test(credentials.connectionId)) {
    throw new Error("DiscussionBridge connection ID is invalid.");
  }
  if (
    typeof credentials.connectionSecret !== "string"
    || byteLength(credentials.connectionSecret) < 32
    || byteLength(credentials.connectionSecret) > 4_096
    || /[\u0000-\u001f\u007f]/u.test(credentials.connectionSecret)
  ) {
    throw new Error("DiscussionBridge connection secret is invalid.");
  }
}

function exactFields(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  for (const field of required) {
    if (!Object.hasOwn(value, field)) throw new Error(`DiscussionBridge ${label}.${field} is required.`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new Error(`DiscussionBridge ${label}.${field} is unknown.`);
  }
}

function stringArray(value: unknown, label: string, maximumBytes = 255): string[] {
  if (!Array.isArray(value)) throw new Error(`DiscussionBridge ${label} are invalid.`);
  const items = value.map((item) => boundedNonblank(item, maximumBytes, label));
  if (new Set(items).size !== items.length) throw new Error(`DiscussionBridge ${label} contain duplicates.`);
  return items;
}

function requiredObject(value: unknown, label: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`DiscussionBridge ${label} must be an object.`);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedNonblank(value: unknown, maximumBytes: number, label: string): string {
  if (typeof value !== "string" || value.trim() === "" || byteLength(value) > maximumBytes) {
    throw new Error(`DiscussionBridge ${label} is invalid.`);
  }
  return value;
}

function positiveBoundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0 || selected > maximum) {
    throw new Error(`DiscussionBridge ${label} is invalid.`);
  }
  return selected;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
