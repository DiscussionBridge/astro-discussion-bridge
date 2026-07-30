import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const siteRoot = "C:\\CodeProjects\\Projects\\OBBBA\\sites\\onebigbeautifulbill.us\\astro";
const baseline = "5a455f12e49f4504607528e4f2a5cd85797a6598";
const execute = process.argv.includes("--execute");
const quarantineRoot = path.join(
  siteRoot,
  "superseded",
  "bridge-boss-2-reset-2026-07-27",
  "operator-imported-content",
);
const manifestPath = path.join(quarantineRoot, "MANIFEST.json");
const completionPath = path.join(quarantineRoot, "COMPLETE.json");

const existingManifestBytes = await optionalRead(manifestPath);
let manifest;
let manifestText;
let records;
let restored;

if (existingManifestBytes) {
  manifestText = existingManifestBytes.toString("utf8");
  manifest = JSON.parse(manifestText);
  validateManifestShape(manifest);
  records = manifest.payloads;
  restored = manifest.restoredTrackedFiles.map((record) => ({
    ...record,
    backup: path.resolve(siteRoot, record.backup),
    stagedBaseline: path.resolve(siteRoot, record.stagedBaseline),
    baselineBytesBuffer: execFileSync(
      "git",
      ["show", `${manifest.baseline}:${record.path}`],
      { cwd: siteRoot, encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
    ),
  }));
} else {
  ({ manifest, manifestText, records, restored } = await createFreshPlan());
}

const completion = {
  schemaVersion: 1,
  operation: manifest.operation,
  status: "complete",
  baseline: manifest.baseline,
  payloadsVerified: records.length,
  trackedFilesRestoredAndVerified: restored.length,
};
const completionText = `${JSON.stringify(completion, null, 2)}\n`;
const existingCompletionBytes = await optionalRead(completionPath);
if (existingCompletionBytes && existingCompletionBytes.toString("utf8") !== completionText) {
  throw new Error("Existing completion record does not match the deterministic plan.");
}

for (const record of records) {
  const source = path.resolve(siteRoot, record.source);
  const destination = path.resolve(siteRoot, record.destination);
  requireInside(source, siteRoot, "source");
  requireInside(destination, quarantineRoot, "destination");
  await assertMoveState(source, destination, record);
}
for (const record of restored) {
  requireInside(record.backup, quarantineRoot, "backup");
  requireInside(record.stagedBaseline, quarantineRoot, "staged baseline");
  requireBytesIdentity(
    record.baselineBytesBuffer,
    record.baselineBytes,
    record.baselineSha256,
    `Git baseline ${record.path}`,
  );
  await assertOptionalIdentity(record.backup, record.currentBytes, record.currentSha256, "backup");
  await assertOptionalIdentity(
    record.stagedBaseline,
    record.baselineBytes,
    record.baselineSha256,
    "staged baseline",
  );
  const activeBytes = await readFile(path.join(siteRoot, record.path));
  const activeIsCurrent = matchesIdentity(activeBytes, record.currentBytes, record.currentSha256);
  const activeIsBaseline = matchesIdentity(activeBytes, record.baselineBytes, record.baselineSha256);
  if (!activeIsCurrent && !activeIsBaseline) {
    throw new Error(`Active navigation identity is neither original nor baseline: ${record.path}`);
  }
}

console.log(JSON.stringify({
  execute,
  resume: Boolean(existingManifestBytes),
  alreadyComplete: Boolean(existingCompletionBytes),
  importedOutputs: manifest.importedPayloadCount,
  auxiliaryFiles: manifest.auxiliaryPayloadCount,
  protectedPreBb2Content: manifest.protectedPreBb2ContentCount,
  restoreFromBaseline: restored.length,
  quarantineRoot,
}, null, 2));

if (!execute) process.exit(0);

await mkdir(quarantineRoot, { recursive: true });
if (!existingManifestBytes) {
  await writeFile(manifestPath, manifestText, { flag: "wx" });
}

for (const record of records) {
  const source = path.resolve(siteRoot, record.source);
  const destination = path.resolve(siteRoot, record.destination);
  const sourceBytes = await optionalRead(source);
  const destinationBytes = await optionalRead(destination);
  if (sourceBytes && !destinationBytes) {
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(source, destination);
  }
  await requireIdentity(destination, record.bytes, record.sha256, "moved payload");
}

for (const record of restored) {
  const active = path.join(siteRoot, record.path);
  if (!await optionalRead(record.backup)) {
    const current = await readFile(active);
    requireBytesIdentity(current, record.currentBytes, record.currentSha256, `active ${record.path}`);
    await mkdir(path.dirname(record.backup), { recursive: true });
    await writeFile(record.backup, current, { flag: "wx" });
  }
  await requireIdentity(record.backup, record.currentBytes, record.currentSha256, "navigation backup");
  if (!await optionalRead(record.stagedBaseline)) {
    await mkdir(path.dirname(record.stagedBaseline), { recursive: true });
    await writeFile(record.stagedBaseline, record.baselineBytesBuffer, { flag: "wx" });
  }
  await requireIdentity(
    record.stagedBaseline,
    record.baselineBytes,
    record.baselineSha256,
    "staged baseline",
  );
  const activeBytes = await readFile(active);
  if (!matchesIdentity(activeBytes, record.baselineBytes, record.baselineSha256)) {
    await writeFile(active, record.baselineBytesBuffer);
  }
  await requireIdentity(active, record.baselineBytes, record.baselineSha256, "restored active file");
}

if (!existingCompletionBytes) {
  await writeFile(completionPath, completionText, { flag: "wx" });
}

async function createFreshPlan() {
  const importManifests = [
    { file: "discussionbridge-imports-impact-approved-20260726.json", expected: 120 },
    { file: "discussionbridge-imports-obbba-text-approved-20260726.json", expected: 306 },
  ];
  const auxiliaryFiles = [
    "discussionbridge-imports-impact-approved-20260726.json",
    "discussionbridge-imports-obbba-text-approved-20260726.json",
    "discussionbridge-imports-obbba-text-approved-v2-20260726.json",
    "discussionbridge-imports-obbba-text-approved-v3-20260726.json",
    "discussionbridge-navigation.law-as-amended.next.json",
    "discussionbridge-navigation.law-as-amended.v2.next.json",
    "discussionbridge-navigation.next.json",
    "discussionbridge-navigation.v2.next.json",
  ];
  const restoreFromBaseline = [
    "discussionbridge-navigation.config.json",
    "discussionbridge-navigation.json",
  ];
  const protectedContent = new Set(
    execFileSync(
      "git",
      ["ls-tree", "-r", "--name-only", baseline, "src/content/docs"],
      { cwd: siteRoot, encoding: "utf8" },
    ).trim().split(/\r?\n/).filter(Boolean),
  );
  const imported = [];
  for (const source of importManifests) {
    const parsed = JSON.parse(await readFile(path.join(siteRoot, source.file), "utf8"));
    if (!Array.isArray(parsed.imports) || parsed.imports.length !== source.expected) {
      throw new Error(`${source.file} must contain exactly ${source.expected} imports.`);
    }
    for (const entry of parsed.imports) {
      if (typeof entry.output !== "string" || !entry.output.trim()) {
        throw new Error(`${source.file} contains an invalid output.`);
      }
      const relative = path.posix.join("src/content/docs", entry.output.replaceAll("\\", "/"));
      if (relative.includes("..")) throw new Error(`Unsafe import path: ${relative}`);
      if (protectedContent.has(relative)) {
        throw new Error(`Import overlaps protected pre-BB2 content: ${relative}`);
      }
      imported.push(relative);
    }
  }
  if (new Set(imported).size !== 426) {
    throw new Error(`Expected 426 unique imported outputs; found ${new Set(imported).size}.`);
  }

  const freshRecords = [];
  for (const relative of [...imported, ...auxiliaryFiles]) {
    const source = path.resolve(siteRoot, relative);
    const destination = path.resolve(quarantineRoot, relative);
    requireInside(source, siteRoot, "source");
    requireInside(destination, quarantineRoot, "destination");
    const bytes = await readFile(source);
    if (await optionalRead(destination)) throw new Error(`Destination already exists: ${destination}`);
    freshRecords.push({
      source: relative.replaceAll("\\", "/"),
      destination: path.relative(siteRoot, destination).replaceAll("\\", "/"),
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }

  const freshRestored = [];
  for (const relative of restoreFromBaseline) {
    const current = await readFile(path.join(siteRoot, relative));
    const baselineBytesBuffer = execFileSync("git", ["show", `${baseline}:${relative}`], {
      cwd: siteRoot,
      encoding: "buffer",
      maxBuffer: 32 * 1024 * 1024,
    });
    const backup = path.resolve(quarantineRoot, "replaced-active", relative);
    const stagedBaseline = path.resolve(quarantineRoot, "staged-baseline", relative);
    if (await optionalRead(backup)) throw new Error(`Backup already exists: ${backup}`);
    if (await optionalRead(stagedBaseline)) throw new Error(`Staged baseline exists: ${stagedBaseline}`);
    freshRestored.push({
      path: relative,
      currentBytes: current.length,
      currentSha256: sha256(current),
      baselineBytes: baselineBytesBuffer.length,
      baselineSha256: sha256(baselineBytesBuffer),
      backup,
      stagedBaseline,
      baselineBytesBuffer,
    });
  }

  const freshManifest = {
    schemaVersion: 1,
    operation: "bb2-obbba-operator-import-containment",
    status: "prepared",
    baseline,
    importedPayloadCount: imported.length,
    auxiliaryPayloadCount: auxiliaryFiles.length,
    protectedPreBb2ContentCount: protectedContent.size,
    payloads: freshRecords,
    restoredTrackedFiles: freshRestored.map(({
      baselineBytesBuffer: _buffer,
      backup,
      stagedBaseline,
      ...record
    }) => ({
      ...record,
      backup: path.relative(siteRoot, backup).replaceAll("\\", "/"),
      stagedBaseline: path.relative(siteRoot, stagedBaseline).replaceAll("\\", "/"),
    })),
  };
  return {
    manifest: freshManifest,
    manifestText: `${JSON.stringify(freshManifest, null, 2)}\n`,
    records: freshRecords,
    restored: freshRestored,
  };
}

function validateManifestShape(value) {
  if (
    value?.schemaVersion !== 1
    || value.operation !== "bb2-obbba-operator-import-containment"
    || value.status !== "prepared"
    || value.baseline !== baseline
    || value.importedPayloadCount !== 426
    || value.auxiliaryPayloadCount !== 8
    || value.protectedPreBb2ContentCount !== 18
    || !Array.isArray(value.payloads)
    || value.payloads.length !== 434
    || !Array.isArray(value.restoredTrackedFiles)
    || value.restoredTrackedFiles.length !== 2
  ) {
    throw new Error("Existing operation manifest has an invalid shape or boundary.");
  }
}

function requireInside(candidate, root, label) {
  const prefix = `${path.resolve(root)}${path.sep}`.toLocaleLowerCase("en-US");
  if (!candidate.toLocaleLowerCase("en-US").startsWith(prefix)) {
    throw new Error(`${label} escapes its allowed root: ${candidate}`);
  }
}

async function optionalRead(candidate) {
  try {
    return await readFile(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function assertMoveState(source, destination, record) {
  const sourceBytes = await optionalRead(source);
  const destinationBytes = await optionalRead(destination);
  if (sourceBytes && destinationBytes) throw new Error(`Both paths exist: ${record.source}`);
  if (!sourceBytes && !destinationBytes) throw new Error(`Neither path exists: ${record.source}`);
  requireBytesIdentity(
    sourceBytes ?? destinationBytes,
    record.bytes,
    record.sha256,
    sourceBytes ? "pending source" : "completed destination",
  );
}

async function assertOptionalIdentity(candidate, bytes, expectedSha256, label) {
  const value = await optionalRead(candidate);
  if (value) requireBytesIdentity(value, bytes, expectedSha256, label);
}

async function requireIdentity(candidate, bytes, expectedSha256, label) {
  requireBytesIdentity(await readFile(candidate), bytes, expectedSha256, label);
}

function requireBytesIdentity(value, bytes, expectedSha256, label) {
  if (!matchesIdentity(value, bytes, expectedSha256)) {
    throw new Error(`${label} identity mismatch.`);
  }
}

function matchesIdentity(value, bytes, expectedSha256) {
  return value.length === bytes && sha256(value) === expectedSha256;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
