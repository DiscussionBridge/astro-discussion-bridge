import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import path from "node:path";
import { validateCms, semanticIdentity } from "../src/private/cms-runtime.mjs";
import { readPrivateJournal, writePrivateJournal } from "./native-journal.js";
import type { CmsToPage, CmsToState } from "./cms-to.js";
import { assertNativeArticleCapture, nativeCaptureId, type NativeArticleCapture } from "./native-preparation.js";
import { validateToSourceState } from "./cms-to-source-state.js";
export interface PublicationOperation {
  externalId: string; canonicalUrl: string; correlationId: string; attempts: number; outcome: "pending" | "created" | "resolved" | "updated" | "withdrawn" | "attention";
  resourceId?: string; topicId?: string; topicUrl?: string; to?: CmsToState; lastError?: string;
  nativeRender?: NativeRenderIntent;
}
export interface NativeRenderIntent extends Omit<CmsToPage, "contentHtml" | "preparation"> { filePath: string; source: string; originalCapture: NativeArticleCapture; nativeRenderRequired: true }
export interface NativeSourceCensus { docsDir: string; siteBase: string; routeBase: string; rootDev: string; rootIno: string }
export interface PublicationOperationalState { format: 1; wireVersion: "v4"; adapterId: "astro-discussion-bridge"; operations: Record<string, PublicationOperation>; sourceBuildId?: string; sourceBuildOwner?: { pid: number; token: string; buildId: string }; nativeCensus?: NativeSourceCensus; preparationLimitations?: Record<string, { capture: NativeArticleCapture; filePath: string; detail: string }> }
const empty = (): PublicationOperationalState => ({ format: 1, wireVersion: "v4", adapterId: "astro-discussion-bridge", operations: Object.create(null) });
function validateState(value: unknown): PublicationOperationalState {
  const state = value as PublicationOperationalState;
  if (!state || state.format !== 1 || state.wireVersion !== "v4" || state.adapterId !== "astro-discussion-bridge" || !state.operations || typeof state.operations !== "object" || Array.isArray(state.operations)) throw new Error("Current V4 native source state is invalid.");
  if (state.sourceBuildId) validateCms("UUID", state.sourceBuildId);
  if (state.sourceBuildOwner) { validateCms("UUID", state.sourceBuildOwner.token); validateCms("UUID", state.sourceBuildOwner.buildId); if (!Number.isSafeInteger(state.sourceBuildOwner.pid) || state.sourceBuildOwner.pid < 1 || state.sourceBuildOwner.buildId !== state.sourceBuildId) throw new Error("Native source build owner requires reconciliation."); }
  if (state.nativeCensus && (typeof state.nativeCensus.docsDir !== "string" || typeof state.nativeCensus.siteBase !== "string" || typeof state.nativeCensus.routeBase !== "string" || !/^\d+$/u.test(state.nativeCensus.rootDev) || !/^[1-9]\d*$/u.test(state.nativeCensus.rootIno))) throw new Error("Native complete-census scope requires reconciliation.");
  for (const limitation of Object.values(state.preparationLimitations ?? {})) { assertNativeArticleCapture(limitation.capture); if (typeof limitation.filePath !== "string" || typeof limitation.detail !== "string") throw new Error("Native preparation limitation requires reconciliation."); }
  for (const [id, operation] of Object.entries(state.operations)) {
    validateCms("OpaqueId", id); validateCms("Url", operation.canonicalUrl); validateCms("UUID", operation.correlationId);
    if (operation.externalId !== id || !Number.isSafeInteger(operation.attempts) || operation.attempts < 1 || !["pending", "created", "resolved", "updated", "withdrawn", "attention"].includes(operation.outcome)) throw new Error("Native source operation requires reconciliation.");
    if (operation.nativeRender) { const pending = operation.nativeRender; assertNativeArticleCapture(pending.originalCapture); const birth = operation.to?.retainedSource && operation.to.articleCaptures?.[operation.to.retainedSource.captureId]; if (pending.nativeRenderRequired !== true || typeof pending.filePath !== "string" || typeof pending.source !== "string" || pending.externalId !== id || pending.pageUrl !== operation.canonicalUrl || pending.originalCapture.sourceArticleUrl !== pending.pageUrl && (birth?.sourceArticleUrl !== pending.originalCapture.sourceArticleUrl || birth.original !== pending.originalCapture.original)) throw new Error("Native render handoff identity requires reconciliation."); }
    if (operation.resourceId) validateCms("UUID", operation.resourceId); if (operation.topicId) validateCms("CoreId", operation.topicId);
    const to = operation.to; if (!to) continue;
    validateToSourceState(to);
    if (to.sourceFence !== undefined && (!Number.isSafeInteger(to.sourceFence) || to.sourceFence < 1)) throw new Error("Native source fence requires reconciliation.");
    if (to.effectiveEdition) { validateCms("ToRecord", to.effectiveEdition.record); validateCms("UUID", to.effectiveEdition.moveId); if (to.effectiveEdition.record.source_revision !== to.acceptedRevision || !to.articleCaptures?.[to.effectiveEdition.captureId]) throw new Error("Native moved current edition ancestry differs."); }
    validateCms("ConnectionId", to.scope.connectionId); validateCms("Revision", to.scope.scopeRevision); validateCms("Lane", to.scope.lane);
    for (const [id, capture] of Object.entries(to.articleCaptures ?? {})) { assertNativeArticleCapture(capture); if (id !== nativeCaptureId(capture) || capture.preparedHtml === undefined) throw new Error("Native source preparation capture identity differs."); }
    for (const entry of [...Object.values(to.receipts), ...Object.values(to.rejectedRequests ?? {}), ...(to.pending ? [to.pending] : []), ...(to.effectiveEdition ? [] : to.acceptedBody ? [{ body: to.acceptedBody, captureId: to.acceptedCaptureId }] : [])]) if (entry.captureId) {
      const capture = to.articleCaptures?.[entry.captureId];
      if (!capture || capture.preparedSha256 !== entry.body.bridge_record.source_content_sha256 || capture.preparedBytes !== entry.body.bridge_record.source_content_bytes) throw new Error("Native complete preparation/source receipt binding differs.");
    }
    for (const receipt of Object.values(to.receipts)) { validateCms("ToResolve", receipt.body); validateCms("ResolveResult", receipt.result); if (receipt.body.bridge_record.source_revision !== receipt.result.source_revision) throw new Error("Native source receipt revision disagrees."); }
    if (to.pending) { validateCms("ToResolve", to.pending.body); validateCms("Sha256", to.pending.fingerprint); }
    for (const entry of [...Object.values(to.rejectedRequests ?? {}), ...(to.pending?.rejection ? [to.pending] : [])]) {
      validateCms("ToResolve", entry.body); validateCms("Sha256", entry.fingerprint);
      const rejection = entry.rejection;
      if (!rejection) throw new Error("Known source rejection receipt is missing.");
      if (rejection.recordedAt !== undefined) validateCms("Instant", rejection.recordedAt);
      if (!["content_preservation_unavailable", "invalid_field"].includes(rejection.code) || rejection.routeId !== "V4-02" || rejection.httpStatus !== 422 || rejection.retryable !== false || rejection.retryAfterSeconds !== null
        || rejection.requestSha256 !== createHash("sha256").update(semanticIdentity(entry.body)).digest("hex")) throw new Error("Known source rejection differs from its exact retained request.");
      const evidence = rejection.validatedResponse;
      if (!evidence || evidence.routeId !== rejection.routeId || evidence.httpStatus !== rejection.httpStatus || evidence.requestSha256 !== undefined && evidence.requestSha256 !== rejection.requestSha256
        || evidence.candidateId !== undefined && (typeof evidence.candidateId !== "string" || !evidence.candidateId)
        || evidence.schemaSha256 !== undefined && !/^[a-f0-9]{64}$/u.test(evidence.schemaSha256) || evidence.contractSha256 !== undefined && !/^[a-f0-9]{64}$/u.test(evidence.contractSha256)
        || evidence.envelope?.outcome !== "rejected" || evidence.envelope.code !== rejection.code || evidence.envelope.retryable !== false || evidence.envelope.retry_after_seconds !== null || evidence.envelope.core_fallback !== false
        || Object.keys(evidence.envelope).some(key => !["outcome", "code", "retryable", "retry_after_seconds", "correlation_id", "core_fallback"].includes(key))) throw new Error("Known rejection lacks its retained validated call/request evidence.");
      if (Object.hasOwn(evidence.envelope, "correlation_id")) validateCms("Error", evidence.envelope);
      if (rejection.code === "content_preservation_unavailable" && (!rejection.recordedAt || !evidence.requestSha256 || !evidence.candidateId || !evidence.schemaSha256 || !evidence.contractSha256
        || !Object.hasOwn(evidence.envelope, "correlation_id"))) throw new Error("Known preservation rejection lacks its exact historical validated response provenance.");
      // Historical provenance remains historical across a normal V4 upgrade;
      // it is never retagged or required to equal the current loaded candidate.
    }
    for (const [id, entry] of Object.entries(to.rejectedRequests ?? {})) if (id !== entry.body.mutation_id) throw new Error("Known source rejection history identity differs.");
    if (to.pending?.rejection && semanticIdentity(to.rejectedRequests?.[to.pending.body.mutation_id]) !== semanticIdentity(to.pending)) throw new Error("Pending known rejection/history differ.");
    if (Object.values(to.retryIntents ?? {}).filter(intent => intent.phase === "armed").length > 1) throw new Error("Only one selected source Retry may be armed.");
    for (const [id, intent] of Object.entries(to.retryIntents ?? {})) {
      validateCms("UUID", id); validateCms("Instant", intent.requestedAt); validateCms("Sha256", intent.refusedRequestSha256); validateCms("Sha256", intent.fingerprint);
      if (intent.expectedAcceptedRevision !== null) validateCms("Revision", intent.expectedAcceptedRevision);
      const refused = to.rejectedRequests?.[id];
      if (!refused || refused.rejection.code !== "invalid_field" || intent.refusedMutationId !== id || intent.refusedRequestSha256 !== refused.rejection.requestSha256
        || intent.fingerprint !== refused.fingerprint || intent.expectedAcceptedRevision !== refused.body.bridge_record.expected_source_revision
        || !["armed", "pending", "accepted", "rejected", "superseded"].includes(intent.phase)
        || typeof intent.native?.docsDir !== "string" || !path.isAbsolute(intent.native.docsDir) || typeof intent.native.relativePath !== "string" || !intent.native.relativePath
        || path.isAbsolute(intent.native.relativePath) || intent.native.relativePath.split(/[\\/]/u).includes("..")) throw new Error("Selected source Retry differs from its exact refused intent/native binding.");
      validateCms("Sha256", intent.native.contentSha256);
      if (intent.phase === "armed" || intent.phase === "superseded") {
        if (intent.freshMutationId !== undefined) throw new Error("Unconsumed source Retry cannot contain a fresh request.");
      } else {
        validateCms("UUID", intent.freshMutationId);
        const freshId = intent.freshMutationId!, successor = to.pending?.body.mutation_id === freshId ? to.pending : to.receipts[freshId] ?? to.rejectedRequests?.[freshId];
        if (freshId === id || successor?.retryOf !== id || semanticIdentity(successor.body.bridge_record) !== semanticIdentity(refused.body.bridge_record)
          || intent.phase === "accepted" && !to.receipts[freshId] || intent.phase === "rejected" && !to.rejectedRequests?.[freshId]) throw new Error("Source Retry successor/history requires exact reconciliation.");
      }
    }
    for (const entry of [...Object.values(to.receipts), ...Object.values(to.rejectedRequests ?? {}), ...(to.pending ? [to.pending] : [])]) if (entry.retryOf) {
      if (to.retryIntents?.[entry.retryOf]?.freshMutationId !== entry.body.mutation_id) throw new Error("Source Retry request lacks its exact durable action linkage.");
    }
    if (to.acceptedBody) { validateCms("ToResolve", to.acceptedBody); if (!to.effectiveEdition && to.acceptedBody.bridge_record.source_revision !== to.acceptedRevision) throw new Error("Current source snapshot revision disagrees."); }
    if (to.acceptedResult) { validateCms("ResolveResult", to.acceptedResult); if (!to.effectiveEdition && to.acceptedResult.source_revision !== to.acceptedRevision) throw new Error("Current source receipt revision disagrees."); }
    if (to.withdrawal) { validateCms("WithdrawInput", to.withdrawal.body); validateCms("Record", to.withdrawal.before); if (to.withdrawal.body.expected_source_revision !== to.acceptedRevision) throw new Error("Source lifecycle intent requires reconciliation."); if (to.withdrawal.result) validateCms("Record", to.withdrawal.result); if (to.withdrawal.current) validateCms("Record", to.withdrawal.current); }
  }
  return state;
}
export async function readPublicationOperationalState(file: string) { return await readPrivateJournal(file, validateState) ?? empty(); }
export async function writePublicationOperationalState(file: string, state: PublicationOperationalState) { return writePrivateJournal(file, state, validateState); }
export function beginPublicationAttempt(state: PublicationOperationalState, externalId: string, canonicalUrl: string): PublicationOperation {
  const prior = state.operations[externalId]; if (prior && prior.canonicalUrl !== canonicalUrl) throw new Error("Native source canonical URL changed; verified source movement is required.");
  if (prior?.to?.withdrawal) throw new Error("Pending/withdrawn source cannot silently resume.");
  return state.operations[externalId] = { ...prior, externalId, canonicalUrl, correlationId: prior?.correlationId ?? randomUUID(), attempts: (prior?.attempts ?? 0) + 1, outcome: "pending" };
}
