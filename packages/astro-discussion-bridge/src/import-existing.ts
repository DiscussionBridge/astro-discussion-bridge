import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createDiscourseClient, type DiscoursePost, type TopicResponse } from "./discourse/client.js";

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
    const firstPostSummary = firstPostForTopic(topic);
    if (!firstPostSummary) {
      throw new Error(`Could not find first post for Discourse topic ${topicRef.topicId}.`);
    }

    const slug = topicRef.slug ?? firstPostSummary.topic_slug ?? slugify(topic.title);
    const filePath = path.join(docsDir, `${slug}.md`);
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
    const body = postBodyForImport(firstPost, topic.id);
    const sourceHash = hashDiscussionSource({ title: topic.title, pageUrl, content: body });

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
  body: string;
}): string {
  const frontmatter: Record<string, string | number | boolean> = {
    title: input.title,
    ...(input.targetName ? { discussionTarget: input.targetName } : {}),
    discussionSourceMode: "discourse-imported",
    discussionSync: false,
    discourseTopicId: input.topicId,
    discourseTopicUrl: input.topicUrl,
    discussionImportedFrom: input.topicUrl,
    discussionImportPolicy: "unpruned",
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
