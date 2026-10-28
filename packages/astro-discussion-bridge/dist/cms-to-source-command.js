import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { withCurrentSourceMove } from "./cms-to-source-move.js";
import { nativePublicationFiles } from "./native-publication.js";
import { writePublicationOperationalState } from "./operational-state.js";
import { withNativeSourceWriter, NativeSourceWriterBusyError } from "./native-locks.js";
import { writePrivateJournal } from "./native-journal.js";
import { semanticIdentity } from "../src/private/cms-runtime.mjs";
import { readPublicationOperationalState } from "./operational-state.js";
/** Structured native commands; the OS writer is released for child build hooks.
 * The durable source fence/owner still excludes another command/publication.
 * An uncertain PID/effect requires reconciliation, never a duplicate command.
 */
export async function runControlledSourceCommand(options, sourceFile, kind, command) {
    if (!path.isAbsolute(command.executable) || !path.isAbsolute(command.cwd) || command.executable.includes("\0") || !Array.isArray(command.args) || command.args.some(arg => typeof arg !== "string" || arg.includes("\0"))
        || command.timeoutMs !== undefined && (!Number.isSafeInteger(command.timeoutMs) || command.timeoutMs < 1))
        throw new Error("Native source command requires explicit executable, structured argv/cwd and valid timeout.");
    await nativePublicationFiles.assertDirectory(command.cwd);
    const prior = await withCurrentSourceMove(options, sourceFile, async (state, _operation, move) => {
        // These commands operate on the configured site's shared native artifact.
        // Check every actual source owner under this SAME writer, not only this
        // file, before allowing another child to build/deploy that artifact.
        const entries = Object.values(state.operations).flatMap(operation => Object.values(operation.to?.sourceMove?.commands ?? {}));
        if (entries.some(receipt => ["starting", "running", "uncertain"].includes(receipt.phase)))
            throw new Error("An uncertain source command/process owner blocks another command.");
        const saved = move.commands?.[kind];
        if (saved?.phase === "succeeded") {
            if (saved.executable !== command.executable || saved.cwd !== command.cwd || JSON.stringify(saved.args) !== JSON.stringify(command.args))
                throw new Error("Current source command receipt cannot be replaced by different argv.");
            return structuredClone(saved);
        }
        if (kind === "build" && !["native_applied", "built"].includes(move.phase) || kind === "deploy" && (move.phase !== "built" || !move.nativeCapture?.build))
            throw new Error("Source command lacks the actual current native stage/build.");
        const receipt = { commandId: randomUUID(), kind, phase: "starting", executable: command.executable, args: [...command.args], cwd: command.cwd,
            fence: move.fence, startedAt: new Date().toISOString(), deploymentId: randomUUID() };
        move.commands ??= {};
        move.commands[kind] = receipt;
        await writePublicationOperationalState(options.stateFile, state);
        return structuredClone(receipt);
    });
    if (prior.phase === "succeeded")
        return prior;
    const controller = new AbortController(), deadline = Date.now() + (command.timeoutMs ?? 300000);
    let writerBusyDeferrals = 0;
    const available = async (action) => {
        for (;;) {
            if (controller.signal.aborted || Date.now() >= deadline)
                throw new Error("Native source command current check exceeded its original deadline.");
            try {
                return await action();
            }
            catch (error) {
                if (!(error instanceof NativeSourceWriterBusyError))
                    throw error;
                writerBusyDeferrals++;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
    };
    const persistOwner = async (changes, requireCurrent = true) => {
        const update = async (state) => {
            const operation = Object.values(state.operations).find(item => item.to?.sourceMove?.commands?.[kind]?.commandId === prior.commandId), move = operation?.to?.sourceMove, receipt = move?.commands?.[kind];
            if (!move || !receipt || receipt.fence !== prior.fence || move.fence !== prior.fence)
                throw new Error("Native source command durable owner changed.");
            Object.assign(receipt, changes);
            if (changes.phase === "succeeded") {
                if (controller.signal.aborted || Date.now() >= deadline)
                    throw new Error("Native source command deadline/authority requires reconciliation.");
                if (kind === "build" && (!move.nativeCapture?.build || move.nativeCapture.build.builtAt < prior.startedAt))
                    throw new Error("Native build command did not emit its ACTUAL full source artifact.");
                if (kind === "deploy") {
                    move.deployedAt = changes.completedAt;
                    move.deploymentId = receipt.deploymentId;
                    move.phase = "deployed";
                }
            }
            await writePublicationOperationalState(options.stateFile, state);
            return structuredClone(receipt);
        };
        if (requireCurrent)
            return withCurrentSourceMove(options, sourceFile, state => update(state));
        // A failed authority check must still save the actual child outcome. This
        // updates ONLY the exact existing owner, never grants replacement authority.
        return withNativeSourceWriter(options.docsDir, options.stateFile, async () => update(await readPublicationOperationalState(options.stateFile)));
    };
    let child, closed, closedAt, guardFailure, exitCode = null, exitSignal = null;
    let checks = Promise.resolve(), checking = false;
    const interval = setInterval(() => {
        if (checking || controller.signal.aborted)
            return;
        checking = true;
        checks = (async () => {
            try {
                await withCurrentSourceMove(options, sourceFile, async () => undefined);
            }
            catch (error) {
                if (error instanceof NativeSourceWriterBusyError) {
                    writerBusyDeferrals++;
                    return;
                }
                throw error;
            }
        })().catch(error => { guardFailure = error; controller.abort(); }).finally(() => { checking = false; });
    }, 1000);
    const timeout = setTimeout(() => controller.abort(), command.timeoutMs ?? 300000);
    const processReceiptFile = path.resolve(`${options.stateFile}.source-commands`, `${prior.commandId}.json`);
    const observe = async () => {
        const receipt = { format: 1, commandId: prior.commandId, fence: prior.fence, kind, pid: child?.pid ?? null, closedAt: closedAt ?? null, terminationConfirmed: !!closedAt,
            exitCode, exitSignal, observedAt: new Date().toISOString(), writerBusyDeferrals };
        const existing = await nativePublicationFiles.readExisting(processReceiptFile);
        if (existing) {
            const stored = JSON.parse(existing.contents);
            if (stored.commandId !== receipt.commandId || stored.fence !== receipt.fence || stored.closedAt !== receipt.closedAt || stored.exitCode !== receipt.exitCode || stored.exitSignal !== receipt.exitSignal)
                throw new Error("Native process observation cannot replace a different actual outcome.");
            return;
        }
        // This is an OS observation, not native/source authority. It remains
        // durable even if a killed child's actual source lock has not gone stale.
        await writePrivateJournal(processReceiptFile, receipt, value => { if (semanticIdentity(value) !== semanticIdentity(receipt))
            throw new Error("Native process observation differs."); return value; });
    };
    try {
        child = spawn(command.executable, command.args, { cwd: command.cwd, shell: false, windowsHide: true, stdio: "ignore", signal: controller.signal });
        closed = new Promise(resolve => { child.once("close", (code, signal) => { closedAt = new Date().toISOString(); exitCode = code; exitSignal = signal; resolve(); }); });
        const completion = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => code === 0 && signal === null ? resolve() : reject(new Error("Native source command did not complete successfully."))); });
        completion.catch(() => undefined);
        await available(() => persistOwner({ phase: "running", pid: child.pid }));
        await completion;
        clearInterval(interval);
        await checks;
        await observe();
        if (guardFailure || controller.signal.aborted)
            throw new Error("Source command current authority/outcome requires reconciliation.");
        const result = await available(() => persistOwner({ phase: "succeeded", completedAt: new Date().toISOString(), childClosedAt: closedAt, terminationConfirmed: true, processReceiptFile, writerBusyDeferrals }));
        clearTimeout(timeout);
        return result;
    }
    catch {
        clearInterval(interval);
        clearTimeout(timeout);
        controller.abort();
        await checks;
        if (child && closed) {
            const escalation = setTimeout(() => { if (!closedAt)
                child.kill("SIGKILL"); }, 1000);
            try {
                await closed;
            }
            finally {
                clearTimeout(escalation);
            }
        }
        await observe();
        try {
            await persistOwner({ phase: child?.pid ? "uncertain" : "failed", completedAt: new Date().toISOString(), childClosedAt: closedAt, terminationConfirmed: !!closedAt, processReceiptFile, writerBusyDeferrals }, false);
        }
        catch (error) {
            if (!(error instanceof NativeSourceWriterBusyError))
                throw error; /* exact starting/running owner still blocks replay; OS observation is durable */
        }
        throw new Error("Native source command failed or its effect is uncertain; no automatic rerun is permitted.");
    }
}
