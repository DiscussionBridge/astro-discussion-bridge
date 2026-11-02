import path from "node:path";
import { lstat } from "node:fs/promises";
import { semanticIdentity, validateCms } from "../src/private/cms-runtime.mjs";
import { nativePublicationFiles } from "./native-publication.js";
import { findMarkdownFiles, parseMarkdown, pageUrlForFile, validateRouteBase } from "./native-source.js";
import { cmsServiceBaseUrl, cmsUrl, sameCmsOrigin } from "./native-url.js";
import { sourceHash, validateSourceCapture } from "./to-source-profile.js";
const stableScope = ({ scopeRevision: _revision, ...scope }) => scope;
export const effectiveToScope = (to) => to.qualifications?.at(-1)?.scope ?? to.scope;
const qualificationHash = ({ sha256: _hash, ...proof }) => sourceHash(semanticIdentity(proof));
const anchor = (scope) => sourceHash(semanticIdentity(scope));
function validateScope(scope) {
    validateCms("ConnectionId", scope.connectionId);
    validateCms("Revision", scope.scopeRevision);
    validateCms("Lane", scope.lane);
    if (cmsServiceBaseUrl(scope.serverOrigin).origin !== scope.serverOrigin || cmsUrl(scope.siteOrigin).origin !== scope.siteOrigin)
        throw new Error("Native authority scope origins require reconciliation.");
}
export function validateToNativeIntent(intent) {
    const root = intent.census;
    if (!root || !path.isAbsolute(root.docsDir) || typeof root.routeBase !== "string" || !/^\d+$/u.test(root.rootDev) || !/^[1-9]\d*$/u.test(root.rootIno)
        || typeof intent.relativePath !== "string" || !intent.relativePath || path.isAbsolute(intent.relativePath) || intent.relativePath.split(/[\\/]/u).includes("..")
        || !/^\d+$/u.test(intent.dev) || !/^[1-9]\d*$/u.test(intent.ino))
        throw new Error("Pending native source intent requires its original root/file provenance.");
    cmsServiceBaseUrl(root.siteBase);
    validateCms("Sha256", intent.contentSha256);
}
/** Verify the historical chain against itself, not against later legitimate editions. */
export function validateToQualifications(to) {
    validateScope(to.scope);
    if (to.qualifications !== undefined && (!Array.isArray(to.qualifications) || !to.qualifications.length))
        throw new Error("Native authority qualification chain requires reconciliation.");
    let scope = to.scope, parent = anchor(scope);
    for (const proof of to.qualifications ?? []) {
        if (proof.version !== 1 || proof.parent !== parent || semanticIdentity(proof.priorScope) !== semanticIdentity(scope)
            || semanticIdentity(stableScope(proof.scope)) !== semanticIdentity(stableScope(scope)) || proof.scope.scopeRevision === scope.scopeRevision
            || proof.sha256 !== qualificationHash(proof))
            throw new Error("Native authority qualification chain is not an exact linear historical record.");
        validateScope(proof.scope);
        validateCms("Instant", proof.checkedAt);
        validateCms("Sha256", proof.native.censusSha256);
        const n = proof.native;
        validateToNativeIntent({ census: n.census, relativePath: n.relativePath, dev: n.dev ?? "0", ino: n.ino ?? "1", contentSha256: n.contentSha256 ?? "0".repeat(64) });
        if ((n.dev === null || n.ino === null || n.contentSha256 === null) && !(n.dev === null && n.ino === null && n.contentSha256 === null))
            throw new Error("Native absence qualification has inconsistent evidence.");
        validateCms("OpaqueId", proof.identity.externalId);
        validateCms("Url", proof.identity.canonicalUrl);
        if (proof.record) {
            validateCms("Record", proof.record);
            if (proof.record.direction !== "to_discourse" || proof.record.resource_id !== proof.identity.resourceId || proof.record.topic_id !== proof.identity.topicId
                || proof.record.external_id !== proof.identity.externalId)
                throw new Error("Historical authority qualification identity differs.");
        }
        else if (proof.identity.resourceId !== null || proof.identity.topicId !== null || !proof.pending)
            throw new Error("Initial authority qualification has no exact retained request.");
        if (proof.pending) {
            validateCms("ToResolve", proof.pending);
            if (proof.pending.bridge_record.external_id !== proof.identity.externalId)
                throw new Error("Historical authority request identity differs.");
        }
        if (proof.nativeCapture)
            validateSourceCapture(proof.nativeCapture);
        parent = proof.sha256;
        scope = proof.scope;
    }
}
export function currentToScope(client, connection, siteUrl, lane) {
    const site = cmsServiceBaseUrl(siteUrl), destination = cmsUrl(connection.destination_origin);
    if (connection.profile !== "astro" || !connection.directions.includes("to_discourse") || !sameCmsOrigin(destination.href, site.href)
        || destination.pathname !== "/" || destination.search || destination.hash)
        throw new Error("Current native source connection lacks its exact To authority/origin.");
    return { connectionId: connection.connection_id, serverOrigin: client.origin, siteOrigin: site.origin, scopeRevision: connection.scope_revision, lane: lane ?? connection.publication_lane };
}
export function assertToScope(to, client, connection, siteUrl, lane) {
    if (semanticIdentity(effectiveToScope(to)) !== semanticIdentity(currentToScope(client, connection, siteUrl, lane)))
        throw new Error("Current source lifecycle scope requires reconciliation.");
}
/** Caller holds the actual native source writer. This grants current authority,
 * never continuity, acceptance, a new source edition, or a replay replacement. */
export async function qualifyCurrentToAuthority(options, state, operation, client, connection, persist) {
    const to = operation.to;
    if (!to)
        return;
    const prior = effectiveToScope(to), scope = currentToScope(client, connection, options.siteUrl, options.controlledCreation.lane);
    if (semanticIdentity(stableScope(prior)) !== semanticIdentity(stableScope(scope)))
        throw new Error("Native source connection identity/origin/lane changed; automatic qualification is not permitted.");
    if (prior.scopeRevision === scope.scopeRevision)
        return;
    const docsDir = path.resolve(options.docsDir), census = state.nativeCensus, intent = to.pending?.native;
    const owner = to.nativeSource ?? (intent && { docsDir: intent.census.docsDir, relativePath: intent.relativePath });
    if (!census || !owner || owner.docsDir !== docsDir || !to.nativeSource && !intent)
        throw new Error("Native authority qualification lacks durable original native ownership; no historical intent is reconstructed.");
    const file = path.resolve(docsDir, owner.relativePath), relativePath = path.relative(docsDir, file);
    if (!relativePath || relativePath !== owner.relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/u).includes(".."))
        throw new Error("Native authority owner path requires reconciliation.");
    if (Object.values(state.operations).filter(value => value.to?.nativeSource?.docsDir === docsDir && value.to.nativeSource.relativePath === relativePath
        || !value.to?.nativeSource && value.to?.pending?.native?.census.docsDir === docsDir && value.to.pending.native.relativePath === relativePath).length !== 1)
        throw new Error("Native authority requires exactly one durable source owner.");
    const readNative = async () => {
        const root = await lstat(docsDir, { bigint: true });
        if (!root.isDirectory() || root.isSymbolicLink() || semanticIdentity(census) !== semanticIdentity({ docsDir, siteBase: cmsServiceBaseUrl(options.siteUrl).href,
            routeBase: validateRouteBase(options.routeBase), rootDev: String(root.dev), rootIno: String(root.ino) }))
            throw new Error("Native authority requires the unchanged completed census/root.");
        const actual = await nativePublicationFiles.readExisting(file), files = await findMarkdownFiles(docsDir);
        // A duplicate/copied identity is not ownership, including targeted actions.
        for (const other of files)
            if (other !== file) {
                const value = await nativePublicationFiles.readExisting(other);
                if (!value)
                    throw new Error("Native authority census changed while checking ownership.");
                const data = parseMarkdown(value.contents).frontmatter;
                if (data.discussionbridgeExternalId === operation.externalId || operation.resourceId && data.discussionbridgeResourceId === operation.resourceId
                    || operation.topicId && String(data.discourseTopicId) === operation.topicId)
                    throw new Error("Native authority census contains another claimant for the retained identity.");
            }
        const move = to.sourceMove, moving = move && !["committed", "aborted"].includes(move.phase);
        if (moving) {
            if (!actual || move.fence !== to.sourceFence || actual.contents !== move.before && actual.contents !== move.output
                || !["intent", "reserved", "abort_pending", "attention"].includes(move.phase) && actual.contents !== move.output)
                throw new Error("Native authority cannot requalify a changed or unfenced URL move.");
        }
        else if (!actual) {
            if (!to.nativeSource || !to.acceptedResult || !to.acceptedRevision || to.withdrawal && to.withdrawal.body.reason !== "source_deleted")
                throw new Error("Native absence has no retained accepted deletion owner.");
        }
        else if (!to.nativeSource) {
            if (!intent || semanticIdentity(intent.census) !== semanticIdentity(census) || intent.dev !== String(actual.dev) || intent.ino !== String(actual.ino)
                || intent.contentSha256 !== sourceHash(actual.contents))
                throw new Error("Uncertain native intent changed; exact original provenance is required.");
        }
        else {
            const data = parseMarkdown(actual.contents).frontmatter;
            const url = pageUrlForFile({ docsDir, filePath: file, siteBase: cmsServiceBaseUrl(options.siteUrl), routeBase: census.routeBase, slug: data.slug, hasSlug: Object.hasOwn(data, "slug") });
            // An accepted02 may have been saved before the native CAS failed. Its
            // original pending-native intent is evidence, not guessed new frontmatter.
            const pendingCommit = intent && to.pending && to.acceptedBody?.mutation_id === to.pending.body.mutation_id
                && semanticIdentity(intent.census) === semanticIdentity(census) && intent.dev === String(actual.dev) && intent.ino === String(actual.ino)
                && intent.contentSha256 === sourceHash(actual.contents);
            if (!pendingCommit && (data.discussionbridgeExternalId !== operation.externalId || data.discussionbridgeResourceId !== operation.resourceId || String(data.discourseTopicId) !== operation.topicId
                || data.discourseTopicUrl !== operation.topicUrl || data.discussionbridgeSourcePublicationRevision !== to.acceptedRevision || url !== operation.canonicalUrl))
                throw new Error("Native authority metadata no longer owns its accepted binding.");
        }
        return { census: structuredClone(census), relativePath, dev: actual ? String(actual.dev) : null, ino: actual ? String(actual.ino) : null,
            contentSha256: actual ? sourceHash(actual.contents) : null, censusSha256: sourceHash(semanticIdentity(files)) };
    };
    const readRecord = async () => {
        if (!operation.resourceId) {
            if (to.acceptedResult || to.acceptedRevision || !to.pending || !intent)
                throw new Error("Initial native intent lacks provable replay ownership; no receiver identity is adopted.");
            return null;
        }
        const record = await client.record(operation.resourceId);
        validateCms("Record", record);
        const move = to.sourceMove, moving = move && !["committed", "aborted"].includes(move.phase);
        const moved = moving && move.finalizeBody && record.source_revision === move.newRevision && record.canonical_url === move.prepareBody.new_url;
        const revision = moving ? moved ? move.newRevision : move.prepareBody.expected_source_revision : to.acceptedRevision;
        const url = moving ? moved ? move.prepareBody.new_url : move.prepareBody.old_url : operation.canonicalUrl;
        if (record.direction !== "to_discourse" || record.resource_id !== operation.resourceId || record.topic_id !== operation.topicId || record.topic_url !== operation.topicUrl
            || record.external_id !== operation.externalId || record.canonical_url !== url || record.state !== "active" && !(record.state === "withdrawn" && to.withdrawal)
            || record.source_revision !== revision && !(record.state === "active" && !moving && !to.withdrawal && !to.pending?.rejection && record.source_revision === to.pending?.body.bridge_record.source_revision))
            throw new Error("Current scoped receiver binding differs from the exact retained source/intent.");
        return record;
    };
    const native = await readNative(), record = await readRecord();
    const checkedConnection = await client.connection();
    if (semanticIdentity(currentToScope(client, checkedConnection, options.siteUrl, options.controlledCreation.lane)) !== semanticIdentity(scope)
        || semanticIdentity(await readRecord()) !== semanticIdentity(record) || semanticIdentity(await readNative()) !== semanticIdentity(native))
        throw new Error("Current native/receiver authority changed during qualification; no proof was installed.");
    const proof = { version: 1, parent: to.qualifications?.at(-1)?.sha256 ?? anchor(to.scope), priorScope: structuredClone(prior), scope,
        checkedAt: new Date().toISOString(), native, identity: { externalId: operation.externalId, resourceId: operation.resourceId ?? null, topicId: operation.topicId ?? null, canonicalUrl: operation.canonicalUrl },
        record: structuredClone(record), pending: structuredClone(to.pending?.body ?? null), nativeCapture: structuredClone(to.nativeCapture ?? null), sha256: "" };
    proof.sha256 = qualificationHash(proof);
    (to.qualifications ??= []).push(proof);
    await persist(); // A failed save stops use; never rewrite or guess its durable outcome.
    // Qualification is durable before use; a post-save race must still stop use.
    assertToScope(to, client, await client.connection(), options.siteUrl, options.controlledCreation.lane);
    if (semanticIdentity(await readRecord()) !== semanticIdentity(record) || semanticIdentity(await readNative()) !== semanticIdentity(native))
        throw new Error("Native/receiver ownership changed after durable qualification; current use is refused.");
}
