import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createMarkdownProcessor, type MarkdownRenderer } from "@astrojs/markdown-remark";
import sanitizeHtml from "sanitize-html";
import { parse as parseYaml } from "yaml";
import { isInteractiveCommentsMode } from "./comments-mode.js";
import { assertPublicationDirectory } from "./native-files.js";
import { nativeUrl, type NativeUrl } from "./native-url.js";
import { assertNativeMediaPreservedByCurrentRenderer, assertNativeMeaningRetained } from "./native-media.js";
import { assertNativeArticleCapture, captureNativeArticle, completeNativePreparation, copiedReferencePreparation, nativeCodeLanguagePreparation, NativeAssetRenderRequired, NativePreparationLimitation, type NativeArticleCapture } from "./native-preparation.js";
const MAX_SOURCE_READ_BATCH = 32;
const markdownExtensions = new Set([".md", ".mdx"]);

export async function findMarkdownFiles(root: string): Promise<string[]> {
  await assertPublicationDirectory(root);
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
      const candidate = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Native Astro source census must not follow links.");
      if (entry.isDirectory()) await visit(candidate);
      else if (entry.isFile() && markdownExtensions.has(path.extname(entry.name).toLowerCase())) files.push(candidate);
    }
  }
  await visit(root);
  return files.sort();
}

export function parseMarkdown(source: string): { frontmatter: Record<string, unknown>; body: string } {
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

export function updateFrontmatter(source: string, values: Record<string, string>): string {
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

export function pageUrlForFile(input: {
  docsDir: string;
  filePath: string;
  siteBase: NativeUrl;
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
  const url = nativeUrl(`${pathname}${pathname ? "/" : ""}`, input.siteBase);
  if (url.origin !== input.siteBase.origin || !url.pathname.startsWith(input.siteBase.pathname)) {
    throw new Error(`Canonical page URL left the configured site boundary for ${input.filePath}.`);
  }
  return url.href;
}

export function stableExternalId(siteBase: NativeUrl, docsDir: string, filePath: string): string {
  const relative = path.relative(docsDir, filePath).split(path.sep).join("/");
  if (!relative || relative.startsWith("../") || relative.includes("/../")) {
    throw new Error(`Markdown path is outside the configured corpus: ${filePath}.`);
  }
  return `astro-page:${createHash("sha256").update(`${siteBase.origin}${siteBase.pathname}\n${relative}`).digest("hex")}`;
}

export function validateRouteBase(value: string | undefined): string {
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

export function validateSlug(value: unknown, filePath: string): string {
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

export function validateRelativeRouteSegments(segments: string[], label: string): string {
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || !/^[A-Za-z0-9._~-]+$/.test(segment))) {
    throw new Error(`${label} must contain only non-empty safe relative path segments.`);
  }
  return segments.join("/");
}

export async function* readMarkdownSources(files: string[]) {
  for (let offset = 0; offset < files.length; offset += MAX_SOURCE_READ_BATCH) {
    const batch = await Promise.all(files.slice(offset, offset + MAX_SOURCE_READ_BATCH).map(async (filePath) => ({
      filePath,
      source: new TextDecoder("utf-8", { fatal: true }).decode(await fs.readFile(filePath)),
    })));
    for (const entry of batch) yield entry;
  }
}

export async function renderedPublishedContent(
  body: string,
  filePath: string,
  renderer: MarkdownRenderer,
  sourceArticleUrl: string,
): Promise<NativeArticleCapture> {
  const capture = captureNativeArticle(body, sourceArticleUrl, "markdown");
  let rendered = "";
  try {
    const result = await renderer.render(body, { fileURL: new URL(`file:///${filePath.replaceAll("\\", "/")}`) });
    rendered = result.code;
    if (result.metadata.localImagePaths.length || result.metadata.remoteImagePaths.length) throw new NativeAssetRenderRequired("Astro-managed Markdown image public asset targets require the actual native Content renderer; original article is staged without a guessed image URL.");
    return prepareNativeRenderedArticle(capture, rendered);
  } catch (error) {
    const limitation = error instanceof NativePreparationLimitation ? error : new NativePreparationLimitation(`Bridge could not prepare the native article for ${filePath}; this does not invalidate its content or format.`);
    limitation.capture = { ...capture, renderedHtml: rendered }; throw limitation;
  }
}

/** Same existing portable cleaner for pre-build and actual native Content output. */
export function prepareNativeRenderedArticle(capture: NativeArticleCapture, rendered: string): NativeArticleCapture {
  assertNativeArticleCapture(capture);
  try {
  assertNativeMediaPreservedByCurrentRenderer(rendered);
  const references = copiedReferencePreparation(capture.sourceArticleUrl);
  const codeLanguages = nativeCodeLanguagePreparation(rendered);
  const sanitized = sanitizeHtml(rendered, {
    transformTags: { "*": (tagName, attribs) => {
      const code = codeLanguages.transform(tagName, attribs);
      return references.transform(code.tagName, code.attribs);
    } },
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      code: ["class"],
      pre: ["class"],
      ol: ["start", "reversed", "type"],
      li: ["value"],
      th: ["id", "colspan", "rowspan", "scope", "headers", "abbr"],
      td: ["id", "colspan", "rowspan", "headers"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
  });
  references.assertRetained(sanitized);
  codeLanguages.assertRetained(sanitized);
  // The immediately preceding check binds exact decoded native code/language;
  // only that established recipe may normalize its known Shiki decoration.
  assertNativeMeaningRetained(rendered, sanitized, true);
  if (!sanitized.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(sanitized)) throw new NativePreparationLimitation("Current Bridge preparation cannot emit a complete safe article; source retained, no content-validity or true-absence decision made.");
  return completeNativePreparation(capture, rendered, sanitized);
  } catch (error) {
    const limitation = error instanceof NativePreparationLimitation ? error : new NativePreparationLimitation("Bridge could not prepare the native article; this does not invalidate its content or format.");
    limitation.capture = { ...capture, renderedHtml: rendered }; throw limitation;
  }
}

export function sourceDate(value: unknown): string | null {
  if (value === undefined || value === null || typeof value === "boolean" || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value))) return null;
  const input = value instanceof Date ? value.toISOString() : value;
  if (typeof input !== "string" || input.length > 64 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(input) || !Number.isFinite(Date.parse(input)) || new Date(`${input.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== input.slice(0, 10)) throw new Error("Invalid native source date.");
  return input;
}

export function excerptArticle(completeHtml: string, maximum: number): string {
  const budget = maximum - 7;
  if (budget <= 0) throw new Error("DiscussionBridge publication metadata does not fit its transport envelope.");
  const plain = sanitizeHtml(completeHtml, { allowedTags: [], allowedAttributes: {}, textFilter: text => `${text} ` });
  if (!plain.trim()) throw new NativePreparationLimitation("The current native text excerpt renderer cannot represent this article within the delivery envelope; nontext source remains valid and retained, with no invented fallback.");
  let prefix = "";
  let bytes = 0;
  for (const character of plain) {
    const width = Buffer.byteLength(character);
    if (bytes + width > budget) break;
    prefix += character;
    bytes += width;
  }
  return `<p>${prefix.trimEnd().replace(/&[^;]*$/u, "")}</p>`;
}

export function lifecycleBoolean(frontmatter: Record<string, unknown>, key: string): boolean | undefined {
  const value = frontmatter[key];
  return typeof value === "boolean" ? value : undefined;
}

export function firstHeading(body: string): string | undefined {
  return /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
}

export function titleFromFile(filePath: string): string {
  return path.basename(filePath, path.extname(filePath)).replace(/[-_]+/g, " ").trim();
}

/** Native lifecycle, independent of any transport version or receiver policy. */
export function nativeLifecycle(frontmatter: Record<string, unknown>): "published" | "unpublished" | "ineligible" {
  for (const key of ["draft", "published"]) if (Object.hasOwn(frontmatter, key) && lifecycleBoolean(frontmatter, key) === undefined) throw new Error("Invalid native source publication lifecycle.");
  if (frontmatter.draft === true || frontmatter.published === false) return "unpublished";
  if (frontmatter.discussionSync !== true || !isInteractiveCommentsMode(frontmatter.discussionCommentsDisplay)
    || frontmatter.discussionFromDiscourse === true || frontmatter.discussionbridgeNativePublication === true) return "ineligible";
  return "published";
}

/** Complete sanitized native bytes, before any envelope/article selection. */
export function nativeContentIdentity(contentHtml: string) {
  const bytes = Buffer.from(contentHtml);
  if (new TextDecoder("utf-8", { fatal: true }).decode(bytes) !== contentHtml) throw new Error("Native source Unicode is invalid.");
  return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function createNativeMarkdownRenderer() { return createMarkdownProcessor({ syntaxHighlight: false }); }

