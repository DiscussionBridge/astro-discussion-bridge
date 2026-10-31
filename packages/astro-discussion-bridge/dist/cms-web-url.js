import { normalizePublicHttpUrl as corePublicUrl, normalizeServiceBaseUrl as coreServiceUrl, parsePublicDiscourseTopicUrl as coreTopicUrl } from "./web-url.js";
import { cmsServiceBaseUrl, nativeUrl, sameCmsOrigin, internationalizedAuthority } from "./native-url.js";
import { readPublicForumSettings as coreForumSettings, parsePublicForumSettings, PUBLIC_BOOTSTRAP_USER_AGENT } from "./forum-name.js";
import { cmsFetch } from "./cms-fetch.js";
import { publicHtml } from "./cms-verification.js";
import { closeResponse } from "./response-body.js";
export { nativeUrl } from "./native-url.js";
export { cmsFetch } from "./cms-fetch.js";
// Server-side presentation only. Keep the existing browser-safe public helper
// and Simple loader free of the server SDK/HTTPS transport graph.
const surrogate = "https://discussionbridge-presentation-path.invalid";
function nativeSupported(value) { try {
    return new URL(value).href === nativeUrl(value).href;
}
catch {
    return false;
} }
function localPath(value) {
    const url = nativeUrl(value);
    return { url, proxy: surrogate + url.href.slice(url.origin.length) };
}
export function normalizeServiceBaseUrl(value, label) {
    if (nativeSupported(value))
        return coreServiceUrl(value, label);
    const base = cmsServiceBaseUrl(value), proxy = surrogate + base.href.slice(base.origin.length);
    coreServiceUrl(proxy, label); // Retain the existing escaping/base-path rules.
    return base.href.replace(/\/$/u, "");
}
export function normalizePublicHttpUrl(value, label, options = {}) {
    if (nativeSupported(value))
        return corePublicUrl(value, label, options);
    if (new TextEncoder().encode(value).byteLength > 2048)
        throw new Error("Public URL exceeds its existing byte bound.");
    const { url, proxy } = localPath(value);
    const normalized = corePublicUrl(proxy, label, options);
    return url.origin + normalized.slice(surrogate.length);
}
export function parsePublicDiscourseTopicUrl(value, base, label) {
    if (nativeSupported(value) && (base === undefined || nativeSupported(base)))
        return coreTopicUrl(value, base, label);
    const { url, proxy } = localPath(value), service = base === undefined ? undefined : cmsServiceBaseUrl(base);
    if (service && !sameCmsOrigin(value, service.href))
        throw new Error("Discourse topic URL left its configured origin.");
    const parsed = coreTopicUrl(proxy, service === undefined ? undefined : surrogate + service.href.slice(service.origin.length), label);
    return { ...parsed, href: url.origin + parsed.href.slice(surrogate.length),
        serviceBase: (service?.origin ?? url.origin) + parsed.serviceBase.slice(surrogate.length) };
}
export async function readPublicForumSettings(value, fetchImplementation = cmsFetch) {
    if (nativeSupported(value) && !(/^https:/iu.test(value) && internationalizedAuthority(value)))
        return coreForumSettings(value, fetchImplementation);
    const base = cmsServiceBaseUrl(value), controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response;
    try {
        response = await fetchImplementation(base.href, { method: "GET", credentials: "omit", redirect: "error", signal: controller.signal,
            headers: { Accept: "text/html", "Accept-Encoding": "identity", "User-Agent": PUBLIC_BOOTSTRAP_USER_AGENT } });
        if (!response.ok || response.redirected || response.url && (!sameCmsOrigin(response.url, base.href) || !nativeUrl(response.url).pathname.startsWith(base.pathname))
            || response.headers.get("content-type")?.split(";", 1)[0].toLowerCase() !== "text/html")
            throw new Error("Invalid native forum bootstrap.");
        return parsePublicForumSettings(await publicHtml(response, 512 * 1024, controller.signal));
    }
    catch {
        throw new Error("Native source forum title requires configuration attention.");
    }
    finally {
        closeResponse(response, controller);
        clearTimeout(timeout);
    }
}
