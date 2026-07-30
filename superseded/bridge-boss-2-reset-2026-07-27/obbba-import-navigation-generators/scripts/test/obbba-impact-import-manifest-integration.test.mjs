import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const generator = path.join(repoRoot, "scripts", "build-obbba-impact-import-manifest.mjs");
const review = path.join(repoRoot, "docs", "evidence", "OBBBA_IMPACT_PUBLICATION_REVIEW_V2_2026-07-25.json");
const siteRoot = "C:\\CodeProjects\\Projects\\OBBBA\\sites\\onebigbeautifulbill.us\\astro";
const navigation = path.join(siteRoot, "discussionbridge-navigation.json");
const titleLanes = path.join(siteRoot, "discussionbridge-title-lanes.json");

test("local OBBBA gate generates exactly 120 create-only hash-bound imports", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "obbba-impact-manifest-generator-"));
  const output = path.join(dir, "manifest.json");
  try {
    await runGenerator(output);
    const manifest = JSON.parse(await readFile(output, "utf8"));
    assert.equal(manifest.version, 2);
    assert.equal(manifest.imports.length, 120);
    assert.equal(new Set(manifest.imports.map((entry) => entry.topic)).size, 120);
    assert.equal(new Set(manifest.imports.map((entry) => entry.output.toLowerCase())).size, 120);
    assert.equal(manifest.imports.some((entry) => entry.sectionId === "10101"), false);
    await assert.rejects(runGenerator(output), /EEXIST/);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

async function runGenerator(outputPath) {
  return execFileAsync(process.execPath, [
    generator,
    review,
    navigation,
    titleLanes,
    outputPath,
  ]);
}
