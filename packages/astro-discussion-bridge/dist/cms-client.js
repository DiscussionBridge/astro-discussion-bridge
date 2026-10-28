import * as runtime from "../src/private/cms-runtime.mjs";
import { createHash } from "node:crypto";
import { validateCms } from "../src/private/cms-runtime.mjs";
import { resolveServerSecret } from "./server-secret.js";
export class CmsRequestError extends Error {
    code;
    retryable;
    retryAfterSeconds;
    routeId;
    httpStatus;
    constructor(code, retryable, retryAfterSeconds, routeId, httpStatus) {
        super(`DiscussionBridge CMS request rejected: ${code}.`);
        this.code = code;
        this.retryable = retryable;
        this.retryAfterSeconds = retryAfterSeconds;
        this.routeId = routeId;
        this.httpStatus = httpStatus;
    }
}
const validatedErrorResponses = new WeakMap();
/** Only an actual codec-validated response from this client's exact request. */
export function validatedCmsErrorResponse(error, client, routeId, body) {
    const known = error instanceof Error ? validatedErrorResponses.get(error) : undefined;
    if (known?.client !== client || known.response.routeId !== routeId || known.response.requestSha256 !== createHash("sha256").update(runtime.semanticIdentity(body)).digest("hex"))
        return undefined;
    return structuredClone(known.response);
}
/** Single current V4 closed-schema transport. */
export class CmsClient {
    options;
    origin;
    credentials;
    fetchImplementation;
    constructor(options) {
        this.options = options;
        validateCms("ConnectionId", options.connectionId);
        validateCms("Url", options.serverUrl);
        const origin = new URL(options.serverUrl);
        if (origin.pathname !== "/" || origin.search)
            throw new Error("CMS service configuration requires an HTTPS origin.");
        this.origin = origin.origin;
        this.credentials = resolveServerSecret(options);
        this.fetchImplementation = options.fetchImplementation ?? fetch;
    }
    async request(id, input = {}) {
        const codec = runtime;
        codec.validateCmsRoute(id, input);
        const route = codec.cmsSchema.routes.find(item => item.id === id);
        const pathname = route.path.replace(/\{([^}]+)\}/gu, (_, field) => encodeURIComponent(input.path[field]));
        const url = new URL(pathname, this.origin);
        for (const [key, value] of Object.entries(input.query ?? {}))
            url.searchParams.set(key, String(value));
        const body = input.body === undefined ? undefined : codec.semanticIdentity(input.body);
        if (body !== undefined && Buffer.byteLength(body) > 65_536)
            throw new Error("CMS request exceeds its JSON transport bound.");
        const credentials = await this.credentials;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        let validatedRejection;
        try {
            const response = await this.fetchImplementation(url.href, {
                method: route.method, body, redirect: "error", credentials: "omit", signal: controller.signal,
                headers: { Accept: "application/json", "Accept-Encoding": "identity", ...(body === undefined ? {} : { "Content-Type": "application/json" }),
                    "X-DiscussionBridge-Connection": this.options.connectionId, "X-DiscussionBridge-Secret": credentials.connectionSecret },
            });
            if (response.redirected || response.status >= 300 && response.status < 400 || response.url && new URL(response.url).origin !== this.origin)
                throw new Error("CMS service response requires origin attention.");
            if (response.status === 204) {
                const bytes = await readBounded(response, 0, controller.signal);
                if (bytes.length)
                    throw new Error("CMS bodyless response contained bytes.");
                return codec.validateCmsResponse(id, undefined, response.status);
            }
            if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:UTF-8|"UTF-8"))?\s*$/iu.test(response.headers.get("content-type") ?? ""))
                throw new Error("CMS service response requires JSON media attention.");
            const maximum = route.response === "ContentChunk" ? 65_536 : 262_144;
            const value = codec.parseCmsJson(await readBounded(response, maximum, controller.signal), { maximumBytes: maximum });
            codec.validateCmsResponse(id, value, response.status);
            if (!route.success_http.includes(response.status)) {
                if (id === "V4-02" && value.outcome === "reconciliation_required") {
                    validatedRejection = new CmsRequestError("reconciliation_required", false, null, id, response.status);
                    throw validatedRejection;
                }
                const rejected = value;
                validatedRejection = new CmsRequestError(rejected.code, rejected.retryable, rejected.retry_after_seconds, id, response.status);
                validatedErrorResponses.set(validatedRejection, { client: this, response: { routeId: id, httpStatus: response.status, requestSha256: createHash("sha256").update(body ?? "").digest("hex"),
                        candidateId: runtime.candidateId, schemaSha256: runtime.cmsSchemaIdentity.sha256, contractSha256: runtime.specIdentity.sha256,
                        envelope: structuredClone(value) } });
                throw validatedRejection;
            }
            return value;
        }
        catch (error) {
            if (validatedRejection && error === validatedRejection)
                throw error;
            if (controller.signal.aborted)
                throw new CmsRequestError("transport_timeout", true, null);
            // Native fetch/parser errors may include credentials or untrusted URLs.
            throw new Error("DiscussionBridge CMS transport or typed response requires attention.");
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async connection() {
        const connection = await this.request("V4-01");
        if (connection.connection_id !== this.options.connectionId)
            throw new Error("CMS connection response requires exact configured scope.");
        return connection;
    }
    resolveTo(body) { return this.request("V4-02", { body }); }
    records(cursor) { return this.request("V4-03", { query: cursor === undefined ? {} : { cursor } }); }
    record(resourceId) { return this.request("V4-04", { path: { resource_id: resourceId } }); }
    withdrawRecord(resourceId, body) {
        return this.request("V4-05", { path: { resource_id: resourceId }, body });
    }
    prepareSourceUrlMove(resourceId, body) { return this.request("V4-28", { path: { resource_id: resourceId }, body }); }
    finalizeSourceUrlMove(resourceId, moveId, body) { return this.request("V4-29", { path: { resource_id: resourceId, move_id: moveId }, body }); }
    abortSourceUrlMove(resourceId, moveId, body) { return this.request("V4-30", { path: { resource_id: resourceId, move_id: moveId }, body }); }
    sourceUrlHistory(resourceId, cursor) { return this.request("V4-31", { path: { resource_id: resourceId }, query: cursor === undefined ? {} : { cursor } }); }
    sources(stream, cursor) {
        return this.request("V4-06", { query: { stream, ...(cursor === undefined ? {} : { cursor }) } });
    }
    claim(mutationId, mappingId) {
        return this.request("V4-13", { body: { mutation_id: mutationId, ...(mappingId === undefined ? {} : { mapping_id: mappingId }) } });
    }
    query(workId) { return this.request("V4-14", { path: { work_id: workId } }); }
    prepareUrlMove(mappingId, body) { return this.request("V4-21", { path: { mapping_id: mappingId }, body }); }
    finalizeUrlMove(mappingId, moveId, body) { return this.request("V4-22", { path: { mapping_id: mappingId, move_id: moveId }, body }); }
    abortUrlMove(mappingId, moveId, body) { return this.request("V4-23", { path: { mapping_id: mappingId, move_id: moveId }, body }); }
    renew(mutationId, authority) {
        return this.request("V4-15", { path: { work_id: authority.work_id }, body: { mutation_id: mutationId, authority } });
    }
    async content(source) {
        validateCms("Source", source);
        const chunks = [];
        let offset = 0;
        const hash = createHash("sha256");
        for (;;) {
            const chunk = await this.request("V4-07", {
                path: { source_id: source.source_id, source_revision: source.source_revision }, query: { offset },
            });
            if (chunk.source_id !== source.source_id || chunk.source_revision !== source.source_revision || chunk.content_sha256 !== source.content_sha256 || chunk.content_bytes !== source.content_bytes || chunk.offset !== offset)
                throw new Error("CMS source content identity requires attention.");
            const bytes = Buffer.from(chunk.content_base64, "base64");
            chunks.push(bytes);
            hash.update(bytes);
            offset += bytes.length;
            if (chunk.next_offset === null)
                break;
            if (chunk.next_offset !== offset || !bytes.length)
                throw new Error("CMS source content continuation requires attention.");
        }
        if (offset !== source.content_bytes || hash.digest("hex") !== source.content_sha256)
            throw new Error("CMS complete source digest requires attention.");
        return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, offset));
    }
}
async function readBounded(response, maximum, signal) {
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^(?:0|[1-9]\d*)$/u.test(declared) || Number(declared) > maximum)) {
        await response.body?.cancel();
        throw new Error("CMS response exceeds its transport bound.");
    }
    if (!response.body)
        return new Uint8Array();
    const reader = response.body.getReader();
    const abort = () => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener("abort", abort, { once: true });
    let size = 0;
    const chunks = [];
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (signal.aborted)
                throw new Error("CMS response timed out.");
            if (done)
                break;
            size += value.length;
            if (size > maximum)
                throw new Error("CMS response exceeds its transport bound.");
            chunks.push(value);
        }
        return Buffer.concat(chunks, size);
    }
    catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    }
    finally {
        signal.removeEventListener("abort", abort);
        reader.releaseLock();
    }
}
