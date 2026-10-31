import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { lock } from "proper-lockfile";
import { assertPublicationDirectory, mkdirDurably } from "./native-files.js";
import { sourceCommandChildContext, assertSourceCommandChildOwner, assertSourceCommandChildDeadline } from "./native-source-command-context.js";

/** Internal native lock condition, not a wire failure or authority decision. */
export class NativeSourceWriterBusyError extends Error {
  constructor() { super("DiscussionBridge native source writer is already in use."); this.name = "NativeSourceWriterBusyError"; }
}
const writerCalls = new AsyncLocalStorage<ReadonlySet<string>>();

/** Only acquisition errors are retryable. An action's ELOCKED must propagate
 * unchanged: it may already have produced an uncertain effect. */
async function acquireNativeWriter(docsDir: string, stateFile: string) {
  let releaseContent: (() => Promise<void>) | undefined, releaseState: (() => Promise<void>) | undefined;
  const release = async () => { try { await releaseState?.(); } finally { await releaseContent?.(); } };
  try {
    releaseContent = await lock(docsDir, { realpath: false, retries: 0, stale: 10000, update: 5000 });
    releaseState = await lock(stateFile, { realpath: false, retries: 0, stale: 30000, update: 10000 });
    return release;
  } catch (error) {
    await release();
    if ((error as NodeJS.ErrnoException).code === "ELOCKED") throw new NativeSourceWriterBusyError();
    throw error;
  }
}

/** One native content writer plus private operational-state writer. */
export async function withNativeSourceWriter<T>(docsDir: string, stateFile: string, action: () => Promise<T>) {
  docsDir = path.resolve(docsDir); stateFile = path.resolve(stateFile);
  const relative = path.relative(docsDir, stateFile);
  if (!relative || relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) throw new Error("Private source state must remain outside native content.");
  await assertPublicationDirectory(docsDir);
  await mkdirDurably(path.dirname(stateFile));
  const context = sourceCommandChildContext(docsDir, stateFile), active = writerCalls.getStore(), keys = [`content:${docsDir}`, `state:${stateFile}`];
  // A nested call cannot wait for its own lock. Independent sibling hooks have
  // different async call chains and may serialize under the bounded context.
  if (keys.some(key => active?.has(key))) throw new NativeSourceWriterBusyError();
  let release: () => Promise<void>;
  for (;;) {
    if (context) assertSourceCommandChildDeadline(context);
    try { release = await acquireNativeWriter(docsDir, stateFile); break; }
    catch (error) {
      if (!context || !(error instanceof NativeSourceWriterBusyError)) throw error;
      await assertSourceCommandChildOwner(context, false);
      await new Promise(resolve => setTimeout(resolve, Math.min(50, Math.max(1, context.deadlineMs - Date.now()))));
    }
  }
  try {
    if (context) await assertSourceCommandChildOwner(context, true);
    return await writerCalls.run(new Set([...(active ?? []), ...keys]), action);
  } finally { await release(); }
}

export async function withPublicationOperationalStateLock<T>(filePath: string, action: () => Promise<T>, options: { staleMs?: number; updateMs?: number } = {}) {
  await assertPublicationDirectory(path.dirname(path.resolve(filePath))); await mkdirDurably(path.dirname(filePath));
  let release: (() => Promise<void>) | undefined;
  try { release = await lock(filePath, { realpath: false, retries: 0, stale: options.staleMs ?? 30000, update: options.updateMs ?? 10000 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ELOCKED") throw new Error("DiscussionBridge native state writer is already in use."); throw error; }
  try { return await action(); } finally { await release(); }
}
