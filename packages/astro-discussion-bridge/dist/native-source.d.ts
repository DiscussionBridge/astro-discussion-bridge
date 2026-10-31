import { type MarkdownRenderer } from "@astrojs/markdown-remark";
import { type NativeUrl } from "./native-url.js";
import { type NativeArticleCapture } from "./native-preparation.js";
export declare function findMarkdownFiles(root: string): Promise<string[]>;
export declare function parseMarkdown(source: string): {
    frontmatter: Record<string, unknown>;
    body: string;
};
export declare function updateFrontmatter(source: string, values: Record<string, string>): string;
export declare function pageUrlForFile(input: {
    docsDir: string;
    filePath: string;
    siteBase: NativeUrl;
    routeBase: string;
    slug: unknown;
    hasSlug: boolean;
}): string;
export declare function stableExternalId(siteBase: NativeUrl, docsDir: string, filePath: string): string;
export declare function validateRouteBase(value: string | undefined): string;
export declare function validateSlug(value: unknown, filePath: string): string;
export declare function validateRelativeRouteSegments(segments: string[], label: string): string;
export declare function readMarkdownSources(files: string[]): AsyncGenerator<{
    filePath: string;
    source: string;
}, void, unknown>;
export declare function renderedPublishedContent(body: string, filePath: string, renderer: MarkdownRenderer, sourceArticleUrl: string): Promise<NativeArticleCapture>;
/** Same existing portable cleaner for pre-build and actual native Content output. */
export declare function prepareNativeRenderedArticle(capture: NativeArticleCapture, rendered: string): NativeArticleCapture;
export declare function sourceDate(value: unknown): string | null;
export declare function excerptArticle(completeHtml: string, maximum: number): string;
export declare function lifecycleBoolean(frontmatter: Record<string, unknown>, key: string): boolean | undefined;
export declare function firstHeading(body: string): string | undefined;
export declare function titleFromFile(filePath: string): string;
/** Native lifecycle, independent of any transport version or receiver policy. */
export declare function nativeLifecycle(frontmatter: Record<string, unknown>): "published" | "unpublished" | "ineligible";
/** Complete sanitized native bytes, before any envelope/article selection. */
export declare function nativeContentIdentity(contentHtml: string): {
    bytes: number;
    sha256: string;
};
export declare function createNativeMarkdownRenderer(): Promise<MarkdownRenderer>;
//# sourceMappingURL=native-source.d.ts.map