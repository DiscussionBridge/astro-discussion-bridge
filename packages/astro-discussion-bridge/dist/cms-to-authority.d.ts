import type { CmsClient, CmsConnection } from "./cms-client.js";
import type { CmsToState, CmsToRecordMetadata, CmsToBody } from "./cms-to.js";
import type { PublicationOperation, PublicationOperationalState, NativeSourceCensus } from "./operational-state.js";
import type { PublishControlledDiscussionsOptions } from "./controlled-creation.js";
import { type SourceNativeCapture } from "./to-source-profile.js";
export interface CmsToScope {
    connectionId: string;
    serverOrigin: string;
    siteOrigin: string;
    scopeRevision: string;
    lane: string;
}
/** Captured by the native writer BEFORE first dispatch, never retrofitted to old intents. */
export interface CmsToNativeIntent {
    census: NativeSourceCensus;
    relativePath: string;
    dev: string;
    ino: string;
    contentSha256: string;
}
export interface CmsToQualification {
    version: 1;
    parent: string;
    priorScope: CmsToScope;
    scope: CmsToScope;
    checkedAt: string;
    native: {
        census: NativeSourceCensus;
        relativePath: string;
        dev: string | null;
        ino: string | null;
        contentSha256: string | null;
        censusSha256: string;
    };
    identity: {
        externalId: string;
        resourceId: string | null;
        topicId: string | null;
        canonicalUrl: string;
    };
    record: CmsToRecordMetadata | null;
    pending: CmsToBody | null;
    nativeCapture: SourceNativeCapture | null;
    sha256: string;
}
export declare const effectiveToScope: (to: CmsToState) => CmsToScope;
export declare function validateToNativeIntent(intent: CmsToNativeIntent): void;
/** Verify the historical chain against itself, not against later legitimate editions. */
export declare function validateToQualifications(to: CmsToState): void;
export declare function currentToScope(client: CmsClient, connection: CmsConnection, siteUrl: string, lane?: string): CmsToScope;
export declare function assertToScope(to: CmsToState, client: CmsClient, connection: CmsConnection, siteUrl: string, lane?: string): void;
/** The complete pre-build batch shares only fresh writer-bound observations,
 * never saved authority. Targeted entry points use this same engine for one. */
export declare function qualifyCurrentToAuthorities(options: PublishControlledDiscussionsOptions, state: PublicationOperationalState, operations: PublicationOperation[], client: CmsClient, connection: CmsConnection, persist: () => Promise<void>): Promise<void>;
export declare function qualifyCurrentToAuthority(options: PublishControlledDiscussionsOptions, state: PublicationOperationalState, operation: PublicationOperation, client: CmsClient, connection: CmsConnection, persist: () => Promise<void>): Promise<void>;
//# sourceMappingURL=cms-to-authority.d.ts.map