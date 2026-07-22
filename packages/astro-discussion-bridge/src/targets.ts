export interface DiscussionTargetBinding {
  topicId?: number;
  topicUrl?: string;
  sourceHash?: string;
  lastSyncedAt?: string;
  status?: "synced" | "failed";
  lastError?: string;
  lastAttemptedAt?: string;
}

export type DiscussionTargetBindings = Record<string, DiscussionTargetBinding>;

export interface ResolvedDiscussionTarget extends DiscussionTargetBinding {
  name: string;
  discourseUrl?: string;
}

export interface DiscussionPresentation {
  primary?: ResolvedDiscussionTarget;
  additional: ResolvedDiscussionTarget[];
}

export function parseDiscussionTargetBindings(
  value: DiscussionTargetBindings | string | undefined,
  context = "discussionTargetBindings",
): DiscussionTargetBindings {
  if (!value) return {};

  let parsed: unknown = value;
  try {
    if (typeof value === "string") parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object keyed by target name");
    }

    const bindings: DiscussionTargetBindings = {};
    for (const [targetName, rawBinding] of Object.entries(parsed)) {
      if (!targetName.trim()) throw new Error("target names cannot be empty");
      if (!rawBinding || typeof rawBinding !== "object" || Array.isArray(rawBinding)) {
        throw new Error(`binding for target "${targetName}" must be an object`);
      }
      const binding = rawBinding as Record<string, unknown>;
      if (
        binding.topicId !== undefined &&
        (typeof binding.topicId !== "number" || !Number.isInteger(binding.topicId) || binding.topicId <= 0)
      ) {
        throw new Error(`topicId for target "${targetName}" must be a positive integer`);
      }
      if (
        binding.status !== undefined &&
        binding.status !== "synced" &&
        binding.status !== "failed"
      ) {
        throw new Error(`status for target "${targetName}" must be "synced" or "failed"`);
      }

      for (const field of ["topicUrl", "sourceHash", "lastSyncedAt", "lastError", "lastAttemptedAt"] as const) {
        if (binding[field] !== undefined && typeof binding[field] !== "string") {
          throw new Error(`${field} for target "${targetName}" must be a string`);
        }
      }

      bindings[targetName] = {
        topicId: binding.topicId as number | undefined,
        topicUrl: binding.topicUrl as string | undefined,
        sourceHash: binding.sourceHash as string | undefined,
        lastSyncedAt: binding.lastSyncedAt as string | undefined,
        status: binding.status as DiscussionTargetBinding["status"],
        lastError: binding.lastError as string | undefined,
        lastAttemptedAt: binding.lastAttemptedAt as string | undefined,
      };
    }
    return bindings;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${context}: ${detail}`);
  }
}

export function resolveDiscussionPresentation(input: {
  bindings?: DiscussionTargetBindings | string;
  primaryTarget?: string;
  sourceTarget?: string;
  sourceBinding?: DiscussionTargetBinding;
}): DiscussionPresentation {
  const bindings = parseDiscussionTargetBindings(input.bindings);
  const sourceHasTopic = Boolean(input.sourceBinding?.topicId || input.sourceBinding?.topicUrl);
  if (input.sourceTarget && sourceHasTopic) {
    bindings[input.sourceTarget] = {
      ...bindings[input.sourceTarget],
      ...input.sourceBinding,
    };
  }

  const targets = Object.entries(bindings)
    .filter(([, binding]) => Boolean(binding.topicId || binding.topicUrl))
    .map(([name, binding]) => ({
      name,
      ...binding,
      discourseUrl: discourseUrlFromTopicUrl(binding.topicUrl),
    }));

  if (targets.length === 0) return { additional: [] };
  if (targets.length > 1 && !input.primaryTarget) {
    throw new Error(
      `Multiple discussion targets are linked (${targets.map((target) => target.name).join(", ")}); set discussionPrimaryTarget explicitly.`,
    );
  }

  const primaryName = input.primaryTarget ?? targets[0].name;
  const primary = targets.find((target) => target.name === primaryName);
  if (!primary) {
    throw new Error(
      `discussionPrimaryTarget "${primaryName}" has no linked topic. Available targets: ${targets.map((target) => target.name).join(", ")}.`,
    );
  }

  return {
    primary,
    additional: targets.filter((target) => target.name !== primary.name),
  };
}

export function discussionTargetLabel(name: string): string {
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function discourseUrlFromTopicUrl(topicUrl: string | undefined): string | undefined {
  if (!topicUrl) return undefined;
  try {
    const url = new URL(topicUrl);
    const topicPath = url.pathname.indexOf("/t/");
    url.pathname = topicPath >= 0 ? url.pathname.slice(0, topicPath) : "";
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}
