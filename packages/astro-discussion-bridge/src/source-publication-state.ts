import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { lock } from "proper-lockfile";
import { Alpha21RequestError, type Alpha21Credentials } from "./alpha21-client.js";
import type {
  SourceInventoryPage,
  SourceRevocationPage,
  SourceTopicDetail,
} from "./source-publication.js";
import { fetchSourceInventoryPage, fetchSourceTopicDetail } from "./source-publication.js";

const STATE_VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const REVOCATION_ID = /^dbr_[a-f0-9]{32}$/;

export interface SourceInventoryCheckpoint {
  snapshot: string;
  policyRevision: string;
  nextCursor: string | null;
  complete: boolean;
  synchronizedAt: string;
}

export interface SourceRevocationCheckpoint {
  highWater: string;
  policyRevision: string;
  nextCursor: string | null;
  complete: boolean;
  synchronizedAt: string;
}

export interface PersistedSourcePublication {
  resourceId: string;
  topicId: number;
  topicUrl: string;
  title: string;
  sourceRevision: string;
  sourceRevisionSequence: number;
  sourceCreatedAt: string;
  sourceUpdatedAt: string;
  sourceAuthors: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  tags: Record<string, unknown>[];
  presentationMode: "simple" | "full" | "interactive";
  contentDisposition: "complete" | "excerpt";
  networkProvenance: Record<string, unknown> | null;
  sourceContentBytes: number;
  sourceContentSha256: string;
  synchronizedAt: string;
}

export interface PersistedSourceRevocation {
  revocationId: string;
  resourceId: string;
  sourceRevision: string;
  sourceRevisionSequence: number;
  reason: "source_unpublished" | "source_deleted" | "scope_removed" | "policy_removed" | "operator_hold";
  effectiveAt: string;
  restorable: boolean;
  synchronizedAt: string;
}

export interface SourcePublicationState {
  schemaVersion: 1;
  adapterId: "astro-discussion-bridge";
  inventory: SourceInventoryCheckpoint | null;
  revocationFeed: SourceRevocationCheckpoint | null;
  publications: Record<string, PersistedSourcePublication>;
  revocations: Record<string, PersistedSourceRevocation>;
}

export async function readSourcePublicationState(filePath: string): Promise<SourcePublicationState> {
  try {
    return validateState(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

export async function writeSourcePublicationState(filePath: string, state: SourcePublicationState): Promise<void> {
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

export async function withSourcePublicationStateLock<T>(
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
      throw new Error(`DiscussionBridge source publication state is already in use: ${filePath}`);
    }
    throw error;
  }
  try { return await action(); }
  finally { await release(); }
}

export async function synchronizeInitialSourceSnapshot(
  credentials: Alpha21Credentials,
  filePath: string,
  options: { limit?: number; now?: () => Date } = {},
): Promise<{ pages: number; resources: number; resumed: boolean }> {
  return withSourcePublicationStateLock(filePath, async () => {
    const state = await readSourcePublicationState(filePath);
    const resumed = Boolean(state.inventory && !state.inventory.complete);
    if (state.inventory?.complete) return { pages: 0, resources: Object.keys(state.publications).length, resumed: false };
    let pages = 0;
    for (;;) {
      let page: SourceInventoryPage;
      try {
        page = await fetchSourceInventoryPage(credentials, {
          snapshot: state.inventory?.snapshot,
          policyRevision: state.inventory?.policyRevision,
          cursor: state.inventory?.nextCursor ?? undefined,
          limit: options.limit ?? 100,
        });
      } catch (error) {
        if (error instanceof Alpha21RequestError && error.errorCode === "snapshot_expired") {
          state.inventory = null;
          await writeSourcePublicationState(filePath, state);
          continue;
        }
        throw error;
      }
      for (const item of page.items) {
        const detail = await fetchSourceTopicDetail(credentials, item.topicId, item.sourceRevision);
        if (detail.resourceId !== item.resourceId || detail.sourceRevisionSequence !== item.sourceRevisionSequence) {
          throw new Error("DiscussionBridge source snapshot detail does not match its inventory item.");
        }
        persistSourceTopicDetail(state, detail, (options.now ?? (() => new Date()))());
        await writeSourcePublicationState(filePath, state);
      }
      advanceSourceInventoryCheckpoint(state, page, (options.now ?? (() => new Date()))());
      await writeSourcePublicationState(filePath, state);
      pages++;
      if (page.complete) break;
      if (!page.nextCursor) throw new Error("DiscussionBridge incomplete source snapshot omitted its next cursor.");
    }
    return { pages, resources: Object.keys(state.publications).length, resumed };
  });
}

export function advanceSourceInventoryCheckpoint(
  state: SourcePublicationState,
  page: SourceInventoryPage,
  now = new Date(),
): void {
  const prior = state.inventory;
  if (prior && !prior.complete && (prior.snapshot !== page.snapshot || prior.policyRevision !== page.policyRevision)) {
    throw new Error("DiscussionBridge cannot mix source inventory snapshots or policy revisions.");
  }
  state.inventory = {
    snapshot: page.snapshot,
    policyRevision: page.policyRevision,
    nextCursor: page.nextCursor,
    complete: page.complete,
    synchronizedAt: now.toISOString(),
  };
  validateState(state);
}

export function persistSourceTopicDetail(
  state: SourcePublicationState,
  detail: SourceTopicDetail,
  now = new Date(),
): PersistedSourcePublication {
  const prior = state.publications[detail.resourceId];
  if (prior && detail.sourceRevisionSequence < prior.sourceRevisionSequence) {
    throw new Error("DiscussionBridge source publication revision regressed.");
  }
  if (prior && detail.sourceRevisionSequence === prior.sourceRevisionSequence) {
    if (detail.sourceRevision !== prior.sourceRevision || detail.sourceContentBytes !== prior.sourceContentBytes || detail.sourceContentSha256 !== prior.sourceContentSha256) {
      throw new Error("DiscussionBridge source publication revision conflicts with persisted identity.");
    }
  }
  if (prior && (prior.topicId !== detail.topicId || prior.topicUrl !== detail.topicUrl || prior.sourceCreatedAt !== detail.sourceCreatedAt)) {
    throw new Error("DiscussionBridge source publication stable identity changed.");
  }
  const persisted: PersistedSourcePublication = {
    resourceId: detail.resourceId,
    topicId: detail.topicId,
    topicUrl: detail.topicUrl,
    title: detail.title,
    sourceRevision: detail.sourceRevision,
    sourceRevisionSequence: detail.sourceRevisionSequence,
    sourceCreatedAt: detail.sourceCreatedAt,
    sourceUpdatedAt: detail.sourceUpdatedAt,
    sourceAuthors: structuredClone(detail.sourceAuthors),
    categories: structuredClone(detail.categories),
    tags: structuredClone(detail.tags),
    presentationMode: detail.presentationMode,
    contentDisposition: detail.contentDisposition,
    networkProvenance: structuredClone(detail.networkProvenance),
    sourceContentBytes: detail.sourceContentBytes,
    sourceContentSha256: detail.sourceContentSha256,
    synchronizedAt: now.toISOString(),
  };
  state.publications[detail.resourceId] = persisted;
  validateState(state);
  return persisted;
}

export function advanceSourceRevocationCheckpoint(
  state: SourcePublicationState,
  page: SourceRevocationPage,
  now = new Date(),
): void {
  const prior = state.revocationFeed;
  if (prior && !prior.complete && (prior.highWater !== page.highWater || prior.policyRevision !== page.policyRevision)) {
    throw new Error("DiscussionBridge cannot mix revocation high-water marks or policy revisions.");
  }
  for (const item of page.items) {
    const existing = state.revocations[item.revocationId];
    if (existing && JSON.stringify(withoutSynchronizedAt(existing)) !== JSON.stringify(item)) {
      throw new Error("DiscussionBridge revocation identity conflicts with persisted state.");
    }
    state.revocations[item.revocationId] = { ...structuredClone(item), synchronizedAt: now.toISOString() };
  }
  state.revocationFeed = {
    highWater: page.highWater,
    policyRevision: page.policyRevision,
    nextCursor: page.nextCursor,
    complete: page.complete,
    synchronizedAt: now.toISOString(),
  };
  validateState(state);
}

function emptyState(): SourcePublicationState {
  return {
    schemaVersion: STATE_VERSION,
    adapterId: "astro-discussion-bridge",
    inventory: null,
    revocationFeed: null,
    publications: {},
    revocations: {},
  };
}

function validateState(value: unknown): SourcePublicationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DiscussionBridge source publication state is invalid.");
  const state = value as Partial<SourcePublicationState>;
  if (state.schemaVersion !== STATE_VERSION || state.adapterId !== "astro-discussion-bridge") throw new Error("DiscussionBridge source publication state is invalid.");
  if (!state.publications || typeof state.publications !== "object" || Array.isArray(state.publications)) throw new Error("DiscussionBridge source publication state is invalid.");
  if (!state.revocations || typeof state.revocations !== "object" || Array.isArray(state.revocations)) throw new Error("DiscussionBridge source publication state is invalid.");
  validateCheckpoint(state.inventory, "inventory");
  validateCheckpoint(state.revocationFeed, "revocation");
  for (const [key, publication] of Object.entries(state.publications)) validatePublication(key, publication);
  for (const [key, revocation] of Object.entries(state.revocations)) validateRevocation(key, revocation);
  return state as SourcePublicationState;
}

function validateCheckpoint(value: unknown, kind: "inventory" | "revocation"): void {
  if (value === null) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DiscussionBridge source checkpoint is invalid.");
  const item = value as Record<string, unknown>;
  const identity = kind === "inventory" ? item.snapshot : item.highWater;
  if (!boundedString(identity, 8_192) || !boundedString(item.policyRevision, 255) || !(item.nextCursor === null || boundedString(item.nextCursor, 8_192)) || typeof item.complete !== "boolean" || !validDate(item.synchronizedAt)) {
    throw new Error("DiscussionBridge source checkpoint is invalid.");
  }
}

function validatePublication(key: string, value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DiscussionBridge persisted source publication is invalid.");
  const item = value as PersistedSourcePublication;
  if (
    key !== item.resourceId || !UUID.test(item.resourceId) || !positiveInteger(item.topicId)
    || !boundedString(item.topicUrl, 2_048) || !boundedString(item.title, 1_024)
    || !boundedString(item.sourceRevision, 255) || !positiveInteger(item.sourceRevisionSequence)
    || !validDate(item.sourceCreatedAt) || !validDate(item.sourceUpdatedAt) || Date.parse(item.sourceUpdatedAt) < Date.parse(item.sourceCreatedAt)
    || !Array.isArray(item.sourceAuthors) || item.sourceAuthors.length > 20
    || !Array.isArray(item.categories) || item.categories.length > 20 || !Array.isArray(item.tags) || item.tags.length > 100
    || !["simple", "full", "interactive"].includes(item.presentationMode)
    || !["complete", "excerpt"].includes(item.contentDisposition)
    || !Number.isSafeInteger(item.sourceContentBytes) || item.sourceContentBytes < 0 || item.sourceContentBytes > 16 * 1024 * 1024
    || !SHA256.test(item.sourceContentSha256) || !validDate(item.synchronizedAt)
  ) throw new Error("DiscussionBridge persisted source publication is invalid.");
}

function validateRevocation(key: string, value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DiscussionBridge persisted revocation is invalid.");
  const item = value as PersistedSourceRevocation;
  if (
    key !== item.revocationId || !REVOCATION_ID.test(item.revocationId) || !UUID.test(item.resourceId)
    || !boundedString(item.sourceRevision, 255) || !positiveInteger(item.sourceRevisionSequence)
    || !["source_unpublished", "source_deleted", "scope_removed", "policy_removed", "operator_hold"].includes(item.reason)
    || !validDate(item.effectiveAt) || typeof item.restorable !== "boolean" || !validDate(item.synchronizedAt)
  ) throw new Error("DiscussionBridge persisted revocation is invalid.");
}

function withoutSynchronizedAt(value: PersistedSourceRevocation): Omit<PersistedSourceRevocation, "synchronizedAt"> {
  const { synchronizedAt: _ignored, ...record } = value;
  return record;
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && new TextEncoder().encode(value).byteLength <= maximum && !/[\u0000-\u001f\u007f]/u.test(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
