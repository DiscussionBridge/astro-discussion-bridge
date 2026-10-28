import { CmsClient } from "./cms-client.js";
import { type CmsNativeState } from "./cms-state.js";
import { type CmsCoordinatorOptions } from "./cms-coordinator.js";
import type { AttentionInspection, AttentionObservation, AttentionRecovery, AttentionState } from "./cms-attention-types.js";
export interface CmsAttentionOptions extends CmsCoordinatorOptions {
    publicFetchImplementation?: typeof fetch;
    afterRestoreRecorded?: () => Promise<void>;
    afterRestoreWritten?: () => Promise<void>;
}
export declare const attentionHash: (value: string) => string;
export declare function attentionJournalHash(state: CmsNativeState, workId: string): string;
/** Called only under the current native content/state writer; never writes. */
export declare function collectCmsAttentionNative(options: CmsAttentionOptions, inspection: AttentionInspection, state: CmsNativeState, client: CmsClient, recovery: AttentionState, admission?: AttentionRecovery): Promise<AttentionObservation>;
export declare function inspectCmsAttentionNative(options: CmsAttentionOptions, inspection: AttentionInspection): Promise<AttentionObservation>;
/** Explicit native-owner action. Check never calls this function. */
export declare function restoreCmsAttentionBaseline(options: CmsAttentionOptions, inspection: AttentionInspection, expectedJournalSha256: string): Promise<{
    operationId: string;
    workId: string;
    phase: "restored";
    nativeRestored: boolean;
    publicRestored: boolean;
    requiresFreshCheck: boolean;
}>;
//# sourceMappingURL=cms-attention-native.d.ts.map