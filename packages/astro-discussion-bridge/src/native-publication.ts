import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import sanitizeHtml from "sanitize-html";
import { assertPublicationDirectory, readExistingPublication, atomicWrite, removeOwnedPublication, mkdirDurably } from "./native-files.js";
import { assertNativeMediaPreservedByCurrentRenderer, assertNativeMeaningRetained } from "./native-media.js";
import { captureNativeArticle, completeNativePreparation, copiedReferencePreparation, NativePreparationLimitation, type NativeArticleCapture } from "./native-preparation.js";

function metadata(contents: string): Record<string, unknown> | null {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(contents); if (!header) return null;
  const value: unknown = parseYaml(header[1]); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function bodyDigest(contents: string) { return createHash("sha256").update(contents.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, "")).digest("hex"); }
function sanitize(content: string, sourceArticleUrl: string): NativeArticleCapture {
  const capture = captureNativeArticle(content, sourceArticleUrl, "cooked_html");
  try {
  assertNativeMediaPreservedByCurrentRenderer(content);
  const references = copiedReferencePreparation(sourceArticleUrl);
  const value = sanitizeHtml(content, { allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "h3", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td"]),
    transformTags: { "*": references.transform },
    allowedAttributes: { a: ["href", "title", "rel"], img: ["src", "alt", "title", "width", "height"], code: ["class"], pre: ["class"], div: ["class"], span: ["class"],
      ol: ["start", "reversed", "type"], li: ["value"], th: ["id", "colspan", "rowspan", "scope", "headers", "abbr"], td: ["id", "colspan", "rowspan", "headers"] }, allowedSchemes: ["https"], allowProtocolRelative: false });
  references.assertRetained(value);
  assertNativeMeaningRetained(content, value);
  if (!value.trim()) throw new NativePreparationLimitation("Current Bridge preparation cannot emit this article with its existing native writer; original retained and no true-absence/content-validity decision made.");
  return completeNativePreparation(capture, content, value);
  } catch (error) {
    const limitation = error instanceof NativePreparationLimitation ? error : new NativePreparationLimitation("Bridge could not prepare the complete native article; original retained and no replacement recipe selected.");
    limitation.capture = capture; throw limitation;
  }
}
/** Native file/rendering owner only. The sole V4 coordinator supplies transport. */
export const nativePublicationFiles = Object.freeze({ assertDirectory: assertPublicationDirectory, readExisting: readExistingPublication,
  metadata, bodyDigest, write: atomicWrite, remove: removeOwnedPublication, sanitize, mkdir: mkdirDurably });
