import { type CmsCoordinatorOptions } from "./cms-coordinator.js";
import { type CmsMapping, type CmsSource, type CmsUrlMove, type CmsUrlMovePrepare, type CmsUrlMoveFinalize, type CmsUrlMoveAbort } from "./cms-client.js";
import { type CmsNativeState, type CmsNativeTransaction } from "./cms-state.js";
import { type CmsFinalizeOptions } from "./cms-static.js";
import { type CmsDeploymentReceipt } from "./cms-verification.js";
export interface CmsNativePresentationMove {
    phase: "intent" | "applied" | "committed" | "aborted" | "attention";
    file: string;
    before: string;
    oldOutput: string;
    output?: string;
    source: CmsSource;
    mapping: CmsMapping;
    prepare: CmsUrlMovePrepare;
    receipt?: CmsUrlMove;
    finalize?: CmsUrlMoveFinalize;
    abort?: CmsUrlMoveAbort;
    build?: {
        html: string;
        builtAt: string;
        sha256: string;
    };
    /** Immutable actual command receipt used ONLY for URL proof, never post18 settlement. */
    deployment?: CmsDeploymentReceipt;
    commandReceipt?: unknown;
}
export declare const presentationOf: (transaction: CmsNativeTransaction) => CmsNativePresentationMove | undefined;
export declare function assertCmsPresentationCurrent(context: {
    client: import("./cms-client.js").CmsClient;
    state: CmsNativeState;
}, transaction: CmsNativeTransaction, options: CmsCoordinatorOptions): Promise<import("./cms-client.js").CmsWorkQuery>;
/** Explicit native operator input; claims only receiver-created work, never creates a cycle. */
export declare function beginCmsNativeUrlMove(options: CmsCoordinatorOptions, mappingId: string, newUrl: string): Promise<{
    workId: string;
    moveId: string;
    phase: "committed" | "aborted" | "attention" | "applied";
    canonicalUrl: string;
    requiresBuild: boolean;
}>;
/** Same physical Markdown object; native collection slug is the consumer-owned URL mechanism. */
export declare function prepareCmsNativeUrlMove(options: CmsCoordinatorOptions, workId: string, newUrl: string): Promise<{
    workId: string;
    moveId: string;
    phase: "committed" | "aborted" | "attention" | "applied";
    canonicalUrl: string;
    requiresBuild: boolean;
}>;
export declare function recordCmsNativeMoveBuild(options: CmsCoordinatorOptions, buildDir: string): Promise<{
    recorded: string[];
}>;
/** URL proof/22 only; static18 and a second build/deploy remain separate. */
export declare function finalizeCmsNativeUrlMove(options: CmsFinalizeOptions, workId: string, deployment: CmsDeploymentReceipt, commandReceipt?: unknown): Promise<{
    workId: string;
    phase: string;
    requiresFreshBuild: boolean;
}>;
/** Truthful local restoration only; applied abort retains both receiver reservations. */
export declare function abortCmsNativeUrlMove(options: CmsCoordinatorOptions, workId: string): Promise<{
    workId: string;
    phase: "aborted" | "attention";
    nativeRestored: boolean;
    receiverReservationsRetained: boolean;
}>;
//# sourceMappingURL=cms-presentation.d.ts.map