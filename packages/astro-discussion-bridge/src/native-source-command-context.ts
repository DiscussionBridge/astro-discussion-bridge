import path from "node:path";
import { lstat } from "node:fs/promises";
import { readExistingPublication } from "./native-files.js";
import type { SourceCommandReceipt } from "./cms-to-source-state.js";

const environmentKey = "DISCUSSIONBRIDGE_NATIVE_SOURCE_COMMAND_V4";
interface SourceCommandChildContext { docsDir: string; stateFile: string; commandId: string; kind: "build"; fence: number; deadlineMs: number }

/** Non-secret scheduling restriction for this build, never a credential or a
 * replacement for the action's native/receiver checks. Deploys stay unbound. */
export function sourceCommandChildEnvironment(docsDir: string, stateFile: string, command: SourceCommandReceipt, deadlineMs: number): NodeJS.ProcessEnv {
  const env = { ...process.env }; delete env[environmentKey];
  if (command.kind === "build") env[environmentKey] = JSON.stringify({ docsDir: path.resolve(docsDir), stateFile: path.resolve(stateFile), commandId: command.commandId, kind: command.kind, fence: command.fence, deadlineMs });
  return env;
}

export function sourceCommandChildContext(docsDir: string, stateFile: string): SourceCommandChildContext | undefined {
  const raw = process.env[environmentKey]; if (raw === undefined) return undefined;
  if (raw.length > 65536) throw new Error("Native source command scheduling context is invalid.");
  let value: SourceCommandChildContext;
  try { value = JSON.parse(raw); } catch { throw new Error("Native source command scheduling context is invalid."); }
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "commandId,deadlineMs,docsDir,fence,kind,stateFile"
    || typeof value.docsDir !== "string" || typeof value.stateFile !== "string" || value.docsDir.includes("\0") || value.stateFile.includes("\0")
    || !path.isAbsolute(value.docsDir) || !path.isAbsolute(value.stateFile) || path.resolve(value.docsDir) !== docsDir || path.resolve(value.stateFile) !== stateFile
    || value.kind !== "build" || typeof value.commandId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value.commandId)
    || !Number.isSafeInteger(value.fence) || value.fence < 1 || !Number.isSafeInteger(value.deadlineMs) || value.deadlineMs < 1) throw new Error("Native source command scheduling context requires its exact owner/scope.");
  return value;
}

export function assertSourceCommandChildDeadline(context: SourceCommandChildContext) {
  if (Date.now() >= context.deadlineMs) throw new Error("Native source command acquisition exceeded its original deadline.");
}

/** During contention this can refuse stale scheduling, never authorize a write.
 * After acquisition it is repeated against the full validated journal and actual
 * native root/file. Existing remote checks still execute in their own actions. */
export async function assertSourceCommandChildOwner(context: SourceCommandChildContext, acquired: boolean) {
  assertSourceCommandChildDeadline(context);
  // Deferred import avoids adding a static lock/state/native-source cycle.
  const { readPublicationOperationalState } = await import("./operational-state.js");
  const state = await readPublicationOperationalState(context.stateFile), owners = Object.values(state.operations).filter(operation => operation.to?.sourceMove?.commands?.build?.commandId === context.commandId);
  const operation = owners.length === 1 ? owners[0] : undefined, to = operation?.to, move = to?.sourceMove, receipt = move?.commands?.build, scope = state.nativeCensus;
  if (!to || !move || !receipt || receipt.kind !== context.kind || !["starting", "running"].includes(receipt.phase)
    || to.sourceFence !== context.fence || move.fence !== context.fence || receipt.fence !== context.fence || !["native_applied", "built"].includes(move.phase)
    || scope?.docsDir !== context.docsDir || to.nativeSource?.docsDir !== context.docsDir || !move.output
    || path.resolve(context.docsDir, to.nativeSource.relativePath) !== path.resolve(move.file)) throw new Error("Native source command current durable owner/fence requires reconciliation.");
  if (acquired) {
    const relative = path.relative(context.docsDir, move.file), root = await lstat(context.docsDir, { bigint: true });
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
      || !root.isDirectory() || root.isSymbolicLink() || scope.rootDev !== String(root.dev) || scope.rootIno !== String(root.ino)
      || (await readExistingPublication(move.file))?.contents !== move.output) throw new Error("Native source command lost its actual native source owner.");
  }
  assertSourceCommandChildDeadline(context);
}
