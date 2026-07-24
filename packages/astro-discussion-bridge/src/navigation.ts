import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ContentRelationshipEntry,
  ContentRelationshipManifest,
} from "./relationships.js";

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
  topicId: number;
  label: string;
  kind: NavigationNodeKind;
  sourceUrl: string;
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
}): Promise<DiscussionNavigationManifest> {
  const discourseUrl = normalizedBaseUrl(input.discourseUrl);
  const lenses = normalizeLenses(input.lenses);
  const requestedGroups = normalizeUniqueStrings(input.hierarchyTagGroups, "hierarchy tag group");
  const fetcher = input.fetch ?? globalThis.fetch;
  const headers = requestHeaders(input.apiKey, input.apiUsername);
  const selectedGroups = await Promise.all(requestedGroups.map(async (name) => {
    const url = new URL("tag_groups/filter/search.json", discourseUrl);
    url.searchParams.set("q", name);
    const groups = parseTagGroups(await requestJson(url.href, fetcher, headers));
    const group = groups.find((candidate) =>
      candidate.name.localeCompare(name, "en", { sensitivity: "base" }) === 0
    );
    if (!group) throw new Error(`Discourse hierarchy tag group was not found: ${name}.`);
    return group;
  }));
  const contentEntries = Array.isArray(input.content)
    ? input.content
    : input.content?.entries ?? [];
  const bindings = contentBindings(contentEntries);
  const manifestLenses: NavigationLens[] = [];

  for (const lens of lenses) {
    const topicUrl = new URL(`t/${lens.indexTopicId}.json`, discourseUrl).href;
    const payload = parseTopicPayload(await requestJson(topicUrl, fetcher, headers));
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
    discourseUrl: normalizedBaseUrl(requiredString(value.discourseUrl, "navigation discourseUrl")),
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
  let url: URL;
  try {
    url = new URL(value, discourseUrl);
  } catch {
    return undefined;
  }
  if (url.origin !== new URL(discourseUrl).origin) return undefined;
  const basePath = new URL(discourseUrl).pathname;
  if (!url.pathname.startsWith(basePath)) return undefined;
  const parts = url.pathname.split("/").filter(Boolean);
  const topicIndex = parts.indexOf("t");
  if (topicIndex < 0) return undefined;
  const id = parts.slice(topicIndex + 1).find((part) => /^\d+$/.test(part));
  if (!id) return undefined;
  return {
    topicId: Number(id),
    url: new URL(`t/${id}`, discourseUrl).href,
  };
}

function contentBindings(entries: ContentRelationshipEntry[]): Map<number, ContentRelationshipEntry> {
  const output = new Map<number, ContentRelationshipEntry>();
  for (const entry of entries) {
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
  return new URL(pathname, normalizedBaseUrl(input.siteUrl)).href;
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
  return {
    id: requiredString(value.id, `navigation node ${position}.id`),
    topicId: positiveInteger(value.topicId, `navigation node ${position}.topicId`),
    label: requiredString(value.label, `navigation node ${position}.label`),
    kind,
    sourceUrl: requiredWebUrl(value.sourceUrl, `navigation node ${position}.sourceUrl`),
    ...(value.url === undefined ? {} : { url: requiredWebOrRootUrl(value.url, `navigation node ${position}.url`) }),
    ...(value.sourceTags === undefined
      ? {}
      : { sourceTags: normalizeUniqueStrings(value.sourceTags, `navigation node ${position} source tag`) }),
    children: value.children.map((child, childIndex) =>
      parseNavigationNode(child, `${position}.${childIndex}`)
    ),
  };
}

function validateNavigationManifest(manifest: DiscussionNavigationManifest): void {
  const ids = new Set<string>();
  const topics = new Set<string>();
  const walk = (lens: NavigationLens, nodes: NavigationNode[]): void => {
    for (const node of nodes) {
      if (ids.has(node.id)) throw new Error(`Duplicate navigation node id: ${node.id}.`);
      ids.add(node.id);
      const topicKey = `${lens.key}:${node.topicId}`;
      if (topics.has(topicKey)) throw new Error(`Duplicate topic ${node.topicId} in lens ${lens.key}.`);
      topics.add(topicKey);
      walk(lens, node.children);
    }
  };
  for (const lens of manifest.lenses) walk(lens, lens.nodes);
}

function starlightItemForNode(node: NavigationNode): Record<string, unknown> {
  if (node.children.length) {
    return {
      label: node.label,
      collapsed: true,
      items: [
        { label: "Overview", link: node.url ?? node.sourceUrl },
        ...node.children.map(starlightItemForNode),
      ],
    };
  }
  return {
    label: node.label,
    link: node.url ?? node.sourceUrl,
  };
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
): Promise<unknown> {
  const response = await fetcher(url, { headers });
  if (!response.ok) {
    throw new Error(`Discourse navigation request failed: ${response.status} ${response.statusText} (${url}).`);
  }
  return response.json();
}

function requestHeaders(apiKey?: string, apiUsername?: string): Record<string, string> {
  if (!apiKey && !apiUsername) return { Accept: "application/json" };
  if (!apiKey || !apiUsername) {
    throw new Error("Discourse navigation authentication requires both apiKey and apiUsername.");
  }
  return {
    Accept: "application/json",
    "Api-Key": apiKey,
    "Api-Username": apiUsername,
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

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Discourse URL must use http or https.");
  }
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

function requiredWebUrl(value: unknown, label: string): string {
  const url = new URL(requiredString(value, label));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${label} must use http or https.`);
  return url.href;
}

function requiredWebOrRootUrl(value: unknown, label: string): string {
  const text = requiredString(value, label);
  return text.startsWith("/") ? text : requiredWebUrl(text, label);
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
