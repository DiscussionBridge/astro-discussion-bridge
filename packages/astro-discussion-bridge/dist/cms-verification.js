import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { validateCms } from "../src/private/cms-runtime.mjs";
import { sameCmsOrigin } from "./native-url.js";
import { cmsFetch } from "./cms-fetch.js";
import { closeResponse, readBoundedResponseBytes } from "./response-body.js";
// Use the parser declared by the existing pinned production sanitizer, not a
// dev-only hoisted parser or an added installed dependency.
const sanitizerRequire = createRequire(createRequire(import.meta.url).resolve("sanitize-html"));
const { parseDocument } = sanitizerRequire("htmlparser2");
export const ASTRO_VERIFICATION_PROFILE = "discussionbridge-astro-static-html-1";
export const ASTRO_MOVE_VERIFICATION_PROFILE = "discussionbridge-astro-static-html-move-1";
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const nodes = (root) => {
    const output = [];
    const pending = [root];
    while (pending.length) {
        const node = pending.pop();
        output.push(node);
        for (let index = (node.children?.length ?? 0) - 1; index >= 0; index--)
            pending.push(node.children[index]);
    }
    return output;
};
const textOf = (node) => node.data ?? (node.children ?? []).map(textOf).join("");
function fragment(html, node) {
    if (typeof node.startIndex !== "number" || typeof node.endIndex !== "number")
        throw new Error("CMS rendered fragment boundaries require attention.");
    return html.slice(node.startIndex, node.endIndex + 1);
}
function ownedArticle(html, expected) {
    const document = parseDocument(html, { decodeEntities: true, withStartIndices: true, withEndIndices: true });
    const owners = nodes(document).filter(node => node.name === "article" && node.attribs?.["data-discussionbridge-cms-native"] === expected.nativeId);
    if (owners.length !== 1)
        throw new Error("CMS rendered native ownership is missing or ambiguous.");
    const owner = owners[0];
    if (owner.attribs?.["data-discussionbridge-cms-resource"] !== expected.resourceId || owner.attribs?.["data-discussionbridge-cms-revision"] !== expected.source.source_revision || owner.attribs?.["data-discussionbridge-cms-mode"] !== expected.mode)
        throw new Error("CMS rendered native identity/revision/mode requires attention.");
    const members = nodes(owner);
    if (expected.move) {
        validateCms("UUID", expected.move.moveId);
        validateCms("PublicNonce", expected.move.nonce);
        validateCms("Sha256", expected.move.ownershipSha256);
        if (owner.attribs?.["data-discussionbridge-cms-canonical"] !== expected.url || owner.attribs?.["data-discussionbridge-cms-move"] !== expected.move.moveId
            || owner.attribs?.["data-discussionbridge-cms-nonce"] !== expected.move.nonce || owner.attribs?.["data-discussionbridge-cms-ownership"] !== expected.move.ownershipSha256)
            throw new Error("CMS actual owned URL move receipt/nonce is missing or differs.");
    }
    const headings = members.filter(node => node.name === "h1" && Object.hasOwn(node.attribs ?? {}, "data-discussionbridge-cms-title"));
    if (headings.length !== 1 || textOf(headings[0]) !== expected.source.title)
        throw new Error("CMS actual source title does not match the prepared publication.");
    const content = members.filter(node => node.attribs?.["data-discussionbridge-cms-content"] === expected.resourceId);
    if (content.length !== 1)
        throw new Error("CMS complete owned content fragment is missing or ambiguous.");
    const presentations = members.filter(node => node.name === "section" && node.attribs?.["data-discussionbridge-mode"] === expected.mode);
    if (presentations.length !== 1)
        throw new Error("CMS configured native discussion presentation is missing.");
    const presentation = presentations[0];
    if (expected.mode === "simple") {
        if (presentation.attribs?.["data-topic-id"] !== expected.source.topic_id || !Object.hasOwn(presentation.attribs, "data-discussionbridge-simple"))
            throw new Error("CMS actual Simple topic presentation requires attention.");
    }
    else {
        const scripts = members.filter(node => node.name === "script" && textOf(node).includes("window.DiscourseEmbed") && textOf(node).includes("javascripts/embed.js"));
        const variable = (name) => {
            if (scripts.length !== 1)
                return undefined;
            const value = new RegExp(`\\bconst\\s+${name}\\s*=\\s*("(?:\\\\.|[^"\\\\])*"|[0-9]+|true|false)\\s*;`, "u").exec(textOf(scripts[0]))?.[1];
            return value === undefined ? undefined : JSON.parse(value);
        };
        if (presentation.attribs?.["data-discussionbridge-topic-id"] !== expected.source.topic_id || !sameCmsOrigin(presentation.attribs?.["data-discussionbridge-discourse-url"] ?? "", expected.source.topic_url)
            || !nodes(presentation).some(node => node.name === "div" && node.attribs?.id === "discourse-comments")
            || String(variable("resolvedTopicId")) !== expected.source.topic_id || variable("fullApp") !== (expected.mode === "interactive")
            || typeof variable("discourseUrl") !== "string" || !sameCmsOrigin(variable("discourseUrl"), expected.source.topic_url))
            throw new Error("CMS actual embed/composer presentation requires attention.");
    }
    const bytes = fragment(html, owner);
    if (!/<\/article\s*>$/iu.test(bytes))
        throw new Error("CMS owned rendered fragment is incomplete.");
    return { publication: bytes, content: fragment(html, content[0]) };
}
export async function verifyCmsPublication(expected, deployment, fetchImplementation = cmsFetch) {
    validateCms("Source", expected.source);
    validateCms("Instant", expected.preparedAt);
    validateCms("Instant", deployment.deployedAt);
    validateCms("OpaqueId", deployment.deploymentId);
    const prepared = ownedArticle(expected.builtHtml, expected);
    const processor = await createMarkdownProcessor();
    const rendered = await processor.render(expected.stagedMarkdownBody);
    const contentDocument = parseDocument(rendered.code, { decodeEntities: true, withStartIndices: true, withEndIndices: true });
    const sourceContent = nodes(contentDocument).filter(node => node.attribs?.["data-discussionbridge-cms-content"] === expected.resourceId);
    if (sourceContent.length !== 1 || sha256(prepared.content) !== sha256(fragment(rendered.code, sourceContent[0])))
        throw new Error("CMS actual native build did not render the complete prepared content.");
    // This budget grows with the actual expected native artifact. It is not a
    // metadata JSON bound or a whole-publication size policy. No truncation.
    const maximum = Buffer.byteLength(expected.builtHtml, "utf8") * 2 + 65_536;
    const request = await publicResponse(expected.url, fetchImplementation);
    const response = request.response;
    try {
        if (response.status !== 200 || !/^text\/html(?:\s*;.*)?$/iu.test(response.headers.get("content-type") ?? ""))
            throw new Error("CMS canonical public HTML is unavailable.");
        const actual = ownedArticle(await publicHtml(response, maximum, request.controller.signal), expected);
        const nativeHash = sha256(actual.publication);
        if (nativeHash !== sha256(prepared.publication))
            throw new Error("CMS actual public rendered fragment differs from the prepared build.");
        const checkedAt = new Date().toISOString();
        if (Date.parse(checkedAt) < Math.max(Date.parse(expected.preparedAt), Date.parse(deployment.deployedAt)))
            throw new Error("CMS actual verification clock precedes preparation/deployment.");
        return validateCms("PublishedVerification", { kind: "published", url: expected.url, native_id: expected.nativeId, source_revision: expected.source.source_revision,
            source_content_sha256: expected.source.content_sha256, native_publication_sha256: nativeHash, verification_profile: expected.move ? ASTRO_MOVE_VERIFICATION_PROFILE : ASTRO_VERIFICATION_PROFILE, checked_at: checkedAt,
            representation: { kind: "full", source_content_sha256: expected.source.content_sha256 } });
    }
    finally {
        closeResponse(response, request.controller);
        clearTimeout(request.timeout);
    }
}
export async function verifyCmsAbsence(url, nativeId, preparedAt, deployment, fetchImplementation = cmsFetch) {
    validateCms("Instant", preparedAt);
    validateCms("Instant", deployment.deployedAt);
    validateCms("OpaqueId", deployment.deploymentId);
    const request = await publicResponse(url, fetchImplementation);
    const response = request.response;
    try {
        if (![404, 410].includes(response.status))
            throw new Error("CMS owned public absence requires404 or410.");
        const checkedAt = new Date().toISOString();
        if (Date.parse(checkedAt) < Math.max(Date.parse(preparedAt), Date.parse(deployment.deployedAt)))
            throw new Error("CMS actual absence verification clock precedes preparation/deployment.");
        return validateCms("AbsentVerification", { kind: "absent", url, native_id: nativeId, checked_at: checkedAt, http_status: response.status });
    }
    finally {
        closeResponse(response, request.controller);
        clearTimeout(request.timeout);
    }
}
export async function publicResponse(url, fetchImplementation) {
    validateCms("Url", url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response;
    try {
        response = await fetchImplementation(url, { method: "GET", credentials: "omit", redirect: "error", signal: controller.signal, headers: { Accept: "text/html", "Accept-Encoding": "identity" } });
        if (response.redirected || response.status >= 300 && response.status < 400 || response.url && response.url !== url)
            throw new Error("CMS public verification rejects redirects or another canonical URL.");
        return { response, controller, timeout };
    }
    catch (error) {
        closeResponse(response, controller);
        clearTimeout(timeout);
        throw error;
    }
}
export async function publicHtml(response, maximum, signal) {
    if (!Number.isSafeInteger(maximum) || maximum < 0 || !response.body)
        throw new Error("CMS expected native artifact budget is unavailable.");
    return new TextDecoder("utf-8", { fatal: true }).decode(await readBoundedResponseBytes(response, maximum, signal, { canonicalContentLength: true }));
}
