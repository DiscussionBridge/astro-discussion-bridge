import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { assertPublicationDirectory, mkdirDurably, syncDirectory } from "./native-files.js";

/** Private native state. Storage format identity is not wire-version selection. */
export async function readPrivateJournal<T>(file: string, validate: (value: unknown) => T): Promise<T | undefined> {
  await assertPublicationDirectory(path.dirname(path.resolve(file)));
  try {
    const before = await fs.lstat(file, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink()) throw new Error("Private native state must be an unlinked regular file.");
    const handle = await fs.open(file, "r");
    try {
      const opened = await handle.stat({ bigint: true });
      if (opened.dev !== before.dev || opened.ino !== before.ino) throw new Error("Private native state changed while opening.");
      return validate(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await handle.readFile())));
    } finally { await handle.close(); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

export async function writePrivateJournal<T>(file: string, state: T, validate: (value: unknown) => T) {
  const value = validate(state); file = path.resolve(file);
  await assertPublicationDirectory(path.dirname(file)); await mkdirDurably(path.dirname(file));
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let created = false;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    created = true;
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); await handle.close(); handle = undefined;
    await assertPublicationDirectory(path.dirname(file));
    try { const current = await fs.lstat(file); if (!current.isFile() || current.isSymbolicLink()) throw new Error("Private native state target is unsafe."); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await fs.rename(temporary, file);
    await syncDirectory(path.dirname(file));
  } catch (error) { await handle?.close(); throw error; }
  finally { if (created) await fs.rm(temporary, { force: true }); }
}
