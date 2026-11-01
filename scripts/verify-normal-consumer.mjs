import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const packageRoot = path.join(repo, "packages/astro-discussion-bridge");
const npmCli = process.env.npm_execpath;
assert.ok(npmCli && path.isAbsolute(npmCli), "Run through npm run test:normal-consumer with its actual npm CLI.");
const environment = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" };
async function run(args, cwd, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, shell: false, windowsHide: true, env: environment,
      timeout: 300_000, stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"] });
    let stdout = "";
    if (capture) child.stdout.on("data", bytes => { stdout += bytes; });
    child.once("error", reject);
    child.once("close", (code, signal) => code === 0 && signal === null ? resolve(stdout) : reject(new Error(`Normal consumer command failed: exit ${code}, signal ${signal}.`)));
  });
}

// A real saved archive, never a source alias or replacement codec. Its unchanged
// normal builder enforces the source snapshot and supplies every payload hash.
const receipt = JSON.parse(await run([path.join(repo, "scripts/save-normal-package.mjs")], repo, true));
const artifactRoot = path.dirname(receipt.archive);
const scratch = path.join(repo, ".tmp"); await mkdir(scratch, { recursive: true });
const consumer = await mkdtemp(path.join(scratch, "discussionbridge-normal-consumer-"));
const astroPackage = createRequire(path.join(packageRoot, "package.json")).resolve("astro/package.json");
const astroVersion = JSON.parse(await readFile(astroPackage, "utf8")).version;
const json = value => JSON.stringify(value, null, 2) + "\n";
await writeFile(path.join(consumer, "package.json"), json({ name: "discussionbridge-normal-install-check", version: "0.0.0", private: true, type: "module",
  dependencies: { astro: astroVersion, "astro-discussion-bridge": "file:" + receipt.archive.replaceAll("\\", "/") } }), { flag: "wx" });
for (const kind of ["user", "global"]) await writeFile(path.join(consumer, `${kind}.npmrc`), "# Test-owned empty npm configuration.\n", { flag: "wx" });
await mkdir(path.join(consumer, "src/pages"), { recursive: true });
await writeFile(path.join(consumer, "astro.config.mjs"), `import { defineConfig } from 'astro/config';
import discussionBridge from 'astro-discussion-bridge';
export default defineConfig({ site: 'https://site.example', integrations: [discussionBridge({ discourseUrl: 'https://forum.example', siteUrl: 'https://site.example', comments: { enabled: true, display: 'full' } })] });
`, { flag: "wx" });
for (const international of [false, true]) await writeFile(path.join(consumer, "src/pages", international ? "international.astro" : "index.astro"), `---
import Discussion from 'astro-discussion-bridge/DiscourseDiscussion.astro';
import { sourceArticleAttributes } from 'astro-discussion-bridge';
import { captureControlledSourceNative } from 'astro-discussion-bridge/controlled-creation';
import { readPublicationOperationalState } from 'astro-discussion-bridge/operational-state';
const receiver = ${JSON.stringify(international ? "https://\u{11db0}.example" : "https://forum.example")};
if ([sourceArticleAttributes, captureControlledSourceNative, readPublicationOperationalState].some(value => typeof value !== 'function')) throw new Error('Documented native server API is unavailable.');
---
<html lang="en"><head><title>Ordinary installed Astro consumer</title></head><body><main><h1>Real native build</h1><p>Installed ordinary package without a fixture alias, parser override or custom Vite configuration.</p><p data-native-server-api>Documented server APIs loaded during native prerender.</p></main><Discussion discourseUrl={receiver} topicId="53" topicUrl={receiver + '/t/native/53'} /></body></html>
`, { flag: "wx" });

// Resolve these imports FROM the new consumer, not from this maintainer script.
await writeFile(path.join(consumer, "verify.mjs"), `import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./', import.meta.url));
const receipt = JSON.parse(fs.readFileSync(process.argv[2]));
const sha = (value, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(value).digest(encoding);
const archive = fs.readFileSync(receipt.archive);
assert.equal(archive.length, receipt.bytes); assert.equal(sha(archive), receipt.sha256);
const ledger = JSON.parse(fs.readFileSync(path.join(path.dirname(receipt.archive), 'package-members.json')));
assert.equal(ledger.members.length, receipt.memberCount);
for (const member of ledger.members) { const file = path.join(root, 'node_modules/astro-discussion-bridge', member.path), stat = fs.lstatSync(file), bytes = fs.readFileSync(file); assert.ok(stat.isFile() && !stat.isSymbolicLink()); assert.equal(bytes.length, member.size, member.path); assert.equal(sha(bytes), member.sha256, member.path); }
const payload = []; function listPayload(dir, prefix = '') { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { if (entry.name === 'node_modules') continue; const file = path.join(dir, entry.name), relative = prefix + entry.name; assert.ok(!entry.isSymbolicLink()); if (entry.isDirectory()) listPayload(file, relative + '/'); else { assert.ok(entry.isFile()); payload.push(relative); } } } listPayload(path.join(root, 'node_modules/astro-discussion-bridge'));
assert.deepEqual(payload.sort(), ledger.members.map(member => member.path).sort());
const names = ['astro-discussion-bridge', 'astro-discussion-bridge/web-url', 'astro-discussion-bridge/server-url', 'astro-discussion-bridge/simple-live', 'astro-discussion-bridge/controlled-creation', 'astro-discussion-bridge/operational-state'];
for (const name of names) assert.ok(Object.keys(await import(name)).length > 0, name);
const manifest = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url))); assert.equal(manifest.overrides, undefined);
const lockBytes = fs.readFileSync(new URL('./package-lock.json', import.meta.url)), lock = JSON.parse(lockBytes);
assert.equal(lock.packages['node_modules/astro-discussion-bridge'].integrity, 'sha512-' + sha(archive, 'sha512', 'base64'));
const parsers = Object.entries(lock.packages).filter(([key]) => /(?:^|\\/)node_modules\\/satteri$/u.test(key)).map(([key, value]) => ({ path: key, version: value.version }));
const home = fs.readFileSync(new URL('./dist/index.html', import.meta.url), 'utf8'), international = fs.readFileSync(new URL('./dist/international/index.html', import.meta.url), 'utf8');
assert.match(home, /data-discussionbridge-topic-id="53"/); assert.ok(home.includes('https://forum.example/t/native/53')); assert.ok(international.includes('https://xn--7u3d.example/'));
assert.match(home, /data-native-server-api/); assert.match(international, /data-native-server-api/);
const files = []; function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else files.push(file); } } walk(path.join(root, 'dist'));
for (const file of files.filter(file => /\\.(?:html|js|mjs)$/u.test(file))) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /cms-runtime\\.mjs|cms-schema\\.json|CMS fixed-domain|node:crypto|file:\\/\\/|X-DiscussionBridge-Secret/iu, file);
const result = { node: process.version, archiveSha256: receipt.sha256, payloadMembersMatched: ledger.members.length, bareImports: names, nativeServerApiImports: ['sourceArticleAttributes', 'captureControlledSourceNative', 'readPublicationOperationalState'], serverApisLoadedDuringPrerender: true, lockSha256: sha(lockBytes), installedIntegrityMatched: true, nativeAstroVersion: manifest.dependencies.astro, nativePages: 2, fixtureAliases: false, rootOverrides: false, customViteConfig: false, parsers, publicOutputScan: true, output: { homeSha256: sha(home), internationalSha256: sha(international) }, limits: 'Ordinary local install/import/native build only; no external receiver, DNS, browser session, public deployment or release acceptance.' };
result.inputs = ['package.json', 'astro.config.mjs', 'src/pages/index.astro', 'src/pages/international.astro', 'verify.mjs', 'user.npmrc', 'global.npmrc'].map(name => { const bytes = fs.readFileSync(path.join(root, name)); return { path: name, bytes: bytes.length, sha256: sha(bytes) }; });
const evidence = path.dirname(process.argv[3]);
fs.writeFileSync(path.join(evidence, 'normal-consumer-package-lock.json'), lockBytes, { flag: 'wx' });
fs.writeFileSync(path.join(evidence, 'normal-consumer-index.html'), home, { flag: 'wx' });
fs.writeFileSync(path.join(evidence, 'normal-consumer-international.html'), international, { flag: 'wx' });
fs.writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + '\\n', { flag: 'wx' }); console.log(JSON.stringify(result));
`, { flag: "wx" });
console.log(json({ normalConsumer: consumer, archive: receipt.archive, archiveSha256: receipt.sha256, phase: "install", noSiteOverrides: true }));
await run(["--check", path.join(consumer, "verify.mjs")], consumer);
await run([npmCli, "install", "--omit=dev", "--ignore-scripts", "--fetch-retries=0", "--no-fund", "--no-audit",
  "--userconfig", path.join(consumer, "user.npmrc"), "--globalconfig", path.join(consumer, "global.npmrc"), "--cache", path.join(scratch, "normal-consumer-npm-cache")], consumer);
const installedAstro = JSON.parse(await readFile(path.join(consumer, "node_modules/astro/package.json"), "utf8"));
assert.equal(installedAstro.version, astroVersion);
const bin = typeof installedAstro.bin === "string" ? installedAstro.bin : installedAstro.bin?.astro;
assert.ok(bin && !path.isAbsolute(bin) && !bin.split(/[\\/]/u).includes(".."));
await run([path.join(consumer, "node_modules/astro", bin), "build"], consumer);
await run([path.join(consumer, "verify.mjs"), path.join(artifactRoot, "package-receipt.json"), path.join(artifactRoot, "normal-consumer-results.json")], consumer);
console.log(json({ normalConsumer: consumer, phase: "complete", result: path.join(artifactRoot, "normal-consumer-results.json") }));
