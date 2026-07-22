import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createDiscourseClient } from "../discourse/client.js";
import {
  parseDiscussionTargetBindings,
  type DiscussionTargetBinding,
  type DiscussionTargetBindings,
} from "../targets.js";

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
  preflightLimits?: DiscoursePreflightLimits;
  notifyOnFailure?: NotifyOnFailureOptions;
}

export interface DiscoursePreflightLimits {
  minTopicTitleLength?: number;
  maxTopicTitleLength?: number;
  maxPostLength?: number;
  maxTagsPerTopic?: number;
  maxTagLength?: number;
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

interface FrontmatterBlock {
  bodyStart: number;
  closingMarkerStart: number;
  lineEnding: "\n" | "\r\n";
  rawEnd: number;
  rawStart: number;
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
      const target = targetContextForPage(parsed.frontmatter, options.targetName, filePath);

      return {
        filePath,
        source,
        parsed,
        title,
        pageUrl,
        content,
        sourceHash,
        syncEnabled: target.syncEnabled,
        syncDisabledReason: target.syncDisabledReason,
        targetMatches: target.matches,
        targetMismatchReason: target.mismatchReason,
        targetName: target.targetName,
        targetNames: target.targetNames,
        targetBindings: target.bindings,
        usesTargetBindings: target.usesTargetBindings,
        existingTopicId: target.binding.topicId ? String(target.binding.topicId) : undefined,
        existingTopicUrl: target.binding.topicUrl,
        previousHash: target.binding.sourceHash,
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
      validateManagedPages({
        pages,
        mode,
        targetName: options.targetName,
        limits: {
          minTopicTitleLength: options.titleMinLength ?? options.preflightLimits?.minTopicTitleLength ?? defaultTitleMinLength,
          maxTopicTitleLength: options.preflightLimits?.maxTopicTitleLength,
          maxPostLength: options.preflightLimits?.maxPostLength,
          maxTagsPerTopic: options.preflightLimits?.maxTagsPerTopic,
          maxTagLength: options.preflightLimits?.maxTagLength,
        },
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
      const resultTargetName = page.targetName ?? input.targetName;

      if (!page.targetMatches) {
        results.push({
          filePath,
          title,
          pageUrl,
          targetName: resultTargetName,
          topicId: existingTopicId ? Number(existingTopicId) : undefined,
          topicUrl: existingTopicUrl,
          status: "skipped",
          reason: page.targetMismatchReason,
        });
        continue;
      }

      if (!page.syncEnabled) {
        results.push({
          filePath,
          title,
          pageUrl,
          targetName: resultTargetName,
          topicId: existingTopicId ? Number(existingTopicId) : undefined,
          topicUrl: existingTopicUrl,
          status: "skipped",
          reason: page.syncDisabledReason ?? "discussionSync is false",
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
        let topic: Awaited<ReturnType<typeof input.discourse.topic>>;
        try {
          topic = await input.discourse.topic(existingTopicId);
        } catch (error) {
          throw new Error(
            `Could not read linked Discourse topic ${existingTopicId} for ${pageUrl}. The topic may have been deleted, moved behind permissions, or the API user may not be allowed to read it. ${errorMessage(error)}`,
          );
        }
        const firstPost = topic.post_stream.posts.find((post) => post.post_number === 1);
        if (sourceChanged && !firstPost) {
          throw new Error(
            `Could not find first post for linked Discourse topic ${existingTopicId} for ${pageUrl}. The topic may need manual repair before DiscussionBridge can sync it.`,
          );
        }
        let updated = false;
        const updateReasons: string[] = [];
        const frontmatterUpdates: Record<string, string> = {};
        let latestTopicUrl = canonicalTopicUrl(input.discourse.discourseUrl, existingTopicId, topic.slug) ?? existingTopicUrl;
        const titleNeedsUpdate = topic.title !== title;
        const categoryNeedsUpdate = page.categoryId !== undefined && topic.category_id !== page.categoryId;
        const tagsNeedUpdate = page.tags !== undefined && !sameTags(page.tags, tagNamesFromTopic(topic.tags));

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

        if (titleNeedsUpdate || categoryNeedsUpdate || tagsNeedUpdate) {
          let updatedTopicTitle: string | undefined;
          let updatedTopicCategoryId: number | undefined;
          let updatedTopicSlug: string | undefined;
          let updatedTopicTags: string[] | undefined;
          try {
            const updatedTopic = await input.discourse.updateTopic({
              topicId: existingTopicId,
              ...(titleNeedsUpdate ? { title } : {}),
              ...(categoryNeedsUpdate ? { categoryId: page.categoryId } : {}),
              ...(tagsNeedUpdate ? { tags: page.tags } : {}),
            });
            updatedTopicTitle = updatedTopic.basic_topic.title;
            updatedTopicCategoryId = updatedTopic.basic_topic.category_id;
            updatedTopicSlug = updatedTopic.basic_topic.slug;
            updatedTopicTags = tagNamesFromTopic(updatedTopic.tags);
          } catch (error) {
            throw new Error(
              `Topic metadata update failed for Discourse topic ${existingTopicId}. The first post may already have been updated. ${errorMessage(error)}`,
            );
          }

          if (titleNeedsUpdate && updatedTopicTitle !== title) {
            throw new Error(
              `Topic title update was accepted by Discourse but did not change topic ${existingTopicId}. Expected "${title}", got "${updatedTopicTitle ?? topic.title}".`,
            );
          }

          if (
            categoryNeedsUpdate &&
            updatedTopicCategoryId !== undefined &&
            updatedTopicCategoryId !== page.categoryId
          ) {
            throw new Error(
              `Topic category update was accepted by Discourse but did not change topic ${existingTopicId}. Expected ${page.categoryId}, got ${updatedTopicCategoryId}.`,
            );
          }

          if (tagsNeedUpdate && updatedTopicTags !== undefined && !sameTags(page.tags ?? [], updatedTopicTags)) {
            throw new Error(
              `Topic tags update was accepted by Discourse but did not change topic ${existingTopicId}. Expected ${formatTags(page.tags ?? [])}, got ${formatTags(updatedTopicTags)}.`,
            );
          }

          updated = true;
          if (titleNeedsUpdate || categoryNeedsUpdate) updateReasons.push("topic metadata updated");
          if (tagsNeedUpdate) updateReasons.push("topic tags updated");
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

        if (latestTopicUrl && existingTopicUrl !== latestTopicUrl && !page.usesTargetBindings) {
          frontmatterUpdates.discourseTopicUrl = latestTopicUrl;
          updated = true;
          updateReasons.push("topic URL refreshed");
        }

        if (sourceChanged && !page.usesTargetBindings) {
          frontmatterUpdates.discussionSourceHash = sourceHash;
          frontmatterUpdates.discussionLastSyncedAt = new Date().toISOString();
        }

        if (page.usesTargetBindings && resultTargetName) {
          const bindingUpdates = targetBindingFrontmatterUpdates(page, resultTargetName, {
            topicId: Number(existingTopicId),
            topicUrl: latestTopicUrl,
            sourceHash: sourceChanged ? sourceHash : previousHash,
            lastSyncedAt: sourceChanged ? new Date().toISOString() : page.targetBindings[resultTargetName]?.lastSyncedAt,
            status: "synced",
          });
          Object.assign(frontmatterUpdates, bindingUpdates);
          if (Object.keys(bindingUpdates).length > 0 && !updated) {
            updated = true;
            updateReasons.push("target binding state refreshed");
          }
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
      let topic: Awaited<ReturnType<typeof input.discourse.createTopic>>;
      let reconciledEmbed = false;
      try {
        topic = await input.discourse.createTopic({
          title,
          raw: companionTopicBody({ title, pageUrl, content, lastSyncedAt }),
          category: page.categoryId,
          tags: page.tags,
          embedUrl: pageUrl,
        });
      } catch (error) {
        if (!isRecoverableExistingTopicCreateError(error)) throw error;

        const embedInfo = await findExistingTopicForEmbedUrl(input.discourse, pageUrl);
        if (!embedInfo.topicId) {
          const details = embedInfo.reason ? ` ${embedInfo.reason}` : "";
          throw new Error(
            `Discourse rejected topic creation as an existing-topic collision, but DiscussionBridge could not identify the owning topic for ${pageUrl}.${details} ${errorMessage(error)}`,
          );
        }

        const existingTopic = await input.discourse.topic(embedInfo.topicId);
        const firstPost = existingTopic.post_stream.posts.find((post) => post.post_number === 1);
        if (!firstPost) {
          throw new Error(`Could not find first post for Discourse topic ${embedInfo.topicId}.`);
        }

        await input.discourse.updatePost({
          postId: firstPost.id,
          raw: companionTopicBody({ title, pageUrl, content, lastSyncedAt }),
          editReason: "Reconcile DiscussionBridge companion summary from existing Discourse embed topic",
          bypassBump: true,
        });

        const titleNeedsUpdate = existingTopic.title !== title;
        const categoryNeedsUpdate = page.categoryId !== undefined && existingTopic.category_id !== page.categoryId;
        const tagsNeedUpdate = page.tags !== undefined && !sameTags(page.tags, tagNamesFromTopic(existingTopic.tags));
        if (titleNeedsUpdate || categoryNeedsUpdate || tagsNeedUpdate) {
          await input.discourse.updateTopic({
            topicId: embedInfo.topicId,
            ...(titleNeedsUpdate ? { title } : {}),
            ...(categoryNeedsUpdate ? { categoryId: page.categoryId } : {}),
            ...(tagsNeedUpdate ? { tags: page.tags } : {}),
          });
        }

        topic = {
          id: firstPost.id,
          name: firstPost.name,
          username: firstPost.username,
          avatar_template: firstPost.avatar_template,
          created_at: firstPost.created_at,
          cooked: firstPost.cooked,
          post_number: firstPost.post_number,
          post_type: firstPost.post_type,
          updated_at: firstPost.updated_at,
          reply_count: firstPost.reply_count,
          reply_to_post_number: firstPost.reply_to_post_number,
          quote_count: firstPost.quote_count,
          incoming_link_count: firstPost.incoming_link_count,
          reads: firstPost.reads,
          readers_count: firstPost.readers_count,
          score: firstPost.score,
          topic_id: embedInfo.topicId,
          topic_slug: embedInfo.topicSlug ?? existingTopic.slug ?? "",
        };
        reconciledEmbed = true;
      }
      const topicUrl = canonicalTopicUrl(input.discourse.discourseUrl, topic.topic_id, topic.topic_slug)
        ?? `${input.discourse.discourseUrl}/t/${topic.topic_id}`;

      if (page.visible === false) {
        await input.discourse.updateTopicStatus({
          topicId: topic.topic_id,
          status: "visible",
          enabled: false,
        });
      }

      const createdBindingValues = page.usesTargetBindings && resultTargetName
        ? targetBindingFrontmatterUpdates(page, resultTargetName, {
            topicId: topic.topic_id,
            topicUrl,
            sourceHash,
            lastSyncedAt,
            status: "synced",
          })
        : {
            ...(input.targetName ? { discussionTarget: input.targetName } : {}),
            discourseTopicId: String(topic.topic_id),
            discourseTopicUrl: topicUrl,
            discussionSourceHash: sourceHash,
            discussionLastSyncedAt: lastSyncedAt,
          };

      await fs.writeFile(filePath, updateFrontmatter(source, createdBindingValues));

      results.push({
        filePath,
        title,
        pageUrl,
        targetName: resultTargetName,
        topicId: topic.topic_id,
        topicUrl,
        status: reconciledEmbed ? "updated" : "created",
        reason: reconciledEmbed ? "reconciled existing embedded topic" : undefined,
      });
    } catch (error) {
      await persistTargetFailure(page, error);
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
  syncEnabled: boolean;
  syncDisabledReason?: string;
  targetMatches: boolean;
  targetMismatchReason?: string;
  targetName?: string;
  targetNames: string[];
  targetBindings: DiscussionTargetBindings;
  usesTargetBindings: boolean;
  existingTopicId?: string;
  existingTopicUrl?: string;
  previousHash?: string;
  categoryId?: number;
  tags?: string[];
  visible?: boolean;
  notifyOnFailure?: NotifyOnFailureOptions;
}

function targetContextForPage(
  frontmatter: Record<string, string>,
  activeTargetName: string | undefined,
  filePath: string,
): {
  binding: DiscussionTargetBinding;
  bindings: DiscussionTargetBindings;
  matches: boolean;
  mismatchReason?: string;
  syncEnabled: boolean;
  syncDisabledReason?: string;
  targetName?: string;
  targetNames: string[];
  usesTargetBindings: boolean;
} {
  const legacyTargetName = frontmatter.discussionTarget?.trim() || undefined;
  const configuredTargetNames = csvFromFrontmatter(frontmatter.discussionTargets);
  const targetNames = configuredTargetNames ?? (legacyTargetName ? [legacyTargetName] : []);
  const targetName = activeTargetName ?? legacyTargetName ?? targetNames[0];
  const usesTargetBindings = Boolean(
    frontmatter.discussionTargets || frontmatter.discussionTargetBindings,
  );
  const bindings = parseDiscussionTargetBindings(
    frontmatter.discussionTargetBindings,
    `discussionTargetBindings in ${filePath}`,
  );
  const sourceMode = frontmatter.discussionSourceMode?.trim().toLowerCase();
  const sourceTargetName = frontmatter.discussionSourceTarget?.trim()
    || (["discourse-imported", "discourse-managed"].includes(sourceMode ?? "")
      ? legacyTargetName
      : undefined);
  const publishTargetNames = csvFromFrontmatter(frontmatter.discussionPublishTargets) ?? [];

  let matches = true;
  let mismatchReason: string | undefined;
  if (targetNames.length > 0 && !activeTargetName) {
    matches = false;
    mismatchReason = targetNames.length === 1
      ? `page is assigned to discussion target "${targetNames[0]}"; rerun with --target ${targetNames[0]}`
      : `page is assigned to multiple discussion targets (${targetNames.join(", ")}); rerun once per target with --target NAME`;
  } else if (activeTargetName && targetNames.length > 0 && !targetNames.includes(activeTargetName)) {
    matches = false;
    mismatchReason = `page is assigned to discussion targets (${targetNames.join(", ")}), not active target "${activeTargetName}"`;
  }

  const legacyBinding: DiscussionTargetBinding = {
    topicId: numberFromFrontmatter(frontmatter.discourseTopicId),
    topicUrl: frontmatter.discourseTopicUrl,
    sourceHash: frontmatter.discussionSourceHash,
    lastSyncedAt: frontmatter.discussionLastSyncedAt,
  };
  const binding = targetName && bindings[targetName]
    ? bindings[targetName]
    : (!usesTargetBindings || (sourceTargetName && targetName === sourceTargetName))
      ? legacyBinding
      : {};

  const sourceIsProtected = Boolean(
    targetName &&
    sourceTargetName === targetName &&
    ["discourse-imported", "discourse-managed"].includes(sourceMode ?? ""),
  );
  const explicitlyPublishable = Boolean(targetName && publishTargetNames.includes(targetName));
  const syncConfigured = booleanFromFrontmatter(frontmatter.discussionSync) !== false;
  let syncEnabled = syncConfigured;
  let syncDisabledReason: string | undefined;

  if (sourceIsProtected) {
    syncEnabled = false;
    syncDisabledReason = `discussion source target "${targetName}" is protected by ${sourceMode} no-writeback policy`;
  } else if (publishTargetNames.length > 0) {
    syncEnabled = explicitlyPublishable;
    if (!syncEnabled) {
      syncDisabledReason = targetName
        ? `discussion target "${targetName}" is not listed in discussionPublishTargets`
        : "page requires an explicit --target from discussionPublishTargets";
    }
  } else if (!syncConfigured) {
    syncDisabledReason = "discussionSync is false";
  }

  return {
    binding,
    bindings,
    matches,
    mismatchReason,
    syncEnabled,
    syncDisabledReason,
    targetName,
    targetNames,
    usesTargetBindings,
  };
}

function targetBindingFrontmatterUpdates(
  page: Pick<ParsedPage, "parsed" | "targetBindings">,
  targetName: string,
  values: DiscussionTargetBinding,
): Record<string, string> {
  const nextBinding = Object.fromEntries(
    Object.entries({
      ...page.targetBindings[targetName],
      ...values,
      lastError: values.status === "synced" ? undefined : values.lastError,
      lastAttemptedAt: values.status === "synced" ? undefined : values.lastAttemptedAt,
    }).filter(([, value]) => value !== undefined),
  ) as DiscussionTargetBinding;
  const serialized = JSON.stringify({
    ...page.targetBindings,
    [targetName]: nextBinding,
  });

  if (page.parsed.frontmatter.discussionTargetBindings === serialized) return {};
  return { discussionTargetBindings: serialized };
}

async function persistTargetFailure(page: ParsedPage, error: unknown): Promise<void> {
  if (!page.targetMatches || !page.syncEnabled || !page.usesTargetBindings || !page.targetName) return;

  const updates = targetBindingFrontmatterUpdates(page, page.targetName, {
    status: "failed",
    lastError: errorMessage(error).replace(/\s+/g, " ").slice(0, 500),
    lastAttemptedAt: new Date().toISOString(),
  });
  if (Object.keys(updates).length === 0) return;

  try {
    await fs.writeFile(page.filePath, updateFrontmatter(page.source, updates));
  } catch {
    // Preserve the original Discourse failure when local failure-state recording also fails.
  }
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

function isRecoverableExistingTopicCreateError(error: unknown): boolean {
  const message = errorMessage(error);
  return /Embed url has already been taken/i.test(message) || /Title has already been used/i.test(message);
}

async function findExistingTopicForEmbedUrl(
  discourse: ReturnType<typeof createDiscourseClient>,
  pageUrl: string,
): Promise<{ topicId?: number; topicSlug?: string; reason?: string }> {
  try {
    const embedInfo = await discourse.embedInfo(pageUrl);
    if (embedInfo.topic_id) {
      return {
        topicId: embedInfo.topic_id,
        topicSlug: embedInfo.topic_slug,
      };
    }
  } catch {
    // Some Discourse instances return 404 for /embed/info even when topic creation reports the embed URL is taken.
  }

  try {
    const search = await discourse.search(pageUrl);
    const topicIds = new Set<number>();
    const topicSlugById = new Map<number, string | undefined>();

    for (const topic of search.topics ?? []) {
      topicIds.add(topic.id);
      topicSlugById.set(topic.id, topic.slug);
    }

    for (const post of search.posts ?? []) {
      topicIds.add(post.topic_id);
    }

    if (topicIds.size === 1) {
      const [topicId] = topicIds;
      return {
        topicId,
        topicSlug: topicSlugById.get(topicId),
        reason: "/embed/info was unavailable; matched by exact URL search.",
      };
    }

    if (topicIds.size > 1) {
      return { reason: `Exact URL search returned multiple candidate topics: ${[...topicIds].join(", ")}.` };
    }
  } catch (error) {
    return { reason: `Exact URL search also failed: ${errorMessage(error)}.` };
  }

  return { reason: "/embed/info was unavailable and exact URL search found no candidate topics." };
}

export interface TopicTitleValidationIssue {
  title: string;
  reason: string;
}

export function validateDiscourseTopicTitle(
  title: string,
  options: { minLength?: number; maxLength?: number } = {},
): TopicTitleValidationIssue[] {
  const minLength = options.minLength ?? defaultTitleMinLength;
  const maxLength = options.maxLength;
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  const issues: TopicTitleValidationIssue[] = [];

  if (normalizedTitle.length < minLength) {
    issues.push({
      title,
      reason: `Title is too short for Discourse topic creation; minimum is ${minLength} characters. Use a longer frontmatter title or first heading, or lower the limit with --title-min-length only if the target forum allows shorter titles.`,
    });
  }

  if (maxLength !== undefined && normalizedTitle.length > maxLength) {
    issues.push({
      title,
      reason: `Title is too long for Discourse topic creation; maximum is ${maxLength} characters. Shorten the frontmatter title or first heading, or raise --max-topic-title-length only if the target forum allows longer titles.`,
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
      reason: "Title may be rejected by Discourse as unclear because most words repeat the same letters. Replace placeholder/filler text with a descriptive page title, or use --skip-title-validation for a deliberate test case.",
    });
  }

  return issues;
}

function validateManagedPages(input: {
  pages: Array<{
    filePath: string;
    title: string;
    pageUrl: string;
    content: string;
    syncEnabled?: boolean;
    targetMatches?: boolean;
    tags?: string[];
    targetName?: string;
    existingTopicId?: string;
  }>;
  mode: SyncMode;
  targetName?: string;
  limits: Required<Pick<DiscoursePreflightLimits, "minTopicTitleLength">> & DiscoursePreflightLimits;
}) {
  const issues = input.pages.flatMap((page) => {
    if (page.syncEnabled === false) return [];
    if (page.targetMatches === false) return [];

    const managesPage =
      (input.mode === "publish-new" && !page.existingTopicId) ||
      (input.mode === "sync-existing" && Boolean(page.existingTopicId)) ||
      input.mode === "publish-and-sync";

    if (!managesPage) return [];

    const titleIssues = validateDiscourseTopicTitle(page.title, {
      minLength: input.limits.minTopicTitleLength,
      maxLength: input.limits.maxTopicTitleLength,
    }).map((issue) => ({
      ...issue,
      filePath: page.filePath,
    }));

    const pageIssues: Array<{ filePath: string; reason: string }> = [...titleIssues];

    if (input.limits.maxPostLength !== undefined && page.content.length > input.limits.maxPostLength) {
      pageIssues.push({
        filePath: page.filePath,
        reason: `Companion post body is too long for Discourse; maximum is ${input.limits.maxPostLength} characters. Current body is ${page.content.length} characters. Add a shorter discussionSummary, trim discussion-safe content, or raise --max-post-length only if the target forum allows it.`,
      });
    }

    if (input.limits.maxTagsPerTopic !== undefined && page.tags && normalizeTags(page.tags).length > input.limits.maxTagsPerTopic) {
      pageIssues.push({
        filePath: page.filePath,
        reason: `Too many tags for Discourse topic; maximum is ${input.limits.maxTagsPerTopic}. Current tags: ${formatTags(page.tags)}. Remove tags from discussionTags, lane config, or --tags; keep Astro/template tags separate unless explicitly mapped.`,
      });
    }

    if (input.limits.maxTagLength !== undefined && page.tags) {
      for (const tag of normalizeTags(page.tags)) {
        if (tag.length > input.limits.maxTagLength) {
          pageIssues.push({
            filePath: page.filePath,
            reason: `Tag "${tag}" is too long for Discourse; maximum is ${input.limits.maxTagLength} characters. Rename the Discourse tag or raise --max-tag-length only if the target forum allows it.`,
          });
        }
      }
    }

    return pageIssues;
  });
  issues.push(...duplicateManagedPageIssues(input));

  if (issues.length === 0) return;

  const details = issues
    .map((issue) => {
      const title = "title" in issue ? ` Current title: "${issue.title}"` : "";
      return `- ${issue.filePath}: ${issue.reason}${title}`;
    })
    .join("\n");

  throw new Error(
    [
      "Discourse preflight failed before any Discourse writes were attempted.",
      "",
      details,
      "",
      "Fix the listed Astro frontmatter/content or adjust the explicit CLI/env limits after confirming the target Discourse settings.",
      "Tip: run check-discourse for the target forum, then rerun this command with --dry-run --details.",
    ].join("\n"),
  );
}

function duplicateManagedPageIssues(input: {
  pages: Array<{
    filePath: string;
    pageUrl: string;
    syncEnabled?: boolean;
    targetMatches?: boolean;
    targetName?: string;
    existingTopicId?: string;
  }>;
  mode: SyncMode;
  targetName?: string;
}): Array<{ filePath: string; reason: string }> {
  const managedPages = input.pages.filter((page) => {
    if (page.syncEnabled === false) return false;
    if (page.targetMatches === false) return false;

    return (
      (input.mode === "publish-new" && !page.existingTopicId) ||
      (input.mode === "sync-existing" && Boolean(page.existingTopicId)) ||
      input.mode === "publish-and-sync"
    );
  });

  return [
    ...duplicateValueIssues({
      pages: managedPages,
      valueForPage: (page) => (page.existingTopicId ? `topic:${Number(page.existingTopicId)}` : undefined),
      label: "Discourse topic ID",
    }),
    ...duplicateValueIssues({
      pages: managedPages,
      valueForPage: (page) => `page URL:${page.pageUrl}`,
      label: "page URL",
    }),
  ];
}

function duplicateValueIssues<TPage extends { filePath: string }>(input: {
  pages: TPage[];
  valueForPage: (page: TPage) => string | undefined;
  label: string;
}): Array<{ filePath: string; reason: string }> {
  const pagesByValue = new Map<string, string[]>();
  for (const page of input.pages) {
    const value = input.valueForPage(page);
    if (!value) continue;

    const files = pagesByValue.get(value) ?? [];
    files.push(page.filePath);
    pagesByValue.set(value, files);
  }

  const issues: Array<{ filePath: string; reason: string }> = [];
  for (const [rawValue, files] of pagesByValue) {
    if (files.length < 2) continue;

    const value = rawValue.replace(/^[^:]+:/, "");
    issues.push({
      filePath: files[0],
      reason: `Multiple managed pages in this run use the same ${input.label} (${value}). Run separate lanes, remove duplicate frontmatter, or make only one page manage that Discourse companion. Files: ${files.join(", ")}.`,
    });
  }

  return issues;
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
  const block = findFrontmatterBlock(source);
  if (!block) {
    return { frontmatter: {}, body: source, rawFrontmatter: "" };
  }

  const rawFrontmatter = source.slice(block.rawStart, block.rawEnd);
  return {
    frontmatter: parseSimpleYaml(rawFrontmatter),
    body: source.slice(block.bodyStart).replace(/^\r?\n/, ""),
    rawFrontmatter,
  };
}

function findFrontmatterBlock(source: string): FrontmatterBlock | undefined {
  const opening = /^---(\r?\n)/.exec(source);
  if (!opening) return undefined;

  const lineEnding = opening[1] as "\n" | "\r\n";
  const rawStart = opening[0].length;
  const closing = /\r?\n---(?=\r?\n|$)/g;
  closing.lastIndex = rawStart;
  const match = closing.exec(source);
  if (!match) return undefined;

  const closingMarkerStart = match.index + match[0].length - 3;
  return {
    bodyStart: closingMarkerStart + 3,
    closingMarkerStart,
    lineEnding,
    rawEnd: match.index,
    rawStart,
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
  const block = findFrontmatterBlock(source);
  if (!block) {
    const frontmatter = serializeYaml(values);
    return `---\n${frontmatter}---\n\n${source}`;
  }

  const rawFrontmatter = source.slice(block.rawStart, block.rawEnd);
  const nextFrontmatter = upsertYamlValues(rawFrontmatter, values).replace(
    /\n/g,
    block.lineEnding,
  );

  return `${source.slice(0, block.rawStart)}${nextFrontmatter}${source.slice(block.closingMarkerStart)}`;
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
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === "string") return parsed;
    } catch {
      return value.slice(1, -1);
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
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
    `Last synced from Astro: ${formatReaderDate(input.lastSyncedAt)}`,
  ].join("\n");
}

function formatReaderDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

function canonicalTopicUrl(discourseUrl: string, topicId: number | string, slug?: string): string | undefined {
  if (!slug) return undefined;
  return `${discourseUrl}/t/${slug}/${topicId}`;
}

function tagNamesFromTopic(tags: Array<{ name?: string; slug?: string } | string> | undefined): string[] {
  return tags?.map((tag) => typeof tag === "string" ? tag : tag.name ?? tag.slug).filter((tag): tag is string => Boolean(tag)) ?? [];
}

function sameTags(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeTags(left);
  const normalizedRight = normalizeTags(right);
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((tag, index) => tag === normalizedRight[index]);
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
}

function formatTags(tags: string[]): string {
  return `[${normalizeTags(tags).join(", ")}]`;
}
