import { randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import { CmsClient, validatedCmsErrorResponse } from "./cms-client.js";
import { cmsToFingerprint } from "./cms-to.js";
import { activeSourceMove } from "./cms-to-source-state.js";
import { withNativeSourceWriter } from "./native-locks.js";
import { readPublicationOperationalState, writePublicationOperationalState } from "./operational-state.js";
import { nativePublicationFiles } from "./native-publication.js";
import { parseMarkdown, pageUrlForFile, validateRouteBase, validateSlug, findMarkdownFiles, updateFrontmatter, prepareNativeRenderedArticle, nativeLifecycle } from "./native-source.js";
import { cmsServiceBaseUrl as parseServiceBaseUrl, cmsUrl, nativeUrl as parseNativeUrl, sameCmsOrigin } from "./native-url.js";
import { NativePreparationLimitation } from "./native-preparation.js";
import { makeSourceOwnership, sourceHash, sourceOriginalKey, resolveNativeSourceTargets, SOURCE_MOVE_FIELD, SOURCE_NONCE_FIELD, SOURCE_OWNERSHIP_FIELD } from "./to-source-profile.js";
import { projectGeneratedReadMoreMove, semanticIdentity, validateCms } from "../src/private/cms-runtime.mjs";
import { assertActualSourceBuild, verifyControlledSourcePublic } from "./cms-to-source-build.js";
const saveState = (options, state) => writePublicationOperationalState(path.resolve(options.stateFile), state);
export const currentSourceRecord = (operation) => operation.to?.effectiveEdition?.record ?? operation.to?.acceptedBody?.bridge_record;
export function sourcePreparationBase(operation, contents, canonicalUrl) {
    const retained = operation?.to?.retainedSource;
    return retained && retained.articleSha256 === sourceHash(parseMarkdown(contents).body) ? operation.to.articleCaptures?.[retained.captureId]?.sourceArticleUrl ?? canonicalUrl : canonicalUrl;
}
export function assertSourceConnection(options, operation, client, connection) {
    const to = operation.to, scope = to?.scope;
    if (!scope || connection.connection_id !== scope.connectionId || connection.scope_revision !== scope.scopeRevision || client.origin !== scope.serverOrigin
        || connection.profile !== "astro" || !connection.directions.includes("to_discourse") || !sameCmsOrigin(options.siteUrl, scope.siteOrigin) || !sameCmsOrigin(connection.destination_origin, scope.siteOrigin)
        || (options.controlledCreation.lane ?? connection.publication_lane) !== scope.lane)
        throw new Error("Native source move current connection/To scope requires reconciliation.");
}
function assertRecord(operation, actual, revision, url) {
    if (actual.direction !== "to_discourse" || actual.state !== "active" || actual.external_id !== operation.externalId || actual.resource_id !== operation.resourceId || actual.topic_id !== operation.topicId
        || actual.topic_url !== operation.topicUrl || actual.source_revision !== revision || actual.canonical_url !== url)
        throw new Error("Native source move current receiver identity/revision/URL requires reconciliation.");
}
async function sourceRoot(options, state) {
    const docsDir = path.resolve(options.docsDir), actual = await lstat(docsDir, { bigint: true }), scope = state.nativeCensus;
    if (!scope || !actual.isDirectory() || actual.isSymbolicLink() || scope.docsDir !== docsDir || scope.rootDev !== String(actual.dev) || scope.rootIno !== String(actual.ino)
        || scope.siteBase !== parseServiceBaseUrl(options.siteUrl).href || scope.routeBase !== validateRouteBase(options.routeBase))
        throw new Error("Source move requires the unchanged actual completed native census/root.");
    return scope;
}
async function sourceOwner(options, state, file) {
    await sourceRoot(options, state);
    const docsDir = path.resolve(options.docsDir), relative = path.relative(docsDir, file);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        throw new Error("Source move file is outside configured native content.");
    const owners = Object.values(state.operations).filter(value => value.to?.nativeSource?.docsDir === docsDir && value.to.nativeSource.relativePath === relative);
    if (owners.length !== 1 || !owners[0].to?.acceptedRevision || !owners[0].resourceId || !owners[0].topicId)
        throw new Error("Source move requires exactly one accepted actual native source identity.");
    return owners[0];
}
const nativeUrl = (options, file, contents) => {
    const metadata = parseMarkdown(contents).frontmatter;
    return pageUrlForFile({ docsDir: path.resolve(options.docsDir), filePath: file, siteBase: parseServiceBaseUrl(options.siteUrl), routeBase: validateRouteBase(options.routeBase), slug: metadata.slug, hasSlug: Object.hasOwn(metadata, "slug") });
};
async function withSource(options, file, action) {
    file = path.resolve(file);
    return withNativeSourceWriter(options.docsDir, options.stateFile, async () => {
        const state = await readPublicationOperationalState(path.resolve(options.stateFile)), operation = await sourceOwner(options, state, file);
        const client = new CmsClient({ serverUrl: options.discourseUrl, ...options.controlledCreation }), connection = await client.connection();
        assertSourceConnection(options, operation, client, connection);
        return action(state, operation, client, connection);
    });
}
/** Shared local source fence/current native check, not a receiver Work lease. */
export async function withCurrentSourceMove(options, sourceFile, action, allowCommitted = false) {
    const file = path.resolve(sourceFile);
    return withSource(options, file, async (state, operation, client) => {
        const move = operation.to.sourceMove;
        if (!move || operation.to.sourceFence !== move.fence || !move.output || !move.receipt || !move.projected || move.phase === "attention" || move.phase === "aborted" || move.phase === "abort_pending" || move.phase === "known_rejected" || move.phase === "committed" && !allowCommitted)
            throw new Error("Native source move current phase/fence requires reconciliation.");
        const actual = await nativePublicationFiles.readExisting(file);
        if (!actual || actual.contents !== move.output || nativeLifecycle(parseMarkdown(actual.contents).frontmatter) !== "published" || nativeUrl(options, file, actual.contents) !== move.prepareBody.new_url)
            throw new Error("Native source move no longer owns the exact current published edition.");
        const record = await client.record(operation.resourceId);
        // A lost29 can already have committed. Metadata corroborates only: its
        // exact saved29 still has to be replayed to recover the actual receipt.
        if (move.finalizeBody && record.source_revision === move.newRevision && record.canonical_url === move.prepareBody.new_url)
            assertRecord(operation, record, move.newRevision, move.prepareBody.new_url);
        else
            assertRecord(operation, record, move.prepareBody.expected_source_revision, move.prepareBody.old_url);
        return action(state, operation, move, client);
    });
}
/** Settles only an actual supervised deployment plus anonymous full-source proof. */
export async function finalizeControlledSourceUrlMove(options, sourceFile, verification = {}) {
    return withCurrentSourceMove(options, sourceFile, async (state, operation, move, client) => {
        if (move.phase === "committed")
            return move.result;
        const deployment = move.commands?.deploy;
        if (!deployment || deployment.phase !== "succeeded" || deployment.fence !== move.fence || !deployment.terminationConfirmed || !deployment.completedAt || !move.nativeCapture?.build
            || move.nativeCapture.build.builtAt > deployment.completedAt || move.deployedAt !== deployment.completedAt || move.deploymentId !== deployment.deploymentId)
            throw new Error("Source29 requires the actual current supervised native deployment and full native build.");
        if (!move.finalizeBody) {
            const proof = await verifyControlledSourcePublic(move.nativeCapture, move.receipt.prepared_at, deployment.completedAt, verification.fetchImplementation);
            move.finalizeBody = { mutation_id: randomUUID(), move_id: move.receipt.move_id, proof_nonce: move.receipt.proof_nonce, expected_source_revision: move.prepareBody.expected_source_revision,
                verification: proof, new_source_revision: move.newRevision, source_updated_at: move.beforeToRecord.source_updated_at };
            move.phase = "finalize_pending";
            await saveState(options, state);
        }
        try {
            move.result = await client.finalizeSourceUrlMove(operation.resourceId, move.receipt.move_id, move.finalizeBody);
        }
        catch (error) {
            const known = validatedCmsErrorResponse(error, client, "V4-29", move.finalizeBody);
            if (known?.httpStatus === 422 && known.envelope.code === "content_preservation_unavailable" && !known.envelope.retryable && known.envelope.retry_after_seconds === null) {
                move.knownRejection = known;
                move.phase = "known_rejected";
                await saveState(options, state);
            }
            throw error;
        }
        assertRecord(operation, move.result, move.newRevision, move.prepareBody.new_url);
        move.phase = "committed";
        const to = operation.to, article = to.articleCaptures[move.captureId], projected = move.projected;
        //29 is a Record receipt, never a fabricated02 ResolveResult. The old02
        // body/result and complete preparation captures remain immutable history.
        to.effectiveEdition = { record: structuredClone(projected), captureId: move.captureId, moveId: move.receipt.move_id, parentRevision: move.prepareBody.expected_source_revision };
        to.acceptedRevision = move.newRevision;
        to.acceptedCaptureId = move.captureId;
        to.acceptedFingerprint = cmsToFingerprint({ preparation: article, pageUrl: projected.canonical_url, title: projected.title, externalId: projected.external_id, contentHtml: article.preparedHtml,
            sourceAuthors: projected.source_authors, primarySourceAuthorId: projected.primary_source_author_id, createdAt: projected.source_created_at, updatedAt: projected.source_updated_at }, to.scope.lane);
        to.retainedSource = { articleSha256: sourceHash(parseMarkdown(move.before).body), captureId: move.captureId };
        to.nativeCapture = structuredClone(move.nativeCapture);
        operation.canonicalUrl = projected.canonical_url;
        operation.outcome = "updated";
        await saveState(options, state);
        assertRecord(operation, await client.record(operation.resourceId), move.newRevision, projected.canonical_url);
        return move.result;
    }, true);
}
/** Native abort never pretends an applied/uncertain move was not applied. */
export async function abortControlledSourceUrlMove(options, sourceFile, restoreExactLocalFile = false) {
    return withSource(options, sourceFile, async (state, operation, client) => {
        const move = operation.to.sourceMove;
        if (!move?.receipt || operation.to.sourceFence !== move.fence || move.phase === "committed" || move.phase === "known_rejected")
            throw new Error("Source abort lacks current exact native move authority.");
        if (move.abortResult)
            return move.abortResult;
        assertRecord(operation, await client.record(operation.resourceId), move.prepareBody.expected_source_revision, move.prepareBody.old_url);
        const actual = await nativePublicationFiles.readExisting(path.resolve(sourceFile));
        if (!actual || actual.contents !== move.before && actual.contents !== move.output)
            throw new Error("Source abort cannot manufacture old ownership for a changed native file.");
        const applied = !!move.output && !["intent", "reserved"].includes(move.phase);
        if (restoreExactLocalFile && actual.contents === move.output)
            await nativePublicationFiles.write(path.resolve(sourceFile), move.before, actual);
        if (!move.abortBody) {
            move.abortBody = { mutation_id: randomUUID(), move_id: move.receipt.move_id, expected_source_revision: move.prepareBody.expected_source_revision, native_change_applied: applied || actual.contents === move.output,
                old_url: move.prepareBody.old_url, native_ownership_receipt_sha256: move.beforeCapture.ownershipSha256 };
            move.phase = "abort_pending";
            await saveState(options, state);
        }
        move.abortResult = await client.abortSourceUrlMove(operation.resourceId, move.receipt.move_id, move.abortBody);
        if (move.abortResult.move_id !== move.receipt.move_id || move.abortResult.resource_id !== operation.resourceId || move.abortResult.state !== (move.abortBody.native_change_applied ? "attention" : "aborted"))
            throw new Error("Source abort receipt differs from the exact actual native outcome.");
        move.phase = move.abortResult.state;
        await saveState(options, state);
        return move.abortResult;
    });
}
/** Bounded actual receiver history; never an alternate mutation receipt. */
export async function controlledSourceUrlHistory(options, sourceFile, cursor) {
    return withSource(options, sourceFile, async (_state, operation, client) => client.sourceUrlHistory(operation.resourceId, cursor));
}
/** Protected same-file native action; never creates a topic or initializes one. */
export async function beginControlledSourceUrlMove(options, sourceFile, newUrl) {
    const file = path.resolve(sourceFile);
    return withSource(options, file, async (state, operation, client) => {
        const to = operation.to;
        let move = to.sourceMove;
        if (!activeSourceMove(move)) {
            if (to.pending || to.withdrawal || operation.nativeRender)
                throw new Error("Source move cannot replace an exact pending publication/withdrawal/render handoff.");
            const actual = await nativePublicationFiles.readExisting(file), before = to.nativeCapture, record = currentSourceRecord(operation);
            if (!actual || !before?.build || !record || before.file !== file || before.fileSha256 !== sourceHash(actual.contents) || before.revision !== to.acceptedRevision
                || nativeLifecycle(parseMarkdown(actual.contents).frontmatter) !== "published" || nativeUrl(options, file, actual.contents) !== operation.canonicalUrl)
                throw new NativePreparationLimitation("Source move needs its ACTUAL current whole-source native render/build and unchanged published source binding.");
            const current = await client.record(operation.resourceId);
            assertRecord(operation, current, to.acceptedRevision, operation.canonicalUrl);
            validateCms("Url", newUrl);
            const target = cmsUrl(newUrl), site = parseServiceBaseUrl(options.siteUrl), prefix = parseNativeUrl(`${validateRouteBase(options.routeBase)}/`.replace(/^\/$/u, ""), site).pathname;
            if (target.href !== newUrl || !sameCmsOrigin(newUrl, operation.canonicalUrl) || target.search || target.hash || newUrl === operation.canonicalUrl || !target.pathname.startsWith(prefix) || !target.pathname.endsWith("/"))
                throw new Error("Source move needs an exact supported same-origin native permalink.");
            const slug = validateSlug(target.pathname.slice(prefix.length, -1), file);
            if (pageUrlForFile({ docsDir: path.resolve(options.docsDir), filePath: file, siteBase: site, routeBase: validateRouteBase(options.routeBase), slug, hasSlug: true }) !== newUrl)
                throw new Error("Actual native permalink mapping does not yield the requested URL.");
            for (const other of await findMarkdownFiles(options.docsDir))
                if (other !== file) {
                    const contents = await nativePublicationFiles.readExisting(other);
                    if (!contents || nativeUrl(options, other, contents.contents) === newUrl)
                        throw new Error("Source move collides with another native source or incomplete corpus.");
                }
            const newRevision = randomUUID(), projected = record.representation.kind === "generated_excerpt" ? projectGeneratedReadMoreMove(record, newUrl, newRevision, record.source_updated_at)
                : { ...structuredClone(record), canonical_url: newUrl, expected_source_revision: record.source_revision, source_revision: newRevision };
            validateCms("ToRecord", projected);
            if (Buffer.byteLength(projected.content_html) > 49152 || Buffer.byteLength(semanticIdentity({ mutation_id: randomUUID(), bridge_record: projected })) > 65536)
                throw new Error("body_too_large: exact source URL projection cannot fit without changing the retained article.");
            const captureId = to.acceptedCaptureId;
            if (!to.articleCaptures?.[captureId] || record.source_content_sha256 !== to.articleCaptures[captureId].preparedSha256)
                throw new Error("Exact accepted complete article evidence is unavailable.");
            if (move) {
                to.sourceMoveHistory ??= Object.create(null);
                to.sourceMoveHistory[move.receipt?.move_id ?? move.prepareBody.mutation_id] ??= structuredClone(move);
            }
            const fence = (to.sourceFence ?? 0) + 1;
            if (!Number.isSafeInteger(fence))
                throw new Error("Native source owner fence is exhausted.");
            to.sourceFence = fence;
            move = { phase: "intent", file, nativeId: before.ownership.nativeId, fence, before: actual.contents, beforeRecord: current, beforeCapture: structuredClone(before), captureId,
                beforeToRecord: structuredClone(record), originalKey: sourceOriginalKey(actual.contents), newSlug: slug, newRevision, projected,
                prepareBody: { mutation_id: randomUUID(), expected_source_revision: current.source_revision, old_url: current.canonical_url, new_url: newUrl, external_id: operation.externalId } };
            to.sourceMove = move;
            await saveState(options, state);
        }
        move = to.sourceMove;
        if (move.prepareBody.new_url !== newUrl || move.file !== file || ["attention", "known_rejected", "abort_pending"].includes(move.phase))
            throw new Error("Source move exact intent cannot be replaced or implicitly resumed.");
        if (to.sourceFence !== move.fence)
            throw new Error("Source move lost its actual local owner fence.");
        assertRecord(operation, await client.record(operation.resourceId), move.prepareBody.expected_source_revision, move.prepareBody.old_url);
        let actual = await nativePublicationFiles.readExisting(file);
        if (!actual || actual.contents !== move.before && actual.contents !== move.output || !["intent", "reserved"].includes(move.phase) && actual?.contents !== move.output)
            throw new Error("Source move native file changed before exact continuation.");
        if (!move.receipt) {
            move.receipt = await client.prepareSourceUrlMove(operation.resourceId, move.prepareBody);
            const receipt = move.receipt;
            if (receipt.resource_id !== operation.resourceId || receipt.expected_source_revision !== move.prepareBody.expected_source_revision || receipt.old_url !== move.prepareBody.old_url || receipt.new_url !== newUrl || receipt.state !== "prepared")
                throw new Error("Source move prepare receipt differs from its durable intent.");
            move.phase = "reserved";
            await saveState(options, state);
        }
        if (!move.output) {
            const capture = to.articleCaptures[move.captureId], root = await sourceRoot(options, state);
            const provisional = updateFrontmatter(move.before, { slug: move.newSlug, discussionbridgeSourcePublicationRevision: move.newRevision, [SOURCE_MOVE_FIELD]: move.receipt.move_id, [SOURCE_NONCE_FIELD]: move.receipt.proof_nonce });
            const owned = makeSourceOwnership({ connectionId: to.scope.connectionId, scopeRevision: to.scope.scopeRevision, serverOrigin: client.origin, siteOrigin: to.scope.siteOrigin,
                rootDev: root.rootDev, rootIno: root.rootIno, nativeId: move.nativeId, externalId: operation.externalId, resourceId: operation.resourceId, topicId: operation.topicId, canonicalUrl: newUrl,
                sourceRevision: move.newRevision, fence: move.fence, moveId: move.receipt.move_id, proofNonce: move.receipt.proof_nonce }, provisional, capture);
            move.output = updateFrontmatter(provisional, { [SOURCE_OWNERSHIP_FIELD]: owned.sha256 });
            await saveState(options, state);
        }
        actual = await nativePublicationFiles.readExisting(file);
        if (!actual || actual.contents !== move.output && actual.contents !== move.before)
            throw new Error("Native source move lost expected file ownership.");
        if (actual.contents !== move.output)
            await nativePublicationFiles.write(file, move.output, actual);
        if (["intent", "reserved"].includes(move.phase)) {
            move.phase = "native_applied";
            await saveState(options, state);
        }
        return { moveId: move.receipt.move_id, phase: move.phase, nativeId: move.nativeId, newUrl, sourceRevision: move.newRevision, requiresBuild: true };
    });
}
/** Called ONLY inside the existing source writer by a bound native SSR helper. */
export async function captureSourceNativeUnderWriter(options, state, operation, input, client, connection) {
    assertActualSourceBuild(state);
    assertSourceConnection(options, operation, client, connection);
    const root = await sourceRoot(options, state), to = operation.to, move = activeSourceMove(to.sourceMove) ? to.sourceMove : undefined, file = path.resolve(input.filePath);
    const actual = await nativePublicationFiles.readExisting(file), record = move?.projected ?? currentSourceRecord(operation), captureId = move?.captureId ?? to.acceptedCaptureId;
    const article = captureId && to.articleCaptures?.[captureId];
    if (!actual || !record || !article || !state.sourceBuildId || nativeLifecycle(parseMarkdown(actual.contents).frontmatter) !== "published" || path.extname(file).toLowerCase() !== ".md"
        || nativeUrl(options, file, actual.contents) !== input.sourceArticleUrl || input.sourceArticleUrl !== record.canonical_url || input.nativeBody !== parseFrontmatter(actual.contents).content.trim())
        throw new Error("Full native source entry/current article/route binding requires reconciliation.");
    if (move && (to.sourceFence !== move.fence || !["native_applied", "built"].includes(move.phase) || actual.contents !== move.output))
        throw new Error("Full source capture lost its actual move/native owner.");
    assertRecord(operation, await client.record(operation.resourceId), move?.prepareBody.expected_source_revision ?? to.acceptedRevision, move?.prepareBody.old_url ?? operation.canonicalUrl);
    const rendered = await input.render();
    const checked = await nativePublicationFiles.readExisting(file);
    if (!checked || checked.dev !== actual.dev || checked.ino !== actual.ino || checked.contents !== actual.contents)
        throw new Error("Actual full native source changed during rendering.");
    const nativeHtml = resolveNativeSourceTargets(rendered, article.sourceArticleUrl), prepared = prepareNativeRenderedArticle(article, nativeHtml);
    if (prepared.preparedSha256 !== article.preparedSha256 || prepared.preparedBytes !== article.preparedBytes || move && nativeHtml !== move.beforeCapture.nativeHtml)
        throw new NativePreparationLimitation("Canonical source move/full native rendering cannot preserve the exact accepted complete article; no replacement recipe or29 proof was invented.");
    const data = parseMarkdown(actual.contents).frontmatter;
    to.sourceFence ??= 1;
    await saveState(options, state);
    const owned = makeSourceOwnership({ connectionId: to.scope.connectionId, scopeRevision: to.scope.scopeRevision, serverOrigin: client.origin, siteOrigin: to.scope.siteOrigin, rootDev: root.rootDev, rootIno: root.rootIno,
        nativeId: path.relative(path.resolve(options.docsDir), file).split(path.sep).join("/"), externalId: operation.externalId, resourceId: operation.resourceId, topicId: operation.topicId, canonicalUrl: record.canonical_url,
        sourceRevision: record.source_revision, fence: to.sourceFence, moveId: data[SOURCE_MOVE_FIELD] ?? null, proofNonce: data[SOURCE_NONCE_FIELD] ?? null }, actual.contents, article);
    const output = updateFrontmatter(actual.contents, { [SOURCE_OWNERSHIP_FIELD]: owned.sha256 });
    if (move && output !== move.output)
        throw new Error("Native source ownership receipt differs from the exact move output.");
    if (output !== actual.contents)
        await nativePublicationFiles.write(file, output, actual);
    const nativeCapture = { buildId: state.sourceBuildId, file, fileSha256: sourceHash(output), originalKey: sourceOriginalKey(output), canonicalUrl: record.canonical_url, revision: record.source_revision,
        birthBase: article.sourceArticleUrl, nativeHtml, ownership: owned.receipt, ownershipSha256: owned.sha256, title: record.title, authors: structuredClone(record.source_authors ?? []) };
    if (move)
        move.nativeCapture = nativeCapture;
    else
        to.nativeCapture = nativeCapture;
    await saveState(options, state);
    return { frontmatter: parseMarkdown(output).frontmatter, result: to.acceptedResult, source: nativeCapture };
}
