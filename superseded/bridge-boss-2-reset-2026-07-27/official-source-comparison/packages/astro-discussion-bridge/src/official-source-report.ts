import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDiscourseClient } from "./discourse/client.js";
import {
  compareOfficialSource,
  validateOfficialSourceProfile,
  type OfficialSourceComparisonOutcome,
  type OfficialSourceProfile,
} from "./official-source.js";
import {
  parseNavigationManifest,
  type DiscussionNavigationManifest,
  type NavigationNode,
} from "./navigation.js";

export interface OfficialSourceBatchReportEntry {
  topicId: number;
  postId?: number;
  sectionId: string;
  label: string;
  sourceUrl: string;
  outcome: OfficialSourceComparisonOutcome;
  citation?: string;
  sourceFormat?: "uslm" | "txt";
  sourceHash?: string;
  communityHash?: string;
  postUpdatedAt?: string;
  error?: string;
  firstDifference?: {
    tokenIndex: number;
    officialContext: string;
    communityContext: string;
  };
}

export interface OfficialSourceBatchReport {
  version: 2;
  generatedAt: string;
  mode: "comparison-only";
  writes: {
    discourse: 0;
    astroContent: 0;
  };
  discourseUrl: string;
  lens: string;
  officialSource: OfficialSourceProfile;
  inputs: {
    navigationSha256: string;
    configSha256: string;
  };
  summary: Record<OfficialSourceComparisonOutcome, number> & {
    total: number;
  };
  entries: OfficialSourceBatchReportEntry[];
}

export async function compareOfficialSourceBatch(input: {
  navigation: DiscussionNavigationManifest;
  trustedDiscourseUrl: string;
  lens: string;
  officialSource: OfficialSourceProfile;
  apiKey: string;
  apiUsername: string;
  generatedAt?: string;
  fetch?: typeof globalThis.fetch;
  onProgress?: (completed: number, total: number) => void;
  requestIntervalMs?: number;
}): Promise<OfficialSourceBatchReport> {
  const navigation = parseNavigationManifest(input.navigation);
  const trustedDiscourseUrl = normalizedBaseUrl(input.trustedDiscourseUrl);
  if (navigation.discourseUrl !== trustedDiscourseUrl) {
    throw new Error(
      `Navigation Discourse URL ${navigation.discourseUrl} does not match trusted Discourse URL ${trustedDiscourseUrl}.`,
    );
  }
  const lensKey = requiredString(input.lens, "official-source report lens");
  const lens = navigation.lenses.find((candidate) => candidate.key === lensKey);
  if (!lens) throw new Error(`Navigation lens was not found: ${lensKey}.`);
  const officialSource = validateOfficialSourceProfile(input.officialSource);
  const sections = sectionNodes(lens.nodes);
  if (!sections.length) throw new Error(`Navigation lens ${lensKey} contains no section nodes.`);
  const fetcher = createReadOnlyFetch({
    fetch: input.fetch ?? globalThis.fetch,
    requestIntervalMs: input.requestIntervalMs ?? 350,
  });
  const client = createDiscourseClient({
    discourseUrl: navigation.discourseUrl,
    apiKey: requiredString(input.apiKey, "official-source report API key"),
    apiUsername: requiredString(input.apiUsername, "official-source report API username"),
    fetch: fetcher,
  });
  const documentCache = new Map<string, Promise<string>>();
  const entries: OfficialSourceBatchReportEntry[] = [];

  for (const node of sections) {
    const sectionId = sectionIdFromLabel(node.label);
      if (!sectionId) {
      entries.push({
        topicId: node.topicId,
        sectionId: "",
        label: node.label,
        sourceUrl: node.sourceUrl,
        outcome: "unresolved",
        error: "Section node label does not begin with a recognized section number.",
      });
      input.onProgress?.(entries.length, sections.length);
      continue;
    }

    try {
      const topic = await client.topic(node.topicId);
      const firstPost = topic.post_stream.posts.find((post) => post.post_number === 1);
      if (!firstPost) throw new Error("Discourse topic does not expose a first post.");
      const post = firstPost.raw === undefined ? await client.post(firstPost.id) : firstPost;
      if (!post.raw?.trim()) throw new Error("Discourse first post does not expose raw Markdown.");
      const comparison = await compareOfficialSource({
        source: officialSource,
        sectionId,
        communityText: post.raw,
        checkedAt: input.generatedAt,
        fetch: fetcher,
        documentCache,
      });
      entries.push({
        topicId: node.topicId,
        postId: post.id,
        sectionId,
        label: node.label,
        sourceUrl: node.sourceUrl,
        outcome: comparison.metadata.comparison,
        citation: comparison.metadata.citation,
        sourceFormat: comparison.metadata.sourceFormat,
        sourceHash: comparison.metadata.sourceHash,
        communityHash: sha256(comparison.normalizedCommunityText),
        ...(typeof post.updated_at === "string" ? { postUpdatedAt: post.updated_at } : {}),
        ...(comparison.firstDifference
          ? { firstDifference: comparison.firstDifference }
          : {}),
      });
    } catch (error) {
      entries.push({
        topicId: node.topicId,
        sectionId,
        label: node.label,
        sourceUrl: node.sourceUrl,
        outcome: "unresolved",
        error: errorMessage(error),
      });
    }
    input.onProgress?.(entries.length, sections.length);
  }

  return {
    version: 2,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mode: "comparison-only",
    writes: {
      discourse: 0,
      astroContent: 0,
    },
    discourseUrl: navigation.discourseUrl,
    lens: lensKey,
    officialSource,
    inputs: {
      navigationSha256: sha256(JSON.stringify(navigation)),
      configSha256: sha256(JSON.stringify({ lens: lensKey, officialSource })),
    },
    summary: summarize(entries),
    entries,
  };
}

export async function loadOfficialSourceBatchConfig(filePath: string): Promise<{
  lens: string;
  officialSource: OfficialSourceProfile;
}> {
  const parsed = JSON.parse(await fs.readFile(path.resolve(filePath), "utf8")) as unknown;
  if (!isRecord(parsed)) throw new Error("Official-source report config must be an object.");
  const unknown = Object.keys(parsed).filter((key) => !["version", "lens", "officialSource"].includes(key));
  if (unknown.length) {
    throw new Error(`Official-source report config contains unknown field(s): ${unknown.join(", ")}.`);
  }
  if (parsed.version !== 1) throw new Error("Official-source report config must use version 1.");
  return {
    lens: requiredString(parsed.lens, "official-source report config lens"),
    officialSource: validateOfficialSourceProfile(parsed.officialSource),
  };
}

export async function loadOfficialSourceNavigation(filePath: string): Promise<DiscussionNavigationManifest> {
  return parseNavigationManifest(
    JSON.parse(await fs.readFile(path.resolve(filePath), "utf8")) as unknown,
  );
}

export async function writeOfficialSourceBatchReport(
  filePath: string,
  report: OfficialSourceBatchReport,
): Promise<string> {
  validateOfficialSourceBatchReport(report);
  if (report.mode !== "comparison-only" || report.writes.discourse !== 0 || report.writes.astroContent !== 0) {
    throw new Error("Official-source batch reports must declare zero Discourse and Astro content writes.");
  }
  if (
    report.summary.total !== report.entries.length
    || report.summary.exact !== report.entries.filter((entry) => entry.outcome === "exact").length
    || report.summary["presentation-only"]
      !== report.entries.filter((entry) => entry.outcome === "presentation-only").length
    || report.summary["substantive-difference"]
      !== report.entries.filter((entry) => entry.outcome === "substantive-difference").length
    || report.summary.unresolved !== report.entries.filter((entry) => entry.outcome === "unresolved").length
  ) {
    throw new Error("Official-source report structure or summary is inconsistent.");
  }
  const resolved = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return resolved;
}

export function validateOfficialSourceBatchReport(value: unknown): asserts value is OfficialSourceBatchReport {
  if (!isRecord(value) || value.version !== 2 || value.mode !== "comparison-only") {
    throw new Error("Official-source report must be a version 2 comparison-only report.");
  }
  if (!isRecord(value.writes) || value.writes.discourse !== 0 || value.writes.astroContent !== 0) {
    throw new Error("Official-source report must declare zero writes.");
  }
  normalizedBaseUrl(requiredString(value.discourseUrl, "report discourseUrl"));
  requiredString(value.lens, "report lens");
  validateOfficialSourceProfile(value.officialSource);
  if (
    !isRecord(value.inputs)
    || !isSha256(value.inputs.navigationSha256)
    || !isSha256(value.inputs.configSha256)
  ) throw new Error("Official-source report input hashes are invalid.");
  if (!isRecord(value.summary) || !Array.isArray(value.entries)) {
    throw new Error("Official-source report summary and entries are required.");
  }
  for (const entry of value.entries) {
    if (
      !isRecord(entry)
      || !Number.isInteger(entry.topicId)
      || (entry.postId !== undefined && !Number.isInteger(entry.postId))
      || typeof entry.sectionId !== "string"
      || typeof entry.label !== "string"
      || typeof entry.sourceUrl !== "string"
      || !["exact", "presentation-only", "substantive-difference", "unresolved"].includes(String(entry.outcome))
    ) throw new Error("Official-source report contains an invalid entry identity or outcome.");
    const sourceUrl = new URL(entry.sourceUrl);
    if (sourceUrl.protocol !== "https:") throw new Error("Official-source report entry sourceUrl must be HTTPS.");
    if (entry.communityHash !== undefined && !isSha256(entry.communityHash)) {
      throw new Error("Official-source report entry communityHash is invalid.");
    }
    if (entry.sourceHash !== undefined && !isSha256(entry.sourceHash)) {
      throw new Error("Official-source report entry sourceHash is invalid.");
    }
    if (
      entry.postUpdatedAt !== undefined
      && (typeof entry.postUpdatedAt !== "string" || Number.isNaN(Date.parse(entry.postUpdatedAt)))
    ) throw new Error("Official-source report entry postUpdatedAt is invalid.");
    if (
      entry.outcome !== "unresolved"
      && (!Number.isInteger(entry.postId) || !isSha256(entry.communityHash) || !isSha256(entry.sourceHash))
    ) throw new Error("Resolved official-source report entries require post and source integrity fields.");
  }
}

function sectionNodes(nodes: NavigationNode[]): NavigationNode[] {
  return nodes.flatMap((node) => [
    ...(node.kind === "section" ? [node] : []),
    ...sectionNodes(node.children),
  ]);
}

function sectionIdFromLabel(label: string): string | undefined {
  return label
    .match(/^\s*(?:SEC(?:TION)?\.?)\s+([A-Za-z0-9.-]+)\.?/i)?.[1]
    ?.replace(/\.$/, "");
}

function summarize(
  entries: OfficialSourceBatchReportEntry[],
): OfficialSourceBatchReport["summary"] {
  const summary: OfficialSourceBatchReport["summary"] = {
    total: entries.length,
    exact: 0,
    "presentation-only": 0,
    "substantive-difference": 0,
    unresolved: 0,
  };
  for (const entry of entries) summary[entry.outcome] += 1;
  return summary;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function createReadOnlyFetch(input: {
  fetch: typeof globalThis.fetch;
  requestIntervalMs: number;
}): typeof globalThis.fetch {
  if (!Number.isFinite(input.requestIntervalMs) || input.requestIntervalMs < 0) {
    throw new Error("official-source report requestIntervalMs must be a non-negative number.");
  }
  let previousRequestAt = 0;
  return async (resource, init) => {
    const method = init?.method ?? "GET";
    if (method.toUpperCase() !== "GET") {
      throw new Error(`Official-source report blocked non-GET request method: ${method}.`);
    }
    for (let attempt = 0; attempt <= 3; attempt += 1) {
      const elapsed = Date.now() - previousRequestAt;
      const remaining = input.requestIntervalMs - elapsed;
      if (remaining > 0) await delay(remaining);
      previousRequestAt = Date.now();
      const headers = new Headers(init?.headers);
      const response = await input.fetch(
        resource,
        headers.has("Api-Key") ? { ...init, redirect: "error" } : init,
      );
      if (response.status !== 429 || attempt === 3) return response;
      const retryAfter = retryAfterMilliseconds(response.headers.get("retry-after"));
      await releaseResponseBody(response);
      await delay(retryAfter);
    }
    throw new Error("Official-source report exhausted its bounded read retry loop.");
  };
}

async function releaseResponseBody(response: Response): Promise<void> {
  try {
    if (response.body) {
      await Promise.race([response.body.cancel(), delay(50)]);
    }
  } catch {
    // A custom fetch body cannot make the bounded retry path hang.
  }
}

function normalizedBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Trusted Discourse URL must be an absolute HTTPS URL: ${value}.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(`Trusted Discourse URL must be an absolute HTTPS URL without credentials, query, or fragment: ${value}.`);
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.href;
}

function retryAfterMilliseconds(value: string | null): number {
  if (!value) return 1_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(30_000, Math.max(250, Math.ceil(seconds * 1_000)));
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) return 1_000;
  return Math.min(30_000, Math.max(250, date - Date.now()));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
