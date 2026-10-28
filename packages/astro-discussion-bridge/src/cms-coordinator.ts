import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { lock } from "proper-lockfile";
import { CmsClient, type CmsClientOptions, type CmsConnection, type CmsMapping, type CmsSource } from "./cms-client.js";
import { assertCmsConnection, emptyCmsState, readCmsState, stageCmsClaim, stageCmsFeedPage, withCmsStateLock, writeCmsState, type CmsNativeState } from "./cms-state.js";
import { nativePublicationFiles } from "./native-publication.js";
import { validateCms } from "../src/private/cms-runtime.mjs";

export interface CmsCoordinatorOptions extends CmsClientOptions {
  /** Native publication is configured explicitly; the sole wire is V4. */
  
  docsDir: string;
  siteUrl: string;
  stateFile: string;
  routeBase?: string;
}

export async function withCmsCoordinator<T>(options: CmsCoordinatorOptions, action: (context: { client: CmsClient; connection: CmsConnection; state: CmsNativeState; save: () => Promise<void> }) => Promise<T>): Promise<T> {
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
    const feed = await client.sources(state.stream, cursor);
    stageCmsFeedPage(state, feed);
    await save();
    return { staged: feed.items.length, continuation: state.cursor, checkpoint: state.checkpoint, stream: state.stream };
  });
}

/** Native file reservation uses the existing routeBase and Astro page ID scheme. */
export function cmsNativeReservation(options: CmsCoordinatorOptions, source: Pick<CmsSource, "source_id">) {
  validateCms("OpaqueId", source.source_id);
  const routeBase = options.routeBase ?? "comments";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(routeBase)) throw new Error("Invalid CMS Astro native route base.");
  const slug = `source-${createHash("sha256").update(source.source_id, "utf8").digest("hex")}`;
  const relative = `${routeBase}/${slug}.md`;
  const nativeId = relative;
  const canonicalUrl = new URL(`/${routeBase}/${slug}/`, options.siteUrl).href;
  const externalId = `astro-page:${createHash("sha256").update(`${new URL(options.siteUrl).origin}/\n${relative}`).digest("hex")}`;
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
    if (operation && operation.body.source_revision !== event.source.source_revision) throw new Error("An uncertain CMS reservation must reconcile before a new source revision.");
    operation ??= { body: { mutation_id: randomUUID(), source_id: sourceId, source_revision: event.source.source_revision, policy_revision: state.policyRevision!, external_id: reservation.externalId, canonical_url: reservation.canonicalUrl } };
    state.reservations![sourceId] = operation;
    await save();
    const mapping = await client.request<CmsMapping>("V4-09", { body: operation.body });
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

export async function claimCmsNativeWork(options: CmsCoordinatorOptions, mappingId?: string) {
  return withCmsCoordinator(options, async ({ client, state, connection, save }) => {
    if (connection.policy.author_ids.length || connection.policy.taxonomy_ids.length) throw new Error("CMS selected native author/taxonomy IDs require the actual consumer availability and assignment resolver.");
    const limitations = Object.values(state.transactions).filter(transaction => transaction.localLimitation);
    if (limitations.length && mappingId === undefined) throw new Error("CMS local media limitation requires a positive claim of another owned mapping; an unfiltered claim may reselect held work.");
    if (limitations.some(transaction => transaction.lease.work.mapping_id === mappingId)) throw new Error("CMS local media limitation requires current work/source/native reconciliation for this mapping.");
    if (state.pendingClaim && state.pendingClaim.body.mapping_id !== mappingId) throw new Error("Uncertain CMS claim scope requires reconciliation.");
    state.pendingClaim ??= { body: { mutation_id: randomUUID(), ...(mappingId === undefined ? {} : { mapping_id: mappingId }) } };
    await save();
    const lease = await client.claim(state.pendingClaim.body.mutation_id, state.pendingClaim.body.mapping_id);
    if (!lease) { delete state.pendingClaim; await save(); return undefined; }
    const transaction = stageCmsClaim(state, lease);
    delete state.pendingClaim;
    await save();
    return { workId: lease.work.work_id, mappingId: lease.work.mapping_id, transactionId: transaction.transactionId, stage: transaction.stage };
  });
}
