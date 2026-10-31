import { normalizeCommentsMode } from "./comments-mode.js";
import { normalizePublicHttpUrl, parseServiceBaseUrl } from "./web-url.js";
import { cmsServiceBaseUrl } from "./native-url.js";
import { validateForumName } from "./forum-name.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishControlledDiscussions } from "./controlled-creation.js";
import { startControlledSourceBuild, recordControlledSourceBuild } from "./cms-to-source-build.js";
import { stageCmsNativePublications, recordCmsNativeBuild, deployCmsNativeBuild, renewCmsNativeBuild } from "./cms-pipeline.js";
/** Native/Core presentation remains independent of configured V4 publication. */
export default function discussionBridge(options) {
    const display = normalizeCommentsMode(options.comments?.display === undefined ? "full" : options.comments.display);
    if (!display)
        throw new Error("Comments display must be simple, full, or interactive.");
    if (options.comments?.embedMaxHeight !== undefined && options.comments.embedMaxHeight !== "none"
        || options.comments?.embedViewportMaxHeight !== undefined && options.comments.embedViewportMaxHeight !== "none")
        throw new Error("Discourse Core owns full-app iframe sizing; height ceilings must be omitted or none.");
    const credit = options.comments?.credit;
    const config = {
        discourseUrl: (options.publishOnBuild?.enabled || options.fromDiscourse?.enabled ? cmsServiceBaseUrl(options.discourseUrl) : parseServiceBaseUrl(options.discourseUrl)).href,
        forumName: process.env.DISCUSSIONBRIDGE_FORUM_NAME === undefined ? undefined : validateForumName(process.env.DISCUSSIONBRIDGE_FORUM_NAME, "DISCUSSIONBRIDGE_FORUM_NAME"),
        comments: { enabled: options.comments?.enabled ?? true, display, embedHeight: options.comments?.embedHeight ?? "800px",
            dynamicHeight: options.comments?.dynamicHeight ?? false, embedMinHeight: options.comments?.embedMinHeight ?? "360", className: options.comments?.className,
            credit: { enabled: credit?.enabled ?? true, prefix: credit?.prefix?.trim() || "Connected by", label: credit?.label?.trim() || "DiscussionBridge",
                href: normalizePublicHttpUrl(credit?.href?.trim() || "https://discussionbridge.dev/", "comments.credit.href", { allowQuery: true, allowFragment: true }) } },
    };
    let projectRoot = "", from, source, buildDir = "", nativeBuild = false, nativeBase = "/", nativeAssets = "", renewal, renewalError;
    const stopRenewal = () => { if (renewal)
        clearInterval(renewal); renewal = undefined; };
    return { name: "astro-discussion-bridge", hooks: { "astro:config:setup": ({ config: nativeConfig, command, updateConfig, injectScript }) => {
                projectRoot = fileURLToPath(nativeConfig.root);
                nativeBuild = command === "build";
                updateConfig({ vite: { ssr: { external: ["astro-discussion-bridge/server-url"] }, plugins: [{ name: "astro-discussion-bridge-config", enforce: "pre", resolveId(id, _importer, context) {
                                    if (id === "astro-discussion-bridge/server-url") {
                                        if (!context?.ssr)
                                            throw new Error("DiscussionBridge server-url is a server-only package entry.");
                                        // Explicitly preserve this one installed module and its adjacent SDK
                                        // data. Framework-package noExternal crawling can override the SSR
                                        // external list in native builds; components/browser code still bundle.
                                        // Keep a normal package import, not a build-host absolute path, so a
                                        // server output can still resolve its installed dependency after deploy.
                                        return { id, external: true };
                                    }
                                    return id === "virtual:discussion-bridge/config" ? "\0virtual:discussion-bridge/config" : undefined;
                                },
                                load(id) { return id === "\0virtual:discussion-bridge/config" ? `export default ${JSON.stringify(config)};` : undefined; } }] } });
                injectScript("page", `import { startSimpleComments } from 'astro-discussion-bridge/simple-live'; document.addEventListener('astro:page-load', startSimpleComments); startSimpleComments();`);
            }, "astro:config:done": async ({ config: nativeConfig, logger }) => {
                const siteUrl = options.siteUrl ?? nativeConfig.site;
                if (options.publishOnBuild?.enabled || options.fromDiscourse?.enabled) {
                    if (!siteUrl)
                        throw new Error("Native V4 publication requires its actual configured site URL.");
                }
                if (options.fromDiscourse?.enabled) {
                    const configured = options.fromDiscourse;
                    from = { ...configured, serverUrl: options.discourseUrl, siteUrl: siteUrl, docsDir: path.resolve(projectRoot, configured.docsDir), stateFile: path.resolve(projectRoot, configured.stateFile) };
                    const staged = await stageCmsNativePublications(from);
                    logger.info(`DiscussionBridge staged ${staged.prepared.length} native publications; build/deploy/public settlement pending.`);
                    for (const limitation of staged.localLimitations)
                        logger.warn(`DiscussionBridge local limitation for ${limitation.workId}: ${limitation.detail}`);
                }
                if (options.publishOnBuild?.enabled) {
                    const publish = options.publishOnBuild;
                    source = { docsDir: path.resolve(projectRoot, publish.docsDir ?? "src/content"), stateFile: path.resolve(projectRoot, publish.stateFile ?? ".discussionbridge/astro-to-state.json"),
                        siteUrl: siteUrl, discourseUrl: options.discourseUrl, routeBase: publish.routeBase, controlledCreation: publish };
                    const results = await publishControlledDiscussions(source);
                    for (const result of results)
                        if (result.reason?.startsWith("Awaiting actual native Content"))
                            logger.warn(`DiscussionBridge ${result.reason} File: ${result.filePath}`);
                    if (nativeBuild)
                        await startControlledSourceBuild(source);
                }
                buildDir = fileURLToPath(nativeConfig.outDir);
                nativeBase = nativeConfig.base;
                nativeAssets = nativeConfig.build.assets;
                if (from) {
                    renewal = setInterval(() => { void renewCmsNativeBuild(from).catch(error => { renewalError = error; stopRenewal(); }); }, 60000);
                    renewal.unref?.();
                }
            }, "astro:build:done": async ({ dir, assets }) => {
                stopRenewal();
                if (renewalError)
                    throw renewalError;
                if (source && nativeBuild)
                    await recordControlledSourceBuild(source, fileURLToPath(dir), assets, nativeBase, nativeAssets);
                if (from) {
                    await recordCmsNativeBuild(from, buildDir);
                    if (options.fromDiscourse?.deployment)
                        await deployCmsNativeBuild(from, options.fromDiscourse.deployment);
                }
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
