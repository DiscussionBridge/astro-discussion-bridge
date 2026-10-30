import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url)), packageRoot = path.join(repo, "packages/astro-discussion-bridge");
const compiler = process.env.DISCUSSIONBRIDGE_TYPESCRIPT_CLI ?? createRequire(path.join(packageRoot, "package.json")).resolve("typescript/bin/tsc");
const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const compilerConfig = path.join(packageRoot, "tsconfig.json");
assert.ok(compiler && path.isAbsolute(compiler), "Set the existing local TypeScript CLI path.");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
async function run(executable, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", bytes => { stdout += bytes; }); child.stderr.on("data", bytes => { stderr += bytes; });
    child.once("error", reject); child.once("close", code => code === 0 ? resolve(stdout) : reject(new Error(`Local builder rejected: ${stderr || stdout}`)));
  });
}
async function snapshot(directory = repo, prefix = "") {
  const members = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if ([".git", ".tools", ".tmp", ".artifacts", "node_modules", "dist", ".discussionbridge"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name), relative = prefix + entry.name;
    assert.equal(entry.isSymbolicLink(), false, `Unlinked maintained source required: ${relative}`);
    if (entry.isDirectory()) members.push(...await snapshot(file, relative + "/"));
    else { assert.equal(entry.isFile(), true); const bytes = await readFile(file); members.push({ path: relative, bytes: bytes.length, sha256: digest(bytes) }); }
  }
  return members;
}

await run(process.execPath, [compiler, "-p", compilerConfig], repo);
const source = await snapshot(), configBytes = await readFile(compilerConfig);
const artifactsRoot = path.join(repo, ".artifacts"); await mkdir(artifactsRoot, { recursive: true });
const directory = await mkdtemp(path.join(artifactsRoot, `astro-v4-${new Date().toISOString().replaceAll(/[-:.]/gu, "")}-`));
const result = JSON.parse(await run(process.execPath, [npmCli, "pack", "--ignore-scripts", "--json", "--pack-destination", directory, "--cache", path.join(directory, "npm-cache")], packageRoot))[0];
assert.deepEqual(await snapshot(), source, "Maintained source changed during the build/package snapshot.");
assert.ok(result.filename && path.basename(result.filename) === result.filename);
const archive = path.join(directory, result.filename), bytes = await readFile(archive);
assert.equal(bytes.length, result.size);
const memberManifest = [];
for (const member of result.files) {
  assert.equal(path.isAbsolute(member.path), false); assert.equal(member.path.split(/[\\/]/u).includes(".."), false);
  const file = path.join(packageRoot, member.path), identity = await lstat(file); assert.ok(identity.isFile() && !identity.isSymbolicLink());
  const contents = await readFile(file); assert.equal(contents.length, member.size); memberManifest.push({ ...member, sha256: digest(contents) });
}
const pinned = JSON.parse(await readFile(path.join(packageRoot, "src/private/ARTIFACTS.json"), "utf8"));
for (const member of pinned.members.filter(member => ["src/cms-schema.json", "src/cms-runtime.mjs", "CANDIDATE.json", "ROUTES.md"].includes(member.path))) {
  const contents = await readFile(path.join(packageRoot, "src/private", path.basename(member.path)));
  assert.equal(contents.length, member.bytes); assert.equal(digest(contents), member.sha256);
}
const candidate = JSON.parse(await readFile(path.join(packageRoot, "src/private/CANDIDATE.json"), "utf8"));
const schema = JSON.parse(await readFile(path.join(packageRoot, "src/private/cms-schema.json"), "utf8"));
const runtime = await import(pathToFileURL(path.join(packageRoot, "src/private/cms-runtime.mjs")).href);
const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
for (const descriptor of [candidate, schema]) { assert.equal(descriptor.candidate_id, pinned.candidate_id); assert.equal(descriptor.implementation_version, pinned.implementation_version); assert.equal(descriptor.wire_version, pinned.wire_version); assert.equal(descriptor.release_version, pinned.release_version); }
assert.equal(manifest.version, pinned.implementation_version); assert.equal(runtime.candidateId, pinned.candidate_id); assert.equal(runtime.implementationVersion, pinned.implementation_version); assert.equal(runtime.wireVersion, pinned.wire_version);
assert.deepEqual(candidate.normative, pinned.normative); assert.deepEqual(runtime.specIdentity, pinned.normative);
assert.deepEqual(candidate.schema, pinned.members.find(member => member.path === "src/cms-schema.json")); assert.deepEqual(candidate.javascript, pinned.members.find(member => member.path === "src/cms-runtime.mjs"));
const writeJson = (name, value) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
await writeJson("npm-pack.json", result);
await writeJson("source-manifest.json", { format: 1, sourceRoot: repo, capturedAt: new Date().toISOString(), builder: { executable: process.execPath, compiler, args: ["-p", compilerConfig], compilerConfigSha256: digest(configBytes), npmCli }, members: source });
await writeJson("package-members.json", { format: 1, archive, members: memberManifest });
const receipt = { format: 1, archive, bytes: bytes.length, sha256: digest(bytes), memberCount: result.entryCount, implementationVersion: pinned.implementation_version,
  wireVersion: pinned.wire_version, candidateId: pinned.candidate_id, releaseVersion: pinned.release_version,
  sourceManifestSha256: digest(await readFile(path.join(directory, "source-manifest.json"))), packageMembersSha256: digest(await readFile(path.join(directory, "package-members.json"))), consumerQualification: "NOT_RUN" };
await writeJson("package-receipt.json", receipt);
process.stdout.write(JSON.stringify(receipt) + "\n");
