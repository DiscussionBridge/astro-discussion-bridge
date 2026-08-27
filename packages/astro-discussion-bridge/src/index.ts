import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import {
  publishControlledDiscussions,
  type ControlledCreationOptions,
} from "./controlled-creation.js";
import { normalizePublicHttpUrl, normalizeServiceBaseUrl } from "./web-url.js";

type DiscussionBridgeIntegration = {
  name: string;
  hooks: {
    "astro:config:setup": (params: {
      config: { root: URL };
      updateConfig: (config: { vite?: { plugins?: Plugin[] } }) => void;
    }) => Promise<void>;
    "astro:build:start": (params: {
      logger: { info: (message: string) => void };
    }) => Promise<void>;
  };
};

export interface DiscussionBridgeCreditOptions {
  enabled?: boolean;
  prefix?: string;
  label?: string;
  href?: string;
}

export interface ControlledPublishOptions {
  enabled?: boolean;
  docsDir?: string;
  routeBase?: string;
  connectionId?: string;
  connectionSecret?: string;
  lane?: string;
  visibility?: "listed" | "unlisted";
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
}

export interface DiscussionBridgeOptions {
  discourseUrl: string;
  siteUrl?: string;
  comments?: {
    enabled?: boolean;
    embedHeight?: string;
    dynamicHeight?: boolean;
    embedMinHeight?: string;
    embedMaxHeight?: "none";
    embedViewportMaxHeight?: "none";
    className?: string;
    credit?: DiscussionBridgeCreditOptions;
  };
  publishOnBuild?: ControlledPublishOptions;
}

interface PublicOptions {
  discourseUrl: string;
  comments: {
    enabled: boolean;
    display: "fullInteractive";
    embedHeight: string;
    dynamicHeight: boolean;
    embedMinHeight: string;
    className?: string;
    credit: {
      enabled: boolean;
      prefix: string;
      label: string;
      href: string;
    };
  };
}

const virtualModuleId = "virtual:discussion-bridge/config";
const resolvedVirtualModuleId = `\0${virtualModuleId}`;

export default function discussionBridge(options: DiscussionBridgeOptions): DiscussionBridgeIntegration {
  const resolved = resolveOptions(options);
  let projectRoot = process.cwd();

  return {
    name: "astro-discussion-bridge",
    hooks: {
      "astro:config:setup": async ({ config, updateConfig }) => {
        projectRoot = fileURLToPath(config.root);
        updateConfig({ vite: { plugins: [virtualConfigPlugin(resolved.public)] } });
      },
      "astro:build:start": async ({ logger }) => {
        if (!resolved.publish.enabled) return;
        const siteUrl = resolved.siteUrl ?? process.env.SITE_URL;
        if (!siteUrl) throw new Error("Controlled publish-on-build requires siteUrl or SITE_URL.");
        const controlledCreation = resolveControlledCreation(resolved.publish);
        const results = await publishControlledDiscussions({
          docsDir: path.resolve(projectRoot, resolved.publish.docsDir),
          routeBase: resolved.publish.routeBase,
          siteUrl,
          discourseUrl: resolved.public.discourseUrl,
          controlledCreation,
        });
        const created = results.filter((result) => result.status === "created").length;
        const resolvedCount = results.filter((result) => result.status === "resolved").length;
        const skipped = results.filter((result) => result.status === "skipped").length;
        logger.info(`DiscussionBridge controlled publication complete: ${created} created, ${resolvedCount} resolved, ${skipped} skipped.`);
      },
    },
  };
}

export { publishControlledDiscussions } from "./controlled-creation.js";
export type {
  ControlledCreationOptions,
  ControlledDiscussionResult,
  PublishControlledDiscussionsOptions,
} from "./controlled-creation.js";

function resolveOptions(options: DiscussionBridgeOptions): {
  public: PublicOptions;
  siteUrl?: string;
  publish: Required<Pick<ControlledPublishOptions, "enabled" | "docsDir">> & ControlledPublishOptions;
} {
  if (!options.discourseUrl) throw new Error("astro-discussion-bridge requires discourseUrl.");
  if (
    (options.comments?.embedMaxHeight !== undefined && options.comments.embedMaxHeight !== "none")
    || (options.comments?.embedViewportMaxHeight !== undefined && options.comments.embedViewportMaxHeight !== "none")
  ) {
    throw new Error('Comments height ceilings must be omitted or "none" so Discourse Core owns full-app iframe sizing.');
  }
  return {
    public: {
      discourseUrl: normalizeServiceBaseUrl(options.discourseUrl),
      comments: {
        enabled: options.comments?.enabled ?? true,
        display: "fullInteractive",
        embedHeight: options.comments?.embedHeight ?? "800px",
        dynamicHeight: options.comments?.dynamicHeight ?? true,
        embedMinHeight: options.comments?.embedMinHeight ?? "360",
        className: options.comments?.className,
        credit: resolveCredit(options.comments?.credit),
      },
    },
    siteUrl: options.siteUrl ? normalizeServiceBaseUrl(options.siteUrl, "Site URL") : undefined,
    publish: {
      ...options.publishOnBuild,
      enabled: options.publishOnBuild?.enabled ?? false,
      docsDir: options.publishOnBuild?.docsDir ?? "src/content",
    },
  };
}

function resolveControlledCreation(options: ControlledPublishOptions): ControlledCreationOptions {
  const connectionId = nonEmpty(options.connectionId)
    ?? nonEmpty(process.env.DISCUSSIONBRIDGE_CONNECTION_ID);
  const connectionSecret = options.connectionSecret
    ?? process.env.DISCUSSIONBRIDGE_CONNECTION_SECRET;
  if (!connectionId || !connectionSecret) {
    throw new Error("Controlled publish-on-build requires server-only DISCUSSIONBRIDGE_CONNECTION_ID and DISCUSSIONBRIDGE_CONNECTION_SECRET values.");
  }
  return {
    connectionId,
    connectionSecret,
    lane: options.lane,
    visibility: options.visibility,
    requestTimeoutMs: options.requestTimeoutMs,
    maxResponseBytes: options.maxResponseBytes,
  };
}

function resolveCredit(options: DiscussionBridgeCreditOptions | undefined) {
  const href = normalizePublicHttpUrl(options?.href?.trim() || "https://discussionbridge.dev/", "comments.credit.href", {
    allowQuery: true,
    allowFragment: true,
  });
  return {
    enabled: options?.enabled ?? true,
    prefix: options?.prefix?.trim() || "Connected by",
    label: options?.label?.trim() || "DiscussionBridge",
    href,
  };
}

function virtualConfigPlugin(config: PublicOptions): Plugin {
  return {
    name: "astro-discussion-bridge-config",
    resolveId(id) {
      return id === virtualModuleId ? resolvedVirtualModuleId : undefined;
    },
    load(id) {
      return id === resolvedVirtualModuleId ? `export default ${JSON.stringify(config)};` : undefined;
    },
  };
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
