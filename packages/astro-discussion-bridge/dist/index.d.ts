import type { AstroIntegration } from "astro";
import { type CommentsModeInput } from "./comments-mode.js";
import { type ControlledCreationOptions } from "./controlled-creation.js";
import { type CmsNativeCommand } from "./cms-pipeline.js";
import type { CmsPipelineOptions } from "./cms-pipeline.js";
export interface DiscussionBridgeOptions {
    discourseUrl: string;
    siteUrl?: string;
    publishOnBuild?: ControlledCreationOptions & {
        enabled?: boolean;
        docsDir?: string;
        stateFile?: string;
        routeBase?: string;
    };
    fromDiscourse?: Omit<CmsPipelineOptions, "serverUrl" | "siteUrl" | "docsDir" | "stateFile"> & {
        enabled?: boolean;
        docsDir: string;
        stateFile: string;
        routeBase?: string;
        deployment?: CmsNativeCommand;
    };
    comments?: {
        enabled?: boolean;
        display?: CommentsModeInput;
        embedHeight?: string;
        dynamicHeight?: boolean;
        embedMinHeight?: string;
        embedMaxHeight?: "none";
        embedViewportMaxHeight?: "none";
        className?: string;
        credit?: {
            enabled?: boolean;
            prefix?: string;
            label?: string;
            href?: string;
        };
    };
}
/** Native/Core presentation remains independent of configured V4 publication. */
export default function discussionBridge(options: DiscussionBridgeOptions): AstroIntegration;
export { normalizeCommentsMode } from "./comments-mode.js";
export { publishControlledDiscussions, withdrawControlledSource, captureNativeRenderedSource, captureControlledSourceNative } from "./controlled-creation.js";
export { beginControlledSourceUrlMove, finalizeControlledSourceUrlMove, abortControlledSourceUrlMove, controlledSourceUrlHistory } from "./cms-to-source-move.js";
export { runControlledSourceCommand } from "./cms-to-source-command.js";
export { sourceArticleAttributes } from "./to-source-profile.js";
export { stageCmsNativePublications, recordCmsNativeBuild, finalizeCmsNativeWork, abortCmsNativeWork, deployCmsNativeBuild } from "./cms-pipeline.js";
export { beginCmsNativeUrlMove, prepareCmsNativeUrlMove, finalizeCmsNativeUrlMove, abortCmsNativeUrlMove } from "./cms-presentation.js";
export { inspectCmsAttentionNative, restoreCmsAttentionBaseline } from "./cms-attention-native.js";
export { checkCmsAttention, synchronizeCmsAttentionRecoveries } from "./cms-attention.js";
export { runCmsAttentionBaselineCommand } from "./cms-attention-command.js";
export type { CmsAttentionOptions } from "./cms-attention-native.js";
export type { AttentionInspection, AttentionObservation, AttentionRecovery } from "./cms-attention-types.js";
//# sourceMappingURL=index.d.ts.map