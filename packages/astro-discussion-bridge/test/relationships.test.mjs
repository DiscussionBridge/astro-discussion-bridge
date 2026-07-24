import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildContentRelationshipManifest,
  parseRelationshipManifest,
  resolveContentRelationships,
} from "../dist/relationships.js";

test("relationship manifest connects lenses by section ID including one-to-many stories", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "discussion-bridge-relations-"));
  const docsDir = path.join(projectRoot, "src", "content", "docs");

  try {
    await writePage(docsDir, "obbba-text/title-i/10101.md", {
      title: "Sec. 10101. Re-evaluation of thrifty food plan",
      contentLens: "obbba-text",
      sectionId: "10101",
    });
    await writePage(docsDir, "impact/title-i/10101-impact.md", {
      title: "Section 10101 Impact",
      contentLens: "impact",
      sectionId: "10101",
    });
    await writePage(docsDir, "stories/household.md", {
      title: "A Household Responds to Section 10101",
      contentLens: "stories",
      sectionIds: ["10101"],
    });
    await writePage(docsDir, "stories/food-bank.md", {
      title: "A Food Bank Responds",
      contentLens: "stories",
      sectionIds: ["10101", "10102"],
    });

    const manifest = await buildContentRelationshipManifest({
      projectRoot,
      siteUrl: "https://onebigbeautifulbill.us",
      sources: [{ docsDir: "src/content/docs" }],
      lenses: {
        "obbba-text": {
          label: "OBBBA Text",
          callToAction: "Read the enacted text",
        },
        impact: {
          label: "Impact",
          callToAction: "Explore the impact",
        },
        stories: {
          label: "Stories",
          singularCallToAction: "View the community story",
          pluralCallToAction: "View {count} community stories",
        },
      },
    });

    assert.equal(manifest.entries.length, 4);
    const related = resolveContentRelationships({
      manifest,
      currentUrl: "https://onebigbeautifulbill.us/obbba-text/title-i/10101/",
      sectionIds: "10101",
      contentLens: "obbba-text",
    });
    assert.deepEqual(related.map((group) => [group.contentLens, group.callToAction, group.entries.length]), [
      ["impact", "Explore the impact", 1],
      ["stories", "View 2 community stories", 2],
    ]);
    assert.equal(
      related[0].entries[0].url,
      "https://onebigbeautifulbill.us/impact/title-i/10101-impact/",
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("relationship manifest fails closed for incomplete or duplicate records", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "discussion-bridge-relations-invalid-"));
  const docsDir = path.join(projectRoot, "docs");

  try {
    await writePage(docsDir, "incomplete.md", {
      title: "Incomplete Page",
      sectionId: "10101",
    });
    await assert.rejects(
      buildContentRelationshipManifest({
        projectRoot,
        sources: [{ docsDir: "docs" }],
      }),
      /requires title, contentLens, and sectionId/,
    );

    assert.throws(
      () => parseRelationshipManifest({
        version: 1,
        lenses: {},
        entries: [
          { title: "One", url: "/same/", contentLens: "impact", sectionIds: ["10101"] },
          { title: "Two", url: "/same/", contentLens: "stories", sectionIds: ["10101"] },
        ],
      }),
      /duplicate URL/,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

async function writePage(docsDir, relativePath, frontmatter) {
  const filePath = path.join(docsDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push("---", "", "Body.");
  await writeFile(filePath, lines.join("\n"));
}
