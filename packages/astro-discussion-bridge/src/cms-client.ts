import * as runtime from "../src/private/cms-runtime.mjs";
import { createHash } from "node:crypto";
import { cmsSchema, parseCmsJson, validateCms, validateCmsResponse, validateCmsRoute } from "../src/private/cms-runtime.mjs";
import { resolveServerSecret } from "./server-secret.js";
import { cmsOrigin, nativeUrl, sameCmsOrigin } from "./native-url.js";
import { cmsFetch } from "./cms-fetch.js";
import type { CmsToRecord, CmsToRecordMetadata, CmsToResult, CmsToWithdrawInput } from "./cms-to.js";
import type { CmsPublishedProof } from "./cms-verification.js";

export interface CmsClientOptions {
  serverUrl: string;
  connectionId: string;
  connectionSecret?: string;
  secretFile?: string;
  fetchImplementation?: typeof fetch;
}

export interface CmsSource {
  source_id: string; source_revision: string; topic_id: string; topic_url: string;
  title: string; content_sha256: string; content_bytes: number;
  source_created_at: string | null; source_updated_at: string | null;
  source_authors: Array<{ id: string; name: string }>;
}
export type CmsEvent = { event_type: "publication"; event_id: string; event_sequence: string; source: CmsSource }
  | { event_type: "revocation"; event_id: string; event_sequence: string; source_id: string; last_source_revision: string | null; reason: string };
export interface CmsFeed { stream: "initial" | "changes"; items: CmsEvent[]; next_cursor: string | null; checkpoint_cursor: string | null }
export interface CmsWork {
  work_id: string; mapping_id: string; source_id: string; source_revision: string | null; policy_revision: string;
  action: "publish_revision" | "withdraw"; state: string; attempt_cycle: string; attempt: number; lease_generation: number;
  retry_at: string | null; last_failure_code: string | null;
}
export interface CmsLease { work: CmsWork; lease_token: string; lease_generation: number; expires_at: string; server_time: string }
export interface CmsAuthority { work_id: string; lease_token: string; lease_generation: number; source_revision: string | null; policy_revision: string }
export interface CmsMapping extends Record<string, unknown> {
  mapping_id: string; resource_id: string; connection_id: string; source_id: string; external_id: string;
  mapping_revision: string;
  destination_native_id: string | null; canonical_url: string; desired_source_revision: string | null;
  destination_native_revision: string | null; presentation_mode: "simple" | "full" | "interactive";
}
export interface CmsConnection extends Record<string, unknown> {
  connection_id: string; profile: string; destination_origin: string; scope_revision: string; forum_name: string;
  directions: string[]; publication_lane: string; policy: { enabled: boolean; policy_revision: string; publication_kind: string; presentation_mode: string; author_ids: string[]; taxonomy_ids: string[] };
  native_capabilities: { publication_kind: string; supported_presentations: string[]; complete_content_supported: boolean };
}
export interface CmsWorkQuery { work: CmsWork; mapping: CmsMapping; lease_expires_at: string | null }
export interface CmsOwnership { resource_id: string; external_id: string; native_id: string; canonical_url: string; source_revision: string | null; ownership_receipt_sha256: string }
export interface CmsUrlMovePrepare { mutation_id: string; authority: CmsAuthority; expected_mapping_revision: string; old_url: string; new_url: string; ownership: CmsOwnership }
export interface CmsUrlMove { move_id: string; mapping_id: string; expected_mapping_revision: string; old_url: string; new_url: string; proof_nonce: string; state: "prepared" | "committed" | "aborted" | "attention"; prepared_at: string }
export interface CmsUrlMoveFinalize { mutation_id: string; authority: CmsAuthority; move_id: string; proof_nonce: string; ownership: CmsOwnership; verification: CmsPublishedProof }
export interface CmsUrlMoveAbort { mutation_id: string; authority: CmsAuthority; move_id: string; native_change_applied: boolean; ownership: CmsOwnership }
export interface CmsSourceUrlMovePrepare { mutation_id: string; expected_source_revision: string; old_url: string; new_url: string; external_id: string }
export interface CmsSourceUrlMove { move_id: string; resource_id: string; expected_source_revision: string; old_url: string; new_url: string; proof_nonce: string; state: "prepared" | "committed" | "aborted" | "attention"; prepared_at: string }
export interface CmsSourceUrlVerification { url: string; external_id: string; source_revision: string; source_content_sha256: string; native_ownership_receipt_sha256: string; native_publication_sha256: string; verification_profile: string; checked_at: string }
export interface CmsSourceUrlMoveFinalize { mutation_id: string; move_id: string; proof_nonce: string; expected_source_revision: string; verification: CmsSourceUrlVerification; new_source_revision: string; source_updated_at: string | null }
export interface CmsSourceUrlMoveAbort { mutation_id: string; move_id: string; expected_source_revision: string; native_change_applied: boolean; old_url: string; native_ownership_receipt_sha256: string }
export interface CmsUrlHistoryPage { items: { url: string; retired_at: string; move_id: string }[]; next_cursor: string | null }

export class CmsRequestError extends Error {
  constructor(readonly code: string, readonly retryable: boolean, readonly retryAfterSeconds: number | null, readonly routeId?: string, readonly httpStatus?: number) {
    super(`DiscussionBridge CMS request rejected: ${code}.`);
  }
}
export interface CmsValidatedErrorResponse { routeId: string; httpStatus: number; requestSha256: string; candidateId: string; schemaSha256: string; contractSha256: string;
  envelope: { outcome: "rejected"; code: string; retryable: boolean; retry_after_seconds: number | null; correlation_id: string | null; core_fallback: false } }
const validatedErrorResponses = new WeakMap<Error, { client: CmsClient; response: CmsValidatedErrorResponse }>();
/** Only an actual codec-validated response from this client's exact request. */
export function validatedCmsErrorResponse(error: unknown, client: CmsClient, routeId: string, body: object): CmsValidatedErrorResponse | undefined {
  const known = error instanceof Error ? validatedErrorResponses.get(error) : undefined;
  if (known?.client !== client || known.response.routeId !== routeId || known.response.requestSha256 !== createHash("sha256").update(runtime.semanticIdentity(body)).digest("hex")) return undefined;
  return structuredClone(known.response);
}

/** Single current V4 closed-schema transport. */
export class CmsClient {
  readonly origin: string;
  private readonly credentials: ReturnType<typeof resolveServerSecret>;
  private readonly fetchImplementation: typeof fetch;
  constructor(private readonly options: CmsClientOptions) {
    validateCms("ConnectionId", options.connectionId);
    this.origin = cmsOrigin(options.serverUrl);
    this.credentials = resolveServerSecret(options);
    this.fetchImplementation = options.fetchImplementation ?? cmsFetch;
  }

  async request<T>(id: string, input: { body?: object; query?: Record<string, string | number>; path?: Record<string, string> } = {}): Promise<T> {
    const codec = runtime;
    codec.validateCmsRoute(id, input);
    const route = codec.cmsSchema.routes.find(item => item.id === id)!;
    const pathname = route.path.replace(/\{([^}]+)\}/gu, (_, field: string) => encodeURIComponent(input.path![field]));
    const url = nativeUrl(pathname, this.origin);
    for (const [key, value] of Object.entries(input.query ?? {})) url.searchParams.set(key, String(value));
    const body = input.body === undefined ? undefined : codec.semanticIdentity(input.body);
    if (body !== undefined && Buffer.byteLength(body) > 65_536) throw new Error("CMS request exceeds its JSON transport bound.");
    const credentials = await this.credentials;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let validatedRejection: CmsRequestError | undefined;
    try {
      const response = await this.fetchImplementation(url.href, {
        method: route.method, body, redirect: "error", credentials: "omit", signal: controller.signal,
        headers: { Accept: "application/json", "Accept-Encoding": "identity", ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          "X-DiscussionBridge-Connection": this.options.connectionId, "X-DiscussionBridge-Secret": credentials.connectionSecret },
      });
      if (response.redirected || response.status >= 300 && response.status < 400 || response.url && !sameCmsOrigin(response.url, this.origin)) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error("CMS service response requires origin attention.");
      }
      if (response.status === 204) {
        const bytes = await readBounded(response, 0, controller.signal);
        if (bytes.length) throw new Error("CMS bodyless response contained bytes.");
        return codec.validateCmsResponse(id, undefined, response.status) as T;
      }
      if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:UTF-8|"UTF-8"))?\s*$/iu.test(response.headers.get("content-type") ?? "")) throw new Error("CMS service response requires JSON media attention.");
      const maximum = route.response === "ContentChunk" ? 65_536 : 262_144;
      const value = codec.parseCmsJson(await readBounded(response, maximum, controller.signal), { maximumBytes: maximum });
      codec.validateCmsResponse(id, value, response.status);
      if (!route.success_http.includes(response.status)) {
        if (id === "V4-02" && (value as { outcome?: string }).outcome === "reconciliation_required") { validatedRejection = new CmsRequestError("reconciliation_required", false, null, id, response.status); throw validatedRejection; }
        const rejected = value as { code: string; retryable: boolean; retry_after_seconds: number | null };
        validatedRejection = new CmsRequestError(rejected.code, rejected.retryable, rejected.retry_after_seconds, id, response.status);
        validatedErrorResponses.set(validatedRejection, { client: this, response: { routeId: id, httpStatus: response.status, requestSha256: createHash("sha256").update(body ?? "").digest("hex"),
          candidateId: runtime.candidateId, schemaSha256: runtime.cmsSchemaIdentity.sha256, contractSha256: runtime.specIdentity.sha256,
          envelope: structuredClone(value) as CmsValidatedErrorResponse["envelope"] } });
        throw validatedRejection;
      }
      return value as T;
    } catch (error) {
      if (validatedRejection && error === validatedRejection) throw error;
      if (controller.signal.aborted) throw new CmsRequestError("transport_timeout", true, null);
      // Native fetch/parser errors may include credentials or untrusted URLs.
      throw new Error("DiscussionBridge CMS transport or typed response requires attention.");
    } finally { clearTimeout(timeout); }
  }

  async connection() {
    const connection = await this.request<CmsConnection>("V4-01");
    if (connection.connection_id !== this.options.connectionId) throw new Error("CMS connection response requires exact configured scope.");
    return connection;
  }
  resolveTo(body: { mutation_id: string; bridge_record: CmsToRecord }) { return this.request<CmsToResult>("V4-02", { body }); }
  records(cursor?: string) { return this.request<{ items: CmsToRecordMetadata[]; next_cursor: string | null }>("V4-03", { query: cursor === undefined ? {} : { cursor } }); }
  record(resourceId: string) { return this.request<CmsToRecordMetadata>("V4-04", { path: { resource_id: resourceId } }); }
  withdrawRecord(resourceId: string, body: CmsToWithdrawInput) {
    return this.request<CmsToRecordMetadata>("V4-05", { path: { resource_id: resourceId }, body });
  }
  prepareSourceUrlMove(resourceId: string, body: CmsSourceUrlMovePrepare) { return this.request<CmsSourceUrlMove>("V4-28", { path: { resource_id: resourceId }, body }); }
  finalizeSourceUrlMove(resourceId: string, moveId: string, body: CmsSourceUrlMoveFinalize) { return this.request<CmsToRecordMetadata>("V4-29", { path: { resource_id: resourceId, move_id: moveId }, body }); }
  abortSourceUrlMove(resourceId: string, moveId: string, body: CmsSourceUrlMoveAbort) { return this.request<CmsSourceUrlMove>("V4-30", { path: { resource_id: resourceId, move_id: moveId }, body }); }
  sourceUrlHistory(resourceId: string, cursor?: string) { return this.request<CmsUrlHistoryPage>("V4-31", { path: { resource_id: resourceId }, query: cursor === undefined ? {} : { cursor } }); }
  sources(stream: "initial" | "changes", cursor?: string) {
    return this.request<CmsFeed>("V4-06", { query: { stream, ...(cursor === undefined ? {} : { cursor }) } });
  }
  claim(mutationId: string, mappingId?: string) {
    return this.request<CmsLease | undefined>("V4-13", { body: { mutation_id: mutationId, ...(mappingId === undefined ? {} : { mapping_id: mappingId }) } });
  }
  query(workId: string) { return this.request<CmsWorkQuery>("V4-14", { path: { work_id: workId } }); }
  prepareUrlMove(mappingId: string, body: CmsUrlMovePrepare) { return this.request<CmsUrlMove>("V4-21", { path: { mapping_id: mappingId }, body }); }
  finalizeUrlMove(mappingId: string, moveId: string, body: CmsUrlMoveFinalize) { return this.request<CmsMapping>("V4-22", { path: { mapping_id: mappingId, move_id: moveId }, body }); }
  abortUrlMove(mappingId: string, moveId: string, body: CmsUrlMoveAbort) { return this.request<CmsUrlMove>("V4-23", { path: { mapping_id: mappingId, move_id: moveId }, body }); }
  renew(mutationId: string, authority: CmsAuthority) {
    return this.request<CmsLease>("V4-15", { path: { work_id: authority.work_id }, body: { mutation_id: mutationId, authority } });
  }
  async content(source: CmsSource): Promise<string> {
    validateCms("Source", source);
    const chunks: Uint8Array[] = [];
    let offset = 0;
    const hash = createHash("sha256");
    for (;;) {
      const chunk = await this.request<{ source_id: string; source_revision: string; content_sha256: string; content_bytes: number; offset: number; next_offset: number | null; content_base64: string }>("V4-07", {
        path: { source_id: source.source_id, source_revision: source.source_revision }, query: { offset },
      });
      if (chunk.source_id !== source.source_id || chunk.source_revision !== source.source_revision || chunk.content_sha256 !== source.content_sha256 || chunk.content_bytes !== source.content_bytes || chunk.offset !== offset) throw new Error("CMS source content identity requires attention.");
      const bytes = Buffer.from(chunk.content_base64, "base64");
      chunks.push(bytes); hash.update(bytes); offset += bytes.length;
      if (chunk.next_offset === null) break;
      if (chunk.next_offset !== offset || !bytes.length) throw new Error("CMS source content continuation requires attention.");
    }
    if (offset !== source.content_bytes || hash.digest("hex") !== source.content_sha256) throw new Error("CMS complete source digest requires attention.");
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, offset));
  }
}

async function readBounded(response: Response, maximum: number, signal: AbortSignal): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/u.test(declared) || Number(declared) > maximum)) { await response.body?.cancel(); throw new Error("CMS response exceeds its transport bound."); }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (signal.aborted) throw new Error("CMS response timed out.");
      if (done) break;
      size += value.length;
      if (size > maximum) throw new Error("CMS response exceeds its transport bound.");
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { signal.removeEventListener("abort", abort); reader.releaseLock(); }
}
