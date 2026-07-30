import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(siteRoot, "..", "..");
const metadata = JSON.parse(
  await readFile(path.join(repoRoot, "docs", "DOCS_PAGE_METADATA.json"), "utf8",
  ),
);

test("tracked docs dates do not depend on deployment Git history", () => {
  assert.equal(metadata.version, 1);
  assert.equal(metadata.appliesTo, "DiscussionBridge Alpha");

  for (const [file, page] of Object.entries(metadata.pages)) {
    assert.match(file, /\.md$/);
    assert.match(page.lastUpdated, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(page.sourceSha256, /^[a-f0-9]{64}$/);
  }
});

test("the metadata ledger covers and matches every synchronized docs source", async () => {
  const syncScript = await readFile(
    path.join(repoRoot, "scripts", "sync-docs-site-content.mjs"),
    "utf8",
  );
  const listedFiles = [
    ...syncScript.matchAll(/^\s{2}"([^"]+\.md)",$/gm),
  ].map((match) => match[1]);

  assert.doesNotMatch(syncScript, /\bgit\s+log\b|execFile/);
  assert.deepEqual(Object.keys(metadata.pages), listedFiles);

  for (const file of listedFiles) {
    const markdown = await readFile(path.join(repoRoot, "docs", file), "utf8");
    const hash = createHash("sha256")
      .update(markdown.replace(/\r\n/g, "\n"), "utf8")
      .digest("hex");
    assert.equal(metadata.pages[file].sourceSha256, hash, file);
  }
});
