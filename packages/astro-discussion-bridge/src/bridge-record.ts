import {
  fetchAlpha21ConnectionCapability,
  requestAlpha21Json,
  type Alpha21Credentials,
} from "./alpha21-client.js";
import { retrieveSourceContent } from "./source-publication.js";
import { parsePublicDiscourseTopicUrl } from "./web-url.js";

const RESOURCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BINDING_ID = /^dbb_[a-f0-9]{32}$/;
const PRESENTATION_MODES = new Set(["simple", "full", "interactive"]);

export type BridgeRecordCredentials = Alpha21Credentials;

export interface PresentedBridgeRecord {
  resourceId: string;
  title: string;
  topicId: number;
  topicUrl: string;
  sourceRevision: string;
  sourceRevisionSequence: number;
  sourceCreatedAt: string;
  sourceUpdatedAt: string;
  contentDisposition: "complete" | "excerpt";
  contentHtml: string;
  sourceContentBytes: number;
  sourceContentSha256: string;
}

export async function fetchFromDiscourseRecord(
  resourceId: string,
  credentials: BridgeRecordCredentials,
): Promise<PresentedBridgeRecord> {
  const normalizedResourceId = requiredResourceId(resourceId);
  const capability = await fetchAlpha21ConnectionCapability(credentials);
  if (!capability.enabled || !capability.directions.includes("from_discourse")) {
    throw new Error("DiscussionBridge connection does not allow From Discourse presentation.");
  }
  if (!capability.destinationPolicies.some((policy) => policy.profile === "astro")) {
    throw new Error("DiscussionBridge connection has no Astro destination policy.");
  }

  const response = await requestAlpha21Json({
    method: "GET",
    path: `/discussion-bridge/v1/bridge-records/${encodeURIComponent(normalizedResourceId)}.json`,
    credentials,
  });
  exactFields(response.payload, ["bridge_record", "correlation_id"], "record response");
  const record = requiredObject(response.payload.bridge_record, "bridge record");
  exactFields(record, [
    "resource_id", "direction", "state", "title", "topic_id", "topic_url",
    "source_revision", "source_revision_sequence", "source_created_at", "source_updated_at", "bindings",
  ], "bridge record", ["content_disposition", "content_transport"]);

  if (requiredResourceId(record.resource_id) !== normalizedResourceId) {
    throw new Error("DiscussionBridge record response returned the wrong resource.");
  }
  if (record.direction !== "from_discourse" || record.state !== "healthy") {
    throw new Error("DiscussionBridge record is not a healthy From Discourse publication.");
  }
  const topicId = positiveInteger(record.topic_id, "record topic ID");
  const topicUrl = boundedText(record.topic_url, 2_048, "record topic URL");
  if (parsePublicDiscourseTopicUrl(topicUrl, credentials.discourseUrl, "DiscussionBridge record topic URL").topicId !== topicId) {
    throw new Error("DiscussionBridge record topic identity is inconsistent.");
  }
  const sourceRevision = boundedText(record.source_revision, 255, "record source revision");
  const sourceCreatedAt = timestamp(record.source_created_at, "record source creation time");
  const sourceUpdatedAt = timestamp(record.source_updated_at, "record source modification time");
  if (Date.parse(sourceUpdatedAt) < Date.parse(sourceCreatedAt)) {
    throw new Error("DiscussionBridge record source modification precedes creation.");
  }
  validateBindings(record.bindings, credentials.connectionId, sourceRevision);

  const disposition = boundedText(record.content_disposition, 16, "record content disposition");
  if (disposition !== "complete" && disposition !== "excerpt") {
    throw new Error("DiscussionBridge record content disposition is invalid.");
  }
  const content = await retrieveSourceContent(
    credentials,
    topicId,
    sourceRevision,
    requiredObject(record.content_transport, "record content transport"),
  );
  return {
    resourceId: normalizedResourceId,
    title: boundedText(record.title, 1_024, "record title"),
    topicId,
    topicUrl,
    sourceRevision,
    sourceRevisionSequence: positiveInteger(record.source_revision_sequence, "record source revision sequence"),
    sourceCreatedAt,
    sourceUpdatedAt,
    contentDisposition: disposition,
    contentHtml: content.sanitizedContentHtml,
    sourceContentBytes: content.sourceContentBytes,
    sourceContentSha256: content.sourceContentSha256,
  };
}

function validateBindings(value: unknown, connectionId: string, sourceRevision: string): void {
  if (!Array.isArray(value)) throw new Error("DiscussionBridge record bindings are invalid.");
  let ownsPresentation = false;
  for (const candidate of value) {
    const binding = requiredObject(candidate, "record binding");
    exactFields(binding, [
      "binding_id", "connection_id", "role", "state", "external_id", "canonical_url",
      "presentation_mode", "applied_source_revision", "publication_revision", "content_disposition",
      "synchronized_at", "deployment_state", "deployed_at", "verification_state", "publicly_verified_at",
    ], "record binding");
    const bindingId = boundedText(binding.binding_id, 36, "record binding ID");
    if (!BINDING_ID.test(bindingId)) throw new Error("DiscussionBridge record binding ID is invalid.");
    const mode = boundedText(binding.presentation_mode, 32, "record presentation mode");
    if (!PRESENTATION_MODES.has(mode)) throw new Error("DiscussionBridge record presentation mode is invalid.");
    if (
      binding.connection_id === connectionId
      && binding.role === "presentation"
      && binding.state === "active"
      && binding.applied_source_revision === sourceRevision
    ) ownsPresentation = true;
  }
  if (!ownsPresentation) {
    throw new Error("DiscussionBridge record has no active presentation binding for this connection and revision.");
  }
}

function exactFields(
  value: Record<string, unknown>,
  required: readonly string[],
  label: string,
  optional: readonly string[] = [],
): void {
  for (const field of required) if (!Object.hasOwn(value, field)) throw new Error(`DiscussionBridge ${label}.${field} is required.`);
  const allowed = new Set([...required, ...optional]);
  for (const field of Object.keys(value)) if (!allowed.has(field)) throw new Error(`DiscussionBridge ${label}.${field} is unknown.`);
}

function requiredObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return value as Record<string, unknown>;
}

function requiredResourceId(value: unknown): string {
  if (typeof value !== "string" || !RESOURCE_ID.test(value)) throw new Error("DiscussionBridge resource ID is invalid.");
  return value.toLowerCase();
}

function boundedText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() || new TextEncoder().encode(value).byteLength > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`DiscussionBridge ${label} is invalid.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return Number(value);
}

function timestamp(value: unknown, label: string): string {
  const text = boundedText(value, 64, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(text) || !Number.isFinite(Date.parse(text))) {
    throw new Error(`DiscussionBridge ${label} is invalid.`);
  }
  return text;
}
