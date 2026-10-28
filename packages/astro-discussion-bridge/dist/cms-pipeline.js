import { randomUUID } from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";
import { claimCmsNativeWork, cmsNativeLocation, cmsNativeReservation, pollCmsSources, reserveCmsSource, withCmsCoordinator } from "./cms-coordinator.js";
import { abortCmsNativeWork, cmsAuthority, finalizeCmsNativeWork, prepareCmsNativeWork, recordCmsNativeBuild as recordStaticBuild } from "./cms-static.js";
import { assertCmsPresentationCurrent, finalizeCmsNativeUrlMove, prepareCmsNativeUrlMove, presentationOf, recordCmsNativeMoveBuild } from "./cms-presentation.js";
import { nativePublicationFiles } from "./native-publication.js";
import { validateCms } from "../src/private/cms-runtime.mjs";
import { checkCmsAttention, synchronizeCmsAttentionRecoveries } from "./cms-attention.js";
import { CmsClient } from "./cms-client.js";
import { emptyCmsState, readCmsState } from "./cms-state.js";
import { attentionFile } from "./cms-attention-state.js";
/** Automatic initial/continuing intake and bounded native static staging. */
export async function stageCmsNativePublications(options) {
    const maximum = options.maximumWorkPerBuild ?? 32;
    if (!Number.isSafeInteger(maximum) || maximum < 1)
        throw new Error("CMS native batch size must be a positive safe integer.");
    // The positive recovery channel is needed only when this native owner holds
    // attention history. Older services are never silently granted recovery.
    const prior = await readCmsState(options.stateFile, emptyCmsState(new CmsClient(options), options.siteUrl, options.connectionId));
    if (Object.values(prior.transactions).some(value => value.stage === "attention") || await nativePublicationFiles.readExisting(attentionFile(options))) {
        await checkCmsAttention(options);
        await synchronizeCmsAttentionRecoveries(options);
    }
    const cursors = new Set();
    let events = 0;
    for (;;) {
        const page = await pollCmsSources(options);
        events += page.staged;
        if (page.continuation === null)
            break;
        if (cursors.has(page.continuation))
            throw new Error("CMS native source continuation repeated without completing its staged page.");
        cursors.add(page.continuation);
    }
    const snapshot = await withCmsCoordinator(options, async ({ state }) => ({
        sources: Object.entries(state.sources).filter(([id, event]) => event.event_type === "publication" && state.mappings[id]?.desired_source_revision !== event.source.source_revision).map(([id]) => id),
        transactions: Object.entries(state.transactions).map(([id, transaction]) => ({ id, stage: transaction.stage, finalizeBody: transaction.finalizeBody,
            abortBody: transaction.abortBody, failureBody: transaction.failureBody, localLimitation: transaction.localLimitation, mappingId: transaction.lease.work.mapping_id, move: presentationOf(transaction) })),
        mappings: Object.values(state.mappings).map(mapping => mapping.mapping_id),
    }));
    for (const id of snapshot.sources)
        snapshot.mappings.push((await reserveCmsSource(options, id)).mapping_id);
    const prepared = [];
    for (const transaction of snapshot.transactions) {
        if (transaction.localLimitation)
            continue;
        if (["verified", "aborted", "attention"].includes(transaction.stage))
            continue;
        if (transaction.move && transaction.move.phase !== "committed") {
            if (["attention", "aborted"].includes(transaction.move.phase))
                throw new Error("CMS native URL move requires explicit current reconciliation.");
            await prepareCmsNativeUrlMove(options, transaction.id, transaction.move.prepare.new_url);
            prepared.push(transaction.id);
            continue;
        }
        // Replay only an already durably chosen settlement; no new deployment,
        // restoration, public verification or administrator retry is inferred.
        if (transaction.finalizeBody) {
            await finalizeCmsNativeWork(options, transaction.id, { deploymentId: transaction.finalizeBody.deployment_id, deployedAt: transaction.finalizeBody.deployed_at });
            continue;
        }
        if (transaction.abortBody) {
            await abortCmsNativeWork(options, transaction.id);
            continue;
        }
        if (transaction.failureBody) {
            await finalizeCmsNativeWork(options, transaction.id, { deploymentId: "failure-receipt-replay", deployedAt: new Date().toISOString() });
        }
        if (["claimed", "staged"].includes(transaction.stage))
            await prepareCmsNativeWork(options, transaction.id);
        if (["claimed", "staged", "prepared"].includes(transaction.stage))
            prepared.push(transaction.id);
    }
    const localLimitations = snapshot.transactions.filter(transaction => transaction.localLimitation);
    const heldMappings = new Set(localLimitations.map(transaction => transaction.mappingId));
    const otherMappings = [...new Set(snapshot.mappings)].filter(mappingId => !heldMappings.has(mappingId));
    for (let count = prepared.length; count < maximum; count++) {
        // Current Claim has only a positive mapping selector; never invent an
        // exclusion field or reselect known unusable work through an unfiltered claim.
        const mappingId = localLimitations.length ? otherMappings.shift() : undefined;
        if (localLimitations.length && mappingId === undefined)
            break;
        const claimed = await claimCmsNativeWork(options, mappingId);
        if (!claimed) {
            if (localLimitations.length)
                continue;
            break;
        }
        if (prepared.includes(claimed.workId))
            throw new Error("CMS claim returned a work item already held by this native batch.");
        await prepareCmsNativeWork(options, claimed.workId);
        prepared.push(claimed.workId);
    }
    return { stagedEvents: events, prepared, pendingDeployment: prepared.length,
        localLimitations: localLimitations.map(transaction => ({ workId: transaction.id, mappingId: transaction.mappingId, detail: transaction.localLimitation.detail })) };
}
export async function recordCmsNativeBuild(options, buildDir) {
    const publication = await recordStaticBuild(options, buildDir);
    const move = await recordCmsNativeMoveBuild(options, buildDir);
    return { recorded: [...publication.recorded, ...move.recorded] };
}
export { finalizeCmsNativeWork, abortCmsNativeWork };
export async function renewCmsNativeBuild(options) {
    return withCmsCoordinator(options, async ({ client, state, save }) => {
        for (const [id, transaction] of Object.entries(state.transactions)) {
            if (presentationOf(transaction)?.phase === "applied") {
                await assertCmsPresentationCurrent({ client, state }, transaction, options);
                const renewed = await client.renew(randomUUID(), cmsAuthority(transaction));
                if (renewed.lease_token !== transaction.lease.lease_token || renewed.lease_generation !== transaction.lease.lease_generation)
                    throw new Error("CMS URL move renewal changed authority.");
                transaction.lease = renewed;
                continue;
            }
            if (transaction.stage !== "prepared" || transaction.finalizeBody || transaction.abortBody || transaction.failureBody)
                continue;
            const current = await client.query(id), old = transaction.lease;
            if (!["synchronized", "deployed"].includes(current.work.state) || current.work.work_id !== id || current.work.source_revision !== old.work.source_revision || current.work.policy_revision !== old.work.policy_revision
                || current.work.lease_generation !== old.lease_generation || state.generations[current.work.mapping_id] !== old.lease_generation)
                throw new Error("CMS native build authority changed; reconciliation is required.");
            const renewed = await client.renew(randomUUID(), cmsAuthority(transaction));
            if (renewed.lease_token !== old.lease_token || renewed.lease_generation !== old.lease_generation || renewed.work.work_id !== id)
                throw new Error("CMS native build renewal changed authority.");
            transaction.lease = renewed;
        }
        await save();
    });
}
/** Caller-configured native deploy argv under the same native writer locks. */
export async function deployCmsNativeBuild(options, command) {
    if (!path.isAbsolute(command.executable) || !path.isAbsolute(command.cwd) || !Array.isArray(command.args) || command.args.some(value => typeof value !== "string" || value.includes("\0"))
        || typeof command.executable !== "string" || command.executable.includes("\0") || command.timeoutMs !== undefined && (!Number.isSafeInteger(command.timeoutMs) || command.timeoutMs < 1))
        throw new Error("CMS deployment requires explicit native executable, structured argv, working directory and valid timeout.");
    await nativePublicationFiles.assertDirectory(command.cwd);
    const receipt = await withCmsCoordinator(options, async ({ client, state, save }) => {
        const prior = state.nativeCommand;
        if (prior && ["starting", "running", "uncertain"].includes(prior.phase))
            throw new Error("An uncertain native command owner must reconcile actual process/deployment state before another command.");
        const unsettled = prior?.workIds.filter(id => prior.phases?.[id] === "move" ? ["applied", "committed"].includes(presentationOf(state.transactions[id])?.phase ?? "") && !state.transactions[id].prepareBody : state.transactions[id]?.stage === "prepared") ?? [];
        if (prior?.phase === "succeeded" && unsettled.length) {
            validateCms("OpaqueId", prior.deploymentId);
            validateCms("Instant", prior.deployedAt);
            if (prior.executable !== command.executable || prior.cwd !== command.cwd || JSON.stringify(prior.args) !== JSON.stringify(command.args))
                throw new Error("An accepted native command receipt must settle before another command configuration.");
            return { deploymentId: prior.deploymentId, deployedAt: prior.deployedAt, workIds: unsettled, phases: prior.phases, commandReceipt: structuredClone(prior) };
        }
        for (const transaction of Object.values(state.transactions)) {
            if (["attention", "aborted"].includes(presentationOf(transaction)?.phase ?? ""))
                throw new Error("CMS applied URL move/native reservations require explicit reconciliation before another deployment.");
            if (transaction.stage !== "attention" || !transaction.plan)
                continue;
            let reconciled = false;
            for (const newer of Object.values(state.transactions)) {
                if (newer.lease.work.mapping_id !== transaction.lease.work.mapping_id || newer.lease.lease_generation <= transaction.lease.lease_generation || !["prepared", "verified"].includes(newer.stage) || !newer.buildArtifact)
                    continue;
                const plan = newer.plan;
                if (plan && plan.file === cmsNativeReservation(options, { source_id: newer.lease.work.source_id }).file && (await nativePublicationFiles.readExisting(plan.file))?.contents === plan.output)
                    reconciled = true;
            }
            if (!reconciled)
                throw new Error("A current owned result in this static artifact requires native reconciliation before another deployment.");
        }
        const workIds = Object.keys(state.transactions).filter(id => presentationOf(state.transactions[id])?.phase === "applied" && presentationOf(state.transactions[id])?.build
            || state.transactions[id].stage === "prepared" && state.transactions[id].buildArtifact && !state.transactions[id].finalizeBody && !state.transactions[id].abortBody && !state.transactions[id].failureBody);
        if (!workIds.length)
            throw new Error("CMS deployment has no observed prepared native build.");
        const phases = Object.fromEntries(workIds.map(id => [id, presentationOf(state.transactions[id])?.phase === "applied" ? "move" : "publication"]));
        async function renew() {
            for (const id of workIds) {
                const transaction = state.transactions[id], work = transaction.lease.work;
                if (phases[id] === "move") {
                    await assertCmsPresentationCurrent({ client, state }, transaction, options);
                    const renewed = await client.renew(randomUUID(), cmsAuthority(transaction));
                    if (renewed.lease_token !== transaction.lease.lease_token || renewed.lease_generation !== transaction.lease.lease_generation)
                        throw new Error("CMS URL move command renewal changed authority.");
                    transaction.lease = renewed;
                    continue;
                }
                const current = await client.query(id);
                const reservation = cmsNativeLocation(options, state, work.source_id);
                if (current.work.work_id !== id || current.work.source_revision !== work.source_revision || current.work.policy_revision !== work.policy_revision || current.work.lease_generation !== transaction.lease.lease_generation
                    || !["synchronized", "deployed"].includes(current.work.state) || state.generations[work.mapping_id] !== transaction.lease.lease_generation)
                    throw new Error("CMS native command lost current work authority.");
                const plan = transaction.plan;
                if (!plan || plan.file !== reservation.file || plan.nativeResult.native_id !== reservation.nativeId || plan.nativeResult.canonical_url !== reservation.canonicalUrl
                    || current.mapping.canonical_url !== plan.nativeResult.canonical_url || current.mapping.destination_native_id !== plan.nativeResult.native_id || (await nativePublicationFiles.readExisting(plan.file))?.contents !== plan.output)
                    throw new Error("CMS native command artifact or ownership changed.");
                const lease = await client.renew(randomUUID(), cmsAuthority(transaction));
                if (lease.lease_generation !== transaction.lease.lease_generation || lease.lease_token !== transaction.lease.lease_token || lease.work.work_id !== id)
                    throw new Error("CMS native command renewal changed authority.");
                transaction.lease = lease;
            }
            await save();
        }
        await renew();
        const owner = { commandId: randomUUID(), phase: "starting", workIds, phases, executable: command.executable, args: [...command.args], cwd: command.cwd,
            startedAt: new Date().toISOString(), deploymentId: randomUUID() };
        state.nativeCommand = owner;
        await save();
        let child;
        let closed;
        let renewalError, renewal = Promise.resolve();
        const controller = new AbortController();
        const timer = setInterval(() => { renewal = renewal.then(renew).catch(error => { renewalError = error; controller.abort(); }); }, 60_000);
        const timeout = setTimeout(() => controller.abort(), command.timeoutMs ?? 300_000);
        try {
            child = (options.spawnImplementation ?? spawn)(command.executable, command.args, { cwd: command.cwd, shell: false, windowsHide: true, stdio: "ignore", signal: controller.signal });
            // Subscribe before awaiting the journal write: a short process may finish
            // immediately. A crash between start and pid persistence remains uncertain.
            closed = new Promise(resolve => { child.once("close", () => { owner.childClosedAt = new Date().toISOString(); owner.terminationConfirmed = true; resolve(); }); });
            const completion = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => code === 0 && signal === null ? resolve() : reject(new Error("Native deployment command did not complete successfully."))); });
            completion.catch(() => undefined);
            owner.phase = "running";
            owner.pid = child.pid;
            await save();
            await completion;
            clearInterval(timer);
            clearTimeout(timeout);
            await renewal;
            if (renewalError || controller.signal.aborted)
                throw new Error("Native deployment command authority/outcome requires reconciliation.");
            await renew();
            owner.phase = "succeeded";
            owner.completedAt = new Date().toISOString();
            owner.deployedAt = owner.completedAt;
            await save();
            return { deploymentId: owner.deploymentId, deployedAt: owner.deployedAt, workIds, phases, commandReceipt: structuredClone(owner) };
        }
        catch {
            clearInterval(timer);
            clearTimeout(timeout);
            controller.abort();
            await renewal;
            // Abort emits error before the actual OS close. Keep native writer locks
            // until close is observed; escalate a direct child ignoring SIGTERM.
            if (child && closed) {
                const escalation = setTimeout(() => { if (!owner.terminationConfirmed)
                    child.kill("SIGKILL"); }, 1000);
                try {
                    await closed;
                }
                finally {
                    clearTimeout(escalation);
                }
            }
            owner.phase = child?.pid ? "uncertain" : "failed";
            owner.completedAt = new Date().toISOString();
            await save();
            throw new Error("Native deployment command failed or its effect is uncertain; reconcile actual native state before any rerun.");
        }
    });
    const results = [];
    const pending = [];
    for (const id of receipt.workIds) {
        try {
            if (receipt.phases?.[id] === "move") {
                results.push(await finalizeCmsNativeUrlMove(options, id, { deploymentId: receipt.deploymentId, deployedAt: receipt.deployedAt }, receipt.commandReceipt));
                await prepareCmsNativeWork(options, id);
            }
            else
                results.push(await finalizeCmsNativeWork(options, id, receipt));
        }
        catch {
            pending.push(id);
        }
    }
    if (pending.length)
        throw new Error("One or more exact native work settlements require attention/replay; successful independent receipts remain durable.");
    return { deploymentId: receipt.deploymentId, deployedAt: receipt.deployedAt, results, requiresFreshBuild: receipt.workIds.some(id => receipt.phases?.[id] === "move") };
}
