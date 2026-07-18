import { createDiscourseClient } from "./discourse/client.js";
import type { DiscoursePreflightLimits } from "./sync/index.js";

export interface CheckDiscourseOptions {
  discourseUrl: string;
  apiKey?: string;
  apiUsername?: string;
  categoryId?: number;
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
  categoriesAvailable: boolean;
  categoriesError?: string;
  category?: {
    id: number;
    name: string;
    slug?: string;
    readRestricted?: boolean;
  };
  tagsAvailable: boolean;
  tagsError?: string;
  requestedTags: Array<{
    name: string;
    exists?: boolean;
    count?: number;
  }>;
  setupIssues: string[];
  setupWarnings: string[];
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
  let categoriesAvailable = false;
  let categoriesError: string | undefined;
  let category: CheckDiscourseResult["category"];
  let tagsAvailable = false;
  let tagsError: string | undefined;
  let knownTags: KnownTag[] | undefined;

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

  try {
    const categories = await discourse.categories();
    categoriesAvailable = true;
    if (options.categoryId !== undefined) {
      const match = categories.category_list?.categories?.find((candidate) => candidate.id === options.categoryId);
      if (match) {
        category = {
          id: match.id,
          name: match.name,
          slug: match.slug,
          readRestricted: match.read_restricted,
        };
      }
    }
  } catch (error) {
    categoriesError = errorMessage(error);
  }

  try {
    const response = await discourse.tags();
    tagsAvailable = true;
    knownTags = response.tags?.map((tag) => ({
      name: (tag.name ?? tag.text ?? "").trim().toLowerCase(),
      count: tag.count,
    })).filter((tag) => Boolean(tag.name));
  } catch (error) {
    tagsError = errorMessage(error);
  }

  const normalizedTags = normalizeTags(options.tags ?? []);
  const requestedTags = normalizedTags.map((tag) => {
    const knownTag = knownTags?.find((candidate) => candidate.name === tag);
    return {
      name: tag,
      exists: knownTags ? Boolean(knownTag) : undefined,
      count: knownTag?.count,
    };
  });
  const setupIssues = validateSetup({
    categoryId: options.categoryId,
    category,
    categoriesAvailable,
    tags: normalizedTags,
    requestedTags,
    limits,
    tagCapabilities,
  });
  const setupWarnings = setupWarningsFor({
    categoryId: options.categoryId,
    categoriesAvailable,
    categoriesError,
    tags: normalizedTags,
    tagsAvailable,
    tagsError,
    settingsAvailable,
    settingsError,
    capabilitiesAvailable,
    capabilitiesError,
  });
  const tagIssues = validateTags(normalizedTags, limits);

  return {
    settingsAvailable,
    settingsError,
    capabilitiesAvailable,
    capabilitiesError,
    limits,
    tagCapabilities,
    categoriesAvailable,
    categoriesError,
    category,
    tagsAvailable,
    tagsError,
    requestedTags,
    setupIssues,
    setupWarnings,
    tagIssues,
  };
}

function validateTags(tags: string[], limits: CheckDiscourseResult["limits"]): string[] {
  const issues: string[] = [];

  if (limits.maxTagsPerTopic !== undefined && tags.length > limits.maxTagsPerTopic) {
    issues.push(`Too many tags: ${tags.length}; maximum is ${limits.maxTagsPerTopic}.`);
  }

  if (limits.maxTagLength !== undefined) {
    for (const tag of tags) {
      if (tag.length > limits.maxTagLength) {
        issues.push(`Tag "${tag}" is too long: ${tag.length}; maximum is ${limits.maxTagLength}.`);
      }
    }
  }

  return issues;
}

function validateSetup(input: {
  categoryId?: number;
  category?: CheckDiscourseResult["category"];
  categoriesAvailable: boolean;
  tags: string[];
  requestedTags: CheckDiscourseResult["requestedTags"];
  limits: CheckDiscourseResult["limits"];
  tagCapabilities: CheckDiscourseResult["tagCapabilities"];
}): string[] {
  const issues: string[] = [];

  if (input.categoryId !== undefined && input.categoriesAvailable && !input.category) {
    issues.push(`Category ${input.categoryId} was not found.`);
  }

  if (input.tags.length && input.limits.taggingEnabled === false) {
    issues.push("Tagging is disabled, but tags were requested.");
  }

  if (input.tags.length && input.tagCapabilities.canTagTopics === false) {
    issues.push("The API user cannot tag topics.");
  }

  const missingTags = input.requestedTags.filter((tag) => tag.exists === false).map((tag) => tag.name);
  if (missingTags.length && input.tagCapabilities.canCreateTag === false) {
    issues.push(`Requested tags do not exist and the API user cannot create tags: ${missingTags.join(", ")}.`);
  }

  return issues;
}

function setupWarningsFor(input: {
  categoryId?: number;
  categoriesAvailable: boolean;
  categoriesError?: string;
  tags: string[];
  tagsAvailable: boolean;
  tagsError?: string;
  settingsAvailable: boolean;
  settingsError?: string;
  capabilitiesAvailable: boolean;
  capabilitiesError?: string;
}): string[] {
  const warnings: string[] = [];

  if (!input.settingsAvailable) {
    warnings.push(`Could not read client-visible site settings${input.settingsError ? `: ${oneLine(input.settingsError)}` : ""}.`);
  }

  if (!input.capabilitiesAvailable) {
    warnings.push(`Could not read user-specific site capabilities${input.capabilitiesError ? `: ${oneLine(input.capabilitiesError)}` : ""}.`);
  }

  if (input.categoryId !== undefined && !input.categoriesAvailable) {
    warnings.push(`Could not verify category ${input.categoryId}${input.categoriesError ? `: ${oneLine(input.categoriesError)}` : ""}.`);
  }

  if (input.tags.length && !input.tagsAvailable) {
    warnings.push(`Could not list existing tags${input.tagsError ? `: ${oneLine(input.tagsError)}` : ""}.`);
  }

  return warnings;
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

interface KnownTag {
  name: string;
  count?: number;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
