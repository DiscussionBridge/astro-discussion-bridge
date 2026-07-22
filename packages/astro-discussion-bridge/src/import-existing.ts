import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createDiscourseClient, type DiscoursePost, type TopicResponse } from "./discourse/client.js";

export type ImportPruneProfile = "community-call-to-action";

export interface ImportExistingDiscourseTopicsOptions {
  docsDir: string;
  discourseUrl: string;
  siteUrl: string;
  targetName?: string;
  apiKey: string;
  apiUsername: string;
  topics: string[];
  routeBase?: string;
  dryRun?: boolean;
  overwrite?: boolean;
  commentsDisplay?: "simple" | "full" | "fullInteractive";
  heroImage?: string;
  heroAlt?: string;
  pruneProfiles?: ImportPruneProfile[];
  outputFile?: string;
  requiredTags?: string[];
}

export interface ImportedDiscourseTopic {
  filePath: string;
  title: string;
  pageUrl: string;
  topicId: number;
  topicUrl: string;
  status: "imported" | "skipped" | "dry-run-import" | "dry-run-overwrite";
  reason?: string;
}

export async function importExistingDiscourseTopics(
  options: ImportExistingDiscourseTopicsOptions,
): Promise<ImportedDiscourseTopic[]> {
  const heroImage = options.heroImage?.trim();
  const heroAlt = options.heroAlt?.trim();
  validateHeroOptions({ heroImage, heroAlt });
  const pruneProfiles = validateImportPruneProfiles(options.pruneProfiles ?? []);
  const requiredTags = normalizeRequiredTags(options.requiredTags ?? []);
  if (options.outputFile && options.topics.length !== 1) {
    throw new Error("outputFile can only be used when importing one topic.");
  }
  const docsDir = path.resolve(options.docsDir);
  const discourse = createDiscourseClient({
    discourseUrl: options.discourseUrl,
    apiKey: options.apiKey,
    apiUsername: options.apiUsername,
  });
  const topicRefs = options.topics.map((topic) => parseTopicRef(topic, discourse.discourseUrl));
  const results: ImportedDiscourseTopic[] = [];

  await fs.mkdir(docsDir, { recursive: true });

  for (const topicRef of topicRefs) {
    const topic = await discourse.topic(topicRef.topicId);
    validateRequiredTopicTags(topic, requiredTags);
    const firstPostSummary = firstPostForTopic(topic);
    if (!firstPostSummary) {
      throw new Error(`Could not find first post for Discourse topic ${topicRef.topicId}.`);
    }

    const slug = topicRef.slug ?? firstPostSummary.topic_slug ?? slugify(topic.title);
    const filePath = options.outputFile
      ? safeExplicitImportFilePath(docsDir, options.outputFile, topic.id)
      : safeImportFilePath(docsDir, slug, topic.id);
    const pageUrl = pageUrlForFile({ docsDir, filePath, siteUrl: options.siteUrl, routeBase: options.routeBase });
    const topicUrl = `${discourse.discourseUrl}/t/${slug}/${topic.id}`;
    const fileExists = await pathExists(filePath);

    if (fileExists && !options.overwrite) {
      results.push({
        filePath,
        title: topic.title,
        pageUrl,
        topicId: topic.id,
        topicUrl,
        status: "skipped",
        reason: "file already exists",
      });
      continue;
    }

    if (options.dryRun) {
      results.push({
        filePath,
        title: topic.title,
        pageUrl,
        topicId: topic.id,
        topicUrl,
        status: fileExists ? "dry-run-overwrite" : "dry-run-import",
      });
      continue;
    }

    let firstPost: DiscoursePost;
    try {
      firstPost = await discourse.post(firstPostSummary.id);
    } catch (error) {
      if (!firstPostSummary.raw?.trim()) throw error;
      firstPost = firstPostSummary;
    }
    const body = applyImportPruneProfiles(
      postBodyForImport(firstPost, topic.id),
      pruneProfiles,
      topic.id,
    );
    const sourceHash = hashDiscussionSource({ title: topic.title, pageUrl, content: body });

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      markdownForImportedTopic({
        title: topic.title,
        targetName: options.targetName,
        topicId: topic.id,
        topicUrl,
        sourceHash,
        importedAt: new Date().toISOString(),
        commentsDisplay: options.commentsDisplay,
        heroImage,
        heroAlt,
        importPolicy: pruneProfiles.length
          ? `pruned:${pruneProfiles.join(",")}`
          : "unpruned",
        body,
      }),
    );

    results.push({
      filePath,
      title: topic.title,
      pageUrl,
      topicId: topic.id,
      topicUrl,
      status: "imported",
    });
  }

  return results;
}

function validateHeroOptions(options: Pick<ImportExistingDiscourseTopicsOptions, "heroImage" | "heroAlt">): void {
  if (options.heroImage && !options.heroAlt) {
    throw new Error("heroAlt is required when heroImage is configured.");
  }
  if (options.heroAlt && !options.heroImage) {
    throw new Error("heroImage is required when heroAlt is configured.");
  }
}

function validateImportPruneProfiles(profiles: ImportPruneProfile[]): ImportPruneProfile[] {
  const supported = new Set<ImportPruneProfile>(["community-call-to-action"]);
  const seen = new Set<string>();

  for (const profile of profiles as string[]) {
    if (!supported.has(profile as ImportPruneProfile)) {
      throw new Error(`Unsupported import prune profile: ${profile}`);
    }
    if (seen.has(profile)) {
      throw new Error(`Duplicate import prune profile: ${profile}`);
    }
    seen.add(profile);
  }

  return [...profiles];
}

function parseTopicRef(value: string, discourseUrl: string): { topicId: number; slug?: string } {
  const trimmed = value.trim();
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric > 0) return { topicId: numeric };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`Topic must be a numeric id or Discourse topic URL: ${value}`);
  }

  const expectedHost = new URL(discourseUrl).host;
  if (url.host !== expectedHost) {
    throw new Error(`Topic URL host ${url.host} does not match Discourse URL host ${expectedHost}.`);
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const topicIndex = parts.indexOf("t");
  if (topicIndex === -1) {
    throw new Error(`Could not parse Discourse topic URL: ${value}`);
  }

  const afterTopic = parts.slice(topicIndex + 1);
  const idPart = afterTopic.find((part) => /^\d+$/.test(part));
  if (!idPart) {
    throw new Error(`Could not find topic id in Discourse topic URL: ${value}`);
  }

  const slug = afterTopic.find((part) => part !== idPart && !/^\d+$/.test(part));
  return { topicId: Number(idPart), slug };
}

function firstPostForTopic(topic: TopicResponse): DiscoursePost | undefined {
  return topic.post_stream.posts.find((post) => post.post_number === 1);
}

function postBodyForImport(post: DiscoursePost, topicId: number): string {
  if (post.raw?.trim()) return post.raw.trim();
  throw new Error(
    `Discourse did not expose raw Markdown for topic ${topicId}. ` +
      "Rerun import-existing with DISCOURSE_DIAGNOSTICS_API_KEY or --diagnostics-api-key using a read-capable key.",
  );
}

function applyImportPruneProfiles(
  body: string,
  profiles: ImportPruneProfile[],
  topicId: number,
): string {
  return profiles.reduce((current, profile) => {
    if (profile === "community-call-to-action") {
      return pruneTrailingCommunityCallToAction(current, topicId);
    }
    return current;
  }, body);
}

function pruneTrailingCommunityCallToAction(body: string, topicId: number): string {
  const candidates = Array.from(body.matchAll(/\r?\n---[ \t]*\r?\n/g));

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const start = candidates[index].index;
    if (start === undefined) continue;
    const suffix = body.slice(start);
    const hasJoinPrompt = /Join the Conversation Today!/i.test(suffix);
    const hasSignupLink = /\/signup(?:[)\s]|$)/i.test(suffix);
    const hasImpactPrompt = /Please share how\b/i.test(suffix);
    const hasStoryLink = /\/c\/stories\//i.test(suffix);

    if (hasJoinPrompt && hasSignupLink && hasImpactPrompt && hasStoryLink) {
      return body.slice(0, start).trim();
    }
  }

  throw new Error(
    `Prune profile community-call-to-action did not find a verified trailing block in Discourse topic ${topicId}. No file was written.`,
  );
}

function cookedHtmlToMarkdown(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) => `\n\n\`\`\`\n${decodeHtmlEntities(stripTags(code)).trim()}\n\`\`\`\n\n`)
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, text) => `\n# ${stripTags(text).trim()}\n\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, text) => `\n## ${stripTags(text).trim()}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, text) => `\n### ${stripTags(text).trim()}\n\n`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, text) => `\n\n${stripTags(text).trim()}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, text) => `\n- ${stripTags(text).trim()}`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function markdownForImportedTopic(input: {
  title: string;
  targetName?: string;
  topicId: number;
  topicUrl: string;
  sourceHash: string;
  importedAt: string;
  commentsDisplay?: "simple" | "full" | "fullInteractive";
  heroImage?: string;
  heroAlt?: string;
  importPolicy: string;
  body: string;
}): string {
  const frontmatter: Record<string, string | number | boolean> = {
    title: input.title,
    ...(input.targetName
      ? {
          discussionTarget: input.targetName,
          discussionSourceTarget: input.targetName,
        }
      : {}),
    discussionSourceMode: "discourse-imported",
    discussionSync: false,
    discourseTopicId: input.topicId,
    discourseTopicUrl: input.topicUrl,
    discussionImportedFrom: input.topicUrl,
    discussionImportPolicy: input.importPolicy,
    discussionSourceHash: input.sourceHash,
    discussionImportedAt: input.importedAt,
  };
  if (input.commentsDisplay) frontmatter.discussionCommentsDisplay = input.commentsDisplay;

  const hero = input.heroImage
    ? `![${escapeMarkdownAlt(input.heroAlt ?? "")}](<${input.heroImage}>)\n\n`
    : "";

  return `---\n${serializeYaml(frontmatter)}---\n\n${hero}${input.body.trim()}\n`;
}

function escapeMarkdownAlt(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").trim();
}

function serializeYaml(values: Record<string, string | number | boolean>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}: ${quoteYamlValue(value)}`)
    .join("\n") + "\n";
}

function quoteYamlValue(value: string | number | boolean): string {
  if (typeof value !== "string") return String(value);
  if (/^[0-9]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "imported-discourse-topic";
}

function pageUrlForFile(input: {
  docsDir: string;
  filePath: string;
  siteUrl: string;
  routeBase?: string;
}): string {
  const relative = path.relative(input.docsDir, input.filePath).replace(/\\/g, "/");
  const withoutExtension = relative.replace(/\.(md|mdx)$/i, "");
  const slug = withoutExtension.endsWith("/index")
    ? withoutExtension.slice(0, -"/index".length)
    : withoutExtension;
  const routeBase = normalizeRouteBase(input.routeBase);
  const pathname = [routeBase, slug].filter(Boolean).join("/");

  return `${input.siteUrl.replace(/\/+$/, "")}/${pathname ? `${pathname}/` : ""}`;
}

function safeImportFilePath(docsDir: string, slug: string, topicId: number): string {
  const filePath = path.resolve(docsDir, `${slug}.md`);
  const relative = path.relative(docsDir, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Discourse topic ${topicId} resolved to an unsafe Astro file path.`);
  }
  return filePath;
}

function safeExplicitImportFilePath(docsDir: string, outputFile: string, topicId: number): string {
  const trimmed = outputFile.trim();
  if (!trimmed || !/\.(?:md|mdx)$/i.test(trimmed)) {
    throw new Error(`Import output for Discourse topic ${topicId} must be a relative .md or .mdx file.`);
  }
  if (path.isAbsolute(trimmed)) {
    throw new Error(`Import output for Discourse topic ${topicId} must be relative to the docs directory.`);
  }
  const filePath = path.resolve(docsDir, trimmed);
  const relative = path.relative(docsDir, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Import output for Discourse topic ${topicId} resolved outside the docs directory.`);
  }
  return filePath;
}

function normalizeRequiredTags(tags: string[]): string[] {
  const normalized = tags.map((tag) => tag.trim()).filter(Boolean);
  if (normalized.length !== tags.length) throw new Error("requiredTags must contain non-empty tag names.");
  const keys = normalized.map((tag) => tag.toLowerCase());
  if (new Set(keys).size !== keys.length) throw new Error("requiredTags must not contain duplicates.");
  return normalized;
}

function validateRequiredTopicTags(topic: TopicResponse, requiredTags: string[]): void {
  if (requiredTags.length === 0) return;
  const actual = (topic.tags ?? [])
    .map((tag) => typeof tag === "string" ? tag : tag.name ?? tag.slug ?? "")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  const missing = requiredTags.filter((tag) => !actual.includes(tag.toLowerCase()));
  if (missing.length) {
    throw new Error(
      `Discourse topic ${topic.id} is missing required import tag(s): ${missing.join(", ")}. No file was written.`,
    );
  }
}

function normalizeRouteBase(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^\/+|\/+$/g, "");
}

function hashDiscussionSource(input: { title: string; pageUrl: string; content: string }): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
