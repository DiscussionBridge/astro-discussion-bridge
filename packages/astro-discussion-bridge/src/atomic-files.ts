import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface AtomicFileSource {
  targetPath: string;
  contents?: string | Uint8Array;
  sourcePath?: string;
}

interface StagedFile extends AtomicFileSource {
  tempPath: string;
}

interface CommitRecord {
  targetPath: string;
  backupPath?: string;
}

export async function publishFilesAtomically(
  files: AtomicFileSource[],
  overwrite: boolean,
  options: {
    remove?: (filePath: string, options: { force: boolean }) => Promise<void>;
  } = {},
): Promise<void> {
  const staged: StagedFile[] = [];
  const committed: CommitRecord[] = [];
  const remove = options.remove ?? ((filePath, removeOptions) => fs.rm(filePath, removeOptions));

  try {
    for (const file of files) {
      await fs.mkdir(path.dirname(file.targetPath), { recursive: true });
      const tempPath = siblingPath(file.targetPath, "stage");
      const stagedFile = { ...file, tempPath };
      staged.push(stagedFile);
      const handle = await fs.open(tempPath, "wx");
      try {
        if (file.sourcePath) {
          await handle.writeFile(await fs.readFile(file.sourcePath));
        } else {
          await handle.writeFile(file.contents ?? new Uint8Array());
        }
        await handle.sync();
      } finally {
        await handle.close();
      }
    }

    for (const file of staged) {
      if (!overwrite) {
        await fs.link(file.tempPath, file.targetPath);
        committed.push({ targetPath: file.targetPath });
        await remove(file.tempPath, { force: true });
        continue;
      }

      const record: CommitRecord = { targetPath: file.targetPath };
      const target = await targetStatus(file.targetPath);
      if (target && !target.isFile()) {
        throw new Error(`Destination is not a regular file: ${file.targetPath}`);
      }
      committed.push(record);
      if (target) {
        record.backupPath = siblingPath(file.targetPath, "backup");
        await fs.rename(file.targetPath, record.backupPath);
      }
      await fs.rename(file.tempPath, file.targetPath);
    }

  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const record of committed.reverse()) {
      try {
        await remove(record.targetPath, { force: true });
        if (record.backupPath && await exists(record.backupPath)) {
          await fs.rename(record.backupPath, record.targetPath);
        }
      } catch (rollbackError) {
        rollbackErrors.push(`${record.targetPath}: ${message(rollbackError)}`);
      }
    }
    for (const file of staged) {
      await remove(file.tempPath, { force: true }).catch(() => undefined);
    }
    const rollback = rollbackErrors.length
      ? ` Rollback was incomplete: ${rollbackErrors.join("; ")}`
      : " Destination file changes were rolled back.";
    throw new Error(`Could not publish staged files.${rollback} ${message(error)}`);
  }

  const cleanupErrors: string[] = [];
  for (const record of committed) {
    if (!record.backupPath) continue;
    try {
      await remove(record.backupPath, { force: true });
    } catch (error) {
      cleanupErrors.push(`${record.backupPath}: ${message(error)}`);
    }
  }
  if (cleanupErrors.length) {
    console.warn(
      `[DiscussionBridge] Files were published successfully, but recovery backup cleanup requires attention: ${cleanupErrors.join("; ")}`,
    );
  }
}

function siblingPath(targetPath: string, role: string): string {
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.discussionbridge-${role}-${randomUUID()}`,
  );
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function targetStatus(filePath: string) {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
