import path from "node:path";
import { lstat } from "node:fs/promises";
import { semanticIdentity, validateCms } from "../src/private/cms-runtime.mjs";
import type { CmsClient, CmsConnection } from "./cms-client.js";
import type { CmsToState, CmsToRecordMetadata, CmsToBody } from "./cms-to.js";
import type { PublicationOperation, PublicationOperationalState, NativeSourceCensus } from "./operational-state.js";
import type { PublishControlledDiscussionsOptions } from "./controlled-creation.js";
import { nativePublicationFiles } from "./native-publication.js";
import { findMarkdownFiles, parseMarkdown, pageUrlForFile, validateRouteBase } from "./native-source.js";
import { cmsServiceBaseUrl, cmsUrl, sameCmsOrigin } from "./native-url.js";
import { sourceHash, validateSourceCapture, type SourceNativeCapture } from "./to-source-profile.js";

export interface CmsToScope { connectionId: string; serverOrigin: string; siteOrigin: string; scopeRevision: string; lane: string }
/** Captured by the native writer BEFORE first dispatch, never retrofitted to old intents. */
export interface CmsToNativeIntent { census: NativeSourceCensus; relativePath: string; dev: string; ino: string; contentSha256: string }
export interface CmsToQualification {
  version: 1; parent: string; priorScope: CmsToScope; scope: CmsToScope; checkedAt: string;
  native: { census: NativeSourceCensus; relativePath: string; dev: string | null; ino: string | null; contentSha256: string | null; censusSha256: string };
  identity: { externalId: string; resourceId: string | null; topicId: string | null; canonicalUrl: string };
  record: CmsToRecordMetadata | null; pending: CmsToBody | null; nativeCapture: SourceNativeCapture | null;
  sha256: string;
}
const stableScope = ({ scopeRevision: _revision, ...scope }: CmsToScope) => scope;
export const effectiveToScope = (to: CmsToState): CmsToScope => to.qualifications?.at(-1)?.scope ?? to.scope;
const qualificationHash = ({ sha256: _hash, ...proof }: CmsToQualification) => sourceHash(semanticIdentity(proof));
const anchor = (scope: CmsToScope) => sourceHash(semanticIdentity(scope));
function validateScope(scope: CmsToScope) {
  validateCms("ConnectionId", scope.connectionId); validateCms("Revision", scope.scopeRevision); validateCms("Lane", scope.lane);
  if (cmsServiceBaseUrl(scope.serverOrigin).origin !== scope.serverOrigin || cmsUrl(scope.siteOrigin).origin !== scope.siteOrigin) throw new Error("Native authority scope origins require reconciliation.");
}
export function validateToNativeIntent(intent: CmsToNativeIntent) {
  const root = intent.census;
  if (!root || !path.isAbsolute(root.docsDir) || typeof root.routeBase !== "string" || !/^\d+$/u.test(root.rootDev) || !/^[1-9]\d*$/u.test(root.rootIno)
    || typeof intent.relativePath !== "string" || !intent.relativePath || path.isAbsolute(intent.relativePath) || intent.relativePath.split(/[\\/]/u).includes("..")
    || !/^\d+$/u.test(intent.dev) || !/^[1-9]\d*$/u.test(intent.ino)) throw new Error("Pending native source intent requires its original root/file provenance.");
  cmsServiceBaseUrl(root.siteBase); validateCms("Sha256", intent.contentSha256);
}
/** Verify the historical chain against itself, not against later legitimate editions. */
export function validateToQualifications(to: CmsToState) {
  validateScope(to.scope);
  if (to.qualifications !== undefined && (!Array.isArray(to.qualifications) || !to.qualifications.length)) throw new Error("Native authority qualification chain requires reconciliation.");
  let scope = to.scope, parent = anchor(scope);
  for (const proof of to.qualifications ?? []) {
    if (proof.version !== 1 || proof.parent !== parent || semanticIdentity(proof.priorScope) !== semanticIdentity(scope)
      || semanticIdentity(stableScope(proof.scope)) !== semanticIdentity(stableScope(scope)) || proof.scope.scopeRevision === scope.scopeRevision
      || proof.sha256 !== qualificationHash(proof)) throw new Error("Native authority qualification chain is not an exact linear historical record.");
    validateScope(proof.scope); validateCms("Instant", proof.checkedAt); validateCms("Sha256", proof.native.censusSha256);
    const n = proof.native;
    validateToNativeIntent({ census: n.census, relativePath: n.relativePath, dev: n.dev ?? "0", ino: n.ino ?? "1", contentSha256: n.contentSha256 ?? "0".repeat(64) });
    if ((n.dev === null || n.ino === null || n.contentSha256 === null) && !(n.dev === null && n.ino === null && n.contentSha256 === null)) throw new Error("Native absence qualification has inconsistent evidence.");
    validateCms("OpaqueId", proof.identity.externalId); validateCms("Url", proof.identity.canonicalUrl);
    if (proof.record) {
      validateCms("Record", proof.record);
      if (proof.record.direction !== "to_discourse" || proof.record.resource_id !== proof.identity.resourceId || proof.record.topic_id !== proof.identity.topicId
        || proof.record.external_id !== proof.identity.externalId) throw new Error("Historical authority qualification identity differs.");
    } else if (proof.identity.resourceId !== null || proof.identity.topicId !== null || !proof.pending) throw new Error("Initial authority qualification has no exact retained request.");
    if (proof.pending) { validateCms("ToResolve", proof.pending); if (proof.pending.bridge_record.external_id !== proof.identity.externalId) throw new Error("Historical authority request identity differs."); }
    if (proof.nativeCapture) validateSourceCapture(proof.nativeCapture);
    parent = proof.sha256; scope = proof.scope;
  }
}
export function currentToScope(client: CmsClient, connection: CmsConnection, siteUrl: string, lane?: string): CmsToScope {
  const site = cmsServiceBaseUrl(siteUrl), destination = cmsUrl(connection.destination_origin);
  if (connection.profile !== "astro" || !connection.directions.includes("to_discourse") || !sameCmsOrigin(destination.href, site.href)
    || destination.pathname !== "/" || destination.search || destination.hash) throw new Error("Current native source connection lacks its exact To authority/origin.");
  return { connectionId: connection.connection_id, serverOrigin: client.origin, siteOrigin: site.origin, scopeRevision: connection.scope_revision, lane: lane ?? connection.publication_lane };
}
export function assertToScope(to: CmsToState, client: CmsClient, connection: CmsConnection, siteUrl: string, lane?: string) {
  if (semanticIdentity(effectiveToScope(to)) !== semanticIdentity(currentToScope(client, connection, siteUrl, lane))) throw new Error("Current source lifecycle scope requires reconciliation.");
}

interface NativeAuthorityFacts {
  dev: string; ino: string; contentSha256: string; data: Record<string, unknown>; hasSlug: boolean;
  moveBefore: boolean; moveOutput: boolean;
}
interface NativeAuthorityObservation {
  filesSha256: string; identitiesSha256: string;
  targets: Map<string, NativeAuthorityFacts | null>; claimants: Map<string, Set<string>>;
}
const nativeOwner = (to: CmsToState | undefined) => to?.nativeSource ?? (to?.pending?.native && { docsDir: to.pending.native.census.docsDir, relativePath: to.pending.native.relativePath });
const ownerKey = (owner: { docsDir: string; relativePath: string }) => semanticIdentity([owner.docsDir, owner.relativePath]);

/** One complete, writer-bound observation per proof phase, never cached across
 * calls. Retain compact identity/target facts, not the entire corpus bodies. */
async function observeNativeAuthority(options: PublishControlledDiscussionsOptions, state: PublicationOperationalState, operations: PublicationOperation[]): Promise<NativeAuthorityObservation> {
  const docsDir = path.resolve(options.docsDir), census = state.nativeCensus, root = await lstat(docsDir, { bigint: true });
  if (!root.isDirectory() || root.isSymbolicLink() || semanticIdentity(census) !== semanticIdentity({ docsDir, siteBase: cmsServiceBaseUrl(options.siteUrl).href,
    routeBase: validateRouteBase(options.routeBase), rootDev: String(root.dev), rootIno: String(root.ino) })) throw new Error("Native authority requires the unchanged completed census/root.");
  const targets = new Map(operations.map(operation => [path.resolve(docsDir, nativeOwner(operation.to)!.relativePath), operation]));
  const facts = new Map<string, NativeAuthorityFacts | null>(), claimants = new Map<string, Set<string>>();
  const files = await findMarkdownFiles(docsDir), fileSet = new Set(files);
  for (const file of new Set([...files, ...targets.keys()])) {
    const actual = await nativePublicationFiles.readExisting(file);
    if (!actual) { if (fileSet.has(file)) throw new Error("Native authority census changed while checking ownership."); facts.set(file, null); continue; }
    const data = parseMarkdown(actual.contents).frontmatter;
    const claims = [["external", data.discussionbridgeExternalId], ["resource", data.discussionbridgeResourceId], ["topic", data.discourseTopicId === undefined ? undefined : String(data.discourseTopicId)]];
    for (const [kind, value] of claims) if (typeof value === "string") {
      const key = semanticIdentity([kind, value]); if (!claimants.has(key)) claimants.set(key, new Set()); claimants.get(key)!.add(file);
    }
    if (targets.has(file)) {
      const move = targets.get(file)!.to?.sourceMove;
      facts.set(file, { dev: String(actual.dev), ino: String(actual.ino), contentSha256: sourceHash(actual.contents), hasSlug: Object.hasOwn(data, "slug"),
        data: Object.fromEntries(["discussionbridgeExternalId", "discussionbridgeResourceId", "discourseTopicId", "discourseTopicUrl", "discussionbridgeSourcePublicationRevision", "slug"].map(key => [key, data[key]])),
        moveBefore: !!move && actual.contents === move.before, moveOutput: !!move && actual.contents === move.output });
    }
  }
  const checkedRoot = await lstat(docsDir, { bigint: true });
  if (checkedRoot.dev !== root.dev || checkedRoot.ino !== root.ino || semanticIdentity(await findMarkdownFiles(docsDir)) !== semanticIdentity(files)) throw new Error("Native authority corpus/root changed during observation.");
  return { filesSha256: sourceHash(semanticIdentity(files)), identitiesSha256: sourceHash(semanticIdentity([...claimants].map(([key, values]) => [key, [...values]]))), targets: facts, claimants };
}

function qualificationContext(options: PublishControlledDiscussionsOptions, state: PublicationOperationalState, operation: PublicationOperation,
  client: CmsClient, connection: CmsConnection, owners: Map<string, number>) {
  const to = operation.to;
  if (!to) return;
  const prior = effectiveToScope(to), scope = currentToScope(client, connection, options.siteUrl, options.controlledCreation.lane);
  if (semanticIdentity(stableScope(prior)) !== semanticIdentity(stableScope(scope))) throw new Error("Native source connection identity/origin/lane changed; automatic qualification is not permitted.");
  if (prior.scopeRevision === scope.scopeRevision) return;
  const docsDir = path.resolve(options.docsDir), census = state.nativeCensus, intent = to.pending?.native;
  const owner = to.nativeSource ?? (intent && { docsDir: intent.census.docsDir, relativePath: intent.relativePath });
  if (!census || !owner || owner.docsDir !== docsDir || !to.nativeSource && !intent) throw new Error("Native authority qualification lacks durable original native ownership; no historical intent is reconstructed.");
  const file = path.resolve(docsDir, owner.relativePath), relativePath = path.relative(docsDir, file);
  if (!relativePath || relativePath !== owner.relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/u).includes("..")) throw new Error("Native authority owner path requires reconciliation.");
  if (owners.get(ownerKey(owner)) !== 1) throw new Error("Native authority requires exactly one durable source owner.");
  const readNative = (observation: NativeAuthorityObservation) => {
    const actual = observation.targets.get(file);
    for (const [kind, value] of [["external", operation.externalId], ["resource", operation.resourceId], ["topic", operation.topicId]]) if (value !== undefined
      && [...(observation.claimants.get(semanticIdentity([kind, value])) ?? [])].some(other => other !== file)) throw new Error("Native authority census contains another claimant for the retained identity.");
    const move = to.sourceMove, moving = move && !["committed", "aborted"].includes(move.phase);
    if (moving) {
      if (!actual || move.fence !== to.sourceFence || !actual.moveBefore && !actual.moveOutput
        || !["intent", "reserved", "abort_pending", "attention"].includes(move.phase) && !actual.moveOutput) throw new Error("Native authority cannot requalify a changed or unfenced URL move.");
    } else if (!actual) {
      if (!to.nativeSource || !to.acceptedResult || !to.acceptedRevision || to.withdrawal && to.withdrawal.body.reason !== "source_deleted") throw new Error("Native absence has no retained accepted deletion owner.");
    } else if (!to.nativeSource) {
      if (!intent || semanticIdentity(intent.census) !== semanticIdentity(census) || intent.dev !== String(actual.dev) || intent.ino !== String(actual.ino)
        || intent.contentSha256 !== actual.contentSha256) throw new Error("Uncertain native intent changed; exact original provenance is required.");
    } else {
      const data = actual.data;
      const url = pageUrlForFile({ docsDir, filePath: file, siteBase: cmsServiceBaseUrl(options.siteUrl), routeBase: census.routeBase, slug: data.slug, hasSlug: actual.hasSlug });
      // An accepted02 may have been saved before the native CAS failed. Its
      // original pending-native intent is evidence, not guessed new frontmatter.
      const pendingCommit = intent && to.pending && to.acceptedBody?.mutation_id === to.pending.body.mutation_id
        && semanticIdentity(intent.census) === semanticIdentity(census) && intent.dev === String(actual.dev) && intent.ino === String(actual.ino)
        && intent.contentSha256 === actual.contentSha256;
      if (!pendingCommit && (data.discussionbridgeExternalId !== operation.externalId || data.discussionbridgeResourceId !== operation.resourceId || String(data.discourseTopicId) !== operation.topicId
        || data.discourseTopicUrl !== operation.topicUrl || data.discussionbridgeSourcePublicationRevision !== to.acceptedRevision || url !== operation.canonicalUrl)) throw new Error("Native authority metadata no longer owns its accepted binding.");
    }
    return { census: structuredClone(census), relativePath, dev: actual ? String(actual.dev) : null, ino: actual ? String(actual.ino) : null,
      contentSha256: actual ? actual.contentSha256 : null, censusSha256: observation.filesSha256 };
  };
  const readRecord = async () => {
    if (!operation.resourceId) {
      if (to.acceptedResult || to.acceptedRevision || !to.pending || !intent) throw new Error("Initial native intent lacks provable replay ownership; no receiver identity is adopted.");
      return null;
    }
    const record = await client.record(operation.resourceId); validateCms("Record", record);
    const move = to.sourceMove, moving = move && !["committed", "aborted"].includes(move.phase);
    const moved = moving && move.finalizeBody && record.source_revision === move.newRevision && record.canonical_url === move.prepareBody.new_url;
    const revision = moving ? moved ? move.newRevision : move.prepareBody.expected_source_revision : to.acceptedRevision;
    const url = moving ? moved ? move.prepareBody.new_url : move.prepareBody.old_url : operation.canonicalUrl;
    if (record.direction !== "to_discourse" || record.resource_id !== operation.resourceId || record.topic_id !== operation.topicId || record.topic_url !== operation.topicUrl
      || record.external_id !== operation.externalId || record.canonical_url !== url || record.state !== "active" && !(record.state === "withdrawn" && to.withdrawal)
      || record.source_revision !== revision && !(record.state === "active" && !moving && !to.withdrawal && !to.pending?.rejection && record.source_revision === to.pending?.body.bridge_record.source_revision)) throw new Error("Current scoped receiver binding differs from the exact retained source/intent.");
    return record;
  };
  return { operation, to, prior, scope, readNative, readRecord };
}

/** The complete pre-build batch shares only fresh writer-bound observations,
 * never saved authority. Targeted entry points use this same engine for one. */
export async function qualifyCurrentToAuthorities(options: PublishControlledDiscussionsOptions, state: PublicationOperationalState, operations: PublicationOperation[],
  client: CmsClient, connection: CmsConnection, persist: () => Promise<void>) {
  const candidates = operations.filter(operation => operation.to && semanticIdentity(effectiveToScope(operation.to)) !== semanticIdentity(currentToScope(client, connection, options.siteUrl, options.controlledCreation.lane)));
  if (!candidates.length) return;
  const owners = new Map<string, number>();
  for (const operation of Object.values(state.operations)) { const owner = nativeOwner(operation.to); if (owner) { const key = ownerKey(owner); owners.set(key, (owners.get(key) ?? 0) + 1); } }
  const contexts = candidates.map(operation => qualificationContext(options, state, operation, client, connection, owners)).filter(value => value !== undefined);
  if (!contexts.length) return;
  const initial = await observeNativeAuthority(options, state, contexts.map(value => value.operation));
  const captured = [];
  for (const context of contexts) captured.push({ context, native: context.readNative(initial), record: await context.readRecord() });
  for (const { context, record } of captured) {
    if (semanticIdentity(currentToScope(client, await client.connection(), options.siteUrl, options.controlledCreation.lane)) !== semanticIdentity(context.scope)
      || semanticIdentity(await context.readRecord()) !== semanticIdentity(record)) throw new Error("Current native/receiver authority changed during qualification; no proof was installed.");
  }
  const checked = await observeNativeAuthority(options, state, contexts.map(value => value.operation));
  if (checked.identitiesSha256 !== initial.identitiesSha256) throw new Error("Native authority census identity changed during qualification.");
  for (const { context, native } of captured) if (semanticIdentity(context.readNative(checked)) !== semanticIdentity(native)) throw new Error("Current native/receiver authority changed during qualification; no proof was installed.");
  for (const { context: { operation, to, prior, scope }, native, record } of captured) {
    const proof: CmsToQualification = { version: 1, parent: to.qualifications?.at(-1)?.sha256 ?? anchor(to.scope), priorScope: structuredClone(prior), scope,
      checkedAt: new Date().toISOString(), native, identity: { externalId: operation.externalId, resourceId: operation.resourceId ?? null, topicId: operation.topicId ?? null, canonicalUrl: operation.canonicalUrl },
      record: structuredClone(record), pending: structuredClone(to.pending?.body ?? null), nativeCapture: structuredClone(to.nativeCapture ?? null), sha256: "" };
    proof.sha256 = qualificationHash(proof); (to.qualifications ??= []).push(proof);
  }
  await persist(); // A failed save stops use; never rewrite or guess its durable outcome.
  for (const { context, record } of captured) {
    assertToScope(context.to, client, await client.connection(), options.siteUrl, options.controlledCreation.lane);
    if (semanticIdentity(await context.readRecord()) !== semanticIdentity(record)) throw new Error("Native/receiver ownership changed after durable qualification; current use is refused.");
  }
  const committed = await observeNativeAuthority(options, state, contexts.map(value => value.operation));
  if (committed.identitiesSha256 !== initial.identitiesSha256) throw new Error("Native authority census identity changed after durable qualification; current use is refused.");
  for (const { context, native } of captured) if (semanticIdentity(context.readNative(committed)) !== semanticIdentity(native)) throw new Error("Native/receiver ownership changed after durable qualification; current use is refused.");
}

export async function qualifyCurrentToAuthority(options: PublishControlledDiscussionsOptions, state: PublicationOperationalState, operation: PublicationOperation,
  client: CmsClient, connection: CmsConnection, persist: () => Promise<void>) {
  return qualifyCurrentToAuthorities(options, state, [operation], client, connection, persist);
}
