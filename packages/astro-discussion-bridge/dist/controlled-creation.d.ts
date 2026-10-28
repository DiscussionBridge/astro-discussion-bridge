import { type CmsClientOptions } from "./cms-client.js";
import { type CmsToRecordMetadata, type CmsToRevocationReason } from "./cms-to.js";
export interface ControlledCreationOptions extends Omit<CmsClientOptions, "serverUrl"> {
    lane?: string;
}
export interface PublishControlledDiscussionsOptions {
    docsDir: string;
    stateFile: string;
    siteUrl: string;
    discourseUrl: string;
    routeBase?: string;
    controlledCreation: ControlledCreationOptions;
}
export interface ControlledDiscussionResult {
    filePath: string;
    pageUrl: string;
    resourceId?: string;
    topicId?: string;
    topicUrl?: string;
    status: "created" | "resolved" | "updated" | "withdrawn" | "skipped";
    reason?: string;
}
/** One current native publisher, with complete identity census before dispatch. */
export declare function publishControlledDiscussions(options: PublishControlledDiscussionsOptions): Promise<ControlledDiscussionResult[]>;
export interface NativeRenderedSourceInput {
    filePath: string;
    sourceArticleUrl: string;
    nativeBody: string;
    render: () => Promise<string>;
}
/** Native collection caller; no new route, renderer or publication engine. */
export declare function captureNativeRenderedSource(options: PublishControlledDiscussionsOptions, input: NativeRenderedSourceInput): Promise<{
    frontmatter: Record<string, unknown>;
    result: import("./cms-to.js").CmsToResult;
    source: import("./to-source-profile.js").SourceNativeCapture;
} | {
    frontmatter: Record<string, unknown>;
    result: import("./cms-to.js").CmsToResult;
    source: undefined;
} | {
    frontmatter: Record<string, unknown>;
    result: ControlledDiscussionResult;
    source: undefined;
}>;
/** Explicit full-source native profile binding; same writer/publication engine. */
export declare function captureControlledSourceNative(options: PublishControlledDiscussionsOptions, input: NativeRenderedSourceInput): Promise<{
    frontmatter: Record<string, unknown>;
    result: import("./cms-to.js").CmsToResult;
    source: import("./to-source-profile.js").SourceNativeCapture;
}>;
/** Protected selected-source action: stages one Retry; the normal build captures/publishes it. */
export declare function stageControlledSourceRetry(options: PublishControlledDiscussionsOptions, sourceFile: string, refusedMutationId: string): Promise<{
    externalId: string;
    refusedMutationId: string;
    phase: string;
    requestCreated: boolean;
    requiresNativeBuild: boolean;
}>;
/** Protected actual native lifecycle/operator stop-delivery; no implicit resume. */
export declare function withdrawControlledSource(options: PublishControlledDiscussionsOptions, sourceFile: string, reason: CmsToRevocationReason): Promise<CmsToRecordMetadata>;
//# sourceMappingURL=controlled-creation.d.ts.map