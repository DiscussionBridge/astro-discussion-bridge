export interface DiscourseClientOptions {
  discourseUrl: string;
  apiKey?: string;
  apiUsername?: string;
  fetch?: typeof fetch;
}

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
  tags?: DiscourseTag[];
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
  const discourseUrl = normalizeBaseUrl(options.discourseUrl);
  const fetcher = options.fetch ?? fetch;

  async function request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const response = await fetcher(new URL(pathname, discourseUrl), {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(options.apiKey ? { "Api-Key": options.apiKey } : {}),
        ...(options.apiUsername ? { "Api-Username": options.apiUsername } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Discourse request failed: ${response.status} ${response.statusText}${body ? `\n${body}` : ""}`,
      );
    }

    return response.json() as Promise<T>;
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
    tags() {
      return request<TagsResponse>("/tags.json");
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

function normalizeBaseUrl(value: string): string {
  return new URL(value).href.replace(/\/+$/, "");
}
