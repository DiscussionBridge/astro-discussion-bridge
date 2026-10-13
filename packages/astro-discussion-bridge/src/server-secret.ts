import { lstat, open } from "node:fs/promises";
import path from "node:path";

export async function resolveServerSecret<T extends { connectionSecret?: string; secretFile?: string }>(input: T): Promise<T & { connectionSecret: string }> {
  if (!input.secretFile) return { ...input, connectionSecret: input.connectionSecret ?? "" };
  if (input.connectionSecret) throw new Error("Choose one server-only connection secret or protected secret file.");
  if (!path.isAbsolute(input.secretFile)) throw new Error("DiscussionBridge secret file must be an absolute regular file.");
  const before = await lstat(input.secretFile, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size > 262n || (process.platform !== "win32" && (before.mode & 0o077n) !== 0n)) throw new Error("DiscussionBridge secret file must be bounded and protected.");
  const handle = await open(input.secretFile, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new Error("DiscussionBridge secret file changed before reading.");
    const bytes = Buffer.alloc(263);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat({ bigint: true });
    if (bytesRead > 262 || BigInt(bytesRead) !== opened.size || after.size !== opened.size || after.mtimeNs !== opened.mtimeNs) throw new Error("DiscussionBridge secret file changed while reading.");
    const secret = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytesRead)).trim();
    const length = Buffer.byteLength(secret);
    if (length < 32 || length > 256 || /[\x00-\x1f\x7f]/u.test(secret)) throw new Error("DiscussionBridge secret file contains an invalid connection secret.");
    return { ...input, secretFile: undefined, connectionSecret: secret };
  } finally {
    await handle.close();
  }
}
