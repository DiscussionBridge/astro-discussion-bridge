import { type CmsCoordinatorOptions } from "./cms-coordinator.js";
import { type CmsAuthority, type CmsMapping, type CmsSource, type CmsWorkQuery } from "./cms-client.js";
import { type CmsNativeState, type CmsNativeTransaction } from "./cms-state.js";
import { type CmsDeploymentReceipt } from "./cms-verification.js";
import { validateCms } from "../src/private/cms-runtime.mjs";
type NativeResult = {
    kind: "publish_revision" | "withdraw";
    native_id: string;
    external_id: string;
    canonical_url: string;
    native_revision: string | null;
    ownership_receipt_sha256: string;
    representation?: {
        kind: "full";
        source_content_sha256: string;
    };
};
export interface StagePlan {
    file: string;
    previous: string | null;
    output: string;
    nativeResult: NativeResult;
    source: CmsSource | null;
    mapping: CmsMapping;
    moveProof?: import("./cms-verification.js").CmsMoveExpectation;
}
type Transaction = CmsNativeTransaction & {
    plan?: StagePlan;
    prepareBody?: {
        mutation_id: string;
        authority: CmsAuthority;
        transaction_id: string;
        native_result: NativeResult;
        prepared_at: string;
    };
    preparedAt?: string;
    buildArtifact?: {
        html: string | null;
        sha256: string | null;
        builtAt: string;
    };
    finalizeBody?: {
        mutation_id: string;
        authority: CmsAuthority;
        transaction_id: string;
        deployment_id: string;
        deployed_at: string;
        verification: ReturnType<typeof validateCms>;
    };
    abortBody?: {
        mutation_id: string;
        authority: CmsAuthority;
        transaction_id: string;
        native_restored: boolean;
        safe_detail: string | null;
    };
    failureBody?: {
        mutation_id: string;
        authority: CmsAuthority;
        code: string;
        native_change_applied: boolean;
        safe_detail: string | null;
        retry_after_seconds: null;
    };
    publiclyVerifiedAt?: string;
};
export declare const cmsAuthority: (transaction: CmsNativeTransaction) => CmsAuthority;
declare function assertRenewed(transaction: Transaction, lease: Transaction["lease"]): void;
declare function assertCurrent(state: CmsNativeState, transaction: Transaction, current: CmsWorkQuery): void;
declare function sourceFor(state: CmsNativeState, transaction: Transaction): CmsSource;
declare function validateNativeOwnership(contents: string, mapping: CmsMapping, nativeId: string, state: CmsNativeState): Record<string, unknown>;
export declare function prepareCmsNativeWork(options: CmsCoordinatorOptions, workId: string): Promise<{
    workId: string;
    transactionId: string;
    nativeId: string;
    canonicalUrl: string;
    stage: "prepared";
}>;
declare function builtArtifact(buildDir: string, canonicalUrl: string, notBefore?: string): Promise<string | null>;
/** Native post-build hook captures the actual complete artifact before deployment. */
export declare function recordCmsNativeBuild(options: CmsCoordinatorOptions, buildDir: string): Promise<{
    recorded: string[];
}>;
/** Internal native primitives shared by ordinary publication and URL movement. */
export declare const cmsStaticNative: {
    hash: (value: string) => string;
    publicationBody: (contents: string) => string;
    nativeRevisionFor: (body: string, fields: Record<string, unknown>) => string;
    assertRenewed: typeof assertRenewed;
    assertCurrent: typeof assertCurrent;
    sourceFor: typeof sourceFor;
    validateNativeOwnership: typeof validateNativeOwnership;
    builtArtifact: typeof builtArtifact;
};
export interface CmsFinalizeOptions extends CmsCoordinatorOptions {
    publicFetchImplementation?: typeof fetch;
}
/** Deployment is caller-owned; this method executes only anonymous proof and exact settlement. */
export declare function finalizeCmsNativeWork(options: CmsFinalizeOptions, workId: string, deployment: CmsDeploymentReceipt): Promise<{
    workId: string;
    transactionId: string;
    stage: "verified";
    publiclyVerifiedAt: string;
}>;
/** Explicit rollback of only this exact owned native file; never deployment rollback. */
export declare function abortCmsNativeWork(options: CmsCoordinatorOptions, workId: string): Promise<{
    workId: string;
    transactionId: string;
    stage: "aborted" | "attention";
    nativeRestored: boolean;
}>;
export {};
//# sourceMappingURL=cms-static.d.ts.map