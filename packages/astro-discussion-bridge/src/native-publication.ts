import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, opendir, rename, rm } from "node:fs/promises";
import path from "node:path";
import sanitizeHtml from "sanitize-html";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { PRODUCT_VERSION } from "./version.js";
import { normalizePublicHttpUrl, parsePublicDiscourseTopicUrl } from "./web-url.js";
import { resolveServerSecret } from "./server-secret.js";
import { lock } from "proper-lockfile";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONNECTION = /^dbc_[a-f0-9]{24}$/u;
const EDITION = /^[0-9a-f]{64}$/u;
const PUBLICATION_CONTRACT = "0.3.0-alpha.1";

export interface NativePublicationOptions {
  docsDir: string;
  siteUrl: string;
  routeBase?: string;
  serverUrl: string;
  connectionId: string;
  connectionSecret?: string;
  secretFile?: string;
  fetchImplementation?: typeof fetch;
  /** Existing native/operator selection; used only when creating a new page. */
  commentsDisplay?: "simple" | "full" | "interactive";
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
  const parsed = new URL(normalizePublicHttpUrl(text(value, 2048, label), label));
  if (parsed.origin !== origin || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error(`Invalid ${label}`);
  return parsed;
}

function htmlText(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function isoDate(value: unknown, label: string): string {
  const input = text(value, 64, label);
  const parsed = new Date(input);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(input) || !Number.isFinite(parsed.getTime())) throw new Error(`Invalid ${label}`);
  if (new Date(`${input.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== input.slice(0, 10)) throw new Error(`Invalid ${label}`);
  return input;
}

function publication(record: Record<string, unknown>, siteOrigin: string, serverOrigin: string, routeBase: string) {
  const bindings = Array.isArray(record.bindings) ? record.bindings.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && item.role === "presentation" && item.state === "active") : [];
  if (!bindings.some((item) => item.native_materialization === true)) return null;
  if (bindings.length !== 1 || bindings[0].native_materialization !== true) throw new Error("Ambiguous Astro publication authority");
  if (record.direction !== "from_discourse" || !UUID.test(String(record.resource_id ?? "")) || !Number.isSafeInteger(record.topic_id) || Number(record.topic_id) < 1) throw new Error("Invalid Astro publication record");
  const destination = exactUrl(bindings[0].canonical_url, siteOrigin, "Astro publication destination");
  const prefix = `/${routeBase}/`;
  const slug = destination.pathname.startsWith(prefix) && destination.pathname.endsWith("/") ? destination.pathname.slice(prefix.length, -1) : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) throw new Error("Invalid Astro publication path");
  const source = record.source as Record<string, unknown> | undefined;
  if (source?.edition !== undefined && (typeof source.edition !== "string" || !EDITION.test(source.edition))) throw new Error("Invalid Astro source edition");
  if (source?.status === "withdrawn") {
    if (!source.edition || source.reason !== "source_unavailable" || record.content_html !== null) throw new Error("Invalid Astro source withdrawal");
    return { withdrawn: true as const, resourceId: String(record.resource_id).toLowerCase(), slug, topicId: Number(record.topic_id), edition: String(source.edition) };
  }
  if (record.state !== "healthy" || (source?.status !== undefined && source.status !== "active")) throw new Error("Invalid Astro publication record");
  if (!source || source.platform !== "discourse" || source.origin !== serverOrigin || source.topic_id !== record.topic_id || source.post_number !== 1 || !Number.isSafeInteger(source.post_id) || Number(source.post_id) < 1 || !Number.isSafeInteger(source.post_version) || Number(source.post_version) < 1 || source.revision !== `post:${source.post_id}:version:${source.post_version}`) throw new Error("Invalid Astro publication source");
  const topicUrl = exactUrl(source.topic_url, serverOrigin, "Astro source topic URL").href;
  const topic = parsePublicDiscourseTopicUrl(topicUrl, serverOrigin);
  if (topic.topicId !== record.topic_id || (topic.postNumber !== undefined && topic.postNumber !== 1)) throw new Error("Invalid Astro source topic identity");
  const author = source.author as Record<string, unknown> | undefined;
  const authorName = text(author?.name, 200, "Astro source author");
  exactUrl(author?.profile_url, serverOrigin, "Astro source author URL");
  const descriptor = source.content;
  if (descriptor !== undefined) validateDescriptor(descriptor, String(record.resource_id));
  const content = record.content_html === null && descriptor !== undefined ? "" : sanitizeContent(text(record.content_html, descriptor === undefined ? 65_536 : Number.MAX_SAFE_INTEGER, "Astro publication content"));
  const mode = bindings[0].presentation_mode;
  if (mode !== undefined && mode !== null && !["simple", "full", "interactive"].includes(String(mode))) throw new Error("Invalid Astro selected presentation");
  const forumName = source.forum_name === undefined ? serverOrigin : text(source.forum_name, 200, "Astro source forum name");
  if (/[\x00-\x1f\x7f]/u.test(forumName)) throw new Error("Invalid Astro source forum name");
  return { withdrawn: false as const, resourceId: String(record.resource_id).toLowerCase(), slug, title: text(record.title, 1024, "Astro publication title"), content, revision: String(source.revision), edition: source.edition as string | undefined, createdAt: source.created_at === undefined ? undefined : isoDate(source.created_at, "Astro source creation time"), updatedAt: isoDate(source.updated_at, "Astro source update time"), authorName, forumName, mode: mode as "simple" | "full" | "interactive" | undefined | null, topicId: Number(record.topic_id), topicUrl };
}

function sanitizeContent(content: string): string {
  const sanitized = sanitizeHtml(content, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "h3", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td"]),
    allowedAttributes: { a: ["href", "title", "rel"], img: ["src", "alt", "title", "width", "height"], code: ["class"], pre: ["class"], div: ["class"], span: ["class"] },
    allowedSchemes: ["https"],
    allowProtocolRelative: false,
  });
  if (!sanitized.trim()) throw new Error("Astro publication content sanitized to empty");
  return sanitized;
}

class SourceChanged extends Error {}

function validateDescriptor(value: unknown, resourceId: string): { bytes: number; sha256: string; path: string; chunk_bytes: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Astro source content descriptor");
  const descriptor = value as Record<string, unknown>;
  if (!Number.isSafeInteger(descriptor.bytes) || Number(descriptor.bytes) < 1 || typeof descriptor.sha256 !== "string" || !EDITION.test(descriptor.sha256) || descriptor.path !== `/discussion-bridge/v1/bridge-records/${resourceId.toLowerCase()}/content.json` || descriptor.chunk_bytes !== 32_768) throw new Error("Invalid Astro source content descriptor");
  return descriptor as { bytes: number; sha256: string; path: string; chunk_bytes: number };
}

async function hydrate(record: Record<string, unknown>, serverOrigin: string, connectionId: string, secret: string, fetchImplementation: typeof fetch): Promise<string> {
  const source = record.source as Record<string, unknown>;
  if (typeof source.edition !== "string" || !EDITION.test(source.edition)) throw new Error("Invalid Astro source content edition");
  const resourceId = String(record.resource_id).toLowerCase();
  const descriptor = validateDescriptor(source.content, resourceId);
  const chunks: Uint8Array[] = [];
  const digest = createHash("sha256");
  let offset = 0;
  while (offset < descriptor.bytes) {
    const url = new URL(descriptor.path, serverOrigin);
    url.searchParams.set("edition", source.edition);
    url.searchParams.set("offset", String(offset));
    const chunk = await requestJson(url.href, connectionId, secret, fetchImplementation, 65_536);
    if (chunk.resource_id !== resourceId || chunk.edition !== source.edition || chunk.offset !== offset || chunk.total_bytes !== descriptor.bytes || chunk.content_sha256 !== descriptor.sha256 || typeof chunk.chunk_base64 !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(chunk.chunk_base64)) throw new Error("Invalid Astro source content chunk");
    const bytes = Buffer.from(chunk.chunk_base64, "base64");
    if (bytes.toString("base64") !== chunk.chunk_base64 || bytes.byteLength !== Math.min(descriptor.chunk_bytes, descriptor.bytes - offset)) throw new Error("Invalid Astro source content chunk length");
    offset += bytes.byteLength;
    if (chunk.next_offset !== (offset === descriptor.bytes ? null : offset)) throw new Error("Invalid Astro source content continuation");
    digest.update(bytes);
    chunks.push(bytes);
  }
  if (digest.digest("hex") !== descriptor.sha256) throw new Error("Invalid Astro source content digest");
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, descriptor.bytes));
}

async function requestJson(url: string, connectionId: string, secret: string, fetchImplementation: typeof fetch, maximum = 262_144) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("DiscussionBridge publication request timed out")), 15_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = () => { void reader?.cancel(controller.signal.reason).catch(() => undefined); };
  controller.signal.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetchImplementation(url, { method: "GET", redirect: "error", signal: controller.signal, headers: { Accept: "application/json", "X-DiscussionBridge-Connection": connectionId, "X-DiscussionBridge-Secret": secret } });
    if (response.url && new URL(response.url).origin !== new URL(url).origin) { await response.body?.cancel(); throw new Error("Unexpected DiscussionBridge response origin"); }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    const declared = response.headers.get("content-length");
    if (!contentType || !(contentType === "application/json" || contentType.endsWith("+json"))) { await response.body?.cancel(); throw new Error("DiscussionBridge response is not JSON"); }
    if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maximum)) { await response.body?.cancel(); throw new Error("DiscussionBridge response is too large"); }
    reader = response.body?.getReader();
    if (!reader) throw new Error("DiscussionBridge response is empty");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      controller.signal.throwIfAborted();
      const { done, value } = await reader.read();
      controller.signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new Error("DiscussionBridge response is too large"); }
      chunks.push(value);
    }
    const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, length)));
    if (response.status === 409) throw new SourceChanged("DiscussionBridge source edition changed");
    if (!response.ok || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("DiscussionBridge publication request failed");
    return data as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener("abort", abort);
    reader?.releaseLock();
  }
}

interface ExistingPublication {
  contents: string;
  dev: bigint;
  ino: bigint;
}

async function assertPublicationDirectory(directory: string) {
  let current = path.resolve(directory);
  for (;;) {
    try {
      const entry = await lstat(current);
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("Astro publication directory must be an unlinked directory");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

async function readExistingPublication(file: string): Promise<ExistingPublication | null> {
  let entry;
  try { entry = await lstat(file, { bigint: true }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("Astro publication target must be an unlinked regular file");
  const handle = await open(file, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    if (opened.dev !== entry.dev || opened.ino !== entry.ino) throw new Error("Astro publication target changed while opening");
    return { contents: await handle.readFile("utf8"), dev: entry.dev, ino: entry.ino };
  } finally { await handle.close(); }
}

function publicationMetadata(contents: string): Record<string, unknown> | null {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(contents);
  if (!header) return null;
  const metadata: unknown = parseYaml(header[1]);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return metadata as Record<string, unknown>;
}

function ownsPublication(contents: string, resourceId: string, topicId: number): boolean {
  const fields = publicationMetadata(contents);
  if (!fields) return false;
  return fields.discussionFromDiscourse === true
    && fields.discussionbridgeNativePublication === true
    && fields.discussionbridgeResourceId === resourceId
    && fields.discourseTopicId === topicId;
}

function publicationBody(contents: string): string {
  return contents.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, "");
}

const bodyDigest = (contents: string) => createHash("sha256").update(publicationBody(contents), "utf8").digest("hex");

async function publicationCensus(directory: string): Promise<Map<string, Array<{ file: string; topicId: number }>>> {
  await assertPublicationDirectory(directory);
  const census = new Map<string, Array<{ file: string; topicId: number }>>();
  let entries;
  try { entries = await opendir(directory); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return census;
    throw error;
  }
  let batch: string[] = [];
  const inspect = async () => {
    for (const result of await Promise.all(batch.map(async (file) => ({ file, prior: await readExistingPublication(file) })))) {
      if (!result.prior) throw new Error("Astro publication census changed during synchronization");
      const fields = publicationMetadata(result.prior.contents);
      if (fields?.discussionbridgeNativePublication !== true) continue;
      const resourceId = String(fields.discussionbridgeResourceId ?? "").toLowerCase();
      const topicId = Number(fields.discourseTopicId);
      if (!UUID.test(resourceId) || !Number.isSafeInteger(topicId) || topicId < 1 || !ownsPublication(result.prior.contents, resourceId, topicId)) throw new Error("Invalid Astro publication census identity");
      const matches = census.get(resourceId) ?? [];
      matches.push({ file: path.resolve(result.file), topicId });
      census.set(resourceId, matches);
    }
    batch = [];
  };
  for await (const entry of entries) {
    if (!/\.(?:md|markdown)$/iu.test(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error("Astro publication census must not follow links");
    if (!entry.isFile()) continue;
    batch.push(path.join(directory, entry.name));
    if (batch.length === 32) await inspect();
  }
  if (batch.length) await inspect();
  return census;
}

async function syncDirectory(directory: string) {
  // Windows does not expose directory fsync through Node's file API. On POSIX
  // the directory entry must be durable as well as the temporary file's data.
  if (process.platform === "win32") return;
  const handle = await open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function mkdirDurably(directory: string) {
  const firstCreated = await mkdir(directory, { recursive: true });
  if (!firstCreated || process.platform === "win32") return;
  let current = path.resolve(directory);
  for (;;) {
    await syncDirectory(current);
    if (current === path.resolve(firstCreated)) break;
    current = path.dirname(current);
  }
  await syncDirectory(path.dirname(firstCreated));
}

async function atomicWrite(file: string, contents: string, prior: ExistingPublication | null) {
  await assertPublicationDirectory(path.dirname(file));
  await mkdirDurably(path.dirname(file));
  await assertPublicationDirectory(path.dirname(file));
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let temporaryCreated = false;
  try {
    const handle = await open(temporary, "wx");
    temporaryCreated = true;
    try { await handle.writeFile(contents, "utf8"); await handle.sync(); } finally { await handle.close(); }
    await assertPublicationDirectory(path.dirname(file));
    if (prior === null) {
      // Atomic first claim: an existing or concurrently created path is preserved.
      await link(temporary, file);
    } else {
      const current = await readExistingPublication(file);
      if (!current || current.dev !== prior.dev || current.ino !== prior.ino || current.contents !== prior.contents) {
        throw new Error("Astro publication target changed before replacement");
      }
      // Detect ordinary replacement/edit; this is not an atomic hostile-race defense.
      await rename(temporary, file);
    }
    await syncDirectory(path.dirname(file));
  } finally {
    if (temporaryCreated) await rm(temporary, { force: true });
  }
}

export async function materializeNativePublications(options: NativePublicationOptions) {
  await assertPublicationDirectory(options.docsDir);
  await mkdirDurably(options.docsDir);
  await assertPublicationDirectory(options.docsDir);
  const release = await lock(path.resolve(options.docsDir), { realpath: false, retries: 0 });
  try { return await materializeNativePublicationsUnlocked(options); }
  finally { await release(); }
}

async function materializeNativePublicationsUnlocked(options: NativePublicationOptions) {
  const credentials = await resolveServerSecret(options);
  const siteOrigin = exactOrigin(options.siteUrl, "Astro site URL");
  const serverOrigin = exactOrigin(options.serverUrl, "DiscussionBridge server URL");
  const secretBytes = new TextEncoder().encode(credentials.connectionSecret).byteLength;
  if (!CONNECTION.test(options.connectionId) || secretBytes < 32 || secretBytes > 256 || /[\x00-\x1f\x7f]/u.test(credentials.connectionSecret)) throw new Error("Invalid DiscussionBridge credentials");
  const routeBase = options.routeBase ?? "comments";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(routeBase)) throw new Error("Invalid Astro publication route base");
  if (options.commentsDisplay !== undefined && !["simple", "full", "interactive"].includes(options.commentsDisplay)) throw new Error("Invalid Astro native presentation choice");
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const summary = { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
  const nativeFiles = await publicationCensus(path.join(options.docsDir, routeBase));
  let page = 1;
  let snapshot: string | undefined;
  let expectedPages: number | undefined;
  let expectedTotal: number | undefined;
  const seenResources = new Set<string>();
  for (;;) {
    const feedUrl = new URL("/discussion-bridge/v1/bridge-records.json", serverOrigin);
    feedUrl.searchParams.set("page", String(page));
    feedUrl.searchParams.set("publication_contract", PUBLICATION_CONTRACT);
    if (snapshot) feedUrl.searchParams.set("snapshot", snapshot);
    const response = await requestJson(feedUrl.href, options.connectionId, credentials.connectionSecret, fetchImplementation, 2_097_152);
    if (!Array.isArray(response.bridge_records) || !response.pagination || typeof response.pagination !== "object") throw new Error("Invalid DiscussionBridge publication feed");
    const pagination = response.pagination as Record<string, unknown>;
    if (pagination.page !== page || !Number.isSafeInteger(pagination.pages) || Number(pagination.pages) < 1 || Number(pagination.pages) > 10_000 || !Number.isSafeInteger(pagination.total) || Number(pagination.total) < 0 || typeof pagination.snapshot !== "string" || pagination.snapshot.length < 1 || pagination.snapshot.length > 8_192) throw new Error("Invalid DiscussionBridge publication pagination");
    if (page === 1) {
      snapshot = pagination.snapshot;
      expectedPages = Number(pagination.pages);
      expectedTotal = Number(pagination.total);
    } else if (pagination.snapshot !== snapshot || Number(pagination.pages) !== expectedPages || Number(pagination.total) !== expectedTotal) {
      throw new Error("DiscussionBridge publication feed changed during synchronization");
    }
    for (const raw of response.bridge_records) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid Astro publication record");
      const feedResourceId = String((raw as Record<string, unknown>).resource_id ?? "").toLowerCase();
      if (!UUID.test(feedResourceId) || seenResources.has(feedResourceId)) throw new Error("DiscussionBridge publication feed contains a duplicate or invalid resource identity");
      seenResources.add(feedResourceId);
      try {
        let current = raw as Record<string, unknown>;
        for (let attempt = 0; attempt < 3; attempt++) {
          const item = publication(current, siteOrigin, serverOrigin, routeBase);
          if (!item) { summary.skipped++; break; }
          const file = path.join(options.docsDir, routeBase, `${item.slug}.md`);
          const matches = nativeFiles.get(item.resourceId) ?? [];
          const equalPath = (value: string) => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
          if (matches.length > 1 || (matches[0] && (equalPath(matches[0].file) !== equalPath(file) || matches[0].topicId !== item.topicId))) throw new Error("Astro native resource/topic or canonical binding location changed; reconciliation is required");
          await assertPublicationDirectory(path.dirname(file));
          const prior = await readExistingPublication(file);
          if (prior !== null && !ownsPublication(prior.contents, item.resourceId, item.topicId)) throw new Error("Astro publication identity collision");
          const priorFields = prior ? publicationMetadata(prior.contents)! : {};
          if (item.withdrawn) {
            if (prior === null) { summary.skipped++; break; }
            if (priorFields.discussionbridgeSourceStatus === "withdrawn" && priorFields.discussionbridgeSourceEdition === item.edition && priorFields.draft === true) { summary.unchanged++; break; }
            const fields = { ...priorFields, draft: true, discussionbridgeSourceStatus: "withdrawn", discussionbridgeSourceEdition: item.edition, discussionbridgeSynchronizedAt: new Date().toISOString(), ...(priorFields.discussionbridgeSourceStatus === "withdrawn" ? {} : { discussionbridgePriorDraft: { present: Object.hasOwn(priorFields, "draft"), value: priorFields.draft ?? null } }) };
            const body = prior.contents.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, "");
            await atomicWrite(file, `---\n${stringifyYaml(fields).trim()}\n---\n${body}`, prior);
            summary.updated++;
            break;
          }
          if (prior !== null && (typeof priorFields.discussionbridgeNativeBodySha256 !== "string" || priorFields.discussionbridgeNativeBodySha256 !== bodyDigest(prior.contents))) throw new Error("Astro source-managed content has changed or lacks ownership evidence; publication needs attention");
          if (prior !== null) {
            const managed = priorFields.discussionbridgeNativeManagedFields;
            if (!managed || typeof managed !== "object" || Array.isArray(managed) || !Object.hasOwn(managed, "title") || !Object.hasOwn(managed, "description")) throw new Error("Astro source-managed fields lack ownership evidence; publication needs attention");
            for (const [key, value] of Object.entries(managed)) {
              if (!["title", "description", "date"].includes(key) || priorFields[key] !== value) throw new Error("Astro source-managed fields were edited locally; publication needs attention");
            }
          }
          if (item.edition && priorFields.discussionbridgeSourceEdition === item.edition && priorFields.discussionbridgeSourceStatus !== "withdrawn") { summary.unchanged++; break; }
          if ((current.source as Record<string, unknown>).content !== undefined) {
            try { item.content = sanitizeContent(await hydrate(current, serverOrigin, options.connectionId, credentials.connectionSecret, fetchImplementation)); }
            catch (error) {
              if (!(error instanceof SourceChanged) || attempt === 2) throw error;
              const detailUrl = new URL(`/discussion-bridge/v1/bridge-records/${feedResourceId}.json`, serverOrigin);
              detailUrl.searchParams.set("publication_contract", PUBLICATION_CONTRACT);
              const detail = await requestJson(detailUrl.href, options.connectionId, credentials.connectionSecret, fetchImplementation, 2_097_152);
              if (!detail.bridge_record || typeof detail.bridge_record !== "object" || Array.isArray(detail.bridge_record) || (detail.bridge_record as Record<string, unknown>).resource_id !== feedResourceId) throw new Error("Invalid refreshed Astro source identity");
              current = detail.bridge_record as Record<string, unknown>;
              continue;
            }
          }
          const chosenMode = Object.hasOwn(priorFields, "discussionCommentsDisplay") ? priorFields.discussionCommentsDisplay : item.mode ?? options.commentsDisplay ?? "interactive";
          if (!["simple", "full", "interactive"].includes(String(chosenMode))) throw new Error("Invalid existing Astro presentation choice");
          if (item.createdAt && new Date(item.updatedAt) < new Date(item.createdAt)) throw new Error("Invalid Astro source chronology");
          const frontmatter: Record<string, unknown> = { ...priorFields, title: item.title, description: `Published from ${item.forumName} by ${item.authorName}.`, discussionCommentsDisplay: chosenMode, discussionSync: false, discussionFromDiscourse: true, discussionbridgeNativePublication: true, discussionbridgeResourceId: item.resourceId, discourseTopicId: item.topicId, discourseTopicUrl: item.topicUrl, discussionbridgeSourceRevision: item.revision, discussionbridgeSourceStatus: "active", discussionbridgeSourceUpdatedAt: item.updatedAt, discussionbridgeForumName: item.forumName, ...(item.createdAt ? { date: item.createdAt, discussionbridgeSourceCreatedAt: item.createdAt } : {}), ...(item.edition ? { discussionbridgeSourceEdition: item.edition } : {}) };
          frontmatter.discussionbridgeNativeManagedFields = { title: frontmatter.title, description: frontmatter.description, ...(item.createdAt ? { date: frontmatter.date } : {}) };
          if (priorFields.discussionbridgeSourceStatus === "withdrawn") {
            const draftState = priorFields.discussionbridgePriorDraft as { present?: boolean; value?: unknown } | undefined;
            if (draftState?.present) frontmatter.draft = draftState.value;
            else delete frontmatter.draft;
            delete frontmatter.discussionbridgePriorDraft;
          }
          const body = `\n${item.content}\n\n<hr>\n<aside class="discussionbridge-publication"><p><strong>Published from <a href="${htmlText(item.topicUrl)}">${htmlText(item.forumName)}</a></strong></p><p>Source author: ${htmlText(item.authorName)} · Updated <time datetime="${htmlText(item.updatedAt)}">${htmlText(item.updatedAt)}</time> · Revision ${htmlText(item.revision)} · Astro 7 · DiscussionBridge for Astro ${PRODUCT_VERSION}</p></aside>\n`;
          frontmatter.discussionbridgeNativeBodySha256 = createHash("sha256").update(body, "utf8").digest("hex");
          const yaml = stringifyYaml(frontmatter).trim().replace(/^date: ([^\r\n]+)$/mu, 'date: "$1"');
          const output = `---\n${yaml}\n---\n${body}`;
          if (prior?.contents === output) { summary.unchanged++; break; }
          frontmatter.discussionbridgeSynchronizedAt = new Date().toISOString();
          const committed = output.replace(`---\n${yaml}\n---`, `---\n${stringifyYaml(frontmatter).trim().replace(/^date: ([^\r\n]+)$/mu, 'date: "$1"')}\n---`);
          await atomicWrite(file, committed, prior);
          if (prior === null) nativeFiles.set(item.resourceId, [{ file: path.resolve(file), topicId: item.topicId }]);
          summary[prior === null ? "created" : "updated"]++;
          break;
        }
      } catch { summary.failed++; }
    }
    if (page >= Number(pagination.pages)) break;
    page++;
  }
  if (seenResources.size !== expectedTotal) throw new Error("DiscussionBridge publication feed did not produce its complete unique census");
  return summary;
}
