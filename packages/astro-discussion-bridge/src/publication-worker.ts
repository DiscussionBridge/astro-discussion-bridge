import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sanitizeHtml from "sanitize-html";
import { lock } from "proper-lockfile";
import { Alpha21RequestError, type Alpha21Credentials } from "./alpha21-client.js";
import {
  acknowledgeAstroPublicationWork,
  claimAstroPublicationWork,
  registerAstroPublicationFailure,
  renewAstroPublicationLease,
  type AstroDestinationBinding,
  type AstroPublicationWork,
} from "./publication-work.js";
import { fetchSourceTopicDetail, type SourceTopicDetail } from "./source-publication.js";
import { readSourcePublicationState } from "./source-publication-state.js";

const STATE_VERSION = 1;

export type AstroPublicationWorkerFailureCode =
  | "transport_timeout" | "source_unavailable" | "destination_unavailable" | "rate_limited"
  | "build_failed" | "deploy_failed" | "public_verification_failed" | "internal_error"
  | "authentication_failed" | "scope_denied" | "validation_failed" | "content_unsupported"
  | "identity_conflict" | "destination_collision" | "reconciliation_required" | "operator_action_required";

export class AstroPublicationWorkerError extends Error {
  constructor(public readonly errorCode: AstroPublicationWorkerFailureCode, message: string) {
    super(message);
    this.name = "AstroPublicationWorkerError";
  }
}

class AstroPublicationLeaseExpiredError extends Error {}

export interface PreparedAstroPublication {
  source: SourceTopicDetail;
  contentHtml: string;
  contentDisposition: "complete" | "excerpt";
}

export interface AstroPublicationDestination {
  synchronize(input: { work: AstroPublicationWork; publication: PreparedAstroPublication }): Promise<{
    destinationBinding: AstroDestinationBinding;
    synchronizedAt: string;
  }>;
  deploy(input: { work: AstroPublicationWork; destinationBinding: AstroDestinationBinding }): Promise<{ deployedAt: string }>;
  verify(input: { work: AstroPublicationWork; destinationBinding: AstroDestinationBinding }): Promise<{ publiclyVerifiedAt: string }>;
}

type WorkerPhase = "claimed" | "native_synchronized" | "awaiting_deployment" | "native_deployed" | "awaiting_verification" | "native_verified";

interface WorkerOperation {
  work: AstroPublicationWork;
  phase: WorkerPhase;
  stageToken: string;
  requiresReclaim?: true;
  destinationBinding?: AstroDestinationBinding;
  synchronizedAt?: string;
  deployedAt?: string;
  publiclyVerifiedAt?: string;
}

interface WorkerState {
  schemaVersion: 1;
  adapterId: "astro-discussion-bridge";
  operations: Record<string, WorkerOperation>;
}

export interface RunAstroPublicationWorkerOptions {
  credentials: Alpha21Credentials;
  stateFile: string;
  sourceStateFile: string;
  workerId: string;
  destination: AstroPublicationDestination;
  maximumItems?: number;
  requestedLeaseSeconds?: number;
  renewLeaseSeconds?: number;
  renewalThresholdSeconds?: number;
  now?: () => Date;
}

export async function runAstroPublicationWorker(options: RunAstroPublicationWorkerOptions): Promise<{
  claimed: number;
  completed: number;
  failed: number;
  resumed: number;
}> {
  const now = options.now ?? (() => new Date());
  return withWorkerStateLock(options.stateFile, async () => {
    const state = await readWorkerState(options.stateFile);
    const summary = { claimed: 0, completed: 0, failed: 0, resumed: Object.keys(state.operations).length };
    for (const workId of Object.keys(state.operations)) {
      if (state.operations[workId]?.requiresReclaim) continue;
      const outcome = await processOperation(options, state, workId, now);
      summary[outcome]++;
    }
    const claimed = await claimAstroPublicationWork(options.credentials, {
      workerId: options.workerId,
      maximumItems: options.maximumItems ?? 8,
      requestedLeaseSeconds: options.requestedLeaseSeconds ?? 3_600,
    });
    summary.claimed = claimed.work.length;
    for (const work of claimed.work) {
      const retained = state.operations[work.workId];
      if (retained) {
        if (!retained.requiresReclaim) throw new Error("DiscussionBridge claimed work already exists in active local worker state.");
        try {
          validateReclaimedWork(retained.work, work);
        } catch (error) {
          if (!(error instanceof AstroPublicationWorkerError)) throw error;
          await registerAstroPublicationFailure(options.credentials, work, {
            errorCode: error.errorCode,
            errorDetail: error.message,
            failedAt: now().toISOString(),
          });
          summary.failed++;
          continue;
        }
        retained.work = work;
        retained.stageToken = work.stageToken;
        delete retained.requiresReclaim;
      } else {
        state.operations[work.workId] = { work, phase: "claimed", stageToken: work.stageToken };
      }
      await writeWorkerState(options.stateFile, state);
      const outcome = await processOperation(options, state, work.workId, now);
      summary[outcome]++;
    }
    return summary;
  });
}

async function processOperation(
  options: RunAstroPublicationWorkerOptions,
  state: WorkerState,
  workId: string,
  now: () => Date,
): Promise<"completed" | "failed"> {
  const operation = state.operations[workId];
  if (!operation) throw new Error("DiscussionBridge worker operation disappeared.");
  try {
    if (operation.phase === "claimed") {
      await ensureLease(options, operation, now);
      let source: SourceTopicDetail;
      try {
        const sourceState = await readSourcePublicationState(options.sourceStateFile);
        if (!sourceState.inventory?.complete) throw new Error("Initial source snapshot is not complete.");
        const persisted = sourceState.publications[operation.work.resourceId];
        if (!persisted) throw new Error("Claimed resource is absent from the completed source snapshot state.");
        source = await fetchSourceTopicDetail(options.credentials, persisted.topicId, operation.work.sourceRevision);
      } catch (error) {
        throw workerError("source_unavailable", error);
      }
      validateSourceWorkIdentity(source, operation.work);
      const publication = preparePublication(source, operation.work);
      let result: Awaited<ReturnType<AstroPublicationDestination["synchronize"]>>;
      try { result = await options.destination.synchronize({ work: operation.work, publication }); }
      catch (error) { throw workerError("destination_unavailable", error); }
      if (result.destinationBinding.contentDisposition !== publication.contentDisposition) {
        throw new AstroPublicationWorkerError("validation_failed", "Destination returned the wrong content disposition.");
      }
      operation.destinationBinding = result.destinationBinding;
      operation.synchronizedAt = exactTime(result.synchronizedAt, "synchronization time");
      operation.phase = "native_synchronized";
      await writeWorkerState(options.stateFile, state);
    }
    if (operation.phase === "native_synchronized") {
      const result = await acknowledgeAstroPublicationWork(options.credentials, operation.work, {
        stage: "synchronized",
        stageToken: operation.stageToken,
        destinationBinding: requiredBinding(operation),
        synchronizedAt: requiredTime(operation.synchronizedAt, "synchronization time"),
        deploymentState: "pending",
        verificationState: "pending",
      });
      if (!result.nextStageToken) throw new Error("DiscussionBridge synchronized acknowledgement omitted the deployment token.");
      operation.stageToken = result.nextStageToken;
      operation.phase = "awaiting_deployment";
      await writeWorkerState(options.stateFile, state);
    }
    if (operation.phase === "awaiting_deployment") {
      let result: Awaited<ReturnType<AstroPublicationDestination["deploy"]>>;
      try { result = await options.destination.deploy({ work: operation.work, destinationBinding: requiredBinding(operation) }); }
      catch (error) { throw workerError("deploy_failed", error); }
      operation.deployedAt = exactTime(result.deployedAt, "deployment time");
      operation.phase = "native_deployed";
      await writeWorkerState(options.stateFile, state);
    }
    if (operation.phase === "native_deployed") {
      const result = await acknowledgeAstroPublicationWork(options.credentials, operation.work, {
        stage: "deployed",
        stageToken: operation.stageToken,
        destinationBinding: requiredBinding(operation),
        synchronizedAt: requiredTime(operation.synchronizedAt, "synchronization time"),
        deploymentState: "deployed",
        deployedAt: requiredTime(operation.deployedAt, "deployment time"),
        verificationState: "pending",
      });
      if (!result.nextStageToken) throw new Error("DiscussionBridge deployed acknowledgement omitted the verification token.");
      operation.stageToken = result.nextStageToken;
      operation.phase = "awaiting_verification";
      await writeWorkerState(options.stateFile, state);
    }
    if (operation.phase === "awaiting_verification") {
      let result: Awaited<ReturnType<AstroPublicationDestination["verify"]>>;
      try { result = await options.destination.verify({ work: operation.work, destinationBinding: requiredBinding(operation) }); }
      catch (error) { throw workerError("public_verification_failed", error); }
      operation.publiclyVerifiedAt = exactTime(result.publiclyVerifiedAt, "public verification time");
      operation.phase = "native_verified";
      await writeWorkerState(options.stateFile, state);
    }
    if (operation.phase === "native_verified") {
      const result = await acknowledgeAstroPublicationWork(options.credentials, operation.work, {
        stage: "verified",
        stageToken: operation.stageToken,
        destinationBinding: requiredBinding(operation),
        synchronizedAt: requiredTime(operation.synchronizedAt, "synchronization time"),
        deploymentState: "deployed",
        deployedAt: requiredTime(operation.deployedAt, "deployment time"),
        verificationState: "verified",
        publiclyVerifiedAt: requiredTime(operation.publiclyVerifiedAt, "public verification time"),
      });
      if (!result.terminal) throw new Error("DiscussionBridge verified acknowledgement was not terminal.");
      delete state.operations[workId];
      await writeWorkerState(options.stateFile, state);
    }
    return "completed";
  } catch (error) {
    if (error instanceof AstroPublicationLeaseExpiredError || (error instanceof Alpha21RequestError && error.errorCode === "work_expired")) {
      if (operation.phase === "claimed") delete state.operations[workId];
      else operation.requiresReclaim = true;
      await writeWorkerState(options.stateFile, state);
      return "failed";
    }
    if (!(error instanceof AstroPublicationWorkerError)) throw error;
    const retainForReclaim = operation.phase !== "claimed";
    if (retainForReclaim) {
      operation.requiresReclaim = true;
      await writeWorkerState(options.stateFile, state);
    }
    await registerAstroPublicationFailure(options.credentials, operation.work, {
      errorCode: error.errorCode,
      errorDetail: error.message,
      failedAt: now().toISOString(),
    });
    if (!retainForReclaim) delete state.operations[workId];
    await writeWorkerState(options.stateFile, state);
    return "failed";
  }
}

function validateReclaimedWork(previous: AstroPublicationWork, current: AstroPublicationWork): void {
  const immutable = (work: AstroPublicationWork) => ({
    workId: work.workId,
    resourceId: work.resourceId,
    connectionId: work.connectionId,
    action: work.action,
    sourceRevision: work.sourceRevision,
    sourceRevisionSequence: work.sourceRevisionSequence,
    policyRevision: work.policyRevision,
    destinationPolicyId: work.destinationPolicyId,
    catalogRevision: work.catalogRevision,
    presentationMode: work.presentationMode,
    resolvedContainer: work.resolvedContainer,
    resolvedTaxonomy: work.resolvedTaxonomy,
    resolvedAuthor: work.resolvedAuthor,
    nativeLimitPolicy: work.nativeLimitPolicy,
  });
  const generationAdvanced = current.retryGeneration > previous.retryGeneration;
  const attemptValid = generationAdvanced || (
    current.retryGeneration === previous.retryGeneration
    && current.attemptCount >= previous.attemptCount
  );
  if (
    JSON.stringify(immutable(previous)) !== JSON.stringify(immutable(current))
    || !attemptValid
    || current.leaseToken === previous.leaseToken
    || current.stageToken === previous.stageToken
  ) {
    throw new AstroPublicationWorkerError("reconciliation_required", "Reclaimed publication work does not match retained durable state.");
  }
}

async function ensureLease(options: RunAstroPublicationWorkerOptions, operation: WorkerOperation, now: () => Date): Promise<void> {
  const remaining = Date.parse(operation.work.leaseExpiresAt) - now().getTime();
  if (remaining <= 0) throw new AstroPublicationLeaseExpiredError("DiscussionBridge publication lease expired before native mutation.");
  if (remaining > (options.renewalThresholdSeconds ?? 120) * 1_000) return;
  const renewed = await renewAstroPublicationLease(options.credentials, operation.work, options.renewLeaseSeconds ?? 900);
  operation.work.leaseExpiresAt = renewed.leaseExpiresAt;
}

function validateSourceWorkIdentity(source: SourceTopicDetail, work: AstroPublicationWork): void {
  if (source.resourceId !== work.resourceId || source.sourceRevision !== work.sourceRevision || source.sourceRevisionSequence !== work.sourceRevisionSequence) {
    throw new AstroPublicationWorkerError("reconciliation_required", "Source detail does not match claimed work identity.");
  }
}

function preparePublication(source: SourceTopicDetail, work: AstroPublicationWork): PreparedAstroPublication {
  if (source.sourceContentBytes <= work.nativeLimitPolicy.maximumBytes) {
    return { source, contentHtml: source.sanitizedContentHtml, contentDisposition: "complete" };
  }
  if (work.nativeLimitPolicy.overflowBehavior === "operator_attention") {
    throw new AstroPublicationWorkerError("operator_action_required", "Source content exceeds the operator-approved Astro destination limit.");
  }
  if (work.nativeLimitPolicy.overflowBehavior !== "excerpt_with_read_more") {
    throw new AstroPublicationWorkerError("content_unsupported", "Source content exceeds the Astro destination limit.");
  }
  return {
    source,
    contentHtml: boundedExcerpt(source.sanitizedContentHtml, source.topicUrl, work.nativeLimitPolicy.maximumBytes),
    contentDisposition: "excerpt",
  };
}

function boundedExcerpt(html: string, sourceUrl: string, maximumBytes: number): string {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/gu, " ").trim();
  const prefix = "<p><strong>Excerpt:</strong> ";
  const suffix = `</p><p><a href="${escapeAttribute(sourceUrl)}">Read More</a></p>`;
  const points = Array.from(text);
  let low = 0;
  let high = points.length;
  let best = "";
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = `${prefix}${escapeText(points.slice(0, middle).join("").trim())}${suffix}`;
    if (new TextEncoder().encode(candidate).byteLength <= maximumBytes) { best = candidate; low = middle + 1; }
    else high = middle - 1;
  }
  if (!best) throw new AstroPublicationWorkerError("content_unsupported", "Astro destination limit cannot contain a valid Read More excerpt.");
  return best;
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}

function workerError(code: AstroPublicationWorkerFailureCode, error: unknown): AstroPublicationWorkerError {
  if (error instanceof AstroPublicationWorkerError) return error;
  return new AstroPublicationWorkerError(code, error instanceof Error ? error.message : "Unknown publication worker failure.");
}

function requiredBinding(operation: WorkerOperation): AstroDestinationBinding {
  if (!operation.destinationBinding) throw new Error("DiscussionBridge worker destination binding is missing.");
  return operation.destinationBinding;
}

function requiredTime(value: string | undefined, label: string): string {
  if (!value) throw new Error(`DiscussionBridge worker ${label} is missing.`);
  return exactTime(value, label);
}

function exactTime(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`DiscussionBridge worker ${label} is invalid.`);
  return value;
}

async function readWorkerState(filePath: string): Promise<WorkerState> {
  try {
    const value: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DiscussionBridge publication worker state is invalid.");
    const state = value as Partial<WorkerState>;
    if (state.schemaVersion !== STATE_VERSION || state.adapterId !== "astro-discussion-bridge" || !state.operations || typeof state.operations !== "object" || Array.isArray(state.operations)) throw new Error("DiscussionBridge publication worker state is invalid.");
    for (const [workId, operation] of Object.entries(state.operations)) {
      if (
        !operation
        || operation.work.workId !== workId
        || !["claimed", "native_synchronized", "awaiting_deployment", "native_deployed", "awaiting_verification", "native_verified"].includes(operation.phase)
        || (operation.requiresReclaim !== undefined && operation.requiresReclaim !== true)
        || (operation.requiresReclaim && operation.phase === "claimed")
      ) throw new Error("DiscussionBridge publication worker operation is invalid.");
    }
    return state as WorkerState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: STATE_VERSION, adapterId: "astro-discussion-bridge", operations: {} };
    throw error;
  }
}

async function writeWorkerState(filePath: string, state: WorkerState): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
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

async function withWorkerStateLock<T>(filePath: string, action: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  let release: (() => Promise<void>) | undefined;
  try { release = await lock(filePath, { realpath: false, retries: 0, stale: 30_000, update: 10_000 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOCKED") throw new Error(`DiscussionBridge publication worker is already active: ${filePath}`);
    throw error;
  }
  try { return await action(); }
  finally { await release(); }
}
