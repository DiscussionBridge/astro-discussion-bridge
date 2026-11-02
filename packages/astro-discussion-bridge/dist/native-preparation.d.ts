import { type NativePresentationEvidence } from "./native-render.js";
/** Private native evidence, never an additional wire field or HTML policy. */
export interface NativeArticleCapture {
    originalKind: "markdown" | "cooked_html";
    sourceArticleUrl: string;
    original: string;
    originalBytes: number;
    originalSha256: string;
    renderedHtml?: string;
    preparedHtml?: string;
    preparedBytes?: number;
    preparedSha256?: string;
    nativePresentation?: NativePresentationEvidence;
}
export declare class NativePreparationLimitation extends Error {
    capture?: NativeArticleCapture;
}
/** Native asset resolution is deferred to the actual Astro Content renderer. */
export declare class NativeAssetRenderRequired extends NativePreparationLimitation {
}
export declare function captureNativeArticle(original: string, sourceArticleUrl: string, originalKind: NativeArticleCapture["originalKind"]): NativeArticleCapture;
export declare function completeNativePreparation(capture: NativeArticleCapture, renderedHtml: string, preparedHtml: string, presentation?: NativePresentationEvidence): NativeArticleCapture;
export declare function assertNativeArticleCapture(capture: NativeArticleCapture): void;
export declare const nativeCaptureId: (capture: NativeArticleCapture) => string;
/** Carry actual native renderer metadata into the existing portable code marker. */
export declare function nativeCodeLanguagePreparation(rendered: string): {
    transform(tagName: string, attribs: Record<string, string>): {
        tagName: string;
        attribs: Record<string, string>;
    };
    assertRetained(prepared: string): void;
};
/** Inspect actual copied attributes, not quoted code examples or comments. */
export declare function hasRelativeCopiedReferences(html: string): boolean;
/** Uses the current cleaner's retained link/image attributes, not a new sanitizer. */
export declare function copiedReferencePreparation(sourceArticleUrl: string): {
    transform(tagName: string, attribs: Record<string, string>): {
        tagName: string;
        attribs: Record<string, string>;
    };
    assertRetained(prepared: string): void;
};
//# sourceMappingURL=native-preparation.d.ts.map