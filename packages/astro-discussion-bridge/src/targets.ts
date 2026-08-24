import { parsePublicDiscourseTopicUrl } from "./web-url.js";

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

const MAX_TARGETS = 32;
const MAX_TARGET_NAME_BYTES = 64;
const TARGET_FIELDS = new Set([
  "topicId",
  "topicUrl",
  "sourceHash",
  "lastSyncedAt",
  "status",
  "lastError",
  "lastAttemptedAt",
]);
const STRING_FIELD_LIMITS = {
  sourceHash: 256,
  lastSyncedAt: 128,
  lastError: 2_048,
  lastAttemptedAt: 128,
} as const;
const JOB_FIELD_LIMITS = {
  purpose: 256,
  audience: 256,
  callToAction: 512,
  description: 2_048,
} as const;

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validateTargetName(targetName: string): void {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(targetName)
    || utf8Bytes(targetName) > MAX_TARGET_NAME_BYTES
  ) {
    throw new Error(
      `target name "${targetName.slice(0, MAX_TARGET_NAME_BYTES)}" must be 1-${MAX_TARGET_NAME_BYTES} ASCII letters, digits, hyphens, or underscores`,
    );
  }
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

    const entries = Object.entries(parsed);
    if (entries.length > MAX_TARGETS) {
      throw new Error(`cannot contain more than ${MAX_TARGETS} targets`);
    }

    const bindings: DiscussionTargetBindings = {};
    for (const [targetName, rawBinding] of entries) {
      validateTargetName(targetName);
      if (!rawBinding || typeof rawBinding !== "object" || Array.isArray(rawBinding)) {
        throw new Error(`binding for target "${targetName}" must be an object`);
      }
      const binding = rawBinding as Record<string, unknown>;
      const unknownFields = Object.keys(binding).filter((field) => !TARGET_FIELDS.has(field));
      if (unknownFields.length > 0) {
        throw new Error(
          `binding for target "${targetName}" has unsupported field(s): ${unknownFields.join(", ")}`,
        );
      }
      if (
        binding.topicId !== undefined &&
        (typeof binding.topicId !== "number"
          || !Number.isSafeInteger(binding.topicId)
          || binding.topicId <= 0)
      ) {
        throw new Error(`topicId for target "${targetName}" must be a positive safe integer`);
      }
      if (
        binding.status !== undefined &&
        binding.status !== "synced" &&
        binding.status !== "failed"
      ) {
        throw new Error(`status for target "${targetName}" must be "synced" or "failed"`);
      }

      let topicUrl: string | undefined;
      if (binding.topicUrl !== undefined) {
        if (typeof binding.topicUrl !== "string") {
          throw new Error(`topicUrl for target "${targetName}" must be a string`);
        }
        const topic = parsePublicDiscourseTopicUrl(
          binding.topicUrl,
          undefined,
          `topicUrl for target "${targetName}"`,
        );
        if (binding.topicId !== undefined && binding.topicId !== topic.topicId) {
          throw new Error(`topicId and topicUrl for target "${targetName}" must identify the same topic`);
        }
        topicUrl = topic.href;
      }

      for (const [field, maxBytes] of Object.entries(STRING_FIELD_LIMITS) as Array<
        [keyof typeof STRING_FIELD_LIMITS, number]
      >) {
        const fieldValue = binding[field];
        if (fieldValue !== undefined && typeof fieldValue !== "string") {
          throw new Error(`${field} for target "${targetName}" must be a string`);
        }
        if (typeof fieldValue === "string" && utf8Bytes(fieldValue) > maxBytes) {
          throw new Error(`${field} for target "${targetName}" exceeds ${maxBytes} UTF-8 bytes`);
        }
      }

      bindings[targetName] = {
        topicId: binding.topicId as number | undefined,
        topicUrl,
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

    const entries = Object.entries(parsed);
    if (entries.length > MAX_TARGETS) {
      throw new Error(`cannot contain more than ${MAX_TARGETS} connection jobs`);
    }

    const jobs: DiscussionConnectionJobs = {};
    for (const [targetName, rawJob] of entries) {
      validateTargetName(targetName);
      if (!rawJob || typeof rawJob !== "object" || Array.isArray(rawJob)) {
        throw new Error(`connection job for target "${targetName}" must be an object`);
      }

      const job = rawJob as Record<string, unknown>;
      for (const [field, maxBytes] of Object.entries(JOB_FIELD_LIMITS) as Array<
        [keyof typeof JOB_FIELD_LIMITS, number]
      >) {
        if (typeof job[field] !== "string" || !job[field].trim()) {
          throw new Error(`${field} for target "${targetName}" must be a non-empty string`);
        }
        if (utf8Bytes(job[field]) > maxBytes) {
          throw new Error(`${field} for target "${targetName}" exceeds ${maxBytes} UTF-8 bytes`);
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
  let bindings = parseDiscussionTargetBindings(input.bindings);
  const connectionJobs = parseDiscussionConnectionJobs(input.connectionJobs);
  const sourceHasTopic = Boolean(input.sourceBinding?.topicId || input.sourceBinding?.topicUrl);
  if (input.sourceTarget && sourceHasTopic) {
    const merged = parseDiscussionTargetBindings({
      [input.sourceTarget]: {
        ...bindings[input.sourceTarget],
        ...input.sourceBinding,
      },
    }, "source discussion target binding");
    bindings[input.sourceTarget] = merged[input.sourceTarget];
    bindings = parseDiscussionTargetBindings(bindings, "merged discussion target bindings");
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
    return parsePublicDiscourseTopicUrl(topicUrl).serviceBase;
  } catch {
    return undefined;
  }
}
