import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
const issued = new WeakMap();
export const nativeRenderHash = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const hashPattern = /^[a-f0-9]{64}$/u;
const { parseDocument } = createRequire(createRequire(import.meta.url).resolve("sanitize-html"))("htmlparser2");
function removeControls(html, controls) {
    let result = html;
    for (const control of [...controls].reverse())
        result = result.slice(0, control.start) + result.slice(control.end);
    return result;
}
export function validateNativePresentation(value, html) {
    if (!value || value.version !== 1 || value.recipe !== "starlight-heading-controls-1" || typeof value.nativeFile !== "string" || !path.isAbsolute(value.nativeFile)
        || ![value.originalMarkdownSha256, value.originalKey, value.producerKey, value.artifactSha256, value.fullHtmlSha256, value.portableHtmlSha256].every(item => typeof item === "string" && hashPattern.test(item))
        || !Array.isArray(value.controls) || nativeRenderHash(html) !== value.fullHtmlSha256)
        throw new Error("Native presentation evidence requires reconciliation.");
    const anchors = new Map(), pending = [parseDocument(html, { withStartIndices: true, withEndIndices: true })];
    while (pending.length) {
        const node = pending.pop();
        if (node.name === "a" && typeof node.startIndex === "number")
            anchors.set(node.startIndex, node);
        for (const child of node.children ?? [])
            pending.push(child);
    }
    let end = 0;
    for (const control of value.controls) {
        const node = anchors.get(control.start);
        if (!Number.isSafeInteger(control.start) || !Number.isSafeInteger(control.end) || control.start < end || control.end <= control.start || control.end > html.length
            || typeof control.sha256 !== "string" || !hashPattern.test(control.sha256) || nativeRenderHash(html.slice(control.start, control.end)) !== control.sha256
            || !node || node.endIndex + 1 !== control.end || !node.attribs?.href?.startsWith("#") || node.attribs.href.length < 2)
            throw new Error("Native control range differs from its exact rendered anchor.");
        end = control.end;
    }
    if (nativeRenderHash(removeControls(html, value.controls)) !== value.portableHtmlSha256)
        throw new Error("Native portable projection differs from its witnessed control ranges.");
}
/** SDK-private issuance, called only after actual registered producer validation. */
export function issueNativeRenderedArticle(html, source) {
    const evidence = { ...structuredClone(source), version: 1, recipe: "starlight-heading-controls-1",
        fullHtmlSha256: nativeRenderHash(html), portableHtmlSha256: nativeRenderHash(removeControls(html, source.controls)) };
    validateNativePresentation(evidence, html);
    const handle = Object.freeze({ kind: "native-rendered-article" });
    issued.set(handle, { html, evidence });
    return handle;
}
function view(value) {
    const result = value && issued.get(value);
    if (!result)
        throw new Error("Native render was not issued by the registered SDK producer.");
    validateNativePresentation(result.evidence, result.html);
    return result;
}
export function fullNativeHtml(value) { return typeof value === "string" ? value : view(value).html; }
export function portableNativeHtml(value) { return typeof value === "string" ? value : removeControls(view(value).html, view(value).evidence.controls); }
export function nativePresentation(value) { return typeof value === "string" ? undefined : structuredClone(view(value).evidence); }
export function nativeControlStarts(value) { return new Set(typeof value === "string" ? [] : view(value).evidence.controls.map(control => control.start)); }
export function assertNativeRenderSource(value, file, originalMarkdown) {
    if (typeof value === "string")
        return;
    const { evidence } = view(value);
    if (path.resolve(evidence.nativeFile) !== path.resolve(file) || evidence.originalMarkdownSha256 !== nativeRenderHash(originalMarkdown))
        throw new Error("Native renderer evidence belongs to another physical article.");
}
/** Existing copied-reference edits may touch authored markup, never proven UI. */
export function editNativeRenderedArticle(value, edits) {
    const html = fullNativeHtml(value), evidence = nativePresentation(value);
    let boundary = html.length, result = html;
    for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
        if (!Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) || edit.start < 0 || edit.end <= edit.start || edit.end > boundary
            || typeof edit.value !== "string" || evidence?.controls.some(control => edit.start < control.end && edit.end > control.start))
            throw new Error("Native reference edits overlap a witnessed control or another edit.");
        result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
        boundary = edit.start;
    }
    if (!evidence)
        return result;
    const offset = (position) => edits.filter(edit => edit.end <= position).reduce((sum, edit) => sum + edit.value.length - (edit.end - edit.start), position);
    return issueNativeRenderedArticle(result, { ...evidence, controls: evidence.controls.map(control => ({ ...control, start: offset(control.start), end: offset(control.end) })) });
}
