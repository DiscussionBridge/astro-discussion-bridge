import type { CmsToRecord, CmsToRecordMetadata, CmsToResult, CmsToWithdrawInput } from "./cms-to.js";
import type { CmsPublishedProof } from "./cms-verification.js";
export interface CmsClientOptions {
    serverUrl: string;
    connectionId: string;
    connectionSecret?: string;
    secretFile?: string;
    fetchImplementation?: typeof fetch;
}
export interface CmsSource {
    source_id: string;
    source_revision: string;
    topic_id: string;
    topic_url: string;
    title: string;
    content_sha256: string;
    content_bytes: number;
    source_created_at: string | null;
    source_updated_at: string | null;
    source_authors: Array<{
        id: string;
        name: string;
    }>;
}
export type CmsEvent = {
    event_type: "publication";
    event_id: string;
    event_sequence: string;
    source: CmsSource;
} | {
    event_type: "revocation";
    event_id: string;
    event_sequence: string;
    source_id: string;
    last_source_revision: string | null;
    reason: string;
};
export interface CmsFeed {
    stream: "initial" | "changes";
    items: CmsEvent[];
    next_cursor: string | null;
    checkpoint_cursor: string | null;
}
export interface CmsWork {
    work_id: string;
    mapping_id: string;
    source_id: string;
    source_revision: string | null;
    policy_revision: string;
    action: "publish_revision" | "withdraw";
    state: string;
    attempt_cycle: string;
    attempt: number;
    lease_generation: number;
    retry_at: string | null;
    last_failure_code: string | null;
}
export interface CmsLease {
    work: CmsWork;
    lease_token: string;
    lease_generation: number;
    expires_at: string;
    server_time: string;
}
export interface CmsAuthority {
    work_id: string;
    lease_token: string;
    lease_generation: number;
    source_revision: string | null;
    policy_revision: string;
}
export interface CmsMapping extends Record<string, unknown> {
    mapping_id: string;
    resource_id: string;
    connection_id: string;
    source_id: string;
    external_id: string;
    mapping_revision: string;
    destination_native_id: string | null;
    canonical_url: string;
    desired_source_revision: string | null;
    destination_native_revision: string | null;
    presentation_mode: "simple" | "full" | "interactive";
}
export interface CmsConnection extends Record<string, unknown> {
    connection_id: string;
    profile: string;
    destination_origin: string;
    scope_revision: string;
    forum_name: string;
    directions: string[];
    publication_lane: string;
    policy: {
        enabled: boolean;
        policy_revision: string;
        publication_kind: string;
        presentation_mode: string;
        author_ids: string[];
        taxonomy_ids: string[];
    };
    native_capabilities: {
        publication_kind: string;
        supported_presentations: string[];
        complete_content_supported: boolean;
    };
}
export interface CmsWorkQuery {
    work: CmsWork;
    mapping: CmsMapping;
    lease_expires_at: string | null;
}
export interface CmsOwnership {
    resource_id: string;
    external_id: string;
    native_id: string;
    canonical_url: string;
    source_revision: string | null;
    ownership_receipt_sha256: string;
}
export interface CmsUrlMovePrepare {
    mutation_id: string;
    authority: CmsAuthority;
    expected_mapping_revision: string;
    old_url: string;
    new_url: string;
    ownership: CmsOwnership;
}
export interface CmsUrlMove {
    move_id: string;
    mapping_id: string;
    expected_mapping_revision: string;
    old_url: string;
    new_url: string;
    proof_nonce: string;
    state: "prepared" | "committed" | "aborted" | "attention";
    prepared_at: string;
}
export interface CmsUrlMoveFinalize {
    mutation_id: string;
    authority: CmsAuthority;
    move_id: string;
    proof_nonce: string;
    ownership: CmsOwnership;
    verification: CmsPublishedProof;
}
export interface CmsUrlMoveAbort {
    mutation_id: string;
    authority: CmsAuthority;
    move_id: string;
    native_change_applied: boolean;
    ownership: CmsOwnership;
}
export interface CmsSourceUrlMovePrepare {
    mutation_id: string;
    expected_source_revision: string;
    old_url: string;
    new_url: string;
    external_id: string;
}
export interface CmsSourceUrlMove {
    move_id: string;
    resource_id: string;
    expected_source_revision: string;
    old_url: string;
    new_url: string;
    proof_nonce: string;
    state: "prepared" | "committed" | "aborted" | "attention";
    prepared_at: string;
}
export interface CmsSourceUrlVerification {
    url: string;
    external_id: string;
    source_revision: string;
    source_content_sha256: string;
    native_ownership_receipt_sha256: string;
    native_publication_sha256: string;
    verification_profile: string;
    checked_at: string;
}
export interface CmsSourceUrlMoveFinalize {
    mutation_id: string;
    move_id: string;
    proof_nonce: string;
    expected_source_revision: string;
    verification: CmsSourceUrlVerification;
    new_source_revision: string;
    source_updated_at: string | null;
}
export interface CmsSourceUrlMoveAbort {
    mutation_id: string;
    move_id: string;
    expected_source_revision: string;
    native_change_applied: boolean;
    old_url: string;
    native_ownership_receipt_sha256: string;
}
export interface CmsUrlHistoryPage {
    items: {
        url: string;
        retired_at: string;
        move_id: string;
    }[];
    next_cursor: string | null;
}
export declare class CmsRequestError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    readonly retryAfterSeconds: number | null;
    readonly routeId?: string | undefined;
    readonly httpStatus?: number | undefined;
    constructor(code: string, retryable: boolean, retryAfterSeconds: number | null, routeId?: string | undefined, httpStatus?: number | undefined);
}
export interface CmsValidatedErrorResponse {
    routeId: string;
    httpStatus: number;
    requestSha256: string;
    candidateId: string;
    schemaSha256: string;
    contractSha256: string;
    envelope: {
        outcome: "rejected";
        code: string;
        retryable: boolean;
        retry_after_seconds: number | null;
        correlation_id: string | null;
        core_fallback: false;
    };
}
/** Only an actual codec-validated response from this client's exact request. */
export declare function validatedCmsErrorResponse(error: unknown, client: CmsClient, routeId: string, body: object): CmsValidatedErrorResponse | undefined;
/** Single current V4 closed-schema transport. */
export declare class CmsClient {
    private readonly options;
    readonly origin: string;
    private readonly credentials;
    private readonly fetchImplementation;
    constructor(options: CmsClientOptions);
    request<T>(id: string, input?: {
        body?: object;
        query?: Record<string, string | number>;
        path?: Record<string, string>;
    }): Promise<T>;
    connection(): Promise<CmsConnection>;
    resolveTo(body: {
        mutation_id: string;
        bridge_record: CmsToRecord;
    }): Promise<CmsToResult>;
    records(cursor?: string): Promise<{
        items: CmsToRecordMetadata[];
        next_cursor: string | null;
    }>;
    record(resourceId: string): Promise<CmsToRecordMetadata>;
    withdrawRecord(resourceId: string, body: CmsToWithdrawInput): Promise<CmsToRecordMetadata>;
    prepareSourceUrlMove(resourceId: string, body: CmsSourceUrlMovePrepare): Promise<CmsSourceUrlMove>;
    finalizeSourceUrlMove(resourceId: string, moveId: string, body: CmsSourceUrlMoveFinalize): Promise<CmsToRecordMetadata>;
    abortSourceUrlMove(resourceId: string, moveId: string, body: CmsSourceUrlMoveAbort): Promise<CmsSourceUrlMove>;
    sourceUrlHistory(resourceId: string, cursor?: string): Promise<CmsUrlHistoryPage>;
    sources(stream: "initial" | "changes", cursor?: string): Promise<CmsFeed>;
    claim(mutationId: string, mappingId?: string): Promise<CmsLease | undefined>;
    query(workId: string): Promise<CmsWorkQuery>;
    prepareUrlMove(mappingId: string, body: CmsUrlMovePrepare): Promise<CmsUrlMove>;
    finalizeUrlMove(mappingId: string, moveId: string, body: CmsUrlMoveFinalize): Promise<CmsMapping>;
    abortUrlMove(mappingId: string, moveId: string, body: CmsUrlMoveAbort): Promise<CmsUrlMove>;
    renew(mutationId: string, authority: CmsAuthority): Promise<CmsLease>;
    content(source: CmsSource): Promise<string>;
}
//# sourceMappingURL=cms-client.d.ts.map