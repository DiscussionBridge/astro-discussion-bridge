#!/usr/bin/env node
import path from "node:path";
import { checkDiscourse } from "./check-discourse.js";
import { importExistingDiscourseTopics, type ImportPruneProfile } from "./import-existing.js";
import { syncDiscourseTopics, type DiscoursePreflightLimits, type SyncMode } from "./sync/index.js";

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const rawCommand = process.argv[2] ?? "help";
  if (rawCommand === "help" || rawCommand === "--help" || rawCommand === "-h") {
    printUsage();
    return;
  }

  const command = rawCommand;
  const validCommands = new Set(["sync", "publish-new", "sync-existing", "publish-and-sync", "import-existing", "check-discourse"]);

  if (!validCommands.has(command)) {
    printUsage(`Unknown command: ${command}`);
    process.exit(1);
  }

const args = parseArgs(process.argv.slice(3));
if (args.flags.has("help") || args.flags.has("h")) {
  printUsage();
  return;
}
const docsDir = path.resolve(args.positionals[0] ?? "src/content/docs");
const dryRun = args.flags.has("dry-run");
const showDetails = args.flags.has("details") || args.flags.has("verbose");
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
const importApiKey = diagnosticsApiKey ?? apiKey;
const categoryId = numberFromValue(args.values.get("category-id") ?? process.env.DISCOURSE_CATEGORY_ID);
const titleMinLength = numberFromValue(args.values.get("title-min-length") ?? process.env.DISCOURSE_TITLE_MIN_LENGTH);
const preflightLimits = preflightLimitsFromArgs(args.values);
const tags = tagsFromValue(args.values.get("tags") ?? process.env.DISCOURSE_TAGS);
const pageUrl = args.values.get("page-url") ?? process.env.DISCUSSION_PAGE_URL;
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
const heroImage = args.values.get("hero-image");
const heroAlt = args.values.get("hero-alt");
const pruneProfiles = pruneProfilesFromValue(args.values.get("prune-profile"));

const missing = [
  ...(args.flags.has("hero-image") ? ["a value after --hero-image"] : []),
  ...(args.flags.has("hero-alt") ? ["a value after --hero-alt"] : []),
  ...(args.flags.has("prune-profile") ? ["a value after --prune-profile"] : []),
  ...(args.values.has("hero-image") && !heroImage?.trim() ? ["a non-empty --hero-image value"] : []),
  ...(args.values.has("hero-alt") && !heroAlt?.trim() ? ["a non-empty --hero-alt value"] : []),
  ...(args.values.has("prune-profile") && !args.values.get("prune-profile")?.trim() ? ["a non-empty --prune-profile value"] : []),
  ...(!discourseUrl ? ["DISCOURSE_URL or --discourse-url"] : []),
  ...(!siteUrl && command !== "check-discourse" ? ["SITE_URL or --site-url"] : []),
  ...(!dryRun && command !== "check-discourse" && command !== "import-existing" && !apiKey ? ["DISCOURSE_API_KEY or --api-key"] : []),
  ...(!dryRun && command === "import-existing" && !importApiKey ? ["DISCOURSE_DIAGNOSTICS_API_KEY, DISCOURSE_API_KEY, --diagnostics-api-key, or --api-key"] : []),
  ...(!dryRun && command !== "check-discourse" && !apiUsername ? ["DISCOURSE_API_USERNAME or --api-username"] : []),
  ...(command === "import-existing" && topics.length === 0 ? ["--topic URL[,URL] or --topic-id ID[,ID]"] : []),
  ...(command === "import-existing" && heroImage && !heroAlt?.trim() ? ["--hero-alt TEXT when --hero-image is used"] : []),
  ...(command === "import-existing" && heroAlt && !heroImage ? ["--hero-image PATH when --hero-alt is used"] : []),
];

if (missing.length > 0) {
  printMissingConfiguration({ command, missing, dryRun });
  process.exit(1);
}

if (command === "check-discourse") {
  const result = await checkDiscourse({
    discourseUrl: discourseUrl!,
    apiKey: diagnosticsApiKey ?? apiKey,
    apiUsername,
    categoryId,
    tags,
    pageUrl,
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
  if (categoryId !== undefined) {
    console.log("Category:");
    if (result.category) {
      console.log(`- ${result.category.id}: ${result.category.name}${result.category.slug ? ` (${result.category.slug})` : ""}`);
      printLimit("read restricted", result.category.readRestricted);
    } else {
      console.log(`- ${categoryId}: unknown`);
    }
  }
  if (tags?.length) {
    console.log(`Requested tags: ${tags.join(", ")}`);
    if (result.requestedTags.length) {
      console.log("Tag inventory:");
      for (const tag of result.requestedTags) {
        const exists = tag.exists === undefined ? "unknown" : tag.exists ? "exists" : "missing";
        const count = tag.count === undefined ? "" : ` (${tag.count})`;
        console.log(`- ${tag.name}: ${exists}${count}`);
      }
    }
    if (result.tagIssues.length) {
      console.log("Tag issues:");
      for (const issue of result.tagIssues) console.log(`- ${issue}`);
    } else {
      console.log("Tag issues: none");
    }
  }
  if (result.setupIssues.length) {
    console.log("Setup issues:");
    for (const issue of result.setupIssues) console.log(`- ${issue}`);
  } else {
    console.log("Setup issues: none");
  }
  if (result.setupWarnings.length) {
    console.log("Setup warnings:");
    for (const warning of result.setupWarnings) console.log(`- ${warning}`);
  }
  if (result.reconciliation) {
    console.log("Reconciliation lookup:");
    console.log(`- page URL: ${result.reconciliation.pageUrl}`);
    console.log(`- embed info: ${result.reconciliation.embedInfoAvailable ? "available" : "unavailable"}`);
    if (result.reconciliation.embedInfoError) console.log(`- embed info error: ${oneLine(result.reconciliation.embedInfoError)}`);
    console.log(`- search: ${result.reconciliation.searchAvailable ? "available" : "unavailable"}`);
    if (result.reconciliation.searchError) console.log(`- search error: ${oneLine(result.reconciliation.searchError)}`);
    console.log(`- owning topic: ${result.reconciliation.topicId ?? "unknown"}`);
    if (result.reconciliation.topicSlug) console.log(`- owning topic slug: ${result.reconciliation.topicSlug}`);
    console.log(`- lookup method: ${result.reconciliation.method ?? "none"}`);
    if (result.reconciliation.candidateTopicIds.length) {
      console.log(`- candidate topics: ${result.reconciliation.candidateTopicIds.join(", ")}`);
    }
  }
  process.exit(result.tagIssues.length || result.setupIssues.length ? 1 : 0);
}

if ((command === "publish-new" || command === "sync") && !dryRun) {
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
    apiKey: importApiKey ?? "",
    apiUsername: apiUsername ?? "",
    topics,
    dryRun,
    overwrite,
    commentsDisplay,
    heroImage,
    heroAlt,
    pruneProfiles,
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
  if (showDetails) printSyncResultDetails(result);
}

const created = results.filter((result) => result.status === "created").length;
const updated = results.filter((result) => result.status === "updated").length;
const skipped = results.filter((result) => result.status === "skipped").length;
const unchanged = results.filter((result) => result.status === "unchanged").length;
const previewed = results.filter((result) => result.status.startsWith("dry-run")).length;
console.log(`Done: ${created} created, ${updated} updated, ${skipped} skipped, ${unchanged} unchanged, ${previewed} dry-run.`);
}

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

function pruneProfilesFromValue(value: string | undefined): ImportPruneProfile[] | undefined {
  const profiles = csvFromValue(value);
  if (!profiles) return undefined;

  for (const profile of profiles) {
    if (profile !== "community-call-to-action") {
      printUsage(`Invalid --prune-profile value: ${profile}`);
      process.exit(1);
    }
  }

  return profiles as ImportPruneProfile[];
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

function printSyncResultDetails(result: {
  title: string;
  pageUrl: string;
  targetName?: string;
  topicId?: number;
  reason?: string;
}) {
  console.log(`  title: ${result.title}`);
  console.log(`  page URL: ${result.pageUrl}`);
  if (result.targetName) console.log(`  target: ${result.targetName}`);
  if (result.topicId !== undefined) console.log(`  topic ID: ${result.topicId}`);
  if (result.reason) console.log(`  reason: ${result.reason}`);
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function printUsage(error?: string) {
  if (error) console.error(error);
  if (error) console.error("");
  console.error("Discussion Bridge for Astro CLI");
  console.error("");
  console.error("Usage:");
  console.error("  astro-discussion-bridge publish-new [docsDir] [options]");
  console.error("  astro-discussion-bridge sync-existing [docsDir] [options]");
  console.error("  astro-discussion-bridge publish-and-sync [docsDir] [options]");
  console.error("  astro-discussion-bridge import-existing [docsDir] --topic URL[,URL] [options]");
  console.error("  astro-discussion-bridge check-discourse [options]");
  console.error("");
  console.error("Commands:");
  console.error("  publish-new       Create missing Discourse companion topics; skip pages already linked.");
  console.error("  sync-existing     Rewrite/update already linked companion topics; skip pages without discourseTopicId.");
  console.error("  publish-and-sync  Create missing topics and sync existing linked topics in one explicit run.");
  console.error("  import-existing   Import existing Discourse topics into editable Astro Markdown.");
  console.error("  check-discourse   Read target forum settings/capabilities before live writes.");
  console.error("  sync              Backward-compatible alias for publish-new.");
  console.error("");
  console.error("Common options:");
  console.error("  --dry-run                  Preview without Discourse writes or file updates.");
  console.error("  --details                  Show title, page URL, target, topic ID, and reason for each page.");
  console.error("  --target NAME              Run only pages for one discussion target.");
  console.error("  --route-base PATH          Public route prefix for this content lane, such as blog or releases.");
  console.error("  --discourse-url URL        Discourse base URL, or DISCOURSE_URL.");
  console.error("  --site-url URL             Public Astro site URL, or SITE_URL.");
  console.error("  --api-username USER        Discourse API username, or DISCOURSE_API_USERNAME.");
  console.error("  --api-key KEY              Discourse API key, or DISCOURSE_API_KEY.");
  console.error("  --tags TAG[,TAG]           Discourse topic tags for this lane.");
  console.error("  --category-id ID           Discourse category ID for created/updated topics.");
  console.error("  --force                    Rewrite linked first posts even when source hash is unchanged.");
  console.error("  --unlist                   Mark synced/created companion topics unlisted.");
  console.error("  --notify-on-failure        Send a Discourse PM when publish/sync fails.");
  console.error("  --notify-recipients USER[,USER]");
  console.error("                             Discourse users to notify on failure.");
  console.error("");
  console.error("Preflight options:");
  console.error("  --title-min-length N       Minimum topic title length; default 15.");
  console.error("  --max-topic-title-length N Fail locally when a topic title is too long.");
  console.error("  --max-post-length N        Fail locally when the companion first post is too long.");
  console.error("  --max-tags-per-topic N     Fail locally when too many tags are requested.");
  console.error("  --max-tag-length N         Fail locally when a tag is too long.");
  console.error("  --skip-title-validation    Skip local title validation.");
  console.error("");
  console.error("Import options:");
  console.error("  --topic URL[,URL]          Discourse topic URL or ID to import.");
  console.error("  --topic-id ID[,ID]         Discourse topic ID to import.");
  console.error("  --overwrite                Replace existing imported Markdown files.");
  console.error("  --comments-display MODE    simple, full, or fullInteractive.");
  console.error("  --hero-image PATH          Add a leading imported-page image using this asset path or URL.");
  console.error("  --hero-alt TEXT            Required non-empty alt text when --hero-image is used.");
  console.error("  --prune-profile NAME       Opt-in trailing boilerplate rule; currently community-call-to-action.");
  console.error("");
  console.error("Diagnostics options:");
  console.error("  --diagnostics-api-key KEY  Use a broader/read-capable key for check-discourse and raw imports.");
  console.error("  --page-url URL             Test existing-topic reconciliation for one Astro page URL.");
  console.error("");
  console.error("Examples:");
  console.error("  astro-discussion-bridge check-discourse --category-id 5 --tags discussionbridge,docs --discourse-url https://forum.example.com");
  console.error("  astro-discussion-bridge publish-new src/content/docs --dry-run --details --discourse-url https://forum.example.com --site-url https://docs.example.com");
  console.error("  astro-discussion-bridge sync-existing src/content/blog --route-base blog --force --details");
}

function printMissingConfiguration(input: { command: string; missing: string[]; dryRun: boolean }) {
  console.error("Discussion Bridge is missing required configuration.");
  console.error("");
  console.error(`Command: ${input.command}${input.dryRun ? " --dry-run" : ""}`);
  console.error("Missing:");
  for (const item of input.missing) console.error(`- ${item}`);
  console.error("");
  console.error("How to fix:");
  console.error("- Pass the missing values as CLI options, or set the matching environment variables in the shell running the command.");
  console.error("- Run from the Astro project root so relative content paths resolve correctly.");
  if (!input.dryRun && input.command !== "check-discourse") {
    console.error("- Add --dry-run when you want to preview publish/sync behavior without API credentials or live writes.");
  }
  console.error("- Use --help to see commands and options.");
}
