import { cmsUrlAuthority, validateCms } from "../src/private/cms-runtime.mjs";
const pathOrigin = "https://discussionbridge-url-path.invalid";
export function internationalizedAuthority(value) {
    const raw = /^[a-z][a-z\d+.-]*:\/\/([^/?#]+)/iu.exec(value)?.[1];
    if (raw === undefined)
        return false;
    let decoded;
    try {
        decoded = decodeURIComponent(raw);
    }
    catch {
        return true;
    }
    return /[^\x00-\x7f]|(?:^|\.)xn--/iu.test(decoded);
}
function canonicalIpOrDomain(host) {
    const last = host.replace(/\.$/u, "").split(".").at(-1);
    if (host.startsWith("[") || /^(?:\d+|0x[\da-f]*)$/iu.test(last))
        return new URL(`https://${host}/`).hostname;
    return host;
}
function fixedParts(value) {
    // Only the host needs pinned Unicode data. Native URL remains the path/query
    // implementation; its placeholder authority is never sent or persisted.
    const fragment = value.indexOf("#"), withoutFragment = fragment < 0 ? value : value.slice(0, fragment);
    const authority = cmsUrlAuthority(withoutFragment);
    const match = /^(https:\/\/[^/?#]+)(.*)$/iu.exec(value);
    // This is the existing DERIVED origin/route serialization, not a replacement
    // for value, any original wire URL or a retained state/receipt. Using one
    // pinned hostname also prevents newer native parsers selecting another DNS
    // name, or changing this derived scope merely because Node was upgraded.
    const origin = `https://${canonicalIpOrDomain(authority.asciiHost)}${authority.effectivePort === 443 ? "" : ":" + authority.effectivePort}`;
    return { origin, path: new URL(pathOrigin + (match[2] || "/")) };
}
function withAuthority(origin, path) {
    return {
        get href() { return origin + path.href.slice(pathOrigin.length); },
        origin, protocol: "https:", username: "", password: "",
        get pathname() { return path.pathname; }, set pathname(value) { path.pathname = value; },
        get search() { return path.search; }, get hash() { return path.hash; },
        get searchParams() { return path.searchParams; },
        toString() { return this.href; },
    };
}
/**
 * Preserve ordinary native serialization. International domains use the pinned
 * authority for DERIVED origins/routes on every runtime, not native ICU data.
 * Original wire URLs and retained identities are never rewritten by this view.
 */
export function nativeUrl(value, base) {
    const baseValue = typeof base === "string" ? base : base?.href;
    if (/^https:/iu.test(value) && internationalizedAuthority(value)) {
        const parts = fixedParts(value);
        return withAuthority(parts.origin, parts.path);
    }
    if (baseValue !== undefined && /^https:/iu.test(baseValue) && internationalizedAuthority(baseValue) && !/^[a-z][a-z\d+.-]*:/iu.test(value)) {
        const parts = fixedParts(baseValue);
        if (value.startsWith("//"))
            return nativeUrl("https:" + value);
        const resolved = new URL(value, parts.path);
        return resolved.origin === pathOrigin ? withAuthority(parts.origin, resolved) : nativeUrl(resolved.href);
    }
    if (baseValue !== undefined && /^https:/iu.test(baseValue) && value.startsWith("//") && internationalizedAuthority("https:" + value))
        return nativeUrl("https:" + value);
    try {
        return new URL(value, baseValue);
    }
    catch (nativeError) {
        if (/^[a-z][a-z\d+.-]*:/iu.test(value)) {
            // An absolute ordinary URL does not inherit an unsupported base host.
            if (baseValue !== undefined) {
                try {
                    return new URL(value);
                }
                catch { /* fixed admission below */ }
            }
            const parts = fixedParts(value);
            return withAuthority(parts.origin, parts.path);
        }
        if (baseValue === undefined)
            throw nativeError;
        const parts = fixedParts(baseValue);
        if (value.startsWith("//"))
            return nativeUrl("https:" + value);
        const resolved = new URL(value, parts.path);
        if (resolved.origin !== pathOrigin)
            return nativeUrl(resolved.href);
        return withAuthority(parts.origin, resolved);
    }
}
/** Strict wire admission precedes any local component or origin work. */
export function cmsUrl(value) { validateCms("Url", value); return nativeUrl(value); }
export function cmsServiceBaseUrl(value) {
    const url = cmsUrl(value);
    if (url.search || url.hash)
        throw new Error("CMS service base requires an HTTPS URL without query or fragment.");
    url.pathname = url.pathname.replace(/\/+$/u, "") + "/";
    return url;
}
export function cmsOrigin(value) {
    const url = cmsUrl(value);
    if (url.pathname !== "/" || url.search || url.hash)
        throw new Error("CMS configuration requires an HTTPS origin.");
    return url.origin;
}
function comparisonHost(value) {
    const { asciiHost } = cmsUrlAuthority(value);
    // Preserve the existing native IPv4/IPv6 equivalence, not a second domain
    // validation policy. All other domains compare by the pinned IDNA result.
    return canonicalIpOrDomain(asciiHost);
}
export function sameCmsOrigin(left, right) {
    return cmsUrlAuthority(left).effectivePort === cmsUrlAuthority(right).effectivePort && comparisonHost(left) === comparisonHost(right);
}
