import type { CmsNativeState, CmsNativeTransaction } from "./cms-state.js";
import type { CmsAuthority, CmsValidatedErrorResponse } from "./cms-client.js";
export interface CmsWorkRequest {
    route: "V4-15" | "V4-18";
    body: Record<string, unknown>;
    response?: unknown;
    refusal?: CmsValidatedErrorResponse;
    /** An observed legacy local phase, never a synthesized wire receipt. */
    observedPrepared?: true;
}
export interface CmsRenewalIntent {
    body: {
        mutation_id: string;
        authority: CmsAuthority;
    };
}
export declare function workRequest(transaction: CmsNativeTransaction, route: CmsWorkRequest["route"], body: object): CmsWorkRequest;
export declare function workRequestResponse(transaction: CmsNativeTransaction, entry: CmsWorkRequest, response: unknown): void;
export declare function workRequestRefusal(entry: CmsWorkRequest, proof: CmsValidatedErrorResponse): void;
export declare function expiryRefusal(entry: CmsWorkRequest): string | undefined;
export declare function validateWorkRequestHistory(transaction: CmsNativeTransaction): void;
/** Current local command/settlement ownership cannot be bypassed by a fresh Claim. */
export declare function assertWorkReclaimAllowed(state: CmsNativeState, transaction: CmsNativeTransaction): void;
//# sourceMappingURL=cms-work-requests.d.ts.map