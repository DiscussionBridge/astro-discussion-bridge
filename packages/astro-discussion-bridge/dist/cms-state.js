import { createHash, randomUUID } from "node:crypto";
import { lstat, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { withPublicationOperationalStateLock } from "./native-locks.js";
import { semanticIdentity, validateCms } from "../src/private/cms-runtime.mjs";
import { nativePublicationFiles } from "./native-publication.js";
import { cmsOrigin, sameCmsOrigin } from "./native-url.js";
import { assertNativeArticleCapture } from "./native-preparation.js";
export function emptyCmsState(client, destinationOrigin, connectionId) {
    const origin = cmsOrigin(destinationOrigin);
    return { schemaVersion: 1, wireVersion: "v4", adapterId: "astro-cms-static", connectionId, serviceOrigin: client.origin, destinationOrigin: origin,
        scopeRevision: null, policyRevision: null, stream: "initial", cursor: null, checkpoint: null,
        events: Object.create(null), sources: Object.create(null), mappings: Object.create(null), generations: Object.create(null), transactions: Object.create(null) };
}
export async function readCmsState(file, expected) {
    await nativePublicationFiles.assertDirectory(path.dirname(file));
    let handle;
    try {
        const before = await lstat(file);
        if (!before.isFile() || before.isSymbolicLink())
            throw new Error("CMS native journal requires an unlinked regular file.");
        handle = await open(file, "r");
        const opened = await handle.stat();
        if (opened.dev !== before.dev || opened.ino !== before.ino)
            throw new Error("CMS native journal was replaced before read.");
        const state = JSON.parse(await handle.readFile("utf8"));
        if (state.schemaVersion !== 1 || state.wireVersion !== "v4" || state.adapterId !== expected.adapterId || state.connectionId !== expected.connectionId || state.serviceOrigin !== expected.serviceOrigin || state.destinationOrigin !== expected.destinationOrigin)
            throw new Error("CMS native journal scope requires reconciliation.");
        for (const name of ["events", "sources", "mappings", "generations", "transactions"]) {
            if (!state[name] || typeof state[name] !== "object" || Array.isArray(state[name]))
                throw new Error("CMS native journal requires reconciliation.");
            state[name] = Object.assign(Object.create(null), state[name]);
        }
        if (!["initial", "changes"].includes(state.stream))
            throw new Error("CMS journal feed stream is invalid.");
        for (const cursor of [state.cursor, state.checkpoint])
            if (cursor !== null)
                validateCms("Cursor", cursor);
        if (state.stream === "changes" && state.cursor === null && state.checkpoint === null)
            throw new Error("CMS changes require a durable checkpoint.");
        for (const [id, event] of Object.entries(state.events)) {
            validateCms("SourceEvent", event);
            if (id !== event.event_id)
                throw new Error("CMS event identity is inconsistent.");
        }
        for (const [id, event] of Object.entries(state.sources)) {
            validateCms("SourceEvent", event);
            if (id !== sourceId(event))
                throw new Error("CMS source identity is inconsistent.");
        }
        for (const [id, mapping] of Object.entries(state.mappings)) {
            validateCms("Mapping", mapping);
            if (id !== mapping.source_id || mapping.connection_id !== state.connectionId)
                throw new Error("CMS mapping journal identity is inconsistent.");
        }
        for (const [id, generation] of Object.entries(state.generations)) {
            validateCms("UUID", id);
            validateCms("UInt", generation);
        }
        for (const [id, transaction] of Object.entries(state.transactions)) {
            validateCms("Lease", transaction.lease);
            validateCms("UUID", transaction.transactionId);
            if (id !== transaction.lease.work.work_id || !["claimed", "staged", "prepared", "verified", "aborted", "attention"].includes(transaction.stage) || transaction.lease.lease_generation > (state.generations[transaction.lease.work.mapping_id] ?? 0))
                throw new Error("CMS transaction journal is inconsistent.");
            if (transaction.articleCapture)
                assertNativeArticleCapture(transaction.articleCapture);
            if (transaction.attentionRecovery !== undefined) {
                validateCms("AttentionRecovery", transaction.attentionRecovery);
                const recovery = transaction.attentionRecovery;
                if (recovery.work.work_id !== id || recovery.predecessor_work_id === id || recovery.work.attempt_cycle !== transaction.lease.work.attempt_cycle
                    || recovery.work.mapping_id !== transaction.lease.work.mapping_id || recovery.work.source_revision !== transaction.lease.work.source_revision)
                    throw new Error("CMS attention successor provenance requires reconciliation.");
            }
            if (transaction.localLimitation) {
                const held = transaction.localLimitation;
                validateCms("Source", held.source);
                validateCms("Instant", held.recordedAt);
                if (!["media_preservation", "native_preparation"].includes(held.kind) || typeof held.detail !== "string" || typeof held.content !== "string" || held.source.source_id !== transaction.lease.work.source_id || held.source.source_revision !== transaction.lease.work.source_revision
                    || Buffer.byteLength(held.content, "utf8") !== held.source.content_bytes || createHash("sha256").update(held.content, "utf8").digest("hex") !== held.source.content_sha256)
                    throw new Error("CMS local limitation source requires reconciliation.");
            }
        }
        if (state.reservations !== undefined) {
            if (!state.reservations || typeof state.reservations !== "object" || Array.isArray(state.reservations))
                throw new Error("CMS reservation journal is invalid.");
            state.reservations = Object.assign(Object.create(null), state.reservations);
            for (const [id, operation] of Object.entries(state.reservations)) {
                validateCms("MappingPrepare", operation.body);
                if (id !== operation.body.source_id)
                    throw new Error("CMS reservation source identity is inconsistent.");
            }
        }
        if (state.pendingClaim !== undefined)
            validateCms("Claim", state.pendingClaim.body);
        if (state.nativeLocations !== undefined) {
            if (!state.nativeLocations || typeof state.nativeLocations !== "object" || Array.isArray(state.nativeLocations))
                throw new Error("CMS native URL ancestry is invalid.");
            state.nativeLocations = Object.assign(Object.create(null), state.nativeLocations);
            for (const [id, location] of Object.entries(state.nativeLocations)) {
                validateCms("OpaqueId", id);
                validateCms("Url", location.canonicalUrl);
                validateCms("OpaqueId", location.nativeId);
                validateCms("UUID", location.moveId);
                validateCms("Revision", location.mappingRevision);
                if (!sameCmsOrigin(location.canonicalUrl, state.destinationOrigin))
                    throw new Error("CMS native URL ancestry changed origin.");
            }
        }
        if (state.nativeCommand !== undefined) {
            const owner = state.nativeCommand;
            if (!owner || typeof owner !== "object" || !["starting", "running", "succeeded", "failed", "uncertain"].includes(owner.phase) || !Array.isArray(owner.workIds) || owner.workIds.some(id => !Object.hasOwn(state.transactions, id))
                || typeof owner.executable !== "string" || !path.isAbsolute(owner.executable) || typeof owner.cwd !== "string" || !path.isAbsolute(owner.cwd) || !Array.isArray(owner.args) || owner.args.some(value => typeof value !== "string" || value.includes("\0"))
                || owner.pid !== undefined && (!Number.isSafeInteger(owner.pid) || owner.pid < 1))
                throw new Error("CMS native command owner journal requires reconciliation.");
            validateCms("UUID", owner.commandId);
            validateCms("UUID", owner.deploymentId);
            validateCms("Instant", owner.startedAt);
            const phases = owner.phases;
            if (phases !== undefined && (!phases || typeof phases !== "object" || Array.isArray(phases) || Object.keys(phases).length !== owner.workIds.length || owner.workIds.some(id => !["move", "publication"].includes(phases[id]))))
                throw new Error("CMS native command phase bindings are invalid.");
            if (owner.completedAt !== undefined)
                validateCms("Instant", owner.completedAt);
            if (owner.phase === "succeeded")
                validateCms("Instant", owner.deployedAt);
            if (owner.terminationConfirmed !== undefined && typeof owner.terminationConfirmed !== "boolean")
                throw new Error("CMS native child closure journal requires reconciliation.");
            if (owner.terminationConfirmed)
                validateCms("Instant", owner.childClosedAt);
        }
        return state;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return expected;
        throw error;
    }
    finally {
        await handle?.close();
    }
}
/** Same native state-file exclusion mechanism as preserved To operation state. */
export const withCmsStateLock = withPublicationOperationalStateLock;
export async function writeCmsState(file, state) {
    await nativePublicationFiles.assertDirectory(path.dirname(file));
    await nativePublicationFiles.mkdir(path.dirname(file));
    await nativePublicationFiles.assertDirectory(path.dirname(file));
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
    let handle;
    try {
        handle = await open(temporary, "wx", 0o600);
        await handle.writeFile(JSON.stringify(state) + "\n", "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        await rename(temporary, file);
        try {
            const directory = await open(path.dirname(file), "r");
            try {
                await directory.sync();
            }
            finally {
                await directory.close();
            }
        }
        catch (error) {
            if (process.platform !== "win32")
                throw error;
        }
    }
    catch (error) {
        await handle?.close().catch(() => undefined);
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
    }
}
export function assertCmsConnection(connection, state) {
    if (connection.connection_id !== state.connectionId || connection.profile !== "astro" || !sameCmsOrigin(connection.destination_origin, state.destinationOrigin)
        || !connection.directions.includes("from_discourse") || !connection.policy.enabled || connection.policy.publication_kind !== "static" || connection.native_capabilities.publication_kind !== "static"
        || !connection.native_capabilities.supported_presentations.includes(connection.policy.presentation_mode) || !connection.native_capabilities.complete_content_supported)
        throw new Error("CMS receiver-authorized Astro static publication is unavailable.");
    if (state.scopeRevision !== null && state.scopeRevision !== connection.scope_revision || state.policyRevision !== null && state.policyRevision !== connection.policy.policy_revision)
        throw new Error("CMS scope or policy changed; source and prepared work require reconciliation.");
}
const sourceId = (event) => event.event_type === "publication" ? event.source.source_id : event.source_id;
export function stageCmsFeedPage(state, feed) {
    validateCms("SourceFeed", feed);
    if (feed.stream !== state.stream)
        throw new Error("CMS source stream changed during continuation.");
    const knownMaximum = Object.values(state.events).reduce((maximum, event) => {
        const current = BigInt(event.event_sequence);
        return current > maximum ? current : maximum;
    }, 0n);
    const events = Object.assign(Object.create(null), state.events);
    const sources = Object.assign(Object.create(null), state.sources);
    let sequence;
    for (const event of feed.items) {
        const current = BigInt(event.event_sequence);
        if (feed.stream === "changes" && sequence !== undefined && current <= sequence)
            throw new Error("CMS change events are not strictly increasing.");
        sequence = current;
        const prior = events[event.event_id];
        if (prior && semanticIdentity(prior) !== semanticIdentity(event))
            throw new Error("CMS event replay changed its identity.");
        if (feed.stream === "changes" && !prior && current <= knownMaximum)
            throw new Error("CMS change continuation moved behind staged events.");
        events[event.event_id] = event;
        const id = sourceId(event);
        const previous = sources[id];
        if (!previous || BigInt(previous.event_sequence) < current)
            sources[id] = event;
        else if (BigInt(previous.event_sequence) === current && semanticIdentity(previous) !== semanticIdentity(event))
            throw new Error("CMS source sequence conflicts with durable event.");
    }
    // Caller commits this page's complete staged events and continuation together.
    // A persisted changes checkpoint never skips unstaged members.
    state.events = events;
    state.sources = sources;
    state.cursor = feed.next_cursor;
    if (feed.checkpoint_cursor !== null)
        state.checkpoint = feed.checkpoint_cursor;
    if (feed.next_cursor === null)
        state.stream = "changes";
}
export function stageCmsClaim(state, lease) {
    validateCms("Lease", lease);
    const priorGeneration = state.generations[lease.work.mapping_id] ?? 0;
    const existing = state.transactions[lease.work.work_id];
    if (lease.lease_generation < priorGeneration || lease.work.lease_generation !== lease.lease_generation)
        throw new Error("CMS native generation is stale.");
    if (lease.lease_generation === priorGeneration && (!existing || existing.lease.lease_token !== lease.lease_token))
        throw new Error("CMS native generation cannot be reassigned.");
    if (existing && (existing.lease.work.source_revision !== lease.work.source_revision || existing.lease.work.policy_revision !== lease.work.policy_revision || existing.lease.work.mapping_id !== lease.work.mapping_id))
        throw new Error("CMS prepared work identity changed.");
    state.generations[lease.work.mapping_id] = lease.lease_generation;
    const transaction = existing ?? { lease, transactionId: randomUUID(), stage: "claimed" };
    transaction.lease = lease;
    state.transactions[lease.work.work_id] = transaction;
    return transaction;
}
