import https from "node:https";
import { X509Certificate } from "node:crypto";
import { Readable } from "node:stream";
import { cmsUrlAuthority, validateCms } from "../src/private/cms-runtime.mjs";
import { cmsUrl, internationalizedAuthority } from "./native-url.js";

/**
 * Ordinary ASCII URLs keep native fetch. International authorities use pinned
 * HTTPS hostname handling on every runtime: native ICU can reject OR map them
 * differently. A failed network request/mutation is never retried here.
 */
export const cmsFetch: typeof fetch = async (input, init) => {
  const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let native = true;
  try { new URL(address); } catch { native = false; }
  if (native && !(/^https:/iu.test(address) && internationalizedAuthority(address))) return fetch(input, init);
  validateCms("Url", address);
  if (typeof input !== "string" || init?.redirect !== "error" || init.credentials !== "omit"
    || !["GET", "POST"].includes(init.method ?? "GET") || init.body !== undefined && typeof init.body !== "string"
    || (init.method ?? "GET") === "GET" && init.body !== undefined
    || typeof init.body === "string" && Buffer.byteLength(init.body) > 65_536) throw new Error("CMS fixed-domain request requires its existing bounded transport controls.");
  const headers = new Headers(init.headers);
  if (headers.has("cookie") || headers.has("host") || headers.has("authorization") || headers.get("accept-encoding") !== "identity") throw new Error("CMS fixed-domain request headers require attention.");
  const authority = cmsUrlAuthority(address), url = cmsUrl(address);
  const hostname = authority.asciiHost.replace(/^\[|\]$/gu, "");
  const outgoingHeaders: Record<string, string> = Object.create(null);
  headers.forEach((value, name) => { outgoingHeaders[name] = value; });
  if (typeof init.body === "string") outgoingHeaders["content-length"] = String(Buffer.byteLength(init.body));
  const signal = init.signal ?? AbortSignal.timeout(15_000);
  signal.throwIfAborted();
  return new Promise<Response>((resolve, reject) => {
    const request = https.request({
      protocol: "https:", hostname, port: authority.effectivePort,
      path: url.pathname + url.search, method: init.method ?? "GET",
      headers: outgoingHeaders, signal, maxHeaderSize: 16_384,
      // ASCII is a local DNS/SNI/certificate input, NEVER a serialized replacement
      // URL, stored identity, reservation key, request body or ownership receipt.
      servername: hostname, rejectUnauthorized: true,
      // Node's default hostname checker can re-run its own ICU domain policy
      // even for this already-pinned ASCII name. Match the peer certificate
      // with Node/OpenSSL's X509 checker instead; chain/time verification above
      // stays mandatory. No SAN parsing, alternate hostname or trust override.
      checkServerIdentity(name, certificate) {
        try {
          if (name === hostname && new X509Certificate(certificate.raw).checkHost(hostname, {
            subject: "default", wildcards: true, partialWildcards: false,
            multiLabelWildcards: false, singleLabelSubdomains: false,
          }) !== undefined) return;
        } catch { /* Missing/malformed peer certificates fail closed. */ }
        return new Error("CMS fixed-domain certificate hostname does not match.");
      },
    }, incoming => {
      const status = incoming.statusCode ?? 0;
      if (status < 200 || status >= 300 && status < 400) {
        incoming.destroy(); request.destroy(); reject(new Error("CMS fixed-domain response cannot redirect or change protocol.")); return;
      }
      try {
        const responseHeaders = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
        const body = status === 204 || status === 205 ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
        const response = new Response(body, { status, headers: responseHeaders });
        Object.defineProperty(response, "url", { value: address });
        // A bodyless Response cannot expose the underlying stream to callers.
        // Do not drain a peer-controlled 205 transfer after returning body:null.
        if (body === null) { incoming.destroy(); request.destroy(); }
        resolve(response);
      } catch { incoming.destroy(); request.destroy(); reject(new Error("CMS fixed-domain response requires attention.")); }
    });
    request.once("error", () => reject(new Error("CMS fixed-domain HTTPS request failed.")));
    if (init.body !== undefined) request.write(init.body);
    request.end();
  });
};
