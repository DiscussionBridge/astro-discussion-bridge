#!/usr/bin/env node
import path from "node:path";
import { importExistingDiscourseTopics } from "./import-existing.js";
import { syncDiscourseTopics, type SyncMode } from "./sync/index.js";

const command = process.argv[2] ?? "help";
const validCommands = new Set(["sync", "publish-new", "sync-existing", "publish-and-sync", "import-existing"]);

if (!validCommands.has(command)) {
  printUsage(command === "help" ? undefined : `Unknown command: ${command}`);
  process.exit(command === "help" ? 0 : 1);
}

const args = parseArgs(process.argv.slice(3));
const docsDir = path.resolve(args.positionals[0] ?? "src/content/docs");
const dryRun = args.flags.has("dry-run");
const unlistSyncedTopics = args.flags.has("unlist");
const validateTitles = !args.flags.has("skip-title-validation");
const notifyOnFailure = args.flags.has("notify-on-failure");
const discourseUrl = args.values.get("discourse-url") ?? process.env.DISCOURSE_URL;
const siteUrl = args.values.get("site-url") ?? process.env.SITE_URL;
const routeBase = args.values.get("route-base");
const apiKey = args.values.get("api-key") ?? process.env.DISCOURSE_API_KEY;
const apiUsername = args.values.get("api-username") ?? process.env.DISCOURSE_API_USERNAME;
const categoryId = numberFromValue(args.values.get("category-id") ?? process.env.DISCOURSE_CATEGORY_ID);
const titleMinLength = numberFromValue(args.values.get("title-min-length") ?? process.env.DISCOURSE_TITLE_MIN_LENGTH);
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
  ...(!siteUrl ? ["SITE_URL or --site-url"] : []),
  ...(!dryRun && !apiKey ? ["DISCOURSE_API_KEY or --api-key"] : []),
  ...(!dryRun && !apiUsername ? ["DISCOURSE_API_USERNAME or --api-username"] : []),
  ...(command === "import-existing" && topics.length === 0 ? ["--topic URL[,URL] or --topic-id ID[,ID]"] : []),
];

if (missing.length > 0) {
  console.error(`Missing required configuration: ${missing.join(", ")}`);
  process.exit(1);
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
  discourseUrl: discourseUrl!,
  apiKey: apiKey ?? "",
  apiUsername: apiUsername ?? "",
  categoryId,
  tags,
  dryRun,
  mode,
  unlistSyncedTopics,
  validateTitles,
  titleMinLength,
  notifyOnFailure: {
    enabled: notifyOnFailure,
    recipients: notifyRecipients,
  },
});

for (const result of results) {
  const topic = result.topicUrl ? ` -> ${result.topicUrl}` : "";
  console.log(`${result.status}: ${result.filePath}${topic}`);
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

function modeForCommand(command: string): SyncMode {
  if (command === "sync-existing") return "sync-existing";
  if (command === "publish-and-sync") return "publish-and-sync";
  return "publish-new";
}

function printUsage(error?: string) {
  if (error) console.error(error);
  console.error("Usage:");
  console.error("  astro-discussion-bridge publish-new [docsDir] [--dry-run] [--route-base PATH] [--title-min-length N] [--skip-title-validation] [--notify-on-failure] [--notify-recipients USER[,USER]] [--discourse-url URL] [--site-url URL]");
  console.error("  astro-discussion-bridge sync-existing [docsDir] [--dry-run] [--unlist] [--route-base PATH] [--title-min-length N] [--skip-title-validation] [--notify-on-failure] [--notify-recipients USER[,USER]] [--discourse-url URL] [--site-url URL]");
  console.error("  astro-discussion-bridge publish-and-sync [docsDir] [--dry-run] [--unlist] [--route-base PATH] [--title-min-length N] [--skip-title-validation] [--notify-on-failure] [--notify-recipients USER[,USER]] [--discourse-url URL] [--site-url URL]");
  console.error("  astro-discussion-bridge import-existing [docsDir] --topic URL[,URL] [--topic-id ID[,ID]] [--dry-run] [--overwrite] [--route-base PATH] [--comments-display simple|full|fullInteractive] [--discourse-url URL] [--site-url URL]");
  console.error("  astro-discussion-bridge sync [docsDir] [--dry-run] [--route-base PATH] [--discourse-url URL] [--site-url URL]");
}
