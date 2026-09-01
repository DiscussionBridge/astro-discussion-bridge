import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import sanitizeHtml from "sanitize-html";
import { stringify as stringifyYaml } from "yaml";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONNECTION = /^dbc_[a-f0-9]{24}$/u;

export interface NativePublicationOptions {
  docsDir: string;
  siteUrl: string;
  routeBase?: string;
  serverUrl: string;
  connectionId: string;
  connectionSecret: string;
  fetchImplementation?: typeof fetch;
}

function exactOrigin(value: string, label: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") throw new Error(`Invalid ${label}`);
  return parsed.origin;
}

function text(value: unknown, maximum: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value) > maximum) throw new Error(`Invalid ${label}`);
  return value.trim();
}

function exactUrl(value: unknown, origin: string, label: string): URL {
  const parsed = new URL(text(value, 2048, label));
  if (parsed.origin !== origin || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error(`Invalid ${label}`);
  return parsed;
}

function isoDate(value: unknown, label: string): string {
  const input = text(value, 64, label);
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== input) throw new Error(`Invalid ${label}`);
  return input;
}

function publication(record: Record<string, unknown>, siteOrigin: string, serverOrigin: string, routeBase: string) {
  const bindings = Array.isArray(record.bindings) ? record.bindings.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && item.role === "presentation" && item.state === "active") : [];
  if (!bindings.some((item) => item.native_materialization === true)) return null;
  if (bindings.length !== 1 || bindings[0].native_materialization !== true) throw new Error("Ambiguous Astro publication authority");
  if (record.direction !== "from_discourse" || record.state !== "healthy" || !UUID.test(String(record.resource_id ?? "")) || !Number.isSafeInteger(record.topic_id) || Number(record.topic_id) < 1) throw new Error("Invalid Astro publication record");
  const destination = exactUrl(bindings[0].canonical_url, siteOrigin, "Astro publication destination");
  const prefix = `/${routeBase}/`;
  const slug = destination.pathname.startsWith(prefix) && destination.pathname.endsWith("/") ? destination.pathname.slice(prefix.length, -1) : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) throw new Error("Invalid Astro publication path");
  const source = record.source as Record<string, unknown> | undefined;
  if (!source || source.platform !== "discourse" || source.origin !== serverOrigin || source.topic_id !== record.topic_id || source.post_number !== 1 || !Number.isSafeInteger(source.post_id) || Number(source.post_id) < 1 || !Number.isSafeInteger(source.post_version) || Number(source.post_version) < 1 || source.revision !== `post:${source.post_id}:version:${source.post_version}`) throw new Error("Invalid Astro publication source");
  const topicUrl = exactUrl(source.topic_url, serverOrigin, "Astro source topic URL").href;
  const author = source.author as Record<string, unknown> | undefined;
  const authorName = text(author?.name, 200, "Astro source author");
  exactUrl(author?.profile_url, serverOrigin, "Astro source author URL");
  const content = sanitizeHtml(text(record.content_html, 65_536, "Astro publication content"), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "h3", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td"]),
    allowedAttributes: { a: ["href", "title", "rel"], img: ["src", "alt", "title", "width", "height"], code: ["class"], pre: ["class"], div: ["class"], span: ["class"] },
    allowedSchemes: ["https"],
    allowProtocolRelative: false,
  });
  if (!content.trim()) throw new Error("Astro publication content sanitized to empty");
  return { resourceId: String(record.resource_id).toLowerCase(), slug, title: text(record.title, 1024, "Astro publication title"), content, revision: String(source.revision), updatedAt: isoDate(source.updated_at, "Astro source update time"), authorName, topicId: Number(record.topic_id), topicUrl };
}

async function requestJson(url: string, connectionId: string, secret: string, fetchImplementation: typeof fetch) {
  const response = await fetchImplementation(url, { method: "GET", redirect: "error", headers: { Accept: "application/json", "X-DiscussionBridge-Connection": connectionId, "X-DiscussionBridge-Secret": secret } });
  if (response.url && new URL(response.url).origin !== new URL(url).origin) throw new Error("Unexpected DiscussionBridge response origin");
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("DiscussionBridge response is not JSON");
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 262_144) throw new Error("DiscussionBridge response is too large");
  const data: unknown = JSON.parse(raw);
  if (!response.ok || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("DiscussionBridge publication request failed");
  return data as Record<string, unknown>;
}

async function atomicWrite(file: string, contents: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    const handle = await open(temporary, "wx");
    try { await handle.writeFile(contents, "utf8"); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function materializeNativePublications(options: NativePublicationOptions) {
  const siteOrigin = exactOrigin(options.siteUrl, "Astro site URL");
  const serverOrigin = exactOrigin(options.serverUrl, "DiscussionBridge server URL");
  if (!CONNECTION.test(options.connectionId) || options.connectionSecret.length < 24 || options.connectionSecret.length > 512 || /[\r\n\0]/u.test(options.connectionSecret)) throw new Error("Invalid DiscussionBridge credentials");
  const routeBase = options.routeBase ?? "comments";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(routeBase)) throw new Error("Invalid Astro publication route base");
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const summary = { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
  let page = 1;
  for (;;) {
    const response = await requestJson(`${serverOrigin}/discussion-bridge/v1/bridge-records.json?page=${page}`, options.connectionId, options.connectionSecret, fetchImplementation);
    if (!Array.isArray(response.bridge_records) || !response.pagination || typeof response.pagination !== "object") throw new Error("Invalid DiscussionBridge publication feed");
    const pagination = response.pagination as Record<string, unknown>;
    if (pagination.page !== page || !Number.isSafeInteger(pagination.pages) || Number(pagination.pages) < 1 || Number(pagination.pages) > 10_000) throw new Error("Invalid DiscussionBridge publication pagination");
    for (const raw of response.bridge_records) {
      try {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid Astro publication record");
        const item = publication(raw as Record<string, unknown>, siteOrigin, serverOrigin, routeBase);
        if (!item) { summary.skipped++; continue; }
        const file = path.join(options.docsDir, routeBase, `${item.slug}.md`);
        const frontmatter = { title: item.title, description: `Published from The Bridge by ${item.authorName}.`, date: item.updatedAt, discussionCommentsDisplay: "fullInteractive", discussionSync: false, discussionbridgeNativePublication: true, discussionbridgeResourceId: item.resourceId, discourseTopicId: item.topicId, discourseTopicUrl: item.topicUrl, discussionbridgeSourceRevision: item.revision };
        const output = `---\n${stringifyYaml(frontmatter).trim()}\n---\n\n${item.content}\n\n<hr>\n\n**Published from [The Bridge](${item.topicUrl})**  \nSource author: ${item.authorName} · Revision ${item.revision} · Astro 7 · DiscussionBridge for Astro 0.1.0-alpha.20260901.1\n`;
        let prior: string | null = null;
        try { prior = await readFile(file, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        if (prior === output) { summary.unchanged++; continue; }
        if (prior && !prior.includes(`discussionbridgeResourceId: ${item.resourceId}`)) throw new Error("Astro publication identity collision");
        await atomicWrite(file, output);
        summary[prior ? "updated" : "created"]++;
      } catch { summary.failed++; }
    }
    if (page >= Number(pagination.pages)) break;
    page++;
  }
  return summary;
}
