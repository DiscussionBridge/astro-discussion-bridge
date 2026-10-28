import { CmsClient, type CmsConnection, type CmsValidatedErrorResponse } from "./cms-client.js";
import type { PublicationOperation } from "./operational-state.js";
import { type NativeArticleCapture } from "./native-preparation.js";
import type { SourceNativeCapture } from "./to-source-profile.js";
import type { CmsToSourceMove, CmsToEffectiveEdition } from "./cms-to-source-state.js";
export interface CmsToRecord {
    direction: "to_discourse";
    external_id: string;
    canonical_url: string;
    title: string;
    content_html: string;
    published: true;
    source_revision: string;
    expected_source_revision: string | null;
    source_created_at: string | null;
    source_updated_at: string | null;
    representation: {
        kind: "full";
    } | {
        kind: "generated_excerpt";
        read_more_url: string;
        article_content_bytes: number;
        article_content_sha256: string;
        selection_source_revision: string;
        selection_full_request_bytes: number;
    };
    source_content_sha256: string;
    source_content_bytes: number;
    lane: string;
    adapter_id: string;
    adapter_version: string;
    correlation_id: string;
    visibility: "unlisted";
    source_authors?: {
        id: string;
        name: string;
    }[];
    primary_source_author_id?: string;
    existing_topic_id?: string;
}
export interface CmsToResult {
    outcome: "created" | "resolved" | "updated";
    reason: string;
    resource_id: string;
    topic_id: string;
    topic_url: string;
    direction: "to_discourse";
    source_revision: string;
    synchronized_at: string;
    core_fallback: false;
}
export interface CmsToRecordMetadata {
    resource_id: string;
    direction: string;
    state: string;
    topic_id: string;
    topic_url: string;
    external_id: string;
    canonical_url: string;
    source_revision: string | null;
    source_created_at: string | null;
    source_updated_at: string | null;
    synchronized_at: string | null;
    mapping_id: string | null;
}
export type CmsToRevocationReason = "source_unpublished" | "source_deleted" | "source_ineligible" | "policy_excluded";
export interface CmsToWithdrawInput {
    mutation_id: string;
    expected_source_revision: string;
    reason: CmsToRevocationReason;
}
export type CmsToBody = {
    mutation_id: string;
    bridge_record: CmsToRecord;
};
/** Actual validated receiver rejection of this exact request, not uncertainty. */
export interface CmsToPreservationRejection {
    code: "content_preservation_unavailable";
    routeId: "V4-02";
    httpStatus: 422;
    retryable: false;
    retryAfterSeconds: null;
    requestSha256: string;
    recordedAt: string;
    validatedResponse: CmsValidatedErrorResponse;
}
/** Missing historical diagnostics stay unknown; exact validated call linkage is required. */
export interface CmsToInvalidFieldRejection extends Omit<CmsToPreservationRejection, "code" | "validatedResponse" | "recordedAt"> {
    code: "invalid_field";
    recordedAt?: string;
    validatedResponse: Pick<CmsValidatedErrorResponse, "routeId" | "httpStatus"> & Partial<Pick<CmsValidatedErrorResponse, "requestSha256" | "candidateId" | "schemaSha256" | "contractSha256">> & {
        envelope: Omit<CmsValidatedErrorResponse["envelope"], "correlation_id"> & {
            correlation_id?: string | null;
        };
    };
}
export type CmsToRejection = CmsToPreservationRejection | CmsToInvalidFieldRejection;
export interface CmsToPending {
    body: CmsToBody;
    fingerprint: string;
    captureId?: string;
    rejection?: CmsToRejection;
    retryOf?: string;
}
export interface CmsToRetryIntent {
    refusedMutationId: string;
    refusedRequestSha256: string;
    fingerprint: string;
    requestedAt: string;
    expectedAcceptedRevision: string | null;
    native: {
        docsDir: string;
        relativePath: string;
        contentSha256: string;
    };
    phase: "armed" | "pending" | "accepted" | "rejected" | "superseded";
    freshMutationId?: string;
}
export interface CmsToState {
    sourceFence?: number;
    nativeCapture?: SourceNativeCapture;
    sourceMove?: CmsToSourceMove;
    sourceMoveHistory?: Record<string, CmsToSourceMove>;
    effectiveEdition?: CmsToEffectiveEdition;
    retainedSource?: {
        articleSha256: string;
        captureId: string;
    };
    scope: {
        connectionId: string;
        serverOrigin: string;
        siteOrigin: string;
        scopeRevision: string;
        lane: string;
    };
    nativeSource?: {
        docsDir: string;
        relativePath: string;
    };
    acceptedRevision?: string;
    acceptedFingerprint?: string;
    acceptedResult?: CmsToResult;
    acceptedBody?: CmsToBody;
    receipts: Record<string, {
        body: CmsToBody;
        result: CmsToResult;
        captureId?: string;
        retryOf?: string;
    }>;
    articleCaptures?: Record<string, NativeArticleCapture>;
    acceptedCaptureId?: string;
    pending?: CmsToPending;
    rejectedRequests?: Record<string, CmsToPending & {
        rejection: CmsToRejection;
    }>;
    retryIntents?: Record<string, CmsToRetryIntent>;
    withdrawal?: {
        body: CmsToWithdrawInput;
        native: {
            docsDir: string;
            relativePath: string;
            contentSha256: string | null;
        };
        before: CmsToRecordMetadata;
        phase: "pending" | "withdrawn";
        result?: CmsToRecordMetadata;
        current?: CmsToRecordMetadata;
    };
}
export interface CmsToPage {
    preparation: NativeArticleCapture;
    pageUrl: string;
    title: string;
    externalId: string;
    contentHtml: string;
    sourceAuthors?: {
        id: string;
        name: string;
    }[];
    primarySourceAuthorId?: string;
    createdAt: string | null;
    updatedAt: string | null;
    existingResourceId?: string;
    existingTopicId?: string;
    coreTopicId?: string;
}
export declare function cmsToFingerprint(page: CmsToPage, lane: string): string;
/** Exact current V4 transport inside the one native source publisher. */
export declare function resolveCmsToPage(input: {
    client: CmsClient;
    connection: CmsConnection;
    operation: PublicationOperation;
    page: CmsToPage;
    lane?: string;
    excerptArticle: (html: string, maximum: number) => string;
    persist: () => Promise<void>;
    assertCurrentNative: () => Promise<void>;
}): Promise<CmsToResult>;
export declare function assertCmsTopicUrl(value: string, topicId: string, origin: string): void;
//# sourceMappingURL=cms-to.d.ts.map