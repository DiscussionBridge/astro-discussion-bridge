#!/usr/bin/env node
import path from "node:path";
import { publishControlledDiscussions, withdrawControlledSource, stageControlledSourceRetry } from "./controlled-creation.js";
import { stageCmsNativePublications, recordCmsNativeBuild, deployCmsNativeBuild, finalizeCmsNativeWork, abortCmsNativeWork } from "./cms-pipeline.js";
import { withCmsCoordinator } from "./cms-coordinator.js";
import { beginCmsNativeUrlMove, abortCmsNativeUrlMove } from "./cms-presentation.js";
import { nativePublicationFiles } from "./native-publication.js";
import { readPublicationOperationalState } from "./operational-state.js";
import { checkCmsAttention, synchronizeCmsAttentionRecoveries } from "./cms-attention.js";
import { restoreCmsAttentionBaseline } from "./cms-attention-native.js";
import { runCmsAttentionBaselineCommand } from "./cms-attention-command.js";
import { readAttentionState } from "./cms-attention-state.js";
const args = process.argv.slice(2), command = args.shift(), values = new Map();
if (!command || !["publish-sources", "withdraw-source", "retry-source", "source-status", "sync-publications", "publication-status", "cms-record-build", "cms-deploy", "cms-finalize", "cms-abort", "cms-prepare-url-move", "cms-abort-url-move", "cms-check-attention", "cms-recover-attention", "cms-restore-baseline", "cms-baseline-command", "cms-attention-status"].includes(command))
    throw new Error("A current native DiscussionBridge command is required.");
while (args.length) {
    const key = args.shift(), value = args.shift();
    if (!key?.startsWith("--") || value === undefined || values.has(key.slice(2)))
        throw new Error("Native command arguments require unique named values.");
    values.set(key.slice(2), value);
}
if (values.has("transport") || values.has("to-transport") || values.has("receiver-profile-file"))
    throw new Error("Native DiscussionBridge uses one V4 protocol without transport/profile selectors.");
const required = (name) => { const value = values.get(name); if (!value)
    throw new Error(`Native command requires ${name}.`); return value; };
const stateFile = path.resolve(required("state-file"));
if (command === "source-status") {
    const state = await readPublicationOperationalState(stateFile);
    process.stdout.write(JSON.stringify(Object.values(state.operations).map(operation => ({ externalId: operation.externalId, outcome: operation.outcome, pending: Boolean(operation.to?.pending), rejection: operation.to?.pending?.rejection ? { mutationId: operation.to.pending.body.mutation_id, code: operation.to.pending.rejection.code, routeId: operation.to.pending.rejection.routeId, httpStatus: operation.to.pending.rejection.httpStatus, retryable: false } : null, retries: Object.values(operation.to?.retryIntents ?? {}).map(intent => ({ refusedMutationId: intent.refusedMutationId, phase: intent.phase })), nativeRender: Boolean(operation.nativeRender), detail: operation.lastError ?? null, withdrawal: operation.to?.withdrawal?.phase ?? null }))) + "\n");
    process.exit(0);
}
const credentials = { serverUrl: process.env.DISCUSSIONBRIDGE_SERVER_URL ?? "", connectionId: process.env.DISCUSSIONBRIDGE_CONNECTION_ID ?? "", secretFile: process.env.DISCUSSIONBRIDGE_SECRET_FILE,
    connectionSecret: process.env.DISCUSSIONBRIDGE_SECRET_FILE ? undefined : process.env.DISCUSSIONBRIDGE_CONNECTION_SECRET };
const common = { ...credentials, docsDir: path.resolve(required("docs-dir")), siteUrl: required("site-url"), stateFile, routeBase: values.get("route-base") };
let result;
if (command === "publish-sources" || command === "withdraw-source" || command === "retry-source") {
    const options = { ...common, discourseUrl: credentials.serverUrl, controlledCreation: { ...credentials, lane: values.get("lane") } };
    result = command === "publish-sources" ? await publishControlledDiscussions(options) : command === "retry-source"
        ? await stageControlledSourceRetry(options, path.resolve(required("source-file")), required("refused-mutation-id"))
        : await withdrawControlledSource(options, path.resolve(required("source-file")), required("reason"));
}
else if (command === "cms-check-attention")
    result = await checkCmsAttention(common);
else if (command === "cms-recover-attention")
    result = await synchronizeCmsAttentionRecoveries(common);
else if (command === "cms-restore-baseline") {
    const recovery = await readAttentionState(common), instruction = recovery.inspections[required("inspection-id")]?.instruction;
    if (!instruction)
        throw new Error("A retained exact attention inspection is required.");
    result = await restoreCmsAttentionBaseline(common, instruction, required("journal-sha256"));
}
else if (command === "cms-baseline-command") {
    const file = await nativePublicationFiles.readExisting(path.resolve(required("command-file")));
    if (!file)
        throw new Error("Configured structured native command is unavailable.");
    result = await runCmsAttentionBaselineCommand(common, required("restoration-operation-id"), JSON.parse(file.contents));
}
else if (command === "cms-attention-status") {
    const recovery = await readAttentionState(common);
    result = { inspections: Object.values(recovery.inspections).map(value => ({ inspectionId: value.instruction.inspection_id, workId: value.instruction.work.work_id, contextSha256: value.instruction.context_sha256,
            journalSha256: value.observation?.journal_sha256 ?? null, nativeState: value.observation?.native_state ?? null, status: value.result?.status ?? "waiting", issue: value.result?.issue ?? value.observation?.issue ?? null })),
        restorations: Object.values(recovery.restorations).map(value => ({ operationId: value.operationId, workId: value.workId, phase: value.phase })), commands: Object.values(recovery.commands ?? {}).map(value => ({ operationId: value.operationId, phase: value.phase })),
        recoveries: Object.values(recovery.recoveries).map(value => ({ recoveryId: value.event.recovery_id, predecessorWorkId: value.event.predecessor_work_id, workId: value.event.work.work_id, phase: value.phase })) };
}
else if (command === "sync-publications")
    result = await stageCmsNativePublications({ ...common, maximumWorkPerBuild: values.has("max-work") ? Number(values.get("max-work")) : undefined });
else if (command === "publication-status")
    result = await withCmsCoordinator(common, async ({ state }) => ({ stagedEvents: Object.keys(state.events).length,
        transactions: Object.entries(state.transactions).map(([workId, value]) => ({ workId, stage: value.stage, localLimitation: value.localLimitation?.detail ?? null, publiclyVerifiedAt: value.publiclyVerifiedAt ?? null })), nativeCommand: state.nativeCommand ? { phase: state.nativeCommand.phase } : null }));
else if (command === "cms-record-build")
    result = await recordCmsNativeBuild(common, path.resolve(required("build-dir")));
else if (command === "cms-deploy") {
    const file = await nativePublicationFiles.readExisting(path.resolve(required("command-file")));
    if (!file)
        throw new Error("Configured structured native command is unavailable.");
    result = await deployCmsNativeBuild(common, JSON.parse(file.contents));
}
else if (command === "cms-abort")
    result = await abortCmsNativeWork(common, required("work-id"));
else if (command === "cms-prepare-url-move")
    result = await beginCmsNativeUrlMove(common, required("mapping-id"), required("new-url"));
else if (command === "cms-abort-url-move")
    result = await abortCmsNativeUrlMove(common, required("work-id"));
else
    result = await finalizeCmsNativeWork(common, required("work-id"), { deploymentId: required("deployment-id"), deployedAt: required("deployed-at") });
process.stdout.write(JSON.stringify(result) + "\n");
