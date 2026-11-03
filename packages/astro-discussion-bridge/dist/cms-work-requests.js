import { createHash } from "node:crypto";
import * as runtime from "../src/private/cms-runtime.mjs";
const hash = (value) => createHash("sha256").update(runtime.semanticIdentity(value)).digest("hex");
function validateRequest(transaction, route, body) {
    runtime.validateCmsRoute(route, { path: { work_id: transaction.lease.work.work_id }, body });
    const request = body, authority = request.authority;
    if (authority.work_id !== transaction.lease.work.work_id || authority.source_revision !== transaction.lease.work.source_revision || authority.policy_revision !== transaction.lease.work.policy_revision
        || authority.lease_generation > transaction.lease.lease_generation || route === "V4-18" && request.transaction_id !== transaction.transactionId)
        throw new Error("CMS work history has foreign or future authority.");
}
export function workRequest(transaction, route, body) {
    validateRequest(transaction, route, body);
    const id = body.mutation_id;
    const history = transaction.workRequestHistory ??= Object.create(null);
    const prior = history[id];
    if (prior && (prior.route !== route || runtime.semanticIdentity(prior.body) !== runtime.semanticIdentity(body)))
        throw new Error("CMS retained work mutation identity changed.");
    return history[id] ??= { route, body: structuredClone(body) };
}
function validateResponse(transaction, entry, response) {
    runtime.validateCmsResponse(entry.route, response, 200);
    const value = response, authority = entry.body.authority;
    const work = transaction.lease.work;
    if (["work_id", "mapping_id", "source_id", "source_revision", "policy_revision", "action", "attempt_cycle"].some(key => value.work[key] !== work[key])
        || value.work.lease_generation !== authority.lease_generation)
        throw new Error("CMS work receipt changed its original work/authority binding.");
    if (entry.route === "V4-15") {
        const issuedLease = transaction.lease.lease_generation === authority.lease_generation ? transaction.lease : transaction.leaseHistory?.find(lease => lease.lease_generation === authority.lease_generation);
        if (value.lease_generation !== authority.lease_generation || value.lease_token !== authority.lease_token || !["leased", "synchronized", "deployed"].includes(value.work.state)
            || !issuedLease || value.work.attempt !== issuedLease.work.attempt || Date.parse(value.expires_at) <= Date.parse(value.server_time))
            throw new Error("CMS renewal receipt changed its original lease.");
    }
    else {
        const native = entry.body.native_result, mapping = value.mapping;
        if (value.work.state !== "synchronized" || mapping.mapping_id !== work.mapping_id || mapping.source_id !== work.source_id
            || mapping.desired_source_revision !== authority.source_revision || mapping.destination_native_id !== native.native_id
            || mapping.destination_native_revision !== native.native_revision || mapping.external_id !== native.external_id || mapping.canonical_url !== native.canonical_url)
            throw new Error("CMS Prepare receipt changed its original native result.");
    }
}
export function workRequestResponse(transaction, entry, response) {
    validateResponse(transaction, entry, response);
    if (entry.refusal || entry.response !== undefined && runtime.semanticIdentity(entry.response) !== runtime.semanticIdentity(response))
        throw new Error("CMS retained work receipt changed.");
    entry.response = structuredClone(response);
}
export function workRequestRefusal(entry, proof) {
    if (proof.routeId !== entry.route || proof.requestSha256 !== hash(entry.body) || entry.response !== undefined)
        throw new Error("CMS work refusal is not bound to its retained request.");
    runtime.validateCmsResponse(entry.route, proof.envelope, proof.httpStatus);
    // Keep the first exact proved refusal, not later correlation IDs or a guessed result.
    entry.refusal ??= structuredClone(proof);
}
export function expiryRefusal(entry) {
    const proof = entry.refusal;
    if (!proof)
        return undefined;
    if (proof.candidateId !== runtime.candidateId || proof.schemaSha256 !== runtime.cmsSchemaIdentity.sha256 || proof.contractSha256 !== runtime.specIdentity.sha256)
        throw new Error("CMS historical refusal requires its original protocol reconciliation.");
    return proof.httpStatus === 409 && ["lease_expired", "lease_conflict"].includes(proof.envelope.code) ? proof.envelope.code : undefined;
}
export function validateWorkRequestHistory(transaction) {
    if (transaction.workRequestHistory !== undefined) {
        const history = transaction.workRequestHistory;
        if (!history || typeof history !== "object" || Array.isArray(history))
            throw new Error("CMS retained work requests require reconciliation.");
        for (const [id, entry] of Object.entries(history)) {
            if (!entry || !["V4-15", "V4-18"].includes(entry.route) || !entry.body || entry.body.mutation_id !== id)
                throw new Error("CMS work request history identity changed.");
            validateRequest(transaction, entry.route, entry.body);
            if (entry.response !== undefined)
                validateResponse(transaction, entry, entry.response);
            if (entry.refusal) {
                if (entry.response !== undefined || entry.refusal.routeId !== entry.route || entry.refusal.requestSha256 !== hash(entry.body))
                    throw new Error("CMS work refusal history changed its request.");
                runtime.validateCmsResponse(entry.route, entry.refusal.envelope, entry.refusal.httpStatus);
                for (const key of ["requestSha256", "schemaSha256", "contractSha256"])
                    runtime.validateCms("Sha256", entry.refusal[key]);
            }
            if (entry.observedPrepared !== undefined && (entry.observedPrepared !== true || entry.route !== "V4-18"))
                throw new Error("CMS legacy preparation observation is invalid.");
        }
    }
    if (transaction.pendingRenewal) {
        const entry = transaction.workRequestHistory?.[transaction.pendingRenewal.body.mutation_id];
        if (!entry || entry.route !== "V4-15" || runtime.semanticIdentity(entry.body) !== runtime.semanticIdentity(transaction.pendingRenewal.body))
            throw new Error("CMS uncertain renewal lost its original request.");
    }
    let generation = 0;
    if (transaction.leaseHistory !== undefined && !Array.isArray(transaction.leaseHistory))
        throw new Error("CMS lease history is invalid.");
    for (const lease of transaction.leaseHistory ?? []) {
        runtime.validateCms("Lease", lease);
        const work = transaction.lease.work;
        if (["work_id", "mapping_id", "source_id", "source_revision", "policy_revision", "action", "attempt_cycle"].some(key => lease.work[key] !== work[key])
            || lease.lease_generation <= generation || lease.lease_generation >= transaction.lease.lease_generation)
            throw new Error("CMS lease history does not precede the current owner.");
        generation = lease.lease_generation;
    }
}
/** Current local command/settlement ownership cannot be bypassed by a fresh Claim. */
export function assertWorkReclaimAllowed(state, transaction) {
    const command = state.nativeCommand;
    if (command && (["starting", "running", "uncertain"].includes(command.phase ?? "") || command.workIds?.includes(transaction.lease.work.work_id)))
        throw new Error("CMS native command receipt requires its original settlement or explicit reconciliation before reclaim.");
    const move = transaction.presentationMove;
    if (transaction.finalizeBody || transaction.abortBody || transaction.failureBody || move && move.phase !== "committed")
        throw new Error("CMS chosen settlement or URL move cannot be replaced by ordinary reclaim.");
    if (!["claimed", "staged", "prepared"].includes(transaction.stage) || transaction.localLimitation)
        throw new Error("CMS work is outside ordinary same-work recovery.");
}
