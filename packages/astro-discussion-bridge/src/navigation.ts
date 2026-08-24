import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ContentRelationshipEntry,
  ContentRelationshipManifest,
} from "./relationships.js";
import {
  assertServiceResponseUrl,
  parseDiscourseTopicReference,
  parseServiceBaseUrl,
} from "./web-url.js";

export type NavigationNodeKind =
  | "title"
  | "subtitle"
  | "chapter"
  | "subchapter"
  | "part"
  | "section";

export interface DiscourseNavigationLens {
  key: string;
  label: string;
  categoryId: number;
  indexTopicId: number;
}

export interface NavigationNode {
  id: string;
  topicId?: number;
  label: string;
  kind: NavigationNodeKind;
  sourceUrl?: string;
  url?: string;
  sourceTags?: string[];
  children: NavigationNode[];
}

export interface NavigationLens {
  key: string;
  label: string;
  categoryId: number;
  indexTopicId: number;
  indexSourceUrl: string;
  nodes: NavigationNode[];
}

export interface NavigationTagGroup {
  name: string;
  tags: string[];
}

export interface NavigationContentSource {
  docsDir: string;
  routeBase?: string;
}

export interface NavigationDiscoveryConfig {
  version: 1;
  hierarchyTagGroups: string[];
  lenses: DiscourseNavigationLens[];
  contentSources: NavigationContentSource[];
}

export interface DiscussionNavigationManifest {
  version: 1;
  generatedAt: string;
  discourseUrl: string;
  hierarchyTagGroups: NavigationTagGroup[];
  lenses: NavigationLens[];
}

interface TopicPayload {
  id: number;
  category_id?: number;
  post_stream?: {
    posts?: Array<{
      post_number?: number;
      cooked?: string;
    }>;
  };
}

export async function discoverDiscourseNavigation(input: {
  discourseUrl: string;
  lenses: DiscourseNavigationLens[];
  hierarchyTagGroups: string[];
  content?: ContentRelationshipManifest | ContentRelationshipEntry[];
  apiKey?: string;
  apiUsername?: string;
  fetch?: typeof globalThis.fetch;
  generatedAt?: string;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
}): Promise<DiscussionNavigationManifest> {
  const serviceBase = parseServiceBaseUrl(input.discourseUrl);
  if ((input.apiKey || input.apiUsername) && serviceBase.protocol !== "https:") {
    throw new Error("Credentialed Discourse navigation requests require HTTPS.");
  }
  const discourseUrl = serviceBase.href;
  const lenses = normalizeLenses(input.lenses);
  const requestedGroups = normalizeUniqueStrings(input.hierarchyTagGroups, "hierarchy tag group");
  const fetcher = input.fetch ?? globalThis.fetch;
  const headers = requestHeaders(input.apiKey, input.apiUsername);
  const selectedGroups: NavigationTagGroup[] = [];
  for (const name of requestedGroups) {
    const url = new URL("tag_groups/filter/search.json", discourseUrl);
    url.searchParams.set("q", name);
    const groups = parseTagGroups(await requestJson(
      url.href,
      fetcher,
      headers,
      serviceBase,
      input.requestTimeoutMs ?? 15_000,
      input.maxResponseBytes ?? 4 * 1024 * 1024,
    ));
    const group = groups.find((candidate) =>
      candidate.name.localeCompare(name, "en", { sensitivity: "base" }) === 0
    );
    if (!group) throw new Error(`Discourse hierarchy tag group was not found: ${name}.`);
    selectedGroups.push(group);
  }
  const contentEntries = Array.isArray(input.content)
    ? input.content
    : input.content?.entries ?? [];
  const bindings = contentBindings(contentEntries);
  const manifestLenses: NavigationLens[] = [];

  for (const lens of lenses) {
    const topicUrl = new URL(`t/${lens.indexTopicId}.json`, discourseUrl).href;
    const payload = parseTopicPayload(await requestJson(
      topicUrl,
      fetcher,
      headers,
      serviceBase,
      input.requestTimeoutMs ?? 15_000,
      input.maxResponseBytes ?? 4 * 1024 * 1024,
    ));
    if (payload.id !== lens.indexTopicId) {
      throw new Error(`Discourse returned topic ${payload.id} for requested index topic ${lens.indexTopicId}.`);
    }
    if (payload.category_id !== undefined && payload.category_id !== lens.categoryId) {
      throw new Error(
        `Index topic ${lens.indexTopicId} is in category ${payload.category_id}, not configured category ${lens.categoryId}.`,
      );
    }
    const cooked = payload.post_stream?.posts
      ?.find((post) => post.post_number === 1)?.cooked;
    if (!cooked?.trim()) {
      throw new Error(`Index topic ${lens.indexTopicId} does not expose a cooked first post.`);
    }
    manifestLenses.push({
      ...lens,
      indexSourceUrl: new URL(`t/${lens.indexTopicId}`, discourseUrl).href,
      nodes: navigationTreeFromCooked({
        cooked,
        discourseUrl,
        lensKey: lens.key,
        bindings,
      }),
    });
  }

  return {
    version: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    discourseUrl,
    hierarchyTagGroups: selectedGroups,
    lenses: manifestLenses,
  };
}

export function parseNavigationManifest(value: unknown): DiscussionNavigationManifest {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.lenses)) {
    throw new Error("Discussion navigation manifest must use version 1 with lenses.");
  }
  const parsed: DiscussionNavigationManifest = {
    version: 1,
    generatedAt: requiredString(value.generatedAt, "navigation generatedAt"),
    discourseUrl: parseServiceBaseUrl(
      requiredString(value.discourseUrl, "navigation discourseUrl"),
      "Navigation Discourse URL",
    ).href,
    hierarchyTagGroups: parseTagGroups({ results: value.hierarchyTagGroups }),
    lenses: value.lenses.map((lens, index) => parseNavigationLens(lens, index)),
  };
  validateNavigationManifest(parsed);
  return parsed;
}

export async function writeNavigationManifest(
  filePath: string,
  manifest: DiscussionNavigationManifest,
): Promise<string> {
  const parsed = parseNavigationManifest(manifest);
  const resolved = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(parsed, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return resolved;
}

export async function loadNavigationDiscoveryConfig(
  filePath: string,
): Promise<NavigationDiscoveryConfig> {
  const resolved = path.resolve(filePath);
  const source = await fs.readFile(resolved, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`Navigation config must be valid JSON: ${errorMessage(error)}`);
  }
  if (!isRecord(parsed) || parsed.version !== 1) {
    throw new Error("Navigation config must use version 1.");
  }
  rejectUnknownFields(
    parsed,
    new Set(["version", "hierarchyTagGroups", "lenses", "contentSources"]),
    "navigation config",
  );
  if (!Array.isArray(parsed.contentSources) || !parsed.contentSources.length) {
    throw new Error("Navigation config requires at least one contentSources entry.");
  }
  return {
    version: 1,
    hierarchyTagGroups: normalizeUniqueStrings(
      parsed.hierarchyTagGroups,
      "hierarchy tag group",
    ),
    lenses: normalizeLenses(parsed.lenses as DiscourseNavigationLens[]),
    contentSources: parsed.contentSources.map((sourceItem, index) => {
      if (!isRecord(sourceItem)) throw new Error(`Navigation content source ${index} is malformed.`);
      rejectUnknownFields(
        sourceItem,
        new Set(["docsDir", "routeBase"]),
        `navigation content source ${index}`,
      );
      return {
        docsDir: requiredString(sourceItem.docsDir, `navigation content source ${index}.docsDir`),
        ...(sourceItem.routeBase === undefined
          ? {}
          : { routeBase: requiredString(sourceItem.routeBase, `navigation content source ${index}.routeBase`) }),
      };
    }),
  };
}

export async function buildNavigationContentBindings(input: {
  projectRoot: string;
  siteUrl: string;
  sources: NavigationContentSource[];
}): Promise<ContentRelationshipEntry[]> {
  const bindings: ContentRelationshipEntry[] = [];
  const seenFiles = new Set<string>();
  for (const source of input.sources) {
    const docsDir = path.resolve(input.projectRoot, source.docsDir);
    for (const filePath of await markdownFiles(docsDir)) {
      const key = filePath.toLocaleLowerCase("en-US");
      if (seenFiles.has(key)) continue;
      seenFiles.add(key);
      const text = await fs.readFile(filePath, "utf8");
      const match = text.match(/^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!match) continue;
      const frontmatter = parseYaml(match[1]) as unknown;
      if (!isRecord(frontmatter)) continue;
      const sourceTopicId = optionalPositiveInteger(frontmatter.discourseTopicId);
      const contentLens = optionalString(frontmatter.contentLens);
      const title = optionalString(frontmatter.title);
      if (sourceTopicId === undefined && !contentLens) continue;
      if (sourceTopicId === undefined || !contentLens || !title) {
        throw new Error(
          `Navigation binding in ${filePath} requires title, contentLens, and discourseTopicId.`,
        );
      }
      bindings.push({
        title,
        contentLens,
        sourceTopicId,
        sourceTags: normalizeSourceTags(frontmatter.discussionSourceTags),
        sectionIds: normalizeSectionIds(frontmatter.sectionIds ?? frontmatter.sectionId),
        url: pageUrlForFile({
          docsDir,
          filePath,
          routeBase: source.routeBase,
          siteUrl: input.siteUrl,
        }),
      });
    }
  }
  contentBindings(bindings);
  return bindings;
}

export function navigationManifestToStarlightSidebar(
  manifest: DiscussionNavigationManifest,
): Array<Record<string, unknown>> {
  const parsed = parseNavigationManifest(manifest);
  return parsed.lenses.map((lens) => ({
    label: lens.label,
    collapsed: true,
    items: lens.nodes.map(starlightItemForNode),
  }));
}

export function activeNavigationBranch(
  manifest: DiscussionNavigationManifest,
  currentUrl: string,
): string[] {
  const comparable = comparableUrl(currentUrl);
  for (const lens of manifest.lenses) {
    const branch = findBranch(lens.nodes, comparable);
    if (branch) return [lens.key, ...branch];
  }
  return [];
}

function navigationTreeFromCooked(input: {
  cooked: string;
  discourseUrl: string;
  lensKey: string;
  bindings: Map<number, ContentRelationshipEntry>;
}): NavigationNode[] {
  const roots: NavigationNode[] = [];
  const stack: Array<{ level: number; node: NavigationNode }> = [];
  const seen = new Set<number>();
  for (const anchor of anchorsFromCooked(input.cooked)) {
    const topic = topicIdentity(anchor.href, input.discourseUrl);
    if (!topic || seen.has(topic.topicId)) continue;
    const classification = classifyNavigationLabel(anchor.label);
    if (!classification) continue;
    seen.add(topic.topicId);
    const binding = input.bindings.get(topic.topicId);
    const node: NavigationNode = {
      id: `${input.lensKey}:${topic.topicId}`,
      topicId: topic.topicId,
      label: anchor.label,
      kind: classification.kind,
      sourceUrl: topic.url,
      ...(binding?.url ? { url: binding.url } : {}),
      ...(binding?.sourceTags?.length ? { sourceTags: binding.sourceTags } : {}),
      children: [],
    };
    while (stack.length && stack.at(-1)!.level >= classification.level) stack.pop();
    if (stack.length) stack.at(-1)!.node.children.push(node);
    else roots.push(node);
    stack.push({ level: classification.level, node });
  }
  if (!roots.length) throw new Error("Authored index topic did not contain recognizable navigation links.");
  return roots;
}

function anchorsFromCooked(cooked: string): Array<{ href: string; label: string }> {
  const anchors: Array<{ href: string; label: string }> = [];
  for (const match of cooked.matchAll(/<a\b[^>]*\bhref=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeHtml(match[1] ?? match[2] ?? "").trim();
    const label = decodeHtml((match[3] ?? "").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .replace(/\s+\(Index\)$/i, "")
      .trim();
    if (href && label) anchors.push({ href, label });
  }
  return anchors;
}

function classifyNavigationLabel(
  label: string,
): { kind: NavigationNodeKind; level: number } | undefined {
  if (/^TITLE\s+[IVXLCDM]+\b/i.test(label)) return { kind: "title", level: 1 };
  if (/^Subtitle\s+[A-Z]\b/i.test(label)) return { kind: "subtitle", level: 2 };
  if (/^CHAPTER\s+\d+\b/i.test(label)) return { kind: "chapter", level: 3 };
  if (/^SUBCHAPTER\s+[A-Z]\b/i.test(label)) return { kind: "subchapter", level: 4 };
  if (/^PART\s+[IVXLCDM]+\b/i.test(label)) return { kind: "part", level: 5 };
  if (/^(?:Sec\.|Section)\s+[A-Za-z0-9.-]+\b/i.test(label)) return { kind: "section", level: 6 };
  return undefined;
}

function topicIdentity(
  value: string,
  discourseUrl: string,
): { topicId: number; url: string } | undefined {
  try {
    const serviceBase = parseServiceBaseUrl(discourseUrl);
    const topic = parseDiscourseTopicReference(value, serviceBase);
    return {
      topicId: topic.topicId,
      url: new URL(`t/${topic.topicId}`, serviceBase).href,
    };
  } catch {
    return undefined;
  }
}

function contentBindings(entries: ContentRelationshipEntry[]): Map<number, ContentRelationshipEntry> {
  const output = new Map<number, ContentRelationshipEntry>();
  const destinations = new Set<string>();
  for (const entry of entries) {
    const destination = comparableUrl(entry.url);
    if (destinations.has(destination)) {
      throw new Error(`Multiple Astro pages claim public destination ${destination}.`);
    }
    destinations.add(destination);
    if (entry.sourceTopicId === undefined) continue;
    if (output.has(entry.sourceTopicId)) {
      throw new Error(`Multiple Astro pages claim Discourse source topic ${entry.sourceTopicId}.`);
    }
    output.set(entry.sourceTopicId, entry);
  }
  return output;
}

async function markdownFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(filePath));
    else if (entry.isFile() && /\.(?:md|mdx)$/i.test(entry.name)) files.push(filePath);
  }
  return files;
}

function pageUrlForFile(input: {
  docsDir: string;
  filePath: string;
  routeBase?: string;
  siteUrl: string;
}): string {
  const relative = path.relative(input.docsDir, input.filePath).replace(/\\/g, "/");
  const withoutExtension = relative.replace(/\.(?:md|mdx)$/i, "");
  const slug = withoutExtension.endsWith("/index")
    ? withoutExtension.slice(0, -"/index".length)
    : withoutExtension;
  const routeBase = input.routeBase?.trim().replace(/^\/+|\/+$/g, "");
  const pathname = `/${[routeBase, slug].filter(Boolean).join("/")}/`.replace(/\/+/g, "/");
  return new URL(pathname, parseServiceBaseUrl(input.siteUrl, "Site URL")).href;
}

function normalizeSourceTags(value: unknown): string[] {
  if (value === undefined) return [];
  let tags: unknown = value;
  if (typeof value === "string") {
    try {
      tags = JSON.parse(value);
    } catch {
      throw new Error("discussionSourceTags must be a JSON-encoded array.");
    }
  }
  return normalizeUniqueStrings(tags, "source tag");
}

function normalizeSectionIds(value: unknown): string[] {
  if (value === undefined) return [];
  let values: unknown = value;
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      values = JSON.parse(value);
    } catch {
      throw new Error("sectionIds must be an array or JSON-encoded array.");
    }
  }
  const items = Array.isArray(values) ? values : [values];
  return items.map((item, index) => {
    const sectionId = typeof item === "number" ? String(item) : requiredString(item, `section ID ${index}`);
    if (!/^[A-Za-z0-9.-]+$/.test(sectionId)) throw new Error(`Invalid section ID: ${sectionId}.`);
    return sectionId;
  });
}

function parseTagGroups(value: unknown): NavigationTagGroup[] {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw new Error("Discourse tag-group response does not contain results.");
  }
  return value.results.map((group, index) => {
    if (!isRecord(group) || !Array.isArray(group.tags)) {
      throw new Error(`Discourse tag group ${index} is malformed.`);
    }
    return {
      name: requiredString(group.name, `tag group ${index}.name`),
      tags: group.tags.map((tag, tagIndex) => {
        if (typeof tag === "string") return requiredString(tag, `tag group ${index} tag ${tagIndex}`);
        if (!isRecord(tag)) throw new Error(`Tag group ${index} tag ${tagIndex} is malformed.`);
        return requiredString(tag.slug ?? tag.name, `tag group ${index} tag ${tagIndex}`);
      }),
    };
  });
}

function parseTopicPayload(value: unknown): TopicPayload {
  if (!isRecord(value)) throw new Error("Discourse index-topic response is malformed.");
  const id = positiveInteger(value.id, "index topic id");
  const categoryId = value.category_id === undefined
    ? undefined
    : positiveInteger(value.category_id, "index topic category id");
  const posts = isRecord(value.post_stream) && Array.isArray(value.post_stream.posts)
    ? value.post_stream.posts.map((post) => {
        if (!isRecord(post)) return {};
        return {
          ...(typeof post.post_number === "number" ? { post_number: post.post_number } : {}),
          ...(typeof post.cooked === "string" ? { cooked: post.cooked } : {}),
        };
      })
    : undefined;
  return {
    id,
    ...(categoryId ? { category_id: categoryId } : {}),
    ...(posts ? { post_stream: { posts } } : {}),
  };
}

function parseNavigationLens(value: unknown, index: number): NavigationLens {
  if (!isRecord(value) || !Array.isArray(value.nodes)) {
    throw new Error(`Navigation lens ${index} is malformed.`);
  }
  return {
    key: requiredString(value.key, `navigation lens ${index}.key`),
    label: requiredString(value.label, `navigation lens ${index}.label`),
    categoryId: positiveInteger(value.categoryId, `navigation lens ${index}.categoryId`),
    indexTopicId: positiveInteger(value.indexTopicId, `navigation lens ${index}.indexTopicId`),
    indexSourceUrl: requiredWebUrl(value.indexSourceUrl, `navigation lens ${index}.indexSourceUrl`),
    nodes: value.nodes.map((node, nodeIndex) => parseNavigationNode(node, `${index}.${nodeIndex}`)),
  };
}

function parseNavigationNode(value: unknown, position: string): NavigationNode {
  if (!isRecord(value) || !Array.isArray(value.children)) {
    throw new Error(`Navigation node ${position} is malformed.`);
  }
  const kind = requiredString(value.kind, `navigation node ${position}.kind`) as NavigationNodeKind;
  if (!["title", "subtitle", "chapter", "subchapter", "part", "section"].includes(kind)) {
    throw new Error(`Navigation node ${position} has unsupported kind: ${kind}.`);
  }
  const children = value.children.map((child, childIndex) =>
    parseNavigationNode(child, `${position}.${childIndex}`)
  );
  const topicId = value.topicId === undefined
    ? undefined
    : positiveInteger(value.topicId, `navigation node ${position}.topicId`);
  const sourceUrl = value.sourceUrl === undefined
    ? undefined
    : requiredWebUrl(value.sourceUrl, `navigation node ${position}.sourceUrl`);
  if ((topicId === undefined) !== (sourceUrl === undefined)) {
    throw new Error(`Navigation node ${position} must provide topicId and sourceUrl together.`);
  }
  if (topicId === undefined && value.url === undefined && children.length === 0) {
    throw new Error(`Navigation node ${position} has no local URL, forum binding, or children.`);
  }
  return {
    id: requiredString(value.id, `navigation node ${position}.id`),
    ...(topicId === undefined ? {} : { topicId }),
    label: requiredString(value.label, `navigation node ${position}.label`),
    kind,
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
    ...(value.url === undefined ? {} : { url: requiredWebOrRootUrl(value.url, `navigation node ${position}.url`) }),
    ...(value.sourceTags === undefined
      ? {}
      : { sourceTags: normalizeUniqueStrings(value.sourceTags, `navigation node ${position} source tag`) }),
    children,
  };
}

function validateNavigationManifest(manifest: DiscussionNavigationManifest): void {
  const ids = new Set<string>();
  const topics = new Set<string>();
  const walk = (lens: NavigationLens, nodes: NavigationNode[]): void => {
    for (const node of nodes) {
      if (ids.has(node.id)) throw new Error(`Duplicate navigation node id: ${node.id}.`);
      ids.add(node.id);
      if (node.topicId !== undefined) {
        const topicKey = `${lens.key}:${node.topicId}`;
        if (topics.has(topicKey)) throw new Error(`Duplicate topic ${node.topicId} in lens ${lens.key}.`);
        topics.add(topicKey);
      }
      walk(lens, node.children);
    }
  };
  for (const lens of manifest.lenses) walk(lens, lens.nodes);
}

function starlightItemForNode(node: NavigationNode): Record<string, unknown> {
  if (node.children.length) {
    const overview = starlightLinkForNode(node);
    return {
      label: node.label,
      collapsed: true,
      items: [
        ...(overview ? [{ label: "Overview", link: overview }] : []),
        ...node.children.map(starlightItemForNode),
      ],
    };
  }
  return {
    label: node.label,
    link: starlightLinkForNode(node),
  };
}

function starlightLinkForNode(node: NavigationNode): string | undefined {
  if (!node.url) return node.sourceUrl;
  if (node.url.startsWith("/") && !node.url.startsWith("//")) return node.url;
  const localUrl = new URL(node.url);
  return `${localUrl.pathname}${localUrl.search}${localUrl.hash}`;
}

function findBranch(nodes: NavigationNode[], currentUrl: string): string[] | undefined {
  for (const node of nodes) {
    if (node.url && comparableUrl(node.url) === currentUrl) return [node.id];
    const child = findBranch(node.children, currentUrl);
    if (child) return [node.id, ...child];
  }
  return undefined;
}

async function requestJson(
  url: string,
  fetcher: typeof globalThis.fetch,
  headers: Record<string, string>,
  serviceBase: URL,
  requestTimeoutMs: number,
  maxResponseBytes: number,
): Promise<unknown> {
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0 || requestTimeoutMs > 10 * 60 * 1000) {
    throw new Error("Navigation requestTimeoutMs must be a positive bounded integer.");
  }
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0 || maxResponseBytes > 64 * 1024 * 1024) {
    throw new Error("Navigation maxResponseBytes must be a positive bounded integer.");
  }
  const maxRateLimitRetries = 3;
  for (let attempt = 0; attempt <= maxRateLimitRetries; attempt += 1) {
    const response = await fetcher(url, {
      headers,
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (response.url) assertServiceResponseUrl(response.url, serviceBase);
    if (response.ok) {
      const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      if (!contentType || !(contentType === "application/json" || contentType.endsWith("+json"))) {
        await releaseResponseBody(response);
        throw new Error(`Discourse navigation response was not JSON (${contentType || "missing content type"}).`);
      }
      const source = await readBoundedResponseText(response, maxResponseBytes);
      try {
        return JSON.parse(source) as unknown;
      } catch {
        throw new Error("Discourse navigation response contained malformed JSON.");
      }
    }
    if (response.status === 429 && attempt < maxRateLimitRetries) {
      await releaseResponseBody(response);
      await delay(rateLimitDelayMs(response.headers.get("retry-after"), attempt));
      continue;
    }
    throw new Error(
      `Discourse navigation request failed: ${response.status} ${response.statusText} (${url})`
      + (response.status === 429 ? ` after ${attempt} retries.` : "."),
    );
  }
  throw new Error(`Discourse navigation request failed after retrying ${url}.`);
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await releaseResponseBody(response);
    throw new Error("Discourse navigation response exceeds the configured size limit.");
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
      throw new Error("Discourse navigation response exceeds the configured size limit.");
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

function rateLimitDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter?.trim()) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 30_000);
  }
  return Math.min(1000 * (2 ** attempt), 8000);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function releaseResponseBody(response: Response): Promise<void> {
  try {
    if (response.body) {
      await Promise.race([
        response.body.cancel(),
        delay(50),
      ]);
    }
  } catch {
    // The retry is still bounded if a custom fetch implementation cannot cancel its body.
  }
}

function requestHeaders(apiKey?: string, apiUsername?: string): Record<string, string> {
  const key = apiKey?.trim();
  const username = apiUsername?.trim();
  if (!key && !username) return { Accept: "application/json" };
  if (!key || !username) {
    throw new Error("Discourse navigation authentication requires both apiKey and apiUsername.");
  }
  return {
    Accept: "application/json",
    "Api-Key": key,
    "Api-Username": username,
  };
}

function normalizeLenses(lenses: DiscourseNavigationLens[]): DiscourseNavigationLens[] {
  if (!Array.isArray(lenses) || !lenses.length) {
    throw new Error("At least one Discourse navigation lens is required.");
  }
  const keys = new Set<string>();
  return lenses.map((lens, index) => {
    if (!isRecord(lens)) throw new Error(`Navigation lens ${index} is malformed.`);
    rejectUnknownFields(
      lens,
      new Set(["key", "label", "categoryId", "indexTopicId"]),
      `navigation lens ${index}`,
    );
    const key = requiredString(lens.key, `navigation lens ${index}.key`);
    if (!/^[a-z][a-z0-9-]*$/.test(key)) {
      throw new Error(`Navigation lens key must use lowercase letters, numbers, and hyphens: ${key}.`);
    }
    if (keys.has(key)) throw new Error(`Duplicate navigation lens key: ${key}.`);
    keys.add(key);
    return {
      key,
      label: requiredString(lens.label, `navigation lens ${index}.label`),
      categoryId: positiveInteger(lens.categoryId, `navigation lens ${index}.categoryId`),
      indexTopicId: positiveInteger(lens.indexTopicId, `navigation lens ${index}.indexTopicId`),
    };
  });
}

function normalizeUniqueStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}s must be an array.`);
  const values = value.map((item, index) => requiredString(item, `${label} ${index}`));
  if (new Set(values.map((item) => item.toLocaleLowerCase("en-US"))).size !== values.length) {
    throw new Error(`${label}s must not contain duplicates.`);
  }
  return values;
}

function comparableUrl(value: string): string {
  const url = new URL(value, "https://discussion-bridge.invalid");
  return url.pathname.replace(/\/+$/, "") || "/";
}

function requiredWebUrl(value: unknown, label: string): string {
  const url = new URL(requiredString(value, label));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${label} must use http or https.`);
  return url.href;
}

function requiredWebOrRootUrl(value: unknown, label: string): string {
  const text = requiredString(value, label);
  return text.startsWith("/") && !text.startsWith("//") ? text : requiredWebUrl(text, label);
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  const number = typeof value === "string" && /^\d+$/.test(value.trim())
    ? Number(value)
    : value;
  return typeof number === "number" && Number.isInteger(number) && number > 0
    ? number
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new Error(`${label} contains unknown field(s): ${unknown.join(", ")}.`);
  }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}
