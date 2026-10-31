import https from "node:https";
import { Readable } from "node:stream";
import { cmsUrlAuthority, validateCms } from "../src/private/cms-runtime.mjs";
import { cmsUrl, internationalizedAuthority } from "./native-url.js";
/**
 * Ordinary ASCII URLs keep native fetch. International authorities use pinned
 * HTTPS hostname handling on every runtime: native ICU can reject OR map them
 * differently. A failed network request/mutation is never retried here.
 */
export const cmsFetch = async (input, init) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let native = true;
    try {
        new URL(address);
    }
    catch {
        native = false;
    }
    if (native && !(/^https:/iu.test(address) && internationalizedAuthority(address)))
        return fetch(input, init);
    validateCms("Url", address);
    if (typeof input !== "string" || init?.redirect !== "error" || init.credentials !== "omit"
        || !["GET", "POST"].includes(init.method ?? "GET") || init.body !== undefined && typeof init.body !== "string"
        || (init.method ?? "GET") === "GET" && init.body !== undefined
        || typeof init.body === "string" && Buffer.byteLength(init.body) > 65_536)
        throw new Error("CMS fixed-domain request requires its existing bounded transport controls.");
    const headers = new Headers(init.headers);
    if (headers.has("cookie") || headers.has("host") || headers.has("authorization") || headers.get("accept-encoding") !== "identity")
        throw new Error("CMS fixed-domain request headers require attention.");
    const authority = cmsUrlAuthority(address), url = cmsUrl(address);
    const hostname = authority.asciiHost.replace(/^\[|\]$/gu, "");
    const outgoingHeaders = Object.create(null);
    headers.forEach((value, name) => { outgoingHeaders[name] = value; });
    if (typeof init.body === "string")
        outgoingHeaders["content-length"] = String(Buffer.byteLength(init.body));
    const signal = init.signal ?? AbortSignal.timeout(15_000);
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const request = https.request({
            protocol: "https:", hostname, port: authority.effectivePort,
            path: url.pathname + url.search, method: init.method ?? "GET",
            headers: outgoingHeaders, signal, maxHeaderSize: 16_384,
            // ASCII is a local DNS/SNI/certificate input, NEVER a serialized replacement
            // URL, stored identity, reservation key, request body or ownership receipt.
            servername: hostname, rejectUnauthorized: true,
        }, incoming => {
            const status = incoming.statusCode ?? 0;
            if (status < 200 || status >= 300 && status < 400) {
                incoming.destroy();
                request.destroy();
                reject(new Error("CMS fixed-domain response cannot redirect or change protocol."));
                return;
            }
            try {
                const responseHeaders = new Headers();
                for (let index = 0; index < incoming.rawHeaders.length; index += 2)
                    responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
                const body = status === 204 || status === 205 ? null : Readable.toWeb(incoming);
                if (body === null)
                    incoming.resume();
                const response = new Response(body, { status, headers: responseHeaders });
                Object.defineProperty(response, "url", { value: address });
                resolve(response);
            }
            catch {
                incoming.destroy();
                reject(new Error("CMS fixed-domain response requires attention."));
            }
        });
        request.once("error", () => reject(new Error("CMS fixed-domain HTTPS request failed.")));
        if (init.body !== undefined)
            request.write(init.body);
        request.end();
    });
};
