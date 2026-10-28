import type { CmsSourceUrlMovePrepare, CmsSourceUrlMove, CmsSourceUrlMoveFinalize, CmsSourceUrlMoveAbort, CmsValidatedErrorResponse } from "./cms-client.js";
import type { CmsToRecord, CmsToRecordMetadata, CmsToState } from "./cms-to.js";
import type { SourceNativeCapture } from "./to-source-profile.js";
export interface SourceNativeCommand {
    executable: string;
    args: string[];
    cwd: string;
    timeoutMs?: number;
}
export interface SourceCommandReceipt {
    commandId: string;
    kind: "build" | "deploy";
    phase: "starting" | "running" | "succeeded" | "failed" | "uncertain";
    executable: string;
    args: string[];
    cwd: string;
    fence: number;
    startedAt: string;
    pid?: number;
    completedAt?: string;
    childClosedAt?: string;
    terminationConfirmed?: boolean;
    deploymentId: string;
    processReceiptFile?: string;
    writerBusyDeferrals?: number;
}
export interface CmsToSourceMove {
    phase: "intent" | "reserved" | "native_applied" | "built" | "deployed" | "finalize_pending" | "committed" | "abort_pending" | "aborted" | "attention" | "known_rejected";
    file: string;
    nativeId: string;
    fence: number;
    before: string;
    beforeRecord: CmsToRecordMetadata;
    beforeCapture: SourceNativeCapture;
    captureId: string;
    beforeToRecord: CmsToRecord;
    originalKey: string;
    newSlug: string;
    prepareBody: CmsSourceUrlMovePrepare;
    receipt?: CmsSourceUrlMove;
    newRevision?: string;
    projected?: CmsToRecord;
    output?: string;
    nativeCapture?: SourceNativeCapture;
    finalizeBody?: CmsSourceUrlMoveFinalize;
    result?: CmsToRecordMetadata;
    abortBody?: CmsSourceUrlMoveAbort;
    abortResult?: CmsSourceUrlMove;
    commands?: Partial<Record<"build" | "deploy", SourceCommandReceipt>>;
    deployedAt?: string;
    deploymentId?: string;
    knownRejection?: CmsValidatedErrorResponse;
    lastError?: string;
}
export interface CmsToEffectiveEdition {
    record: CmsToRecord;
    captureId: string;
    moveId: string;
    parentRevision: string;
}
export declare const activeSourceMove: (move: CmsToSourceMove | undefined) => boolean;
export declare function validateToSourceState(to: CmsToState): void;
//# sourceMappingURL=cms-to-source-state.d.ts.map