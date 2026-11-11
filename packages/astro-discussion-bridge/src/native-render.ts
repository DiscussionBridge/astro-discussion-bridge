import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

/** Private native-render evidence. Nothing here changes the Adapter Protocol. */
export interface NativeControlRange { start: number; end: number; sha256: string }
export interface NativePresentationEvidence {
  version: 1; recipe: "starlight-heading-controls-1";
  nativeFile: string; originalMarkdownSha256: string;
  originalKey: string; producerKey: string; artifactSha256: string;
  fullHtmlSha256: string; portableHtmlSha256: string; controls: NativeControlRange[];
  generatedCodeMarkdown?: string;
}
/** Only a registered SDK producer can issue the runtime object behind this type. */
export interface NativeRenderedArticle { readonly kind: "native-rendered-article" }
export type NativeRenderedContent = string | NativeRenderedArticle;
export interface NativeRenderEdit { start: number; end: number; value: string }
const issued = new WeakMap<NativeRenderedArticle, { html: string; evidence: NativePresentationEvidence }>();
export const nativeRenderHash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const hashPattern = /^[a-f0-9]{64}$/u;
interface HtmlNode { name?: string; data?: string; attribs?: Record<string, string>; children?: HtmlNode[]; startIndex?: number | null; endIndex?: number | null }
const { parseDocument } = createRequire(createRequire(import.meta.url).resolve("sanitize-html"))("htmlparser2") as { parseDocument(value: string, options: object): HtmlNode };

function projectHtml(html: string, controls: NativeControlRange[], codeMarkdown?: string) {
  const code = codeMarkdown === undefined ? [] : starlightCodeEdits(html, codeMarkdown);
  if (!code) throw new Error("Starlight code decoration no longer matches the authored fences.");
  const edits = [...controls.map(control => ({ ...control, value: "" })), ...code].sort((a,b) => b.start - a.start);
  let result = html;
  let boundary = html.length;
  for (const edit of edits) {
    if (edit.end > boundary) throw new Error("Native presentation ranges overlap.");
    result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
    boundary = edit.start;
  }
  return result;
}

const descendants = (node: HtmlNode): HtmlNode[] => [node, ...(node.children ?? []).flatMap(descendants)];
const nodeText = (node: HtmlNode): string => node.data ?? (node.children ?? []).map(nodeText).join("");
const classIs = (node: HtmlNode, value: string) => (node.attribs?.class ?? "").split(/\s+/u).includes(value);
const escapeCode = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Accept only plain authored Markdown fences that match the actual Starlight display and copy text. */
export function starlightCodeEdits(html: string, markdown: string): NativeRenderEdit[] | undefined {
  const fences: { language: string; text: string }[] = [];
  const lines = markdown.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fence = /^(\x60{3,}|~{3,})([a-z0-9_+-]+)\s*$/iu.exec(line);
    if (!fence) {
      // A raw HTML article may supply its own scripts or controls. Leave it
      // on the existing preservation path rather than treating it as theme UI.
      if (/<[a-z!/?]|^\s{0,3}(?:\x60{3,}|~{3,})/iu.test(line)) return;
      continue;
    }
    const body: string[] = [];
    const closing = new RegExp("^" + fence[1][0] + "{" + fence[1].length + ",}\\s*$", "u");
    while (++index < lines.length && !closing.test(lines[index])) body.push(lines[index]);
    if (index === lines.length) return;
    fences.push({ language: fence[2], text: body.join("\n") });
  }
  if (!fences.length) return;
  const nodes = descendants(parseDocument(html, { withStartIndices: true, withEndIndices: true }));
  const wrappers = nodes.filter(node => node.name === "div" && classIs(node, "expressive-code"));
  const scripts = nodes.filter(node => node.name === "script");
  if (wrappers.length !== fences.length || scripts.length !== 1) return;
  const [script] = scripts;
  if (Object.keys(script.attribs ?? {}).length !== 2 || script.attribs?.type !== "module" ||
      !/^\/_astro\/ec\.[a-z0-9]+\.js$/u.test(script.attribs?.src ?? "") || nodeText(script).trim()) return;
  const edits: NativeRenderEdit[] = [];
  let scriptInWrapper = false;
  for (const [index, wrapper] of wrappers.entries()) {
    const parts = descendants(wrapper);
    const pre = parts.filter(node => node.name === "pre");
    const copy = parts.filter(node => node.name === "button");
    const codeLines = parts.filter(node => node.name === "div" && classIs(node, "code"));
    const { language, text } = fences[index];
    if (pre.length !== 1 || pre[0].attribs?.["data-language"] !== language || copy.length !== 1 ||
        copy[0].attribs?.["data-code"]?.replaceAll("\u007f", "\n") !== text ||
        codeLines.map(nodeText).join("\n") !== text ||
        parts.some(node => node !== script && ["a", "img", "input", "form", "style", "script", "iframe"].includes(node.name ?? ""))) return;
    scriptInWrapper ||= parts.includes(script);
    edits.push({ start: wrapper.startIndex!, end: wrapper.endIndex! + 1,
      value: '<pre><code class="language-' + language + '">' + escapeCode(text) + '\n</code></pre>' });
  }
  if (!scriptInWrapper) edits.push({ start: script.startIndex!, end: script.endIndex! + 1, value: "" });
  return edits;
}
export function validateNativePresentation(value: NativePresentationEvidence, html: string) {
  if (!value || value.version !== 1 || value.recipe !== "starlight-heading-controls-1" || typeof value.nativeFile !== "string" || !path.isAbsolute(value.nativeFile)
    || ![value.originalMarkdownSha256, value.originalKey, value.producerKey, value.artifactSha256, value.fullHtmlSha256, value.portableHtmlSha256].every(item => typeof item === "string" && hashPattern.test(item))
    || !Array.isArray(value.controls) || nativeRenderHash(html) !== value.fullHtmlSha256) throw new Error("Native presentation evidence requires reconciliation.");
  const anchors = new Map<number, HtmlNode>(), pending = [parseDocument(html, { withStartIndices: true, withEndIndices: true })];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.name === "a" && typeof node.startIndex === "number") anchors.set(node.startIndex, node);
    for (const child of node.children ?? []) pending.push(child);
  }
  let end = 0;
  for (const control of value.controls) {
    const node = anchors.get(control.start);
    if (!Number.isSafeInteger(control.start) || !Number.isSafeInteger(control.end) || control.start < end || control.end <= control.start || control.end > html.length
      || typeof control.sha256 !== "string" || !hashPattern.test(control.sha256) || nativeRenderHash(html.slice(control.start, control.end)) !== control.sha256
      || !node || node.endIndex! + 1 !== control.end || !node.attribs?.href?.startsWith("#") || node.attribs.href.length < 2) throw new Error("Native control range differs from its exact rendered anchor.");
    end = control.end;
  }
  if (value.generatedCodeMarkdown !== undefined && nativeRenderHash(value.generatedCodeMarkdown) !== value.originalMarkdownSha256) throw new Error("Native code projection belongs to a different source.");
  if (nativeRenderHash(projectHtml(html, value.controls, value.generatedCodeMarkdown)) !== value.portableHtmlSha256) throw new Error("Native portable projection differs from its witnessed presentation.");
}
/** SDK-private issuance, called only after actual registered producer validation. */
export function issueNativeRenderedArticle(html: string, source: Omit<NativePresentationEvidence, "version" | "recipe" | "fullHtmlSha256" | "portableHtmlSha256">): NativeRenderedArticle {
  const evidence: NativePresentationEvidence = { ...structuredClone(source), version: 1, recipe: "starlight-heading-controls-1",
    fullHtmlSha256: nativeRenderHash(html), portableHtmlSha256: nativeRenderHash(projectHtml(html, source.controls, source.generatedCodeMarkdown)) };
  validateNativePresentation(evidence, html);
  const handle = Object.freeze({ kind: "native-rendered-article" as const });
  issued.set(handle, { html, evidence }); return handle;
}
function view(value: NativeRenderedArticle) {
  const result = value && issued.get(value);
  if (!result) throw new Error("Native render was not issued by the registered SDK producer.");
  validateNativePresentation(result.evidence, result.html); return result;
}
export function fullNativeHtml(value: NativeRenderedContent) { return typeof value === "string" ? value : view(value).html; }
export function portableNativeHtml(value: NativeRenderedContent) {
  if (typeof value === "string") return value;
  const { html, evidence } = view(value);
  return projectHtml(html, evidence.controls, evidence.generatedCodeMarkdown);
}
export function nativePresentation(value: NativeRenderedContent) { return typeof value === "string" ? undefined : structuredClone(view(value).evidence); }
export function nativeControlStarts(value: NativeRenderedContent) { return new Set(typeof value === "string" ? [] : view(value).evidence.controls.map(control => control.start)); }
export function assertNativeRenderSource(value: NativeRenderedContent, file: string, originalMarkdown: string) {
  if (typeof value === "string") return;
  const { evidence } = view(value);
  if (path.resolve(evidence.nativeFile) !== path.resolve(file) || evidence.originalMarkdownSha256 !== nativeRenderHash(originalMarkdown)) throw new Error("Native renderer evidence belongs to another physical article.");
}
/** Existing copied-reference edits may touch authored markup, never proven UI. */
export function editNativeRenderedArticle(value: NativeRenderedContent, edits: NativeRenderEdit[]): NativeRenderedContent {
  const html = fullNativeHtml(value), evidence = nativePresentation(value);
  let boundary = html.length, result = html;
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    if (!Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) || edit.start < 0 || edit.end <= edit.start || edit.end > boundary
      || typeof edit.value !== "string" || evidence?.controls.some(control => edit.start < control.end && edit.end > control.start)) throw new Error("Native reference edits overlap a witnessed control or another edit.");
    result = result.slice(0, edit.start) + edit.value + result.slice(edit.end); boundary = edit.start;
  }
  if (!evidence) return result;
  const offset = (position: number) => edits.filter(edit => edit.end <= position).reduce((sum, edit) => sum + edit.value.length - (edit.end - edit.start), position);
  return issueNativeRenderedArticle(result, { ...evidence, controls: evidence.controls.map(control => ({ ...control, start: offset(control.start), end: offset(control.end) })) });
}
