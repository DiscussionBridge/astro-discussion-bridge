import { createDiscourseClient } from "./discourse/client.js";
import type { DiscoursePreflightLimits } from "./sync/index.js";

export interface CheckDiscourseOptions {
  discourseUrl: string;
  apiKey?: string;
  apiUsername?: string;
  tags?: string[];
  configuredLimits?: DiscoursePreflightLimits;
}

export interface CheckDiscourseResult {
  settingsAvailable: boolean;
  settingsError?: string;
  capabilitiesAvailable: boolean;
  capabilitiesError?: string;
  limits: DiscoursePreflightLimits & {
    minFirstPostLength?: number;
    minPostLength?: number;
    taggingEnabled?: boolean;
  };
  tagCapabilities: {
    canTagTopics?: boolean;
    canCreateTag?: boolean;
  };
  tagIssues: string[];
}

export async function checkDiscourse(options: CheckDiscourseOptions): Promise<CheckDiscourseResult> {
  const discourse = createDiscourseClient({
    discourseUrl: options.discourseUrl,
    apiKey: options.apiKey,
    apiUsername: options.apiUsername,
  });

  const limits: CheckDiscourseResult["limits"] = { ...options.configuredLimits };
  const tagCapabilities: CheckDiscourseResult["tagCapabilities"] = {};
  let settingsAvailable = false;
  let settingsError: string | undefined;
  let capabilitiesAvailable = false;
  let capabilitiesError: string | undefined;

  try {
    const settings = await discourse.siteSettings();
    settingsAvailable = true;
    limits.minTopicTitleLength ??= settings.min_topic_title_length;
    limits.maxTopicTitleLength ??= settings.max_topic_title_length;
    limits.maxPostLength ??= settings.max_post_length;
    limits.maxTagsPerTopic ??= settings.max_tags_per_topic;
    limits.maxTagLength ??= settings.max_tag_length;
    limits.minFirstPostLength ??= settings.min_first_post_length;
    limits.minPostLength ??= settings.min_post_length;
    limits.taggingEnabled ??= settings.tagging_enabled;
  } catch (error) {
    settingsError = errorMessage(error);
  }

  try {
    const site = await discourse.siteInfo();
    capabilitiesAvailable = true;
    tagCapabilities.canTagTopics = site.can_tag_topics;
    tagCapabilities.canCreateTag = site.can_create_tag;
  } catch (error) {
    capabilitiesError = errorMessage(error);
  }

  const tagIssues = validateTags(options.tags ?? [], limits);

  return {
    settingsAvailable,
    settingsError,
    capabilitiesAvailable,
    capabilitiesError,
    limits,
    tagCapabilities,
    tagIssues,
  };
}

function validateTags(tags: string[], limits: CheckDiscourseResult["limits"]): string[] {
  const issues: string[] = [];
  const normalizedTags = [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];

  if (limits.maxTagsPerTopic !== undefined && normalizedTags.length > limits.maxTagsPerTopic) {
    issues.push(`Too many tags: ${normalizedTags.length}; maximum is ${limits.maxTagsPerTopic}.`);
  }

  if (limits.maxTagLength !== undefined) {
    for (const tag of normalizedTags) {
      if (tag.length > limits.maxTagLength) {
        issues.push(`Tag "${tag}" is too long: ${tag.length}; maximum is ${limits.maxTagLength}.`);
      }
    }
  }

  return issues;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
