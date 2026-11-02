import type { AstroIntegration } from "astro";
import { normalizeCommentsMode, type CommentsModeInput } from "./comments-mode.js";
import { normalizePublicHttpUrl, parseServiceBaseUrl } from "./web-url.js";
import { cmsServiceBaseUrl } from "./native-url.js";
import { validateForumName } from "./forum-name.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishControlledDiscussions, type ControlledCreationOptions, type PublishControlledDiscussionsOptions } from "./controlled-creation.js";
import { startControlledSourceBuild, recordControlledSourceBuild } from "./cms-to-source-build.js";
import { stageCmsNativePublications, recordCmsNativeBuild, deployCmsNativeBuildIfNeeded, renewCmsNativeBuild, type CmsNativeCommand } from "./cms-pipeline.js";
import type { CmsPipelineOptions } from "./cms-pipeline.js";

// These documented APIs read private package data or native filesystem state.
// Preserve their installed Node boundary, never a prerender-chunk-relative copy.
const serverOnlyEntries = ["astro-discussion-bridge", "astro-discussion-bridge/server-url", "astro-discussion-bridge/controlled-creation", "astro-discussion-bridge/operational-state"];

export interface DiscussionBridgeOptions {
  discourseUrl: string;
  siteUrl?: string;
  publishOnBuild?: ControlledCreationOptions & { enabled?: boolean; docsDir?: string; stateFile?: string; routeBase?: string };
  fromDiscourse?: Omit<CmsPipelineOptions, "serverUrl" | "siteUrl" | "docsDir" | "stateFile"> & { enabled?: boolean; docsDir: string; stateFile: string; routeBase?: string; deployment?: CmsNativeCommand };
  comments?: {
    enabled?: boolean; display?: CommentsModeInput; embedHeight?: string; dynamicHeight?: boolean; embedMinHeight?: string;
    embedMaxHeight?: "none"; embedViewportMaxHeight?: "none"; className?: string;
    credit?: { enabled?: boolean; prefix?: string; label?: string; href?: string };
  };
}

/** Native/Core presentation remains independent of configured V4 publication. */
export default function discussionBridge(options: DiscussionBridgeOptions): AstroIntegration {
  const display = normalizeCommentsMode(options.comments?.display === undefined ? "full" : options.comments.display);
  if (!display) throw new Error("Comments display must be simple, full, or interactive.");
  if (options.comments?.embedMaxHeight !== undefined && options.comments.embedMaxHeight !== "none"
    || options.comments?.embedViewportMaxHeight !== undefined && options.comments.embedViewportMaxHeight !== "none") throw new Error("Discourse Core owns full-app iframe sizing; height ceilings must be omitted or none.");
  const credit = options.comments?.credit;
  const config = {
    discourseUrl: (options.publishOnBuild?.enabled || options.fromDiscourse?.enabled ? cmsServiceBaseUrl(options.discourseUrl) : parseServiceBaseUrl(options.discourseUrl)).href,
    forumName: process.env.DISCUSSIONBRIDGE_FORUM_NAME === undefined ? undefined : validateForumName(process.env.DISCUSSIONBRIDGE_FORUM_NAME, "DISCUSSIONBRIDGE_FORUM_NAME"),
    comments: { enabled: options.comments?.enabled ?? true, display, embedHeight: options.comments?.embedHeight ?? "800px",
      dynamicHeight: options.comments?.dynamicHeight ?? false, embedMinHeight: options.comments?.embedMinHeight ?? "360", className: options.comments?.className,
      credit: { enabled: credit?.enabled ?? true, prefix: credit?.prefix?.trim() || "Connected by", label: credit?.label?.trim() || "DiscussionBridge",
        href: normalizePublicHttpUrl(credit?.href?.trim() || "https://discussionbridge.dev/", "comments.credit.href", { allowQuery: true, allowFragment: true }) } },
  };
  let projectRoot = "", from: CmsPipelineOptions | undefined, source: PublishControlledDiscussionsOptions | undefined, buildDir = "", nativeBuild = false, nativeBase = "/", nativeAssets = "", renewal: ReturnType<typeof setInterval> | undefined, renewalError: unknown;
  const stopRenewal = () => { if (renewal) clearInterval(renewal); renewal = undefined; };
  return { name: "astro-discussion-bridge", hooks: { "astro:config:setup": ({ config: nativeConfig, command, updateConfig, injectScript }) => {
    projectRoot = fileURLToPath(nativeConfig.root);
    nativeBuild = command === "build";
    // Vite treats a root ssr.external name as covering every package subpath.
    // Do NOT put our root name there: .astro and browser exports must compile.
    // Its exact server import is preserved only by the pre-resolver below.
    updateConfig({ vite: { ssr: { external: serverOnlyEntries.filter(id => id !== "astro-discussion-bridge") }, plugins: [{ name: "astro-discussion-bridge-config", enforce: "pre", resolveId(id, _importer, context) {
      if (serverOnlyEntries.includes(id)) {
        if (!context?.ssr) throw new Error(`DiscussionBridge ${id} is a server-only package entry.`);
        // Framework-package noExternal crawling can override the external
        // list. Preserve the exact normal package import and adjacent SDK
        // data, without an absolute build-host path or copied schema.
        return { id, external: true };
      }
      return id === "virtual:discussion-bridge/config" ? "\0virtual:discussion-bridge/config" : undefined;
    },
      load(id) { return id === "\0virtual:discussion-bridge/config" ? `export default ${JSON.stringify(config)};` : undefined; } }] } });
    injectScript("page", `import { startSimpleComments } from 'astro-discussion-bridge/simple-live'; document.addEventListener('astro:page-load', startSimpleComments); startSimpleComments();`);
  }, "astro:config:done": async ({ config: nativeConfig, logger }) => {
    const siteUrl = options.siteUrl ?? nativeConfig.site;
    if (options.publishOnBuild?.enabled || options.fromDiscourse?.enabled) {
      if (!siteUrl) throw new Error("Native V4 publication requires its actual configured site URL.");
    }
    if (options.fromDiscourse?.enabled) {
      const configured = options.fromDiscourse;
      from = { ...configured, serverUrl: options.discourseUrl, siteUrl: siteUrl!, docsDir: path.resolve(projectRoot, configured.docsDir), stateFile: path.resolve(projectRoot, configured.stateFile) };
      const staged = await stageCmsNativePublications(from); logger.info(`DiscussionBridge staged ${staged.prepared.length} native publications; build/deploy/public settlement pending.`);
      for (const limitation of staged.localLimitations) logger.warn(`DiscussionBridge local limitation for ${limitation.workId}: ${limitation.detail}`);
    }
    if (options.publishOnBuild?.enabled) {
      const publish = options.publishOnBuild;
      source = { docsDir: path.resolve(projectRoot, publish.docsDir ?? "src/content"), stateFile: path.resolve(projectRoot, publish.stateFile ?? ".discussionbridge/astro-to-state.json"),
        siteUrl: siteUrl!, discourseUrl: options.discourseUrl, routeBase: publish.routeBase, controlledCreation: publish };
      const results = await publishControlledDiscussions(source);
      for (const result of results) if (result.reason?.startsWith("Awaiting actual native Content")) logger.warn(`DiscussionBridge ${result.reason} File: ${result.filePath}`);
      if (nativeBuild) await startControlledSourceBuild(source);
    }
    buildDir = fileURLToPath(nativeConfig.outDir);
    nativeBase = nativeConfig.base; nativeAssets = nativeConfig.build.assets;
    if (from) { renewal = setInterval(() => { void renewCmsNativeBuild(from!).catch(error => { renewalError = error; stopRenewal(); }); }, 60000); renewal.unref?.(); }
  }, "astro:build:done": async ({ dir, assets }) => {
    stopRenewal(); if (renewalError) throw renewalError;
    if (source && nativeBuild) await recordControlledSourceBuild(source, fileURLToPath(dir), assets, nativeBase, nativeAssets);
    if (from) { await recordCmsNativeBuild(from, buildDir); if (options.fromDiscourse?.deployment) await deployCmsNativeBuildIfNeeded(from, options.fromDiscourse.deployment); }
  } } };
}
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
