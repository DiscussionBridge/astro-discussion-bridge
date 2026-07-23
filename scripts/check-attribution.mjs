import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = path.join(repoRoot, "packages", "astro-discussion-bridge");
const docsDir = path.join(repoRoot, "docs");
const renderedDocsDir = path.join(repoRoot, "sites", "docs", "src", "content", "docs");
const inventoryPath = path.join(docsDir, "THIRD_PARTY_PROVENANCE.json");
const docsScope = process.argv.includes("--docs-scope");
const failures = [];

function fail(message) {
  failures.push(message);
}

async function readText(filePath, label) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    fail(`${label} is missing: ${path.relative(repoRoot, filePath)}`);
    return "";
  }
}

function requireText(haystack, needle, label) {
  if (!haystack.includes(needle)) fail(`${label} is missing required text: ${needle}`);
}

function packageNameFromLockPath(lockPath) {
  const marker = "node_modules/";
  const index = lockPath.lastIndexOf(marker);
  return index === -1 ? lockPath : lockPath.slice(index + marker.length);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      npm_config_cache: path.join(repoRoot, ".tmp", "npm-cache", "attribution"),
    },
  });
  if (result.status !== 0) {
    const details = result.error?.message ?? result.stderr ?? result.stdout ?? "unknown process error";
    fail(`${command} ${args.join(" ")} failed: ${details.trim()}`);
  }
  return result;
}

async function trackedMediaFiles() {
  const result = run("git", ["ls-files", "-z"], repoRoot);
  if (result.status !== 0) return [];
  const mediaPattern = /\.(?:avif|gif|jpe?g|mp4|png|svg|ttf|webm|webp|woff2?)$/i;
  return result.stdout.split("\0").filter((file) => mediaPattern.test(file));
}

async function checkLicenses(packageJson, inventory) {
  const rootLicense = await readText(path.join(repoRoot, "LICENSE"), "Root LICENSE");
  const packageLicense = await readText(path.join(packageDir, "LICENSE"), "Package LICENSE");

  if (rootLicense && packageLicense && rootLicense !== packageLicense) {
    fail("Root and package LICENSE files do not match exactly.");
  }
  requireText(rootLicense, "MIT License", "Root LICENSE");
  requireText(rootLicense, "Copyright (c) 2026 WebSynergetics", "Root LICENSE");
  if (packageJson.license !== inventory.projectLicense) {
    fail(`package.json license ${JSON.stringify(packageJson.license)} does not match inventory projectLicense ${JSON.stringify(inventory.projectLicense)}.`);
  }

  const lockText = await readText(path.join(packageDir, "package-lock.json"), "Package lockfile");
  if (!lockText) return;
  const lock = JSON.parse(lockText);
  const productionPackages = Object.entries(lock.packages ?? {})
    .filter(([lockPath, metadata]) => lockPath.startsWith("node_modules/") && metadata.dev !== true);
  const approved = new Set(inventory.approvedDependencyLicenses);
  const overrides = new Map(
    inventory.dependencyLicenseOverrides.map((entry) => [`${entry.name}@${entry.version}`, entry]),
  );

  for (const [lockPath, metadata] of productionPackages) {
    const name = packageNameFromLockPath(lockPath);
    const key = `${name}@${metadata.version}`;
    const license = metadata.license ?? overrides.get(key)?.license;
    if (!license) {
      fail(`Production dependency ${key} has no license metadata or reviewed override.`);
      continue;
    }
    if (!approved.has(license)) {
      fail(`Production dependency ${key} uses unapproved license expression ${license}.`);
    }
  }

  for (const override of inventory.dependencyLicenseOverrides) {
    const lockEntry = productionPackages.find(([lockPath, metadata]) => (
      packageNameFromLockPath(lockPath) === override.name && metadata.version === override.version
    ));
    if (!lockEntry) fail(`Dependency license override is stale: ${override.name}@${override.version}.`);
    const evidencePath = path.join(repoRoot, override.evidence);
    const evidence = await readText(evidencePath, `License evidence for ${override.name}@${override.version}`);
    requireText(evidence, override.evidenceContains, `License evidence for ${override.name}@${override.version}`);
  }
}

async function checkPackageContents(packageJson) {
  const result = run(
    "npm",
    ["pack", "--json", "--dry-run", "--ignore-scripts"],
    packageDir,
  );
  if (result.status !== 0) return;

  let report;
  try {
    const start = result.stdout.indexOf("[");
    const end = result.stdout.lastIndexOf("]");
    report = JSON.parse(result.stdout.slice(start, end + 1))[0];
  } catch {
    fail("Could not parse npm pack --json --dry-run output.");
    return;
  }

  const packed = new Set((report.files ?? []).map((entry) => entry.path.replaceAll("\\", "/")));
  for (const required of ["LICENSE", "README.md", "package.json", "dist/index.js", "dist/index.d.ts"]) {
    if (!packed.has(required)) fail(`npm package is missing required file: ${required}`);
  }
  if (report.name !== packageJson.name || report.version !== packageJson.version) {
    fail("npm pack metadata does not match package.json name/version.");
  }
}

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(filePath));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(filePath);
  }
  return files;
}

async function checkDocs(packageJson, inventory) {
  const policy = await readText(path.join(docsDir, "ATTRIBUTION_OWNERSHIP_LICENSE.md"), "Attribution policy");
  const readme = await readText(path.join(packageDir, "README.md"), "Package README");
  const syncScript = await readText(path.join(repoRoot, "scripts", "sync-docs-site-content.mjs"), "Docs synchronization script");
  const renderedPolicy = await readText(
    path.join(renderedDocsDir, "attribution-ownership-license.md"),
    "Rendered attribution source",
  );

  requireText(syncScript, '"ATTRIBUTION_OWNERSHIP_LICENSE.md"', "Docs synchronization script");
  requireText(policy, "[Repository license](../LICENSE)", "Attribution policy");
  requireText(policy, "[Package license](../packages/astro-discussion-bridge/LICENSE)", "Attribution policy");
  requireText(policy, "[Third-party provenance](./THIRD_PARTY_PROVENANCE.json)", "Attribution policy");
  requireText(readme, "[Attribution, Ownership, And Licensing]", "Package README");
  requireText(readme, "Built by Phil Henry / WebSynergetics with AI-assisted development.", "Package README");
  requireText(readme, "independent and is not affiliated with", "Package README");
  requireText(
    renderedPolicy,
    "https://github.com/DiscussionBridge/astro-discussion-bridge/blob/main/packages/astro-discussion-bridge/LICENSE",
    "Rendered attribution source",
  );
  if (/\]\(\.\.\/[^)]+\)/.test(renderedPolicy)) {
    fail("Rendered attribution source contains an unresolved parent-relative link.");
  }

  const publicFiles = [...await markdownFiles(docsDir), path.join(packageDir, "README.md")];
  const forbiddenPatterns = [
    { pattern: /WebSynergetics Secure Ops Vault/i, label: "protected vault name" },
    { pattern: /(?:^|[("'`\s])K:\\/im, label: "protected K: path" },
    { pattern: /C:\\Users\\/i, label: "private Windows user path" },
  ];
  for (const filePath of publicFiles) {
    const contents = await readText(filePath, "Public documentation");
    for (const { pattern, label } of forbiddenPatterns) {
      if (pattern.test(contents)) fail(`${path.relative(repoRoot, filePath)} contains a ${label}.`);
    }
  }

  if (inventory.packageName !== packageJson.name) {
    fail("Third-party provenance inventory packageName does not match package.json.");
  }
}

async function checkMediaInventory(inventory) {
  const tracked = await trackedMediaFiles();
  const recorded = new Set(inventory.mediaAssets.map((entry) => entry.path.replaceAll("\\", "/")));
  for (const file of tracked) {
    if (!recorded.has(file)) fail(`Tracked media asset lacks provenance inventory: ${file}`);
  }
  for (const file of recorded) {
    if (!tracked.includes(file)) fail(`Media provenance inventory entry is stale or untracked: ${file}`);
  }
}

function syncRenderedDocsForFullGate() {
  const syncScript = path.join(repoRoot, "scripts", "sync-docs-site-content.mjs");
  const result = spawnSync(process.execPath, [syncScript], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    const details = result.error?.message ?? result.stderr ?? result.stdout ?? "unknown process error";
    fail(`Docs synchronization failed: ${details.trim()}`);
  }
}

const packageJsonText = await readText(path.join(packageDir, "package.json"), "Package metadata");
const inventoryText = await readText(inventoryPath, "Third-party provenance inventory");
const packageJson = packageJsonText ? JSON.parse(packageJsonText) : {};
const inventory = inventoryText ? JSON.parse(inventoryText) : {
  approvedDependencyLicenses: [],
  dependencyLicenseOverrides: [],
  mediaAssets: [],
};

await checkLicenses(packageJson, inventory);
if (!docsScope) {
  syncRenderedDocsForFullGate();
  await checkPackageContents(packageJson);
}
await checkDocs(packageJson, inventory);
await checkMediaInventory(inventory);

if (failures.length) {
  console.error("Attribution and licensing gate: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Attribution and licensing gate: PASS${docsScope ? " (docs scope)" : ""}`);
  console.log("- project/package license parity: PASS");
  console.log("- production dependency license inventory: PASS");
  console.log(`- npm package contents: ${docsScope ? "SKIPPED (requires built release candidate)" : "PASS"}`);
  console.log("- public attribution docs and links: PASS");
  console.log("- tracked media provenance inventory: PASS");
  console.log("- protected-path scan: PASS");
}
