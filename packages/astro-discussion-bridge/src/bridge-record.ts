import sanitizeHtml from "sanitize-html";
import { resolveServerSecret } from "./server-secret.js";
import {
  assertServiceResponseUrl,
  parsePublicDiscourseTopicUrl,
  parseServiceBaseUrl,
  resolveServiceRequestUrl,
} from "./web-url.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 65_536;
const RESOURCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITION = /^[0-9a-f]{64}$/u;

export interface BridgeRecordCredentials {
  discourseUrl: string;
  connectionId: string;
  connectionSecret?: string;
  secretFile?: string;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
}

export interface PresentedBridgeRecord {
  resourceId: string;
  title: string;
  topicId: number;
  topicUrl: string;
  contentHtml: string;
  forumName: string;
  sourceCreatedAt?: string;
  sourceUpdatedAt?: string;
}

export async function fetchFromDiscourseRecord(
  resourceId: string,
  credentials: BridgeRecordCredentials,
): Promise<PresentedBridgeRecord> {
  return fetchRecord(resourceId, credentials, 0);
}

async function fetchRecord(resourceId: string, credentials: BridgeRecordCredentials, attempt: number): Promise<PresentedBridgeRecord> {
  credentials = await resolveServerSecret(credentials);
  const normalizedResourceId = requiredResourceId(resourceId);
  validateCredentials(credentials);
  const serviceBase = parseServiceBaseUrl(credentials.discourseUrl);
  if (serviceBase.protocol !== "https:") throw new Error("DiscussionBridge record retrieval requires HTTPS.");
  const endpoint = resolveServiceRequestUrl(
    `/discussion-bridge/v1/bridge-records/${encodeURIComponent(normalizedResourceId)}.json`,
    serviceBase,
  );
  endpoint.searchParams.set("publication_contract", "0.3.0-alpha.1");
  const signal = AbortSignal.timeout(positiveBoundedInteger(credentials.requestTimeoutMs, DEFAULT_TIMEOUT_MS, 10 * 60 * 1_000));
  const response = await fetch(endpoint, {
    method: "GET",
    redirect: "error",
    signal,
    headers: {
      Accept: "application/json",
      "X-DiscussionBridge-Connection": credentials.connectionId,
      "X-DiscussionBridge-Secret": credentials.connectionSecret,
    },
  });
  if (response.url) assertServiceResponseUrl(response.url, serviceBase, "DiscussionBridge record response URL");
  const payload = await boundedJson(
    response,
    positiveBoundedInteger(credentials.maxResponseBytes, 2_097_152, 64 * 1024 * 1024),
    signal,
  );
  if (!response.ok) throw new Error(`DiscussionBridge record retrieval failed with HTTP ${response.status}.`);
  const record = payload.bridge_record;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("DiscussionBridge record response is invalid.");
  }
  const value = record as Record<string, unknown>;
  if (
    requiredResourceId(value.resource_id) !== normalizedResourceId
    || value.direction !== "from_discourse"
    || value.state !== "healthy"
    || typeof value.title !== "string"
    || !value.title
    || new TextEncoder().encode(value.title).byteLength > 1_024
    || typeof value.topic_id !== "number"
    || !Number.isSafeInteger(value.topic_id)
    || value.topic_id <= 0
    || typeof value.topic_url !== "string"
    || (value.source && typeof value.source === "object" && (value.source as Record<string, unknown>).status === "withdrawn")
    || (!(value.source && typeof value.source === "object" && (value.source as Record<string, unknown>).content) && (typeof value.content_html !== "string" || !value.content_html || new TextEncoder().encode(value.content_html).byteLength > DEFAULT_MAX_RESPONSE_BYTES))
  ) {
    throw new Error("DiscussionBridge record response is invalid.");
  }
  const topic = parsePublicDiscourseTopicUrl(value.topic_url, credentials.discourseUrl, "DiscussionBridge record topic URL");
  if (topic.topicId !== value.topic_id) throw new Error("DiscussionBridge record topic identity is inconsistent.");
  let completeContent: string;
  try {
    completeContent = value.source && typeof value.source === "object" && (value.source as Record<string, unknown>).content
      ? await completeSourceContent(value, credentials, serviceBase) : value.content_html as string;
  } catch (error) {
    if (!(error instanceof SourceEditionChanged) || attempt >= 2) throw error;
    return fetchRecord(resourceId, credentials, attempt + 1);
  }
  const contentHtml = sanitizeHtml(completeContent, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      a: ["href", "title", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      code: ["class"],
      pre: ["class"],
    },
    allowedSchemes: ["https"],
    allowProtocolRelative: false,
  });
  if (!contentHtml.trim()) throw new Error("DiscussionBridge record content is empty after sanitization.");
  const source = value.source && typeof value.source === "object" ? value.source as Record<string, unknown> : {};
  const forumName = source.forum_name === undefined ? serviceBase.origin : source.forum_name;
  if (typeof forumName !== "string" || !forumName.trim() || new TextEncoder().encode(forumName).byteLength > 200 || /[\x00-\x1f\x7f]/u.test(forumName)) throw new Error("Invalid DiscussionBridge source forum name.");
  const sourceDate = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string" || value.length > 64 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid DiscussionBridge source date.");
    return value;
  };
  return {
    resourceId: normalizedResourceId,
    title: value.title,
    topicId: value.topic_id,
    topicUrl: value.topic_url,
    contentHtml,
    forumName: forumName.trim(),
    sourceCreatedAt: sourceDate(source.created_at),
    sourceUpdatedAt: sourceDate(source.updated_at),
  };
}

class SourceEditionChanged extends Error {}

async function completeSourceContent(record: Record<string, unknown>, credentials: BridgeRecordCredentials, serviceBase: URL): Promise<string> {
  validateCredentials(credentials);
  const source = record.source as Record<string, unknown>;
  const descriptor = source.content as Record<string, unknown> | undefined;
  const resourceId = requiredResourceId(record.resource_id);
  if (!descriptor || typeof descriptor !== "object" || typeof source.edition !== "string" || !EDITION.test(source.edition) || !Number.isSafeInteger(descriptor.bytes) || Number(descriptor.bytes) < 1 || typeof descriptor.sha256 !== "string" || !EDITION.test(descriptor.sha256) || descriptor.chunk_bytes !== 32768 || descriptor.path !== `/discussion-bridge/v1/bridge-records/${resourceId}/content.json`) throw new Error("Invalid DiscussionBridge source content descriptor.");
  const chunks: Uint8Array[] = [];
  let offset = 0;
  while (offset < Number(descriptor.bytes)) {
    const endpoint = resolveServiceRequestUrl(String(descriptor.path), serviceBase);
    endpoint.searchParams.set("edition", source.edition);
    endpoint.searchParams.set("offset", String(offset));
    const signal = AbortSignal.timeout(positiveBoundedInteger(credentials.requestTimeoutMs, DEFAULT_TIMEOUT_MS, 600_000));
    const response = await fetch(endpoint, { method: "GET", redirect: "error", signal, headers: { Accept: "application/json", "X-DiscussionBridge-Connection": credentials.connectionId, "X-DiscussionBridge-Secret": credentials.connectionSecret } });
    if (response.url) assertServiceResponseUrl(response.url, serviceBase, "DiscussionBridge source response URL");
    const chunk = await boundedJson(response, 65536, signal);
    if (response.status === 409) throw new SourceEditionChanged("DiscussionBridge source edition changed.");
    if (!response.ok) throw new Error(`DiscussionBridge source content request failed with HTTP ${response.status}.`);
    if (chunk.resource_id !== resourceId || chunk.edition !== source.edition || chunk.offset !== offset || chunk.total_bytes !== descriptor.bytes || chunk.content_sha256 !== descriptor.sha256 || typeof chunk.chunk_base64 !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(chunk.chunk_base64)) throw new Error("Invalid DiscussionBridge source content chunk.");
    const decoded = atob(chunk.chunk_base64);
    if (btoa(decoded) !== chunk.chunk_base64 || decoded.length !== Math.min(32768, Number(descriptor.bytes) - offset)) throw new Error("Invalid DiscussionBridge source content chunk length.");
    const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
    offset += bytes.byteLength;
    if (chunk.next_offset !== (offset === descriptor.bytes ? null : offset)) throw new Error("Invalid DiscussionBridge source content continuation.");
    chunks.push(bytes);
  }
  const complete = new Uint8Array(offset);
  let index = 0;
  for (const chunk of chunks) { complete.set(chunk, index); index += chunk.byteLength; }
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", complete));
  const digest = Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
  if (digest !== descriptor.sha256) throw new Error("Invalid DiscussionBridge complete content digest.");
  return new TextDecoder("utf-8", { fatal: true }).decode(complete);
}

function validateCredentials(credentials: BridgeRecordCredentials): asserts credentials is BridgeRecordCredentials & { connectionSecret: string } {
  if (!/^dbc_[a-z0-9]{24}$/.test(credentials.connectionId)) {
    throw new Error("DiscussionBridge connection ID is invalid.");
  }
  if (
    typeof credentials.connectionSecret !== "string"
    || new TextEncoder().encode(credentials.connectionSecret).byteLength < 32
    || new TextEncoder().encode(credentials.connectionSecret).byteLength > 256
    || /[\u0000-\u001f\u007f]/u.test(credentials.connectionSecret)
  ) {
    throw new Error("DiscussionBridge connection secret is invalid.");
  }
}

function requiredResourceId(value: unknown): string {
  if (typeof value !== "string" || !RESOURCE_ID.test(value)) {
    throw new Error("DiscussionBridge resource ID is invalid.");
  }
  return value.toLowerCase();
}

function positiveBoundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0 || selected > maximum) {
    throw new Error("DiscussionBridge request bound is invalid.");
  }
  return selected;
}

async function boundedJson(response: Response, maximum: number, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (!contentType || !(contentType === "application/json" || contentType.endsWith("+json"))) {
    response.body?.cancel().catch(() => undefined);
    throw new Error("DiscussionBridge record response is not JSON.");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) {
    response.body?.cancel().catch(() => undefined);
    throw new Error("DiscussionBridge record response is too large.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("DiscussionBridge record response is empty.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => { void reader.cancel(signal?.reason).catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
  while (true) {
    signal?.throwIfAborted();
    const { done, value } = await reader.read();
    signal?.throwIfAborted();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) {
      await reader.cancel();
      throw new Error("DiscussionBridge record response is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("DiscussionBridge record response JSON is invalid.");
  }
  return parsed as Record<string, unknown>;
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
