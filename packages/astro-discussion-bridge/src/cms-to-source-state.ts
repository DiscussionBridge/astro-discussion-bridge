import type { CmsSourceUrlMovePrepare, CmsSourceUrlMove, CmsSourceUrlMoveFinalize, CmsSourceUrlMoveAbort, CmsValidatedErrorResponse } from "./cms-client.js";
import type { CmsToRecord, CmsToRecordMetadata, CmsToState } from "./cms-to.js";
import type { SourceNativeCapture } from "./to-source-profile.js";
import { validateSourceCapture, sourceOriginalKey, sourceHash } from "./to-source-profile.js";
import path from "node:path";
import { parseMarkdown } from "./native-source.js";
import { validateCms, semanticIdentity, projectGeneratedReadMoreMove } from "../src/private/cms-runtime.mjs";

export interface SourceNativeCommand { executable: string; args: string[]; cwd: string; timeoutMs?: number }
export interface SourceCommandReceipt { commandId: string; kind: "build" | "deploy"; phase: "starting" | "running" | "succeeded" | "failed" | "uncertain";
  executable: string; args: string[]; cwd: string; fence: number; startedAt: string; pid?: number; completedAt?: string; childClosedAt?: string; terminationConfirmed?: boolean; deploymentId: string; processReceiptFile?: string; writerBusyDeferrals?: number }
export interface CmsToSourceMove {
  phase: "intent" | "reserved" | "native_applied" | "built" | "deployed" | "finalize_pending" | "committed" | "abort_pending" | "aborted" | "attention" | "known_rejected";
  file: string; nativeId: string; fence: number; before: string; beforeRecord: CmsToRecordMetadata; beforeCapture: SourceNativeCapture;
  captureId: string; beforeToRecord: CmsToRecord; originalKey: string; newSlug: string;
  prepareBody: CmsSourceUrlMovePrepare; receipt?: CmsSourceUrlMove;
  newRevision?: string; projected?: CmsToRecord; output?: string; nativeCapture?: SourceNativeCapture;
  finalizeBody?: CmsSourceUrlMoveFinalize; result?: CmsToRecordMetadata;
  abortBody?: CmsSourceUrlMoveAbort; abortResult?: CmsSourceUrlMove;
  commands?: Partial<Record<"build" | "deploy", SourceCommandReceipt>>;
  deployedAt?: string; deploymentId?: string;
  knownRejection?: CmsValidatedErrorResponse; lastError?: string;
}
export interface CmsToEffectiveEdition { record: CmsToRecord; captureId: string; moveId: string; parentRevision: string }
export const activeSourceMove = (move: CmsToSourceMove | undefined) => move !== undefined && move.phase !== "committed" && move.phase !== "aborted";
export function validateToSourceState(to: CmsToState) {
  if (to.nativeCapture) validateSourceCapture(to.nativeCapture);
  for (const move of [...Object.values(to.sourceMoveHistory ?? {}), ...(to.sourceMove ? [to.sourceMove] : [])]) {
    if (!["intent", "reserved", "native_applied", "built", "deployed", "finalize_pending", "committed", "abort_pending", "aborted", "attention", "known_rejected"].includes(move.phase)
      || !Number.isSafeInteger(move.fence) || move.fence < 1 || typeof move.before !== "string" || sourceOriginalKey(move.before) !== move.originalKey) throw new Error("Native source move journal phase/before state requires reconciliation.");
    validateCms("SourceUrlMovePrepare", move.prepareBody); validateCms("Record", move.beforeRecord); validateCms("ToRecord", move.beforeToRecord); validateSourceCapture(move.beforeCapture);
    const source = to.articleCaptures?.[move.captureId];
    if (!source || source.preparedSha256 !== move.beforeToRecord.source_content_sha256 || source.preparedBytes !== move.beforeToRecord.source_content_bytes
      || move.prepareBody.expected_source_revision !== move.beforeRecord.source_revision || move.prepareBody.old_url !== move.beforeRecord.canonical_url || move.beforeToRecord.source_revision !== move.prepareBody.expected_source_revision) throw new Error("Native source move accepted article/current predecessor differs.");
    if (move.receipt) { validateCms("SourceUrlMove", move.receipt); if (move.receipt.expected_source_revision !== move.prepareBody.expected_source_revision || move.receipt.old_url !== move.prepareBody.old_url || move.receipt.new_url !== move.prepareBody.new_url) throw new Error("Native source move reservation receipt differs."); }
    if (move.newRevision) { validateCms("Revision", move.newRevision); if (move.newRevision === move.prepareBody.expected_source_revision) throw new Error("Native source move edition must differ from its actual predecessor."); }
    if (move.projected) {
      const expected = move.beforeToRecord.representation.kind === "generated_excerpt" ? projectGeneratedReadMoreMove(move.beforeToRecord, move.prepareBody.new_url, move.newRevision!, move.beforeToRecord.source_updated_at)
        : { ...move.beforeToRecord, canonical_url: move.prepareBody.new_url, expected_source_revision: move.beforeToRecord.source_revision, source_revision: move.newRevision };
      if (semanticIdentity(expected) !== semanticIdentity(move.projected)) throw new Error("Native source move projection changed its retained article/selection.");
      validateCms("ToRecord", move.projected);
    }
    if (move.output && (parseMarkdown(move.output).body !== parseMarkdown(move.before).body || sourceOriginalKey(move.output) !== move.originalKey)) throw new Error("Native source move changed its original article/unowned metadata.");
    if (move.nativeCapture) { validateSourceCapture(move.nativeCapture); if (move.nativeCapture.revision !== move.newRevision || move.nativeCapture.canonicalUrl !== move.prepareBody.new_url) throw new Error("Native moved source capture differs from its actual edition/URL."); }
    if (move.finalizeBody) { validateCms("SourceUrlMoveFinalize", move.finalizeBody); if (move.finalizeBody.move_id !== move.receipt?.move_id || move.finalizeBody.proof_nonce !== move.receipt.proof_nonce || move.finalizeBody.expected_source_revision !== move.prepareBody.expected_source_revision || move.finalizeBody.new_source_revision !== move.newRevision) throw new Error("Native source finalize request differs from its durable move."); }
    if (move.abortBody) { validateCms("SourceUrlMoveAbort", move.abortBody); if (move.abortBody.move_id !== move.receipt?.move_id || move.abortBody.expected_source_revision !== move.prepareBody.expected_source_revision) throw new Error("Native source abort differs from its durable move."); }
    if (move.result) validateCms("Record", move.result);
    if (move.abortResult) validateCms("SourceUrlMove", move.abortResult);
    for (const [kind, command] of Object.entries(move.commands ?? {})) {
      validateCms("UUID", command.commandId); validateCms("UUID", command.deploymentId); validateCms("Instant", command.startedAt);
      if (kind !== command.kind || !["build", "deploy"].includes(kind) || !["starting", "running", "succeeded", "failed", "uncertain"].includes(command.phase) || command.fence !== move.fence
        || !path.isAbsolute(command.executable) || !path.isAbsolute(command.cwd) || !Array.isArray(command.args) || command.args.some(arg => typeof arg !== "string" || arg.includes("\0"))) throw new Error("Native source command durable owner requires reconciliation.");
      if (command.pid !== undefined && (!Number.isSafeInteger(command.pid) || command.pid < 1)) throw new Error("Native source process identity requires reconciliation.");
      if (command.completedAt) validateCms("Instant", command.completedAt); if (command.childClosedAt) validateCms("Instant", command.childClosedAt);
      if (command.processReceiptFile !== undefined && !path.isAbsolute(command.processReceiptFile) || command.writerBusyDeferrals !== undefined && (!Number.isSafeInteger(command.writerBusyDeferrals) || command.writerBusyDeferrals < 0)) throw new Error("Native source process evidence requires reconciliation.");
      if (command.phase === "succeeded" && (!command.pid || !command.completedAt || !command.childClosedAt || !command.terminationConfirmed)) throw new Error("Native source command lacks its actual completed process receipt.");
    }
    if (move.knownRejection) {
      const evidence = move.knownRejection;
      if (!move.finalizeBody || evidence.routeId !== "V4-29" || evidence.httpStatus !== 422 || evidence.requestSha256 !== sourceHash(semanticIdentity(move.finalizeBody))
        || !evidence.candidateId || !/^[a-f0-9]{64}$/u.test(evidence.schemaSha256) || !/^[a-f0-9]{64}$/u.test(evidence.contractSha256)
        || evidence.envelope.code !== "content_preservation_unavailable" || evidence.envelope.outcome !== "rejected" || evidence.envelope.retryable !== false || evidence.envelope.retry_after_seconds !== null || evidence.envelope.core_fallback !== false
        || Object.keys(evidence.envelope).sort().join() !== ["outcome", "code", "retryable", "retry_after_seconds", "correlation_id", "core_fallback"].sort().join()) throw new Error("Known source29 rejection lost its exact historical validated request/outcome.");
    }
  }
  if (activeSourceMove(to.sourceMove) && to.sourceMove!.fence !== to.sourceFence) throw new Error("Native source move lost its actual local source fence.");
}
