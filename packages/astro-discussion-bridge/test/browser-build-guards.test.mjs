import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { bundledLicense } from "../scripts/bundled-license.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = path.join(root, ".tmp");
fs.mkdirSync(scratch, { recursive: true });
const batch = fs.mkdtempSync(path.join(scratch, "browser-guards-"));
const inputs = ["package.json", "package-lock.json", "scripts/build-rich-content.mjs", "scripts/bundled-license.mjs", "scripts/managed-output.mjs", "scripts/refresh-contract.mjs", "src/browser-rich-content.mjs"];
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function replica() {
  const directory = fs.mkdtempSync(path.join(batch, "replica-"));
  for (const name of inputs) { const dest = path.join(directory, name); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(root, name), dest); }
  return directory;
}
function snapshot(directory) {
  const result = [];
  function walk(at, prefix = "") {
    for (const name of fs.readdirSync(at).sort()) {
      const file = path.join(at, name), rel = prefix + name, stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) result.push([rel, "link", fs.readlinkSync(file)]);
      else if (stat.isDirectory()) { result.push([rel, "directory"]); walk(file, rel + "/"); }
      else result.push([rel, "file", sha(fs.readFileSync(file))]);
    }
  }
  walk(directory); return result;
}
function run(directory, script = "scripts/build-rich-content.mjs", args = []) {
  const result = spawnSync(process.execPath, [path.join(directory, script), ...args], { cwd: directory, env: { ...process.env, DISCUSSIONBRIDGE_BUILD_DEPENDENCY_ROOT: root }, encoding: "utf8", timeout: 90000, windowsHide: true });
  assert.equal(result.error, undefined, result.error?.message); return result;
}
for (const [relative, kind] of [["src/assets", "directory"], ["src/assets/THIRD_PARTY_LICENSES", "directory"], ["src/assets/discussionbridge-rich-content.js", "file"], ["src/assets/RICH_CONTENT_PROVENANCE.json", "file"], ["src/assets/THIRD_PARTY_LICENSES/fastdom_1.0.12.txt", "file"]]) {
  for (const live of [true, false]) test(`browser builder refuses ${live ? "live" : "dangling"} ${relative} before writes`, t => {
    const directory = replica(), target = path.join(batch, path.basename(directory) + "-outside");
    if (live) { if (kind === "directory") { fs.mkdirSync(target); fs.writeFileSync(path.join(target, "keep"), "Retain\n"); } else fs.writeFileSync(target, "Retain\n"); }
    const file = path.join(directory, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
    try { fs.symlinkSync(target, file, kind === "directory" && process.platform === "win32" ? "junction" : kind === "directory" ? "dir" : "file"); }
    catch (error) { if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) { t.skip("Windows file-link privilege unavailable; Linux CI must execute this case"); return; } throw error; }
    const before = snapshot(batch), result = run(directory);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Invalid managed output (?:parent|file)/); assert.deepEqual(snapshot(batch), before);
  });
}
test("unowned notice fails before replacing browser JS/CSS", () => {
  const directory = replica(); fs.mkdirSync(path.join(directory, "src/assets/THIRD_PARTY_LICENSES"), { recursive: true });
  for (const name of ["discussionbridge-rich-content.js", "discussionbridge-rich-content.css"]) fs.writeFileSync(path.join(directory, "src/assets", name), "Retain earlier output\n");
  fs.writeFileSync(path.join(directory, "src/assets/THIRD_PARTY_LICENSES/fastdom_1.0.12.txt"), "Operator file\n");
  const before = snapshot(directory), result = run(directory);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Unowned generated license target/); assert.deepEqual(snapshot(directory), before);
});
for (const [relative, kind] of [["src/private", "directory"], ["src/private/PROVENANCE.json", "file"]]) for (const live of [true, false]) test(`shared refresh rejects ${live ? "live" : "dangling"} ${relative} before source reads`, t => {
  const directory = replica(), target = path.join(batch, path.basename(directory) + "-shared-outside"), file = path.join(directory, relative);
  if (live) { if (kind === "directory") { fs.mkdirSync(target); fs.writeFileSync(path.join(target, "keep"), "Retain\n"); } else fs.writeFileSync(target, "Retain\n"); }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.symlinkSync(target, file, kind === "directory" && process.platform === "win32" ? "junction" : kind === "directory" ? "dir" : "file"); }
  catch (error) { if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) { t.skip("Windows file-link privilege unavailable; Linux CI must execute this case"); return; } throw error; }
  const before = snapshot(batch), result = run(directory, "scripts/refresh-contract.mjs", ["--source", directory]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Invalid managed output (?:parent|file)/); assert.doesNotMatch(result.stderr, /ARTIFACTS.json/); assert.deepEqual(snapshot(batch), before);
});
test("actual license terms are pinned, absent or changed input is not metadata fallback", () => {
  const directory = fs.mkdtempSync(path.join(batch, "license-")), metadata = { name: "fastdom", version: "1.0.12", license: "MIT" };
  assert.throws(() => bundledLicense(directory, metadata), /ENOENT/);
  fs.copyFileSync(path.join(root, "node_modules/fastdom/README.md"), path.join(directory, "README.md"));
  assert.equal(sha(bundledLicense(directory, metadata).text), "df2ae14f12f31864acef768195afe4584b08a257f25925f49884619279f02f37");
  assert.throws(() => bundledLicense(directory, { ...metadata, name: "unknown" }), /Actual bundled license is unavailable/);
  fs.appendFileSync(path.join(directory, "README.md"), "changed"); assert.throws(() => bundledLicense(directory, metadata), /FastDom license source changed/);
});
test("repeat build removes only exact obsolete notices and preserves operator changes", () => {
  const directory = replica(), ledger = path.join(directory, "src/assets/RICH_CONTENT_PROVENANCE.json"), stale = "src/assets/THIRD_PARTY_LICENSES/obsolete_0.0.0.txt", unknown = path.join(directory, "src/assets/THIRD_PARTY_LICENSES/operator.txt");
  let result = run(directory); assert.equal(result.status, 0, result.stderr);
  const add = () => { const bytes = Buffer.from("Old generated notice\n"); fs.writeFileSync(path.join(directory, stale), bytes); const prior = JSON.parse(fs.readFileSync(ledger)); prior.bundledPackages.push({ file: stale, bytes: bytes.length, sha256: sha(bytes) }); fs.writeFileSync(ledger, JSON.stringify(prior) + "\n"); };
  fs.writeFileSync(unknown, "Operator file\n"); add(); result = run(directory); assert.equal(result.status, 0, result.stderr); assert.equal(fs.existsSync(path.join(directory, stale)), false); assert.equal(fs.readFileSync(unknown, "utf8"), "Operator file\n");
  add(); fs.appendFileSync(path.join(directory, stale), "Operator change\n"); const before = snapshot(directory); result = run(directory); assert.notEqual(result.status, 0); assert.match(result.stderr, /Modified prior generated license/); assert.deepEqual(snapshot(directory), before);
});
// This exclusively owned ignored batch is retained; do not traverse/delete links.
