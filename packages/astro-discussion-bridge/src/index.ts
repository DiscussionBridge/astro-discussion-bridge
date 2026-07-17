import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { syncDiscourseTopics } from "./sync/index.js";

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
export type DiscussionBridgePreset =
  | "astro"
  | "astro-content"
  | "starlight"
  | "mdx-inline"
  | "cloudflare-worker";

export interface DiscussionBridgeOptions {
  provider?: DiscussionBridgeProvider;
  preset?: DiscussionBridgePreset;
  discourseUrl: string;
  siteUrl?: string;
  comments?: {
    enabled?: boolean;
    className?: string;
  };
  replies?: {
    enabled?: boolean;
    minScore?: number;
    maxReplies?: number;
  };
  publishOnBuild?: {
    enabled?: boolean;
    syncExisting?: boolean;
    unlistSyncedTopics?: boolean;
    validateTitles?: boolean;
    titleMinLength?: number;
    docsDir?: string;
    apiKey?: string;
    apiUsername?: string;
    categoryId?: number;
    tags?: string[];
    dryRun?: boolean;
  };
}


interface PublicOptions {
  provider: DiscussionBridgeProvider;
  preset: DiscussionBridgePreset;
  discourseUrl: string;
  siteUrl?: string;
  comments: {
    enabled: boolean;
    className?: string;
  };
  replies: {
    enabled: boolean;
    minScore: number;
    maxReplies: number;
  };
}

interface ResolvedOptions extends PublicOptions {
  publishOnBuild: {
    enabled: boolean;
    syncExisting: boolean;
    unlistSyncedTopics: boolean;
    validateTitles: boolean;
    titleMinLength?: number;
    docsDir: string;
    apiKey?: string;
    apiUsername?: string;
    categoryId?: number;
    tags?: string[];
    dryRun: boolean;
  };
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
        const apiKey = resolvedOptions.publishOnBuild.apiKey ?? process.env.DISCOURSE_API_KEY;
        const apiUsername = resolvedOptions.publishOnBuild.apiUsername ?? process.env.DISCOURSE_API_USERNAME;
        const categoryId = resolvedOptions.publishOnBuild.categoryId ?? numberFromEnv("DISCOURSE_CATEGORY_ID");
        const tags = resolvedOptions.publishOnBuild.tags ?? tagsFromEnv("DISCOURSE_TAGS");

        if (!siteUrl || !apiKey || !apiUsername) {
          throw new Error(
            "publishOnBuild requires siteUrl, DISCOURSE_API_KEY, and DISCOURSE_API_USERNAME.",
          );
        }

        const docsDir = path.resolve(projectRoot, resolvedOptions.publishOnBuild.docsDir);
        logger.info(`Publishing missing discussion companion topics from ${docsDir}`);

        const results = await syncDiscourseTopics({
          docsDir,
          siteUrl,
          discourseUrl: resolvedOptions.discourseUrl,
          apiKey,
          apiUsername,
          categoryId,
          tags,
          dryRun: resolvedOptions.publishOnBuild.dryRun,
          mode: resolvedOptions.publishOnBuild.syncExisting ? "publish-and-sync" : "publish-new",
          unlistSyncedTopics: resolvedOptions.publishOnBuild.unlistSyncedTopics,
          validateTitles: resolvedOptions.publishOnBuild.validateTitles,
          titleMinLength: resolvedOptions.publishOnBuild.titleMinLength,
        });
        const created = results.filter((result) => result.status === "created").length;
        const updated = results.filter((result) => result.status === "updated").length;
        const skipped = results.filter((result) => result.status === "skipped").length;
        const unchanged = results.filter((result) => result.status === "unchanged").length;
        const dryRun = results.filter((result) => result.status.startsWith("dry-run")).length;

        logger.info(
          `DiscussionBridge topic publish complete: ${created} created, ${updated} updated, ${skipped} skipped, ${unchanged} unchanged, ${dryRun} dry-run.`,
        );
      },
    },
  };
}

export { createDiscourseClient } from "./discourse/client.js";
export { syncDiscourseTopics } from "./sync/index.js";
export type { SyncDiscourseTopicsOptions, SyncedPage } from "./sync/index.js";

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
    comments: {
      enabled: options.comments?.enabled ?? true,
      className: options.comments?.className,
    },
    replies: {
      enabled: options.replies?.enabled ?? true,
      minScore: options.replies?.minScore ?? 0,
      maxReplies: options.replies?.maxReplies ?? 5,
    },
    publishOnBuild: {
      enabled: options.publishOnBuild?.enabled ?? false,
      syncExisting: options.publishOnBuild?.syncExisting ?? false,
      unlistSyncedTopics: options.publishOnBuild?.unlistSyncedTopics ?? false,
      validateTitles: options.publishOnBuild?.validateTitles ?? true,
      titleMinLength: options.publishOnBuild?.titleMinLength,
      docsDir: options.publishOnBuild?.docsDir ?? defaultDocsDirForPreset(preset),
      apiKey: options.publishOnBuild?.apiKey,
      apiUsername: options.publishOnBuild?.apiUsername,
      categoryId: options.publishOnBuild?.categoryId,
      tags: options.publishOnBuild?.tags,
      dryRun: options.publishOnBuild?.dryRun ?? false,
    },
  };
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


