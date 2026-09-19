import { lstat, mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import sanitizeHtml from "sanitize-html";
import { stringify as stringifyYaml } from "yaml";
import { PRODUCT_VERSION } from "./version.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONNECTION = /^dbc_[a-f0-9]{24}$/u;
class PublicationMigrationRequired extends Error {}

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
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(input) || !Number.isFinite(parsed.getTime())) throw new Error(`Invalid ${label}`);
  return input;
}

function publication(record: Record<string, unknown>, siteOrigin: string, serverOrigin: string) {
  const bindings = Array.isArray(record.bindings) ? record.bindings.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && item.role === "presentation" && item.state === "active") : [];
  if (!bindings.some((item) => item.native_materialization === true)) return null;
  if (bindings.length !== 1 || bindings[0].native_materialization !== true) throw new Error("Ambiguous Astro publication authority");
  if (record.direction !== "from_discourse" || record.state !== "healthy" || !UUID.test(String(record.resource_id ?? "")) || !Number.isSafeInteger(record.topic_id) || Number(record.topic_id) < 1) throw new Error("Invalid Astro publication record");
  const destination = exactUrl(bindings[0].canonical_url, siteOrigin, "Astro publication destination");
  const route = destination.pathname.endsWith("/") ? destination.pathname.slice(1, -1) : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/u.test(route)) throw new Error("Invalid Astro publication path");
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
  return { resourceId: String(record.resource_id).toLowerCase(), route, title: text(record.title, 1024, "Astro publication title"), content, revision: String(source.revision), updatedAt: isoDate(source.updated_at, "Astro source update time"), authorName, topicId: Number(record.topic_id), topicUrl };
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

async function indexNativePublications(docsDir: string): Promise<Map<string, string>> {
  const root = path.resolve(docsDir);
  const files = new Map<string, string>();
  const pending = [root];
  let inspected = 0;
  while (pending.length) {
    const directory = pending.pop()!;
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT" && directory === root) return files; throw error; }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Astro publication content contains a symlink; identity cannot be checked safely");
      if (entry.isDirectory()) { pending.push(file); continue; }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      if (++inspected > 100_000) throw new Error("Astro publication content exceeds the bounded identity census");
      const handle = await open(file, "r");
      const header = Buffer.alloc(2048);
      let bytesRead;
      try { ({ bytesRead } = await handle.read(header, 0, header.length, 0)); }
      finally { await handle.close(); }
      const text = header.toString("utf8", 0, bytesRead);
      const opening = text.match(/^---\r?\n/u);
      if (!opening) continue;
      const remainder = text.slice(opening[0].length);
      const closing = remainder.search(/\r?\n---\r?\n/u);
      if (closing < 0) continue;
      const frontmatter = remainder.slice(0, closing);
      if (!/^discussionbridgeNativePublication: true\r?$/mu.test(frontmatter)) continue;
      const match = frontmatter.match(/^discussionbridgeResourceId: ([0-9a-f-]{36})\r?$/imu);
      if (!match || !UUID.test(match[1])) throw new Error("Astro native publication identity is missing or invalid");
      const id = match[1].toLowerCase();
      if (files.has(id)) throw new Error("Astro native publication resource identity is duplicated across files");
      files.set(id, path.resolve(file));
    }
  }
  return files;
}

export interface NativePublicationMigrationOptions {
  docsDir: string;
  siteUrl: string;
  resourceId: string;
  oldUrl: string;
  newUrl: string;
  redirectsFile: string;
}

async function exists(file: string): Promise<boolean> {
  try { await lstat(file); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

export async function migrateNativePublication(options: NativePublicationMigrationOptions) {
  const siteOrigin = exactOrigin(options.siteUrl, "Astro site URL");
  if (!UUID.test(options.resourceId)) throw new Error("Invalid Astro publication resource ID");
  if (path.basename(options.redirectsFile) !== "_redirects") throw new Error("Astro migration requires a Cloudflare _redirects file");
  const oldUrl = exactUrl(options.oldUrl, siteOrigin, "Astro old publication URL");
  const newUrl = exactUrl(options.newUrl, siteOrigin, "Astro new publication URL");
  const routePattern = /^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*\/$/u;
  if (!routePattern.test(oldUrl.pathname) || !routePattern.test(newUrl.pathname) || oldUrl.href === newUrl.href) throw new Error("Invalid Astro publication URL migration paths");
  const root = path.resolve(options.docsDir);
  const files = await indexNativePublications(root);
  const sourceFile = files.get(options.resourceId.toLowerCase());
  if (!sourceFile) throw new Error("Astro publication resource does not have exactly one native source file");
  const sourceRoute = path.relative(root, sourceFile).split(path.sep).join("/").replace(/\.md$/u, "");
  if (`${siteOrigin}/${sourceRoute}/` !== oldUrl.href) throw new Error("Astro publication old URL does not match its native source file");
  const destinationRoute = newUrl.pathname.slice(1, -1);
  const destinationFile = path.resolve(root, `${destinationRoute}.md`);
  const routeAlternates = [destinationFile, path.resolve(root, `${destinationRoute}.mdx`), path.resolve(root, destinationRoute, "index.md"), path.resolve(root, destinationRoute, "index.mdx")];
  if ((await Promise.all(routeAlternates.map(exists))).some(Boolean)) throw new Error("Astro publication destination already has content");
  const redirectsFile = path.resolve(options.redirectsFile);
  let redirects = "";
  try {
    const status = await lstat(redirectsFile);
    if (!status.isFile() || status.isSymbolicLink() || status.size > 100_000) throw new Error("Astro redirect manifest is not a bounded regular file");
    redirects = await readFile(redirectsFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const lines = redirects.split(/\r?\n/u);
  const activeRules = lines.map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  const destinationRules = activeRules.filter((line) => line.split(/\s+/u)[0] === newUrl.pathname);
  const inverseRule = destinationRules.length === 1 &&
    [`${newUrl.pathname} ${oldUrl.pathname} 301`, `${newUrl.pathname} ${oldUrl.pathname} 308`].includes(destinationRules[0])
    ? destinationRules[0] : null;
  if (destinationRules.length && !inverseRule) throw new Error("Astro publication destination has a conflicting redirect");
  if (activeRules.length - (inverseRule ? 1 : 0) >= 2_000 || activeRules.some((line) => line.split(/\s+/u)[0] === oldUrl.pathname)) throw new Error("Astro publication redirect source conflicts with an existing rule or exceeds Cloudflare limits");
  const rule = `${oldUrl.pathname} ${newUrl.pathname} 301`;
  if (rule.length > 1_000) throw new Error("Astro publication redirect exceeds Cloudflare limits");
  const remaining = inverseRule ? lines.filter((line) => line.trim() !== inverseRule).join("\n") : redirects;
  const nextRedirects = `${remaining.trimEnd()}${remaining.trim() ? "\n" : ""}${rule}\n`;
  await mkdir(path.dirname(destinationFile), { recursive: true });
  await rename(sourceFile, destinationFile);
  try { await atomicWrite(redirectsFile, nextRedirects); }
  catch (error) {
    await rename(destinationFile, sourceFile);
    throw error;
  }
  return { resourceId: options.resourceId.toLowerCase(), oldUrl: oldUrl.href, newUrl: newUrl.href, sourceFile, destinationFile, redirectRule: rule };
}

export async function materializeNativePublications(options: NativePublicationOptions) {
  const siteOrigin = exactOrigin(options.siteUrl, "Astro site URL");
  const serverOrigin = exactOrigin(options.serverUrl, "DiscussionBridge server URL");
  const secretBytes = new TextEncoder().encode(options.connectionSecret).byteLength;
  if (!CONNECTION.test(options.connectionId) || secretBytes < 32 || secretBytes > 256 || /[\x00-\x1f\x7f]/u.test(options.connectionSecret)) throw new Error("Invalid DiscussionBridge credentials");
  let existingPublications: Map<string, string> | undefined;
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const summary = { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
  let page = 1;
  let snapshot: string | undefined;
  let expectedPages: number | undefined;
  let expectedTotal: number | undefined;
  const seenResources = new Set<string>();
  for (;;) {
    const feedUrl = new URL("/discussion-bridge/v1/bridge-records.json", serverOrigin);
    feedUrl.searchParams.set("page", String(page));
    if (snapshot) feedUrl.searchParams.set("snapshot", snapshot);
    const response = await requestJson(feedUrl.href, options.connectionId, options.connectionSecret, fetchImplementation);
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
    if (!existingPublications && response.bridge_records.some((raw) => {
      const bindings = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).bindings : null;
      return Array.isArray(bindings) && bindings.some((binding) => !!binding && typeof binding === "object" && binding.native_materialization === true);
    })) {
      existingPublications = await indexNativePublications(options.docsDir);
    }
    for (const raw of response.bridge_records) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid Astro publication record");
      const feedResourceId = String((raw as Record<string, unknown>).resource_id ?? "").toLowerCase();
      if (!UUID.test(feedResourceId) || seenResources.has(feedResourceId)) throw new Error("DiscussionBridge publication feed contains a duplicate or invalid resource identity");
      seenResources.add(feedResourceId);
      try {
        const item = publication(raw as Record<string, unknown>, siteOrigin, serverOrigin);
        if (!item) { summary.skipped++; continue; }
        existingPublications ??= await indexNativePublications(options.docsDir);
        const file = path.join(options.docsDir, `${item.route}.md`);
        const previousFile = existingPublications.get(item.resourceId);
        if (previousFile && previousFile !== path.resolve(file)) throw new PublicationMigrationRequired("Astro publication URL change requires an explicit migration and redirect");
        const frontmatter = { title: item.title, description: `Published from The Bridge by ${item.authorName}.`, date: item.updatedAt, discussionCommentsDisplay: "interactive", discussionSync: false, discussionFromDiscourse: true, discussionbridgeNativePublication: true, discussionbridgeResourceId: item.resourceId, discourseTopicId: item.topicId, discourseTopicUrl: item.topicUrl, discussionbridgeSourceRevision: item.revision };
        const yaml = stringifyYaml(frontmatter).trim().replace(/^date: ([^\r\n]+)$/mu, 'date: "$1"');
        const output = `---\n${yaml}\n---\n\n${item.content}\n\n<hr>\n\n**Published from [The Bridge](${item.topicUrl})**<br>\nSource author: ${item.authorName} · Revision ${item.revision} · Astro 7 · DiscussionBridge for Astro ${PRODUCT_VERSION}\n`;
        let prior: string | null = null;
        try { prior = await readFile(file, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        if (prior === output) { summary.unchanged++; continue; }
        if (prior && !prior.includes(`discussionbridgeResourceId: ${item.resourceId}`)) throw new Error("Astro publication identity collision");
        await atomicWrite(file, output);
        existingPublications.set(item.resourceId, path.resolve(file));
        summary[prior ? "updated" : "created"]++;
      } catch (error) {
        if (error instanceof PublicationMigrationRequired) throw error;
        summary.failed++;
      }
    }
    if (page >= Number(pagination.pages)) break;
    page++;
  }
  if (seenResources.size !== expectedTotal) throw new Error("DiscussionBridge publication feed did not produce its complete unique census");
  return summary;
}
