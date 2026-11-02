/** Private native-render evidence. Nothing here changes the Adapter Protocol. */
export interface NativeControlRange {
    start: number;
    end: number;
    sha256: string;
}
export interface NativePresentationEvidence {
    version: 1;
    recipe: "starlight-heading-controls-1";
    nativeFile: string;
    originalMarkdownSha256: string;
    originalKey: string;
    producerKey: string;
    artifactSha256: string;
    fullHtmlSha256: string;
    portableHtmlSha256: string;
    controls: NativeControlRange[];
}
/** Only a registered SDK producer can issue the runtime object behind this type. */
export interface NativeRenderedArticle {
    readonly kind: "native-rendered-article";
}
export type NativeRenderedContent = string | NativeRenderedArticle;
export interface NativeRenderEdit {
    start: number;
    end: number;
    value: string;
}
export declare const nativeRenderHash: (value: string) => string;
export declare function validateNativePresentation(value: NativePresentationEvidence, html: string): void;
/** SDK-private issuance, called only after actual registered producer validation. */
export declare function issueNativeRenderedArticle(html: string, source: Omit<NativePresentationEvidence, "version" | "recipe" | "fullHtmlSha256" | "portableHtmlSha256">): NativeRenderedArticle;
export declare function fullNativeHtml(value: NativeRenderedContent): string;
export declare function portableNativeHtml(value: NativeRenderedContent): string;
export declare function nativePresentation(value: NativeRenderedContent): NativePresentationEvidence | undefined;
export declare function nativeControlStarts(value: NativeRenderedContent): Set<number>;
export declare function assertNativeRenderSource(value: NativeRenderedContent, file: string, originalMarkdown: string): void;
/** Existing copied-reference edits may touch authored markup, never proven UI. */
export declare function editNativeRenderedArticle(value: NativeRenderedContent, edits: NativeRenderEdit[]): NativeRenderedContent;
//# sourceMappingURL=native-render.d.ts.map