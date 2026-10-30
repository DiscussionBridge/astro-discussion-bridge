import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const environment = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" };
// Package-consumer cases intentionally require an actual saved ordinary archive,
// not a missing environment value or a test-only sibling-source substitution.
const pack = spawnSync(process.execPath, [fileURLToPath(new URL("../../../scripts/save-normal-package.mjs", import.meta.url))], { cwd: root, encoding: "utf8", windowsHide: true, env: environment, maxBuffer: 20 * 1024 * 1024 });
if (pack.status !== 0 || pack.error) { process.stderr.write(pack.stderr || pack.error?.message || pack.stdout); process.exit(1); }
const receipt = JSON.parse(pack.stdout);
assert.ok(path.isAbsolute(receipt.archive));
console.log(JSON.stringify({ ordinary_test_archive: receipt.archive, sha256: receipt.sha256, members: receipt.memberCount }));
const available = readdirSync(path.join(root, "test")).filter(file => file.endsWith(".test.mjs")).sort();
const selected = process.argv.slice(2);
assert.ok(selected.every(file => available.includes(file)), "Only current test filenames may be selected");
const tests = (selected.length ? selected : available).map(file => path.join(root, "test", file));
assert.ok(tests.length > 0);
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...tests], { cwd: root, windowsHide: true, stdio: "inherit", env: { ...environment, DISCUSSIONBRIDGE_TEST_ARCHIVE: receipt.archive } });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
