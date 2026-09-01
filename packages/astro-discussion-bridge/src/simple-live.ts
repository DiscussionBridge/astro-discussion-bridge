import DOMPurify from "dompurify";

const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_REPLIES = 50;
const INITIAL_REPLIES = 5;
const FETCH_BATCH_SIZE = 20;
const BRANDING_CACHE_MS = 10 * 60 * 1000;
const brandingCache = new Map<string, { expiresAt: number; value: Promise<boolean> }>();

interface PublicPost {
  id: number;
  avatar_template?: string;
  cooked: string;
  created_at: string;
  display_username?: string;
  post_number: number;
  topic_id: number;
  username: string;
}

interface TopicPayload {
  post_stream?: { posts?: unknown[]; stream?: unknown[] };
}

export async function refreshSimpleComments(root: HTMLElement): Promise<void> {
  const discourseUrl = exactOrigin(root.dataset.discourseOrigin);
  const topicId = positiveInteger(root.dataset.topicId);
  const topicUrl = exactTopicUrl(root.dataset.topicUrl, discourseUrl, topicId);
  const [topic, poweredBy] = await Promise.all([
    publicJson(new URL(`/t/${topicId}.json`, `${discourseUrl}/`), discourseUrl),
    poweredByDiscourse(discourseUrl).catch(() => undefined),
  ]);
  const stream = topic.post_stream?.stream;
  const initial = topic.post_stream?.posts;
  if (!Array.isArray(stream) || !Array.isArray(initial)) throw new Error("Invalid public topic stream.");

  const replyIds = stream.slice(1, MAX_REPLIES + 1).map(positiveInteger);
  const posts = new Map<number, PublicPost>();
  for (const value of initial) {
    if (validPost(value, topicId)) posts.set(value.id, value);
  }
  const missing = replyIds.filter((id) => !posts.has(id));
  for (let offset = 0; offset < missing.length; offset += FETCH_BATCH_SIZE) {
    const endpoint = new URL(`/t/${topicId}/posts.json`, `${discourseUrl}/`);
    for (const id of missing.slice(offset, offset + FETCH_BATCH_SIZE)) endpoint.searchParams.append("post_ids[]", String(id));
    const batch = await publicJson(endpoint, discourseUrl);
    if (!Array.isArray(batch.post_stream?.posts)) throw new Error("Invalid public post batch.");
    for (const value of batch.post_stream.posts) {
      if (!validPost(value, topicId)) throw new Error("Invalid public reply.");
      posts.set(value.id, value);
    }
  }

  const replies = replyIds.map((id) => posts.get(id));
  if (replies.some((post) => !post)) throw new Error("Incomplete public reply set.");
  if (typeof poweredBy === "boolean") root.querySelector<HTMLElement>("[data-discussionbridge-powered-by]")?.toggleAttribute("hidden", !poweredBy);
  render(root, replies as PublicPost[], topicUrl, discourseUrl, stream.length - 1 > MAX_REPLIES);
  root.dataset.discussionbridgeSimpleState = "live";
}

export function startSimpleComments(): void {
  for (const root of Array.from(document.querySelectorAll<HTMLElement>("[data-discussionbridge-simple-live]"))) {
    refreshSimpleComments(root).catch(() => {
      root.dataset.discussionbridgeSimpleState = "snapshot";
      root.querySelector<HTMLElement>("[data-discussionbridge-simple-status]")?.removeAttribute("hidden");
    });
  }
}

async function publicJson(url: URL, expectedOrigin: string): Promise<TopicPayload> {
  const response = await fetch(url, {
    credentials: "omit",
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.url && new URL(response.url).origin !== expectedOrigin) throw new Error("Public response changed forum origin.");
  if (!response.ok) throw new Error(`Public topic request failed (${response.status}).`);
  if (response.headers.get("content-type")?.split(";", 1)[0].toLowerCase() !== "application/json") {
    throw new Error("Public topic response is not JSON.");
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("Public response is too large.");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new Error("Public response is too large.");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Public response JSON is invalid.");
  return value as TopicPayload;
}

function render(root: HTMLElement, replies: PublicPost[], topicUrl: string, discourseUrl: string, truncated: boolean): void {
  const attributions = root.querySelector<HTMLElement>("[data-discussionbridge-attributions]");
  const fragment = document.createDocumentFragment();
  const header = element("div", "discussion-bridge-simple__header");
  header.append(element("h2", "", "Comments"), link(topicUrl, "Open discussion"));
  fragment.append(header);

  if (!replies.length) {
    const empty = element("p", "", "No comments yet. ");
    empty.append(link(topicUrl, "Start the conversation on Discourse."));
    fragment.append(empty);
  } else {
    fragment.append(replyList(replies.slice(0, INITIAL_REPLIES), topicUrl, discourseUrl));
    const remaining = replies.slice(INITIAL_REPLIES);
    if (remaining.length) {
      const details = element("details", "discussion-bridge-simple__more") as HTMLDetailsElement;
      const summary = document.createElement("summary");
      summary.append(
        element("span", "discussion-bridge-simple__more-closed", `Show ${remaining.length} more ${remaining.length === 1 ? "comment" : "comments"}`),
        element("span", "discussion-bridge-simple__more-open", "Show fewer comments"),
      );
      details.append(summary, replyList(remaining, topicUrl, discourseUrl));
      fragment.append(details);
    }
  }
  if (truncated) {
    const limit = element("p", "discussion-bridge-simple__limit", `Showing the first ${MAX_REPLIES} replies. `);
    limit.append(link(topicUrl, "View the complete discussion on The Bridge"), ".");
    fragment.append(limit);
  }
  root.replaceChildren(fragment, ...(attributions ? [attributions] : []));
}

async function poweredByDiscourse(origin: string): Promise<boolean> {
  const now = Date.now();
  const cached = brandingCache.get(origin);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = readPoweredByDiscourse(origin);
  brandingCache.set(origin, { expiresAt: now + BRANDING_CACHE_MS, value });
  try { return await value; } catch (error) { brandingCache.delete(origin); throw error; }
}

async function readPoweredByDiscourse(origin: string): Promise<boolean> {
  const response = await fetch(`${origin}/`, {
    credentials: "omit", headers: { Accept: "text/html" }, redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  if (response.url && new URL(response.url).origin !== origin) throw new Error("Discourse bootstrap changed forum origin.");
  if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0].toLowerCase() !== "text/html") throw new Error("Invalid Discourse bootstrap response.");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new Error("Discourse bootstrap is too large.");
  const document = new DOMParser().parseFromString(text, "text/html");
  const raw = document.querySelector<HTMLScriptElement>("script#data-preloaded")?.textContent;
  if (!raw) throw new Error("Discourse bootstrap settings are unavailable.");
  const outer: unknown = JSON.parse(raw);
  const settingsRaw = typeof outer === "object" && outer && !Array.isArray(outer) ? (outer as { siteSettings?: unknown }).siteSettings : undefined;
  if (typeof settingsRaw !== "string") throw new Error("Discourse bootstrap settings are invalid.");
  const settings: unknown = JSON.parse(settingsRaw);
  const enabled = typeof settings === "object" && settings && !Array.isArray(settings) ? (settings as { enable_powered_by_discourse?: unknown }).enable_powered_by_discourse : undefined;
  if (typeof enabled !== "boolean") throw new Error("Discourse branding setting is invalid.");
  return enabled;
}

function replyList(posts: PublicPost[], topicUrl: string, discourseUrl: string): HTMLOListElement {
  const list = document.createElement("ol");
  for (const post of posts) {
    const item = document.createElement("li");
    const article = document.createElement("article");
    const avatar = element("div", "discussion-bridge-simple__avatar");
    avatar.setAttribute("aria-hidden", "true");
    const template = post.avatar_template?.replace("{size}", "48");
    if (template) {
      const avatarUrl = safeHttpsUrl(template, discourseUrl);
      if (avatarUrl) {
        const image = document.createElement("img");
        image.src = avatarUrl; image.alt = ""; image.loading = "lazy";
        avatar.append(image);
      }
    }
    if (!avatar.childNodes.length) avatar.textContent = post.username.slice(0, 1).toUpperCase();
    const content = document.createElement("div");
    const meta = document.createElement("header");
    meta.append(element("strong", "", post.display_username?.trim() || post.username));
    const dateLink = link(`${topicUrl}/${post.post_number}`, "");
    const time = document.createElement("time");
    time.dateTime = post.created_at;
    time.textContent = new Date(post.created_at).toLocaleDateString();
    dateLink.append(time); meta.append(dateLink);
    const body = element("div", "discussion-bridge-simple__body");
    body.append(sanitizedBody(post.cooked, discourseUrl));
    content.append(meta, body); article.append(avatar, content); item.append(article); list.append(item);
  }
  return list;
}

function sanitizedBody(cooked: string, discourseUrl: string): DocumentFragment {
  const clean = DOMPurify.sanitize(cooked, {
    ALLOWED_TAGS: ["a", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "s", "span", "strong", "ul"],
    ALLOWED_ATTR: ["alt", "class", "height", "href", "src", "title", "width"],
    RETURN_DOM_FRAGMENT: true,
  }) as unknown as DocumentFragment;
  for (const node of Array.from(clean.querySelectorAll<HTMLElement>("[href], [src]"))) {
    for (const attribute of ["href", "src"] as const) {
      const value = node.getAttribute(attribute);
      if (!value) continue;
      const safe = safeHttpsUrl(value, discourseUrl);
      if (safe) node.setAttribute(attribute, safe); else node.removeAttribute(attribute);
    }
    if (node instanceof HTMLAnchorElement) node.rel = "nofollow noopener noreferrer";
  }
  return clean;
}

function validPost(value: unknown, topicId: number): value is PublicPost {
  if (!value || typeof value !== "object") return false;
  const post = value as Partial<PublicPost>;
  return Number.isSafeInteger(post.id) && Number(post.id) > 0
    && Number.isSafeInteger(post.post_number) && Number(post.post_number) > 1
    && post.topic_id === topicId
    && typeof post.username === "string" && post.username.trim().length > 0 && post.username.length <= 100
    && typeof post.created_at === "string" && Number.isFinite(Date.parse(post.created_at))
    && typeof post.cooked === "string";
}

function exactOrigin(value: string | undefined): string {
  if (!value) throw new Error("Missing forum origin.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid forum origin.");
  return url.origin;
}

function exactTopicUrl(value: string | undefined, origin: string, topicId: number): string {
  if (!value) throw new Error("Missing topic URL.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== origin || !new RegExp(`/t/(?:[^/]+/)?${topicId}(?:/|$)`).test(url.pathname)) throw new Error("Invalid topic URL.");
  return url.href.replace(/\/$/, "");
}

function positiveInteger(value: unknown): number {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error("Invalid positive integer.");
  return Number(text);
}

function safeHttpsUrl(value: string, base: string): string | undefined {
  try { const url = new URL(value, `${base}/`); return url.protocol === "https:" ? url.href : undefined; } catch { return undefined; }
}

function element(tag: string, className = "", text = ""): HTMLElement {
  const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node;
}

function link(href: string, text: string): HTMLAnchorElement {
  const node = document.createElement("a"); node.href = href; node.textContent = text; node.rel = "nofollow noopener noreferrer"; return node;
}
