import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createDiscourseClient } from "../discourse/client.js";

export type SyncMode = "publish-new" | "sync-existing" | "publish-and-sync";

export interface SyncDiscourseTopicsOptions {
  docsDir: string;
  siteUrl: string;
  discourseUrl: string;
  apiKey: string;
  apiUsername: string;
  categoryId?: number;
  tags?: string[];
  dryRun?: boolean;
  mode?: SyncMode;
  unlistSyncedTopics?: boolean;
  validateTitles?: boolean;
  titleMinLength?: number;
}

export interface SyncedPage {
  filePath: string;
  title: string;
  pageUrl: string;
  topicId?: number;
  topicUrl?: string;
  status: "created" | "updated" | "skipped" | "unchanged" | "dry-run-create" | "dry-run-update";
  reason?: string;
}

interface ParsedMarkdown {
  frontmatter: Record<string, string>;
  body: string;
  rawFrontmatter: string;
}

const markdownExtensions = new Set([".md", ".mdx"]);
const defaultTitleMinLength = 15;

export async function syncDiscourseTopics(
  options: SyncDiscourseTopicsOptions,
): Promise<SyncedPage[]> {
  const docsDir = path.resolve(options.docsDir);
  const mode = options.mode ?? "publish-new";
  const files = await findMarkdownFiles(docsDir);
  const pages = await Promise.all(
    files.map(async (filePath) => {
      const source = await fs.readFile(filePath, "utf8");
      const parsed = parseMarkdown(source);
      const title = parsed.frontmatter.title || findFirstHeading(parsed.body) || titleFromFile(filePath);
      const pageUrl = pageUrlForFile({ docsDir, filePath, siteUrl: options.siteUrl });
      const content = discussionContentForPage(parsed);
      const sourceHash = hashDiscussionSource({ title, pageUrl, content });

      return {
        filePath,
        source,
        parsed,
        title,
        pageUrl,
        content,
        sourceHash,
        existingTopicId: parsed.frontmatter.discourseTopicId,
        existingTopicUrl: parsed.frontmatter.discourseTopicUrl,
        previousHash: parsed.frontmatter.discussionSourceHash,
      };
    }),
  );

  if (options.validateTitles !== false) {
    validateManagedPageTitles({
      pages,
      mode,
      minLength: options.titleMinLength ?? defaultTitleMinLength,
    });
  }

  const discourse = createDiscourseClient({
    discourseUrl: options.discourseUrl,
    apiKey: options.apiKey,
    apiUsername: options.apiUsername,
  });
  const results: SyncedPage[] = [];

  for (const page of pages) {
    const {
      filePath,
      source,
      title,
      pageUrl,
      content,
      sourceHash,
      existingTopicId,
      existingTopicUrl,
      previousHash,
    } = page;

    if (existingTopicId) {
      if (mode === "publish-new") {
        results.push({
          filePath,
          title,
          pageUrl,
          topicId: Number(existingTopicId),
          topicUrl: existingTopicUrl,
          status: "skipped",
          reason: "already linked",
        });
        continue;
      }

      if (options.dryRun) {
        results.push({
          filePath,
          title,
          pageUrl,
          topicId: Number(existingTopicId),
          topicUrl: existingTopicUrl,
          status: previousHash === sourceHash ? "unchanged" : "dry-run-update",
          reason: previousHash === sourceHash ? "source hash unchanged" : undefined,
        });
        continue;
      }

      const sourceChanged = previousHash !== sourceHash;
      const topic = await discourse.topic(existingTopicId);
      const firstPost = topic.post_stream.posts.find((post) => post.post_number === 1);
      if (sourceChanged && !firstPost) {
        throw new Error(`Could not find first post for Discourse topic ${existingTopicId}.`);
      }
      let updated = false;

      if (sourceChanged && firstPost) {
        await discourse.updatePost({
          postId: firstPost.id,
          raw: companionTopicBody({
            title,
            pageUrl,
            content,
            lastSyncedAt: new Date().toISOString(),
          }),
          editReason: "Sync DiscussionBridge companion summary from Astro source",
          bypassBump: true,
        });
        updated = true;
      }

      if (topic.title !== title || (options.categoryId !== undefined && topic.category_id !== options.categoryId)) {
        await discourse.updateTopic({
          topicId: existingTopicId,
          title,
          categoryId: options.categoryId,
        });
        updated = true;
      }

      if (options.unlistSyncedTopics && topic.visible !== false) {
        await discourse.updateTopicStatus({
          topicId: existingTopicId,
          status: "visible",
          enabled: false,
        });
        updated = true;
      }

      if (sourceChanged) {
        await fs.writeFile(
          filePath,
          updateFrontmatter(source, {
            discussionSourceHash: sourceHash,
            discussionLastSyncedAt: new Date().toISOString(),
          }),
        );
      }

      results.push({
        filePath,
        title,
        pageUrl,
        topicId: Number(existingTopicId),
        topicUrl: existingTopicUrl,
        status: updated ? "updated" : "unchanged",
        reason: updated ? undefined : "source hash and topic metadata unchanged",
      });
      continue;
    }

    if (mode === "sync-existing") {
      results.push({
        filePath,
        title,
        pageUrl,
        status: "skipped",
        reason: "not linked",
      });
      continue;
    }

    if (options.dryRun) {
      results.push({ filePath, title, pageUrl, status: "dry-run-create" });
      continue;
    }

    const lastSyncedAt = new Date().toISOString();
    const topic = await discourse.createTopic({
      title,
      raw: companionTopicBody({ title, pageUrl, content, lastSyncedAt }),
      category: options.categoryId,
      tags: options.tags,
      embedUrl: pageUrl,
    });
    const topicUrl = `${discourse.discourseUrl}/t/${topic.topic_slug}/${topic.topic_id}`;

    if (options.unlistSyncedTopics) {
      await discourse.updateTopicStatus({
        topicId: topic.topic_id,
        status: "visible",
        enabled: false,
      });
    }

    await fs.writeFile(
      filePath,
      updateFrontmatter(source, {
        discourseTopicId: String(topic.topic_id),
        discourseTopicUrl: topicUrl,
        discussionSourceHash: sourceHash,
        discussionLastSyncedAt: lastSyncedAt,
      }),
    );

    results.push({
      filePath,
      title,
      pageUrl,
      topicId: topic.topic_id,
      topicUrl,
      status: "created",
    });
  }

  return results;
}

export interface TopicTitleValidationIssue {
  title: string;
  reason: string;
}

export function validateDiscourseTopicTitle(
  title: string,
  options: { minLength?: number } = {},
): TopicTitleValidationIssue[] {
  const minLength = options.minLength ?? defaultTitleMinLength;
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  const issues: TopicTitleValidationIssue[] = [];

  if (normalizedTitle.length < minLength) {
    issues.push({
      title,
      reason: `Title is too short for Discourse topic creation; minimum is ${minLength} characters.`,
    });
  }

  const words = normalizedTitle.match(/[\p{L}\p{N}]+/gu) ?? [];
  const repeatedWords = words.filter((word) => {
    const normalizedWord = word.toLocaleLowerCase();
    if (normalizedWord.length < 4) return false;

    return new Set([...normalizedWord]).size <= 2;
  });

  if (words.length > 0 && repeatedWords.length / words.length > 0.5) {
    issues.push({
      title,
      reason: "Title may be rejected by Discourse as unclear because most words repeat the same letters.",
    });
  }

  return issues;
}

function validateManagedPageTitles(input: {
  pages: Array<{
    filePath: string;
    title: string;
    existingTopicId?: string;
  }>;
  mode: SyncMode;
  minLength: number;
}) {
  const issues = input.pages.flatMap((page) => {
    const managesPage =
      (input.mode === "publish-new" && !page.existingTopicId) ||
      (input.mode === "sync-existing" && Boolean(page.existingTopicId)) ||
      input.mode === "publish-and-sync";

    if (!managesPage) return [];

    return validateDiscourseTopicTitle(page.title, { minLength: input.minLength }).map((issue) => ({
      ...issue,
      filePath: page.filePath,
    }));
  });

  if (issues.length === 0) return;

  const details = issues
    .map((issue) => `- ${issue.filePath}: ${issue.reason} Current title: "${issue.title}"`)
    .join("\n");

  throw new Error(`Discourse topic title preflight failed:\n${details}`);
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return findMarkdownFiles(fullPath);
      if (entry.isFile() && markdownExtensions.has(path.extname(entry.name))) return [fullPath];
      return [];
    }),
  );

  return files.flat().sort();
}

function parseMarkdown(source: string): ParsedMarkdown {
  if (!source.startsWith("---\n")) {
    return { frontmatter: {}, body: source, rawFrontmatter: "" };
  }

  const end = source.indexOf("\n---", 4);
  if (end === -1) {
    return { frontmatter: {}, body: source, rawFrontmatter: "" };
  }

  const rawFrontmatter = source.slice(4, end);
  return {
    frontmatter: parseSimpleYaml(rawFrontmatter),
    body: source.slice(end + 4).replace(/^\r?\n/, ""),
    rawFrontmatter,
  };
}

function parseSimpleYaml(source: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of source.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;

    values[match[1]] = unquoteYamlValue(match[2].trim());
  }

  return values;
}

function updateFrontmatter(source: string, values: Record<string, string>): string {
  if (!source.startsWith("---\n")) {
    const frontmatter = serializeYaml(values);
    return `---\n${frontmatter}---\n\n${source}`;
  }

  const end = source.indexOf("\n---", 4);
  if (end === -1) {
    const frontmatter = serializeYaml(values);
    return `---\n${frontmatter}---\n\n${source}`;
  }

  const rawFrontmatter = source.slice(4, end);
  const rest = source.slice(end);
  const nextFrontmatter = upsertYamlValues(rawFrontmatter, values);

  return `---\n${nextFrontmatter}${rest}`;
}

function upsertYamlValues(source: string, values: Record<string, string>): string {
  const lines = source.split(/\r?\n/);
  const remaining = new Map(Object.entries(values));
  const nextLines = lines.map((line) => {
    const match = /^([A-Za-z0-9_-]+):/.exec(line);
    if (!match || !remaining.has(match[1])) return line;

    const value = remaining.get(match[1]);
    remaining.delete(match[1]);
    return `${match[1]}: ${quoteYamlValue(value ?? "")}`;
  });

  for (const [key, value] of remaining) {
    nextLines.push(`${key}: ${quoteYamlValue(value)}`);
  }

  return `${nextLines.join("\n").replace(/\n*$/, "")}\n`;
}

function serializeYaml(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}: ${quoteYamlValue(value)}`)
    .join("\n") + "\n";
}

function quoteYamlValue(value: string): string {
  if (/^[0-9]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function unquoteYamlValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function findFirstHeading(body: string): string | undefined {
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function titleFromFile(filePath: string): string {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pageUrlForFile(input: { docsDir: string; filePath: string; siteUrl: string }): string {
  const relative = path.relative(input.docsDir, input.filePath).replace(/\\/g, "/");
  const withoutExtension = relative.replace(/\.(md|mdx)$/i, "");
  const slug = withoutExtension.endsWith("/index")
    ? withoutExtension.slice(0, -"/index".length)
    : withoutExtension;
  const pathname = slug ? `${slug}/` : "";

  return `${input.siteUrl.replace(/\/+$/, "")}/${pathname}`;
}

function discussionContentForPage(parsed: ParsedMarkdown): string {
  if (parsed.frontmatter.discussionSummary) return parsed.frontmatter.discussionSummary;

  const content = parsed.body.trim();
  if (!content) return "See the linked Astro page for the current source content.";
  return content;
}

function hashDiscussionSource(input: { title: string; pageUrl: string; content: string }): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

function companionTopicBody(input: {
  title: string;
  pageUrl: string;
  content: string;
  lastSyncedAt: string;
}): string {
  return [
    "This is a companion discussion topic for:",
    "",
    `[${input.title}](${input.pageUrl})`,
    "",
    "Source content:",
    input.content,
    "",
    `Last synced from Astro: ${input.lastSyncedAt}`,
    "",
    "Use this thread for comments, corrections, and follow-up questions.",
  ].join("\n");
}
