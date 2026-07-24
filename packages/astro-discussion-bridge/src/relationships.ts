import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export interface ContentRelationshipSource {
  docsDir: string;
  routeBase?: string;
}

export interface ContentLensDefinition {
  label: string;
  callToAction?: string;
  singularCallToAction?: string;
  pluralCallToAction?: string;
}

export interface ContentRelationshipEntry {
  title: string;
  url: string;
  contentLens: string;
  sectionIds: string[];
  sourceTopicId?: number;
  sourceTags?: string[];
}

export interface ContentRelationshipManifest {
  version: 1;
  lenses: Record<string, ContentLensDefinition>;
  entries: ContentRelationshipEntry[];
}

export interface ResolvedContentRelationship {
  contentLens: string;
  label: string;
  callToAction: string;
  entries: ContentRelationshipEntry[];
}

export async function buildContentRelationshipManifest(options: {
  projectRoot: string;
  siteUrl?: string;
  sources: ContentRelationshipSource[];
  lenses?: Record<string, ContentLensDefinition>;
}): Promise<ContentRelationshipManifest> {
  const entries: ContentRelationshipEntry[] = [];
  const seenFiles = new Set<string>();

  for (const source of options.sources) {
    const docsDir = path.resolve(options.projectRoot, source.docsDir);
    for (const filePath of await markdownFiles(docsDir)) {
      const key = filePath.toLocaleLowerCase("en-US");
      if (seenFiles.has(key)) continue;
      seenFiles.add(key);
      const entry = await relationshipEntryForFile({
        docsDir,
        filePath,
        routeBase: source.routeBase,
        siteUrl: options.siteUrl,
      });
      if (entry) entries.push(entry);
    }
  }

  entries.sort((left, right) =>
    left.url.localeCompare(right.url, "en", { numeric: true, sensitivity: "base" })
  );
  validateRelationshipEntries(entries);
  return {
    version: 1,
    lenses: normalizeLensDefinitions(options.lenses ?? {}, entries),
    entries,
  };
}

export function resolveContentRelationships(input: {
  manifest: ContentRelationshipManifest;
  currentUrl: string;
  sectionIds?: string[] | string;
  contentLens?: string;
}): ResolvedContentRelationship[] {
  const sectionIds = normalizeSectionIds(input.sectionIds);
  if (!sectionIds.length) return [];
  const currentUrl = comparableUrl(input.currentUrl);
  const matching = input.manifest.entries.filter((entry) =>
    comparableUrl(entry.url) !== currentUrl
    && entry.sectionIds.some((sectionId) => sectionIds.includes(sectionId))
  );
  const groups = new Map<string, ContentRelationshipEntry[]>();
  for (const entry of matching) {
    const group = groups.get(entry.contentLens) ?? [];
    group.push(entry);
    groups.set(entry.contentLens, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => lensOrder(input.manifest, left) - lensOrder(input.manifest, right))
    .map(([contentLens, entries]) => {
      const definition = input.manifest.lenses[contentLens] ?? {
        label: humanizeLens(contentLens),
      };
      return {
        contentLens,
        label: definition.label,
        callToAction: callToActionForLens(definition, entries.length),
        entries,
      };
    });
}

export function parseRelationshipManifest(value: unknown): ContentRelationshipManifest {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries) || !isRecord(value.lenses)) {
    throw new Error("Content relationship manifest must use version 1 with lenses and entries.");
  }
  const lenses: Record<string, ContentLensDefinition> = {};
  for (const [key, definition] of Object.entries(value.lenses)) {
    if (!isRecord(definition)) throw new Error(`Relationship lens "${key}" must be an object.`);
    lenses[key] = {
      label: requiredString(definition.label, `relationship lens ${key}.label`),
      ...(optionalString(definition.callToAction)
        ? { callToAction: optionalString(definition.callToAction) }
        : {}),
      ...(optionalString(definition.singularCallToAction)
        ? { singularCallToAction: optionalString(definition.singularCallToAction) }
        : {}),
      ...(optionalString(definition.pluralCallToAction)
        ? { pluralCallToAction: optionalString(definition.pluralCallToAction) }
        : {}),
    };
  }
  const entries = value.entries.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`Relationship entry ${index} must be an object.`);
    return {
      title: requiredString(entry.title, `relationship entry ${index}.title`),
      url: requiredWebOrRootUrl(entry.url, `relationship entry ${index}.url`),
      contentLens: requiredString(entry.contentLens, `relationship entry ${index}.contentLens`),
      sectionIds: normalizeSectionIds(entry.sectionIds),
      ...(optionalPositiveInteger(entry.sourceTopicId) !== undefined
        ? { sourceTopicId: optionalPositiveInteger(entry.sourceTopicId) }
        : {}),
      ...(entry.sourceTags === undefined ? {} : { sourceTags: normalizeSourceTags(entry.sourceTags) }),
    };
  });
  validateRelationshipEntries(entries);
  return { version: 1, lenses, entries };
}

async function relationshipEntryForFile(input: {
  docsDir: string;
  filePath: string;
  routeBase?: string;
  siteUrl?: string;
}): Promise<ContentRelationshipEntry | undefined> {
  const source = await fs.readFile(input.filePath, "utf8");
  const match = source.match(/^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return undefined;
  const frontmatter = parseYaml(match[1]) as unknown;
  if (!isRecord(frontmatter)) return undefined;
  const sectionIds = normalizeSectionIds(frontmatter.sectionIds ?? frontmatter.sectionId);
  const contentLens = optionalString(frontmatter.contentLens);
  const title = optionalString(frontmatter.title);
  if (!sectionIds.length && !contentLens) return undefined;
  if (!sectionIds.length || !contentLens || !title) {
    throw new Error(
      `Relationship metadata in ${input.filePath} requires title, contentLens, and sectionId or sectionIds.`,
    );
  }
  return {
    title,
    contentLens,
    sectionIds,
    url: pageUrlForFile(input),
    ...(optionalPositiveInteger(frontmatter.discourseTopicId) !== undefined
      ? { sourceTopicId: optionalPositiveInteger(frontmatter.discourseTopicId) }
      : {}),
    ...(frontmatter.discussionSourceTags === undefined
      ? {}
      : { sourceTags: normalizeSourceTags(frontmatter.discussionSourceTags) }),
  };
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
  siteUrl?: string;
}): string {
  const relative = path.relative(input.docsDir, input.filePath).replace(/\\/g, "/");
  const withoutExtension = relative.replace(/\.(?:md|mdx)$/i, "");
  const slug = withoutExtension.endsWith("/index")
    ? withoutExtension.slice(0, -"/index".length)
    : withoutExtension;
  const routeBase = input.routeBase?.trim().replace(/^\/+|\/+$/g, "");
  const pathname = `/${[routeBase, slug].filter(Boolean).join("/")}/`.replace(/\/+/g, "/");
  return input.siteUrl ? new URL(pathname, ensureTrailingSlash(input.siteUrl)).href : pathname;
}

function normalizeSectionIds(value: unknown): string[] {
  let values: unknown[];
  if (Array.isArray(value)) values = value;
  else if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      values = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      throw new Error("sectionIds must be an array or a JSON-encoded array.");
    }
  } else if (value === undefined) values = [];
  else values = [value];

  const normalized = values.map((item) => {
    const sectionId = typeof item === "number" ? String(item) : optionalString(item);
    if (!sectionId || !/^[A-Za-z0-9.-]+$/.test(sectionId)) {
      throw new Error(`Invalid relationship section ID: ${String(item)}.`);
    }
    return sectionId;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Relationship section IDs must not contain duplicates.");
  }
  return normalized;
}

function normalizeLensDefinitions(
  configured: Record<string, ContentLensDefinition>,
  entries: ContentRelationshipEntry[],
): Record<string, ContentLensDefinition> {
  const output: Record<string, ContentLensDefinition> = {};
  const names = new Set([...Object.keys(configured), ...entries.map((entry) => entry.contentLens)]);
  for (const name of names) {
    const definition = configured[name];
    output[name] = {
      label: definition?.label?.trim() || humanizeLens(name),
      ...(definition?.callToAction?.trim() ? { callToAction: definition.callToAction.trim() } : {}),
      ...(definition?.singularCallToAction?.trim()
        ? { singularCallToAction: definition.singularCallToAction.trim() }
        : {}),
      ...(definition?.pluralCallToAction?.trim()
        ? { pluralCallToAction: definition.pluralCallToAction.trim() }
        : {}),
    };
  }
  return output;
}

function validateRelationshipEntries(entries: ContentRelationshipEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.sectionIds.length) throw new Error(`Relationship entry ${entry.url} has no section IDs.`);
    const key = comparableUrl(entry.url);
    if (seen.has(key)) throw new Error(`Relationship manifest contains duplicate URL: ${entry.url}.`);
    seen.add(key);
  }
}

function callToActionForLens(definition: ContentLensDefinition, count: number): string {
  const template = count === 1
    ? definition.singularCallToAction ?? definition.callToAction
    : definition.pluralCallToAction ?? definition.callToAction;
  return (template ?? `View ${definition.label}`)
    .replace(/\{count\}/g, String(count))
    .replace(/\{label\}/g, definition.label);
}

function lensOrder(manifest: ContentRelationshipManifest, lens: string): number {
  const index = Object.keys(manifest.lenses).indexOf(lens);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function humanizeLens(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => `${word[0]?.toLocaleUpperCase("en-US") ?? ""}${word.slice(1)}`)
    .join(" ");
}

function comparableUrl(value: string): string {
  try {
    const url = new URL(value, "https://discussion-bridge.invalid");
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return value.replace(/\/+$/, "") || "/";
  }
}

function requiredWebOrRootUrl(value: unknown, label: string): string {
  const text = requiredString(value, label);
  if (text.startsWith("/")) return text;
  const url = new URL(text);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must be a root-relative or http/https URL.`);
  }
  return url.href;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function requiredString(value: unknown, label: string): string {
  const text = optionalString(value);
  if (!text) throw new Error(`${label} must be a non-empty string.`);
  return text;
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

function normalizeSourceTags(value: unknown): string[] {
  let tags: unknown = value;
  if (typeof value === "string") {
    try {
      tags = JSON.parse(value);
    } catch {
      throw new Error("discussionSourceTags must be a JSON-encoded array.");
    }
  }
  if (!Array.isArray(tags)) throw new Error("discussionSourceTags must be an array.");
  const normalized = tags.map((tag) => requiredString(tag, "discussionSourceTags entry"));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("discussionSourceTags must not contain duplicates.");
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}
