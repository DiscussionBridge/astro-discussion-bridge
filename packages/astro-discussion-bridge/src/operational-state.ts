import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { lock } from "proper-lockfile";

const STATE_VERSION = 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicationOutcome = "pending" | "created" | "resolved" | "retryable_failure" | "rejected" | "reconciliation_required";

export interface PublicationOperation {
  externalId: string;
  canonicalUrl: string;
  correlationId: string;
  attempts: number;
  outcome: PublicationOutcome;
  retryable: boolean;
  reconciliationRequired: boolean;
  lastAttemptAt: string;
  lastError?: string;
  resourceId?: string;
  topicId?: number;
  topicUrl?: string;
  lastSuccessAt?: string;
  sourceRevision?: string;
  sourceRevisionSequence?: number;
  sourceCreatedAt?: string;
  sourceUpdatedAt?: string;
  sourceContentBytes?: number;
  sourceContentSha256?: string;
}

export interface PublicationOperationalState {
  schemaVersion: 2;
  adapterId: "astro-discussion-bridge";
  operations: Record<string, PublicationOperation>;
}

export async function readPublicationOperationalState(filePath: string): Promise<PublicationOperationalState> {
  let value: unknown;
  try {
    value = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
  return validateState(value);
}

export async function writePublicationOperationalState(filePath: string, state: PublicationOperationalState): Promise<void> {
  const validated = validateState(state);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, filePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function withPublicationOperationalStateLock<T>(
  filePath: string,
  action: () => Promise<T>,
  options: { staleMs?: number; updateMs?: number } = {},
): Promise<T> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lock(filePath, {
      realpath: false,
      retries: 0,
      stale: options.staleMs ?? 30_000,
      update: options.updateMs ?? 10_000,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOCKED") {
      throw new Error(`DiscussionBridge publication state is already in use: ${filePath}`);
    }
    throw error;
  }
  try {
    return await action();
  } finally {
    await release();
  }
}

export function beginPublicationAttempt(
  state: PublicationOperationalState,
  identity: {
    externalId: string;
    canonicalUrl: string;
    revision?: {
      sourceRevision: string;
      sourceCreatedAt: string;
      sourceUpdatedAt: string;
      sourceContentBytes: number;
      sourceContentSha256: string;
    };
  },
  now = new Date(),
): PublicationOperation {
  const prior = state.operations[identity.externalId];
  if (prior && prior.canonicalUrl !== identity.canonicalUrl) throw new Error("DiscussionBridge operational state contains a canonical identity collision.");
  const revision = resolveRevision(prior, identity.revision);
  const operation: PublicationOperation = {
    ...prior,
    externalId: identity.externalId,
    canonicalUrl: identity.canonicalUrl,
    correlationId: prior?.correlationId ?? randomUUID(),
    attempts: (prior?.attempts ?? 0) + 1,
    outcome: "pending",
    retryable: false,
    reconciliationRequired: false,
    lastAttemptAt: now.toISOString(),
    ...revision,
  };
  delete operation.lastError;
  state.operations[identity.externalId] = operation;
  return operation;
}

export function completePublicationAttempt(operation: PublicationOperation, result: { outcome: "created" | "resolved"; resourceId: string; topicId: number; topicUrl: string }, now = new Date()): void {
  operation.outcome = result.outcome;
  operation.retryable = false;
  operation.reconciliationRequired = false;
  operation.resourceId = result.resourceId;
  operation.topicId = result.topicId;
  operation.topicUrl = result.topicUrl;
  operation.lastSuccessAt = now.toISOString();
  delete operation.lastError;
}

export function stagePublicationResult(operation: PublicationOperation, result: { outcome: "created" | "resolved"; resourceId: string; topicId: number; topicUrl: string }): void {
  operation.outcome = "pending";
  operation.retryable = true;
  operation.reconciliationRequired = true;
  operation.resourceId = result.resourceId;
  operation.topicId = result.topicId;
  operation.topicUrl = result.topicUrl;
  operation.lastError = "Receiver accepted the publication; platform binding commit is pending.";
  delete operation.lastSuccessAt;
}

export function failPublicationAttempt(operation: PublicationOperation, error: unknown, classification: { retryable: boolean; reconciliationRequired: boolean }): void {
  operation.outcome = classification.reconciliationRequired ? "reconciliation_required" : classification.retryable ? "retryable_failure" : "rejected";
  operation.retryable = classification.retryable;
  operation.reconciliationRequired = classification.reconciliationRequired;
  operation.lastError = boundedError(error);
}

export function summarizePublicationOperationalState(state: PublicationOperationalState): {
  operations: number;
  pending: number;
  healthy: number;
  retryable: number;
  reconciliationRequired: number;
  rejected: number;
} {
  validateState(state);
  const summary = { operations: 0, pending: 0, healthy: 0, retryable: 0, reconciliationRequired: 0, rejected: 0 };
  for (const operation of Object.values(state.operations)) {
    summary.operations++;
    if (operation.outcome === "pending") summary.pending++;
    if (operation.outcome === "created" || operation.outcome === "resolved") summary.healthy++;
    if (operation.retryable) summary.retryable++;
    if (operation.reconciliationRequired) summary.reconciliationRequired++;
    if (operation.outcome === "rejected") summary.rejected++;
  }
  return summary;
}

function emptyState(): PublicationOperationalState {
  return { schemaVersion: STATE_VERSION, adapterId: "astro-discussion-bridge", operations: {} };
}

function validateState(value: unknown): PublicationOperationalState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DiscussionBridge operational state is invalid.");
  const candidate = value as {
    schemaVersion?: number;
    adapterId?: unknown;
    operations?: unknown;
  };
  if ((candidate.schemaVersion !== 1 && candidate.schemaVersion !== STATE_VERSION) || candidate.adapterId !== "astro-discussion-bridge" || !candidate.operations || typeof candidate.operations !== "object" || Array.isArray(candidate.operations)) throw new Error("DiscussionBridge operational state is invalid.");
  for (const [key, operation] of Object.entries(candidate.operations)) validateOperation(key, operation);
  return {
    schemaVersion: STATE_VERSION,
    adapterId: "astro-discussion-bridge",
    operations: candidate.operations as Record<string, PublicationOperation>,
  };
}

function validateOperation(key: string, value: unknown): asserts value is PublicationOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DiscussionBridge operational state entry is invalid.");
  const operation = value as Partial<PublicationOperation>;
  if (key !== operation.externalId || typeof operation.canonicalUrl !== "string" || !UUID.test(operation.correlationId ?? "") || !Number.isSafeInteger(operation.attempts) || Number(operation.attempts) < 1 || !["pending", "created", "resolved", "retryable_failure", "rejected", "reconciliation_required"].includes(operation.outcome ?? "") || typeof operation.retryable !== "boolean" || typeof operation.reconciliationRequired !== "boolean" || !validDate(operation.lastAttemptAt) || (operation.lastSuccessAt !== undefined && !validDate(operation.lastSuccessAt))) throw new Error("DiscussionBridge operational state entry is invalid.");
  for (const text of [operation.externalId, operation.canonicalUrl, operation.lastError, operation.resourceId, operation.topicUrl]) {
    if (text !== undefined && (typeof text !== "string" || /[\u0000-\u001f\u007f]/u.test(text))) throw new Error("DiscussionBridge operational state entry is invalid.");
  }
  if (operation.resourceId !== undefined && !UUID.test(operation.resourceId)) throw new Error("DiscussionBridge operational state entry is invalid.");
  if (operation.topicId !== undefined && (!Number.isSafeInteger(operation.topicId) || operation.topicId < 1)) throw new Error("DiscussionBridge operational state entry is invalid.");
  const revisionFields = [
    operation.sourceRevision,
    operation.sourceRevisionSequence,
    operation.sourceCreatedAt,
    operation.sourceUpdatedAt,
    operation.sourceContentBytes,
    operation.sourceContentSha256,
  ];
  if (revisionFields.some((field) => field !== undefined)) {
    if (
      typeof operation.sourceRevision !== "string"
      || !/^astro-sha256:[a-f0-9]{64}$/.test(operation.sourceRevision)
      || !Number.isSafeInteger(operation.sourceRevisionSequence)
      || Number(operation.sourceRevisionSequence) < 1
      || !validDate(operation.sourceCreatedAt)
      || !validDate(operation.sourceUpdatedAt)
      || Date.parse(operation.sourceUpdatedAt) < Date.parse(operation.sourceCreatedAt)
      || !Number.isSafeInteger(operation.sourceContentBytes)
      || Number(operation.sourceContentBytes) < 0
      || Number(operation.sourceContentBytes) > 16 * 1024 * 1024
      || typeof operation.sourceContentSha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(operation.sourceContentSha256)
    ) throw new Error("DiscussionBridge operational revision state is invalid.");
  }
}

function resolveRevision(
  prior: PublicationOperation | undefined,
  incoming: {
    sourceRevision: string;
    sourceCreatedAt: string;
    sourceUpdatedAt: string;
    sourceContentBytes: number;
    sourceContentSha256: string;
  } | undefined,
): Partial<PublicationOperation> {
  if (!incoming) return {};
  if (!/^astro-sha256:[a-f0-9]{64}$/.test(incoming.sourceRevision)) {
    throw new Error("DiscussionBridge source revision is invalid.");
  }
  if (!validDate(incoming.sourceCreatedAt) || !validDate(incoming.sourceUpdatedAt)) {
    throw new Error("DiscussionBridge source timestamps are invalid.");
  }
  if (Date.parse(incoming.sourceUpdatedAt) < Date.parse(incoming.sourceCreatedAt)) {
    throw new Error("DiscussionBridge source update time precedes source creation.");
  }
  if (!Number.isSafeInteger(incoming.sourceContentBytes) || incoming.sourceContentBytes < 0 || incoming.sourceContentBytes > 16 * 1024 * 1024) {
    throw new Error("DiscussionBridge complete source content size is invalid.");
  }
  if (!/^[a-f0-9]{64}$/.test(incoming.sourceContentSha256)) {
    throw new Error("DiscussionBridge complete source content hash is invalid.");
  }

  if (prior?.sourceRevision === incoming.sourceRevision) {
    if (
      prior.sourceContentBytes !== incoming.sourceContentBytes
      || prior.sourceContentSha256 !== incoming.sourceContentSha256
    ) throw new Error("DiscussionBridge source revision conflicts with its stored content identity.");
    return {
      sourceRevision: prior.sourceRevision,
      sourceRevisionSequence: prior.sourceRevisionSequence,
      sourceCreatedAt: prior.sourceCreatedAt,
      sourceUpdatedAt: prior.sourceUpdatedAt,
      sourceContentBytes: prior.sourceContentBytes,
      sourceContentSha256: prior.sourceContentSha256,
    };
  }

  if (prior?.sourceUpdatedAt && Date.parse(incoming.sourceUpdatedAt) <= Date.parse(prior.sourceUpdatedAt)) {
    throw new Error("DiscussionBridge changed source content requires a later source modification time.");
  }
  return {
    sourceRevision: incoming.sourceRevision,
    sourceRevisionSequence: (prior?.sourceRevisionSequence ?? 0) + 1,
    sourceCreatedAt: prior?.sourceCreatedAt ?? incoming.sourceCreatedAt,
    sourceUpdatedAt: incoming.sourceUpdatedAt,
    sourceContentBytes: incoming.sourceContentBytes,
    sourceContentSha256: incoming.sourceContentSha256,
  };
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown publication failure.";
  return message.replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 500);
}
