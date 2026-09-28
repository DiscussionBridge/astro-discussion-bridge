import { createHash } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import {
  fetchAlpha21ConnectionCapability,
  requestAlpha21Json,
  type Alpha21ConnectionCapability,
  type Alpha21Credentials,
} from "./alpha21-client.js";
import { parsePublicDiscourseTopicUrl } from "./web-url.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVOCATION_ID = /^dbr_[a-f0-9]{32}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SOURCE_MAXIMUM_BYTES = 16 * 1024 * 1024;

export interface SourceInventoryItem {
  resourceId: string;
  topicId: number;
  topicUrl: string;
  title: string;
  sourceRevision: string;
  sourceRevisionSequence: number;
  sourceCreatedAt: string;
  sourceUpdatedAt: string;
}

export interface SourceInventoryPage {
  snapshot: string;
  policyRevision: string;
  items: SourceInventoryItem[];
  nextCursor: string | null;
  complete: boolean;
}

export interface SourceTopicDetail extends SourceInventoryItem {
  sourceAuthors: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  tags: Record<string, unknown>[];
  presentationMode: "simple" | "full" | "interactive";
  contentDisposition: "complete" | "excerpt";
  networkProvenance: Record<string, unknown> | null;
  contentHtml: string;
  sanitizedContentHtml: string;
  sourceContentBytes: number;
  sourceContentSha256: string;
}

export interface SourceRevocation {
  revocationId: string;
  resourceId: string;
  sourceRevision: string;
  sourceRevisionSequence: number;
  reason: "source_unpublished" | "source_deleted" | "scope_removed" | "policy_removed" | "operator_hold";
  effectiveAt: string;
  restorable: boolean;
}

export interface SourceRevocationPage {
  highWater: string;
  policyRevision: string;
  items: SourceRevocation[];
  nextCursor: string | null;
  complete: boolean;
}

export interface SourceRevocationDetail extends SourceRevocation {
  affectedBindingIds: string[];
  policyRevision: string;
}

export interface RetrievedSourceContent {
  contentHtml: string;
  sanitizedContentHtml: string;
  sourceContentBytes: number;
  sourceContentSha256: string;
}

export async function fetchSourceInventoryPage(
  credentials: Alpha21Credentials,
  input: { snapshot?: string; cursor?: string; policyRevision?: string; limit?: number } = {},
  capability?: Alpha21ConnectionCapability,
): Promise<SourceInventoryPage> {
  await requireSourceCapability(credentials, capability, "inventory");
  const query = queryString({ snapshot: input.snapshot, cursor: input.cursor, limit: boundedLimit(input.limit) });
  const response = await requestAlpha21Json({
    method: "GET",
    path: `/discussion-bridge/v1/source-topics.json${query}`,
    credentials,
  });
  const value = response.payload;
  exactFields(value, ["snapshot", "policy_revision", "items", "next_cursor", "complete", "correlation_id"]);
  const snapshot = boundedText(value.snapshot, 8_192, "source snapshot");
  if (input.snapshot !== undefined && snapshot !== input.snapshot) throw new Error("DiscussionBridge source snapshot changed during resume.");
  const policyRevision = boundedText(value.policy_revision, 255, "source policy revision");
  if (input.policyRevision !== undefined && policyRevision !== input.policyRevision) {
    throw new Error("DiscussionBridge source policy changed during snapshot resume.");
  }
  const items = requiredArray(value.items, "source inventory items").map((item) => sourceInventoryItem(item, credentials.discourseUrl));
  return {
    snapshot,
    policyRevision,
    items,
    nextCursor: nullableText(value.next_cursor, 8_192, "source cursor"),
    complete: requiredBoolean(value.complete, "source inventory completion"),
  };
}

export async function fetchSourceTopicDetail(
  credentials: Alpha21Credentials,
  topicId: number,
  sourceRevision: string,
  capability?: Alpha21ConnectionCapability,
): Promise<SourceTopicDetail> {
  await requireSourceCapability(credentials, capability, "inventory");
  const requestedTopicId = positiveInteger(topicId, "source topic ID");
  const revision = boundedText(sourceRevision, 255, "source revision");
  const response = await requestAlpha21Json({
    method: "GET",
    path: `/discussion-bridge/v1/source-topics/${requestedTopicId}.json${queryString({ source_revision: revision })}`,
    credentials,
  });
  const value = response.payload;
  exactFields(value, [
    "resource_id", "topic_id", "topic_url", "title", "source_revision",
    "source_revision_sequence", "source_created_at", "source_updated_at",
    "source_authors", "categories", "tags", "presentation_mode",
    "content_transport", "content_disposition", "network_provenance", "correlation_id",
  ]);
  const item = sourceInventoryItem(value, credentials.discourseUrl);
  if (item.topicId !== requestedTopicId || item.sourceRevision !== revision) {
    throw new Error("DiscussionBridge source detail substituted a different identity or revision.");
  }
  const transport = requiredObject(value.content_transport, "source content transport");
  const content = await retrieveSourceContent(credentials, requestedTopicId, revision, transport);
  const presentationMode = boundedText(value.presentation_mode, 32, "source presentation mode");
  if (!["simple", "full", "interactive"].includes(presentationMode)) throw new Error("DiscussionBridge source presentation mode is invalid.");
  const contentDisposition = boundedText(value.content_disposition, 16, "source content disposition");
  if (contentDisposition !== "complete" && contentDisposition !== "excerpt") throw new Error("DiscussionBridge source content disposition is invalid.");
  const networkProvenance = value.network_provenance === null
    ? null
    : requiredObject(value.network_provenance, "network provenance");
  return {
    ...item,
    sourceAuthors: objectArray(value.source_authors, 20, "source authors"),
    categories: objectArray(value.categories, 20, "source categories"),
    tags: objectArray(value.tags, 100, "source tags"),
    presentationMode: presentationMode as SourceTopicDetail["presentationMode"],
    contentDisposition: contentDisposition as SourceTopicDetail["contentDisposition"],
    networkProvenance,
    ...content,
  };
}

export async function fetchSourceRevocationPage(
  credentials: Alpha21Credentials,
  input: { cursor?: string; highWater?: string; policyRevision?: string; limit?: number } = {},
  capability?: Alpha21ConnectionCapability,
): Promise<SourceRevocationPage> {
  await requireSourceCapability(credentials, capability, "revocations");
  const response = await requestAlpha21Json({
    method: "GET",
    path: `/discussion-bridge/v1/source-revocations.json${queryString({ cursor: input.cursor, high_water: input.highWater, limit: boundedLimit(input.limit) })}`,
    credentials,
  });
  const value = response.payload;
  exactFields(value, ["high_water", "policy_revision", "items", "next_cursor", "complete", "correlation_id"]);
  const highWater = boundedText(value.high_water, 8_192, "revocation high water");
  if (input.highWater !== undefined && highWater !== input.highWater) throw new Error("DiscussionBridge revocation high water changed during resume.");
  const policyRevision = boundedText(value.policy_revision, 255, "revocation policy revision");
  if (input.policyRevision !== undefined && policyRevision !== input.policyRevision) {
    throw new Error("DiscussionBridge revocation policy changed during resume.");
  }
  return {
    highWater,
    policyRevision,
    items: requiredArray(value.items, "revocation items").map(sourceRevocation),
    nextCursor: nullableText(value.next_cursor, 8_192, "revocation cursor"),
    complete: requiredBoolean(value.complete, "revocation completion"),
  };
}

export async function fetchSourceRevocationDetail(
  credentials: Alpha21Credentials,
  resourceId: string,
  capability?: Alpha21ConnectionCapability,
): Promise<SourceRevocationDetail> {
  await requireSourceCapability(credentials, capability, "revocations");
  const requested = requiredUuid(resourceId, "revocation resource ID");
  const response = await requestAlpha21Json({
    method: "GET",
    path: `/discussion-bridge/v1/source-revocations/${requested}.json`,
    credentials,
  });
  const value = response.payload;
  exactFields(value, [
    "revocation_id", "resource_id", "source_revision", "source_revision_sequence",
    "reason", "effective_at", "restorable", "affected_binding_ids", "policy_revision", "correlation_id",
  ]);
  const detail = sourceRevocation(value);
  if (detail.resourceId !== requested) throw new Error("DiscussionBridge revocation detail returned the wrong resource.");
  const bindings = requiredArray(value.affected_binding_ids, "affected binding IDs").map((item) => {
    const id = boundedText(item, 36, "affected binding ID");
    if (!/^dbb_[a-f0-9]{32}$/.test(id)) throw new Error("DiscussionBridge affected binding ID is invalid.");
    return id;
  });
  return { ...detail, affectedBindingIds: bindings, policyRevision: boundedText(value.policy_revision, 255, "revocation policy revision") };
}

async function requireSourceCapability(
  credentials: Alpha21Credentials,
  supplied: Alpha21ConnectionCapability | undefined,
  operation: "inventory" | "revocations",
): Promise<Alpha21ConnectionCapability> {
  const capability = supplied ?? await fetchAlpha21ConnectionCapability(credentials);
  if (!capability.enabled || !capability.directions.includes("from_discourse") || !capability.supportedOperations.includes(operation)) {
    throw new Error(`DiscussionBridge connection does not allow ${operation}.`);
  }
  if (!capability.destinationPolicies.some((policy) => policy.profile === "astro")) {
    throw new Error("DiscussionBridge connection has no Astro destination policy.");
  }
  return capability;
}

export async function retrieveSourceContent(
  credentials: Alpha21Credentials,
  topicId: number,
  sourceRevision: string,
  transport: Record<string, unknown>,
): Promise<RetrievedSourceContent> {
  const mode = boundedText(transport.mode, 16, "content transport mode");
  const mediaType = boundedText(transport.media_type, 64, "content media type");
  if (mediaType !== "text/html; charset=utf-8") throw new Error("DiscussionBridge source media type is invalid.");
  const bytes = nonnegativeInteger(transport.byte_length, "source byte length");
  if (bytes > SOURCE_MAXIMUM_BYTES) throw new Error("DiscussionBridge source content exceeds 16 MiB.");
  const sha256 = requiredSha256(transport.sha256, "source SHA-256");
  if (mode === "inline") {
    exactFields(transport, ["mode", "media_type", "byte_length", "sha256", "content_html"]);
    const html = typeof transport.content_html === "string" ? transport.content_html : fail("DiscussionBridge inline content is invalid.");
    verifyCompleteContent(html, bytes, sha256);
    return retrievedSourceContent(html, bytes, sha256);
  }
  if (mode !== "chunked") throw new Error("DiscussionBridge content transport mode is invalid.");
  exactFields(transport, ["mode", "media_type", "byte_length", "sha256", "chunk_count", "decoded_chunk_maximum_bytes"]);
  const chunkCount = positiveInteger(transport.chunk_count, "source chunk count");
  if (chunkCount > 512 || transport.decoded_chunk_maximum_bytes !== 32_768) throw new Error("DiscussionBridge chunk descriptor is invalid.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let chunk = 1; chunk <= chunkCount; chunk++) {
    const response = await requestAlpha21Json({
      method: "GET",
      path: `/discussion-bridge/v1/source-topics/${topicId}/content.json${queryString({ source_revision: sourceRevision, chunk })}`,
      credentials,
    });
    const value = response.payload;
    exactFields(value, ["source_revision", "chunk", "chunk_count", "decoded_bytes", "chunk_sha256", "content_base64", "correlation_id"]);
    if (value.source_revision !== sourceRevision || value.chunk !== chunk || value.chunk_count !== chunkCount) {
      throw new Error("DiscussionBridge source chunk identity is inconsistent.");
    }
    const encoded = boundedText(value.content_base64, 48_000, "source content chunk");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error("DiscussionBridge source chunk encoding is invalid.");
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.toString("base64") !== encoded || decoded.length !== value.decoded_bytes || decoded.length > 32_768) {
      throw new Error("DiscussionBridge source chunk length is invalid.");
    }
    if (createHash("sha256").update(decoded).digest("hex") !== requiredSha256(value.chunk_sha256, "chunk SHA-256")) {
      throw new Error("DiscussionBridge source chunk integrity failed.");
    }
    total += decoded.length;
    if (total > bytes || total > SOURCE_MAXIMUM_BYTES) throw new Error("DiscussionBridge source chunks exceed declared content size.");
    chunks.push(decoded);
  }
  const complete = Buffer.concat(chunks);
  if (complete.length !== bytes || createHash("sha256").update(complete).digest("hex") !== sha256) {
    throw new Error("DiscussionBridge complete source content integrity failed.");
  }
  let html: string;
  try { html = new TextDecoder("utf-8", { fatal: true }).decode(complete); }
  catch { throw new Error("DiscussionBridge complete source content is not valid UTF-8."); }
  return retrievedSourceContent(html, bytes, sha256);
}

function retrievedSourceContent(html: string, bytes: number, sha256: string): RetrievedSourceContent {
  return {
    contentHtml: html,
    sanitizedContentHtml: sanitizedSourceHtml(html),
    sourceContentBytes: bytes,
    sourceContentSha256: sha256,
  };
}

function verifyCompleteContent(html: string, bytes: number, sha256: string): void {
  const encoded = new TextEncoder().encode(html);
  if (encoded.byteLength !== bytes || createHash("sha256").update(encoded).digest("hex") !== sha256) {
    throw new Error("DiscussionBridge complete source content integrity failed.");
  }
}

function sanitizedSourceHtml(value: string): string {
  const sanitized = sanitizeHtml(value, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "h3", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td", "div", "span"]),
    allowedAttributes: { a: ["href", "title", "rel"], img: ["src", "alt", "title", "width", "height"], code: ["class"], pre: ["class"], div: ["class"], span: ["class"] },
    allowedSchemes: ["https"],
    allowProtocolRelative: false,
  });
  if (!sanitized.trim()) throw new Error("DiscussionBridge source content is empty after sanitization.");
  return sanitized;
}

function sourceInventoryItem(value: unknown, discourseUrl: string): SourceInventoryItem {
  const item = requiredObject(value, "source inventory item");
  exactFields(item, ["resource_id", "topic_id", "topic_url", "title", "source_revision", "source_revision_sequence", "source_created_at", "source_updated_at"], ["source_authors", "categories", "tags", "presentation_mode", "content_transport", "content_disposition", "network_provenance", "correlation_id"]);
  const topicId = positiveInteger(item.topic_id, "source topic ID");
  const topicUrl = boundedText(item.topic_url, 2_048, "source topic URL");
  if (parsePublicDiscourseTopicUrl(topicUrl, discourseUrl, "source topic URL").topicId !== topicId) throw new Error("DiscussionBridge source topic identity is inconsistent.");
  const created = timestamp(item.source_created_at, "source creation time");
  const updated = timestamp(item.source_updated_at, "source modification time");
  if (Date.parse(updated) < Date.parse(created)) throw new Error("DiscussionBridge source modification precedes creation.");
  return {
    resourceId: requiredUuid(item.resource_id, "source resource ID"),
    topicId,
    topicUrl,
    title: boundedText(item.title, 1_024, "source title"),
    sourceRevision: boundedText(item.source_revision, 255, "source revision"),
    sourceRevisionSequence: positiveInteger(item.source_revision_sequence, "source revision sequence"),
    sourceCreatedAt: created,
    sourceUpdatedAt: updated,
  };
}

function sourceRevocation(value: unknown): SourceRevocation {
  const item = requiredObject(value, "source revocation");
  exactFields(item, ["revocation_id", "resource_id", "source_revision", "source_revision_sequence", "reason", "effective_at", "restorable"], ["affected_binding_ids", "policy_revision", "correlation_id"]);
  const revocationId = boundedText(item.revocation_id, 36, "revocation ID");
  if (!REVOCATION_ID.test(revocationId)) throw new Error("DiscussionBridge revocation ID is invalid.");
  const reason = boundedText(item.reason, 64, "revocation reason");
  const reasons = ["source_unpublished", "source_deleted", "scope_removed", "policy_removed", "operator_hold"] as const;
  if (!reasons.includes(reason as typeof reasons[number])) throw new Error("DiscussionBridge revocation reason is invalid.");
  return {
    revocationId,
    resourceId: requiredUuid(item.resource_id, "revocation resource ID"),
    sourceRevision: boundedText(item.source_revision, 255, "revocation source revision"),
    sourceRevisionSequence: positiveInteger(item.source_revision_sequence, "revocation source revision sequence"),
    reason: reason as SourceRevocation["reason"],
    effectiveAt: timestamp(item.effective_at, "revocation effective time"),
    restorable: requiredBoolean(item.restorable, "revocation restorable state"),
  };
}

function queryString(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) query.set(key, String(value));
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function boundedLimit(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) throw new Error("DiscussionBridge page limit is invalid.");
  return value;
}

function exactFields(value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new Error("DiscussionBridge response schema is invalid.");
  }
}

function requiredObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return value as Record<string, unknown>;
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return value;
}

function objectArray(value: unknown, maximum: number, label: string): Record<string, unknown>[] {
  const items = requiredArray(value, label);
  if (items.length > maximum) throw new Error(`DiscussionBridge ${label} exceeds its bound.`);
  return items.map((item) => requiredObject(item, label));
}

function boundedText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() || new TextEncoder().encode(value).byteLength > maximum || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return value;
}

function nullableText(value: unknown, maximum: number, label: string): string | null {
  return value === null ? null : boundedText(value, maximum, label);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return Number(value);
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return Number(value);
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`DiscussionBridge ${label} is invalid.`);
  return value;
}

function requiredUuid(value: unknown, label: string): string {
  const id = boundedText(value, 36, label).toLowerCase();
  if (!UUID.test(id)) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return id;
}

function requiredSha256(value: unknown, label: string): string {
  const digest = boundedText(value, 64, label);
  if (!SHA256.test(digest)) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return digest;
}

function timestamp(value: unknown, label: string): string {
  const text = boundedText(value, 64, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(text) || !Number.isFinite(Date.parse(text))) throw new Error(`DiscussionBridge ${label} is invalid.`);
  return text;
}

function fail(message: string): never { throw new Error(message); }
