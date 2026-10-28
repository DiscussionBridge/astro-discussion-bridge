import { type CmsSource } from "./cms-client.js";
export declare const ASTRO_VERIFICATION_PROFILE = "discussionbridge-astro-static-html-1";
export declare const ASTRO_MOVE_VERIFICATION_PROFILE = "discussionbridge-astro-static-html-move-1";
export interface CmsMoveExpectation {
    moveId: string;
    nonce: string;
    ownershipSha256: string;
}
export interface CmsRenderedExpectation {
    nativeId: string;
    resourceId: string;
    url: string;
    source: CmsSource;
    mode: "simple" | "full" | "interactive";
    stagedMarkdownBody: string;
    /** Actual native build output, not a source SHA marker. */
    builtHtml: string;
    preparedAt: string;
    move?: CmsMoveExpectation;
}
export interface CmsDeploymentReceipt {
    deploymentId: string;
    deployedAt: string;
}
export interface CmsPublishedProof {
    kind: "published";
    url: string;
    native_id: string;
    source_revision: string;
    source_content_sha256: string;
    native_publication_sha256: string;
    verification_profile: string;
    checked_at: string;
    representation: {
        kind: "full";
        source_content_sha256: string;
    };
}
export declare function verifyCmsPublication(expected: CmsRenderedExpectation, deployment: CmsDeploymentReceipt, fetchImplementation?: typeof fetch): Promise<CmsPublishedProof>;
export declare function verifyCmsAbsence(url: string, nativeId: string, preparedAt: string, deployment: CmsDeploymentReceipt, fetchImplementation?: typeof fetch): Promise<{
    kind: "absent";
    url: string;
    native_id: string;
    checked_at: string;
    http_status: number;
}>;
export declare function publicResponse(url: string, fetchImplementation: typeof fetch): Promise<{
    response: Response;
    controller: AbortController;
    timeout: NodeJS.Timeout;
}>;
export declare function publicHtml(response: Response, maximum: number, signal: AbortSignal): Promise<string>;
//# sourceMappingURL=cms-verification.d.ts.map