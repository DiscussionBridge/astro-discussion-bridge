import { withPublicationOperationalStateLock } from "./native-locks.js";
import { CmsClient, type CmsConnection, type CmsEvent, type CmsFeed, type CmsLease, type CmsMapping } from "./cms-client.js";
import { type NativeArticleCapture } from "./native-preparation.js";
export interface CmsNativeState {
    schemaVersion: 1;
    wireVersion: "v4";
    adapterId: "astro-cms-static";
    connectionId: string;
    serviceOrigin: string;
    destinationOrigin: string;
    scopeRevision: string | null;
    policyRevision: string | null;
    stream: "initial" | "changes";
    cursor: string | null;
    checkpoint: string | null;
    events: Record<string, CmsEvent>;
    sources: Record<string, CmsEvent>;
    mappings: Record<string, CmsMapping>;
    generations: Record<string, number>;
    transactions: Record<string, CmsNativeTransaction>;
    reservations?: Record<string, {
        body: {
            mutation_id: string;
            source_id: string;
            source_revision: string;
            policy_revision: string;
            external_id: string;
            canonical_url: string;
        };
    }>;
    pendingClaim?: {
        body: {
            mutation_id: string;
            mapping_id?: string;
        };
    };
    nativeCommand?: unknown;
    /** Accepted V4 URL ancestry, separate from immutable prior verified transactions. */
    nativeLocations?: Record<string, {
        canonicalUrl: string;
        nativeId: string;
        moveId: string;
        mappingRevision: string;
    }>;
}
export interface CmsNativeTransaction {
    lease: CmsLease;
    transactionId: string;
    stage: "claimed" | "staged" | "prepared" | "verified" | "aborted" | "attention";
    articleCapture?: NativeArticleCapture;
    localLimitation?: {
        kind: "media_preservation" | "native_preparation";
        detail: string;
        source: import("./cms-client.js").CmsSource;
        content: string;
        recordedAt: string;
    };
    [key: string]: unknown;
}
export declare function emptyCmsState(client: CmsClient, destinationOrigin: string, connectionId: string): CmsNativeState;
export declare function readCmsState(file: string, expected: CmsNativeState): Promise<CmsNativeState>;
/** Same native state-file exclusion mechanism as preserved To operation state. */
export declare const withCmsStateLock: typeof withPublicationOperationalStateLock;
export declare function writeCmsState(file: string, state: CmsNativeState): Promise<void>;
export declare function assertCmsConnection(connection: CmsConnection, state: CmsNativeState): void;
export declare function stageCmsFeedPage(state: CmsNativeState, feed: CmsFeed): void;
export declare function stageCmsClaim(state: CmsNativeState, lease: CmsLease): CmsNativeTransaction;
//# sourceMappingURL=cms-state.d.ts.map