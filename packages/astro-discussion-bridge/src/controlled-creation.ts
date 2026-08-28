import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  assertServiceResponseUrl,
  normalizePublicHttpUrl,
  parsePublicDiscourseTopicUrl,
  parseServiceBaseUrl,
  resolveServiceRequestUrl,
} from "./web-url.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 65_536;
const markdownExtensions = new Set([".md", ".mdx"]);

export interface ControlledCreationOptions {
  connectionId: string;
  connectionSecret: string;
  lane?: string;
  visibility?: "listed" | "unlisted";
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
}

export interface PublishControlledDiscussionsOptions {
  docsDir: string;
  siteUrl: string;
  discourseUrl: string;
  routeBase?: string;
  controlledCreation: ControlledCreationOptions;
}

export interface ControlledDiscussionResult {
  filePath: string;
  pageUrl: string;
  topicId?: number;
  topicUrl?: string;
  status: "created" | "resolved" | "skipped";
  reason?: string;
}

interface ControlledCreationResponse {
  outcome?: unknown;
  reason?: unknown;
  topic_id?: unknown;
  core_fallback?: unknown;
}

interface PreparedPage {
  filePath: string;
  source: string;
  pageUrl: string;
  title: string;
  categoryId?: number;
  tags?: string[];
  existingTopicId?: number;
}

type CensusEntry =
  | { kind: "skipped"; result: ControlledDiscussionResult }
  | { kind: "publish"; page: PreparedPage };

export async function publishControlledDiscussions(
  options: PublishControlledDiscussionsOptions,
  dependencies: {
    replaceFile?: typeof replaceFileAtomically;
  } = {},
): Promise<ControlledDiscussionResult[]> {
  const validated = validateOptions(options);
  const docsDir = path.resolve(options.docsDir);
  const files = await findMarkdownFiles(docsDir);
  const census: CensusEntry[] = [];
  const canonicalSources = new Map<string, string>();

  for (const filePath of files) {
    const source = await fs.readFile(filePath, "utf8");
    const parsed = parseMarkdown(source);
    const pageUrl = pageUrlForFile({
      docsDir,
      filePath,
      siteBase: validated.siteBase,
      routeBase: validated.routeBase,
      slug: parsed.frontmatter.slug,
      hasSlug: Object.hasOwn(parsed.frontmatter, "slug"),
    });
    const display = stringValue(parsed.frontmatter.discussionCommentsDisplay);
    const syncEnabled = parsed.frontmatter.discussionSync === true;
    const draft = lifecycleBoolean(parsed.frontmatter, "draft");
    const published = lifecycleBoolean(parsed.frontmatter, "published");

    if (display !== "fullInteractive") {
      census.push({ kind: "skipped", result: { filePath, pageUrl, status: "skipped", reason: "fullInteractive not requested" } });
      continue;
    }
    if (!syncEnabled) {
      census.push({ kind: "skipped", result: { filePath, pageUrl, status: "skipped", reason: "discussionSync is not explicitly true" } });
      continue;
    }
    if (draft === undefined && Object.hasOwn(parsed.frontmatter, "draft")) {
      census.push({ kind: "skipped", result: { filePath, pageUrl, status: "skipped", reason: "draft must be a boolean" } });
      continue;
    }
    if (published === undefined && Object.hasOwn(parsed.frontmatter, "published")) {
      census.push({ kind: "skipped", result: { filePath, pageUrl, status: "skipped", reason: "published must be a boolean" } });
      continue;
    }
    if (draft === true || published === false) {
      census.push({ kind: "skipped", result: { filePath, pageUrl, status: "skipped", reason: "page is not published" } });
      continue;
    }

    const hasTopicId = Object.hasOwn(parsed.frontmatter, "discourseTopicId");
    const hasTopicUrl = Object.hasOwn(parsed.frontmatter, "discourseTopicUrl");
    if (hasTopicId !== hasTopicUrl) {
      throw new Error(`Stored DiscussionBridge topic ID and URL must both be absent or both be present for ${filePath}.`);
    }
    let existingTopicId: number | undefined;
    if (hasTopicId) {
      existingTopicId = requiredPositiveTopicId(parsed.frontmatter.discourseTopicId, "Stored discourseTopicId");
      const existingTopicUrl = requiredString(parsed.frontmatter.discourseTopicUrl, "Stored discourseTopicUrl");
      const existingTopicReference = parsePublicDiscourseTopicUrl(
        existingTopicUrl,
        options.discourseUrl,
        "Stored discourseTopicUrl",
      );
      if (existingTopicReference.topicId !== existingTopicId) {
        throw new Error(`Stored DiscussionBridge topic ID and URL disagree for ${filePath}.`);
      }
    }

    const title = validatedTitle(
      stringValue(parsed.frontmatter.title) ?? firstHeading(parsed.body) ?? titleFromFile(filePath),
      filePath,
    );
    const categoryId = optionalPositiveInteger(parsed.frontmatter.discussionCategoryId, "discussionCategoryId");
    const tags = optionalTags(parsed.frontmatter.discussionTags);
    const priorPath = canonicalSources.get(pageUrl);
    if (priorPath) {
      throw new Error(`Authorized DiscussionBridge pages resolve to the same canonical source URL ${pageUrl}: ${priorPath} and ${filePath}.`);
    }
    canonicalSources.set(pageUrl, filePath);
    census.push({
      kind: "publish",
      page: { filePath, source, pageUrl, title, categoryId, tags, existingTopicId },
    });
  }

  const results: ControlledDiscussionResult[] = [];
  for (const entry of census) {
    if (entry.kind === "skipped") {
      results.push(entry.result);
      continue;
    }
    const { page } = entry;
    const created = await resolveControlledCreation({
      discourseUrl: options.discourseUrl,
      options: options.controlledCreation,
      sourceUrl: page.pageUrl,
      title: page.title,
      categoryId: page.categoryId,
      tags: page.tags,
    });
    if (page.existingTopicId && created.topicId !== page.existingTopicId) {
      throw new Error(`DiscussionBridge resolved a different topic than the stored mapping for ${page.filePath}.`);
    }
    const topicUrl = new URL(`t/-/${created.topicId}`, validated.discourseBase).href;
    const updated = updateFrontmatter(page.source, {
      discourseTopicId: String(created.topicId),
      discourseTopicUrl: topicUrl,
    });
    if (updated !== page.source) await (dependencies.replaceFile ?? replaceFileAtomically)(page.filePath, updated);
    results.push({
      filePath: page.filePath,
      pageUrl: page.pageUrl,
      topicId: created.topicId,
      topicUrl,
      status: created.outcome,
      reason: created.reason,
    });
  }

  return results;
}

function validateOptions(options: PublishControlledDiscussionsOptions): {
  discourseBase: URL;
  siteBase: URL;
  routeBase: string;
} {
  validateConnectionSettings(options.controlledCreation);
  const discourseBase = parseServiceBaseUrl(options.discourseUrl);
  if (discourseBase.protocol !== "https:") {
    throw new Error("controlledCreation requires HTTPS for its connection secret.");
  }
  return {
    discourseBase,
    siteBase: parseServiceBaseUrl(options.siteUrl, "Site URL"),
    routeBase: validateRouteBase(options.routeBase),
  };
}

function validateConnectionSettings(options: ControlledCreationOptions): void {
  const connectionId = options.connectionId;
  if (
    typeof connectionId !== "string"
    || connectionId !== connectionId.trim()
    || new TextEncoder().encode(connectionId).byteLength > 100
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(connectionId)
  ) {
    throw new Error("controlledCreation connectionId must be a trimmed identifier of at most 100 bytes.");
  }
  if (typeof options.connectionSecret !== "string" || !options.connectionSecret) {
    throw new Error("controlledCreation requires a connectionSecret.");
  }
  const lane = options.lane;
  if (lane !== undefined && (typeof lane !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(lane))) {
    throw new Error("controlledCreation lane must match the forum lane identifier grammar.");
  }
  const visibility = options.visibility;
  if (visibility !== undefined && visibility !== "listed" && visibility !== "unlisted") {
    throw new Error("controlledCreation visibility must be listed or unlisted.");
  }
}

export async function resolveControlledCreation(input: {
  discourseUrl: string;
  options: ControlledCreationOptions;
  sourceUrl: string;
  title: string;
  categoryId?: number;
  tags?: string[];
}): Promise<{ outcome: "created" | "resolved"; reason: string; topicId: number }> {
  validateConnectionSettings(input.options);
  const sourceUrl = validatedSourceUrl(input.sourceUrl);
  const title = validatedTitle(input.title, "controlledCreation request");
  const categoryId = optionalPositiveInteger(input.categoryId, "controlledCreation categoryId");
  const tags = optionalTags(input.tags);
  const serviceBase = parseServiceBaseUrl(input.discourseUrl);
  if (serviceBase.protocol !== "https:") throw new Error("controlledCreation requires HTTPS for its connection secret.");
  const endpoint = resolveServiceRequestUrl(
    "/discussion-bridge/connections/resolve.json",
    serviceBase,
  );
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(positiveBoundedInteger(
      input.options.requestTimeoutMs,
      DEFAULT_TIMEOUT_MS,
      "controlledCreation requestTimeoutMs",
      10 * 60 * 1000,
    )),
    headers: {
      "content-type": "application/json",
      "X-DiscussionBridge-Connection": input.options.connectionId,
      "X-DiscussionBridge-Secret": input.options.connectionSecret,
    },
    body: JSON.stringify({
      connection: {
        connection_id: input.options.connectionId,
        adapter_id: "astro",
        source_url: sourceUrl,
        title,
        visibility: input.options.visibility ?? "unlisted",
        ...(input.options.lane ? { lane: input.options.lane } : {}),
        ...(categoryId === undefined ? {} : { category_id: categoryId }),
        ...(tags === undefined ? {} : { tags }),
        correlation_id: randomUUID(),
      },
    }),
  });
  if (response.url) assertServiceResponseUrl(response.url, serviceBase, "controlledCreation response URL");

  const payload = await safeJsonResponse(
    response,
    positiveBoundedInteger(
      input.options.maxResponseBytes,
      DEFAULT_MAX_RESPONSE_BYTES,
      "controlledCreation maxResponseBytes",
      64 * 1024 * 1024,
    ),
  );
  const reason = safeReason(payload.reason, [input.options.connectionId, input.options.connectionSecret]);
  if (!response.ok) {
    throw new Error(`DiscussionBridge controlled creation was rejected: ${reason ?? `HTTP ${response.status}`}.`);
  }
  if (payload.core_fallback !== false) {
    throw new Error("DiscussionBridge controlled creation did not explicitly deny Core fallback.");
  }
  if (payload.outcome !== "created" && payload.outcome !== "resolved") {
    throw new Error(`DiscussionBridge controlled creation returned unsupported outcome: ${String(payload.outcome)}.`);
  }
  if (typeof payload.topic_id !== "number" || !Number.isSafeInteger(payload.topic_id) || payload.topic_id <= 0) {
    throw new Error("DiscussionBridge controlled creation returned no valid topic ID.");
  }
  return { outcome: payload.outcome, reason: reason ?? payload.outcome, topicId: payload.topic_id };
}

export interface AtomicReplaceOperations {
  open: typeof fs.open;
  rename: typeof fs.rename;
  remove: typeof fs.rm;
}

export async function replaceFileAtomically(
  filePath: string,
  contents: string,
  operations: AtomicReplaceOperations = {
    open: fs.open.bind(fs),
    rename: fs.rename.bind(fs),
    remove: fs.rm.bind(fs),
  },
): Promise<void> {
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.discussionbridge-${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await operations.open(tempPath, "wx");
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await operations.rename(tempPath, filePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await operations.remove(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function safeJsonResponse(response: Response, maximum: number): Promise<ControlledCreationResponse> {
  try {
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (!contentType || !(contentType === "application/json" || contentType.endsWith("+json"))) {
      response.body?.cancel().catch(() => undefined);
      throw new Error(`response was not JSON (${contentType || "missing content type"})`);
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximum) {
      response.body?.cancel().catch(() => undefined);
      throw new Error("response exceeds the configured size limit");
    }
    const reader = response.body?.getReader();
    if (!reader) return {};
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new Error("response exceeds the configured size limit");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as ControlledCreationResponse
      : {};
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`DiscussionBridge controlled creation returned an invalid response: ${detail}.`);
  }
}

function safeReason(value: unknown, secrets: string[]): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!compact) return undefined;
  return secrets.some((secret) => secret && compact.includes(secret)) ? "redacted" : compact;
}

async function findMarkdownFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(candidate);
      else if (entry.isFile() && markdownExtensions.has(path.extname(entry.name).toLowerCase())) files.push(candidate);
    }
  }
  await visit(root);
  return files.sort();
}

function parseMarkdown(source: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/.exec(source);
  if (!match) return { frontmatter: {}, body: source };
  const parsed: unknown = parseYaml(match[2]);
  return {
    frontmatter: parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {},
    body: source.slice(match[0].length),
  };
}

function updateFrontmatter(source: string, values: Record<string, string>): string {
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---)([\s\S]*)$/.exec(source);
  const quote = (value: string) => JSON.stringify(value);
  if (!match) {
    const lines = Object.entries(values).map(([key, value]) => `${key}: ${quote(value)}`);
    return ["---", ...lines, "---", "", source].join(lineEnding);
  }
  let body = match[2];
  for (const [key, value] of Object.entries(values)) {
    const replacement = `${key}: ${quote(value)}`;
    const pattern = new RegExp(`^${key}:.*$`, "m");
    body = pattern.test(body) ? body.replace(pattern, replacement) : `${body}${lineEnding}${replacement}`;
  }
  return `${match[1]}${body}${match[3]}${match[4]}`;
}

function pageUrlForFile(input: {
  docsDir: string;
  filePath: string;
  siteBase: URL;
  routeBase: string;
  slug: unknown;
  hasSlug: boolean;
}): string {
  const relative = path.relative(input.docsDir, input.filePath).split(path.sep).join("/");
  const withoutExtension = relative.replace(/\.(?:md|mdx)$/i, "");
  const fileSegments = withoutExtension.split("/");
  if (fileSegments.at(-1) === "index") fileSegments.pop();
  const fileRoute = validateRelativeRouteSegments(fileSegments, `Markdown path for ${input.filePath}`);
  const route = input.hasSlug
    ? validateSlug(input.slug, input.filePath)
    : fileRoute;
  const pathname = [input.routeBase, route].filter(Boolean).join("/");
  const url = new URL(`${pathname}${pathname ? "/" : ""}`, input.siteBase);
  if (url.origin !== input.siteBase.origin || !url.pathname.startsWith(input.siteBase.pathname)) {
    throw new Error(`Canonical page URL left the configured site boundary for ${input.filePath}.`);
  }
  return url.href;
}

function validateRouteBase(value: string | undefined): string {
  if (value === undefined || value === "") return "";
  if (
    typeof value !== "string"
    || value !== value.trim()
    || new TextEncoder().encode(value).byteLength > 1_024
    || value.startsWith("/")
    || value.endsWith("/")
    || value.includes("\\")
    || /[?#%\u0000-\u001f\u007f]/.test(value)
    || /^[A-Za-z][A-Za-z\d+.-]*:/.test(value)
  ) {
    throw new Error("routeBase must be a bounded relative path prefix without authority, escaping, query, or fragment syntax.");
  }
  return validateRelativeRouteSegments(value.split("/"), "routeBase");
}

function validateSlug(value: unknown, filePath: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.startsWith("/") || value.endsWith("/")) {
    throw new Error(`slug must be a non-empty trimmed relative route for ${filePath}.`);
  }
  if (
    new TextEncoder().encode(value).byteLength > 1_024
    || value.includes("\\")
    || /[?#%\u0000-\u001f\u007f]/.test(value)
    || /^[A-Za-z][A-Za-z\d+.-]*:/.test(value)
  ) {
    throw new Error(`slug contains unsafe or escaping URL syntax for ${filePath}.`);
  }
  return validateRelativeRouteSegments(value.split("/"), `slug for ${filePath}`);
}

function validateRelativeRouteSegments(segments: string[], label: string): string {
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || !/^[A-Za-z0-9._~-]+$/.test(segment))) {
    throw new Error(`${label} must contain only non-empty safe relative path segments.`);
  }
  return segments.join("/");
}

function positiveBoundedInteger(value: number | undefined, fallback: number, label: string, maximum: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new Error(`${label} must be a positive bounded integer.`);
  }
  return resolved;
}

function requiredPositiveTopicId(value: unknown, label: string): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new Error(`${label} must be a positive safe integer.`);
  return numeric;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw new Error(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}

function validatedTitle(value: string, filePath: string): string {
  if (!value || new TextEncoder().encode(value).byteLength > 1_024 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`DiscussionBridge title is invalid or exceeds 1,024 bytes for ${filePath}.`);
  }
  return value;
}

function validatedSourceUrl(value: string): string {
  const normalized = normalizePublicHttpUrl(value, "controlledCreation sourceUrl");
  const rawPath = value.slice(value.indexOf("/", value.indexOf("://") + 3)).split(/[?#]/, 1)[0];
  if (
    /\/{2,}/.test(rawPath)
    || /(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath)
    || /%(?:25)*(?:2e|2f|5c)/i.test(rawPath)
  ) {
    throw new Error("controlledCreation sourceUrl contains an ambiguous or escaping path segment.");
  }
  return normalized;
}

function optionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new Error(`${label} must be a positive safe integer.`);
  return numeric;
}

function optionalTags(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 20) {
    throw new Error("discussionTags must be an array of at most 20 tags.");
  }
  const tags = value.map((tag) => {
    if (typeof tag !== "string" || !tag.trim() || tag !== tag.trim() || new TextEncoder().encode(tag).byteLength > 100) {
      throw new Error("Each discussionTags entry must be a non-empty trimmed string of at most 100 bytes.");
    }
    return tag;
  });
  if (new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length) {
    throw new Error("discussionTags must not contain case-insensitive duplicates.");
  }
  return tags;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function lifecycleBoolean(frontmatter: Record<string, unknown>, key: string): boolean | undefined {
  const value = frontmatter[key];
  return typeof value === "boolean" ? value : undefined;
}

function firstHeading(body: string): string | undefined {
  return /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
}

function titleFromFile(filePath: string): string {
  return path.basename(filePath, path.extname(filePath)).replace(/[-_]+/g, " ").trim();
}
