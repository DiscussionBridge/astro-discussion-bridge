import { createHash, randomUUID } from "node:crypto";
import { validateCms, semanticIdentity, measureToFullEnvelope, createGeneratedExcerpt, generatedReadMore } from "../src/private/cms-runtime.mjs";
import { CmsClient, CmsRequestError, validatedCmsErrorResponse, type CmsConnection, type CmsValidatedErrorResponse } from "./cms-client.js";
import { PRODUCT_VERSION } from "./version.js";
import type { PublicationOperation } from "./operational-state.js";
import { assertNativeArticleCapture, nativeCaptureId, NativePreparationLimitation, type NativeArticleCapture } from "./native-preparation.js";
import type { SourceNativeCapture } from "./to-source-profile.js";
import type { CmsToSourceMove, CmsToEffectiveEdition } from "./cms-to-source-state.js";

export interface CmsToRecord {
  direction: "to_discourse"; external_id: string; canonical_url: string; title: string; content_html: string; published: true;
  source_revision: string; expected_source_revision: string | null; source_created_at: string | null; source_updated_at: string | null;
  representation: { kind: "full" } | { kind: "generated_excerpt"; read_more_url: string; article_content_bytes: number; article_content_sha256: string; selection_source_revision: string; selection_full_request_bytes: number };
  source_content_sha256: string; source_content_bytes: number; lane: string; adapter_id: string; adapter_version: string; correlation_id: string;
  visibility: "unlisted"; source_authors?: { id: string; name: string }[]; primary_source_author_id?: string; existing_topic_id?: string;
}
export interface CmsToResult {
  outcome: "created" | "resolved" | "updated"; reason: string; resource_id: string; topic_id: string; topic_url: string;
  direction: "to_discourse"; source_revision: string; synchronized_at: string; core_fallback: false;
}
export interface CmsToRecordMetadata {
  resource_id: string; direction: string; state: string; topic_id: string; topic_url: string; external_id: string; canonical_url: string;
  source_revision: string | null; source_created_at: string | null; source_updated_at: string | null; synchronized_at: string | null; mapping_id: string | null;
}
export type CmsToRevocationReason = "source_unpublished" | "source_deleted" | "source_ineligible" | "policy_excluded";
export interface CmsToWithdrawInput { mutation_id: string; expected_source_revision: string; reason: CmsToRevocationReason }
export type CmsToBody = { mutation_id: string; bridge_record: CmsToRecord };
/** Actual validated receiver rejection of this exact request, not uncertainty. */
export interface CmsToPreservationRejection { code: "content_preservation_unavailable"; routeId: "V4-02"; httpStatus: 422; retryable: false; retryAfterSeconds: null; requestSha256: string; recordedAt: string; validatedResponse: CmsValidatedErrorResponse }
/** Missing historical diagnostics stay unknown; exact validated call linkage is required. */
export interface CmsToInvalidFieldRejection extends Omit<CmsToPreservationRejection, "code" | "validatedResponse" | "recordedAt"> {
  code: "invalid_field";
  recordedAt?: string;
  validatedResponse: Pick<CmsValidatedErrorResponse, "routeId" | "httpStatus"> & Partial<Pick<CmsValidatedErrorResponse, "requestSha256" | "candidateId" | "schemaSha256" | "contractSha256">> & {
    envelope: Omit<CmsValidatedErrorResponse["envelope"], "correlation_id"> & { correlation_id?: string | null };
  };
}
export type CmsToRejection = CmsToPreservationRejection | CmsToInvalidFieldRejection;
export interface CmsToPending { body: CmsToBody; fingerprint: string; captureId?: string; rejection?: CmsToRejection; retryOf?: string }
export interface CmsToRetryIntent {
  refusedMutationId: string; refusedRequestSha256: string; fingerprint: string; requestedAt: string; expectedAcceptedRevision: string | null;
  native: { docsDir: string; relativePath: string; contentSha256: string };
  phase: "armed" | "pending" | "accepted" | "rejected" | "superseded"; freshMutationId?: string;
}
export interface CmsToState {
  sourceFence?: number; nativeCapture?: SourceNativeCapture; sourceMove?: CmsToSourceMove; sourceMoveHistory?: Record<string, CmsToSourceMove>;
  effectiveEdition?: CmsToEffectiveEdition; retainedSource?: { articleSha256: string; captureId: string };
  scope: { connectionId: string; serverOrigin: string; siteOrigin: string; scopeRevision: string; lane: string };
  nativeSource?: { docsDir: string; relativePath: string };
  acceptedRevision?: string; acceptedFingerprint?: string; acceptedResult?: CmsToResult; acceptedBody?: CmsToBody;
  receipts: Record<string, { body: CmsToBody; result: CmsToResult; captureId?: string; retryOf?: string }>;
  articleCaptures?: Record<string, NativeArticleCapture>;
  acceptedCaptureId?: string;
  pending?: CmsToPending;
  rejectedRequests?: Record<string, CmsToPending & { rejection: CmsToRejection }>;
  retryIntents?: Record<string, CmsToRetryIntent>;
  withdrawal?: { body: CmsToWithdrawInput; native: { docsDir: string; relativePath: string; contentSha256: string | null }; before: CmsToRecordMetadata;
    phase: "pending" | "withdrawn"; result?: CmsToRecordMetadata; current?: CmsToRecordMetadata };
}
export interface CmsToPage {
  preparation: NativeArticleCapture;
  pageUrl: string; title: string; externalId: string; contentHtml: string; sourceAuthors?: { id: string; name: string }[]; primarySourceAuthorId?: string;
  createdAt: string | null; updatedAt: string | null; existingResourceId?: string; existingTopicId?: string; coreTopicId?: string;
}
export function cmsToFingerprint(page: CmsToPage, lane: string) {
  return createHash("sha256").update(semanticIdentity([page.externalId, page.pageUrl, page.title, page.contentHtml, page.sourceAuthors ?? [], page.primarySourceAuthorId ?? null, page.createdAt, page.updatedAt, lane, "unlisted"])).digest("hex");
}

/** Exact current V4 transport inside the one native source publisher. */
export async function resolveCmsToPage(input: { client: CmsClient; connection: CmsConnection; operation: PublicationOperation; page: CmsToPage;
  lane?: string; excerptArticle: (html: string, maximum: number) => string; persist: () => Promise<void>; assertCurrentNative: () => Promise<void> }) {
  const { client, connection, operation, page } = input;
  assertNativeArticleCapture(page.preparation);
  if (page.preparation.preparedHtml !== page.contentHtml) throw new NativePreparationLimitation("Current source lacks its exact complete prepared article evidence; no source bytes are reconstructed.");
  if (operation.to?.withdrawal) throw new Error("Withdrawal intent/binding cannot silently resume through resolve; native administrator reconciliation is required.");
  const scope = { connectionId: connection.connection_id, serverOrigin: client.origin, siteOrigin: new URL(page.pageUrl).origin, scopeRevision: connection.scope_revision, lane: input.lane ?? connection.publication_lane };
  const destination = new URL(connection.destination_origin);
  if (connection.profile !== "astro" || !connection.directions.includes("to_discourse") || destination.origin !== scope.siteOrigin || destination.pathname !== "/" || destination.search) throw new Error("Current V4 native source/connection scope requires reconciliation.");
  if (operation.to && semanticIdentity(operation.to.scope) !== semanticIdentity(scope)) throw new Error("Stored native source connection scope requires reconciliation.");
  const resourceId = page.existingResourceId ?? operation.resourceId, topicId = page.existingTopicId ?? operation.topicId;
  if (resourceId) {
    const current = await client.record(resourceId);
    if (operation.to?.pending?.rejection && (!operation.to.acceptedRevision || current.source_revision !== operation.to.acceptedRevision)) throw new Error("Known rejected source requires its exact current accepted predecessor; receiver binding requires reconciliation.");
    if (!operation.to?.acceptedRevision && !operation.to?.pending) throw new Error("Existing source binding lacks a current V4 accepted receipt; earlier-record initialization is not supported.");
    if (current.direction !== "to_discourse" || current.state !== "active" || current.resource_id !== resourceId || current.external_id !== page.externalId || current.canonical_url !== page.pageUrl
      || current.topic_id !== topicId || current.source_revision !== operation.to?.acceptedRevision && current.source_revision !== operation.to?.pending?.body.bridge_record.source_revision) throw new Error("Current owned V4 native/receiver binding requires reconciliation.");
    assertCmsTopicUrl(current.topic_url, current.topic_id, client.origin);
  }
  const fingerprint = cmsToFingerprint(page, scope.lane);
  operation.to ??= { scope, receipts: Object.create(null) };
  const journal = operation.to;
  if (journal.pending && !journal.pending.captureId && journal.pending.rejection?.code !== "invalid_field" || journal.acceptedRevision && !journal.acceptedCaptureId) throw new NativePreparationLimitation("Immutable current source receipt lacks original article/source-URL preparation evidence; retain exact pending/history for local reconciliation, without retrofit or a fabricated edition.");
  const armed = Object.values(journal.retryIntents ?? {}).find(intent => intent.phase === "armed");
  if (armed && armed.fingerprint !== fingerprint) { armed.phase = "superseded"; await input.persist(); }
  const retry = armed?.phase === "armed" ? armed : undefined;
  if (retry && (journal.pending?.body.mutation_id !== retry.refusedMutationId || journal.pending.rejection?.code !== "invalid_field"
    || retry.expectedAcceptedRevision !== (journal.acceptedRevision ?? null))) throw new Error("Selected source Retry no longer describes the current refused intent/predecessor; reconciliation is required.");
  const rejected = Object.values(journal.rejectedRequests ?? {}).find(entry => entry.fingerprint === fingerprint
    && entry.body.bridge_record.expected_source_revision === (journal.acceptedRevision ?? null)
    && entry.body.mutation_id !== retry?.refusedMutationId && !hasExactRetrySuccessor(journal, entry));
  if (rejected || journal.pending?.rejection && journal.pending.fingerprint === fingerprint && !retry) {
    const rejection = (rejected ?? journal.pending!)!.rejection!;
    throw new CmsRequestError(rejection.code, rejection.retryable, rejection.retryAfterSeconds, rejection.routeId, rejection.httpStatus);
  }
  if (retry) {
    const refused = journal.pending!;
    if (refused.body.bridge_record.expected_source_revision !== (journal.acceptedRevision ?? null)
      || refused.body.bridge_record.source_content_sha256 !== createHash("sha256").update(page.contentHtml).digest("hex")
      || refused.body.bridge_record.source_content_bytes !== Buffer.byteLength(page.contentHtml)) throw new Error("Selected source Retry requires its unchanged complete prepared article and current predecessor.");
    const captureId = retainCapture(journal, page);
    await input.assertCurrentNative();
    // Explicit Retry changes the request identity only, never the refused edition.
    const body = { mutation_id: randomUUID(), bridge_record: structuredClone(refused.body.bridge_record) }; validateCms("ToResolve", body);
    retry.freshMutationId = body.mutation_id; retry.phase = "pending";
    journal.pending = { body, fingerprint, captureId, retryOf: refused.body.mutation_id };
    await input.persist(); // Exact refusal/successor linkage is durable before dispatch.
  } else if (journal.pending?.rejection) {
    const retained = journal.rejectedRequests?.[journal.pending.body.mutation_id];
    if (!retained || semanticIdentity(retained) !== semanticIdentity(journal.pending)) throw new Error("Known rejected source request/history requires exact reconciliation.");
    // Only a genuinely different current snapshot reaches this point; the
    // scoped record above already checked the known accepted predecessor.
    delete journal.pending;
  }
  if (journal.pending && journal.pending.fingerprint !== fingerprint) throw new Error("Uncertain exact source mutation requires current native reconciliation before a changed edition.");
  if (!journal.pending) {
    const captureId = retainCapture(journal, page);
    const revision = journal.acceptedFingerprint === fingerprint && journal.acceptedRevision ? journal.acceptedRevision : randomUUID();
    let record: CmsToRecord;
    if (journal.acceptedFingerprint === fingerprint && journal.acceptedRevision === revision) {
      const currentRecord = journal.effectiveEdition?.record ?? journal.acceptedBody?.bridge_record;
      if (!currentRecord || currentRecord.source_revision !== revision) throw new Error("Current source edition requires its exact accepted snapshot/ancestry.");
      record = structuredClone(currentRecord); record.expected_source_revision = revision;
    } else {
      record = { direction: "to_discourse", external_id: page.externalId, canonical_url: page.pageUrl, title: page.title, content_html: page.contentHtml, published: true,
        source_revision: revision, expected_source_revision: journal.acceptedRevision ?? null, source_created_at: page.createdAt, source_updated_at: page.updatedAt,
        representation: { kind: "full" }, source_content_sha256: createHash("sha256").update(page.contentHtml).digest("hex"), source_content_bytes: Buffer.byteLength(page.contentHtml),
        lane: scope.lane, adapter_id: "astro-discussion-bridge", adapter_version: PRODUCT_VERSION, correlation_id: operation.correlationId, visibility: "unlisted",
        ...(page.sourceAuthors ? { source_authors: page.sourceAuthors, primary_source_author_id: page.primarySourceAuthorId } : {}), ...(page.coreTopicId === undefined ? {} : { existing_topic_id: page.coreTopicId }) };
      if (record.source_content_bytes > 49152 || measureToFullEnvelope(record, page.contentHtml) > 65536) {
        let maximum = 49152 - Buffer.byteLength(generatedReadMore(page.pageUrl));
        for (;;) {
          try { record = createGeneratedExcerpt(record, page.contentHtml, input.excerptArticle(page.contentHtml, maximum)); break; }
          catch (error) { if ((error as { code?: string }).code !== "body_too_large" || maximum <= 8) throw error; maximum = Math.floor(maximum / 2); }
        }
      }
    }
    const body = { mutation_id: randomUUID(), bridge_record: record }; validateCms("ToResolve", body);
    if (Buffer.byteLength(semanticIdentity(body)) > 65536) throw new Error("Actual native source request exceeds the unchanged V4 envelope.");
    journal.pending = { body, fingerprint, captureId }; await input.persist();
  }
  await input.assertCurrentNative();
  let result: CmsToResult;
  try { result = await client.resolveTo(journal.pending.body); }
  catch (error) {
    const validatedResponse = validatedCmsErrorResponse(error, client, "V4-02", journal.pending.body);
    const code = validatedResponse?.envelope.code;
    if (validatedResponse?.httpStatus === 422 && (code === "content_preservation_unavailable" || code === "invalid_field") && validatedResponse.envelope.retryable === false && validatedResponse.envelope.retry_after_seconds === null
      && error instanceof CmsRequestError && error.code === code && error.routeId === "V4-02" && error.httpStatus === 422 && error.retryable === false && error.retryAfterSeconds === null) {
      journal.pending.rejection = { code, routeId: "V4-02", httpStatus: 422, retryable: false, retryAfterSeconds: null,
        requestSha256: createHash("sha256").update(semanticIdentity(journal.pending.body)).digest("hex"), recordedAt: new Date().toISOString(), validatedResponse };
      journal.rejectedRequests ??= Object.create(null);
      const old = journal.rejectedRequests![journal.pending.body.mutation_id], retained = structuredClone(journal.pending) as CmsToPending & { rejection: CmsToRejection };
      if (old && semanticIdentity(old) !== semanticIdentity(retained)) throw new Error("Known source rejection history cannot be replaced.");
      journal.rejectedRequests![journal.pending.body.mutation_id] ??= retained;
      if (journal.pending.retryOf) journal.retryIntents![journal.pending.retryOf].phase = "rejected";
      await input.persist();
    }
    throw error;
  }
  if (result.direction !== "to_discourse" || result.core_fallback !== false || result.source_revision !== journal.pending.body.bridge_record.source_revision || resourceId && result.resource_id !== resourceId || topicId && result.topic_id !== topicId) throw new Error("Accepted source result requires exact owned identity/revision reconciliation.");
  assertCmsTopicUrl(result.topic_url, result.topic_id, client.origin);
  const receipt = { body: structuredClone(journal.pending.body), result: structuredClone(result), captureId: journal.pending.captureId,
    ...(journal.pending.retryOf ? { retryOf: journal.pending.retryOf } : {}) }, prior = journal.receipts[journal.pending.body.mutation_id];
  if (prior && semanticIdentity(prior) !== semanticIdentity(receipt)) throw new Error("Accepted source mutation history cannot be replaced.");
  journal.receipts[journal.pending.body.mutation_id] ??= receipt;
  journal.acceptedBody = structuredClone(journal.pending.body); journal.acceptedRevision = result.source_revision; journal.acceptedFingerprint = fingerprint; journal.acceptedResult = result;
  journal.acceptedCaptureId = journal.pending.captureId;
  if (journal.pending.retryOf) journal.retryIntents![journal.pending.retryOf].phase = "accepted";
  delete journal.effectiveEdition;
  operation.resourceId = result.resource_id; operation.topicId = result.topic_id; operation.topicUrl = result.topic_url;
  await input.persist(); // Exact pending request remains until native binding commit.
  return result;
}

function retainCapture(journal: CmsToState, page: CmsToPage) {
  journal.articleCaptures ??= Object.create(null);
  const id = nativeCaptureId(page.preparation);
  journal.articleCaptures![id] ??= structuredClone(page.preparation);
  return id;
}

/** A retained refusal delegates only to its exact, durably linked successor. */
function hasExactRetrySuccessor(journal: CmsToState, refused: CmsToPending) {
  const intent = journal.retryIntents?.[refused.body.mutation_id], id = intent?.freshMutationId;
  if (!id) return false;
  const successor = journal.pending?.body.mutation_id === id ? journal.pending : journal.receipts[id] ?? journal.rejectedRequests?.[id];
  return successor?.retryOf === refused.body.mutation_id && semanticIdentity(successor.body.bridge_record) === semanticIdentity(refused.body.bridge_record);
}

export function assertCmsTopicUrl(value: string, topicId: string, origin: string) {
  validateCms("CoreId", topicId); validateCms("Url", value);
  const url = new URL(value), match = /^\/t\/(?:[^/]+\/)?([1-9]\d*)\/?$/u.exec(url.pathname);
  if (url.origin !== origin || !match || match[1] !== topicId || /%2f|%5c/iu.test(url.pathname)) throw new Error("Topic URL requires exact decimal native identity/origin.");
}
