#!/usr/bin/env node
import path from "node:path";
import { checkDiscourse } from "./check-discourse.js";
import { importExistingDiscourseTopics } from "./import-existing.js";
import { syncDiscourseTopics, type DiscoursePreflightLimits, type SyncMode } from "./sync/index.js";

const command = process.argv[2] ?? "help";
const validCommands = new Set(["sync", "publish-new", "sync-existing", "publish-and-sync", "import-existing", "check-discourse"]);

if (!validCommands.has(command)) {
  printUsage(command === "help" ? undefined : `Unknown command: ${command}`);
  process.exit(command === "help" ? 0 : 1);
}

const args = parseArgs(process.argv.slice(3));
const docsDir = path.resolve(args.positionals[0] ?? "src/content/docs");
const dryRun = args.flags.has("dry-run");
const forceSync = args.flags.has("force");
const unlistSyncedTopics = args.flags.has("unlist");
const validateTitles = !args.flags.has("skip-title-validation");
const notifyOnFailure = args.flags.has("notify-on-failure");
const discourseUrl = args.values.get("discourse-url") ?? process.env.DISCOURSE_URL;
const siteUrl = args.values.get("site-url") ?? process.env.SITE_URL;
const routeBase = args.values.get("route-base");
const targetName = args.values.get("target") ?? process.env.DISCUSSION_TARGET;
const apiKey = args.values.get("api-key") ?? process.env.DISCOURSE_API_KEY;
const apiUsername = args.values.get("api-username") ?? process.env.DISCOURSE_API_USERNAME;
const diagnosticsApiKey = args.values.get("diagnostics-api-key") ?? process.env.DISCOURSE_DIAGNOSTICS_API_KEY;
const categoryId = numberFromValue(args.values.get("category-id") ?? process.env.DISCOURSE_CATEGORY_ID);
const titleMinLength = numberFromValue(args.values.get("title-min-length") ?? process.env.DISCOURSE_TITLE_MIN_LENGTH);
const preflightLimits = preflightLimitsFromArgs(args.values);
const tags = tagsFromValue(args.values.get("tags") ?? process.env.DISCOURSE_TAGS);
const notifyRecipients = csvFromValue(args.values.get("notify-recipients") ?? process.env.DISCOURSE_NOTIFY_RECIPIENTS);
const mode = modeForCommand(command);
const topics = [
  ...(csvFromValue(args.values.get("topic")) ?? []),
  ...(csvFromValue(args.values.get("topics")) ?? []),
  ...(csvFromValue(args.values.get("topic-id")) ?? []),
  ...(csvFromValue(args.values.get("topic-ids")) ?? []),
];
const overwrite = args.flags.has("overwrite");
const commentsDisplay = commentsDisplayFromValue(args.values.get("comments-display"));

const missing = [
  ...(!discourseUrl ? ["DISCOURSE_URL or --discourse-url"] : []),
  ...(!siteUrl && command !== "check-discourse" ? ["SITE_URL or --site-url"] : []),
  ...(!dryRun && command !== "check-discourse" && !apiKey ? ["DISCOURSE_API_KEY or --api-key"] : []),
  ...(!dryRun && command !== "check-discourse" && !apiUsername ? ["DISCOURSE_API_USERNAME or --api-username"] : []),
  ...(command === "import-existing" && topics.length === 0 ? ["--topic URL[,URL] or --topic-id ID[,ID]"] : []),
];

if (missing.length > 0) {
  console.error(`Missing required configuration: ${missing.join(", ")}`);
  process.exit(1);
}

if (command === "check-discourse") {
  const result = await checkDiscourse({
    discourseUrl: discourseUrl!,
    apiKey: diagnosticsApiKey ?? apiKey,
    apiUsername,
    tags,
    configuredLimits: preflightLimits,
  });

  console.log(`Discourse URL: ${discourseUrl}`);
  console.log(`Site settings: ${result.settingsAvailable ? "available" : "unavailable"}`);
  if (result.settingsError) console.log(`Site settings error: ${oneLine(result.settingsError)}`);
  console.log(`Site capabilities: ${result.capabilitiesAvailable ? "available" : "unavailable"}`);
  if (result.capabilitiesError) console.log(`Site capabilities error: ${oneLine(result.capabilitiesError)}`);
  console.log("Limits:");
  printLimit("min topic title length", result.limits.minTopicTitleLength);
  printLimit("max topic title length", result.limits.maxTopicTitleLength);
  printLimit("min first post length", result.limits.minFirstPostLength);
  printLimit("min post length", result.limits.minPostLength);
  printLimit("max post length", result.limits.maxPostLength);
  printLimit("max tags per topic", result.limits.maxTagsPerTopic);
  printLimit("max tag length", result.limits.maxTagLength);
  printLimit("tagging enabled", result.limits.taggingEnabled);
  console.log("Tag capabilities:");
  printLimit("can tag topics", result.tagCapabilities.canTagTopics);
  printLimit("can create tag", result.tagCapabilities.canCreateTag);
  if (tags?.length) {
    console.log(`Requested tags: ${tags.join(", ")}`);
    if (result.tagIssues.length) {
      console.log("Tag issues:");
      for (const issue of result.tagIssues) console.log(`- ${issue}`);
    } else {
      console.log("Tag issues: none");
    }
  }
  process.exit(result.tagIssues.length ? 1 : 0);
}

if (mode === "publish-new" && !dryRun) {
  console.log("Publishing missing discussion companion topics. Existing linked docs will be skipped.");
}

if (mode === "sync-existing" && !dryRun) {
  console.log("Syncing existing discussion companion topic summaries. Missing topics will be skipped.");
}

if (mode === "publish-and-sync" && !dryRun) {
  console.log("Publishing missing topics and syncing existing companion summaries.");
}

if (command === "import-existing") {
  if (!dryRun) {
    console.log("Importing existing Discourse topics into Astro Markdown files.");
  }

  const results = await importExistingDiscourseTopics({
    docsDir,
    siteUrl: siteUrl!,
    routeBase,
    targetName,
    discourseUrl: discourseUrl!,
    apiKey: apiKey ?? "",
    apiUsername: apiUsername ?? "",
    topics,
    dryRun,
    overwrite,
    commentsDisplay,
  });

  for (const result of results) {
    console.log(`${result.status}: ${result.filePath} -> ${result.topicUrl}`);
  }

  const imported = results.filter((result) => result.status === "imported").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  const previewed = results.filter((result) => result.status.startsWith("dry-run")).length;
  console.log(`Done: ${imported} imported, ${skipped} skipped, ${previewed} dry-run.`);
  process.exit(0);
}

const results = await syncDiscourseTopics({
  docsDir,
  siteUrl: siteUrl!,
  routeBase,
  targetName,
  discourseUrl: discourseUrl!,
  apiKey: apiKey ?? "",
  apiUsername: apiUsername ?? "",
  categoryId,
  tags,
  dryRun,
  mode,
  forceSync,
  unlistSyncedTopics,
  validateTitles,
  titleMinLength,
  preflightLimits,
  notifyOnFailure: {
    enabled: notifyOnFailure,
    recipients: notifyRecipients,
  },
});

for (const result of results) {
  const topic = result.topicUrl ? ` -> ${result.topicUrl}` : "";
  const reason = result.reason ? ` (${result.reason})` : "";
  console.log(`${result.status}: ${result.filePath}${topic}${reason}`);
}

const created = results.filter((result) => result.status === "created").length;
const updated = results.filter((result) => result.status === "updated").length;
const skipped = results.filter((result) => result.status === "skipped").length;
const unchanged = results.filter((result) => result.status === "unchanged").length;
const previewed = results.filter((result) => result.status.startsWith("dry-run")).length;
console.log(`Done: ${created} created, ${updated} updated, ${skipped} skipped, ${unchanged} unchanged, ${previewed} dry-run.`);

function parseArgs(rawArgs: string[]) {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const [rawName, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      values.set(rawName, inlineValue);
      continue;
    }

    const next = rawArgs[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(rawName, next);
      index += 1;
    } else {
      flags.add(rawName);
    }
  }

  return { flags, positionals, values };
}

function numberFromValue(value: string | undefined): number | undefined {
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function tagsFromValue(value: string | undefined): string[] | undefined {
  return csvFromValue(value);
}

function csvFromValue(value: string | undefined): string[] | undefined {
  if (!value) return undefined;

  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function commentsDisplayFromValue(value: string | undefined): "simple" | "full" | "fullInteractive" | undefined {
  if (!value) return undefined;
  if (value === "simple" || value === "full" || value === "fullInteractive") return value;
  printUsage(`Invalid --comments-display value: ${value}`);
  process.exit(1);
}

function preflightLimitsFromArgs(values: Map<string, string>): DiscoursePreflightLimits {
  return {
    minTopicTitleLength: numberFromValue(
      values.get("min-topic-title-length") ?? values.get("title-min-length") ?? process.env.DISCOURSE_TITLE_MIN_LENGTH,
    ),
    maxTopicTitleLength: numberFromValue(values.get("max-topic-title-length") ?? process.env.DISCOURSE_MAX_TOPIC_TITLE_LENGTH),
    maxPostLength: numberFromValue(values.get("max-post-length") ?? process.env.DISCOURSE_MAX_POST_LENGTH),
    maxTagsPerTopic: numberFromValue(values.get("max-tags-per-topic") ?? process.env.DISCOURSE_MAX_TAGS_PER_TOPIC),
    maxTagLength: numberFromValue(values.get("max-tag-length") ?? process.env.DISCOURSE_MAX_TAG_LENGTH),
  };
}

function modeForCommand(command: string): SyncMode {
  if (command === "sync-existing") return "sync-existing";
  if (command === "publish-and-sync") return "publish-and-sync";
  return "publish-new";
}

function printLimit(label: string, value: boolean | number | undefined) {
  console.log(`- ${label}: ${value === undefined ? "unknown" : String(value)}`);
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function printUsage(error?: string) {
  if (error) console.error(error);
  console.error("Usage:");
  console.error("  astro-discussion-bridge publish-new [docsDir] [--dry-run] [--target NAME] [--route-base PATH] [--title-min-length N] [--max-topic-title-length N] [--max-post-length N] [--max-tags-per-topic N] [--max-tag-length N] [--skip-title-validation] [--notify-on-failure] [--notify-recipients USER[,USER]] [--discourse-url URL] [--site-url URL]");
  console.error("  astro-discussion-bridge sync-existing [docsDir] [--dry-run] [--force] [--unlist] [--target NAME] [--route-base PATH] [--title-min-length N] [--max-topic-title-length N] [--max-post-length N] [--max-tags-per-topic N] [--max-tag-length N] [--skip-title-validation] [--notify-on-failure] [--notify-recipients USER[,USER]] [--discourse-url URL] [--site-url URL]");
  console.error("  astro-discussion-bridge publish-and-sync [docsDir] [--dry-run] [--force] [--unlist] [--target NAME] [--route-base PATH] [--title-min-length N] [--max-topic-title-length N] [--max-post-length N] [--max-tags-per-topic N] [--max-tag-length N] [--skip-title-validation] [--notify-on-failure] [--notify-recipients USER[,USER]] [--discourse-url URL] [--site-url URL]");
  console.error("  astro-discussion-bridge import-existing [docsDir] --topic URL[,URL] [--topic-id ID[,ID]] [--dry-run] [--overwrite] [--target NAME] [--route-base PATH] [--comments-display simple|full|fullInteractive] [--discourse-url URL] [--site-url URL]");
  console.error("  astro-discussion-bridge check-discourse [--tags TAG[,TAG]] [--diagnostics-api-key KEY] [--discourse-url URL]");
  console.error("  astro-discussion-bridge sync [docsDir] [--dry-run] [--target NAME] [--route-base PATH] [--discourse-url URL] [--site-url URL]");
}
