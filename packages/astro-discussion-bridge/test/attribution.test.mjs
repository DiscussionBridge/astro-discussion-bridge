import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("package attribution gate passes independently of the docs repository", () => {
  const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const script = path.resolve(packageDir, "..", "..", "scripts", "check-package-attribution.mjs");

  const result = spawnSync(process.execPath, [script], {
    cwd: packageDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Package attribution gate: PASS/);
  assert.match(result.stdout, /independent docs links: PASS/);
  assert.match(result.stdout, /package contents and protected-path scan: PASS/);
});
