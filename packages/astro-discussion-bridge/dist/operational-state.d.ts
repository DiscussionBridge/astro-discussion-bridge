import type { CmsToPage, CmsToState } from "./cms-to.js";
import { type NativeArticleCapture } from "./native-preparation.js";
export interface PublicationOperation {
    externalId: string;
    canonicalUrl: string;
    correlationId: string;
    attempts: number;
    outcome: "pending" | "created" | "resolved" | "updated" | "withdrawn" | "attention";
    resourceId?: string;
    topicId?: string;
    topicUrl?: string;
    to?: CmsToState;
    lastError?: string;
    nativeRender?: NativeRenderIntent;
}
export interface NativeRenderIntent extends Omit<CmsToPage, "contentHtml" | "preparation"> {
    filePath: string;
    source: string;
    originalCapture: NativeArticleCapture;
    nativeRenderRequired: true;
}
export interface NativeSourceCensus {
    docsDir: string;
    siteBase: string;
    routeBase: string;
    rootDev: string;
    rootIno: string;
}
export interface PublicationOperationalState {
    format: 1;
    wireVersion: "v4";
    adapterId: "astro-discussion-bridge";
    operations: Record<string, PublicationOperation>;
    sourceBuildId?: string;
    sourceBuildOwner?: {
        pid: number;
        token: string;
        buildId: string;
    };
    nativeCensus?: NativeSourceCensus;
    preparationLimitations?: Record<string, {
        capture: NativeArticleCapture;
        filePath: string;
        detail: string;
    }>;
}
export declare function readPublicationOperationalState(file: string): Promise<PublicationOperationalState>;
export declare function writePublicationOperationalState(file: string, state: PublicationOperationalState): Promise<void>;
export declare function beginPublicationAttempt(state: PublicationOperationalState, externalId: string, canonicalUrl: string): PublicationOperation;
//# sourceMappingURL=operational-state.d.ts.map