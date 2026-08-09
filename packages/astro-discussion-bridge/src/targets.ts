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

export interface DiscussionConnectionJob {
  purpose: string;
  audience: string;
  callToAction: string;
  description: string;
}

export type DiscussionConnectionJobs = Record<string, DiscussionConnectionJob>;

export interface ResolvedDiscussionTarget extends DiscussionTargetBinding {
  name: string;
  discourseUrl?: string;
  connectionJob?: DiscussionConnectionJob;
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

export function parseDiscussionConnectionJobs(
  value: DiscussionConnectionJobs | string | undefined,
  context = "discussionConnectionJobs",
): DiscussionConnectionJobs {
  if (!value) return {};

  let parsed: unknown = value;
  try {
    if (typeof value === "string") parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object keyed by target name");
    }

    const jobs: DiscussionConnectionJobs = {};
    for (const [targetName, rawJob] of Object.entries(parsed)) {
      if (!targetName.trim()) throw new Error("target names cannot be empty");
      if (!rawJob || typeof rawJob !== "object" || Array.isArray(rawJob)) {
        throw new Error(`connection job for target "${targetName}" must be an object`);
      }

      const job = rawJob as Record<string, unknown>;
      for (const field of ["purpose", "audience", "callToAction", "description"] as const) {
        if (typeof job[field] !== "string" || !job[field].trim()) {
          throw new Error(`${field} for target "${targetName}" must be a non-empty string`);
        }
      }

      const unknownFields = Object.keys(job).filter(
        (field) => !["purpose", "audience", "callToAction", "description"].includes(field),
      );
      if (unknownFields.length > 0) {
        throw new Error(
          `connection job for target "${targetName}" has unsupported field(s): ${unknownFields.join(", ")}`,
        );
      }

      jobs[targetName] = {
        purpose: (job.purpose as string).trim(),
        audience: (job.audience as string).trim(),
        callToAction: (job.callToAction as string).trim(),
        description: (job.description as string).trim(),
      };
    }
    return jobs;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${context}: ${detail}`);
  }
}

export function resolveDiscussionPresentation(input: {
  bindings?: DiscussionTargetBindings | string;
  connectionJobs?: DiscussionConnectionJobs | string;
  primaryTarget?: string;
  requireConnectionJobs?: boolean;
  sourceTarget?: string;
  sourceBinding?: DiscussionTargetBinding;
}): DiscussionPresentation {
  const bindings = parseDiscussionTargetBindings(input.bindings);
  const connectionJobs = parseDiscussionConnectionJobs(input.connectionJobs);
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
      connectionJob: connectionJobs[name],
    }));

  if (targets.length === 0) return { additional: [] };
  if (input.requireConnectionJobs) {
    const missingJobs = targets
      .filter((target) => !target.connectionJob)
      .map((target) => target.name);
    if (missingJobs.length > 0) {
      throw new Error(
        `Linked discussion target(s) require an explicit connection job: ${missingJobs.join(", ")}.`,
      );
    }
  }
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

export function discourseUrlFromTopicUrl(topicUrl: string | undefined): string | undefined {
  if (!topicUrl) return undefined;
  try {
    const url = new URL(topicUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    const match = url.pathname.match(/^(.*)\/t\/(?:[^/]+\/)?[1-9]\d*(?:\/.*)?$/);
    if (!match) return undefined;
    return `${url.origin}${match[1]}`.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}
