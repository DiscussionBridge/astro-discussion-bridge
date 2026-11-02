import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { semanticIdentity, validateCms } from "../src/private/cms-runtime.mjs";
import { parseMarkdown } from "./native-source.js";
import { NativePreparationLimitation, type NativeArticleCapture } from "./native-preparation.js";
import { nativeUrl, sameCmsOrigin } from "./native-url.js";
import { fullNativeHtml, nativeControlStarts, editNativeRenderedArticle, validateNativePresentation, type NativeRenderedContent, type NativePresentationEvidence } from "./native-render.js";

export const ASTRO_SOURCE_PROFILE = "discussionbridge-astro-source-html-1";
export const SOURCE_OWNERSHIP_FIELD = "discussionbridgeSourceOwnershipSha256";
export const SOURCE_MOVE_FIELD = "discussionbridgeSourceMoveId";
export const SOURCE_NONCE_FIELD = "discussionbridgeSourceMoveNonce";
export const sourceHash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const receiptKeys = ["version", "profile", "connectionId", "scopeRevision", "serverOrigin", "siteOrigin", "rootDev", "rootIno", "nativeId", "externalId", "resourceId", "topicId", "canonicalUrl", "sourceRevision", "fence", "originalArticleSha256", "preparedSourceSha256", "preparedSourceBytes", "nativeSnapshotSha256", "moveId", "proofNonce"].sort().join();

/** Component-private SOURCE receipt. It is not the From mapping receipt. */
export interface AstroSourceOwnershipV1 {
  version: 1; profile: typeof ASTRO_SOURCE_PROFILE;
  connectionId: string; scopeRevision: string; serverOrigin: string; siteOrigin: string;
  rootDev: string; rootIno: string; nativeId: string; externalId: string; resourceId: string; topicId: string;
  canonicalUrl: string; sourceRevision: string; fence: number;
  originalArticleSha256: string; preparedSourceSha256: string; preparedSourceBytes: number; nativeSnapshotSha256: string;
  moveId: string | null; proofNonce: string | null;
}
export interface SourceNativeCapture {
  buildId: string;
  file: string; fileSha256: string; originalKey: string; canonicalUrl: string; revision: string; birthBase: string;
  nativeHtml: string; ownership: AstroSourceOwnershipV1; ownershipSha256: string;
  title: string; authors: { id: string; name: string }[];
  nativePresentation?: NativePresentationEvidence;
  build?: { file: string; html: string; builtAt: string; sha256: string; dependencyMarkup: string[]; assets: { url: string; file: string; bytes: number; sha256: string }[] };
}
export function validateSourceCapture(capture: SourceNativeCapture) {
  const receipt = capture?.ownership;
  if (!receipt || Object.keys(receipt).sort().join() !== receiptKeys || receipt.version !== 1 || receipt.profile !== ASTRO_SOURCE_PROFILE || !Number.isSafeInteger(receipt.fence) || receipt.fence < 1
    || capture.ownershipSha256 !== sourceHash(semanticIdentity(receipt)) || typeof capture.nativeHtml !== "string" || new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(capture.nativeHtml)) !== capture.nativeHtml
    || capture.canonicalUrl !== receipt.canonicalUrl || capture.revision !== receipt.sourceRevision || !Number.isSafeInteger(receipt.preparedSourceBytes) || receipt.preparedSourceBytes < 0) throw new Error("Native source capture/receipt requires reconciliation.");
  for (const hash of [receipt.originalArticleSha256, receipt.preparedSourceSha256, receipt.nativeSnapshotSha256, capture.fileSha256, capture.originalKey]) validateCms("Sha256", hash);
  validateCms("ConnectionId", receipt.connectionId); validateCms("Revision", receipt.scopeRevision); validateCms("UUID", receipt.resourceId); validateCms("CoreId", receipt.topicId);
  validateCms("OpaqueId", receipt.externalId); validateCms("OpaqueId", receipt.nativeId); validateCms("Url", receipt.serverOrigin); validateCms("Url", receipt.siteOrigin);
  if (!/^\d+$/u.test(receipt.rootDev) || !/^[1-9]\d*$/u.test(receipt.rootIno) || !path.isAbsolute(capture.file) || (receipt.moveId === null) !== (receipt.proofNonce === null)) throw new Error("Native source receipt physical identity/challenge requires reconciliation.");
  if (receipt.moveId !== null) { validateCms("UUID", receipt.moveId); validateCms("PublicNonce", receipt.proofNonce); }
  validateCms("UUID", capture.buildId); validateCms("Revision", capture.revision); validateCms("Url", capture.birthBase); validateCms("Url", capture.canonicalUrl);
  validateCms("SourceAuthors", capture.authors); validateCms("Title", capture.title);
  if (capture.nativePresentation) {
    validateNativePresentation(capture.nativePresentation, capture.nativeHtml);
    if (path.resolve(capture.nativePresentation.nativeFile) !== path.resolve(capture.file)
      || capture.nativePresentation.originalMarkdownSha256 !== receipt.originalArticleSha256 || capture.nativePresentation.originalKey !== capture.originalKey) throw new Error("Full native render provenance belongs to another source.");
  }
  if (capture.build) {
    const build = capture.build; validateCms("Instant", build.builtAt);
    if (!path.isAbsolute(build.file) || sourceHash(build.html) !== build.sha256 || !Array.isArray(build.dependencyMarkup) || build.dependencyMarkup.some(value => typeof value !== "string") || !Array.isArray(build.assets)) throw new Error("Native source build artifact/dependencies differ.");
    const urls = new Set<string>();
    for (const asset of build.assets) { validateCms("Url", asset.url); validateCms("Sha256", asset.sha256); if (!path.isAbsolute(asset.file) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 0 || !sameCmsOrigin(asset.url, capture.canonicalUrl) || urls.has(asset.url)) throw new Error("Native source asset evidence requires reconciliation."); urls.add(asset.url); }
  }
}

const controlled = new Set(["slug", "discussionbridgeExternalId", "discussionbridgeResourceId", "discourseTopicId", "discourseTopicUrl", "discussionbridgeSourcePublicationRevision", SOURCE_OWNERSHIP_FIELD, SOURCE_MOVE_FIELD, SOURCE_NONCE_FIELD]);
export function sourceOriginalKey(contents: string) {
  const { frontmatter, body } = parseMarkdown(contents);
  return sourceHash(semanticIdentity([body, Object.fromEntries(Object.entries(frontmatter).filter(([name]) => !controlled.has(name)))]));
}
export function makeSourceOwnership(input: Omit<AstroSourceOwnershipV1, "version" | "profile" | "originalArticleSha256" | "preparedSourceSha256" | "preparedSourceBytes" | "nativeSnapshotSha256">, contents: string, capture: NativeArticleCapture) {
  const { frontmatter, body } = parseMarkdown(contents);
  if (body !== capture.original || !capture.preparedSha256 || capture.preparedBytes === undefined
    || frontmatter.discussionbridgeExternalId !== input.externalId || frontmatter.discussionbridgeResourceId !== input.resourceId || String(frontmatter.discourseTopicId) !== input.topicId
    || frontmatter.discussionbridgeSourcePublicationRevision !== input.sourceRevision || !Number.isSafeInteger(input.fence) || input.fence < 1
    || !/^\d+$/u.test(input.rootDev) || !/^[1-9]\d*$/u.test(input.rootIno)) throw new Error("Actual source ownership/native edition requires reconciliation.");
  validateCms("ConnectionId", input.connectionId); validateCms("Revision", input.scopeRevision); validateCms("Revision", input.sourceRevision);
  validateCms("UUID", input.resourceId); validateCms("CoreId", input.topicId); validateCms("OpaqueId", input.externalId); validateCms("OpaqueId", input.nativeId); validateCms("Url", input.canonicalUrl);
  if ((input.moveId === null) !== (input.proofNonce === null)) throw new Error("Source move ownership challenge is incomplete.");
  if (input.moveId !== null) { validateCms("UUID", input.moveId); validateCms("PublicNonce", input.proofNonce); }
  if ((frontmatter[SOURCE_MOVE_FIELD] ?? null) !== input.moveId || (frontmatter[SOURCE_NONCE_FIELD] ?? null) !== input.proofNonce) throw new Error("Native source ownership does not contain the actual move challenge.");
  const metadata = Object.fromEntries(Object.entries(frontmatter).filter(([key]) => key !== SOURCE_OWNERSHIP_FIELD));
  const receipt: AstroSourceOwnershipV1 = { version: 1, profile: ASTRO_SOURCE_PROFILE, ...input, originalArticleSha256: sourceHash(body),
    preparedSourceSha256: capture.preparedSha256, preparedSourceBytes: capture.preparedBytes, nativeSnapshotSha256: sourceHash(semanticIdentity([body, metadata])) };
  return { receipt, sha256: sourceHash(semanticIdentity(receipt)) };
}

const parserRequire = createRequire(createRequire(import.meta.url).resolve("sanitize-html"));
export interface SourceHtmlNode { name?: string; type: string; data?: string; attribs?: Record<string, string>; children?: SourceHtmlNode[]; parent?: SourceHtmlNode | null; startIndex?: number | null; endIndex?: number | null }
const { parseDocument } = parserRequire("htmlparser2") as { parseDocument(html: string, options: object): SourceHtmlNode };
export const sourceNodes = (root: SourceHtmlNode): SourceHtmlNode[] => { const result: SourceHtmlNode[] = [], stack = [root]; while (stack.length) { const node = stack.pop()!; result.push(node); for (const child of [...node.children ?? []].reverse()) stack.push(child); } return result; };
export const parseSourceHtml = (html: string) => parseDocument(html, { decodeEntities: true, withStartIndices: true, withEndIndices: true });
const encodeAttribute = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function openingEnd(html: string, start: number) {
  let quote = "";
  for (let index = start; index < html.length; index++) { const value = html[index]; if (quote) { if (value === quote) quote = ""; } else if (value === '"' || value === "'") quote = value; else if (value === ">") return index; }
  throw new NativePreparationLimitation("Complete native source markup boundary is unavailable.");
}

/** Only approved target resolution on ACTUAL native rendered output; no cleaner. */
export function resolveNativeSourceTargets(input: string, capturedBase: string): string;
export function resolveNativeSourceTargets(input: NativeRenderedContent, capturedBase: string): NativeRenderedContent;
export function resolveNativeSourceTargets(input: NativeRenderedContent, capturedBase: string): NativeRenderedContent {
  const html = fullNativeHtml(input), controls = nativeControlStarts(input);
  const edits: { start: number; end: number; value: string }[] = [];
  for (const node of sourceNodes(parseSourceHtml(html))) {
    // Only an issued native-render handle proves these local UI anchors. Every
    // authored fragment/link keeps the existing captured-base resolution.
    if (typeof node.startIndex === "number" && controls.has(node.startIndex)) continue;
    const attribute = node.name === "a" ? "href" : node.name === "img" ? "src" : undefined;
    if (!attribute || !node.attribs || !Object.hasOwn(node.attribs, attribute)) continue;
    const value = node.attribs[attribute];
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)) continue;
    const target = nativeUrl(value, capturedBase).href;
    if (typeof node.startIndex !== "number") throw new NativePreparationLimitation("Native source reference position is unavailable.");
    const end = openingEnd(html, node.startIndex), opening = html.slice(node.startIndex, end + 1);
    const pattern = new RegExp(`(\\s${attribute}\\s*=\\s*)(?:"[^"]*"|'[^']*'|[^\\s"'=<>\x60]+)`, "giu");
    const matches = [...opening.matchAll(pattern)];
    if (matches.length !== 1) throw new NativePreparationLimitation("Native source reference boundary is ambiguous; original retained.");
    const match = matches[0], start = node.startIndex + match.index!;
    edits.push({ start, end: start + match[0].length, value: `${match[1]}"${encodeAttribute(target)}"` });
  }
  return editNativeRenderedArticle(input, edits);
}
export function sourceArticleAttributes(capture: SourceNativeCapture) {
  const receipt = capture.ownership;
  return { "data-discussionbridge-source-native": receipt.nativeId, "data-discussionbridge-source-external": receipt.externalId, "data-discussionbridge-source-resource": receipt.resourceId,
    "data-discussionbridge-source-topic": receipt.topicId, "data-discussionbridge-source-revision": receipt.sourceRevision, "data-discussionbridge-source-canonical": receipt.canonicalUrl,
    "data-discussionbridge-source-move": receipt.moveId ?? undefined, "data-discussionbridge-source-nonce": receipt.proofNonce ?? undefined, "data-discussionbridge-source-ownership": capture.ownershipSha256,
    "data-discussionbridge-source-authors": semanticIdentity(capture.authors) };
}
const textOf = (node: SourceHtmlNode): string => node.data ?? (node.children ?? []).map(textOf).join("");
function explicitInlineHiding(style: string) {
  const declarations: string[] = [];
  let declaration = "", quote = "", escaped = false, comment = false, depth = 0;
  for (let index = 0; index < style.length; index++) {
    const character = style[index], next = style[index + 1];
    if (comment) { if (character === "*" && next === "/") { comment = false; index++; } continue; }
    if (escaped) { declaration += character; escaped = false; continue; }
    if (quote) { declaration += character; if (character === "\\") escaped = true; else if (character === quote) quote = ""; continue; }
    if (character === "/" && next === "*") { comment = true; declaration += " "; index++; continue; }
    if (character === "\\") { escaped = true; declaration += character; continue; }
    if (character === '"' || character === "'") { quote = character; declaration += character; continue; }
    if ("([{".includes(character)) depth++;
    else if (")]}".includes(character)) depth = Math.max(0, depth - 1);
    if (character === ";" && depth === 0) { declarations.push(declaration); declaration = ""; }
    else declaration += character;
  }
  declarations.push(declaration);
  const values = new Map<string, { value: string; important: boolean }>();
  const literalDisplays = new Set(["none", "block", "inline", "inline-block", "flow-root", "contents", "flex", "inline-flex", "grid", "inline-grid", "list-item", "table", "inline-table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row", "table-row-group"]);
  for (const entry of declarations) {
    const parsed = /^\s*(display|visibility)\s*:\s*([\s\S]*?)\s*$/iu.exec(entry);
    if (!parsed) continue;
    const property = parsed[1].toLowerCase(), important = /\s*!\s*important\s*$/iu.test(parsed[2]);
    const value = parsed[2].replace(/\s*!\s*important\s*$/iu, "").trim().toLowerCase();
    // Only explicit literal states are interpreted. No stylesheet, variables,
    // selector matching or general computed-style policy is selected here.
    if (property === "display" ? !literalDisplays.has(value) : !["hidden", "visible"].includes(value)) continue;
    const prior = values.get(property);
    if (!prior || important || !prior.important) values.set(property, { value, important });
  }
  return values.get("display")?.value === "none" || values.get("visibility")?.value === "hidden";
}
const inactiveSourceContexts = new Set(["template", "noscript", "textarea", "script", "style", "title", "xmp", "iframe", "noembed", "noframes", "plaintext"]);
function assertActiveSourceBoundary(node: SourceHtmlNode) {
  for (let current: SourceHtmlNode | null | undefined = node; current; current = current.parent) {
    if (current.name && inactiveSourceContexts.has(current.name) || Object.hasOwn(current.attribs ?? {}, "hidden") || Object.hasOwn(current.attribs ?? {}, "inert") || explicitInlineHiding(current.attribs?.style ?? ""))
      throw new Error("Actual native source article/title/content boundary is explicitly inactive (native container/hidden/inert/inline display or visibility).");
  }
}
export function inspectSourceArticle(html: string, expected: SourceNativeCapture) {
  const all = sourceNodes(parseSourceHtml(html)), owners = all.filter(node => node.name === "article" && node.attribs?.["data-discussionbridge-source-native"] === expected.ownership.nativeId);
  if (owners.length !== 1) throw new Error("Full native source owner is missing or ambiguous.");
  const owner = owners[0], members = sourceNodes(owner);
  assertActiveSourceBoundary(owner);
  for (const [name, value] of Object.entries(sourceArticleAttributes(expected))) if (value !== undefined && owner.attribs?.[name] !== value) throw new Error("Actual source identity/edition/challenge differs from its native capture.");
  const titles = members.filter(node => node.name === "h1" && Object.hasOwn(node.attribs ?? {}, "data-discussionbridge-source-title"));
  const content = members.filter(node => node.attribs?.["data-discussionbridge-source-content"] === expected.ownership.externalId);
  if (titles.length !== 1 || textOf(titles[0]) !== expected.title || content.length !== 1) throw new Error("Actual full source title/content boundary is missing or differs.");
  assertActiveSourceBoundary(titles[0]); assertActiveSourceBoundary(content[0]);
  const region = content[0];
  if (typeof region.startIndex !== "number" || typeof region.endIndex !== "number" || typeof owner.startIndex !== "number" || typeof owner.endIndex !== "number") throw new Error("Full native source extraction boundary is unavailable.");
  const start = openingEnd(html, region.startIndex) + 1, end = html.lastIndexOf("</", region.endIndex);
  if (end < start || html.slice(start, end) !== expected.nativeHtml) throw new Error("Actual native source does not contain its COMPLETE captured article.");
  return html.slice(owner.startIndex, owner.endIndex + 1);
}
export function sourceDependencyMarkup(html: string) {
  return sourceNodes(parseSourceHtml(html)).filter(node => node.name === "script" || node.name === "style" || node.name === "link" && /(?:^|\s)(?:stylesheet|modulepreload)(?:\s|$)/iu.test(node.attribs?.rel ?? ""))
    .map(node => { if (typeof node.startIndex !== "number" || typeof node.endIndex !== "number") throw new Error("Native dependency markup boundary unavailable."); return html.slice(node.startIndex, node.endIndex + 1); });
}

/** Source-proof response metadata must agree with its existing UTF-8 decoder. */
export function assertSourceHtmlContentType(contentType: string | null) {
  const reject = () => { throw new Error("Actual source proof requires unambiguous text/html metadata with absent charset or UTF-8."); };
  if (typeof contentType !== "string") return reject();
  const value = contentType.replace(/^[\t ]+|[\t ]+$/gu, "");
  const essence = /^text\/html(?=[\t ]*(?:;|$))/iu.exec(value);
  if (!essence) return reject();
  let rest = value.slice(essence[0].length).replace(/^[\t ]+/u, ""), charset = false;
  while (rest) {
    if (rest[0] !== ";") return reject();
    rest = rest.slice(1).replace(/^[\t ]+/u, "");
    const parameter = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+)[\t ]*=[\t ]*(?:"((?:[\t\x20-\x21\x23-\x5b\x5d-\x7e]|\\[\t\x20-\x7e])*)"|([!#$%&'*+.^_`|~0-9A-Za-z-]+))[\t ]*/u.exec(rest);
    if (!parameter) return reject();
    if (parameter[1].toLowerCase() === "charset") {
      const encoding = parameter[2] === undefined ? parameter[3] : parameter[2].replace(/\\([\t\x20-\x7e])/gu, "$1");
      if (charset || encoding.toLowerCase() !== "utf-8") return reject();
      charset = true;
    }
    rest = rest.slice(parameter[0].length);
  }
}
