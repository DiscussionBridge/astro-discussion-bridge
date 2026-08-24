import { promises as fs } from "node:fs";
import path from "node:path";
import {
  assertNoSymlinkDestination,
  importExistingDiscourseTopics,
  type ImportedDiscourseTopic,
  type ImportExistingDiscourseTopicsOptions,
  type ImportPruneProfile,
  type ImportSourceMode,
} from "./import-existing.js";
import {
  validateOfficialSourceProfile,
  type OfficialSourceProfile,
} from "./official-source.js";
import { publishFilesAtomically } from "./atomic-files.js";

export interface ImportManifestEntry {
  topic: string;
  commentsDisplay?: "simple" | "full" | "fullInteractive";
  heroImage?: string;
  heroAlt?: string;
  pruneProfiles?: ImportPruneProfile[];
  output?: string;
  requiredTags?: string[];
  sourceMode?: ImportSourceMode;
  sectionId?: string;
  contentLens?: string;
  officialSource?: string;
  allowSubstantiveDifference?: boolean;
}

export interface ImportManifest {
  version: 1 | 2;
  officialSources?: Record<string, OfficialSourceProfile>;
  imports: ImportManifestEntry[];
}

const entryKeys = new Set([
  "topic",
  "commentsDisplay",
  "heroImage",
  "heroAlt",
  "pruneProfiles",
  "output",
  "requiredTags",
  "sourceMode",
  "sectionId",
  "contentLens",
  "officialSource",
  "allowSubstantiveDifference",
]);
const rootKeys = new Set(["version", "officialSources", "imports"]);

export interface ImportManifestRunOptions extends Omit<
  ImportExistingDiscourseTopicsOptions,
  "topics" | "commentsDisplay" | "heroImage" | "heroAlt" | "pruneProfiles" | "outputFile" | "requiredTags" | "sourceMode"
  | "sectionId" | "contentLens" | "officialSource" | "officialSourceDocumentCache"
  | "allowSubstantiveDifference"
> {
  manifest: ImportManifest;
}

export async function loadImportManifest(filePath: string): Promise<ImportManifest> {
  const resolvedPath = path.resolve(filePath);
  let parsed: unknown;

  try {
    parsed = JSON.parse(await fs.readFile(resolvedPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read import manifest ${resolvedPath}: ${errorMessage(error)}`);
  }

  return validateImportManifest(parsed, resolvedPath);
}

export function validateImportManifest(value: unknown, source = "import manifest"): ImportManifest {
  if (!isRecord(value)) throw new Error(`${source} must contain a JSON object.`);
  const unknownRootKeys = Object.keys(value).filter((key) => !rootKeys.has(key));
  if (unknownRootKeys.length) throw new Error(`${source} contains unknown root field(s): ${unknownRootKeys.join(", ")}.`);
  if (value.version !== 1 && value.version !== 2) throw new Error(`${source} must use version 1 or 2.`);
  if (value.version === 1 && value.officialSources !== undefined) {
    throw new Error(`${source} must use version 2 when officialSources are configured.`);
  }
  const officialSources = validateOfficialSources(value.officialSources, source);
  if (!Array.isArray(value.imports) || value.imports.length === 0) {
    throw new Error(`${source} must contain a non-empty imports array.`);
  }

  const seenTopicIds = new Set<number>();
  const imports = value.imports.map((entry, index) => {
    const label = `${source} imports[${index}]`;
    if (!isRecord(entry)) throw new Error(`${label} must be an object.`);

    const unknownKeys = Object.keys(entry).filter((key) => !entryKeys.has(key));
    if (unknownKeys.length) throw new Error(`${label} contains unknown field(s): ${unknownKeys.join(", ")}.`);

    const topic = typeof entry.topic === "number" ? String(entry.topic) : entry.topic;
    if (typeof topic !== "string" || !topic.trim()) throw new Error(`${label}.topic must be a topic ID or URL.`);
    const topicId = topicIdFromReference(topic);
    if (seenTopicIds.has(topicId)) throw new Error(`${source} contains duplicate topic ID ${topicId}.`);
    seenTopicIds.add(topicId);

    const commentsDisplay = optionalString(entry.commentsDisplay, `${label}.commentsDisplay`);
    if (commentsDisplay && !["simple", "full", "fullInteractive"].includes(commentsDisplay)) {
      throw new Error(`${label}.commentsDisplay must be simple, full, or fullInteractive.`);
    }

    const sourceMode = optionalString(entry.sourceMode, `${label}.sourceMode`);
    if (sourceMode && !["discourse-imported", "discourse-managed"].includes(sourceMode)) {
      throw new Error(`${label}.sourceMode must be discourse-imported or discourse-managed.`);
    }
    const sectionId = optionalString(entry.sectionId, `${label}.sectionId`);
    if (sectionId && !/^[A-Za-z0-9.-]+$/.test(sectionId)) {
      throw new Error(`${label}.sectionId is invalid.`);
    }
    const contentLens = optionalString(entry.contentLens, `${label}.contentLens`);
    if (contentLens && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(contentLens)) {
      throw new Error(`${label}.contentLens must be a lowercase slug.`);
    }
    if (Boolean(sectionId) !== Boolean(contentLens)) {
      throw new Error(`${label}.sectionId and contentLens must be configured together.`);
    }
    const officialSource = optionalString(entry.officialSource, `${label}.officialSource`);
    const allowSubstantiveDifference = optionalBoolean(
      entry.allowSubstantiveDifference,
      `${label}.allowSubstantiveDifference`,
    );
    if ((sectionId || contentLens || officialSource) && value.version !== 2) {
      throw new Error(`${label} must use manifest version 2 for relationship or official-source fields.`);
    }
    if (officialSource && !sectionId) {
      throw new Error(`${label}.sectionId is required when officialSource is configured.`);
    }
    if (officialSource && !officialSources[officialSource]) {
      throw new Error(`${label}.officialSource references unknown profile: ${officialSource}.`);
    }

    const heroImage = optionalString(entry.heroImage, `${label}.heroImage`);
    const heroAlt = optionalString(entry.heroAlt, `${label}.heroAlt`);
    if (heroImage && !heroAlt) throw new Error(`${label}.heroAlt is required when heroImage is configured.`);
    if (heroAlt && !heroImage) throw new Error(`${label}.heroImage is required when heroAlt is configured.`);

    const output = optionalString(entry.output, `${label}.output`);
    if (output) validateManifestOutput(output, `${label}.output`);

    let requiredTags: string[] | undefined;
    if (entry.requiredTags !== undefined) {
      if (!Array.isArray(entry.requiredTags) || entry.requiredTags.length === 0) {
        throw new Error(`${label}.requiredTags must be a non-empty array.`);
      }
      requiredTags = entry.requiredTags.map((tag, tagIndex) => optionalString(tag, `${label}.requiredTags[${tagIndex}]`)!);
      const normalizedTags = requiredTags.map((tag) => tag.toLowerCase());
      if (new Set(normalizedTags).size !== normalizedTags.length) {
        throw new Error(`${label}.requiredTags contains duplicates.`);
      }
    }

    let pruneProfiles: ImportPruneProfile[] | undefined;
    if (entry.pruneProfiles !== undefined) {
      if (!Array.isArray(entry.pruneProfiles)) throw new Error(`${label}.pruneProfiles must be an array.`);
      const values = entry.pruneProfiles.map((profile) => {
        if (profile !== "community-call-to-action") {
          throw new Error(`${label}.pruneProfiles contains unsupported profile: ${String(profile)}.`);
        }
        return profile;
      });
      if (new Set(values).size !== values.length) throw new Error(`${label}.pruneProfiles contains duplicates.`);
      pruneProfiles = values;
    }

    return {
      topic: topic.trim(),
      ...(commentsDisplay ? { commentsDisplay: commentsDisplay as ImportManifestEntry["commentsDisplay"] } : {}),
      ...(heroImage ? { heroImage } : {}),
      ...(heroAlt ? { heroAlt } : {}),
      ...(pruneProfiles ? { pruneProfiles } : {}),
      ...(output ? { output } : {}),
      ...(requiredTags ? { requiredTags } : {}),
      ...(sourceMode ? { sourceMode: sourceMode as ImportSourceMode } : {}),
      ...(sectionId ? { sectionId } : {}),
      ...(contentLens ? { contentLens } : {}),
      ...(officialSource ? { officialSource } : {}),
      ...(allowSubstantiveDifference !== undefined ? { allowSubstantiveDifference } : {}),
    };
  });

  return {
    version: value.version,
    ...(Object.keys(officialSources).length ? { officialSources } : {}),
    imports,
  };
}

export async function importExistingDiscourseManifest(
  options: ImportManifestRunOptions,
): Promise<ImportedDiscourseTopic[]> {
  const docsDir = path.resolve(options.docsDir);
  const manifest = validateImportManifest(options.manifest, "import manifest runner input");
  const previews: Array<{ entry: ImportManifestEntry; result: ImportedDiscourseTopic }> = [];
  const officialSourceDocumentCache = new Map<string, Promise<string>>();

  for (const entry of manifest.imports) {
    const [result] = await importExistingDiscourseTopics({
      ...options,
      docsDir,
      topics: [entry.topic],
      commentsDisplay: entry.commentsDisplay,
      heroImage: entry.heroImage,
      heroAlt: entry.heroAlt,
      pruneProfiles: entry.pruneProfiles,
      outputFile: entry.output,
      requiredTags: entry.requiredTags,
      sourceMode: entry.sourceMode,
      sectionId: entry.sectionId,
      contentLens: entry.contentLens,
      officialSource: entry.officialSource
        ? manifest.officialSources?.[entry.officialSource]
        : undefined,
      officialSourceDocumentCache,
      allowSubstantiveDifference: entry.allowSubstantiveDifference,
      dryRun: true,
    });
    previews.push({ entry, result });
  }

  validateManifestResultPaths(previews.map(({ result }) => result), docsDir);

  if (options.dryRun) return previews.map(({ result }) => result);

  const unresolved = previews.filter(({ result }) =>
    result.officialSourceComparison === "unresolved"
  );
  if (unresolved.length) {
    throw new Error(
      `Official source comparison is unresolved for topic(s): ${
        unresolved.map(({ result }) => result.topicId).join(", ")
      }. No destination files were changed.`,
    );
  }
  const blockedDifferences = previews.filter(({ entry, result }) =>
    result.officialSourceComparison === "substantive-difference"
    && entry.allowSubstantiveDifference !== true
  );
  if (blockedDifferences.length) {
    throw new Error(
      `Official source comparison found substantive differences for topic(s): ${
        blockedDifferences.map(({ result }) => result.topicId).join(", ")
      }. Review the dry-run results before explicitly allowing any difference. No destination files were changed.`,
    );
  }

  const skipped = previews.filter(({ result }) => result.status === "skipped").map(({ result }) => result);
  const candidates = previews.filter(({ result }) => result.status !== "skipped");
  if (candidates.length === 0) return skipped;

  await fs.mkdir(path.dirname(docsDir), { recursive: true });
  const stageDir = await fs.mkdtemp(path.join(path.dirname(docsDir), ".discussionbridge-import-"));

  try {
    const staged: Array<{ result: ImportedDiscourseTopic; stagePath: string; targetPath: string }> = [];
    const targetPaths = new Set<string>();

    for (const { entry, result: previewResult } of candidates) {
      const [result] = await importExistingDiscourseTopics({
        ...options,
        docsDir: stageDir,
        topics: [entry.topic],
        commentsDisplay: entry.commentsDisplay,
        heroImage: entry.heroImage,
        heroAlt: entry.heroAlt,
        pruneProfiles: entry.pruneProfiles,
        outputFile: entry.output,
        requiredTags: entry.requiredTags,
        sourceMode: entry.sourceMode,
        sectionId: entry.sectionId,
        contentLens: entry.contentLens,
        officialSource: entry.officialSource
          ? manifest.officialSources?.[entry.officialSource]
          : undefined,
        officialSourceDocumentCache,
        allowSubstantiveDifference: entry.allowSubstantiveDifference,
        dryRun: false,
        overwrite: true,
      });
      const relative = path.relative(stageDir, result.filePath);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Manifest staging produced an unsafe file path for topic ${result.topicId}.`);
      }
      const targetPath = path.join(docsDir, relative);
      if (path.resolve(targetPath).toLowerCase() !== path.resolve(previewResult.filePath).toLowerCase()) {
        throw new Error(
          `Discourse topic ${result.topicId} resolved to a different Astro file between preview and staging. No destination files were changed.`,
        );
      }
      const targetKey = targetPath.toLowerCase();
      if (targetPaths.has(targetKey)) {
        throw new Error(`Manifest topics resolve to the same Astro file: ${targetPath}`);
      }
      targetPaths.add(targetKey);
      staged.push({
        result: {
          ...result,
          filePath: targetPath,
          reason: previewResult.reason ?? result.reason,
        },
        stagePath: result.filePath,
        targetPath,
      });
    }

    await commitStagedFiles(staged, options.overwrite === true, docsDir);
    const importedByTopic = new Map(staged.map(({ result }) => [result.topicId, result]));
    const skippedByTopic = new Map(skipped.map((result) => [result.topicId, result]));
    return manifest.imports.map((entry) => {
      const topicId = topicIdFromReference(entry.topic);
      return importedByTopic.get(topicId) ?? skippedByTopic.get(topicId)!;
    });
  } finally {
    await fs.rm(stageDir, { force: true, recursive: true });
  }
}

function validateManifestResultPaths(results: ImportedDiscourseTopic[], docsDir: string): void {
  const seen = new Set<string>();

  for (const result of results) {
    const relative = path.relative(docsDir, result.filePath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Manifest preview produced an unsafe file path for topic ${result.topicId}.`);
    }
    const targetKey = path.resolve(result.filePath).toLowerCase();
    if (seen.has(targetKey)) {
      throw new Error(`Manifest topics resolve to the same Astro file: ${result.filePath}`);
    }
    seen.add(targetKey);
  }
}

async function commitStagedFiles(
  staged: Array<{ result: ImportedDiscourseTopic; stagePath: string; targetPath: string }>,
  overwrite: boolean,
  docsDir: string,
): Promise<void> {
  for (const file of staged) {
    await assertNoSymlinkDestination(docsDir, file.targetPath, file.result.topicId);
  }
  try {
    await publishFilesAtomically(
      staged.map((file) => ({ targetPath: file.targetPath, sourcePath: file.stagePath })),
      overwrite,
    );
  } catch (error) {
    if (!overwrite && /EEXIST/.test(errorMessage(error))) {
      const target = staged.find((file) => errorMessage(error).includes(file.targetPath))?.targetPath;
      throw new Error(
        `Destination appeared after manifest preview and overwrite is disabled: ${target ?? "unknown destination"}`,
      );
    }
    throw new Error(
      `Could not commit import manifest files; destination changes were rolled back. ${errorMessage(error)}`,
    );
  }
}

function topicIdFromReference(value: string): number {
  const trimmed = value.trim();
  if (/^[1-9]\d*$/.test(trimmed)) return Number(trimmed);

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const topicIndex = parts.indexOf("t");
    const id = parts.slice(topicIndex + 1).find((part) => /^[1-9]\d*$/.test(part));
    if (topicIndex >= 0 && id) return Number(id);
  } catch {
    // Use the common validation error below.
  }

  throw new Error(`Manifest topic must be a numeric ID or Discourse topic URL: ${value}`);
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${label} must be true or false.`);
  return value;
}

function validateManifestOutput(value: string, label: string): void {
  const normalized = path.normalize(value);
  if (path.isAbsolute(value) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} must stay inside the docs directory.`);
  }
  if (!/\.md$/i.test(normalized)) {
    throw new Error(`${label} must name a .md file; automatic import does not write executable MDX.`);
  }
}

function validateOfficialSources(
  value: unknown,
  source: string,
): Record<string, OfficialSourceProfile> {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new Error(`${source}.officialSources must be a non-empty object.`);
  }
  const profiles: Record<string, OfficialSourceProfile> = {};
  for (const [name, profile] of Object.entries(value)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      throw new Error(`${source}.officialSources key must be a lowercase slug: ${name}.`);
    }
    try {
      profiles[name] = validateOfficialSourceProfile(profile);
    } catch (error) {
      throw new Error(`${source}.officialSources.${name}: ${errorMessage(error)}`);
    }
  }
  return profiles;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
