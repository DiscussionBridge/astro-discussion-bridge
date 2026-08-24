import type { DiscoursePost } from "../discourse/client.js";

const REFRESH_TIMEOUT_MS = 10_000;
const MAX_REFRESH_BYTES = 2 * 1024 * 1024;
const MAX_COOKED_BYTES = 512 * 1024;
const MAX_REFRESH_POSTS = 1_000;

export interface BrowserRefreshConfig {
  discourseUrl: string;
  refreshEndpoint?: string;
  topicId: string;
}

export async function fetchRefreshPosts(
  config: BrowserRefreshConfig,
  options: {
    fetchImpl?: typeof fetch;
    pageOrigin?: string;
  } = {},
): Promise<DiscoursePost[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pageOrigin = new URL(options.pageOrigin ?? window.location.origin).origin;
  const request = refreshRequest(config, pageOrigin);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(request.url, {
      headers: { Accept: "application/json" },
      redirect: "error",
      credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Refresh failed with HTTP ${response.status}.`);
    assertJsonResponse(response);
    assertFinalResponse(response, request);
    const payload = JSON.parse(await readBoundedText(response));
    return validateRefreshPayload(payload, Number(config.topicId));
  } finally {
    clearTimeout(timeout);
  }
}

function refreshRequest(
  config: BrowserRefreshConfig,
  pageOrigin: string,
): { url: URL; allowedOrigin: string; allowedPathPrefix?: string } {
  if (!/^[1-9]\d*$/.test(config.topicId) || !Number.isSafeInteger(Number(config.topicId))) {
    throw new Error("Invalid refresh topic ID.");
  }

  if (config.refreshEndpoint) {
    if (!config.refreshEndpoint.startsWith("/") || config.refreshEndpoint.startsWith("//")) {
      throw new Error("The refresh proxy must be a same-origin absolute-path endpoint.");
    }
    const replaced = config.refreshEndpoint.replace(
      "{topicId}",
      encodeURIComponent(config.topicId),
    );
    const url = new URL(replaced, pageOrigin);
    if (url.origin !== pageOrigin || url.username || url.password || url.hash) {
      throw new Error("The refresh proxy must remain on the Astro page origin.");
    }
    return { url, allowedOrigin: pageOrigin };
  }

  const base = new URL(config.discourseUrl);
  if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error("Invalid Discourse refresh base URL.");
  }
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;
  const url = new URL(`t/${config.topicId}.json`, base);
  return {
    url,
    allowedOrigin: base.origin,
    allowedPathPrefix: base.pathname,
  };
}

function assertFinalResponse(
  response: Response,
  request: { url: URL; allowedOrigin: string; allowedPathPrefix?: string },
): void {
  if (!response.url) throw new Error("Refresh response did not expose its final URL.");
  const finalUrl = new URL(response.url);
  if (
    finalUrl.origin !== request.allowedOrigin ||
    (request.allowedPathPrefix && !finalUrl.pathname.startsWith(request.allowedPathPrefix))
  ) {
    throw new Error("Refresh response escaped its trusted URL boundary.");
  }
}

function assertJsonResponse(response: Response): void {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json" && !contentType?.endsWith("+json")) {
    throw new Error("Refresh response must be JSON.");
  }
  const declared = response.headers.get("content-length");
  if (declared) {
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_REFRESH_BYTES) {
      throw new Error("Refresh response exceeds the size limit.");
    }
  }
}

async function readBoundedText(response: Response): Promise<string> {
  if (!response.body) throw new Error("Refresh response body is unavailable.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REFRESH_BYTES) throw new Error("Refresh response exceeds the size limit.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}

function validateRefreshPayload(value: unknown, expectedTopicId: number): DiscoursePost[] {
  if (!isRecord(value) || !isRecord(value.post_stream) || !Array.isArray(value.post_stream.posts)) {
    throw new Error("Refresh payload does not contain a Discourse post stream.");
  }
  if (value.id !== undefined && value.id !== expectedTopicId) {
    throw new Error("Refresh payload belongs to a different topic.");
  }
  if (value.post_stream.posts.length > MAX_REFRESH_POSTS) {
    throw new Error("Refresh payload contains too many posts.");
  }
  return value.post_stream.posts.map((post, index) =>
    validatePost(post, index, expectedTopicId)
  );
}

function validatePost(value: unknown, index: number, expectedTopicId: number): DiscoursePost {
  if (!isRecord(value)) throw new Error(`Refresh post ${index} is invalid.`);
  for (const key of ["id", "post_number", "topic_id"] as const) {
    if (!positiveSafeInteger(value[key])) throw new Error(`Refresh post ${index} has an invalid ${key}.`);
  }
  if (value.topic_id !== expectedTopicId) {
    throw new Error(`Refresh post ${index} belongs to a different topic.`);
  }
  if (typeof value.score !== "number" || !Number.isFinite(value.score)) {
    throw new Error(`Refresh post ${index} has an invalid score.`);
  }
  for (const key of ["username", "topic_slug", "created_at", "cooked"] as const) {
    if (typeof value[key] !== "string" || !value[key] || value[key].length > 1_000_000) {
      throw new Error(`Refresh post ${index} has an invalid ${key}.`);
    }
  }
  if (new TextEncoder().encode(value.cooked as string).byteLength > MAX_COOKED_BYTES) {
    throw new Error(`Refresh post ${index} cooked HTML exceeds the size limit.`);
  }
  if (!Number.isFinite(Date.parse(value.created_at as string))) {
    throw new Error(`Refresh post ${index} has an invalid created_at.`);
  }
  return value as unknown as DiscoursePost;
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
