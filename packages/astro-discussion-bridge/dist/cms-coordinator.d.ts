import { CmsClient, type CmsClientOptions, type CmsConnection, type CmsMapping, type CmsSource } from "./cms-client.js";
import { type CmsNativeState } from "./cms-state.js";
export interface CmsCoordinatorOptions extends CmsClientOptions {
    /** Native publication is configured explicitly; the sole wire is V4. */
    docsDir: string;
    siteUrl: string;
    stateFile: string;
    routeBase?: string;
}
export interface CmsCoordinatorContext {
    client: CmsClient;
    connection: CmsConnection;
    state: CmsNativeState;
    save: () => Promise<void>;
}
export declare function withCmsCoordinator<T>(options: CmsCoordinatorOptions, action: (context: CmsCoordinatorContext) => Promise<T>): Promise<T>;
/** One bounded page per call; persist complete staged events before its cursor. */
export declare function pollCmsSources(options: CmsCoordinatorOptions): Promise<{
    staged: number;
    continuation: string | null;
    checkpoint: string | null;
    stream: "initial" | "changes";
}>;
/** Native file reservation uses the existing routeBase and Astro page ID scheme. */
export declare function cmsNativeReservation(options: CmsCoordinatorOptions, source: Pick<CmsSource, "source_id">): {
    nativeId: string;
    canonicalUrl: string;
    externalId: string;
    file: string;
};
export declare function reserveCmsSource(options: CmsCoordinatorOptions, sourceId: string): Promise<CmsMapping>;
/** A committed URL move changes the route, never physical native identity. */
export declare function cmsNativeLocation(options: CmsCoordinatorOptions, state: CmsNativeState, sourceId: string): {
    nativeId: string;
    canonicalUrl: string;
    externalId: string;
    file: string;
};
export declare function claimCmsNativeWork(options: CmsCoordinatorOptions, mappingId?: string, intake?: boolean): Promise<{
    workId: string;
    mappingId: string;
    transactionId: string;
    stage: "aborted" | "attention" | "prepared" | "claimed" | "staged" | "verified";
    leaseGeneration: number;
} | undefined>;
/** Caller already holds this native coordinator's writer; no nested lock. */
export declare function claimCmsNativeWorkInContext({ client, state, connection, save }: CmsCoordinatorContext, mappingId?: string, expectedWorkId?: string, intake?: boolean): Promise<{
    workId: string;
    mappingId: string;
    transactionId: string;
    stage: "aborted" | "attention" | "prepared" | "claimed" | "staged" | "verified";
    leaseGeneration: number;
} | undefined>;
//# sourceMappingURL=cms-coordinator.d.ts.map