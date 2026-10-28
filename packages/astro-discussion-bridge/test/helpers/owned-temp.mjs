import { lstat, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function ownedTempFixture(t, prefix, parentDirectory = os.tmpdir()) {
  if (!/^discussionbridge-[a-z0-9-]+-$/.test(prefix)) {
    throw new Error("Test fixture prefix must be a plain DiscussionBridge name.");
  }
  const parent = path.resolve(parentDirectory);
  const root = await mkdtemp(path.join(parent, prefix));
  const allocated = await lstat(root, { bigint: true });
  const { dev, ino } = allocated;
  if (!allocated.isDirectory() || allocated.isSymbolicLink()
      || typeof dev !== "bigint" || dev < 0n || typeof ino !== "bigint" || ino <= 0n) {
    // Without a usable allocation identity, preserve the directory and fail.
    throw new Error(`Cannot establish owned fixture directory identity: ${root}`);
  }
  t.after(async () => {
    const target = path.resolve(root);
    if (path.dirname(target) !== parent || !path.basename(target).startsWith(prefix)) {
      throw new Error("Refusing cleanup outside the exact owned fixture root.");
    }
    const entry = await lstat(target, { bigint: true });
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.dev !== dev || entry.ino !== ino) {
      throw new Error("Refusing cleanup of a replaced fixture root.");
    }
    // Detect prior replacement; this is not an atomic hostile-race defense.
    await rm(target, { recursive: true, force: true });
  });
  return root;
}
