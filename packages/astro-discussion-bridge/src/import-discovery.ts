import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createDiscourseClient,
  type DiscourseCategory,
  type DiscourseTopicListItem,
} from "./discourse/client.js";
import {
  validateImportManifest,
  type ImportManifest,
  type ImportManifestEntry,
} from "./import-manifest.js";
import type { ImportSourceMode } from "./import-existing.js";
import { parseDiscussionTargetBindings } from "./targets.js";

export type ImportDiscoveryOrder = "oldest" | "newest" | "natural-title";
export type ImportDiscoveryStatus = "all" | "open" | "closed";

export interface DiscoverImportOptions {
  docsDir: string;
  discourseUrl: string;
  apiKey?: string;
  apiUsername?: string;
  category: string;
  includeSubcategories?: boolean;
  tags?: string[];
  createdFrom?: string;
  createdTo?: string;
  status?: ImportDiscoveryStatus;
  order?: ImportDiscoveryOrder;
  limit?: number;
  commentsDisplay?: ImportManifestEntry["commentsDisplay"];
  sourceMode?: ImportSourceMode;
  fetch?: typeof fetch;
}

export interface ImportDiscoveryCandidate {
  topicId: number;
  title: string;
  slug: string;
  topicUrl: string;
  categoryId: number;
  createdAt: string;
  closed: boolean;
  archived: boolean;
  tags: string[];
}

export interface ImportDiscoveryResult {
  category: DiscourseCategory;
  includedCategoryIds: number[];
  candidates: ImportDiscoveryCandidate[];
  manifest: ImportManifest;
  scannedTopics: number;
  excludedAlreadyImported: number;
}

export async function listDiscourseImportCategories(options: {
  discourseUrl: string;
  apiKey?: string;
  apiUsername?: string;
  fetch?: typeof fetch;
}): Promise<DiscourseCategory[]> {
  const client = createDiscourseClient(options);
  const response = await client.categories();
  return [...(response.category_list?.categories ?? [])].sort(compareCategories);
}

export async function discoverDiscourseImports(
  options: DiscoverImportOptions,
): Promise<ImportDiscoveryResult> {
  const status = options.status ?? "all";
  const order = options.order ?? "oldest";
  const limit = options.limit;
  validateDiscoveryOptions({ ...options, status, order, limit });

  const client = createDiscourseClient(options);
  const categories = await listDiscourseImportCategories(options);
  const category = selectCategory(categories, options.category);
  const includedCategoryIds = categoryIdsForSelection(
    categories,
    category.id,
    options.includeSubcategories === true,
  );
  const importedTopicIds = await findImportedTopicIds(options.docsDir);
  const createdFrom = options.createdFrom ? parseDateBoundary(options.createdFrom, "start") : undefined;
  const createdTo = options.createdTo ? parseDateBoundary(options.createdTo, "end") : undefined;
  const requiredTags = normalizeRequestedTags(options.tags);
  const selectedCategories = includedCategoryIds.map((categoryId) => (
    categories.find((candidate) => candidate.id === categoryId) ?? category
  ));
  const topics = (await Promise.all(
    selectedCategories.map((selectedCategory) => fetchCategoryTopics(client, selectedCategory)),
  )).flat();
  const seenTopicIds = new Set<number>();
  let excludedAlreadyImported = 0;

  const candidates = topics.flatMap((topic) => {
    if (seenTopicIds.has(topic.id)) return [];
    seenTopicIds.add(topic.id);
    if (!includedCategoryIds.includes(topic.category_id ?? category.id)) return [];
    if (topic.visible === false) return [];
    if (!matchesStatus(topic, status)) return [];

    const createdAt = Date.parse(topic.created_at);
    if (!Number.isFinite(createdAt)) {
      throw new Error(`Discourse topic ${topic.id} has an invalid created_at value: ${topic.created_at}`);
    }
    if (createdFrom !== undefined && createdAt < createdFrom) return [];
    if (createdTo !== undefined && createdAt > createdTo) return [];

    const topicTags = normalizeTopicTags(topic.tags);
    if (!requiredTags.every((tag) => topicTags.some((candidate) => candidate.toLowerCase() === tag.toLowerCase()))) {
      return [];
    }
    if (importedTopicIds.has(topic.id)) {
      excludedAlreadyImported += 1;
      return [];
    }

    const slug = topic.slug?.trim() || `topic-${topic.id}`;
    return [{
      topicId: topic.id,
      title: topic.title,
      slug,
      topicUrl: `${client.discourseUrl}/t/${encodeURIComponent(slug)}/${topic.id}`,
      categoryId: topic.category_id ?? category.id,
      createdAt: new Date(createdAt).toISOString(),
      closed: topic.closed === true,
      archived: topic.archived === true,
      tags: topicTags,
    }];
  });

  candidates.sort(candidateComparator(order));
  const selected = limit === undefined ? candidates : candidates.slice(0, limit);
  const manifest: ImportManifest = {
    version: 1,
    imports: selected.map((candidate) => ({
      topic: candidate.topicUrl,
      ...(options.commentsDisplay ? { commentsDisplay: options.commentsDisplay } : {}),
      ...(requiredTags.length ? { requiredTags } : {}),
      sourceMode: options.sourceMode ?? "discourse-imported",
    })),
  };

  return {
    category,
    includedCategoryIds,
    candidates: selected,
    manifest,
    scannedTopics: seenTopicIds.size,
    excludedAlreadyImported,
  };
}

export async function writeImportDiscoveryManifest(
  filePath: string,
  manifest: ImportManifest,
): Promise<string> {
  const validatedManifest = validateImportManifest(manifest, "discovery manifest output");
  const resolvedPath = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(resolvedPath, `${JSON.stringify(validatedManifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  }).catch((error: unknown) => {
    if (isNodeError(error) && error.code === "EEXIST") {
      throw new Error(`Manifest already exists: ${resolvedPath}. Choose a new path or review/remove it explicitly.`);
    }
    throw error;
  });
  return resolvedPath;
}

export function selectCategory(
  categories: DiscourseCategory[],
  selector: string,
): DiscourseCategory {
  const value = selector.trim();
  if (!value) throw new Error("Category selector must not be empty.");

  if (/^[1-9]\d*$/.test(value)) {
    const category = categories.find((candidate) => candidate.id === Number(value));
    if (!category) throw new Error(`Discourse category ID ${value} was not found.`);
    return category;
  }

  const normalized = value.toLowerCase();
  const matches = categories.filter((candidate) => (
    candidate.slug?.toLowerCase() === normalized
    || candidate.name.toLowerCase() === normalized
  ));
  if (matches.length === 0) throw new Error(`Discourse category "${value}" was not found by exact slug or name.`);
  if (matches.length > 1) {
    throw new Error(
      `Discourse category "${value}" is ambiguous. Use a category ID: ${matches.map((match) => match.id).join(", ")}.`,
    );
  }
  return matches[0];
}

function validateDiscoveryOptions(
  options: DiscoverImportOptions & {
    status: ImportDiscoveryStatus;
    order: ImportDiscoveryOrder;
    limit?: number;
  },
): void {
  if (!options.category.trim()) throw new Error("discover-imports requires --category ID|SLUG|NAME.");
  if (!["all", "open", "closed"].includes(options.status)) {
    throw new Error(`Invalid discovery status: ${options.status}. Use all, open, or closed.`);
  }
  if (!["oldest", "newest", "natural-title"].includes(options.order)) {
    throw new Error(`Invalid discovery order: ${options.order}. Use oldest, newest, or natural-title.`);
  }
  if (
    options.sourceMode !== undefined
    && !["discourse-imported", "discourse-managed"].includes(options.sourceMode)
  ) {
    throw new Error(
      `Invalid discovery source mode: ${String(options.sourceMode)}. Use discourse-imported or discourse-managed.`,
    );
  }
  if (
    options.commentsDisplay !== undefined
    && !["simple", "full", "fullInteractive"].includes(options.commentsDisplay)
  ) {
    throw new Error(
      `Invalid discovery comments display: ${String(options.commentsDisplay)}. Use simple, full, or fullInteractive.`,
    );
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("Discovery limit must be a positive integer.");
  }
  for (const [label, value] of [["created-from", options.createdFrom], ["created-to", options.createdTo]] as const) {
    if (value && !Number.isFinite(Date.parse(value))) throw new Error(`Invalid --${label} date: ${value}`);
  }
  if (
    options.createdFrom
    && options.createdTo
    && parseDateBoundary(options.createdFrom, "start") > parseDateBoundary(options.createdTo, "end")
  ) {
    throw new Error("--created-from must be before or equal to --created-to.");
  }
}

async function fetchCategoryTopics(
  client: ReturnType<typeof createDiscourseClient>,
  category: DiscourseCategory,
): Promise<DiscourseTopicListItem[]> {
  const topics: DiscourseTopicListItem[] = [];
  const visited = new Set<string>();
  let pathname = `/c/${encodeURIComponent(category.slug ?? String(category.id))}/${category.id}.json`;

  while (pathname) {
    if (visited.has(pathname)) throw new Error(`Discourse category pagination repeated ${pathname}.`);
    if (visited.size >= 1000) throw new Error("Discourse category pagination exceeded 1000 pages.");
    visited.add(pathname);
    const response = await client.categoryTopics(pathname);
    topics.push(...(response.topic_list?.topics ?? []));
    pathname = normalizePaginationPath(response.topic_list?.more_topics_url);
  }

  return topics;
}

function normalizePaginationPath(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new URL(value, "https://discussionbridge.invalid");
  return `${parsed.pathname}${parsed.search}`;
}

function parseDateBoundary(value: string, boundary: "start" | "end"): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Date.parse(`${value}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`);
  }
  return Date.parse(value);
}

async function findImportedTopicIds(docsDir: string): Promise<Set<number>> {
  const ids = new Set<number>();
  for (const filePath of await findMarkdownFiles(path.resolve(docsDir))) {
    const source = await fs.readFile(filePath, "utf8");
    const frontmatter = source.match(/^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    if (!frontmatter) continue;
    for (const match of frontmatter.matchAll(/(?:^|\r?\n)discourseTopicId:\s*['"]?([1-9]\d*)['"]?\s*(?=\r?\n|$)/g)) {
      ids.add(Number(match[1]));
    }
    const bindingsValue = frontmatter.match(
      /(?:^|\r?\n)discussionTargetBindings:\s*(.+?)\s*(?=\r?\n|$)/,
    )?.[1];
    if (bindingsValue) {
      const bindings = parseDiscussionTargetBindings(
        parseSimpleYamlScalar(bindingsValue),
        `${filePath} discussionTargetBindings`,
      );
      for (const binding of Object.values(bindings)) {
        if (binding.topicId) ids.add(binding.topicId);
      }
    }
  }
  return ids;
}

function parseSimpleYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch {
      // The target binding parser will produce the contextual validation error.
    }
  }
  return trimmed;
}

async function findMarkdownFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findMarkdownFiles(fullPath);
    if (entry.isFile() && /\.(?:md|mdx)$/i.test(entry.name)) return [fullPath];
    return [];
  }));
  return files.flat().sort();
}

function categoryIdsForSelection(
  categories: DiscourseCategory[],
  selectedId: number,
  includeSubcategories: boolean,
): number[] {
  const ids = new Set([selectedId]);
  if (!includeSubcategories) return [...ids];
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parent_category_id && ids.has(category.parent_category_id) && !ids.has(category.id)) {
        ids.add(category.id);
        changed = true;
      }
    }
  }
  return [...ids].sort((left, right) => left - right);
}

function normalizeRequestedTags(tags: string[] | undefined): string[] {
  const values = (tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  const normalized = values.map((tag) => tag.toLowerCase());
  if (new Set(normalized).size !== normalized.length) throw new Error("Discovery tags contain duplicates.");
  return values;
}

function normalizeTopicTags(tags: DiscourseTopicListItem["tags"]): string[] {
  return (tags ?? []).flatMap((tag) => {
    if (typeof tag === "string") return tag.trim() ? [tag.trim()] : [];
    return tag.name?.trim() ? [tag.name.trim()] : [];
  });
}

function matchesStatus(topic: DiscourseTopicListItem, status: ImportDiscoveryStatus): boolean {
  if (status === "open") return topic.closed !== true && topic.archived !== true;
  if (status === "closed") return topic.closed === true || topic.archived === true;
  return true;
}

function candidateComparator(order: ImportDiscoveryOrder) {
  const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  return (left: ImportDiscoveryCandidate, right: ImportDiscoveryCandidate): number => {
    if (order === "natural-title") {
      return natural.compare(left.title, right.title)
        || Date.parse(left.createdAt) - Date.parse(right.createdAt)
        || left.topicId - right.topicId;
    }
    const dateDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return (order === "newest" ? -dateDifference : dateDifference)
      || left.topicId - right.topicId;
  };
}

function compareCategories(left: DiscourseCategory, right: DiscourseCategory): number {
  return (left.parent_category_id ?? 0) - (right.parent_category_id ?? 0)
    || left.name.localeCompare(right.name)
    || left.id - right.id;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
