import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { lock } from "proper-lockfile";
import { CmsClient, CmsRequestError, validatedCmsErrorResponse, type CmsClientOptions, type CmsConnection, type CmsMapping, type CmsSource } from "./cms-client.js";
import { assertCmsConnection, emptyCmsState, readCmsState, stageCmsClaim, stageCmsFeedPage, withCmsStateLock, writeCmsState, type CmsNativeState } from "./cms-state.js";
import { nativePublicationFiles } from "./native-publication.js";
import { semanticIdentity, validateCms } from "../src/private/cms-runtime.mjs";
import { cmsOrigin, nativeUrl } from "./native-url.js";
import { assertWorkReclaimAllowed, expiryRefusal, workRequest } from "./cms-work-requests.js";

export interface CmsCoordinatorOptions extends CmsClientOptions {
  /** Native publication is configured explicitly; the sole wire is V4. */
  
  docsDir: string;
  siteUrl: string;
  stateFile: string;
  routeBase?: string;
}

export interface CmsCoordinatorContext { client: CmsClient; connection: CmsConnection; state: CmsNativeState; save: () => Promise<void> }
export async function withCmsCoordinator<T>(options: CmsCoordinatorOptions, action: (context: CmsCoordinatorContext) => Promise<T>): Promise<T> {
  const docs = path.resolve(options.docsDir), journal = path.resolve(options.stateFile);
  const relative = path.relative(docs, journal);
  if (relative === "" || relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) throw new Error("CMS server-only native state must stay outside its public content directory.");
  await nativePublicationFiles.assertDirectory(options.docsDir);
  await nativePublicationFiles.mkdir(options.docsDir);
  await nativePublicationFiles.assertDirectory(options.docsDir);
  const release = await lock(path.resolve(options.docsDir), { realpath: false, retries: 0 });
  try {
    return await withCmsStateLock(path.resolve(options.stateFile), async () => {
      const client = new CmsClient(options);
      const state = await readCmsState(options.stateFile, emptyCmsState(client, options.siteUrl, options.connectionId));
      const connection = await client.connection();
      assertCmsConnection(connection, state);
      state.scopeRevision = connection.scope_revision;
      state.policyRevision = connection.policy.policy_revision;
      const save = () => writeCmsState(options.stateFile, state);
      return action({ client, connection, state, save });
    });
  } finally { await release(); }
}

/** One bounded page per call; persist complete staged events before its cursor. */
export async function pollCmsSources(options: CmsCoordinatorOptions) {
  return withCmsCoordinator(options, async ({ client, state, save }) => {
    const cursor = state.cursor ?? (state.stream === "changes" ? state.checkpoint! : undefined);
    let feed;
    try {
      feed = await client.sources(state.stream, cursor);
    } catch (error) {
      if (!cursor || !(error instanceof CmsRequestError) || error.code !== "cursor_expired"
        || error.routeId !== "V4-06" || error.httpStatus !== 410) throw error;
      const staged = await recoverCmsSources(client, state);
      await save();
      return { staged, continuation: state.cursor, checkpoint: state.checkpoint, stream: state.stream };
    }
    stageCmsFeedPage(state, feed);
    await save();
    return { staged: feed.items.length, continuation: state.cursor, checkpoint: state.checkpoint, stream: state.stream };
  });
}

async function recoverCmsSources(client: CmsClient, state: CmsNativeState): Promise<number> {
  // Refresh the positive projection only. Keep event and ownership history, and
  // leave revocations and withdrawals to their existing authority paths.
  state.stream = "initial";
  state.cursor = null;
  state.checkpoint = null;
  state.sources = Object.assign(Object.create(null), Object.fromEntries(
    Object.entries(state.sources).filter(([, event]) => event.event_type === "revocation"),
  ));
  const sourceCursors = new Set<string>();
  let staged = 0;
  do {
    const page = await client.sources("initial", state.cursor ?? undefined);
    stageCmsFeedPage(state, page);
    staged += page.items.length;
    if (state.cursor !== null) {
      if (sourceCursors.has(state.cursor)) throw new Error("CMS recovery snapshot repeated a source cursor.");
      sourceCursors.add(state.cursor);
    }
  } while (state.cursor !== null);
  if (state.checkpoint === null) throw new Error("CMS recovery snapshot did not return a checkpoint.");

  const unmatched = new Set(Object.keys(state.mappings));
  const mappingCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: { items: CmsMapping[]; next_cursor: string | null } = await client.request(
      "V4-10", { query: cursor === null ? {} : { cursor } },
    );
    for (const remote of page.items) {
      const local = state.mappings[remote.source_id];
      const pending = state.reservations?.[remote.source_id]?.body;
      const matches = local
        ? unmatched.delete(remote.source_id) && remote.mapping_id === local.mapping_id
          && remote.resource_id === local.resource_id && remote.external_id === local.external_id
          && remote.canonical_url === local.canonical_url
          && (local.destination_native_id === null || remote.destination_native_id === local.destination_native_id)
        : pending && remote.external_id === pending.external_id && remote.canonical_url === pending.canonical_url;
      if (remote.connection_id !== state.connectionId || !matches) {
        throw new Error("CMS recovery mapping inventory requires ownership reconciliation.");
      }
    }
    cursor = page.next_cursor;
    if (cursor !== null) {
      if (mappingCursors.has(cursor)) throw new Error("CMS recovery mapping inventory repeated a cursor.");
      mappingCursors.add(cursor);
    }
  } while (cursor !== null);
  if (unmatched.size) throw new Error("CMS recovery mapping inventory is missing a retained mapping.");
  return staged;
}

/** Native file reservation uses the existing routeBase and Astro page ID scheme. */
export function cmsNativeReservation(options: CmsCoordinatorOptions, source: Pick<CmsSource, "source_id">) {
  validateCms("OpaqueId", source.source_id);
  const routeBase = options.routeBase ?? "comments";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(routeBase)) throw new Error("Invalid CMS Astro native route base.");
  const slug = `source-${createHash("sha256").update(source.source_id, "utf8").digest("hex")}`;
  const relative = `${routeBase}/${slug}.md`;
  const nativeId = relative;
  const canonicalUrl = nativeUrl(`/${routeBase}/${slug}/`, options.siteUrl).href;
  const externalId = `astro-page:${createHash("sha256").update(`${cmsOrigin(options.siteUrl)}/\n${relative}`).digest("hex")}`;
  return { nativeId, canonicalUrl, externalId, file: path.resolve(options.docsDir, relative) };
}

export async function reserveCmsSource(options: CmsCoordinatorOptions, sourceId: string) {
  return withCmsCoordinator(options, async ({ client, state, save }) => {
    const event = state.sources[sourceId];
    if (!event || event.event_type !== "publication") throw new Error("CMS source has no staged eligible publication event.");
    const reservation = cmsNativeLocation(options, state, sourceId);
    // Native reservations never claim unowned objects.
    const existing = await nativePublicationFiles.readExisting(reservation.file);
    if (existing && !nativePublicationFiles.metadata(existing.contents)?.discussionbridgeCmsOwnership) throw new Error("Existing native page requires explicit ownership reconciliation.");
    state.reservations ??= Object.create(null);
    let operation = state.reservations![sourceId];
    operation ??= { body: { mutation_id: randomUUID(), source_id: sourceId, source_revision: event.source.source_revision, policy_revision: state.policyRevision!, external_id: reservation.externalId, canonical_url: reservation.canonicalUrl } };
    if (operation.body.source_id !== sourceId || operation.body.external_id !== reservation.externalId ||
        operation.body.canonical_url !== reservation.canonicalUrl || operation.body.policy_revision !== state.policyRevision) {
      throw new Error("CMS reservation scope changed before reconciliation.");
    }
    state.reservations![sourceId] = operation;
    await save();
    let mapping: CmsMapping;
    try {
      mapping = await client.request<CmsMapping>("V4-09", { body: operation.body });
    } catch (error) {
      const refusal = validatedCmsErrorResponse(error, client, "V4-09", operation.body);
      const owned = state.mappings[sourceId];
      // An exact refusal and a later, durable source event are both required.
      // In particular, an unknown response cannot authorize a replacement.
      if (refusal?.httpStatus !== 409 || refusal.envelope.code !== "revision_conflict" || refusal.envelope.retryable ||
          !owned || !owned.destination_native_id || event.source.source_revision === operation.body.source_revision ||
          !Object.values(state.events).some(prior => prior.event_type === "publication" &&
            prior.source.source_id === sourceId && prior.source.source_revision === operation!.body.source_revision &&
            BigInt(prior.event_sequence) < BigInt(event.event_sequence))) throw error;
      mapping = await client.request<CmsMapping>("V4-11", { path: { mapping_id: owned.mapping_id } });
      if (mapping.mapping_id !== owned.mapping_id || mapping.resource_id !== owned.resource_id ||
          mapping.destination_native_id !== owned.destination_native_id || mapping.source_id !== sourceId ||
          mapping.connection_id !== state.connectionId || mapping.external_id !== reservation.externalId ||
          mapping.canonical_url !== reservation.canonicalUrl || mapping.desired_source_revision !== event.source.source_revision) throw error;
      state.retiredReservations ??= [];
      state.retiredReservations.push({ body: operation.body, refusal, successorEventId: event.event_id });
    }
    if (mapping.source_id !== sourceId || mapping.connection_id !== state.connectionId || mapping.external_id !== operation.body.external_id || mapping.canonical_url !== operation.body.canonical_url) throw new Error("CMS native reservation binding requires reconciliation.");
    state.mappings[sourceId] = mapping;
    delete state.reservations![sourceId];
    await save();
    return mapping;
  });
}

/** A committed URL move changes the route, never physical native identity. */
export function cmsNativeLocation(options: CmsCoordinatorOptions, state: CmsNativeState, sourceId: string) {
  const reservation = cmsNativeReservation(options, { source_id: sourceId });
  const location = state.nativeLocations?.[sourceId];
  if (!location) return reservation;
  if (location.nativeId !== reservation.nativeId) throw new Error("CMS native URL ancestry changed object identity.");
  return { ...reservation, canonicalUrl: location.canonicalUrl };
}

export async function claimCmsNativeWork(options: CmsCoordinatorOptions, mappingId?: string, intake = false) {
  return withCmsCoordinator(options, context => claimCmsNativeWorkInContext(context, mappingId, undefined, intake));
}

/** Caller already holds this native coordinator's writer; no nested lock. */
export async function claimCmsNativeWorkInContext({ client, state, connection, save }: CmsCoordinatorContext, mappingId?: string, expectedWorkId?: string, intake = false) {
    if (typeof intake !== "boolean" || intake && mappingId === undefined) throw new Error("CMS native intake requires a positive mapping selector.");
    if (connection.policy.author_ids.length || connection.policy.taxonomy_ids.length) throw new Error("CMS selected native author/taxonomy IDs require the actual consumer availability and assignment resolver.");
    const limitations = Object.values(state.transactions).filter(transaction => transaction.localLimitation);
    if (limitations.length && mappingId === undefined) throw new Error("CMS local media limitation requires a positive claim of another owned mapping; an unfiltered claim may reselect held work.");
    if (limitations.some(transaction => transaction.lease.work.mapping_id === mappingId)) throw new Error("CMS local media limitation requires current work/source/native reconciliation for this mapping.");
    if (state.pendingClaim && state.pendingClaim.body.mapping_id !== mappingId) throw new Error("Uncertain CMS claim scope requires reconciliation.");
    const command = state.nativeCommand as { phase?: string } | undefined;
    if (command && ["starting", "running", "uncertain"].includes(command.phase ?? "")) throw new Error("CMS uncertain native command prevents another ordinary Claim.");
    for (const transaction of Object.values(state.transactions)) {
      if (!["claimed", "staged", "prepared"].includes(transaction.stage) || mappingId !== undefined && transaction.lease.work.mapping_id !== mappingId) continue;
      assertWorkReclaimAllowed(state, transaction);
      if (transaction.attentionRecovery) throw new Error("CMS attention successor requires its positive recovery Claim, not ordinary Claim.");
      if (!state.pendingClaim) {
        const body = transaction.prepareBody as object | undefined;
        const preparation = body && workRequest(transaction, "V4-18", body);
        if (transaction.stage === "prepared" && preparation) preparation.observedPrepared = true;
        if (transaction.pendingRenewal || preparation && preparation.response === undefined && !preparation.observedPrepared && !expiryRefusal(preparation)) throw new Error("CMS unresolved Prepare or renewal must resolve its exact request before another Claim.");
      }
    }
    // Do not retag a retained/legacy uncertain request with a new local intent.
    state.pendingClaim ??= { body: { mutation_id: randomUUID(), ...(mappingId === undefined ? {} : { mapping_id: mappingId }) }, ...(intake ? { intake: true as const } : {}) };
    const pending = state.pendingClaim, body = pending.body;
    const prior = state.claimReceipts?.[body.mutation_id];
    if (prior && semanticIdentity(prior.body) !== semanticIdentity(body)) throw new Error("CMS Claim mutation history changed.");
    await save();
    const lease = await client.claim(body.mutation_id, body.mapping_id);
    if (lease && body.mapping_id !== undefined && lease.work.mapping_id !== body.mapping_id) throw new Error("CMS Claim response changed its positively selected mapping; original intent retained.");
    if (prior?.response !== undefined && semanticIdentity(prior.response) !== semanticIdentity(lease ?? null)) throw new Error("CMS Claim receipt changed on exact replay.");
    // Completed bodyless polls transfer no authority; do not grow history on
    // every idle build. Positive lease receipts remain exact and retained.
    if (!lease) {
      if (pending.intake) state.intakeAfterMappingId = body.mapping_id!;
      delete state.pendingClaim; await save(); return undefined;
    }
    (state.claimReceipts ??= Object.create(null))[body.mutation_id] = prior ?? { body: structuredClone(body), response: structuredClone(lease) }; await save();
    const transaction = stageCmsClaim(state, lease);
    if (pending.intake) state.intakeAfterMappingId = body.mapping_id!;
    delete state.pendingClaim;
    await save();
    if (expectedWorkId !== undefined && lease.work.work_id !== expectedWorkId) throw new Error("CMS positive mapping Claim returned different work; its actual lease is retained without adopting the prior native plan.");
    return { workId: lease.work.work_id, mappingId: lease.work.mapping_id, transactionId: transaction.transactionId, stage: transaction.stage, leaseGeneration: lease.lease_generation };
}
