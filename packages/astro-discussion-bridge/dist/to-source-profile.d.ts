import { type NativeArticleCapture } from "./native-preparation.js";
import { type NativeRenderedContent, type NativePresentationEvidence } from "./native-render.js";
export declare const ASTRO_SOURCE_PROFILE = "discussionbridge-astro-source-html-1";
export declare const SOURCE_OWNERSHIP_FIELD = "discussionbridgeSourceOwnershipSha256";
export declare const SOURCE_MOVE_FIELD = "discussionbridgeSourceMoveId";
export declare const SOURCE_NONCE_FIELD = "discussionbridgeSourceMoveNonce";
export declare const sourceHash: (value: string) => string;
/** Component-private SOURCE receipt. It is not the From mapping receipt. */
export interface AstroSourceOwnershipV1 {
    version: 1;
    profile: typeof ASTRO_SOURCE_PROFILE;
    connectionId: string;
    scopeRevision: string;
    serverOrigin: string;
    siteOrigin: string;
    rootDev: string;
    rootIno: string;
    nativeId: string;
    externalId: string;
    resourceId: string;
    topicId: string;
    canonicalUrl: string;
    sourceRevision: string;
    fence: number;
    originalArticleSha256: string;
    preparedSourceSha256: string;
    preparedSourceBytes: number;
    nativeSnapshotSha256: string;
    moveId: string | null;
    proofNonce: string | null;
}
export interface SourceNativeCapture {
    buildId: string;
    file: string;
    fileSha256: string;
    originalKey: string;
    canonicalUrl: string;
    revision: string;
    birthBase: string;
    nativeHtml: string;
    ownership: AstroSourceOwnershipV1;
    ownershipSha256: string;
    title: string;
    authors: {
        id: string;
        name: string;
    }[];
    nativePresentation?: NativePresentationEvidence;
    build?: {
        file: string;
        html: string;
        builtAt: string;
        sha256: string;
        dependencyMarkup: string[];
        assets: {
            url: string;
            file: string;
            bytes: number;
            sha256: string;
        }[];
    };
}
export declare function validateSourceCapture(capture: SourceNativeCapture): void;
export declare function sourceOriginalKey(contents: string): string;
export declare function makeSourceOwnership(input: Omit<AstroSourceOwnershipV1, "version" | "profile" | "originalArticleSha256" | "preparedSourceSha256" | "preparedSourceBytes" | "nativeSnapshotSha256">, contents: string, capture: NativeArticleCapture): {
    receipt: AstroSourceOwnershipV1;
    sha256: string;
};
export interface SourceHtmlNode {
    name?: string;
    type: string;
    data?: string;
    attribs?: Record<string, string>;
    children?: SourceHtmlNode[];
    parent?: SourceHtmlNode | null;
    startIndex?: number | null;
    endIndex?: number | null;
}
export declare const sourceNodes: (root: SourceHtmlNode) => SourceHtmlNode[];
export declare const parseSourceHtml: (html: string) => SourceHtmlNode;
/** Only approved target resolution on ACTUAL native rendered output; no cleaner. */
export declare function resolveNativeSourceTargets(input: string, capturedBase: string): string;
export declare function resolveNativeSourceTargets(input: NativeRenderedContent, capturedBase: string): NativeRenderedContent;
export declare function sourceArticleAttributes(capture: SourceNativeCapture): {
    "data-discussionbridge-source-native": string;
    "data-discussionbridge-source-external": string;
    "data-discussionbridge-source-resource": string;
    "data-discussionbridge-source-topic": string;
    "data-discussionbridge-source-revision": string;
    "data-discussionbridge-source-canonical": string;
    "data-discussionbridge-source-move": string | undefined;
    "data-discussionbridge-source-nonce": string | undefined;
    "data-discussionbridge-source-ownership": string;
    "data-discussionbridge-source-authors": string;
};
export declare function inspectSourceArticle(html: string, expected: SourceNativeCapture): string;
export declare function sourceDependencyMarkup(html: string): string[];
/** Source-proof response metadata must agree with its existing UTF-8 decoder. */
export declare function assertSourceHtmlContentType(contentType: string | null): undefined;
//# sourceMappingURL=to-source-profile.d.ts.map