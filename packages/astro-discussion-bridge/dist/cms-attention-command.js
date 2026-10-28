import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { CmsClient } from "./cms-client.js";
import { emptyCmsState, readCmsState } from "./cms-state.js";
import { readAttentionState, writeAttentionState } from "./cms-attention-state.js";
import { withNativeSourceWriter } from "./native-locks.js";
import { nativePublicationFiles } from "./native-publication.js";
import { semanticIdentity, validateCms } from "../src/private/cms-runtime.mjs";
/** Separate explicit native-owner action. Neither Check nor Restore invokes it. */
export async function runCmsAttentionBaselineCommand(options, restorationOperationId, command) {
    validateCms("UUID", restorationOperationId);
    if (typeof command.executable !== "string" || !path.isAbsolute(command.executable) || command.executable.includes("\0") || typeof command.cwd !== "string" || !path.isAbsolute(command.cwd)
        || !Array.isArray(command.args) || command.args.some(value => typeof value !== "string" || value.includes("\0")) || command.timeoutMs !== undefined && (!Number.isSafeInteger(command.timeoutMs) || command.timeoutMs < 1))
        throw new Error("Baseline command requires explicit native executable, structured argv, cwd and valid timeout.");
    await nativePublicationFiles.assertDirectory(command.cwd);
    return withNativeSourceWriter(options.docsDir, options.stateFile, async () => {
        const recovery = await readAttentionState(options), restore = recovery.restorations[restorationOperationId];
        if (!restore || restore.phase !== "restored")
            throw new Error("Baseline command requires an actually restored recorded baseline.");
        recovery.commands ??= Object.create(null);
        const prior = Object.values(recovery.commands).find(value => value.restorationOperationId === restorationOperationId);
        if (prior) {
            if (prior.phase !== "succeeded" || prior.executable !== command.executable || prior.cwd !== command.cwd || semanticIdentity(prior.args) !== semanticIdentity(command.args))
                throw new Error("Recorded baseline command is unsettled or changed; no rerun is inferred.");
            return { operationId: prior.operationId, phase: prior.phase, requiresFreshCheck: true };
        }
        const client = new CmsClient(options), state = await readCmsState(options.stateFile, emptyCmsState(client, options.siteUrl, options.connectionId));
        const active = state.nativeCommand;
        if (active && ["starting", "running", "uncertain"].includes(active.phase) || Object.values(recovery.commands).some(value => ["starting", "running", "uncertain"].includes(value.phase)))
            throw new Error("An active or uncertain native command prevents baseline execution.");
        const inspection = recovery.inspections[restore.inspectionId]?.instruction;
        if (!inspection || inspection.context_sha256 !== restore.contextSha256)
            throw new Error("Baseline command requires its retained exact inspection context.");
        async function assertBaseline() {
            const current = await client.query(restore.workId), file = await nativePublicationFiles.readExisting(restore.file);
            if (semanticIdentity(current.work) !== semanticIdentity(inspection.work) || semanticIdentity(current.mapping) !== semanticIdentity(inspection.mapping)
                || !file || file.contents !== restore.before)
                throw new Error("Baseline native/context changed before or during command.");
            for (const [id, transaction] of Object.entries(state.transactions)) {
                if (["verified", "aborted"].includes(transaction.stage) || id === restore.workId)
                    continue;
                const plan = transaction.plan;
                if (["claimed", "staged", "prepared"].includes(transaction.stage) || plan && (await nativePublicationFiles.readExisting(plan.file))?.contents !== plan.previous)
                    throw new Error("Another pending native result prevents a baseline-only command.");
            }
        }
        await assertBaseline();
        const owner = { operationId: randomUUID(), restorationOperationId, phase: "starting", executable: command.executable,
            args: [...command.args], cwd: command.cwd, startedAt: new Date().toISOString() };
        recovery.commands[owner.operationId] = owner;
        await writeAttentionState(options, recovery);
        const controller = new AbortController();
        let child, closed;
        const timer = setTimeout(() => controller.abort(), command.timeoutMs ?? 300_000);
        try {
            child = (options.spawnImplementation ?? spawn)(command.executable, command.args, { cwd: command.cwd, shell: false, windowsHide: true, stdio: "ignore", signal: controller.signal });
            closed = new Promise(resolve => child.once("close", () => { owner.childClosedAt = new Date().toISOString(); owner.terminationConfirmed = true; resolve(); }));
            const completion = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => code === 0 && signal === null ? resolve() : reject(new Error("Baseline command outcome requires reconciliation."))); });
            completion.catch(() => undefined);
            owner.phase = "running";
            owner.pid = child.pid;
            await writeAttentionState(options, recovery);
            await completion;
            if (controller.signal.aborted)
                throw new Error("Baseline command timed out.");
            await assertBaseline();
            owner.phase = "succeeded";
            owner.completedAt = new Date().toISOString();
            await writeAttentionState(options, recovery);
            return { operationId: owner.operationId, phase: owner.phase, requiresFreshCheck: true };
        }
        catch {
            controller.abort();
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
            await writeAttentionState(options, recovery);
            throw new Error("Baseline command failed or is uncertain; actual native/process state must be reconciled before another command.");
        }
        finally {
            clearTimeout(timer);
        }
    });
}
