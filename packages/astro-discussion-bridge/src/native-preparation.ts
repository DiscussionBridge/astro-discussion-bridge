import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { nativeUrl } from "./native-url.js";

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const sanitizerRequire = createRequire(createRequire(import.meta.url).resolve("sanitize-html"));
interface HtmlNode { name?: string; type: string; data?: string; attribs?: Record<string, string>; children?: HtmlNode[] }
const { parseDocument } = sanitizerRequire("htmlparser2") as { parseDocument(html: string): HtmlNode };

/** Private native evidence, never an additional wire field or HTML policy. */
export interface NativeArticleCapture {
  originalKind: "markdown" | "cooked_html";
  sourceArticleUrl: string;
  original: string;
  originalBytes: number;
  originalSha256: string;
  renderedHtml?: string;
  preparedHtml?: string;
  preparedBytes?: number;
  preparedSha256?: string;
}
export class NativePreparationLimitation extends Error {
  capture?: NativeArticleCapture;
}
/** Native asset resolution is deferred to the actual Astro Content renderer. */
export class NativeAssetRenderRequired extends NativePreparationLimitation {}
export function captureNativeArticle(original: string, sourceArticleUrl: string, originalKind: NativeArticleCapture["originalKind"]): NativeArticleCapture {
  // The existing native/transport owner supplies this article URL. No guessed
  // site/hostname/default base and no new URI admission policy is selected here.
  nativeUrl(sourceArticleUrl);
  const result = { originalKind, sourceArticleUrl, original, originalBytes: Buffer.byteLength(original), originalSha256: sha256(original) };
  assertNativeArticleCapture(result); return result;
}
export function completeNativePreparation(capture: NativeArticleCapture, renderedHtml: string, preparedHtml: string): NativeArticleCapture {
  const result = { ...capture, renderedHtml, preparedHtml, preparedBytes: Buffer.byteLength(preparedHtml), preparedSha256: sha256(preparedHtml) };
  assertNativeArticleCapture(result); return result;
}
export function assertNativeArticleCapture(capture: NativeArticleCapture) {
  if (!capture || !["markdown", "cooked_html"].includes(capture.originalKind) || typeof capture.sourceArticleUrl !== "string" || typeof capture.original !== "string"
    || capture.originalBytes !== Buffer.byteLength(capture.original) || capture.originalSha256 !== sha256(capture.original)
    || new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(capture.original)) !== capture.original) throw new Error("Native original article capture requires reconciliation.");
  nativeUrl(capture.sourceArticleUrl);
  if (capture.preparedHtml !== undefined && (typeof capture.renderedHtml !== "string" || capture.preparedBytes !== Buffer.byteLength(capture.preparedHtml) || capture.preparedSha256 !== sha256(capture.preparedHtml)
    || new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(capture.preparedHtml)) !== capture.preparedHtml)) throw new Error("Complete native preparation evidence requires reconciliation.");
}
export const nativeCaptureId = (capture: NativeArticleCapture) => sha256(JSON.stringify([capture.originalKind, capture.sourceArticleUrl, capture.originalSha256, capture.preparedSha256 ?? null]));

/** Carry actual native renderer metadata into the existing portable code marker. */
export function nativeCodeLanguagePreparation(rendered: string) {
  const text = (node: HtmlNode): string => node.type === "text" ? node.data ?? "" : (node.children ?? []).map(text).join("");
  const codes: { attribs: Record<string, string>; language?: string; text: string }[] = [];
  const visit = (node: HtmlNode, parent?: HtmlNode) => {
    if (node.name === "code") codes.push({ attribs: node.attribs ?? {}, text: text(node),
      language: parent?.name === "pre" ? parent.attribs?.["data-language"] : undefined });
    for (const child of node.children ?? []) visit(child, node);
  };
  visit(parseDocument(rendered));
  const active = codes.some(code => code.language !== undefined);
  const identity = (language: string, content: string) => JSON.stringify([language, content]);
  const required = new Map<string, number>();
  for (const code of codes) if (code.language !== undefined) {
    if (!code.language || /[\s\p{Cc}]/u.test(code.language)) throw new NativePreparationLimitation("Bridge cannot retain this native code language as its existing single language marker; original retained.");
    const key = identity(code.language, code.text); required.set(key, (required.get(key) ?? 0) + 1);
  }
  let index = 0;
  return {
    transform(tagName: string, attribs: Record<string, string>) {
      if (!active || tagName !== "code") return { tagName, attribs };
      const code = codes[index++];
      if (!code || Object.keys(code.attribs).length !== Object.keys(attribs).length || Object.entries(code.attribs).some(([key, value]) => attribs[key] !== value))
        throw new NativePreparationLimitation("Bridge cannot bind native code language metadata to this exact rendered code element; original retained.");
      if (code.language === undefined) return { tagName, attribs };
      const classes = (attribs.class ?? "").split(/\s+/u).filter(Boolean);
      const languages = classes.filter(value => value.startsWith("language-") || value.startsWith("lang-"));
      if (languages.some(value => value !== `language-${code.language}` && value !== `lang-${code.language}`))
        throw new NativePreparationLimitation("Native code language markers disagree; Bridge cannot choose a replacement language or diagram identity.");
      if (!languages.length) classes.push(`language-${code.language}`);
      return { tagName, attribs: { ...attribs, class: classes.join(" ") } };
    },
    assertRetained(prepared: string) {
      if (!active) return;
      const actual = new Map<string, number>();
      const inspect = (node: HtmlNode, parent?: HtmlNode) => {
        if (node.name === "code" && parent?.name === "pre") {
          const languages = new Set((node.attribs?.class ?? "").split(/\s+/u).filter(value => value.startsWith("language-") || value.startsWith("lang-")).map(value => value.slice(value.startsWith("language-") ? 9 : 5)));
          for (const language of languages) { const key = identity(language, text(node)); actual.set(key, (actual.get(key) ?? 0) + 1); }
        }
        for (const child of node.children ?? []) inspect(child, node);
      };
      inspect(parseDocument(prepared));
      if ([...required].some(([key, count]) => (actual.get(key) ?? 0) < count)) throw new NativePreparationLimitation("Bridge preparation did not retain actual native code text and language/diagram identity; original retained.");
    },
  };
}

/** Inspect actual copied attributes, not quoted code examples or comments. */
export function hasRelativeCopiedReferences(html: string) {
  const pending = [parseDocument(html)];
  while (pending.length) {
    const node = pending.pop()!;
    const attribute = node.name === "a" ? "href" : node.name === "img" ? "src" : undefined;
    if (attribute && node.attribs && Object.hasOwn(node.attribs, attribute) && !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(node.attribs[attribute])) return true;
    if (node.children) for (const child of node.children) pending.push(child);
  }
  return false;
}

/** Uses the current cleaner's retained link/image attributes, not a new sanitizer. */
export function copiedReferencePreparation(sourceArticleUrl: string) {
  const required = new Map<string, number>();
  const key = (tag: string, attribute: string, value: string) => JSON.stringify([tag, attribute, value]);
  return {
    transform(tagName: string, attribs: Record<string, string>) {
      const attribute = tagName === "a" ? "href" : tagName === "img" ? "src" : undefined;
      if (attribute && Object.hasOwn(attribs, attribute)) {
        const supplied = attribs[attribute];
        let resolved = supplied;
        if (!/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(supplied)) {
          try { resolved = nativeUrl(supplied, sourceArticleUrl).href; }
          catch { throw new NativePreparationLimitation("Bridge preparation cannot resolve a copied reference against the captured source article URL; original retained."); }
        }
        attribs = { ...attribs, [attribute]: resolved };
        const identity = key(tagName, attribute, resolved); required.set(identity, (required.get(identity) ?? 0) + 1);
      }
      return { tagName, attribs };
    },
    assertRetained(prepared: string) {
      const actual = new Map<string, number>(), pending = [parseDocument(prepared)];
      while (pending.length) {
        const node = pending.pop()!;
        const attribute = node.name === "a" ? "href" : node.name === "img" ? "src" : undefined;
        if (attribute && node.attribs && Object.hasOwn(node.attribs, attribute)) { const identity = key(node.name!, attribute, node.attribs[attribute]); actual.set(identity, (actual.get(identity) ?? 0) + 1); }
        if (node.children) for (const child of node.children) pending.push(child);
      }
      if ([...required].some(([identity, count]) => (actual.get(identity) ?? 0) < count)) throw new NativePreparationLimitation("Existing native safety handling cannot preserve a copied link/image target; source retained, no alternative URI or fallback policy selected.");
    },
  };
}
