import path from "node:path";
import { lock } from "proper-lockfile";
import { assertPublicationDirectory, mkdirDurably } from "./native-files.js";
/** Internal native lock condition, not a wire failure or authority decision. */
export class NativeSourceWriterBusyError extends Error {
    constructor() { super("DiscussionBridge native source writer is already in use."); this.name = "NativeSourceWriterBusyError"; }
}
/** One native content writer plus private operational-state writer. */
export async function withNativeSourceWriter(docsDir, stateFile, action) {
    docsDir = path.resolve(docsDir);
    stateFile = path.resolve(stateFile);
    const relative = path.relative(docsDir, stateFile);
    if (!relative || relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
        throw new Error("Private source state must remain outside native content.");
    await assertPublicationDirectory(docsDir);
    await mkdirDurably(path.dirname(stateFile));
    let releaseContent, releaseState;
    try {
        releaseContent = await lock(docsDir, { realpath: false, retries: 0, stale: 10000, update: 5000 });
        releaseState = await lock(stateFile, { realpath: false, retries: 0, stale: 30000, update: 10000 });
        return await action();
    }
    catch (error) {
        if (error.code === "ELOCKED")
            throw new NativeSourceWriterBusyError();
        throw error;
    }
    finally {
        try {
            await releaseState?.();
        }
        finally {
            await releaseContent?.();
        }
    }
}
export async function withPublicationOperationalStateLock(filePath, action, options = {}) {
    await assertPublicationDirectory(path.dirname(path.resolve(filePath)));
    await mkdirDurably(path.dirname(filePath));
    let release;
    try {
        release = await lock(filePath, { realpath: false, retries: 0, stale: options.staleMs ?? 30000, update: options.updateMs ?? 10000 });
    }
    catch (error) {
        if (error.code === "ELOCKED")
            throw new Error("DiscussionBridge native state writer is already in use.");
        throw error;
    }
    try {
        return await action();
    }
    finally {
        await release();
    }
}
