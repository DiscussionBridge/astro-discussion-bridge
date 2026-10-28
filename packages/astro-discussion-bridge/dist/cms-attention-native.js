import { createHash, randomUUID } from "node:crypto";
import { CmsClient } from "./cms-client.js";
import { emptyCmsState, readCmsState } from "./cms-state.js";
import { cmsNativeLocation } from "./cms-coordinator.js";
import { cmsStaticNative } from "./cms-static.js";
import { withNativeSourceWriter } from "./native-locks.js";
import { nativePublicationFiles } from "./native-publication.js";
import { verifyCmsPublication, verifyCmsAbsence } from "./cms-verification.js";
import { semanticIdentity, validateCms } from "../src/private/cms-runtime.mjs";
import { readAttentionState, writeAttentionState } from "./cms-attention-state.js";
export const attentionHash = (value) => createHash("sha256").update(value).digest("hex");
const same = (left, right) => semanticIdentity(left) === semanticIdentity(right);
export function attentionJournalHash(state, workId) {
    const transaction = state.transactions[workId];
    return attentionHash(semanticIdentity({ transaction: transaction ?? null, generation: transaction ? state.generations[transaction.lease.work.mapping_id] ?? null : null, command: state.nativeCommand ?? null }));
}
function blank(inspection) {
    return { profile: "astro-static-1", observed_at: new Date().toISOString(), native_state: "unknown", object_exists: null, native_id: null, native_revision: null,
        ownership: null, native_result: null, verification: null, source_revision: null, managed_content_sha256: null, native_command: "none", pending_mutation: "none",
        prepared_transaction_id: inspection.prepared_transaction?.transaction_id ?? null, journal_sha256: null, baseline_sha256: null, candidate_sha256: null, current_sha256: null,
        restoration_operation_id: null, issue: "none" };
}
function transactionPending(transaction) {
    return Boolean(transaction.finalizeBody && transaction.stage !== "verified" || transaction.abortBody && !["aborted", "attention"].includes(transaction.stage)
        || transaction.failureBody && transaction.stage !== "attention" || transaction.prepareBody && ["claimed", "staged"].includes(transaction.stage));
}
function commandState(state) {
    const command = state.nativeCommand;
    return !command ? "none" : ["starting", "running"].includes(command.phase) ? "active" : command.phase === "uncertain" ? "uncertain" : "settled";
}
function verifiedBaseline(state, inspection, previous) {
    if (!inspection.verified_native_result || !inspection.verification || previous === null)
        return undefined;
    return Object.values(state.transactions).map(value => value).find(value => value.stage === "verified" && value.plan?.previous !== undefined
        && value.plan.output === previous && value.plan.mapping.mapping_id === inspection.mapping.mapping_id && same(value.plan.nativeResult, inspection.verified_native_result)
        && value.finalizeBody && same(value.finalizeBody.verification, inspection.verification));
}
/** Called only under the current native content/state writer; never writes. */
export async function collectCmsAttentionNative(options, inspection, state, client, recovery, admission) {
    const observed = blank(inspection), work = inspection.work, mapping = inspection.mapping;
    const stop = (issue, native_state = "unknown") => ({ ...observed, issue, native_state });
    const transaction = state.transactions[work.work_id];
    observed.journal_sha256 = attentionJournalHash(state, work.work_id);
    const connection = await client.connection(), current = await client.query(work.work_id);
    const expectedWork = admission ? { ...work, state: "superseded" } : work, expectedMapping = admission?.mapping ?? mapping;
    if (connection.profile !== "astro" || !connection.directions.includes("from_discourse") || !connection.policy.enabled || connection.destination_origin !== state.destinationOrigin
        || connection.scope_revision !== state.scopeRevision || connection.policy.policy_revision !== work.policy_revision || !same(current.work, expectedWork) || !same(current.mapping, expectedMapping))
        return stop("context_changed");
    if (!transaction || !["attention", "aborted", "prepared"].includes(transaction.stage) || ["work_id", "mapping_id", "source_id", "source_revision", "policy_revision", "action", "attempt_cycle"].some(key => transaction.lease.work[key] !== work[key]))
        return stop("baseline_missing");
    if (connection.policy.author_ids.length || connection.policy.taxonomy_ids.length)
        return stop("metadata_unavailable");
    observed.native_command = commandState(state);
    const baselineCommands = Object.values(recovery.commands ?? {});
    if (baselineCommands.some(value => ["starting", "running"].includes(value.phase)))
        observed.native_command = "active";
    else if (baselineCommands.some(value => value.phase === "uncertain"))
        observed.native_command = "uncertain";
    observed.pending_mutation = transactionPending(transaction) || state.pendingClaim || state.reservations?.[work.source_id] ? "uncertain" : transaction.prepareBody || transaction.abortBody || transaction.failureBody || transaction.finalizeBody ? "settled" : "none";
    if (observed.native_command === "active")
        return stop("active_command");
    if (observed.native_command === "uncertain")
        return stop("uncertain_command");
    if (observed.pending_mutation === "uncertain")
        return stop("uncertain_mutation");
    if (transaction.presentationMove && !["committed", "aborted"].includes(transaction.presentationMove.phase))
        return stop("url_move_open");
    const reservation = cmsNativeLocation(options, state, work.source_id), recordedPlan = transaction.plan;
    let plan = recordedPlan;
    if (plan && (plan.file !== reservation.file || plan.mapping.mapping_id !== mapping.mapping_id || plan.nativeResult.native_id !== reservation.nativeId || plan.nativeResult.canonical_url !== mapping.canonical_url))
        return stop("context_changed");
    if (inspection.prepared_transaction && (!plan || inspection.prepared_transaction.transaction_id !== transaction.transactionId || !same(inspection.prepared_transaction.native_result, plan.nativeResult)))
        return stop("context_changed");
    const file = await nativePublicationFiles.readExisting(reservation.file);
    async function unchanged() {
        const again = await nativePublicationFiles.readExisting(reservation.file), checked = await client.query(work.work_id);
        return (!file && !again || file && again && file.dev === again.dev && file.ino === again.ino && file.contents === again.contents)
            && same(checked.work, expectedWork) && same(checked.mapping, expectedMapping);
    }
    observed.object_exists = Boolean(file);
    observed.current_sha256 = file ? attentionHash(file.contents) : attentionHash("astro-native-object-absent\n");
    observed.native_id = file ? reservation.nativeId : mapping.destination_native_id;
    if (!plan) {
        if (!file && mapping.destination_native_id === null && inspection.native_result === null && inspection.verified_native_result === null && !inspection.prepared_transaction)
            return await unchanged() ? stop("none", "never_applied") : stop("context_changed");
        // Failure before a new native plan does not erase the prior independently
        // verified baseline. Use only its exact retained output and proof, never the
        // current bytes alone as a self-declared baseline.
        const retained = file && !inspection.prepared_transaction ? verifiedBaseline(state, inspection, file.contents)?.plan : undefined;
        if (!retained || !same(inspection.native_result, retained.nativeResult))
            return stop(file ? "native_conflict" : "baseline_missing", file ? "conflict" : "unknown");
        plan = { ...retained, previous: retained.output };
    }
    observed.baseline_sha256 = plan.previous === null ? null : attentionHash(plan.previous);
    observed.candidate_sha256 = recordedPlan ? attentionHash(plan.output) : null;
    if (!file)
        return mapping.destination_native_id === null && plan.previous === null && !inspection.prepared_transaction && await unchanged() ? stop("none", "never_applied") : stop("baseline_missing");
    if (file.contents !== plan.output && file.contents !== plan.previous)
        return stop("native_conflict", "conflict");
    let fields;
    try {
        fields = cmsStaticNative.validateNativeOwnership(file.contents, mapping, reservation.nativeId, state);
    }
    catch {
        return stop("native_conflict", "conflict");
    }
    observed.native_revision = fields.discussionbridgeCmsNativeRevision;
    const receipt = fields.discussionbridgeCmsOwnership;
    observed.source_revision = receipt.source_revision;
    observed.managed_content_sha256 = fields.discussionbridgeNativeBodySha256;
    observed.ownership = { resource_id: mapping.resource_id, external_id: mapping.external_id, native_id: reservation.nativeId, canonical_url: mapping.canonical_url,
        source_revision: observed.source_revision, ownership_receipt_sha256: fields.discussionbridgeCmsOwnershipSha256 };
    if (file.contents !== plan.previous) {
        observed.native_result = plan.nativeResult;
        return await unchanged() ? stop("none", "candidate_applied") : stop("context_changed");
    }
    const baseline = verifiedBaseline(state, inspection, plan.previous);
    if (!baseline?.plan || !baseline.finalizeBody || !baseline.buildArtifact || !baseline.preparedAt)
        return stop("baseline_missing");
    const withdrawn = baseline.plan.nativeResult.kind === "withdraw";
    if (withdrawn ? baseline.buildArtifact.html !== null || baseline.buildArtifact.sha256 !== null || baseline.plan.source !== null
        || fields.draft !== true || fields.discussionbridgeSourceStatus !== "withdrawn" || baseline.finalizeBody.verification.kind !== "absent"
        : baseline.buildArtifact.html === null || !baseline.plan.source || baseline.buildArtifact.sha256 !== attentionHash(baseline.buildArtifact.html))
        return stop("baseline_missing");
    observed.native_result = baseline.plan.nativeResult;
    const restoration = Object.values(recovery.restorations).find(value => value.workId === work.work_id && value.contextSha256 === inspection.context_sha256 && value.phase === "restored"
        && value.baselineSha256 === observed.current_sha256 && value.file === plan.file);
    observed.restoration_operation_id = restoration?.operationId ?? null;
    try {
        const deployment = { deploymentId: baseline.finalizeBody.deployment_id, deployedAt: baseline.finalizeBody.deployed_at };
        observed.verification = (withdrawn
            ? await verifyCmsAbsence(mapping.canonical_url, reservation.nativeId, baseline.preparedAt, deployment, options.publicFetchImplementation)
            : await verifyCmsPublication({ nativeId: reservation.nativeId, resourceId: mapping.resource_id, url: mapping.canonical_url,
                source: baseline.plan.source, mode: baseline.plan.mapping.presentation_mode, stagedMarkdownBody: cmsStaticNative.publicationBody(baseline.plan.output),
                builtHtml: baseline.buildArtifact.html, preparedAt: baseline.preparedAt }, deployment, options.publicFetchImplementation));
    }
    catch {
        return stop("public_proof_unavailable", inspection.prepared_transaction ? "restored_baseline" : "baseline");
    }
    const reread = await nativePublicationFiles.readExisting(plan.file), checked = await client.query(work.work_id);
    if (!reread || reread.dev !== file.dev || reread.ino !== file.ino || reread.contents !== file.contents || !same(checked.work, expectedWork) || !same(checked.mapping, expectedMapping))
        return stop("context_changed");
    return stop("none", inspection.prepared_transaction ? "restored_baseline" : "baseline");
}
export async function inspectCmsAttentionNative(options, inspection) {
    validateCms("AttentionInspection", inspection);
    return withNativeSourceWriter(options.docsDir, options.stateFile, async () => {
        const client = new CmsClient(options), state = await readCmsState(options.stateFile, emptyCmsState(client, options.siteUrl, options.connectionId));
        const observed = await collectCmsAttentionNative(options, inspection, state, client, await readAttentionState(options));
        validateCms("AttentionObservation", observed);
        return observed;
    });
}
/** Explicit native-owner action. Check never calls this function. */
export async function restoreCmsAttentionBaseline(options, inspection, expectedJournalSha256) {
    validateCms("AttentionInspection", inspection);
    validateCms("Sha256", expectedJournalSha256);
    return withNativeSourceWriter(options.docsDir, options.stateFile, async () => {
        const client = new CmsClient(options), state = await readCmsState(options.stateFile, emptyCmsState(client, options.siteUrl, options.connectionId)), recovery = await readAttentionState(options);
        const transaction = state.transactions[inspection.work.work_id], plan = transaction?.plan;
        const observed = await collectCmsAttentionNative(options, inspection, state, client, recovery);
        if (observed.journal_sha256 !== expectedJournalSha256 || !plan || plan.previous === null || !verifiedBaseline(state, inspection, plan.previous))
            throw new Error("Recorded verified baseline is unavailable or changed; restore refused.");
        if (!["candidate_applied", "baseline", "restored_baseline"].includes(observed.native_state) || !["none", "public_proof_unavailable"].includes(observed.issue))
            throw new Error("Native baseline restore requires settled exact owned alternatives.");
        let operation = Object.values(recovery.restorations).find(value => value.workId === inspection.work.work_id && value.contextSha256 === inspection.context_sha256 && value.journalSha256 === expectedJournalSha256);
        if (!operation) {
            operation = { operationId: randomUUID(), workId: inspection.work.work_id, inspectionId: inspection.inspection_id, contextSha256: inspection.context_sha256, journalSha256: expectedJournalSha256,
                file: plan.file, before: plan.previous, candidate: plan.output, baselineSha256: attentionHash(plan.previous), phase: "prepared", createdAt: new Date().toISOString() };
            recovery.inspections[inspection.inspection_id] ??= { instruction: inspection };
            recovery.restorations[operation.operationId] = operation;
            await writeAttentionState(options, recovery);
            await options.afterRestoreRecorded?.();
        }
        if (operation.file !== plan.file || operation.before !== plan.previous || operation.candidate !== plan.output)
            throw new Error("Recorded baseline restoration identity changed.");
        const file = await nativePublicationFiles.readExisting(plan.file);
        if (!file || ![operation.before, operation.candidate].includes(file.contents))
            throw new Error("Foreign native change retained; baseline restore refused.");
        if (file.contents !== operation.before)
            await nativePublicationFiles.write(plan.file, operation.before, file);
        await options.afterRestoreWritten?.();
        const restored = await nativePublicationFiles.readExisting(plan.file);
        if (!restored || restored.contents !== operation.before)
            throw new Error("Actual native baseline restoration remains unproven.");
        operation.phase = "restored";
        operation.completedAt ??= new Date().toISOString();
        await writeAttentionState(options, recovery);
        return { operationId: operation.operationId, workId: operation.workId, phase: operation.phase, nativeRestored: true, publicRestored: false, requiresFreshCheck: true };
    });
}
