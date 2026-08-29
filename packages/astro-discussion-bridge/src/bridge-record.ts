import sanitizeHtml from "sanitize-html";
import {
  assertServiceResponseUrl,
  parsePublicDiscourseTopicUrl,
  parseServiceBaseUrl,
  resolveServiceRequestUrl,
} from "./web-url.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 65_536;
const RESOURCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface BridgeRecordCredentials {
  discourseUrl: string;
  connectionId: string;
  connectionSecret: string;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
}

export interface PresentedBridgeRecord {
  resourceId: string;
  title: string;
  topicId: number;
  topicUrl: string;
  contentHtml: string;
}

export async function fetchFromDiscourseRecord(
  resourceId: string,
  credentials: BridgeRecordCredentials,
): Promise<PresentedBridgeRecord> {
  const normalizedResourceId = requiredResourceId(resourceId);
  validateCredentials(credentials);
  const serviceBase = parseServiceBaseUrl(credentials.discourseUrl);
  if (serviceBase.protocol !== "https:") throw new Error("DiscussionBridge record retrieval requires HTTPS.");
  const endpoint = resolveServiceRequestUrl(
    `/discussion-bridge/v1/bridge-records/${encodeURIComponent(normalizedResourceId)}.json`,
    serviceBase,
  );
  const response = await fetch(endpoint, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(positiveBoundedInteger(credentials.requestTimeoutMs, DEFAULT_TIMEOUT_MS, 10 * 60 * 1_000)),
    headers: {
      Accept: "application/json",
      "X-DiscussionBridge-Connection": credentials.connectionId,
      "X-DiscussionBridge-Secret": credentials.connectionSecret,
    },
  });
  if (response.url) assertServiceResponseUrl(response.url, serviceBase, "DiscussionBridge record response URL");
  const payload = await boundedJson(
    response,
    positiveBoundedInteger(credentials.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES, 64 * 1024 * 1024),
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
    || typeof value.content_html !== "string"
    || !value.content_html
    || new TextEncoder().encode(value.content_html).byteLength > DEFAULT_MAX_RESPONSE_BYTES
  ) {
    throw new Error("DiscussionBridge record response is invalid.");
  }
  const topic = parsePublicDiscourseTopicUrl(value.topic_url, credentials.discourseUrl, "DiscussionBridge record topic URL");
  if (topic.topicId !== value.topic_id) throw new Error("DiscussionBridge record topic identity is inconsistent.");
  const contentHtml = sanitizeHtml(value.content_html, {
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
  return {
    resourceId: normalizedResourceId,
    title: value.title,
    topicId: value.topic_id,
    topicUrl: value.topic_url,
    contentHtml,
  };
}

function validateCredentials(credentials: BridgeRecordCredentials): void {
  if (!/^dbc_[a-z0-9]{24}$/.test(credentials.connectionId)) {
    throw new Error("DiscussionBridge connection ID is invalid.");
  }
  if (
    typeof credentials.connectionSecret !== "string"
    || credentials.connectionSecret.length < 32
    || credentials.connectionSecret.length > 256
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

async function boundedJson(response: Response, maximum: number): Promise<Record<string, unknown>> {
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
  while (true) {
    const { done, value } = await reader.read();
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
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("DiscussionBridge record response JSON is invalid.");
  }
  return parsed as Record<string, unknown>;
}
