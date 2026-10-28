import type { CmsLease, CmsMapping, CmsOwnership, CmsSource, CmsWork } from "./cms-client.js";
import type { StagePlan } from "./cms-static.js";
export type AttentionNativeResult = StagePlan["nativeResult"];
export interface AttentionPrepared {
    transaction_id: string;
    work_id: string;
    lease_generation: number;
    action: string;
    source_revision: string | null;
    policy_revision: string;
    native_result: AttentionNativeResult;
    prepared_at: string;
    deployment_id: string | null;
    deployed_at: string | null;
}
export interface AttentionInspection {
    sequence: number;
    inspection_id: string;
    context_sha256: string;
    work: CmsWork;
    mapping: CmsMapping;
    source: CmsSource | null;
    native_result: AttentionNativeResult | null;
    verified_native_result: AttentionNativeResult | null;
    verification: Record<string, unknown> | null;
    prepared_transaction: AttentionPrepared | null;
    created_at: string;
}
export interface AttentionObservation {
    profile: "astro-static-1";
    observed_at: string;
    native_state: "baseline" | "never_applied" | "candidate_applied" | "restored_baseline" | "conflict" | "unknown" | "unavailable" | "unsupported";
    object_exists: boolean | null;
    native_id: string | null;
    native_revision: string | null;
    ownership: CmsOwnership | null;
    native_result: AttentionNativeResult | null;
    verification: Record<string, unknown> | null;
    source_revision: string | null;
    managed_content_sha256: string | null;
    native_command: "none" | "settled" | "active" | "uncertain";
    pending_mutation: "none" | "settled" | "uncertain";
    prepared_transaction_id: string | null;
    journal_sha256: string | null;
    baseline_sha256: string | null;
    candidate_sha256: string | null;
    current_sha256: string | null;
    restoration_operation_id: string | null;
    issue: "none" | "native_conflict" | "baseline_missing" | "public_proof_unavailable" | "uncertain_mutation" | "active_command" | "uncertain_command" | "partial_files" | "url_move_open" | "metadata_unavailable" | "context_changed" | "unsupported_profile" | "collector_unavailable";
}
export interface AttentionResult {
    inspection_id: string;
    context_sha256: string;
    status: string;
    issue: AttentionObservation["issue"];
    observed_at: string | null;
}
export interface AttentionRecovery {
    sequence: number;
    recovery_id: string;
    inspection_id: string;
    context_sha256: string;
    predecessor_work_id: string;
    predecessor_attempt_cycle: string;
    work: CmsWork;
    mapping: CmsMapping;
    source: CmsSource | null;
    mode: "retry" | "settle_restored_baseline";
    native_baseline: AttentionNativeResult | null;
    verification: Record<string, unknown> | null;
    created_at: string;
}
export interface AttentionRestore {
    operationId: string;
    workId: string;
    inspectionId: string;
    contextSha256: string;
    journalSha256: string;
    file: string;
    before: string;
    candidate: string;
    baselineSha256: string;
    phase: "prepared" | "restored";
    createdAt: string;
    completedAt?: string;
}
export interface AttentionCommand {
    operationId: string;
    restorationOperationId: string;
    phase: "starting" | "running" | "succeeded" | "failed" | "uncertain";
    executable: string;
    args: string[];
    cwd: string;
    startedAt: string;
    pid?: number;
    completedAt?: string;
    childClosedAt?: string;
    terminationConfirmed?: boolean;
}
export interface AttentionState {
    format: "astro-attention-1";
    connectionId: string;
    serviceOrigin: string;
    destinationOrigin: string;
    inspectionsAfter: number;
    recoveriesAfter: number;
    inspections: Record<string, {
        instruction: AttentionInspection;
        observation?: AttentionObservation;
        report?: {
            mutation_id: string;
            context_sha256: string;
            observation: AttentionObservation;
        };
        result?: AttentionResult;
    }>;
    recoveries: Record<string, {
        event: AttentionRecovery;
        claim?: {
            mutation_id: string;
            work_id: string;
        };
        lease?: CmsLease;
        phase: "observed" | "claimed" | "installed" | "blocked";
    }>;
    restorations: Record<string, AttentionRestore>;
    commands?: Record<string, AttentionCommand>;
}
//# sourceMappingURL=cms-attention-types.d.ts.map