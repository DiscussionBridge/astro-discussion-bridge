import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(repoRoot, "docs");
const targetDir = path.join(repoRoot, "sites", "docs", "src", "content", "docs");
const metadataPath = path.join(sourceDir, "DOCS_PAGE_METADATA.json");
const refreshMetadata = process.argv.includes("--refresh-metadata");
const checkOnly = process.argv.includes("--check");
const expectedChangePrefix = "--expect-change=";
const expectedChanges = process.argv
  .filter((argument) => argument.startsWith(expectedChangePrefix))
  .map((argument) => argument.slice(expectedChangePrefix.length));

if (checkOnly && refreshMetadata) {
  throw new Error("--check cannot be combined with --refresh-metadata.");
}

if (!checkOnly && expectedChanges.length > 0) {
  throw new Error("--expect-change requires --check.");
}

const docs = [
  "README.md",
  "HUMAN_MANUAL.md",
  "MACHINE_MANUAL.md",
  "SITE_RUNBOOK_HUMAN_TEMPLATE.md",
  "SITE_RUNBOOK_MACHINE_TEMPLATE.md",
  "runbooks/OBBBA_ONEBIGBEAUTIFULBILL_HUMAN.md",
  "runbooks/OBBBA_ONEBIGBEAUTIFULBILL_MACHINE.md",
  "ALPHA_SETUP.md",
  "KEY_MANAGEMENT.md",
  "COMMENTS_DISPLAY.md",
  "CONTENT_LANES.md",
  "PRESETS_AND_PLACEMENT.md",
  "DISCUSSION_SAFE_MARKDOWN.md",
  "TROUBLESHOOTING.md",
  "SUPPORT_AND_FEEDBACK.md",
  "KNOWN_ISSUES.md",
  "ATTRIBUTION_OWNERSHIP_LICENSE.md",
  "BUILD_LAUNCH_CHECKLISTS.md",
  "CORE_ADAPTER_ARCHITECTURE.md",
  "CORE_ADAPTER_IMPLEMENTATION_ROADMAP.md",
  "DEMO_PLAN.md",
  "DISCOURSE_FIELD_NOTES.md",
  "PRODUCT_NOTES.md",
  "evidence/DISCUSSION_BRIDGE_DISCOURSE_CENTERED_DOCTRINE_2026-07-25.md",
  "evidence/DISCUSSION_BRIDGE_PRODUCT_FAMILY_DOCTRINE_2026-07-25.md",
  "evidence/DISCUSSION_BRIDGE_MISSION_2026-07-25.md",
];

const slugByFile = new Map(
  docs.map((file) => [
    file,
    file === "README.md"
      ? "index"
      : file.toLowerCase().replace(/\.md$/, "").replaceAll("_", "-").replaceAll("/", "-"),
  ]),
);

function pageTitle(markdown, file) {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return file.replace(/\.md$/, "").replaceAll("_", " ");
}

function stripFirstHeading(markdown) {
  return markdown.replace(/^#\s+.+\r?\n+/, "");
}

function rewriteLinks(markdown, sourceFile) {
  let next = markdown;

  const sourceDirectory = path.posix.dirname(sourceFile.replaceAll("\\", "/"));
  next = next.replace(/\]\(\.\/([^)#]+\.md)\)/g, (match, relativeTarget) => {
    const resolved = path.posix.normalize(path.posix.join(sourceDirectory, relativeTarget));
    const slug = slugByFile.get(resolved);
    return slug ? `](/${slug}/)` : match;
  });

  for (const [file, slug] of slugByFile.entries()) {
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`\\]\\(\\.\\/${escaped}\\)`, "g"), `](/${slug}/)`);
  }

  next = next.replace(
    /\]\(\.\.\/LICENSE\)/g,
    "](https://github.com/DiscussionBridge/astro-discussion-bridge/blob/main/LICENSE)",
  );
  next = next.replace(
    /\]\(\.\.\/packages\/astro-discussion-bridge\/LICENSE\)/g,
    "](https://github.com/DiscussionBridge/astro-discussion-bridge/blob/main/packages/astro-discussion-bridge/LICENSE)",
  );
  next = next.replace(
    /\]\(\.\/THIRD_PARTY_PROVENANCE\.json\)/g,
    "](https://github.com/DiscussionBridge/astro-discussion-bridge/blob/main/docs/THIRD_PARTY_PROVENANCE.json)",
  );

  return next;
}

function sourceHash(markdown) {
  return createHash("sha256")
    .update(markdown.replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
}

async function readMetadata() {
  try {
    return JSON.parse(await readFile(metadataPath, "utf8"));
  } catch (error) {
    if (refreshMetadata && error?.code === "ENOENT") {
      return { version: 1, appliesTo: "DiscussionBridge Alpha", pages: {} };
    }
    throw new Error(
      `Could not read ${metadataPath}. Run npm run refresh-metadata from sites/docs.`,
      { cause: error },
    );
  }
}

const metadata = await readMetadata();
if (metadata.version !== 1 || typeof metadata.appliesTo !== "string" || !metadata.pages) {
  throw new Error(`Invalid docs metadata ledger: ${metadataPath}`);
}

const pages = [];
const nextMetadataPages = {};
const today = new Date().toISOString().slice(0, 10);

for (const file of docs) {
  const sourcePath = path.join(sourceDir, file);
  try {
    await access(sourcePath);
  } catch {
    throw new Error(`Missing docs source: ${path.join(sourceDir, file)}`);
  }

  const markdown = await readFile(sourcePath, "utf8");
  const hash = sourceHash(markdown);
  const existing = metadata.pages[file];

  if (!refreshMetadata && (!existing || existing.sourceSha256 !== hash)) {
    throw new Error(
      `Stale docs metadata for ${file}. Run npm run refresh-metadata from sites/docs, review the date, and commit docs/DOCS_PAGE_METADATA.json.`,
    );
  }

  const lastUpdated =
    existing?.sourceSha256 === hash
      ? existing.lastUpdated
      : today;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated)) {
    throw new Error(`Invalid lastUpdated date for ${file}: ${lastUpdated}`);
  }

  nextMetadataPages[file] = { lastUpdated, sourceSha256: hash };
  pages.push({ file, sourcePath, markdown, lastUpdated });
}

if (refreshMetadata) {
  await writeFile(
    metadataPath,
    `${JSON.stringify({ ...metadata, pages: nextMetadataPages }, null, 2)}\n`,
    "utf8",
  );
}

function renderPage({ file, markdown, lastUpdated }) {
  const title = pageTitle(markdown, file);
  const body = rewriteLinks(stripFirstHeading(markdown).trimStart(), file);
  const slug = slugByFile.get(file);
  const editUrl = `https://github.com/DiscussionBridge/astro-discussion-bridge/edit/main/docs/${file}`;

  return {
    file: `${slug}.md`,
    content: [
      "---",
      `title: ${JSON.stringify(title)}`,
      `lastUpdated: ${lastUpdated}`,
      `appliesTo: ${JSON.stringify(metadata.appliesTo)}`,
      `editUrl: ${JSON.stringify(editUrl)}`,
      "---",
      "",
      body,
    ].join("\n"),
  };
}

const renderedPages = pages.map(renderPage);

if (checkOnly) {
  const expectedFiles = new Set(renderedPages.map(({ file }) => file));
  const changed = [];

  for (const { file, content } of renderedPages) {
    try {
      const existing = await readFile(path.join(targetDir, file), "utf8");
      if (existing !== content) changed.push(file);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      changed.push(file);
    }
  }

  try {
    for (const entry of await readdir(targetDir, { withFileTypes: true })) {
      if (entry.isFile() && !expectedFiles.has(entry.name)) {
        changed.push(entry.name);
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  changed.sort();
  console.log(
    changed.length === 0
      ? "Docs content check passed: no generated pages would change."
      : `Docs content check found ${changed.length} changed page(s):\n${changed.join("\n")}`,
  );

  if (expectedChanges.length > 0) {
    const expected = [...new Set(expectedChanges)].sort();
    if (
      expected.length !== changed.length ||
      expected.some((file, index) => file !== changed[index])
    ) {
      throw new Error(
        `Generated change set did not match --expect-change allowlist.\nExpected:\n${expected.join("\n") || "(none)"}\nActual:\n${changed.join("\n") || "(none)"}`,
      );
    }
  } else if (changed.length > 0) {
    process.exitCode = 1;
  }
} else {
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  for (const { file, content } of renderedPages) {
    await writeFile(path.join(targetDir, file), content, "utf8");
  }

  console.log(`Synced ${docs.length} docs pages to ${targetDir}`);
}
