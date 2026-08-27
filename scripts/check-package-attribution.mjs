import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = path.join(root, "packages", "astro-discussion-bridge");
const failures = [];

function fail(message) {
  failures.push(message);
}

const rootLicense = await readFile(path.join(root, "LICENSE"), "utf8");
const packageLicense = await readFile(path.join(packageDir, "LICENSE"), "utf8");
const packageJson = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
const readme = await readFile(path.join(packageDir, "README.md"), "utf8");

if (rootLicense !== packageLicense) fail("Root and package LICENSE files differ.");
if (!rootLicense.includes("MIT License") || !rootLicense.includes("Copyright (c) 2026 WebSynergetics")) {
  fail("Package license is not the reviewed WebSynergetics MIT license.");
}
if (packageJson.license !== "MIT") fail("Package metadata does not declare MIT.");

for (const required of [
  "https://github.com/DiscussionBridge/docs/blob/main/docs/HUMAN_MANUAL.md",
  "https://github.com/DiscussionBridge/docs/blob/main/docs/ATTRIBUTION_OWNERSHIP_LICENSE.md",
  "Built by Phil Henry / WebSynergetics with AI-assisted development.",
  "independent and is not affiliated with",
]) {
  if (!readme.includes(required)) fail(`Package README is missing ${required}`);
}

for (const [pattern, label] of [
  [/WebSynergetics Secure Ops Vault/i, "protected vault name"],
  [/(?:^|[("'`\s])K:\\/im, "protected K: path"],
  [/C:\\Users\\/i, "private Windows user path"],
]) {
  if (pattern.test(readme)) fail(`Package README contains a ${label}.`);
}

const pack = spawnSync("npm", ["pack", "--json", "--dry-run", "--ignore-scripts"], {
  cwd: packageDir,
  encoding: "utf8",
  shell: process.platform === "win32",
  env: { ...process.env, npm_config_cache: path.join(root, ".tmp", "npm-cache", "package-attribution") },
});
if (pack.status !== 0) {
  fail(`npm pack dry-run failed: ${(pack.stderr || pack.stdout).trim()}`);
} else {
  const report = JSON.parse(pack.stdout.slice(pack.stdout.indexOf("["), pack.stdout.lastIndexOf("]") + 1))[0];
  const files = new Set(report.files.map((entry) => entry.path.replaceAll("\\", "/")));
  for (const required of [
    "LICENSE",
    "README.md",
    "package.json",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/controlled-creation.js",
    "dist/controlled-creation.d.ts",
    "dist/web-url.js",
    "src/components/Discussion.astro",
    "src/components/DiscourseDiscussion.astro",
    "src/components/DiscussionCredit.astro",
  ]) {
    if (!files.has(required)) fail(`Package tarball is missing ${required}.`);
  }
  const forbidden = [...files].filter((file) =>
    /(?:^|\/)(?:cli|check-discourse|atomic-files|import-|navigation|official-source|relationships|source|targets)(?:\.|\/)/i.test(file)
    || /(?:^|\/)discourse\/client\./i.test(file)
    || /(?:^|\/)sync\//i.test(file)
    || /(?:browser-refresh|reaction-rendering|DiscourseComments|DiscourseReplies|DiscussionNavigation|DiscussionRelations|DiscussionSource)/i.test(file)
  );
  if (forbidden.length) fail(`Package tarball contains removed surfaces: ${forbidden.join(", ")}`);
}

if (failures.length) {
  console.error("Package attribution gate: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Package attribution gate: PASS");
  console.log("- license parity and metadata: PASS");
  console.log("- independent docs links: PASS");
  console.log("- package contents and protected-path scan: PASS");
}
