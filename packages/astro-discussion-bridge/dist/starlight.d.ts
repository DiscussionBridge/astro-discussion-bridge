import type { AstroIntegration } from "astro";
import type { PublishControlledDiscussionsOptions } from "./controlled-creation.js";
import { type NativeRenderedArticle } from "./native-render.js";
export interface NativeStarlightPublicationOptions {
    source: PublishControlledDiscussionsOptions;
    native: Record<string, unknown>;
    /** Required when native configuration contains compiler-extension functions. */
    configurationVersion?: string;
}
export interface NativeStarlightRenderInput {
    filePath: string;
    nativeBody: string;
    sourceArticleUrl: string;
    html: string;
}
/** Actual public Starlight integration plus a private source-render binding. */
export declare function createNativeStarlightPublication(options: NativeStarlightPublicationOptions): Promise<{
    integration: AstroIntegration;
    render: (input: NativeStarlightRenderInput) => Promise<NativeRenderedArticle>;
}>;
//# sourceMappingURL=starlight.d.ts.map