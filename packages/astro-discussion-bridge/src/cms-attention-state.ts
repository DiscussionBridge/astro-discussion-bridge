import { readPrivateJournal, writePrivateJournal } from "./native-journal.js";
import { validateCms } from "../src/private/cms-runtime.mjs";
import type { CmsCoordinatorOptions } from "./cms-coordinator.js";
import type { AttentionState } from "./cms-attention-types.js";
import path from "node:path";
export const attentionFile = (options: CmsCoordinatorOptions) => `${options.stateFile}.attention.json`;
function validate(value: unknown): AttentionState {
  const state = value as AttentionState;
  if (!state || state.format !== "astro-attention-1" || ![state.inspections, state.recoveries, state.restorations].every(map => map && typeof map === "object" && !Array.isArray(map))) throw new Error("Astro recovery journal requires reconciliation.");
  validateCms("ConnectionId", state.connectionId); validateCms("Url", state.serviceOrigin); validateCms("Url", state.destinationOrigin);
  validateCms("UInt", state.inspectionsAfter); validateCms("UInt", state.recoveriesAfter);
  for (const [id, saved] of Object.entries(state.inspections)) {
    validateCms("AttentionInspection", saved.instruction);
    if (id !== saved.instruction.inspection_id) throw new Error("Astro inspection identity changed.");
    if (saved.observation) validateCms("AttentionObservation", saved.observation);
    if (saved.report) validateCms("AttentionInspectionReport", saved.report);
    if (saved.result) validateCms("AttentionInspectionResult", saved.result);
  }
  for (const [id, saved] of Object.entries(state.recoveries)) {
    validateCms("AttentionRecovery", saved.event);
    if (id !== saved.event.recovery_id || !["observed", "claimed", "installed", "blocked"].includes(saved.phase)) throw new Error("Astro recovery identity changed.");
    if (saved.claim) validateCms("AttentionRecoveryClaim", saved.claim);
    if (saved.lease) validateCms("Lease", saved.lease);
  }
  for (const [id, saved] of Object.entries(state.restorations)) {
    validateCms("UUID", id); validateCms("UUID", saved.workId); validateCms("UUID", saved.inspectionId); validateCms("Sha256", saved.contextSha256);
    for (const digest of [saved.journalSha256, saved.baselineSha256]) validateCms("Sha256", digest);
    if (saved.operationId !== id || !["prepared", "restored"].includes(saved.phase) || typeof saved.file !== "string" || typeof saved.before !== "string" || typeof saved.candidate !== "string") throw new Error("Astro restoration journal requires reconciliation.");
    validateCms("Instant", saved.createdAt); if (saved.completedAt) validateCms("Instant", saved.completedAt);
  }
  if (state.commands !== undefined) {
    if (!state.commands || typeof state.commands !== "object" || Array.isArray(state.commands)) throw new Error("Astro baseline command journal requires reconciliation.");
    for (const [id, command] of Object.entries(state.commands)) {
      validateCms("UUID", id); validateCms("UUID", command.restorationOperationId); validateCms("Instant", command.startedAt);
      if (id !== command.operationId || !state.restorations[command.restorationOperationId] || !["starting", "running", "succeeded", "failed", "uncertain"].includes(command.phase)
        || typeof command.executable !== "string" || !path.isAbsolute(command.executable) || command.executable.includes("\0") || typeof command.cwd !== "string" || !path.isAbsolute(command.cwd)
        || !Array.isArray(command.args) || command.args.some(value => typeof value !== "string" || value.includes("\0")) || command.pid !== undefined && (!Number.isSafeInteger(command.pid) || command.pid < 1)) throw new Error("Astro baseline command bindings require reconciliation.");
      if (command.completedAt) validateCms("Instant", command.completedAt);
      if (command.terminationConfirmed) validateCms("Instant", command.childClosedAt);
    }
  }
  return state;
}
export async function readAttentionState(options: CmsCoordinatorOptions): Promise<AttentionState> {
  const expected = { format: "astro-attention-1" as const, connectionId: options.connectionId, serviceOrigin: new URL(options.serverUrl).origin, destinationOrigin: new URL(options.siteUrl).origin };
  const state = await readPrivateJournal(attentionFile(options), validate) ?? { ...expected, inspectionsAfter: 0, recoveriesAfter: 0, inspections: Object.create(null), recoveries: Object.create(null), restorations: Object.create(null) };
  if (state.connectionId !== expected.connectionId || state.serviceOrigin !== expected.serviceOrigin || state.destinationOrigin !== expected.destinationOrigin) throw new Error("Astro recovery scope changed; retained evidence requires reconciliation.");
  return state;
}
export const writeAttentionState = (options: CmsCoordinatorOptions, state: AttentionState) => writePrivateJournal(attentionFile(options), state, validate);
