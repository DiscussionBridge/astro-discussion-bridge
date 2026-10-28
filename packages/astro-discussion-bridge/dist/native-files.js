import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, rename, rm, unlink } from "node:fs/promises";
import path from "node:path";
export async function assertPublicationDirectory(directory) {
    let current = path.resolve(directory);
    for (;;) {
        try {
            const entry = await lstat(current);
            if (!entry.isDirectory() || entry.isSymbolicLink())
                throw new Error("Astro publication directory must be an unlinked directory");
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
        const parent = path.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
}
export async function readExistingPublication(file) {
    let entry;
    try {
        entry = await lstat(file, { bigint: true });
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
    if (!entry.isFile() || entry.isSymbolicLink())
        throw new Error("Astro publication target must be an unlinked regular file");
    const handle = await open(file, "r");
    try {
        const opened = await handle.stat({ bigint: true });
        if (opened.dev !== entry.dev || opened.ino !== entry.ino)
            throw new Error("Astro publication target changed while opening");
        return { contents: await handle.readFile("utf8"), dev: entry.dev, ino: entry.ino };
    }
    finally {
        await handle.close();
    }
}
export async function syncDirectory(directory) {
    // Windows does not expose directory fsync through Node's file API. On POSIX
    // the directory entry must be durable as well as the temporary file's data.
    if (process.platform === "win32")
        return;
    const handle = await open(directory, "r");
    try {
        await handle.sync();
    }
    finally {
        await handle.close();
    }
}
export async function mkdirDurably(directory) {
    const firstCreated = await mkdir(directory, { recursive: true });
    if (!firstCreated || process.platform === "win32")
        return;
    let current = path.resolve(directory);
    for (;;) {
        await syncDirectory(current);
        if (current === path.resolve(firstCreated))
            break;
        current = path.dirname(current);
    }
    await syncDirectory(path.dirname(firstCreated));
}
export async function atomicWrite(file, contents, prior) {
    await assertPublicationDirectory(path.dirname(file));
    await mkdirDurably(path.dirname(file));
    await assertPublicationDirectory(path.dirname(file));
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    let temporaryCreated = false;
    try {
        const handle = await open(temporary, "wx");
        temporaryCreated = true;
        try {
            await handle.writeFile(contents, "utf8");
            await handle.sync();
        }
        finally {
            await handle.close();
        }
        await assertPublicationDirectory(path.dirname(file));
        if (prior === null) {
            // Atomic first claim: an existing or concurrently created path is preserved.
            await link(temporary, file);
        }
        else {
            const current = await readExistingPublication(file);
            if (!current || current.dev !== prior.dev || current.ino !== prior.ino || current.contents !== prior.contents) {
                throw new Error("Astro publication target changed before replacement");
            }
            // Detect ordinary replacement/edit; this is not an atomic hostile-race defense.
            await rename(temporary, file);
        }
        await syncDirectory(path.dirname(file));
    }
    finally {
        if (temporaryCreated)
            await rm(temporary, { force: true });
    }
}
export async function removeOwnedPublication(file, prior) {
    await assertPublicationDirectory(path.dirname(file));
    const current = await readExistingPublication(file);
    if (!current || current.dev !== prior.dev || current.ino !== prior.ino || current.contents !== prior.contents)
        throw new Error("Astro publication target changed before removal");
    await unlink(file);
    await syncDirectory(path.dirname(file));
}
