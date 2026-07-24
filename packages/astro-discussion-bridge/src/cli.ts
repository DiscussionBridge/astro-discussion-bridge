#!/usr/bin/env node
import path from "node:path";
import { checkDiscourse } from "./check-discourse.js";
import {
  importExistingDiscourseTopics,
  type ImportPruneProfile,
  type ImportSourceMode,
} from "./import-existing.js";
import {
  discoverDiscourseImports,
  listDiscourseImportCategories,
  writeImportDiscoveryManifest,
  type ImportDiscoveryOrder,
  type ImportDiscoveryStatus,
} from "./import-discovery.js";
import { importExistingDiscourseManifest, loadImportManifest } from "./import-manifest.js";
import {
  buildNavigationContentBindings,
  discoverDiscourseNavigation,
  loadNavigationDiscoveryConfig,
  writeNavigationManifest,
  type NavigationNode,
} from "./navigation.js";
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
  const validCommands = new Set([
    "sync",
    "publish-new",
    "sync-existing",
    "publish-and-sync",
    "import-existing",
    "discover-imports",
    "discover-navigation",
    "check-discourse",
  ]);

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
const apiUsername = args.values.get("post-as")
  ?? process.env.DISCOURSE_POST_AS
  ?? args.values.get("api-username")
  ?? process.env.DISCOURSE_API_USERNAME;
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
const sourceMode = sourceModeFromValue(args.values.get("source-mode"));
const manifestPath = args.values.get("manifest");
const manifestOutPath = args.values.get("manifest-out");
const navigationConfigPath = args.values.get("config");
const discoveryCategory = args.values.get("category");
const listCategories = args.flags.has("list-categories");
const discoveryStatus = (args.values.get("status") ?? "all") as ImportDiscoveryStatus;
const discoveryOrder = (args.values.get("order") ?? "oldest") as ImportDiscoveryOrder;
const discoveryLimit = numberFromValue(args.values.get("limit"));
const discoveryCreatedFrom = args.values.get("created-from");
const discoveryCreatedTo = args.values.get("created-to");
const hasDirectImportOptions = topics.length > 0 || commentsDisplay !== undefined || heroImage !== undefined || heroAlt !== undefined || pruneProfiles !== undefined || sourceMode !== undefined;

const missing = [
  ...(args.flags.has("hero-image") ? ["a value after --hero-image"] : []),
  ...(args.flags.has("hero-alt") ? ["a value after --hero-alt"] : []),
  ...(args.flags.has("prune-profile") ? ["a value after --prune-profile"] : []),
  ...(args.flags.has("source-mode") ? ["a value after --source-mode"] : []),
  ...(args.flags.has("manifest") ? ["a value after --manifest"] : []),
  ...(args.flags.has("manifest-out") ? ["a value after --manifest-out"] : []),
  ...(args.flags.has("config") ? ["a value after --config"] : []),
  ...(args.flags.has("category") ? ["a value after --category"] : []),
  ...(args.flags.has("status") ? ["a value after --status"] : []),
  ...(args.flags.has("order") ? ["a value after --order"] : []),
  ...(args.flags.has("limit") ? ["a value after --limit"] : []),
  ...(args.flags.has("created-from") ? ["a value after --created-from"] : []),
  ...(args.flags.has("created-to") ? ["a value after --created-to"] : []),
  ...(args.values.has("hero-image") && !heroImage?.trim() ? ["a non-empty --hero-image value"] : []),
  ...(args.values.has("hero-alt") && !heroAlt?.trim() ? ["a non-empty --hero-alt value"] : []),
  ...(args.values.has("prune-profile") && !args.values.get("prune-profile")?.trim() ? ["a non-empty --prune-profile value"] : []),
  ...(args.values.has("source-mode") && !args.values.get("source-mode")?.trim() ? ["a non-empty --source-mode value"] : []),
  ...(args.values.has("manifest") && !manifestPath?.trim() ? ["a non-empty --manifest value"] : []),
  ...(args.values.has("manifest-out") && !manifestOutPath?.trim() ? ["a non-empty --manifest-out value"] : []),
  ...(args.values.has("config") && !navigationConfigPath?.trim() ? ["a non-empty --config value"] : []),
  ...(args.values.has("category") && !discoveryCategory?.trim() ? ["a non-empty --category value"] : []),
  ...(args.values.has("limit") && discoveryLimit === undefined ? ["a numeric --limit value"] : []),
  ...(args.values.has("created-from") && !discoveryCreatedFrom?.trim() ? ["a non-empty --created-from value"] : []),
  ...(args.values.has("created-to") && !discoveryCreatedTo?.trim() ? ["a non-empty --created-to value"] : []),
  ...(!discourseUrl ? ["DISCOURSE_URL or --discourse-url"] : []),
  ...(!siteUrl && !["check-discourse", "discover-imports"].includes(command) ? ["SITE_URL or --site-url"] : []),
  ...(!dryRun && !["check-discourse", "import-existing", "discover-imports", "discover-navigation"].includes(command) && !apiKey ? ["DISCOURSE_API_KEY or --api-key"] : []),
  ...(!dryRun && command === "import-existing" && !importApiKey ? ["DISCOURSE_DIAGNOSTICS_API_KEY, DISCOURSE_API_KEY, --diagnostics-api-key, or --api-key"] : []),
  ...(!dryRun && !["check-discourse", "discover-imports", "discover-navigation"].includes(command) && !apiUsername
    ? ["DISCOURSE_POST_AS, --post-as, DISCOURSE_API_USERNAME, or --api-username"]
    : []),
  ...(command === "discover-navigation" && Boolean(importApiKey) !== Boolean(apiUsername)
    ? ["both a diagnostics/API key and posting actor when authenticated navigation discovery is used"]
    : []),
  ...(command === "import-existing" && topics.length === 0 && !manifestPath ? ["--topic URL[,URL], --topic-id ID[,ID], or --manifest FILE"] : []),
  ...(command === "import-existing" && manifestPath && hasDirectImportOptions ? ["use --manifest without --topic, --comments-display, --hero-image, --hero-alt, --prune-profile, or --source-mode"] : []),
  ...(command !== "import-existing" && manifestPath ? ["--manifest is only valid with import-existing"] : []),
  ...(!["discover-imports", "discover-navigation"].includes(command) && manifestOutPath
    ? ["--manifest-out is only valid with discover-imports or discover-navigation"]
    : []),
  ...(command === "discover-navigation" && !navigationConfigPath ? ["--config FILE"] : []),
  ...(command === "discover-navigation" && !manifestOutPath ? ["--manifest-out FILE"] : []),
  ...(command !== "discover-navigation" && navigationConfigPath ? ["--config is only valid with discover-navigation"] : []),
  ...(command === "discover-imports" && !listCategories && !discoveryCategory ? ["--category ID|SLUG|NAME or --list-categories"] : []),
  ...(command === "import-existing" && heroImage && !heroAlt?.trim() ? ["--hero-alt TEXT when --hero-image is used"] : []),
  ...(command === "import-existing" && heroAlt && !heroImage ? ["--hero-image PATH when --hero-alt is used"] : []),
];

if (missing.length > 0) {
  printMissingConfiguration({ command, missing, dryRun });
  process.exit(1);
}

if (command === "discover-navigation") {
  const config = await loadNavigationDiscoveryConfig(navigationConfigPath!.trim());
  const content = await buildNavigationContentBindings({
    projectRoot: process.cwd(),
    siteUrl: siteUrl!,
    sources: config.contentSources,
  });
  const manifest = await discoverDiscourseNavigation({
    discourseUrl: discourseUrl!,
    apiKey: importApiKey,
    apiUsername,
    hierarchyTagGroups: config.hierarchyTagGroups,
    lenses: config.lenses,
    content,
  });
  const output = await writeNavigationManifest(manifestOutPath!.trim(), manifest);
  console.log("Discourse navigation discovery (read-only)");
  console.log(`Discourse URL: ${manifest.discourseUrl}`);
  console.log(`Hierarchy tag groups: ${manifest.hierarchyTagGroups.length}`);
  console.log(`Content bindings: ${content.length}`);
  for (const lens of manifest.lenses) {
    console.log(
      `- ${lens.label}: category ${lens.categoryId}; index topic ${lens.indexTopicId}; `
      + `${countNavigationNodes(lens.nodes)} authored nodes`,
    );
  }
  console.log(`Manifest written: ${output}`);
  console.log("No Discourse topics or Astro content files were changed.");
  process.exit(0);
}

if (command === "discover-imports") {
  if (listCategories) {
    const categories = await listDiscourseImportCategories({
      discourseUrl: discourseUrl!,
      apiKey: importApiKey,
      apiUsername,
    });
    console.log(`Discourse categories: ${discourseUrl}`);
    for (const category of categories) {
      const parent = category.parent_category_id ? `; parent ${category.parent_category_id}` : "";
      const count = category.topic_count === undefined ? "" : `; ${category.topic_count} topics`;
      console.log(`- ${category.id}: ${category.name} (${category.slug ?? "no slug"}${parent}${count})`);
    }
    process.exit(0);
  }

  const result = await discoverDiscourseImports({
    docsDir,
    discourseUrl: discourseUrl!,
    apiKey: importApiKey,
    apiUsername,
    category: discoveryCategory!,
    includeSubcategories: args.flags.has("include-subcategories"),
    tags,
    createdFrom: discoveryCreatedFrom,
    createdTo: discoveryCreatedTo,
    status: discoveryStatus,
    order: discoveryOrder,
    limit: discoveryLimit,
    commentsDisplay,
    sourceMode,
  });

  console.log("Discourse import discovery (read-only)");
  console.log(`Category: ${result.category.id}: ${result.category.name} (${result.category.slug ?? "no slug"})`);
  console.log(`Included category IDs: ${result.includedCategoryIds.join(", ")}`);
  console.log(`Scanned topics: ${result.scannedTopics}`);
  console.log(`Excluded already imported: ${result.excludedAlreadyImported}`);
  console.log(`Candidates: ${result.candidates.length}`);
  for (const candidate of result.candidates) {
    const state = candidate.closed ? "closed" : candidate.archived ? "archived" : "open";
    console.log(`- ${candidate.topicId} | ${candidate.createdAt.slice(0, 10)} | ${state} | ${candidate.title}`);
    console.log(`  ${candidate.topicUrl}`);
    if (candidate.tags.length) console.log(`  tags: ${candidate.tags.join(", ")}`);
  }
  if (manifestOutPath) {
    const writtenPath = await writeImportDiscoveryManifest(manifestOutPath, result.manifest);
    console.log(`Manifest written: ${writtenPath}`);
  } else if (args.flags.has("json") && result.manifest.imports.length) {
    console.log(JSON.stringify(result.manifest, null, 2));
  } else if (args.flags.has("json")) {
    console.log("No import manifest was generated because no candidates matched.");
  } else {
    console.log("No files were written. Use --manifest-out FILE to save this reviewed candidate order.");
  }
  process.exit(0);
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
  console.log(`Request actor: ${apiUsername ?? "anonymous"}`);
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
  if (apiUsername) console.log(`Post as: ${apiUsername}`);

  const manifest = manifestPath ? await loadImportManifest(manifestPath.trim()) : undefined;
  const results = manifest
    ? await importExistingDiscourseManifest({
      docsDir,
      siteUrl: siteUrl!,
      routeBase,
      targetName,
      discourseUrl: discourseUrl!,
      apiKey: importApiKey ?? "",
      apiUsername: apiUsername ?? "",
      manifest,
      dryRun,
      overwrite,
    })
    : await importExistingDiscourseTopics({
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
      sourceMode,
    });

  for (const result of results) {
    const reason = result.reason ? ` (${result.reason})` : "";
    console.log(`${result.status}: ${result.filePath} -> ${result.topicUrl}${reason}`);
    if (result.officialSourceComparison) {
      console.log(
        `  official source: ${result.officialSourceComparison}`
        + `${result.officialCitation ? ` (${result.officialCitation})` : ""}`,
      );
    }
  }

  const imported = results.filter((result) => result.status === "imported").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  const previewed = results.filter((result) => result.status.startsWith("dry-run")).length;
  const officialComparisons = results.reduce<Record<string, number>>((counts, result) => {
    if (result.officialSourceComparison) {
      counts[result.officialSourceComparison] = (counts[result.officialSourceComparison] ?? 0) + 1;
    }
    return counts;
  }, {});
  console.log(`Done: ${imported} imported, ${skipped} skipped, ${previewed} dry-run.`);
  if (Object.keys(officialComparisons).length) {
    console.log(
      "Official-source comparison: "
      + ["exact", "presentation-only", "substantive-difference", "unresolved"]
        .map((outcome) => `${outcome} ${officialComparisons[outcome] ?? 0}`)
        .join(", "),
    );
  }
  process.exit(0);
}

if (apiUsername) console.log(`Post as: ${apiUsername}`);
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

function sourceModeFromValue(value: string | undefined): ImportSourceMode | undefined {
  if (!value) return undefined;
  if (value === "discourse-imported" || value === "discourse-managed") return value;
  printUsage(`Invalid --source-mode value: ${value}. Importing cannot promote content to astro-managed.`);
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

function countNavigationNodes(nodes: NavigationNode[]): number {
  return nodes.reduce(
    (count, node) => count + 1 + countNavigationNodes(node.children),
    0,
  );
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
  console.error("  astro-discussion-bridge discover-imports [docsDir] --category ID|SLUG|NAME [options]");
  console.error("  astro-discussion-bridge discover-navigation --config FILE --manifest-out FILE [options]");
  console.error("  astro-discussion-bridge import-existing [docsDir] --topic URL[,URL] [options]");
  console.error("  astro-discussion-bridge check-discourse [options]");
  console.error("");
  console.error("Commands:");
  console.error("  publish-new       Create missing Discourse companion topics; skip pages already linked.");
  console.error("  sync-existing     Rewrite/update already linked companion topics; skip pages without discourseTopicId.");
  console.error("  publish-and-sync  Create missing topics and sync existing linked topics in one explicit run.");
  console.error("  discover-imports  Read a Discourse category and preview an ordered import manifest; never imports.");
  console.error("  discover-navigation  Generate public navigation from authored Discourse index topics; never writes to Discourse.");
  console.error("  import-existing   Import or mirror existing Discourse topics into Astro Markdown.");
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
  console.error("  --post-as USER             Preferred Discourse request actor, or DISCOURSE_POST_AS.");
  console.error("  --api-username USER        Backward-compatible alias/fallback using DISCOURSE_API_USERNAME.");
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
  console.error("  --manifest FILE            Ordered JSON imports with per-topic output/tag/hero/prune/comments/source policies.");
  console.error("  --overwrite                Replace existing imported Markdown files.");
  console.error("  --comments-display MODE    simple, full, or fullInteractive.");
  console.error("  --hero-image PATH          Add a leading imported-page image using this asset path or URL.");
  console.error("  --hero-alt TEXT            Required non-empty alt text when --hero-image is used.");
  console.error("  --prune-profile NAME       Opt-in trailing boilerplate rule; currently community-call-to-action.");
  console.error("  --source-mode MODE         discourse-imported (default) or discourse-managed; never astro-managed.");
  console.error("");
  console.error("Import discovery options:");
  console.error("  --list-categories          List category IDs, names, slugs, parents, and topic counts.");
  console.error("  --category ID|SLUG|NAME    Select one category by ID or exact unambiguous slug/name.");
  console.error("  --include-subcategories    Include topics from descendant categories.");
  console.error("  --tags TAG[,TAG]           Require every listed tag; matching is case-insensitive.");
  console.error("  --created-from DATE        Include topics created on/after this ISO date or timestamp.");
  console.error("  --created-to DATE          Include topics created on/before this ISO date or timestamp.");
  console.error("  --status STATUS            all (default), open, or closed/archived.");
  console.error("  --order ORDER              oldest (default), newest, or natural-title.");
  console.error("  --limit N                  Keep the first N candidates after deterministic ordering.");
  console.error("  --manifest-out FILE        Save a new strict v1 manifest; refuses to overwrite.");
  console.error("  --json                     Print the generated manifest after the human preview.");
  console.error("");
  console.error("Navigation discovery options:");
  console.error("  --config FILE              Strict JSON lens, index-topic, tag-group, and content-source configuration.");
  console.error("  --manifest-out FILE        Create a navigation manifest; refuses to overwrite.");
  console.error("  --diagnostics-api-key KEY  Optional read-capable key when public endpoints are restricted.");
  console.error("");
  console.error("Diagnostics options:");
  console.error("  --diagnostics-api-key KEY  Use a broader/read-capable key for check-discourse and raw imports.");
  console.error("  --page-url URL             Test existing-topic reconciliation for one Astro page URL.");
  console.error("");
  console.error("Examples:");
  console.error("  astro-discussion-bridge check-discourse --category-id 5 --tags discussionbridge,docs --discourse-url https://forum.example.com");
  console.error("  astro-discussion-bridge discover-imports src/content/docs --category guides --tags guide --order oldest --limit 10 --manifest-out imports/guides.json --discourse-url https://forum.example.com");
  console.error("  astro-discussion-bridge discover-navigation --config navigation.config.json --manifest-out src/generated/navigation.json --discourse-url https://forum.example.com --site-url https://example.com");
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
