import { type CmsAttentionOptions } from "./cms-attention-native.js";
/** Read actual native state and report facts; never stages, restores or runs a command. */
export declare function checkCmsAttention(options: CmsAttentionOptions): Promise<{
    supported: boolean;
    reported: number;
    inspections: {
        inspectionId: string;
        workId: string;
        contextSha256: string;
        journalSha256: string | null;
        nativeState: "baseline" | "never_applied" | "candidate_applied" | "restored_baseline" | "conflict" | "unknown" | "unavailable" | "unsupported" | null;
        status: string;
        issue: "none" | "native_conflict" | "baseline_missing" | "public_proof_unavailable" | "uncertain_mutation" | "active_command" | "uncertain_command" | "partial_files" | "url_move_open" | "metadata_unavailable" | "context_changed" | "unsupported_profile" | "collector_unavailable";
    }[];
}>;
/** Discover only positive Core admission events; old attention work is never reclaimed. */
export declare function synchronizeCmsAttentionRecoveries(options: CmsAttentionOptions): Promise<{
    supported: boolean;
    installed: string[];
    blocked: string[];
}>;
//# sourceMappingURL=cms-attention.d.ts.map