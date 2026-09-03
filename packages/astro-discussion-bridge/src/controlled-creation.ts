import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createMarkdownProcessor, type MarkdownRenderer } from "@astrojs/markdown-remark";
import sanitizeHtml from "sanitize-html";
import { parse as parseYaml } from "yaml";
import { PRODUCT_VERSION } from "./version.js";
import {
  assertServiceResponseUrl,
  normalizePublicHttpUrl,
  parsePublicDiscourseTopicUrl,
  parseServiceBaseUrl,
  resolveServiceRequestUrl,
} from "./web-url.js";
import {
  beginPublicationAttempt,
  completePublicationAttempt,
  failPublicationAttempt,
  readPublicationOperationalState,
  stagePublicationResult,
  withPublicationOperationalStateLock,
  writePublicationOperationalState,
} from "./operational-state.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 65_536;
const MAX_CONTENT_HTML_BYTES = 48 * 1024;
const MAX_SOURCE_AUTHORS = 20;
const markdownExtensions = new Set([".md", ".mdx"]);

export interface ControlledCreationOptions {
  connectionId: string;
  connectionSecret: string;
  lane?: string;
  visibility?: "unlisted";
  adapterVersion?: string;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
}

export interface PublishControlledDiscussionsOptions {
  docsDir: string;
  stateFile: string;
  siteUrl: string;
  discourseUrl: string;
  routeBase?: string;
  controlledCreation: ControlledCreationOptions;
}

export interface ControlledDiscussionResult {
  filePath: string;
  pageUrl: string;
  resourceId?: string;
  topicId?: number;
  topicUrl?: string;
  status: "created" | "resolved" | "skipped";
  reason?: string;
}

interface ControlledCreationResponse {
  outcome?: unknown;
  reason?: unknown;
  resource_id?: unknown;
  topic_id?: unknown;
  topic_url?: unknown;
  direction?: unknown;
  core_fallback?: unknown;
}

interface PreparedPage {
  filePath: string;
  source: string;
  pageUrl: string;
  title: string;
  contentHtml: string;
  externalId: string;
  existingResourceId?: string;
  existingTopicId?: number;
  adoptExistingTopicId?: number;
  sourceAuthors?: SourceAuthor[];
  primarySourceAuthorId?: string;
}

export interface SourceAuthor {
  id: string;
  name: string;
  profile_url?: string;
}

type CensusEntry =
  | { kind: "skipped"; result: ControlledDiscussionResult }
  | { kind: "publish"; page: PreparedPage };

interface PublishControlledDiscussionsDependencies {
  replaceFile?: typeof replaceFileAtomically;
  afterResultStaged?: (filePath: string) => Promise<void>;
  lockOptions?: { staleMs?: number; updateMs?: number };
}

export async function publishControlledDiscussions(
  options: PublishControlledDiscussionsOptions,
  dependencies: PublishControlledDiscussionsDependencies = {},
): Promise<ControlledDiscussionResult[]> {
  const stateFile = path.resolve(options.stateFile);
  return withPublicationOperationalStateLock(stateFile, () =>
    publishControlledDiscussionsUnlocked(options, dependencies), dependencies.lockOptions);
}

async function publishControlledDiscussionsUnlocked(
  options: PublishControlledDiscussionsOptions,
  dependencies: PublishControlledDiscussionsDependencies,
): Promise<ControlledDiscussionResult[]> {
  const validated = validateOptions(options);
  const docsDir = path.resolve(options.docsDir);
  const stateFile = path.resolve(options.stateFile);
  const operationalState = await readPublicationOperationalState(stateFile);
  const files = await findMarkdownFiles(docsDir);
  const census: CensusEntry[] = [];
  const canonicalSources = new Map<string, string>();
  const markdownRenderer = await createMarkdownProcessor({ syntaxHighlight: false });

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

    const hasResourceId = Object.hasOwn(parsed.frontmatter, "discussionbridgeResourceId");
    const hasTopicId = Object.hasOwn(parsed.frontmatter, "discourseTopicId");
    const hasTopicUrl = Object.hasOwn(parsed.frontmatter, "discourseTopicUrl");
    const hasExternalId = Object.hasOwn(parsed.frontmatter, "discussionbridgeExternalId");
    const hasCompleteBridgeBinding = hasResourceId && hasTopicId && hasTopicUrl && hasExternalId;
    const hasStandaloneTopicPair = !hasResourceId && hasTopicId && hasTopicUrl && !hasExternalId;
    const hasNoBinding = !hasResourceId && !hasTopicId && !hasTopicUrl && !hasExternalId;
    if (!hasCompleteBridgeBinding && !hasStandaloneTopicPair && !hasNoBinding) {
      throw new Error(`Stored discussion identity must be absent, a standalone topic ID/URL pair, or a complete DiscussionBridge tuple for ${filePath}.`);
    }
    let existingResourceId: string | undefined;
    let existingTopicId: number | undefined;
    let adoptExistingTopicId: number | undefined;
    let externalId: string;
    if (hasCompleteBridgeBinding) {
      externalId = requiredExternalId(parsed.frontmatter.discussionbridgeExternalId, "Stored discussionbridgeExternalId");
      existingResourceId = requiredResourceId(parsed.frontmatter.discussionbridgeResourceId, "Stored discussionbridgeResourceId");
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
    } else {
      externalId = stableExternalId(validated.siteBase, docsDir, filePath);
      if (hasStandaloneTopicPair) {
        existingTopicId = requiredPositiveTopicId(parsed.frontmatter.discourseTopicId, "Stored discourseTopicId");
        const existingTopicReference = parsePublicDiscourseTopicUrl(
          requiredString(parsed.frontmatter.discourseTopicUrl, "Stored discourseTopicUrl"),
          options.discourseUrl,
          "Stored discourseTopicUrl",
        );
        if (existingTopicReference.topicId !== existingTopicId) {
          throw new Error(`Stored standalone topic ID and URL disagree for ${filePath}.`);
        }
        adoptExistingTopicId = existingTopicId;
      }
    }

    const title = validatedTitle(
      stringValue(parsed.frontmatter.title) ?? firstHeading(parsed.body) ?? titleFromFile(filePath),
      filePath,
    );
    const contentHtml = await renderedPublishedContent(parsed.body, filePath, markdownRenderer);
    const authorship = validatedSourceAuthorship(
      parsed.frontmatter.authors,
      parsed.frontmatter.primaryAuthor,
      validated.siteBase,
      filePath,
    );
    const priorPath = canonicalSources.get(pageUrl);
    if (priorPath) {
      throw new Error(`Authorized DiscussionBridge pages resolve to the same canonical source URL ${pageUrl}: ${priorPath} and ${filePath}.`);
    }
    canonicalSources.set(pageUrl, filePath);
    census.push({
      kind: "publish",
      page: {
        filePath,
        source,
        pageUrl,
        title,
        contentHtml,
        externalId,
        existingResourceId,
        existingTopicId,
        adoptExistingTopicId,
        sourceAuthors: authorship.sourceAuthors,
        primarySourceAuthorId: authorship.primarySourceAuthorId,
      },
    });
  }

  const results: ControlledDiscussionResult[] = [];
  for (const entry of census) {
    if (entry.kind === "skipped") {
      results.push(entry.result);
      continue;
    }
    const { page } = entry;
    const operation = beginPublicationAttempt(operationalState, {
      externalId: page.externalId,
      canonicalUrl: page.pageUrl,
    });
    await writePublicationOperationalState(stateFile, operationalState);
    let created: Awaited<ReturnType<typeof resolveControlledCreation>>;
    try {
      created = await resolveControlledCreation({
        discourseUrl: options.discourseUrl,
        options: options.controlledCreation,
        sourceUrl: page.pageUrl,
        title: page.title,
        contentHtml: page.contentHtml,
        externalId: page.externalId,
        sourceAuthors: page.sourceAuthors,
        primarySourceAuthorId: page.primarySourceAuthorId,
        existingTopicId: page.adoptExistingTopicId,
        correlationId: operation.correlationId,
      });
      if (
        (page.existingResourceId && created.resourceId !== page.existingResourceId)
        || (page.existingTopicId && created.topicId !== page.existingTopicId)
      ) {
        throw new Error(`DiscussionBridge resolved a different resource or topic than the stored mapping for ${page.filePath}.`);
      }
    } catch (error) {
      failPublicationAttempt(operation, error, classifyPublicationFailure(error));
      await writePublicationOperationalState(stateFile, operationalState);
      throw error;
    }
    stagePublicationResult(operation, created);
    await writePublicationOperationalState(stateFile, operationalState);
    await dependencies.afterResultStaged?.(page.filePath);
    const updated = updateFrontmatter(page.source, {
      discussionbridgeExternalId: page.externalId,
      discussionbridgeResourceId: created.resourceId,
      discourseTopicId: String(created.topicId),
      discourseTopicUrl: created.topicUrl,
    });
    if (updated !== page.source) {
      try {
        await (dependencies.replaceFile ?? replaceFileAtomically)(page.filePath, updated);
      } catch (error) {
        failPublicationAttempt(operation, error, { retryable: true, reconciliationRequired: true });
        await writePublicationOperationalState(stateFile, operationalState);
        throw error;
      }
    }
    completePublicationAttempt(operation, created);
    await writePublicationOperationalState(stateFile, operationalState);
    results.push({
      filePath: page.filePath,
      pageUrl: page.pageUrl,
      resourceId: created.resourceId,
      topicId: created.topicId,
      topicUrl: created.topicUrl,
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
    || !/^dbc_[a-z0-9]{24}$/.test(connectionId)
  ) {
    throw new Error("controlledCreation connectionId must be a DiscussionBridge Content Connection ID.");
  }
  if (
    typeof options.connectionSecret !== "string"
    || new TextEncoder().encode(options.connectionSecret).byteLength < 32
    || new TextEncoder().encode(options.connectionSecret).byteLength > 256
    || /[\u0000-\u001f\u007f]/u.test(options.connectionSecret)
  ) {
    throw new Error("controlledCreation requires a connectionSecret.");
  }
  const lane = options.lane;
  if (lane !== undefined && (typeof lane !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(lane))) {
    throw new Error("controlledCreation lane must match the forum lane identifier grammar.");
  }
  const visibility = options.visibility;
  if (visibility !== undefined && visibility !== "unlisted") {
    throw new Error("controlledCreation visibility must be unlisted.");
  }
  if (options.adapterVersion !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(options.adapterVersion)) {
    throw new Error("controlledCreation adapterVersion must be a bounded identifier.");
  }
}

export async function resolveControlledCreation(input: {
  discourseUrl: string;
  options: ControlledCreationOptions;
  sourceUrl: string;
  title: string;
  contentHtml: unknown;
  externalId?: string;
  sourceAuthors?: SourceAuthor[];
  primarySourceAuthorId?: string;
  existingTopicId?: number;
  correlationId?: string;
}): Promise<{ outcome: "created" | "resolved"; reason: string; resourceId: string; topicId: number; topicUrl: string }> {
  validateConnectionSettings(input.options);
  const sourceUrl = validatedSourceUrl(input.sourceUrl);
  const title = validatedTitle(input.title, "controlledCreation request");
  const contentHtml = validatedContentHtml(input.contentHtml, "controlledCreation request");
  const externalId = input.externalId ?? `astro-page:${createHash("sha256").update(sourceUrl).digest("hex")}`;
  if (!/^astro-page:[0-9a-f]{64}$/.test(externalId)) {
    throw new Error("controlledCreation externalId must be an Astro page identity.");
  }
  if (input.existingTopicId !== undefined &&
      (!Number.isSafeInteger(input.existingTopicId) || input.existingTopicId <= 0)) {
    throw new Error("controlledCreation existingTopicId must be a positive safe integer.");
  }
  const authorship = validatedSourceAuthorship(
    input.sourceAuthors,
    input.primarySourceAuthorId,
    new URL(sourceUrl),
    "controlledCreation request",
  );
  const serviceBase = parseServiceBaseUrl(input.discourseUrl);
  if (serviceBase.protocol !== "https:") throw new Error("controlledCreation requires HTTPS for its connection secret.");
  const endpoint = resolveServiceRequestUrl(
    "/discussion-bridge/v1/bridge-records/resolve.json",
    serviceBase,
  );
  const correlationId = input.correlationId ?? randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(correlationId)) {
    throw new Error("controlledCreation correlationId must be a UUID.");
  }
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
      bridge_record: {
        direction: "to_discourse",
        external_id: externalId,
        canonical_url: sourceUrl,
        title,
        content_html: contentHtml,
        published: true,
        adapter_id: "astro-discussion-bridge",
        adapter_version: input.options.adapterVersion ?? PRODUCT_VERSION,
        visibility: input.options.visibility ?? "unlisted",
        ...(input.options.lane ? { lane: input.options.lane } : {}),
        correlation_id: correlationId,
        ...(input.existingTopicId ? { existing_topic_id: input.existingTopicId } : {}),
        ...(authorship.sourceAuthors ? {
          source_authors: authorship.sourceAuthors,
          primary_source_author_id: authorship.primarySourceAuthorId,
        } : {}),
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
    throw new ControlledCreationRequestError(
      `DiscussionBridge controlled creation was rejected: ${reason ?? `HTTP ${response.status}`}.`,
      response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500,
      response.status === 409 || reason?.toLowerCase().includes("reconciliation") === true,
    );
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
  const resourceId = requiredResourceId(payload.resource_id, "DiscussionBridge response resource_id");
  if (payload.direction !== "to_discourse") {
    throw new Error("DiscussionBridge controlled creation returned the wrong direction.");
  }
  const topicUrl = requiredString(payload.topic_url, "DiscussionBridge response topic_url");
  const topicReference = parsePublicDiscourseTopicUrl(topicUrl, input.discourseUrl, "DiscussionBridge response topic_url");
  if (topicReference.topicId !== payload.topic_id) {
    throw new Error("DiscussionBridge controlled creation returned a mismatched topic URL.");
  }
  return { outcome: payload.outcome, reason: reason ?? payload.outcome, resourceId, topicId: payload.topic_id, topicUrl };
}

function classifyPublicationFailure(error: unknown): { retryable: boolean; reconciliationRequired: boolean } {
  if (error instanceof ControlledCreationRequestError) {
    return { retryable: error.retryable, reconciliationRequired: error.reconciliationRequired };
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const reconciliationRequired = message.includes("reconciliation") || message.includes("different resource or topic");
  const explicitlyRejected = message.includes("was rejected") && !/http (408|429|5\d\d)/u.test(message);
  return { retryable: !explicitlyRejected && !reconciliationRequired, reconciliationRequired };
}

class ControlledCreationRequestError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly reconciliationRequired: boolean) {
    super(message);
  }
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

function stableExternalId(siteBase: URL, docsDir: string, filePath: string): string {
  const relative = path.relative(docsDir, filePath).split(path.sep).join("/");
  if (!relative || relative.startsWith("../") || relative.includes("/../")) {
    throw new Error(`Markdown path is outside the configured corpus: ${filePath}.`);
  }
  return `astro-page:${createHash("sha256").update(`${siteBase.origin}${siteBase.pathname}\n${relative}`).digest("hex")}`;
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

function requiredResourceId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} must be a UUID.`);
  }
  return value.toLowerCase();
}

function requiredExternalId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^astro-page:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be an Astro page identity.`);
  }
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw new Error(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}

async function renderedPublishedContent(
  body: string,
  filePath: string,
  renderer: MarkdownRenderer,
): Promise<string> {
  let rendered: string;
  try {
    rendered = (await renderer.render(body, { fileURL: new URL(`file:///${filePath.replaceAll("\\", "/")}`) })).code;
  } catch {
    throw new Error(`DiscussionBridge could not render published Markdown content for ${filePath}.`);
  }
  const sanitized = sanitizeHtml(rendered, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      code: ["class"],
      pre: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
  });
  return validatedContentHtml(sanitized, filePath);
}

function validatedContentHtml(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.trim() === ""
    || new TextEncoder().encode(value).byteLength > MAX_CONTENT_HTML_BYTES
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`DiscussionBridge published content is invalid or exceeds 48 KiB for ${label}.`);
  }
  return value;
}

function validatedTitle(value: unknown, filePath: string): string {
  if (typeof value !== "string" || !value || new TextEncoder().encode(value).byteLength > 1_024 || /[\u0000-\u001f\u007f]/.test(value)) {
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validatedSourceAuthorship(
  value: unknown,
  primaryValue: unknown,
  siteBase: URL,
  label: string,
): { sourceAuthors?: SourceAuthor[]; primarySourceAuthorId?: string } {
  if (value === undefined) {
    if (primaryValue !== undefined) {
      throw new Error(`DiscussionBridge primary author requires authors for ${label}.`);
    }
    return {};
  }

  const entries = Array.isArray(value) ? value : [value];
  if (!entries.length || entries.length > MAX_SOURCE_AUTHORS) {
    throw new Error(`DiscussionBridge authors must contain between 1 and ${MAX_SOURCE_AUTHORS} entries for ${label}.`);
  }

  const sourceAuthors = entries.map((entry): SourceAuthor => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`DiscussionBridge author entries must be objects for ${label}.`);
    }
    const author = entry as Record<string, unknown>;
    const allowedKeys = new Set(["id", "name", "profileUrl", "profile_url"]);
    if (Object.keys(author).some((key) => !allowedKeys.has(key))) {
      throw new Error(`DiscussionBridge author entry contains unsupported fields for ${label}.`);
    }
    if (Object.hasOwn(author, "profileUrl") && Object.hasOwn(author, "profile_url")) {
      throw new Error(`DiscussionBridge author profile URL is ambiguous for ${label}.`);
    }

    const id = boundedAuthorString(author.id, "author ID", 255, label);
    const name = boundedAuthorString(author.name, "author name", 200, label);
    const rawProfile = author.profileUrl ?? author.profile_url;
    let profileUrl: string | undefined;
    if (rawProfile !== undefined) {
      profileUrl = normalizePublicHttpUrl(
        boundedAuthorString(rawProfile, "author profile URL", 2_048, label),
        `DiscussionBridge author profile URL for ${label}`,
      );
      if (new URL(profileUrl).origin !== siteBase.origin) {
        throw new Error(`DiscussionBridge author profile URL must remain on the source site origin for ${label}.`);
      }
    }
    return { id, name, ...(profileUrl ? { profile_url: profileUrl } : {}) };
  });

  const ids = sourceAuthors.map((author) => author.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`DiscussionBridge author IDs must be unique for ${label}.`);
  }
  const primarySourceAuthorId = primaryValue === undefined
    ? sourceAuthors[0].id
    : boundedAuthorString(primaryValue, "primary author ID", 255, label);
  if (!ids.includes(primarySourceAuthorId)) {
    throw new Error(`DiscussionBridge primary author must identify one supplied author for ${label}.`);
  }

  return { sourceAuthors, primarySourceAuthorId };
}

function boundedAuthorString(value: unknown, field: string, maximumBytes: number, label: string): string {
  if (
    typeof value !== "string"
    || value !== value.trim()
    || !value
    || new TextEncoder().encode(value).byteLength > maximumBytes
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`DiscussionBridge ${field} is invalid for ${label}.`);
  }
  return value;
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
