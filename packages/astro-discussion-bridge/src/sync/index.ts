import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createDiscourseClient } from "../discourse/client.js";

export type SyncMode = "publish-new" | "sync-existing" | "publish-and-sync";

export interface SyncDiscourseTopicsOptions {
  docsDir: string;
  siteUrl: string;
  routeBase?: string;
  targetName?: string;
  discourseUrl: string;
  apiKey: string;
  apiUsername: string;
  categoryId?: number;
  tags?: string[];
  dryRun?: boolean;
  mode?: SyncMode;
  forceSync?: boolean;
  unlistSyncedTopics?: boolean;
  validateTitles?: boolean;
  titleMinLength?: number;
  notifyOnFailure?: NotifyOnFailureOptions;
}

export interface NotifyOnFailureOptions {
  enabled?: boolean;
  recipients?: string[];
  title?: string;
}

export interface SyncedPage {
  filePath: string;
  title: string;
  pageUrl: string;
  targetName?: string;
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
const notifiedErrors = new WeakSet<object>();

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
      const pageUrl = pageUrlForFile({
        docsDir,
        filePath,
        siteUrl: options.siteUrl,
        routeBase: options.routeBase,
      });
      const content = discussionContentForPage(parsed);
      const sourceHash = hashDiscussionSource({ title, pageUrl, content });
      const pageOptions = discussionOptionsForPage(parsed.frontmatter, options);

      return {
        filePath,
        source,
        parsed,
        title,
        pageUrl,
        content,
        sourceHash,
        targetName: parsed.frontmatter.discussionTarget,
        existingTopicId: parsed.frontmatter.discourseTopicId,
        existingTopicUrl: parsed.frontmatter.discourseTopicUrl,
        previousHash: parsed.frontmatter.discussionSourceHash,
        categoryId: pageOptions.categoryId,
        tags: pageOptions.tags,
        visible: pageOptions.visible,
        notifyOnFailure: pageOptions.notifyOnFailure,
      };
    }),
  );

  const discourse = createDiscourseClient({
    discourseUrl: options.discourseUrl,
    apiKey: options.apiKey,
    apiUsername: options.apiUsername,
  });
  try {
    if (options.validateTitles !== false) {
      validateManagedPageTitles({
        pages,
        mode,
        targetName: options.targetName,
        minLength: options.titleMinLength ?? defaultTitleMinLength,
      });
    }

    return await syncParsedDiscourseTopics({
      ...options,
      docsDir,
      mode,
      pages,
      discourse,
    });
  } catch (error) {
    await notifySyncFailure({
      discourse,
      options: {
        ...options,
        docsDir,
        mode,
      },
      error,
    });
    throw error;
  }
}

async function syncParsedDiscourseTopics(input: SyncDiscourseTopicsOptions & {
  docsDir: string;
  mode: SyncMode;
  pages: ParsedPage[];
  discourse: ReturnType<typeof createDiscourseClient>;
}): Promise<SyncedPage[]> {
  const results: SyncedPage[] = [];

  for (const page of input.pages) {
    try {
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
      const targetStatus = discussionTargetStatus(page.targetName, input.targetName);
      const resultTargetName = page.targetName ?? input.targetName;

      if (!targetStatus.matches) {
        results.push({
          filePath,
          title,
          pageUrl,
          targetName: resultTargetName,
          topicId: existingTopicId ? Number(existingTopicId) : undefined,
          topicUrl: existingTopicUrl,
          status: "skipped",
          reason: targetStatus.reason,
        });
        continue;
      }

      if (existingTopicId) {
        if (input.mode === "publish-new") {
          results.push({
            filePath,
            title,
            pageUrl,
            targetName: resultTargetName,
            topicId: Number(existingTopicId),
            topicUrl: existingTopicUrl,
            status: "skipped",
            reason: "already linked",
          });
          continue;
        }

        if (input.dryRun) {
          const wouldUpdate = input.forceSync || previousHash !== sourceHash;
          results.push({
            filePath,
            title,
            pageUrl,
            targetName: resultTargetName,
            topicId: Number(existingTopicId),
            topicUrl: existingTopicUrl,
            status: wouldUpdate ? "dry-run-update" : "unchanged",
            reason: wouldUpdate
              ? (input.forceSync && previousHash === sourceHash ? "force sync requested" : "source hash changed")
              : "source hash unchanged",
          });
          continue;
        }

        const sourceChanged = input.forceSync || previousHash !== sourceHash;
        const topic = await input.discourse.topic(existingTopicId);
        const firstPost = topic.post_stream.posts.find((post) => post.post_number === 1);
        if (sourceChanged && !firstPost) {
          throw new Error(`Could not find first post for Discourse topic ${existingTopicId}.`);
        }
        let updated = false;
        const updateReasons: string[] = [];
        const frontmatterUpdates: Record<string, string> = {};
        let latestTopicUrl = canonicalTopicUrl(input.discourse.discourseUrl, existingTopicId, topic.slug) ?? existingTopicUrl;

        if (sourceChanged && firstPost) {
          await input.discourse.updatePost({
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
          updateReasons.push(
            input.forceSync && previousHash === sourceHash ? "first post rewritten by force sync" : "first post rewritten",
          );
        }

        if (topic.title !== title || (page.categoryId !== undefined && topic.category_id !== page.categoryId)) {
          let updatedTopicTitle: string | undefined;
          let updatedTopicCategoryId: number | undefined;
          let updatedTopicSlug: string | undefined;
          try {
            const updatedTopic = await input.discourse.updateTopic({
              topicId: existingTopicId,
              title,
              categoryId: page.categoryId,
            });
            updatedTopicTitle = updatedTopic.basic_topic.title;
            updatedTopicCategoryId = updatedTopic.basic_topic.category_id;
            updatedTopicSlug = updatedTopic.basic_topic.slug;
          } catch (error) {
            throw new Error(
              `Topic metadata update failed for Discourse topic ${existingTopicId}. The first post may already have been updated. ${errorMessage(error)}`,
            );
          }

          if (topic.title !== title && updatedTopicTitle !== title) {
            throw new Error(
              `Topic title update was accepted by Discourse but did not change topic ${existingTopicId}. Expected "${title}", got "${updatedTopicTitle ?? topic.title}".`,
            );
          }

          if (
            page.categoryId !== undefined &&
            updatedTopicCategoryId !== undefined &&
            updatedTopicCategoryId !== page.categoryId
          ) {
            throw new Error(
              `Topic category update was accepted by Discourse but did not change topic ${existingTopicId}. Expected ${page.categoryId}, got ${updatedTopicCategoryId}.`,
            );
          }

          updated = true;
          updateReasons.push("topic metadata updated");
          latestTopicUrl = canonicalTopicUrl(input.discourse.discourseUrl, existingTopicId, updatedTopicSlug) ?? latestTopicUrl;
        }

        if (page.visible !== undefined && topic.visible !== page.visible) {
          await input.discourse.updateTopicStatus({
            topicId: existingTopicId,
            status: "visible",
            enabled: page.visible,
          });
          updated = true;
          updateReasons.push(page.visible ? "topic listed" : "topic unlisted");
        }

        if (latestTopicUrl && existingTopicUrl !== latestTopicUrl) {
          frontmatterUpdates.discourseTopicUrl = latestTopicUrl;
          updated = true;
          updateReasons.push("topic URL refreshed");
        }

        if (sourceChanged) {
          frontmatterUpdates.discussionSourceHash = sourceHash;
          frontmatterUpdates.discussionLastSyncedAt = new Date().toISOString();
        }

        if (Object.keys(frontmatterUpdates).length) {
          await fs.writeFile(filePath, updateFrontmatter(source, frontmatterUpdates));
        }

        results.push({
          filePath,
          title,
          pageUrl,
          targetName: resultTargetName,
          topicId: Number(existingTopicId),
          topicUrl: latestTopicUrl,
          status: updated ? "updated" : "unchanged",
          reason: updated ? updateReasons.join("; ") : "source hash and topic metadata unchanged",
        });
        continue;
      }

      if (input.mode === "sync-existing") {
        results.push({
          filePath,
          title,
          pageUrl,
          targetName: resultTargetName,
          status: "skipped",
          reason: "not linked",
        });
        continue;
      }

      if (input.dryRun) {
        results.push({ filePath, title, pageUrl, targetName: resultTargetName, status: "dry-run-create" });
        continue;
      }

      const lastSyncedAt = new Date().toISOString();
      const topic = await input.discourse.createTopic({
        title,
        raw: companionTopicBody({ title, pageUrl, content, lastSyncedAt }),
        category: page.categoryId,
        tags: page.tags,
        embedUrl: pageUrl,
      });
      const topicUrl = `${input.discourse.discourseUrl}/t/${topic.topic_slug}/${topic.topic_id}`;

      if (page.visible === false) {
        await input.discourse.updateTopicStatus({
          topicId: topic.topic_id,
          status: "visible",
          enabled: false,
        });
      }

      await fs.writeFile(
        filePath,
        updateFrontmatter(source, {
          ...(input.targetName ? { discussionTarget: input.targetName } : {}),
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
        targetName: resultTargetName,
        topicId: topic.topic_id,
        topicUrl,
        status: "created",
      });
    } catch (error) {
      await notifySyncFailure({
        discourse: input.discourse,
        options: {
          ...input,
          notifyOnFailure: page.notifyOnFailure,
        },
        page,
        error,
      });
      throw error;
    }
  }

  return results;
}

interface ParsedPage {
  filePath: string;
  source: string;
  parsed: ParsedMarkdown;
  title: string;
  pageUrl: string;
  content: string;
  sourceHash: string;
  targetName?: string;
  existingTopicId?: string;
  existingTopicUrl?: string;
  previousHash?: string;
  categoryId?: number;
  tags?: string[];
  visible?: boolean;
  notifyOnFailure?: NotifyOnFailureOptions;
}

async function notifySyncFailure(input: {
  discourse: ReturnType<typeof createDiscourseClient>;
  options: SyncDiscourseTopicsOptions & { docsDir: string; mode: SyncMode };
  page?: Pick<ParsedPage, "filePath" | "pageUrl" | "title">;
  error: unknown;
}) {
  const notification = input.options.notifyOnFailure;
  if (!notification?.enabled || !notification.recipients?.length) return;
  if (typeof input.error === "object" && input.error !== null) {
    if (notifiedErrors.has(input.error)) return;
    notifiedErrors.add(input.error);
  }

  try {
    await input.discourse.createPrivateMessage({
      recipients: notification.recipients,
      title: notification.title ?? "Discussion Bridge publish failed",
      raw: syncFailureNotificationBody({
        docsDir: input.options.docsDir,
        mode: input.options.mode,
        siteUrl: input.options.siteUrl,
        discourseUrl: input.options.discourseUrl,
        page: input.page,
        error: input.error,
      }),
    });
  } catch {
    // Notification is best-effort; preserve the original sync failure.
  }
}

function syncFailureNotificationBody(input: {
  docsDir: string;
  mode: SyncMode;
  siteUrl: string;
  discourseUrl: string;
  page?: Pick<ParsedPage, "filePath" | "pageUrl" | "title">;
  error: unknown;
}): string {
  return [
    "Discussion Bridge could not complete a publish/sync run.",
    "",
    `Mode: ${input.mode}`,
    `Docs directory: ${input.docsDir}`,
    `Site URL: ${input.siteUrl}`,
    `Discourse URL: ${input.discourseUrl}`,
    ...(input.page
      ? [
          "",
          "Page:",
          `- File: ${input.page.filePath}`,
          `- Title: ${input.page.title}`,
          `- URL: ${input.page.pageUrl}`,
        ]
      : []),
    "",
    "Error:",
    "```",
    errorMessage(input.error),
    "```",
    "",
    "The CLI or build output remains the source of truth for the failed run.",
  ].join("\n");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
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
    targetName?: string;
    existingTopicId?: string;
  }>;
  mode: SyncMode;
  targetName?: string;
  minLength: number;
}) {
  const issues = input.pages.flatMap((page) => {
    if (!discussionTargetStatus(page.targetName, input.targetName).matches) return [];

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

function discussionTargetStatus(
  pageTargetName: string | undefined,
  activeTargetName: string | undefined,
): { matches: true } | { matches: false; reason: string } {
  if (!pageTargetName) return { matches: true };
  if (!activeTargetName) {
    return {
      matches: false,
      reason: `page is assigned to discussion target "${pageTargetName}"; rerun with --target ${pageTargetName}`,
    };
  }
  if (pageTargetName === activeTargetName) return { matches: true };

  return {
    matches: false,
    reason: `page is assigned to discussion target "${pageTargetName}", not active target "${activeTargetName}"`,
  };
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

function discussionContentForPage(parsed: ParsedMarkdown): string {
  if (parsed.frontmatter.discussionSummary) return parsed.frontmatter.discussionSummary;

  const content = parsed.body.trim();
  if (!content) return "See the linked Astro page for the current source content.";
  return content;
}

function discussionOptionsForPage(
  frontmatter: Record<string, string>,
  defaults: SyncDiscourseTopicsOptions,
): {
  categoryId?: number;
  tags?: string[];
  visible?: boolean;
  notifyOnFailure?: NotifyOnFailureOptions;
} {
  return {
    categoryId: numberFromFrontmatter(frontmatter.discussionCategoryId) ?? defaults.categoryId,
    tags: csvFromFrontmatter(frontmatter.discussionTags) ?? defaults.tags,
    visible: visibleFromFrontmatter(frontmatter, defaults),
    notifyOnFailure: notifyOnFailureForPage(frontmatter, defaults.notifyOnFailure),
  };
}

function visibleFromFrontmatter(
  frontmatter: Record<string, string>,
  defaults: SyncDiscourseTopicsOptions,
): boolean | undefined {
  const listed = booleanFromFrontmatter(frontmatter.discussionListed);
  if (listed !== undefined) return listed;

  const unlisted = booleanFromFrontmatter(frontmatter.discussionUnlisted);
  if (unlisted !== undefined) return !unlisted;

  if (defaults.unlistSyncedTopics) return false;
  return undefined;
}

function notifyOnFailureForPage(
  frontmatter: Record<string, string>,
  defaults: NotifyOnFailureOptions | undefined,
): NotifyOnFailureOptions | undefined {
  const recipients = csvFromFrontmatter(frontmatter.discussionNotifyRecipients);
  if (!recipients) return defaults;

  return {
    ...defaults,
    enabled: true,
    recipients,
  };
}

function numberFromFrontmatter(value: string | undefined): number | undefined {
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function csvFromFrontmatter(value: string | undefined): string[] | undefined {
  if (!value) return undefined;

  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  return values.length ? values : undefined;
}

function booleanFromFrontmatter(value: string | undefined): boolean | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1", "on"].includes(normalized)) return true;
  if (["false", "no", "0", "off"].includes(normalized)) return false;
  return undefined;
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
    input.content,
    "",
    "---",
    "",
    `[Read the source article](${input.pageUrl})`,
    "",
    "Use this thread for comments, corrections, and follow-up questions.",
    "",
    `Last synced from Astro: ${input.lastSyncedAt}`,
  ].join("\n");
}

function canonicalTopicUrl(discourseUrl: string, topicId: number | string, slug?: string): string | undefined {
  if (!slug) return undefined;
  return `${discourseUrl}/t/${slug}/${topicId}`;
}
