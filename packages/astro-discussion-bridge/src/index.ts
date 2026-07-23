import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { syncDiscourseTopics, type DiscoursePreflightLimits, type NotifyOnFailureOptions } from "./sync/index.js";
import {
  parseDiscussionConnectionJobs,
  type DiscussionConnectionJobs,
} from "./targets.js";

type DiscussionBridgeIntegration = {
  name: string;
  hooks: {
    "astro:config:setup": (params: {
      config: { root: URL };
      updateConfig: (config: { vite?: { plugins?: Plugin[] } }) => void;
    }) => void;
    "astro:build:start": (params: {
      logger: { info: (message: string) => void };
    }) => Promise<void>;
  };
};

export type DiscussionBridgeProvider = "discourse";
export type DiscussionBridgeCommentsDisplay = "simple" | "full" | "fullInteractive";
export type DiscussionBridgePreset = "astro" | "starlight";

export interface DiscussionBridgeOptions {
  provider?: DiscussionBridgeProvider;
  preset?: DiscussionBridgePreset;
  discourseUrl: string;
  siteUrl?: string;
  activeTarget?: string;
  connections?: {
    requireExplicit?: boolean;
    jobs?: DiscussionConnectionJobs;
  };
  comments?: {
    enabled?: boolean;
    display?: DiscussionBridgeCommentsDisplay;
    embedHeight?: string;
    className?: string;
  };
  replies?: {
    enabled?: boolean;
    minScore?: number;
    maxReplies?: number;
    refreshEndpoint?: string;
    renderMermaid?: boolean;
    showLikes?: boolean;
    refreshOnPageLoad?: boolean;
  };
  publishOnBuild?: PublishOnBuildOptions;
}

export interface PublishOnBuildLaneOptions {
  name?: string;
  docsDir: string;
  routeBase?: string;
  targetName?: string;
  discourseUrl?: string;
  apiKey?: string;
  postAs?: string;
  apiUsername?: string;
  apiKeyEnv?: string;
  postAsEnv?: string;
  apiUsernameEnv?: string;
  syncExisting?: boolean;
  unlistSyncedTopics?: boolean;
  validateTitles?: boolean;
  titleMinLength?: number;
  preflightLimits?: DiscoursePreflightLimits;
  notifyOnFailure?: NotifyOnFailureOptions;
  categoryId?: number;
  tags?: string[];
  dryRun?: boolean;
}

export interface PublishOnBuildOptions extends Omit<PublishOnBuildLaneOptions, "docsDir"> {
  enabled?: boolean;
  docsDir?: string;
  lanes?: PublishOnBuildLaneOptions[];
}

interface PublicOptions {
  provider: DiscussionBridgeProvider;
  preset: DiscussionBridgePreset;
  discourseUrl: string;
  siteUrl?: string;
  activeTarget?: string;
  connections: {
    requireExplicit: boolean;
    jobs: DiscussionConnectionJobs;
  };
  comments: {
    enabled: boolean;
    display: DiscussionBridgeCommentsDisplay;
    embedHeight: string;
    className?: string;
  };
  replies: {
    enabled: boolean;
    minScore: number;
    maxReplies: number;
    refreshEndpoint?: string;
    renderMermaid: boolean;
    showLikes: boolean;
    refreshOnPageLoad: boolean;
  };
}

interface ResolvedOptions extends PublicOptions {
  publishOnBuild: {
    enabled: boolean;
    apiKey?: string;
    postAs?: string;
    apiUsername?: string;
    lanes: ResolvedPublishLane[];
  };
}

interface ResolvedPublishLane {
  name: string;
  docsDir: string;
  routeBase?: string;
  targetName?: string;
  discourseUrl?: string;
  apiKey?: string;
  postAs?: string;
  apiUsername?: string;
  apiKeyEnv?: string;
  postAsEnv?: string;
  apiUsernameEnv?: string;
  syncExisting: boolean;
  unlistSyncedTopics: boolean;
  validateTitles: boolean;
  titleMinLength?: number;
  preflightLimits?: DiscoursePreflightLimits;
  notifyOnFailure?: NotifyOnFailureOptions;
  categoryId?: number;
  tags?: string[];
  dryRun: boolean;
}

const virtualModuleId = "virtual:discussion-bridge/config";
const resolvedVirtualModuleId = `\0${virtualModuleId}`;

export default function discussionBridge(
  options: DiscussionBridgeOptions,
): DiscussionBridgeIntegration {
  const resolvedOptions = resolveOptions(options);
  let projectRoot = process.cwd();

  return {
    name: "astro-discussion-bridge",
    hooks: {
      "astro:config:setup": ({ config, updateConfig }) => {
        projectRoot = fileURLToPath(config.root);
        updateConfig({
          vite: {
            plugins: [virtualConfigPlugin(toPublicOptions(resolvedOptions))],
          },
        });
      },
      "astro:build:start": async ({ logger }) => {
        if (!resolvedOptions.publishOnBuild.enabled) return;

        const siteUrl = resolvedOptions.siteUrl ?? process.env.SITE_URL;
        if (!siteUrl) {
          throw new Error(
            "publishOnBuild requires siteUrl or SITE_URL.",
          );
        }

        for (const lane of resolvedOptions.publishOnBuild.lanes) {
          const discourseUrl = lane.discourseUrl ?? resolvedOptions.discourseUrl;
          const apiKey = lane.apiKey
            ?? valueFromNamedEnv(lane.apiKeyEnv)
            ?? process.env.DISCOURSE_API_KEY;
          const postAs = resolvePostAs(lane);
          if (!apiKey || !postAs) {
            const expectedKey = lane.apiKeyEnv ?? "DISCOURSE_API_KEY";
            const expectedActor = lane.postAsEnv
              ?? lane.apiUsernameEnv
              ?? "DISCOURSE_POST_AS or DISCOURSE_API_USERNAME";
            throw new Error(
              `publishOnBuild lane "${lane.name}" requires an API key and posting actor via apiKey/postAs or ${expectedKey}/${expectedActor}.`,
            );
          }

          await publishLane({
            lane,
            projectRoot,
            siteUrl,
            discourseUrl,
            activeTarget: resolvedOptions.activeTarget ?? process.env.DISCUSSION_TARGET,
            apiKey,
            apiUsername: postAs,
            logger,
          });
        }
      },
    },
  };
}

export { createDiscourseClient } from "./discourse/client.js";
export { checkDiscourse } from "./check-discourse.js";
export { syncDiscourseTopics } from "./sync/index.js";
export {
  discussionTargetLabel,
  parseDiscussionConnectionJobs,
  parseDiscussionTargetBindings,
  resolveDiscussionPresentation,
} from "./targets.js";
export { resolveDiscussionSourceNotice } from "./source.js";
export type { CheckDiscourseOptions, CheckDiscourseResult } from "./check-discourse.js";
export type { DiscoursePreflightLimits, SyncDiscourseTopicsOptions, SyncedPage } from "./sync/index.js";
export type {
  DiscussionConnectionJob,
  DiscussionConnectionJobs,
  DiscussionPresentation,
  DiscussionTargetBinding,
  DiscussionTargetBindings,
  ResolvedDiscussionTarget,
} from "./targets.js";
export type { DiscussionSourceMode, DiscussionSourceNotice } from "./source.js";

function resolveOptions(options: DiscussionBridgeOptions): ResolvedOptions {
  if (!options.discourseUrl) {
    throw new Error("astro-discussion-bridge requires a discourseUrl option for the Discourse provider.");
  }

  const provider = options.provider ?? "discourse";
  if (provider !== "discourse") {
    throw new Error(`Unsupported DiscussionBridge provider: ${provider}`);
  }

  const preset = options.preset ?? "astro";

  return {
    provider,
    preset,
    discourseUrl: normalizeBaseUrl(options.discourseUrl),
    siteUrl: options.siteUrl ? normalizeBaseUrl(options.siteUrl) : undefined,
    activeTarget: options.activeTarget,
    connections: {
      requireExplicit: options.connections?.requireExplicit ?? false,
      jobs: parseDiscussionConnectionJobs(options.connections?.jobs, "connections.jobs"),
    },
    comments: {
      enabled: options.comments?.enabled ?? true,
      display: options.comments?.display ?? "simple",
      embedHeight: options.comments?.embedHeight ?? "800px",
      className: options.comments?.className,
    },
    replies: {
      enabled: options.replies?.enabled ?? true,
      minScore: options.replies?.minScore ?? 0,
      maxReplies: options.replies?.maxReplies ?? 5,
      refreshEndpoint: options.replies?.refreshEndpoint,
      renderMermaid: options.replies?.renderMermaid ?? true,
      showLikes: options.replies?.showLikes ?? true,
      refreshOnPageLoad: options.replies?.refreshOnPageLoad ?? true,
    },
    publishOnBuild: {
      enabled: options.publishOnBuild?.enabled ?? false,
      apiKey: options.publishOnBuild?.apiKey,
      postAs: options.publishOnBuild?.postAs,
      apiUsername: options.publishOnBuild?.apiUsername,
      lanes: resolvePublishLanes({
        preset,
        publishOnBuild: options.publishOnBuild,
      }),
    },
  };
}

function resolvePublishLanes(input: {
  preset: DiscussionBridgePreset;
  publishOnBuild?: PublishOnBuildOptions;
}): ResolvedPublishLane[] {
  const defaults = input.publishOnBuild;
  const configuredLanes = defaults?.lanes?.length
    ? defaults.lanes
    : [{ docsDir: defaults?.docsDir ?? defaultDocsDirForPreset(input.preset) }];

  return configuredLanes.map((lane, index) => ({
    name: lane.name ?? (configuredLanes.length === 1 ? "default" : `lane-${index + 1}`),
    docsDir: lane.docsDir,
    routeBase: lane.routeBase,
    targetName: lane.targetName ?? defaults?.targetName,
    discourseUrl: lane.discourseUrl
      ? normalizeBaseUrl(lane.discourseUrl)
      : defaults?.discourseUrl
        ? normalizeBaseUrl(defaults.discourseUrl)
        : undefined,
    apiKey: lane.apiKey ?? defaults?.apiKey,
    postAs: lane.postAs ?? defaults?.postAs,
    apiUsername: lane.apiUsername ?? defaults?.apiUsername,
    apiKeyEnv: lane.apiKeyEnv ?? defaults?.apiKeyEnv,
    postAsEnv: lane.postAsEnv ?? defaults?.postAsEnv,
    apiUsernameEnv: lane.apiUsernameEnv ?? defaults?.apiUsernameEnv,
    syncExisting: lane.syncExisting ?? defaults?.syncExisting ?? false,
    unlistSyncedTopics: lane.unlistSyncedTopics ?? defaults?.unlistSyncedTopics ?? false,
    validateTitles: lane.validateTitles ?? defaults?.validateTitles ?? true,
    titleMinLength: lane.titleMinLength ?? defaults?.titleMinLength,
    preflightLimits: lane.preflightLimits ?? defaults?.preflightLimits,
    notifyOnFailure: lane.notifyOnFailure ?? defaults?.notifyOnFailure,
    categoryId: lane.categoryId ?? defaults?.categoryId,
    tags: lane.tags ?? defaults?.tags,
    dryRun: lane.dryRun ?? defaults?.dryRun ?? false,
  }));
}

function resolvePostAs(lane: ResolvedPublishLane): string | undefined {
  return nonEmptyValue(lane.postAs)
    ?? valueFromNamedEnv(lane.postAsEnv)
    ?? nonEmptyValue(process.env.DISCOURSE_POST_AS)
    ?? nonEmptyValue(lane.apiUsername)
    ?? valueFromNamedEnv(lane.apiUsernameEnv)
    ?? nonEmptyValue(process.env.DISCOURSE_API_USERNAME);
}

async function publishLane(input: {
  lane: ResolvedPublishLane;
  projectRoot: string;
  siteUrl: string;
  discourseUrl: string;
  activeTarget?: string;
  apiKey: string;
  apiUsername: string;
  logger: { info: (message: string) => void };
}) {
  const categoryId = input.lane.categoryId ?? numberFromEnv("DISCOURSE_CATEGORY_ID");
  const tags = input.lane.tags ?? tagsFromEnv("DISCOURSE_TAGS");
  const docsDir = path.resolve(input.projectRoot, input.lane.docsDir);

  input.logger.info(`Publishing discussion companion topics for lane "${input.lane.name}" from ${docsDir}`);

  const results = await syncDiscourseTopics({
    docsDir,
    routeBase: input.lane.routeBase,
    targetName: input.lane.targetName ?? input.activeTarget,
    siteUrl: input.siteUrl,
    discourseUrl: input.discourseUrl,
    apiKey: input.apiKey,
    apiUsername: input.apiUsername,
    categoryId,
    tags,
    dryRun: input.lane.dryRun,
    mode: input.lane.syncExisting ? "publish-and-sync" : "publish-new",
    unlistSyncedTopics: input.lane.unlistSyncedTopics,
    validateTitles: input.lane.validateTitles,
    titleMinLength: input.lane.titleMinLength,
    preflightLimits: input.lane.preflightLimits,
    notifyOnFailure: input.lane.notifyOnFailure,
  });
  const created = results.filter((result) => result.status === "created").length;
  const updated = results.filter((result) => result.status === "updated").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  const unchanged = results.filter((result) => result.status === "unchanged").length;
  const dryRun = results.filter((result) => result.status.startsWith("dry-run")).length;

  input.logger.info(
    `DiscussionBridge lane "${input.lane.name}" complete: ${created} created, ${updated} updated, ${skipped} skipped, ${unchanged} unchanged, ${dryRun} dry-run.`,
  );
}

function defaultDocsDirForPreset(preset: DiscussionBridgePreset): string {
  if (preset === "starlight") return "src/content/docs";
  return "src/content";
}

function toPublicOptions(options: ResolvedOptions): PublicOptions {
  return {
    provider: options.provider,
    preset: options.preset,
    discourseUrl: options.discourseUrl,
    siteUrl: options.siteUrl,
    activeTarget: options.activeTarget,
    connections: options.connections,
    comments: options.comments,
    replies: options.replies,
  };
}

function normalizeBaseUrl(value: string): string {
  return new URL(value).href.replace(/\/+$/, "");
}

function numberFromEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function tagsFromEnv(name: string): string[] | undefined {
  const value = process.env[name];
  if (!value) return undefined;

  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function valueFromNamedEnv(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return nonEmptyValue(process.env[name]);
}

function nonEmptyValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function virtualConfigPlugin(options: PublicOptions): Plugin {
  return {
    name: "astro-discussion-bridge:virtual-config",
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId;
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        return `export default ${JSON.stringify(options)};`;
      }
    },
  };
}


