import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  activeNavigationBranch,
  buildNavigationContentBindings,
  discoverDiscourseNavigation,
  loadNavigationDiscoveryConfig,
  navigationManifestToStarlightSidebar,
  writeNavigationManifest,
} from "../dist/navigation.js";

const cooked = `<p>
  <a href="https://forum.example.com/t/title-i-index/15">TITLE I—AGRICULTURE (Index)</a>
  <a href="https://forum.example.com/t/subtitle-a-nutrition/42">Subtitle A—Nutrition</a>
  <a href="https://forum.example.com/t/sec-10101/34">Sec. 10101. Food plan</a>
  <a href="https://forum.example.com/t/sec-10102/35">Sec. 10102. Work requirements</a>
  <a href="https://outside.example.com/t/ignored/999">Sec. 99999. Outside</a>
  <a href="https://forum.example.com/t/title-vii-index/23">TITLE VII—FINANCE (Index)</a>
  <a href="https://forum.example.com/t/subtitle-a-tax/308">Subtitle A—Tax</a>
  <a href="https://forum.example.com/t/chapter-3/209">CHAPTER 3—CERTAINTY</a>
  <a href="https://forum.example.com/t/subchapter-b/214">SUBCHAPTER B—REFORMS</a>
  <a href="https://forum.example.com/t/part-i/215">PART I—FOREIGN TAX CREDIT</a>
  <a href="https://forum.example.com/t/sec-70301/216">Sec. 70301. Credit rules</a>
</p>`;

test("navigation discovery follows authored index order and maps only known Astro routes", async () => {
  const requests = [];
  const manifest = await discoverDiscourseNavigation({
    discourseUrl: "https://forum.example.com",
    generatedAt: "2026-07-23T00:00:00.000Z",
    hierarchyTagGroups: ["OBBBA TITLE", "OBBBA TITLE VII"],
    lenses: [{
      key: "obbba-text",
      label: "OBBBA Text",
      categoryId: 5,
      indexTopicId: 12,
    }],
    content: [{
      title: "Section 10101",
      url: "https://example.com/obbba-text/title-i/10101/",
      contentLens: "obbba-text",
      sectionIds: ["10101"],
      sourceTopicId: 34,
      sourceTags: ["TITLE-I", "Enrolled-Bill-Text", "Needs-Review"],
    }],
    fetch: async (url) => {
      requests.push(String(url));
      if (String(url).includes("tag_groups")) {
        const query = new URL(url).searchParams.get("q");
        return jsonResponse({
          results: query === "OBBBA TITLE"
            ? [{ name: "OBBBA TITLE", tags: [{ slug: "title-i" }, { slug: "title-vii" }] }]
            : [{ name: "OBBBA TITLE VII", tags: [{ slug: "subtitle-a-tax" }] }],
        });
      }
      return jsonResponse({
        id: 12,
        category_id: 5,
        post_stream: { posts: [{ post_number: 1, cooked }] },
      });
    },
  });

  assert.deepEqual(requests, [
    "https://forum.example.com/tag_groups/filter/search.json?q=OBBBA+TITLE",
    "https://forum.example.com/tag_groups/filter/search.json?q=OBBBA+TITLE+VII",
    "https://forum.example.com/t/12.json",
  ]);
  assert.deepEqual(manifest.hierarchyTagGroups.map((group) => group.name), [
    "OBBBA TITLE",
    "OBBBA TITLE VII",
  ]);
  assert.equal(manifest.lenses[0].nodes[0].topicId, 15);
  assert.equal(manifest.lenses[0].nodes[0].children[0].topicId, 42);
  assert.equal(manifest.lenses[0].nodes[0].children[0].children[0].topicId, 34);
  assert.equal(
    manifest.lenses[0].nodes[0].children[0].children[0].url,
    "https://example.com/obbba-text/title-i/10101/",
  );
  assert.deepEqual(
    manifest.lenses[0].nodes[0].children[0].children[0].sourceTags,
    ["TITLE-I", "Enrolled-Bill-Text", "Needs-Review"],
  );
  assert.equal(manifest.lenses[0].nodes[1].children[0].children[0].children[0].children[0].kind, "part");
  assert.deepEqual(
    activeNavigationBranch(manifest, "https://example.com/obbba-text/title-i/10101/"),
    ["obbba-text", "obbba-text:15", "obbba-text:42", "obbba-text:34"],
  );
});

test("navigation manifest produces a Starlight adapter and create-only artifact", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-navigation-"));
  try {
    const manifest = await discoverDiscourseNavigation({
      discourseUrl: "https://forum.example.com",
      generatedAt: "2026-07-23T00:00:00.000Z",
      hierarchyTagGroups: ["OBBBA TITLE"],
      lenses: [{
        key: "impact",
        label: "Impact",
        categoryId: 18,
        indexTopicId: 435,
      }],
      fetch: async (url) => String(url).includes("tag_groups")
        ? jsonResponse({ results: [{ name: "OBBBA TITLE", tags: ["TITLE-I"] }] })
        : jsonResponse({
            id: 435,
            category_id: 18,
            post_stream: { posts: [{ post_number: 1, cooked }] },
          }),
    });
    const sidebar = navigationManifestToStarlightSidebar(manifest);
    assert.equal(sidebar[0].label, "Impact");
    assert.equal(sidebar[0].items[0].label, "TITLE I—AGRICULTURE");
    assert.deepEqual(sidebar[0].items[0].items[0], {
      label: "Overview",
      link: "https://forum.example.com/t/15",
    });

    const output = path.join(dir, "navigation.json");
    await writeNavigationManifest(output, manifest);
    assert.match(await readFile(output, "utf8"), /"generatedAt": "2026-07-23T00:00:00.000Z"/);
    await assert.rejects(writeNavigationManifest(output, manifest), /EEXIST/);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("navigation config and content bindings preserve routes and source tags without using tags for order", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-navigation-config-"));
  const contentDir = path.join(dir, "src", "content", "docs");
  await Promise.all([
    mkdir(contentDir, { recursive: true }),
    writeFile(path.join(dir, "navigation.json"), JSON.stringify({
      version: 1,
      hierarchyTagGroups: ["OBBBA TITLE"],
      lenses: [{
        key: "impact",
        label: "Impact",
        categoryId: 18,
        indexTopicId: 435,
      }],
      contentSources: [{ docsDir: "src/content/docs", routeBase: "impact" }],
    })),
  ]);
  await writeFile(
    path.join(contentDir, "10101.md"),
    `---
title: Section 10101 Impact
contentLens: impact
sectionId: 10101
discourseTopicId: 434
discussionSourceTags: '["TITLE-I","Needs-Review"]'
---

Body.
`,
  );
  try {
    const config = await loadNavigationDiscoveryConfig(path.join(dir, "navigation.json"));
    const bindings = await buildNavigationContentBindings({
      projectRoot: dir,
      siteUrl: "https://example.com",
      sources: config.contentSources,
    });
    assert.deepEqual(bindings, [{
      title: "Section 10101 Impact",
      contentLens: "impact",
      sourceTopicId: 434,
      sourceTags: ["TITLE-I", "Needs-Review"],
      sectionIds: ["10101"],
      url: "https://example.com/impact/10101/",
    }]);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("navigation discovery rejects category drift and missing tag groups", async () => {
  const base = {
    discourseUrl: "https://forum.example.com",
    hierarchyTagGroups: ["OBBBA TITLE"],
    lenses: [{
      key: "impact",
      label: "Impact",
      categoryId: 18,
      indexTopicId: 435,
    }],
  };
  await assert.rejects(
    discoverDiscourseNavigation({
      ...base,
      fetch: async (url) => String(url).includes("tag_groups")
        ? jsonResponse({ results: [{ name: "OBBBA TITLE", tags: [] }] })
        : jsonResponse({
            id: 435,
            category_id: 5,
            post_stream: { posts: [{ post_number: 1, cooked }] },
          }),
    }),
    /not configured category 18/,
  );
  await assert.rejects(
    discoverDiscourseNavigation({
      ...base,
      fetch: async () => jsonResponse({ results: [] }),
    }),
    /tag group was not found/,
  );
});

test("navigation config rejects unknown root, lens, and content-source fields", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-navigation-strict-"));
  const base = {
    version: 1,
    hierarchyTagGroups: ["OBBBA TITLE"],
    lenses: [{
      key: "impact",
      label: "Impact",
      categoryId: 18,
      indexTopicId: 435,
    }],
    contentSources: [{ docsDir: "src/content/docs" }],
  };
  try {
    for (const [name, config, pattern] of [
      ["root", { ...base, apiKey: "must-not-be-accepted" }, /navigation config contains unknown field.*apiKey/],
      ["lens", { ...base, lenses: [{ ...base.lenses[0], indexTpoicId: 435 }] }, /navigation lens 0 contains unknown field.*indexTpoicId/],
      ["source", { ...base, contentSources: [{ docsDir: "src/content/docs", routesBase: "impact" }] }, /content source 0 contains unknown field.*routesBase/],
    ]) {
      const filePath = path.join(dir, `${name}.json`);
      await writeFile(filePath, JSON.stringify(config));
      await assert.rejects(loadNavigationDiscoveryConfig(filePath), pattern);
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
