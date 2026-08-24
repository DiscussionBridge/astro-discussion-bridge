import {
  assertServiceResponseUrl,
  normalizeServiceBaseUrl,
  parseServiceBaseUrl,
  resolveServiceRequestUrl,
} from "../web-url.js";

export interface DiscourseClientOptions {
  discourseUrl: string;
  apiKey?: string;
  apiUsername?: string;
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export interface SiteSettingsResponse {
  min_topic_title_length?: number;
  max_topic_title_length?: number;
  min_first_post_length?: number;
  min_post_length?: number;
  max_post_length?: number;
  max_tags_per_topic?: number;
  max_tag_length?: number;
  tagging_enabled?: boolean;
}

export interface SiteInfoResponse {
  can_tag_topics?: boolean;
  can_create_tag?: boolean;
}

export interface CategoriesResponse {
  category_list?: {
    categories?: DiscourseCategory[];
  };
}

export interface DiscourseCategory {
  id: number;
  name: string;
  slug?: string;
  read_restricted?: boolean;
  parent_category_id?: number | null;
  topic_count?: number;
}

export interface CategoryTopicsResponse {
  topic_list?: {
    more_topics_url?: string | null;
    per_page?: number;
    topics?: DiscourseTopicListItem[];
  };
}

export interface DiscourseTopicListItem {
  id: number;
  title: string;
  slug?: string;
  category_id?: number;
  created_at: string;
  bumped_at?: string;
  closed?: boolean;
  archived?: boolean;
  visible?: boolean;
  tags?: Array<DiscourseTag | string>;
}

export interface TagsResponse {
  tags?: DiscourseTagListItem[];
}

export interface DiscourseTagListItem {
  id?: number;
  name?: string;
  text?: string;
  count?: number;
}

export interface EmbedInfoResponse {
  topic_id?: number;
  post_id?: number;
  topic_slug?: string;
  comment_count?: number;
}

export interface SearchResponse {
  topics?: Array<{
    id: number;
    title?: string;
    slug?: string;
  }>;
  posts?: Array<{
    id: number;
    topic_id: number;
  }>;
}

export interface CreateTopicInput {
  title: string;
  raw: string;
  category?: number;
  tags?: string[];
  embedUrl?: string;
}

export interface CreatePrivateMessageInput {
  title: string;
  raw: string;
  recipients: string[];
}

export interface CreateTopicResponse {
  id: number;
  name: string;
  username: string;
  avatar_template: string;
  created_at: string;
  cooked: string;
  post_number: number;
  post_type: number;
  updated_at: string;
  reply_count: number;
  reply_to_post_number: number | null;
  reply_to_user?: DiscourseReplyToUser;
  quote_count: number;
  incoming_link_count: number;
  reads: number;
  readers_count: number;
  score: number;
  topic_id: number;
  topic_slug: string;
}

export interface TopicResponse {
  id: number;
  title: string;
  fancy_title: string;
  slug?: string;
  category_id?: number;
  visible?: boolean;
  tags?: Array<DiscourseTag | string>;
  posts_count: number;
  created_at: string;
  post_stream: {
    posts: DiscoursePost[];
    stream: number[];
  };
}

export interface UpdatePostInput {
  postId: number | string;
  raw: string;
  editReason?: string;
  bypassBump?: boolean;
}

export interface UpdatePostResponse {
  post: DiscoursePost;
}

export interface UpdateTopicInput {
  topicId: number | string;
  title?: string;
  categoryId?: number;
  tags?: string[];
}

export interface UpdateTopicResponse {
  basic_topic: {
    id: number;
    title: string;
    fancy_title?: string;
    slug?: string;
    posts_count?: number;
    category_id?: number;
  };
  tags?: DiscourseTag[];
}

export interface UpdateTopicStatusInput {
  topicId: number | string;
  status: "visible" | "closed" | "archived" | "pinned";
  enabled: boolean;
}

export interface DiscoursePost {
  id: number;
  name: string;
  username: string;
  avatar_template: string;
  created_at: string;
  raw?: string;
  cooked: string;
  post_number: number;
  post_type: number;
  updated_at: string;
  reply_count: number;
  reply_to_post_number: number | null;
  quote_count: number;
  incoming_link_count: number;
  reads: number;
  readers_count: number;
  score: number;
  like_count?: number;
  actions_summary?: DiscoursePostActionSummary[];
  reactions?: DiscoursePostReaction[];
  yours?: boolean;
  topic_id: number;
  topic_slug: string;
  display_username: string | null;
  primary_group_name: string | null;
  flair_name: string | null;
  flair_url: string | null;
  flair_bg_color: string | null;
  flair_color: string | null;
  version: number;
  can_edit?: boolean;
  can_delete?: boolean;
  can_recover?: boolean;
  can_wiki?: boolean;
  user_title: string | null;
  trust_level?: number;
  user_id?: number;
}

export interface DiscoursePostActionSummary {
  id: number;
  count?: number;
  acted?: boolean;
  can_act?: boolean;
}

export interface DiscourseReplyToUser {
  id: number;
  username: string;
  name: string | null;
  avatar_template: string;
}

export interface DiscoursePostReaction {
  id: string;
  type: string;
  count: number;
}

export interface DiscourseTag {
  id?: number;
  name: string;
  slug?: string;
}

export function createDiscourseClient(options: DiscourseClientOptions) {
  const serviceBase = parseServiceBaseUrl(options.discourseUrl);
  const discourseUrl = normalizeServiceBaseUrl(options.discourseUrl);
  const fetcher = options.fetch ?? fetch;
  const apiKey = nonEmptyCredential(options.apiKey);
  const apiUsername = nonEmptyCredential(options.apiUsername);
  const requestTimeoutMs = positiveBoundedInteger(
    options.requestTimeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
    "Discourse requestTimeoutMs",
    10 * 60 * 1000,
  );
  const maxResponseBytes = positiveBoundedInteger(
    options.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES,
    "Discourse maxResponseBytes",
    64 * 1024 * 1024,
  );

  async function request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    if (Boolean(apiKey) !== Boolean(apiUsername)) {
      throw new Error("Discourse client authentication requires both apiKey and apiUsername.");
    }
    if (apiKey && serviceBase.protocol !== "https:") {
      throw new Error("Credentialed Discourse requests require HTTPS.");
    }
    const url = resolveServiceRequestUrl(pathname, serviceBase);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");
    if (apiKey) headers.set("Api-Key", apiKey);
    else headers.delete("Api-Key");
    if (apiUsername) headers.set("Api-Username", apiUsername);
    else headers.delete("Api-Username");
    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
    let response: Response;
    try {
      response = await fetcher(url, {
        ...init,
        headers,
        credentials: "omit",
        redirect: "error",
        signal,
      });
    } catch (error) {
      throw new Error(
        `Discourse request failed: network error during ${method} ${url.href}. ${errorMessage(error)}`,
      );
    }

    if (response.url) assertServiceResponseUrl(response.url, serviceBase);

    if (!response.ok) {
      const body = await readBoundedResponseText(response, Math.min(maxResponseBytes, 4096)).catch(() => "");
      throw new Error(
        `Discourse request failed: ${response.status} ${response.statusText}${body ? `\n${safeErrorDetail(body, [apiKey, apiUsername])}` : ""}`,
      );
    }

    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (!contentType || !(contentType === "application/json" || contentType.endsWith("+json"))) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Discourse response was not JSON (${contentType || "missing content type"}).`);
    }
    const body = await readBoundedResponseText(response, maxResponseBytes);
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new Error("Discourse response contained malformed JSON.");
    }
  }

  return {
    discourseUrl,
    createTopic(input: CreateTopicInput) {
      const body: Record<string, unknown> = {
        title: input.title,
        raw: input.raw,
      };

      if (input.category) body.category = input.category;
      if (input.tags?.length) body.tags = input.tags;
      if (input.embedUrl) body.embed_url = input.embedUrl;

      return request<CreateTopicResponse>("/posts.json", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    createPrivateMessage(input: CreatePrivateMessageInput) {
      return request<CreateTopicResponse>("/posts.json", {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          raw: input.raw,
          archetype: "private_message",
          target_recipients: input.recipients.join(","),
        }),
      });
    },
    topic(topicId: number | string) {
      return request<TopicResponse>(`/t/${topicId}.json`);
    },
    post(postId: number | string) {
      return request<DiscoursePost>(`/posts/${postId}.json`);
    },
    siteSettings() {
      return request<SiteSettingsResponse>("/site/settings.json");
    },
    siteInfo() {
      return request<SiteInfoResponse>("/site.json");
    },
    categories() {
      return request<CategoriesResponse>("/categories.json");
    },
    categoryTopics(pathname: string) {
      return request<CategoryTopicsResponse>(pathname);
    },
    tags() {
      return request<TagsResponse>("/tags.json");
    },
    embedInfo(embedUrl: string) {
      const search = new URLSearchParams({ embed_url: embedUrl });
      return request<EmbedInfoResponse>(`/embed/info?${search.toString()}`);
    },
    search(term: string) {
      const search = new URLSearchParams({ term });
      return request<SearchResponse>(`/search/query?${search.toString()}`);
    },
    updateTopic(input: UpdateTopicInput) {
      return request<UpdateTopicResponse>(`/t/-/${input.topicId}.json`, {
        method: "PUT",
        body: JSON.stringify({
          ...(input.title ? { title: input.title } : {}),
          ...(input.categoryId ? { category_id: input.categoryId } : {}),
          ...(input.tags ? { tags: input.tags.map((name) => ({ name })) } : {}),
        }),
      });
    },
    updateTopicStatus(input: UpdateTopicStatusInput) {
      return request<unknown>(`/t/${input.topicId}/status.json`, {
        method: "PUT",
        body: JSON.stringify({
          status: input.status,
          enabled: String(input.enabled),
        }),
      });
    },
    updatePost(input: UpdatePostInput) {
      return request<UpdatePostResponse>(`/posts/${input.postId}.json`, {
        method: "PUT",
        body: JSON.stringify({
          post: {
            raw: input.raw,
            ...(input.editReason ? { edit_reason: input.editReason } : {}),
          },
          ...(input.bypassBump !== undefined ? { bypass_bump: input.bypassBump } : {}),
        }),
      });
    },
    request,
  };
}

function nonEmptyCredential(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function positiveBoundedInteger(
  value: number | undefined,
  fallback: number,
  label: string,
  maximum: number,
): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate <= 0 || candidate > maximum) {
    throw new Error(`${label} must be a positive bounded integer.`);
  }
  return candidate;
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Discourse response exceeds the configured size limit.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      throw new Error("Discourse response exceeds the configured size limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function safeErrorDetail(value: string, protectedValues: Array<string | undefined>): string {
  let detail = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  for (const protectedValue of protectedValues) {
    if (protectedValue) detail = detail.replaceAll(protectedValue, "[REDACTED]");
  }
  return detail.slice(0, 1024);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
