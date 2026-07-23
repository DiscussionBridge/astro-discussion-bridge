import assert from "node:assert/strict";
import { access, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("attribution and licensing release gate passes without generated docs output", async () => {
  const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = path.resolve(packageDir, "..", "..");
  const script = path.resolve(packageDir, "..", "..", "scripts", "check-attribution.mjs");
  const renderedPolicy = path.join(
    repoRoot,
    "sites",
    "docs",
    "src",
    "content",
    "docs",
    "attribution-ownership-license.md",
  );

  await rm(renderedPolicy, { force: true });
  const result = spawnSync(process.execPath, [script], {
    cwd: packageDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Attribution and licensing gate: PASS/);
  assert.match(result.stdout, /npm package contents: PASS/);
  assert.match(result.stdout, /production dependency license inventory: PASS/);
  await access(renderedPolicy);
});
