import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const STATE_VERSION = 1;
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
}

export interface PublicationOperationalState {
  schemaVersion: 1;
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

export function beginPublicationAttempt(state: PublicationOperationalState, identity: { externalId: string; canonicalUrl: string }, now = new Date()): PublicationOperation {
  const prior = state.operations[identity.externalId];
  if (prior && prior.canonicalUrl !== identity.canonicalUrl) throw new Error("DiscussionBridge operational state contains a canonical identity collision.");
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
  const candidate = value as Partial<PublicationOperationalState>;
  if (candidate.schemaVersion !== STATE_VERSION || candidate.adapterId !== "astro-discussion-bridge" || !candidate.operations || typeof candidate.operations !== "object" || Array.isArray(candidate.operations)) throw new Error("DiscussionBridge operational state is invalid.");
  for (const [key, operation] of Object.entries(candidate.operations)) validateOperation(key, operation);
  return candidate as PublicationOperationalState;
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
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown publication failure.";
  return message.replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 500);
}
