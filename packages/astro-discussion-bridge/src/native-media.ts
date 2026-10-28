import { createRequire } from "node:module";
import { NativePreparationLimitation } from "./native-preparation.js";

// Inspect actual elements using the parser already supplied by the declared
// sanitizer. This inspection does not sanitize, rewrite or admit any markup.
const sanitizerRequire = createRequire(createRequire(import.meta.url).resolve("sanitize-html"));
interface NativeHtmlNode { name?: string; type: string; data?: string; attribs?: Record<string, string>; children?: NativeHtmlNode[] }
const { parseDocument } = sanitizerRequire("htmlparser2") as { parseDocument(value: string): NativeHtmlNode };
const unsupportedElements = new Set(["video", "audio", "source", "track", "iframe", "object", "embed"]);
const textContent = (node: NativeHtmlNode): string => node.data ?? (node.children ?? []).map(textContent).join("");

/** Explicit native capability boundary while the preservation recipe is unsettled. */
export class NativeMediaUnsupportedError extends NativePreparationLimitation {
  constructor() { super("Native media preservation requires a supported source/native recipe; audio/video/provider media cannot be silently discarded. This is a Bridge preparation limitation; underlying source is retained."); }
}
export function assertNativeMediaPreservedByCurrentRenderer(renderedHtml: string) {
  const pending = [parseDocument(renderedHtml)];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.name === "script" && (textContent(node).trim() || node.attribs?.src)) {
      const type = node.attribs?.type?.trim().toLowerCase();
      const kind = type === "application/json" || type === "application/ld+json" ? `article DATA (${type})`
        : !type || type === "module" || type === "text/javascript" || type === "application/javascript" ? "article script FUNCTION"
        : `article script content (declared type ${type})`;
      throw new NativePreparationLimitation(`Current portable cleaner would discard ${kind}; no supported equivalent is bound. Original retained; the operator must decide this specific loss before publication.`);
    }
    if (node.type === "tag") {
      const handler = Object.entries(node.attribs ?? {}).find(([name, value]) => /^on[a-z]+$/u.test(name) && value.trim());
      if (handler) throw new NativePreparationLimitation(`Current portable cleaner would discard the ${handler[0]} handler FUNCTION on ${node.name}; no supported native equivalent is bound. Original retained for operator decision.`);
    }
    if (node.type === "tag" && node.name && unsupportedElements.has(node.name)) throw new NativeMediaUnsupportedError();
    if (node.type === "tag" && node.name === "img" && node.attribs?.srcset?.trim()) throw new NativePreparationLimitation("The existing native cleaner cannot retain responsive image source candidates; original article remains valid and retained, with no selected replacement media recipe.");
    if (node.children) for (const child of node.children) pending.push(child);
  }
}

// Observe what the existing cleaner actually changed. These structures carry
// native interaction, drawing, CSS content or numbering; this is neither a new
// markup admission policy nor a replacement execution/rendering recipe.
const nativeStructures = new Set(["form", "input", "button", "select", "option", "optgroup", "textarea", "fieldset", "legend", "label", "output", "datalist", "meter", "progress", "details", "summary", "map", "area", "svg", "canvas"]);
function semanticMarkup(node: NativeHtmlNode): unknown {
  if (node.type === "text") return node.data ?? "";
  if (!node.name) return null;
  return [node.name, Object.entries(node.attribs ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    (node.children ?? []).filter(child => child.type !== "comment").map(semanticMarkup)];
}
function nativeMeaning(html: string, nativeCodeIdentityVerified: boolean) {
  const values: { identity: string; detail: string }[] = [];
  const add = (identity: unknown, detail: string) => values.push({ identity: JSON.stringify(identity), detail });
  const pending = [{ node: parseDocument(html), codeDecoration: false }];
  while (pending.length) {
    const current = pending.pop()!, node = current.node, name = node.name, attributes = node.attribs ?? {};
    const codeDecoration = current.codeDecoration || nativeCodeIdentityVerified && name === "pre" && /(?:^|\s)astro-code(?:\s|$)/u.test(attributes.class ?? "")
      && Boolean(attributes["data-language"]?.trim()) && (node.children ?? []).some(child => child.name === "code");
    if (name && nativeStructures.has(name)) {
      const detail = name === "svg" || name === "canvas" ? `native ${name} drawing` : `native ${name} form/control structure`;
      add(["structure", semanticMarkup(node)], detail);
    }
    if (name === "style" || name === "link" && /(?:^|\s)stylesheet(?:\s|$)/iu.test(attributes.rel ?? ""))
      add(["stylesheet", semanticMarkup(node)], "native CSS/style content or dependency");
    // The established native-code recipe keeps exact decoded code/language and
    // intentionally normalizes Shiki's coloring/scroll decoration. Do not turn
    // that known transformation into a new content limitation. Any additional
    // declaration (including generated content/layout/visibility) stays observed.
    const style = attributes.style ?? "";
    const knownCodeDecoration = codeDecoration && style.split(";").map(value => value.trim()).filter(Boolean)
      .every(value => /^(?:(?:background-color|color)\s*:\s*#[0-9a-f]{3,8}|overflow-x\s*:\s*auto)$/iu.test(value));
    if (name && style.trim() && !knownCodeDecoration)
      add(["inline-style", name, attributes.style, textContent(node)], `native inline CSS/style on ${name}`);
    const passive = name === "ol" ? ["start", "reversed", "type"] : name === "li" ? ["value"]
      : name === "th" ? ["id", "colspan", "rowspan", "scope", "headers", "abbr"] : name === "td" ? ["id", "colspan", "rowspan", "headers"] : [];
    for (const attribute of passive) if (Object.hasOwn(attributes, attribute))
      add(["passive-meaning", name, attribute, attribute === "reversed" ? true : attributes[attribute], textContent(node)],
        name === "ol" || name === "li" ? `native list numbering (${name} ${attribute})` : `native table meaning (${name} ${attribute})`);
    if (node.children) for (const child of node.children) pending.push({ node: child, codeDecoration });
  }
  return values;
}

/** Compare actual native meaning with the actual existing cleaner output. */
export function assertNativeMeaningRetained(renderedHtml: string, preparedHtml: string, nativeCodeIdentityVerified = false) {
  const actual = new Map<string, number>();
  for (const { identity } of nativeMeaning(preparedHtml, nativeCodeIdentityVerified)) actual.set(identity, (actual.get(identity) ?? 0) + 1);
  for (const { identity, detail } of nativeMeaning(renderedHtml, nativeCodeIdentityVerified)) {
    const count = actual.get(identity) ?? 0;
    if (!count) throw new NativePreparationLimitation(`Current portable cleaner changed or discarded ${detail}; no supported equivalent is bound. Original retained; the operator must decide this specific loss before publication.`);
    actual.set(identity, count - 1);
  }
}
