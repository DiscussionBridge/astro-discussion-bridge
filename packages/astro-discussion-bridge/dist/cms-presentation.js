import { randomUUID } from "node:crypto";
import { stringify as stringifyYaml } from "yaml";
import path from "node:path";
import { claimCmsNativeWork, cmsNativeLocation, cmsNativeReservation, withCmsCoordinator } from "./cms-coordinator.js";
import { cmsAuthority, cmsStaticNative as native } from "./cms-static.js";
import { nativePublicationFiles } from "./native-publication.js";
import { hasRelativeCopiedReferences } from "./native-preparation.js";
import { findMarkdownFiles } from "./native-source.js";
import { verifyCmsPublication } from "./cms-verification.js";
import { nativeOwnershipReceiptSha256, validateCms } from "../src/private/cms-runtime.mjs";
import { cmsUrl, sameCmsOrigin } from "./native-url.js";
export const presentationOf = (transaction) => transaction.presentationMove;
const encode = (fields, body) => `---\n${stringifyYaml(fields).trim()}\n---\n${body}`;
function ownership(contents) {
    const fields = nativePublicationFiles.metadata(contents);
    const receipt = fields.discussionbridgeCmsOwnership;
    const result = { resource_id: receipt.resource_id, external_id: receipt.external_id, native_id: receipt.native_id, canonical_url: receipt.canonical_url,
        source_revision: receipt.source_revision, ownership_receipt_sha256: fields.discussionbridgeCmsOwnershipSha256 };
    validateCms("Ownership", result);
    return result;
}
function checkedMove(state, transaction, options) {
    const move = presentationOf(transaction);
    if (!move)
        throw new Error("CMS native presentation move is unavailable.");
    validateCms("UrlMovePrepare", move.prepare);
    validateCms("Source", move.source);
    validateCms("Mapping", move.mapping);
    const reserved = cmsNativeReservation(options, { source_id: transaction.lease.work.source_id });
    if (move.file !== reserved.file || move.mapping.source_id !== transaction.lease.work.source_id || move.source.source_id !== move.mapping.source_id || move.mapping.mapping_id !== transaction.lease.work.mapping_id
        || move.mapping.connection_id !== state.connectionId || move.mapping.destination_native_id !== reserved.nativeId || move.mapping.external_id !== reserved.externalId
        || move.prepare.ownership.native_id !== reserved.nativeId || move.prepare.ownership.resource_id !== move.mapping.resource_id || move.prepare.ownership.external_id !== reserved.externalId
        || move.prepare.ownership.canonical_url !== move.prepare.old_url || move.mapping.canonical_url !== move.prepare.old_url || move.source.source_revision !== transaction.lease.work.source_revision
        || native.publicationBody(move.before) !== native.publicationBody(move.oldOutput) || move.output !== undefined && native.publicationBody(move.output) !== native.publicationBody(move.before))
        throw new Error("CMS durable URL move native path/source/article bindings require reconciliation.");
    if (move.prepare.authority.work_id !== transaction.lease.work.work_id || move.prepare.authority.lease_generation !== transaction.lease.lease_generation
        || state.generations[transaction.lease.work.mapping_id] !== transaction.lease.lease_generation)
        throw new Error("CMS URL move generation changed; applied replacement-generation recovery requires explicit reconciliation.");
    if (move.receipt)
        validateCms("UrlMove", move.receipt);
    return move;
}
export async function assertCmsPresentationCurrent(context, transaction, options) {
    const move = checkedMove(context.state, transaction, options), current = await context.client.query(transaction.lease.work.work_id);
    native.assertCurrent(context.state, transaction, current);
    if (current.work.state !== "leased" || !current.lease_expires_at || Date.parse(current.lease_expires_at) <= Date.now() || transaction.prepareBody || current.mapping.mapping_revision !== move.prepare.expected_mapping_revision || current.mapping.canonical_url !== move.prepare.old_url
        || current.mapping.synchronized_source_revision !== move.source.source_revision || current.work.source_revision !== move.source.source_revision
        || current.mapping.destination_native_id !== move.prepare.ownership.native_id || current.mapping.destination_native_revision !== move.mapping.destination_native_revision)
        throw new Error("CMS URL move current native/source/mapping CAS requires reconciliation.");
    if (move.phase === "applied" && (await nativePublicationFiles.readExisting(move.file))?.contents !== move.output)
        throw new Error("CMS URL move native object changed.");
    return current;
}
/** Explicit native operator input; claims only receiver-created work, never creates a cycle. */
export async function beginCmsNativeUrlMove(options, mappingId, newUrl) {
    validateCms("UUID", mappingId);
    const held = await withCmsCoordinator(options, async ({ state }) => Object.entries(state.transactions).find(([, transaction]) => transaction.lease.work.mapping_id === mappingId && transaction.stage === "claimed")?.[0]);
    const id = held ?? (await claimCmsNativeWork(options, mappingId))?.workId;
    if (!id)
        throw new Error("CMS URL move requires existing receiver-authorized publication work.");
    return prepareCmsNativeUrlMove(options, id, newUrl);
}
/** Same physical Markdown object; native collection slug is the consumer-owned URL mechanism. */
export async function prepareCmsNativeUrlMove(options, workId, newUrl) {
    return withCmsCoordinator(options, async ({ client, state, save }) => {
        const transaction = state.transactions[workId];
        if (!transaction || transaction.lease.work.action !== "publish_revision" || transaction.stage !== "claimed" || transaction.prepareBody || transaction.plan)
            throw new Error("CMS URL move needs current claimed publication work before static prepare.");
        validateCms("Url", newUrl);
        let move = presentationOf(transaction);
        if (!move) {
            const current = await client.query(workId);
            native.assertCurrent(state, transaction, current);
            const reservation = cmsNativeLocation(options, state, current.work.source_id), target = cmsUrl(newUrl), old = cmsUrl(current.mapping.canonical_url);
            const base = options.routeBase ?? "comments";
            if (target.href !== newUrl || !sameCmsOrigin(newUrl, state.destinationOrigin) || target.search || target.hash || target.pathname === old.pathname
                || !new RegExp(`^/${base}/[a-z0-9]+(?:-[a-z0-9]+)*/$`, "u").test(target.pathname))
                throw new Error("CMS URL move needs an explicit supported same-collection native route.");
            if (current.work.state !== "leased" || current.mapping.destination_native_id !== reservation.nativeId || current.mapping.canonical_url !== reservation.canonicalUrl
                || current.mapping.external_id !== reservation.externalId || current.mapping.synchronized_source_revision !== current.work.source_revision)
                throw new Error("CMS URL move requires the actual unchanged synchronized native source and mapping.");
            const actual = await nativePublicationFiles.readExisting(reservation.file);
            if (!actual)
                throw new Error("CMS URL move cannot replace a missing native object.");
            const fields = native.validateNativeOwnership(actual.contents, current.mapping, reservation.nativeId, state);
            if (Object.hasOwn(fields, "slug") && fields.slug !== old.pathname.slice(1, -1))
                throw new Error("CMS actual native slug differs from the current owned URL.");
            const source = native.sourceFor(state, transaction);
            if (fields.discussionbridgeCmsNativeRevision !== current.mapping.destination_native_revision || fields.discussionbridgeSourceRevision !== source.source_revision
                || fields.discussionbridgeCmsSourceContentSha256 !== source.content_sha256 || fields.discussionbridgeSourceStatus !== "active")
                throw new Error("CMS URL move actual native edition/source requires reconciliation.");
            // Preserve every article byte. Prior relative-target preparation is a native
            // limitation; do not quietly rebase an accepted article during a URL move.
            const body = native.publicationBody(actual.contents);
            if (hasRelativeCopiedReferences(body))
                throw new Error("CMS URL move requires captured source-target preparation for existing relative references; article bytes were not changed.");
            for (const file of await findMarkdownFiles(options.docsDir)) {
                if (file === reservation.file)
                    continue;
                const other = await nativePublicationFiles.readExisting(file);
                const data = other && nativePublicationFiles.metadata(other.contents);
                const route = typeof data?.slug === "string" ? data.slug.replace(/^\/+|\/+$/gu, "") : path.relative(options.docsDir, file).replaceAll(path.sep, "/").replace(/\.(?:md|mdx)$/iu, "");
                if (route === target.pathname.slice(1, -1))
                    throw new Error("CMS requested URL collides with an existing native collection object.");
            }
            const oldReceipt = { ...fields.discussionbridgeCmsOwnership, last_lease_generation: transaction.lease.lease_generation };
            const oldFields = { ...fields, discussionbridgeCmsOwnership: oldReceipt, discussionbridgeCmsOwnershipSha256: nativeOwnershipReceiptSha256(oldReceipt) };
            const oldOutput = encode(oldFields, body);
            move = { phase: "intent", file: reservation.file, before: actual.contents, oldOutput, source, mapping: current.mapping,
                prepare: { mutation_id: randomUUID(), authority: cmsAuthority(transaction), expected_mapping_revision: current.mapping.mapping_revision, old_url: old.href, new_url: newUrl, ownership: ownership(oldOutput) } };
            transaction.presentationMove = move;
            await save();
        }
        checkedMove(state, transaction, options);
        if (move.prepare.new_url !== newUrl || ["aborted", "attention", "committed"].includes(move.phase))
            throw new Error("CMS URL move intent cannot be replaced or silently resumed.");
        await assertCmsPresentationCurrent({ client, state }, transaction, options);
        let actual = await nativePublicationFiles.readExisting(move.file);
        if (move.phase === "intent") {
            if (actual?.contents !== move.oldOutput && actual?.contents !== move.output) {
                if (actual?.contents !== move.before)
                    throw new Error("CMS old native object changed before URL prepare.");
                await nativePublicationFiles.write(move.file, move.oldOutput, actual);
            }
            const renewed = await client.renew(randomUUID(), cmsAuthority(transaction));
            native.assertRenewed(transaction, renewed);
            transaction.lease = renewed;
            await save();
            move.receipt ??= await client.prepareUrlMove(transaction.lease.work.mapping_id, move.prepare);
            if (move.receipt.state !== "prepared" || move.receipt.mapping_id !== transaction.lease.work.mapping_id || move.receipt.expected_mapping_revision !== move.prepare.expected_mapping_revision
                || move.receipt.old_url !== move.prepare.old_url || move.receipt.new_url !== newUrl)
                throw new Error("CMS URL prepare receipt differs from the durable exact intent.");
            await save();
            const fields = nativePublicationFiles.metadata(move.oldOutput);
            const receipt = { ...fields.discussionbridgeCmsOwnership, canonical_url: newUrl, move_id: move.receipt.move_id, proof_nonce: move.receipt.proof_nonce };
            move.output ??= encode({ ...fields, slug: cmsUrl(newUrl).pathname.slice(1, -1), discussionbridgeCmsOwnership: receipt, discussionbridgeCmsOwnershipSha256: nativeOwnershipReceiptSha256(receipt) }, native.publicationBody(move.oldOutput));
            await save();
            actual = await nativePublicationFiles.readExisting(move.file);
            if (actual?.contents !== move.output) {
                if (actual?.contents !== move.oldOutput)
                    throw new Error("CMS native URL edit lost expected native ownership.");
                await assertCmsPresentationCurrent({ client, state }, transaction, options);
                await nativePublicationFiles.write(move.file, move.output, actual);
            }
            move.phase = "applied";
            await save();
        }
        return { workId, moveId: move.receipt.move_id, phase: move.phase, canonicalUrl: newUrl, requiresBuild: true };
    });
}
export async function recordCmsNativeMoveBuild(options, buildDir) {
    return withCmsCoordinator(options, async ({ client, state, save }) => {
        const recorded = [];
        for (const [id, transaction] of Object.entries(state.transactions)) {
            const move = presentationOf(transaction);
            if (move?.phase !== "applied" || move.finalize || move.abort || move.deployment)
                continue;
            await assertCmsPresentationCurrent({ client, state }, transaction, options);
            const html = await native.builtArtifact(buildDir, move.prepare.new_url, move.receipt.prepared_at);
            if (html === null)
                throw new Error("CMS moved native build output is missing.");
            move.build = { html, sha256: native.hash(html), builtAt: new Date().toISOString() };
            await save();
            recorded.push(id);
        }
        return { recorded };
    });
}
/** URL proof/22 only; static18 and a second build/deploy remain separate. */
export async function finalizeCmsNativeUrlMove(options, workId, deployment, commandReceipt) {
    return withCmsCoordinator(options, async ({ client, state, save }) => {
        const transaction = state.transactions[workId];
        if (!transaction)
            throw new Error("CMS URL move work is unavailable.");
        const move = checkedMove(state, transaction, options);
        if (move.phase === "committed")
            return { workId, phase: "committed", requiresFreshBuild: !transaction.prepareBody };
        if (move.phase !== "applied" || !move.output || !move.receipt || move.abort)
            throw new Error("CMS URL move has no applied result eligible for finalize.");
        validateCms("Instant", deployment.deployedAt);
        validateCms("OpaqueId", deployment.deploymentId);
        if (move.deployment && JSON.stringify(move.deployment) !== JSON.stringify(deployment))
            throw new Error("CMS uncertain URL finalize must retain its actual deployment receipt.");
        if (!move.finalize) {
            await assertCmsPresentationCurrent({ client, state }, transaction, options);
            if (!move.build || move.build.sha256 !== native.hash(move.build.html) || Date.parse(deployment.deployedAt) < Date.parse(move.build.builtAt))
                throw new Error("CMS URL move needs its actual build and later deployment.");
            move.deployment = deployment;
            move.commandReceipt = commandReceipt;
            await save();
            const renewed = await client.renew(randomUUID(), cmsAuthority(transaction));
            native.assertRenewed(transaction, renewed);
            transaction.lease = renewed;
            await save();
            const own = ownership(move.output);
            const verification = await verifyCmsPublication({ nativeId: own.native_id, resourceId: own.resource_id, url: move.prepare.new_url, source: move.source, mode: move.mapping.presentation_mode,
                stagedMarkdownBody: native.publicationBody(move.output), builtHtml: move.build.html, preparedAt: move.receipt.prepared_at,
                move: { moveId: move.receipt.move_id, nonce: move.receipt.proof_nonce, ownershipSha256: own.ownership_receipt_sha256 } }, deployment, options.publicFetchImplementation);
            await assertCmsPresentationCurrent({ client, state }, transaction, options);
            move.finalize = { mutation_id: randomUUID(), authority: cmsAuthority(transaction), move_id: move.receipt.move_id, proof_nonce: move.receipt.proof_nonce, ownership: own, verification };
            validateCms("UrlMoveFinalize", move.finalize);
            await save();
        }
        const accepted = await client.finalizeUrlMove(move.mapping.mapping_id, move.receipt.move_id, move.finalize);
        if (accepted.mapping_id !== move.mapping.mapping_id || accepted.canonical_url !== move.prepare.new_url || accepted.destination_native_id !== move.prepare.ownership.native_id || accepted.mapping_revision === move.prepare.expected_mapping_revision)
            throw new Error("CMS URL finalize did not confirm the exact same native binding.");
        const current = await client.query(workId);
        native.assertCurrent(state, transaction, current);
        if (current.mapping.canonical_url !== accepted.canonical_url || current.mapping.mapping_revision !== accepted.mapping_revision || (await nativePublicationFiles.readExisting(move.file))?.contents !== move.output)
            throw new Error("CMS current accepted URL/native state requires reconciliation.");
        state.mappings[move.source.source_id] = current.mapping;
        state.nativeLocations ??= Object.create(null);
        state.nativeLocations[move.source.source_id] = { canonicalUrl: accepted.canonical_url, nativeId: move.prepare.ownership.native_id, moveId: move.receipt.move_id, mappingRevision: accepted.mapping_revision };
        const own = ownership(move.output);
        const plan = { file: move.file, previous: move.output, output: move.output, source: move.source, mapping: current.mapping,
            nativeResult: { kind: "publish_revision", native_id: own.native_id, external_id: own.external_id, canonical_url: own.canonical_url,
                native_revision: String(nativePublicationFiles.metadata(move.output).discussionbridgeCmsNativeRevision), ownership_receipt_sha256: own.ownership_receipt_sha256, representation: { kind: "full", source_content_sha256: move.source.content_sha256 } },
            moveProof: { moveId: move.receipt.move_id, nonce: move.receipt.proof_nonce, ownershipSha256: own.ownership_receipt_sha256 } };
        transaction.plan = plan;
        move.phase = "committed";
        await save();
        return { workId, phase: move.phase, requiresFreshBuild: true };
    });
}
/** Truthful local restoration only; applied abort retains both receiver reservations. */
export async function abortCmsNativeUrlMove(options, workId) {
    return withCmsCoordinator(options, async ({ client, state, save }) => {
        const transaction = state.transactions[workId];
        if (!transaction)
            throw new Error("CMS URL move work is unavailable.");
        const move = checkedMove(state, transaction, options);
        if (!move.receipt || move.phase === "committed" || move.finalize)
            throw new Error("CMS URL move exact finalize/committed state requires reconciliation, not a competing abort.");
        if (!move.abort) {
            await assertCmsPresentationCurrent({ client, state }, transaction, options);
            const renewed = await client.renew(randomUUID(), cmsAuthority(transaction));
            native.assertRenewed(transaction, renewed);
            transaction.lease = renewed;
            await save();
            let actual = await nativePublicationFiles.readExisting(move.file);
            const applied = move.phase === "applied" || actual?.contents === move.output;
            if (actual?.contents === move.output) {
                await nativePublicationFiles.write(move.file, move.oldOutput, actual);
                actual = await nativePublicationFiles.readExisting(move.file);
            }
            if (actual?.contents !== move.oldOutput)
                throw new Error("CMS URL abort has no truthful actual ownership; native uncertainty retained.");
            move.abort = { mutation_id: randomUUID(), authority: cmsAuthority(transaction), move_id: move.receipt.move_id, native_change_applied: applied, ownership: ownership(actual.contents) };
            validateCms("UrlMoveAbort", move.abort);
            await save();
        }
        const receipt = await client.abortUrlMove(move.mapping.mapping_id, move.receipt.move_id, move.abort);
        if (receipt.move_id !== move.receipt.move_id || receipt.state !== (move.abort.native_change_applied ? "attention" : "aborted"))
            throw new Error("CMS URL abort receipt requires reconciliation.");
        move.phase = receipt.state;
        state.mappings[move.source.source_id] = (await client.query(workId)).mapping;
        await save();
        return { workId, phase: move.phase, nativeRestored: true, receiverReservationsRetained: move.abort.native_change_applied };
    });
}
