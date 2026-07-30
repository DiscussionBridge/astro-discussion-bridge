import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createDiscourseClient } from "./discourse/client.js";

export const IMPACT_PLACEHOLDER_NORMALIZATION_VERSION = "impact-placeholder-v1";

export type ImpactPopulationOutcome =
  | "placeholder-suppressed"
  | "publication-candidate"
  | "review-required";

export interface ImpactPlaceholderSnapshot {
  version: 1;
  normalizationVersion: typeof IMPACT_PLACEHOLDER_NORMALIZATION_VERSION;
  sectionId: string;
  topicId: number;
  postId: number;
  topicUrl: string;
  capturedAt: string;
  normalizedContent: string;
  normalizedContentSha256: string;
}

export interface ImpactPopulationCandidate {
  sectionId: string;
  topicId: number;
  postId: number;
  sourceUrl: string;
  rawContent: string;
  postUpdatedAt?: string;
  reviewedPublication?: {
    communitySha256: string;
    astroUrl: string;
  };
  existingAstroUrl?: string;
}

export interface ImpactPopulationSource {
  sectionId: string;
  topicId: number;
  sourceUrl: string;
  reviewedPublication?: ImpactPopulationCandidate["reviewedPublication"];
  existingAstroUrl?: string;
}

export interface ImpactPopulationReadConfig {
  version: 1;
  discourseUrl: string;
  placeholder: ImpactPlaceholderSnapshot;
  sources: ImpactPopulationSource[];
}

export interface ImpactPopulationReportEntry {
  sectionId: string;
  topicId: number;
  postId: number;
  sourceUrl: string;
  communitySha256: string;
  postUpdatedAt?: string;
  outcome: ImpactPopulationOutcome;
  publishAstroImpactPage: boolean;
  relationshipTarget: string;
  relationshipLabel: "Forum impact discussion" | "Impact analysis";
  existingAstroUrl?: string;
  driftReviewRequired?: boolean;
  reason: string;
}

export interface ImpactPopulationDryRunReport {
  version: 1;
  generatedAt: string;
  mode: "population-dry-run";
  writes: {
    discourse: 0;
    astroContent: 0;
  };
  placeholder: ImpactPlaceholderSnapshot;
  inputs: {
    snapshotSha256: string;
    /** External commitment to the reviewed candidate inputs; raw content is intentionally absent from the report. */
    candidatesSha256: string;
  };
  summary: Record<ImpactPopulationOutcome, number> & {
    total: number;
  };
  entries: ImpactPopulationReportEntry[];
}

export function createImpactPlaceholderSnapshot(input: {
  sectionId: string;
  topicId: number;
  postId: number;
  topicUrl: string;
  capturedAt: string;
  rawContent: string;
}): ImpactPlaceholderSnapshot {
  const normalizedContent = normalizeImpactPlaceholderContent(input.rawContent);
  if (!normalizedContent) throw new Error("Impact placeholder content must not be empty.");
  return validateImpactPlaceholderSnapshot({
    version: 1,
    normalizationVersion: IMPACT_PLACEHOLDER_NORMALIZATION_VERSION,
    sectionId: validateSectionId(input.sectionId),
    topicId: validatePositiveInteger(input.topicId, "placeholder topicId"),
    postId: validatePositiveInteger(input.postId, "placeholder postId"),
    topicUrl: validateHttpsUrl(input.topicUrl, "placeholder topicUrl"),
    capturedAt: validateTimestamp(input.capturedAt, "placeholder capturedAt"),
    normalizedContent,
    normalizedContentSha256: sha256(normalizedContent),
  });
}

export function normalizeImpactPlaceholderContent(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function classifyImpactPopulationCandidate(input: {
  placeholder: ImpactPlaceholderSnapshot;
  candidate: ImpactPopulationCandidate;
}): ImpactPopulationReportEntry {
  const placeholder = validateImpactPlaceholderSnapshot(input.placeholder);
  const candidate = validateCandidate(input.candidate);
  const communitySha256 = sha256(normalizeImpactPlaceholderContent(candidate.rawContent));
  const placeholderMatch = communitySha256 === placeholder.normalizedContentSha256;
  const reviewedMatch = candidate.reviewedPublication?.communitySha256.toLowerCase() === communitySha256;

  if (placeholderMatch) {
    return {
      ...entryIdentity(candidate, communitySha256),
      outcome: "placeholder-suppressed",
      publishAstroImpactPage: false,
      relationshipTarget: candidate.sourceUrl,
      relationshipLabel: "Forum impact discussion",
      ...(candidate.existingAstroUrl
        ? { existingAstroUrl: candidate.existingAstroUrl, driftReviewRequired: true }
        : {}),
      reason: candidate.existingAstroUrl
        ? "Source matches the frozen placeholder but an Astro page already exists; preserve it and require drift review."
        : "Source matches the frozen placeholder; suppress Astro publication while retaining the forum relationship.",
    };
  }

  if (candidate.reviewedPublication && reviewedMatch) {
    return {
      ...entryIdentity(candidate, communitySha256),
      outcome: "publication-candidate",
      publishAstroImpactPage: true,
      relationshipTarget: candidate.reviewedPublication.astroUrl,
      relationshipLabel: "Impact analysis",
      ...(candidate.existingAstroUrl ? { existingAstroUrl: candidate.existingAstroUrl } : {}),
      reason: "The exact current source hash has an explicit reviewed publication disposition.",
    };
  }

  return {
    ...entryIdentity(candidate, communitySha256),
    outcome: "review-required",
    publishAstroImpactPage: false,
    relationshipTarget: candidate.sourceUrl,
    relationshipLabel: "Forum impact discussion",
    ...(candidate.existingAstroUrl
      ? { existingAstroUrl: candidate.existingAstroUrl, driftReviewRequired: true }
      : {}),
    reason: candidate.reviewedPublication
      ? "The source changed after publication review; the pinned reviewed hash no longer matches."
      : "The source does not exactly match the frozen placeholder and has no hash-pinned publication review.",
  };
}

export function buildImpactPopulationDryRun(input: {
  placeholder: ImpactPlaceholderSnapshot;
  candidates: ImpactPopulationCandidate[];
  generatedAt?: string;
}): ImpactPopulationDryRunReport {
  const placeholder = validateImpactPlaceholderSnapshot(input.placeholder);
  if (!Array.isArray(input.candidates) || input.candidates.length === 0) {
    throw new Error("Impact population dry run requires at least one candidate.");
  }
  const candidates = input.candidates.map(validateCandidate);
  assertUniqueCandidates(candidates);
  const entries = candidates.map((candidate) =>
    classifyImpactPopulationCandidate({ placeholder, candidate })
  );
  return {
    version: 1,
    generatedAt: validateTimestamp(input.generatedAt ?? new Date().toISOString(), "generatedAt"),
    mode: "population-dry-run",
    writes: { discourse: 0, astroContent: 0 },
    placeholder,
    inputs: {
      snapshotSha256: sha256(JSON.stringify(placeholder)),
      candidatesSha256: sha256(JSON.stringify(candidates)),
    },
    summary: summarize(entries),
    entries,
  };
}

export async function loadImpactPopulationReadConfig(filePath: string): Promise<ImpactPopulationReadConfig> {
  const parsed = JSON.parse(await fs.readFile(path.resolve(filePath), "utf8")) as unknown;
  return validateImpactPopulationReadConfig(parsed);
}

export function validateImpactPopulationReadConfig(parsed: unknown): ImpactPopulationReadConfig {
  if (!isRecord(parsed)) throw new Error("Impact population config must be an object.");
  const unknown = Object.keys(parsed).filter((key) =>
    !["version", "discourseUrl", "placeholder", "sources"].includes(key)
  );
  if (unknown.length) throw new Error(`Impact population config contains unknown field(s): ${unknown.join(", ")}.`);
  if (parsed.version !== 1) throw new Error("Impact population config must use version 1.");
  const discourseUrl = normalizedBaseUrl(parsed.discourseUrl);
  const placeholder = validateImpactPlaceholderSnapshot(parsed.placeholder);
  if (!Array.isArray(parsed.sources) || !parsed.sources.length) {
    throw new Error("Impact population config requires a non-empty sources array.");
  }
  const sources = parsed.sources.map((source, index) => validateSource(source, `sources[${index}]`));
  assertUniqueSources(sources);
  for (const source of sources) assertTrustedSourceUrl(source.sourceUrl, discourseUrl);
  assertTrustedSourceUrl(placeholder.topicUrl, discourseUrl);
  const placeholderSource = sources.find((source) => source.topicId === placeholder.topicId);
  if (!placeholderSource || placeholderSource.sectionId !== placeholder.sectionId) {
    throw new Error("Impact population sources must contain the frozen placeholder topic and section identity.");
  }
  return { version: 1, discourseUrl, placeholder, sources };
}

export async function collectImpactPopulationDryRun(input: {
  config: ImpactPopulationReadConfig;
  trustedDiscourseUrl: string;
  apiKey: string;
  apiUsername: string;
  generatedAt?: string;
  fetch?: typeof globalThis.fetch;
  requestIntervalMs?: number;
  onProgress?: (completed: number, total: number, source: ImpactPopulationSource) => void;
  onRateLimit?: (waitMilliseconds: number, retryAttempt: number) => void;
}): Promise<ImpactPopulationDryRunReport> {
  const config = validateImpactPopulationReadConfig(input.config);
  const trusted = normalizedBaseUrl(input.trustedDiscourseUrl);
  if (config.discourseUrl !== trusted) {
    throw new Error(`Impact config Discourse URL ${config.discourseUrl} does not match trusted URL ${trusted}.`);
  }
  const client = createDiscourseClient({
    discourseUrl: trusted,
    apiKey: requiredString(input.apiKey, "Impact read API key"),
    apiUsername: requiredString(input.apiUsername, "Impact read API username"),
    fetch: createImpactReadOnlyFetch({
      fetch: input.fetch ?? globalThis.fetch,
      requestIntervalMs: input.requestIntervalMs ?? 350,
      onRateLimit: input.onRateLimit,
    }),
  });
  const candidates: ImpactPopulationCandidate[] = [];
  for (const source of config.sources) {
    const topic = await client.topic(source.topicId);
    const first = topic.post_stream.posts.find((post) => post.post_number === 1);
    if (!first) throw new Error(`Impact topic ${source.topicId} does not expose a first post.`);
    const post = first.raw === undefined ? await client.post(first.id) : first;
    if (!post.raw?.trim()) throw new Error(`Impact topic ${source.topicId} does not expose raw Markdown.`);
    if (source.topicId === config.placeholder.topicId && post.id !== config.placeholder.postId) {
      throw new Error(
        `Frozen Impact placeholder expected first post ${config.placeholder.postId}, but topic ${source.topicId} returned ${post.id}.`,
      );
    }
    candidates.push({
      sectionId: source.sectionId,
      topicId: source.topicId,
      postId: post.id,
      sourceUrl: source.sourceUrl,
      rawContent: post.raw,
      ...(typeof post.updated_at === "string" ? { postUpdatedAt: post.updated_at } : {}),
      ...(source.reviewedPublication ? { reviewedPublication: source.reviewedPublication } : {}),
      ...(source.existingAstroUrl ? { existingAstroUrl: source.existingAstroUrl } : {}),
    });
    input.onProgress?.(candidates.length, config.sources.length, source);
  }
  return buildImpactPopulationDryRun({
    placeholder: config.placeholder,
    candidates,
    generatedAt: input.generatedAt,
  });
}

export async function preflightImpactPopulationAccess(input: {
  config: ImpactPopulationReadConfig;
  trustedDiscourseUrl: string;
  apiKey: string;
  apiUsername: string;
  generatedAt?: string;
  fetch?: typeof globalThis.fetch;
  requestIntervalMs?: number;
  onRateLimit?: (waitMilliseconds: number, retryAttempt: number) => void;
}): Promise<ImpactPopulationDryRunReport> {
  const config = validateImpactPopulationReadConfig(input.config);
  const source = config.sources.find((candidate) =>
    candidate.topicId === config.placeholder.topicId
    && candidate.sectionId === config.placeholder.sectionId
  );
  if (!source) throw new Error("Impact preflight could not resolve the frozen placeholder source.");
  return collectImpactPopulationDryRun({
    ...input,
    config: { ...config, sources: [source] },
  });
}

export async function writeImpactPopulationDryRunReport(
  filePath: string,
  report: ImpactPopulationDryRunReport,
): Promise<string> {
  validateImpactPopulationDryRunReport(report);
  const resolved = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return resolved;
}

export function validateImpactPlaceholderSnapshot(
  value: ImpactPlaceholderSnapshot,
): ImpactPlaceholderSnapshot {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("Impact placeholder snapshot must use version 1.");
  }
  if (value.normalizationVersion !== IMPACT_PLACEHOLDER_NORMALIZATION_VERSION) {
    throw new Error(`Unsupported Impact placeholder normalization version: ${String(value.normalizationVersion)}.`);
  }
  const normalizedContent = requiredString(value.normalizedContent, "placeholder normalizedContent");
  const normalizedAgain = normalizeImpactPlaceholderContent(normalizedContent);
  if (normalizedAgain !== normalizedContent) {
    throw new Error("Impact placeholder normalizedContent is not canonical.");
  }
  const expectedHash = sha256(normalizedContent);
  if (value.normalizedContentSha256 !== expectedHash) {
    throw new Error("Impact placeholder normalizedContentSha256 does not match its content.");
  }
  return {
    version: 1,
    normalizationVersion: IMPACT_PLACEHOLDER_NORMALIZATION_VERSION,
    sectionId: validateSectionId(value.sectionId),
    topicId: validatePositiveInteger(value.topicId, "placeholder topicId"),
    postId: validatePositiveInteger(value.postId, "placeholder postId"),
    topicUrl: validateHttpsUrl(value.topicUrl, "placeholder topicUrl"),
    capturedAt: validateTimestamp(value.capturedAt, "placeholder capturedAt"),
    normalizedContent,
    normalizedContentSha256: expectedHash,
  };
}

export function validateImpactPopulationDryRunReport(
  value: ImpactPopulationDryRunReport,
): void {
  if (!isRecord(value) || value.version !== 1 || value.mode !== "population-dry-run") {
    throw new Error("Impact population report must be a version 1 population dry run.");
  }
  if (!isRecord(value.writes) || value.writes.discourse !== 0 || value.writes.astroContent !== 0) {
    throw new Error("Impact population dry run must declare zero writes.");
  }
  validateTimestamp(value.generatedAt, "report generatedAt");
  const placeholder = validateImpactPlaceholderSnapshot(value.placeholder);
  if (!isRecord(value.inputs) || !isSha256(value.inputs.snapshotSha256) || !isSha256(value.inputs.candidatesSha256)) {
    throw new Error("Impact population report input hashes are invalid.");
  }
  if (value.inputs.snapshotSha256 !== sha256(JSON.stringify(placeholder))) {
    throw new Error("Impact population report snapshotSha256 does not match its embedded placeholder.");
  }
  if (!Array.isArray(value.entries) || !isRecord(value.summary)) {
    throw new Error("Impact population report entries and summary are required.");
  }
  const expected = summarize(value.entries as ImpactPopulationReportEntry[]);
  for (const key of ["total", "placeholder-suppressed", "publication-candidate", "review-required"] as const) {
    if (value.summary[key] !== expected[key]) {
      throw new Error("Impact population report summary is inconsistent.");
    }
  }
  for (const entry of value.entries) validateReportEntry(entry);
  assertUniqueReportEntries(value.entries);
}

function entryIdentity(
  candidate: ReturnType<typeof validateCandidate>,
  communitySha256: string,
): Pick<
  ImpactPopulationReportEntry,
  "sectionId" | "topicId" | "postId" | "sourceUrl" | "communitySha256" | "postUpdatedAt"
> {
  return {
    sectionId: candidate.sectionId,
    topicId: candidate.topicId,
    postId: candidate.postId,
    sourceUrl: candidate.sourceUrl,
    communitySha256,
    ...(candidate.postUpdatedAt ? { postUpdatedAt: candidate.postUpdatedAt } : {}),
  };
}

function validateCandidate(value: ImpactPopulationCandidate): ImpactPopulationCandidate {
  if (!isRecord(value)) throw new Error("Impact population candidate must be an object.");
  const reviewedPublication = value.reviewedPublication;
  if (reviewedPublication !== undefined) {
    if (
      !isRecord(reviewedPublication)
      || !isSha256(reviewedPublication.communitySha256)
    ) throw new Error("Reviewed Impact publication requires a SHA-256 community hash.");
    validateHttpsOrRootRelativeUrl(reviewedPublication.astroUrl, "reviewed publication astroUrl");
  }
  return {
    sectionId: validateSectionId(value.sectionId),
    topicId: validatePositiveInteger(value.topicId, "candidate topicId"),
    postId: validatePositiveInteger(value.postId, "candidate postId"),
    sourceUrl: validateHttpsUrl(value.sourceUrl, "candidate sourceUrl"),
    rawContent: requiredString(value.rawContent, "candidate rawContent"),
    ...(value.postUpdatedAt
      ? { postUpdatedAt: validateTimestamp(value.postUpdatedAt, "candidate postUpdatedAt") }
      : {}),
    ...(reviewedPublication
      ? {
          reviewedPublication: {
            communitySha256: reviewedPublication.communitySha256.toLowerCase(),
            astroUrl: reviewedPublication.astroUrl,
          },
        }
      : {}),
    ...(value.existingAstroUrl
      ? { existingAstroUrl: validateHttpsOrRootRelativeUrl(value.existingAstroUrl, "candidate existingAstroUrl") }
      : {}),
  };
}

function validateReportEntry(value: unknown): void {
  if (!isRecord(value)) throw new Error("Impact population report entry must be an object.");
  validateSectionId(value.sectionId);
  validatePositiveInteger(value.topicId, "report entry topicId");
  validatePositiveInteger(value.postId, "report entry postId");
  validateHttpsUrl(value.sourceUrl, "report entry sourceUrl");
  if (!isSha256(value.communitySha256)) throw new Error("Impact population report entry hash is invalid.");
  if (!["placeholder-suppressed", "publication-candidate", "review-required"].includes(String(value.outcome))) {
    throw new Error("Impact population report entry outcome is invalid.");
  }
  const publish = value.publishAstroImpactPage === true;
  if (publish !== (value.outcome === "publication-candidate")) {
    throw new Error("Only publication-candidate entries may publish an Astro Impact page.");
  }
  if (value.outcome === "publication-candidate") {
    validateHttpsOrRootRelativeUrl(value.relationshipTarget, "report entry relationshipTarget");
    if (value.relationshipLabel !== "Impact analysis") {
      throw new Error("Publication candidates must use the Impact analysis relationship label.");
    }
  } else {
    validateHttpsUrl(value.relationshipTarget, "report entry relationshipTarget");
    if (value.relationshipLabel !== "Forum impact discussion") {
      throw new Error("Suppressed/review entries must be labeled as forum discussion.");
    }
  }
  requiredString(value.reason, "report entry reason");
}

function assertUniqueCandidates(candidates: ImpactPopulationCandidate[]): void {
  const topicIds = new Set<number>();
  const sectionIds = new Set<string>();
  for (const candidate of candidates) {
    if (topicIds.has(candidate.topicId)) {
      throw new Error(`Impact population candidates contain duplicate topic ID ${candidate.topicId}.`);
    }
    if (sectionIds.has(candidate.sectionId)) {
      throw new Error(`Impact population candidates contain duplicate section ID ${candidate.sectionId}.`);
    }
    topicIds.add(candidate.topicId);
    sectionIds.add(candidate.sectionId);
  }
}

function validateSource(value: unknown, label: string): ImpactPopulationSource {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const unknown = Object.keys(value).filter((key) =>
    !["sectionId", "topicId", "sourceUrl", "reviewedPublication", "existingAstroUrl"].includes(key)
  );
  if (unknown.length) throw new Error(`${label} contains unknown field(s): ${unknown.join(", ")}.`);
  const candidate = validateCandidate({
    sectionId: value.sectionId,
    topicId: value.topicId,
    postId: 1,
    sourceUrl: value.sourceUrl,
    rawContent: "config-validation",
    reviewedPublication: value.reviewedPublication,
    existingAstroUrl: value.existingAstroUrl,
  });
  return {
    sectionId: candidate.sectionId,
    topicId: candidate.topicId,
    sourceUrl: candidate.sourceUrl,
    ...(candidate.reviewedPublication ? { reviewedPublication: candidate.reviewedPublication } : {}),
    ...(candidate.existingAstroUrl ? { existingAstroUrl: candidate.existingAstroUrl } : {}),
  };
}

function assertUniqueSources(sources: ImpactPopulationSource[]): void {
  assertUniqueCandidates(sources.map((source) => ({
    ...source,
    postId: 1,
    rawContent: "config-validation",
  })));
}

function assertUniqueReportEntries(entries: ImpactPopulationReportEntry[]): void {
  const topicIds = new Set<number>();
  const sectionIds = new Set<string>();
  for (const entry of entries) {
    if (topicIds.has(entry.topicId)) {
      throw new Error(`Impact population report contains duplicate topic ID ${entry.topicId}.`);
    }
    if (sectionIds.has(entry.sectionId)) {
      throw new Error(`Impact population report contains duplicate section ID ${entry.sectionId}.`);
    }
    topicIds.add(entry.topicId);
    sectionIds.add(entry.sectionId);
  }
}

function summarize(entries: ImpactPopulationReportEntry[]): ImpactPopulationDryRunReport["summary"] {
  const summary: ImpactPopulationDryRunReport["summary"] = {
    total: entries.length,
    "placeholder-suppressed": 0,
    "publication-candidate": 0,
    "review-required": 0,
  };
  for (const entry of entries) summary[entry.outcome] += 1;
  return summary;
}

function validateSectionId(value: unknown): string {
  const sectionId = requiredString(value, "sectionId");
  if (!/^[A-Za-z0-9.-]+$/.test(sectionId)) throw new Error(`Invalid sectionId: ${sectionId}.`);
  return sectionId;
}

function validatePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`${label} must be a positive integer.`);
  return Number(value);
}

function validateTimestamp(value: unknown, label: string): string {
  const timestamp = requiredString(value, label);
  if (Number.isNaN(Date.parse(timestamp))) throw new Error(`${label} must be an ISO-compatible timestamp.`);
  return timestamp;
}

function validateHttpsUrl(value: unknown, label: string): string {
  const text = requiredString(value, label);
  const url = new URL(text);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${label} must be an HTTPS URL without credentials.`);
  }
  return url.href;
}

function validateHttpsOrRootRelativeUrl(value: unknown, label: string): string {
  const text = requiredString(value, label);
  if (text.startsWith("/")) {
    if (text.startsWith("//")) throw new Error(`${label} must not be protocol-relative.`);
    return text;
  }
  return validateHttpsUrl(text, label);
}

function normalizedBaseUrl(value: unknown): string {
  const url = new URL(requiredString(value, "Discourse URL"));
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Discourse URL must be absolute HTTPS without credentials, query, or fragment.");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.href;
}

function assertTrustedSourceUrl(value: string, trustedBase: string): void {
  const source = new URL(value);
  const trusted = new URL(trustedBase);
  if (source.origin !== trusted.origin || !source.pathname.startsWith(trusted.pathname)) {
    throw new Error(`Impact source URL is outside trusted Discourse authority: ${value}.`);
  }
}

function createImpactReadOnlyFetch(input: {
  fetch: typeof globalThis.fetch;
  requestIntervalMs: number;
  onRateLimit?: (waitMilliseconds: number, retryAttempt: number) => void;
}): typeof globalThis.fetch {
  if (!Number.isFinite(input.requestIntervalMs) || input.requestIntervalMs < 0) {
    throw new Error("Impact population requestIntervalMs must be a non-negative number.");
  }
  let previousRequestAt = 0;
  return async (resource, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") throw new Error(`Impact population collector blocked non-GET method: ${method}.`);
    for (let attempt = 0; attempt <= 3; attempt += 1) {
      const remaining = input.requestIntervalMs - (Date.now() - previousRequestAt);
      if (remaining > 0) await delay(remaining);
      previousRequestAt = Date.now();
      const response = await input.fetch(resource, { ...init, redirect: "error" });
      if (response.status !== 429 || attempt === 3) return response;
      const retryAfter = await retryAfterMilliseconds(response);
      input.onRateLimit?.(retryAfter, attempt + 1);
      await releaseResponseBody(response);
      await delay(retryAfter);
    }
    throw new Error("Impact population collector exhausted its bounded retry loop.");
  };
}

async function releaseResponseBody(response: Response): Promise<void> {
  try {
    if (response.body) await Promise.race([response.body.cancel(), delay(50)]);
  } catch {
    // Custom response bodies cannot make the bounded retry path hang.
  }
}

async function retryAfterMilliseconds(response: Response): Promise<number> {
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return boundedRetryMilliseconds(seconds * 1_000);
    }
    const date = Date.parse(value);
    if (!Number.isNaN(date)) return boundedRetryMilliseconds(date - Date.now());
  }
  try {
    const body = await Promise.race([
      response.clone().json(),
      delay(100).then(() => undefined),
    ]) as unknown;
    if (isRecord(body) && isRecord(body.extras)) {
      const waitSeconds = Number(body.extras.wait_seconds);
      if (Number.isFinite(waitSeconds) && waitSeconds >= 0) {
        return boundedRetryMilliseconds(waitSeconds * 1_000);
      }
    }
  } catch {
    // Malformed/custom bodies fall back to a bounded one-second retry.
  }
  return 1_000;
}

function boundedRetryMilliseconds(value: number): number {
  return Math.min(60_000, Math.max(250, Math.ceil(value)));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
