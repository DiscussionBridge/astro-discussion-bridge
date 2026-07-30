import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkDiscourse } from "../dist/check-discourse.js";
import { createDiscourseClient } from "../dist/discourse/client.js";
import {
  discoverDiscourseImports,
  selectCategory,
  writeImportDiscoveryManifest,
} from "../dist/import-discovery.js";
import { importExistingDiscourseTopics } from "../dist/import-existing.js";
import { importExistingDiscourseManifest, validateImportManifest } from "../dist/import-manifest.js";
import { syncDiscourseTopics, validateDiscourseTopicTitle } from "../dist/sync/index.js";

test("import discovery selects categories by ID or exact unambiguous name/slug", () => {
  const categories = [
    { id: 18, name: "OBBBA - Impact", slug: "obbba-impact" },
    { id: 19, name: "Guides", slug: "guides" },
    { id: 20, name: "GUIDES", slug: "other-guides" },
  ];

  assert.equal(selectCategory(categories, "18").id, 18);
  assert.equal(selectCategory(categories, "obbba-impact").id, 18);
  assert.throws(() => selectCategory(categories, "guides"), /ambiguous.*19, 20/i);
  assert.throws(() => selectCategory(categories, "missing"), /not found/i);
});

test("import discovery filters a paginated category and never sequences by latest activity", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-discovery-"));
  try {
    await mkdir(path.join(dir, "nested"), { recursive: true });
    await writeFile(
      path.join(dir, "legacy.md"),
      "---\ndiscourseTopicId: 434\n---\n\nAlready imported.\n",
    );
    await writeFile(
      path.join(dir, "nested", "targeted.mdx"),
      [
        "---",
        "discussionTargetBindings: '{\"national\":{\"topicId\":748,\"topicUrl\":\"https://forum.example.com/t/x/748\"}}'",
        "analytics: '{\"topicId\":751}'",
        "---",
        "",
        "Already linked through a target binding.",
        "",
      ].join("\n"),
    );

    const responses = new Map([
      ["/categories.json", {
        category_list: {
          categories: [
            { id: 18, name: "OBBBA - Impact", slug: "obbba-impact", topic_count: 7 },
            { id: 21, name: "Title I", slug: "title-i", parent_category_id: 18, topic_count: 1 },
          ],
        },
      }],
      ["/c/obbba-impact/18.json", {
        topic_list: {
          more_topics_url: "/c/obbba-impact/18?page=1",
          topics: [
            topicListItem(434, "Sec. 10101. Imported", "2025-07-27T00:41:14.868Z", {
              bumpedAt: "2026-07-22T05:14:56.195Z",
              tags: ["Impact", "TITLE-I"],
            }),
            topicListItem(751, "Sec. 10103. Later", "2025-07-28T00:00:00.000Z", {
              bumpedAt: "2025-07-28T00:00:01.000Z",
              tags: [{ name: "title-i" }],
            }),
            topicListItem(747, "Sec. 10102. First tie", "2025-07-27T12:00:00.000Z", {
              bumpedAt: "2026-07-23T00:00:00.000Z",
              tags: ["TITLE-I"],
            }),
            topicListItem(748, "Sec. 10102A. Targeted import", "2025-07-27T12:00:00.000Z", {
              tags: ["TITLE-I"],
            }),
            topicListItem(752, "Sec. 10104. Closed", "2025-07-29T00:00:00.000Z", {
              closed: true,
              tags: ["TITLE-I"],
            }),
            topicListItem(900, "Sec. 90000. Wrong tag", "2025-07-26T00:00:00.000Z", {
              tags: ["TITLE-II"],
            }),
          ],
        },
      }],
      ["/c/obbba-impact/18?page=1", {
        topic_list: {
          topics: [
            topicListItem(747, "Sec. 10102. First tie", "2025-07-27T12:00:00.000Z", {
              tags: ["TITLE-I"],
            }),
            topicListItem(753, "Sec. 10105. Child category", "2025-07-27T12:00:00.000Z", {
              categoryId: 21,
              tags: ["Impact", "TITLE-I"],
            }),
          ],
        },
      }],
      ["/c/title-i/21.json", {
        topic_list: {
          topics: [
            topicListItem(753, "Sec. 10105. Child category", "2025-07-27T12:00:00.000Z", {
              categoryId: 21,
              tags: ["Impact", "TITLE-I"],
            }),
          ],
        },
      }],
    ]);

    const fetcher = async (url) => {
      const parsed = new URL(url);
      const key = `${parsed.pathname}${parsed.search}`;
      const body = responses.get(key);
      return body
        ? jsonResponse(body)
        : new Response("Not found", { status: 404, statusText: "Not Found" });
    };

    const result = await discoverDiscourseImports({
      docsDir: dir,
      discourseUrl: "https://forum.example.com",
      category: "obbba-impact",
      includeSubcategories: true,
      tags: ["TITLE-I"],
      status: "open",
      order: "oldest",
      sourceMode: "discourse-managed",
      commentsDisplay: "fullInteractive",
      fetch: fetcher,
    });

    assert.equal(result.scannedTopics, 7);
    assert.equal(result.excludedAlreadyImported, 2);
    assert.deepEqual(result.includedCategoryIds, [18, 21]);
    assert.deepEqual(result.candidates.map((candidate) => candidate.topicId), [747, 753, 751]);
    assert.deepEqual(result.manifest.imports, [
      {
        topic: "https://forum.example.com/t/sec.-10102.-first-tie/747",
        commentsDisplay: "fullInteractive",
        requiredTags: ["TITLE-I"],
        sourceMode: "discourse-managed",
      },
      {
        topic: "https://forum.example.com/t/sec.-10105.-child-category/753",
        commentsDisplay: "fullInteractive",
        requiredTags: ["TITLE-I"],
        sourceMode: "discourse-managed",
      },
      {
        topic: "https://forum.example.com/t/sec.-10103.-later/751",
        commentsDisplay: "fullInteractive",
        requiredTags: ["TITLE-I"],
        sourceMode: "discourse-managed",
      },
    ]);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("import discovery supports natural-title ordering, exact category boundaries, and limits", async () => {
  const fetcher = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/categories.json") {
      return jsonResponse({
        category_list: {
          categories: [
            { id: 18, name: "Impact", slug: "impact" },
            { id: 21, name: "Child", slug: "child", parent_category_id: 18 },
          ],
        },
      });
    }
    if (pathname === "/c/impact/18.json") {
      return jsonResponse({
        topic_list: {
          topics: [
            topicListItem(10, "Sec. 10110. Ten", "2025-01-01T00:00:00Z", { tags: ["TITLE-I"] }),
            topicListItem(2, "Sec. 10102. Two", "2025-01-03T00:00:00Z", { tags: ["TITLE-I"] }),
            topicListItem(3, "Sec. 10103. Child", "2025-01-02T00:00:00Z", {
              categoryId: 21,
              tags: ["TITLE-I"],
            }),
          ],
        },
      });
    }
    return new Response("Not found", { status: 404, statusText: "Not Found" });
  };

  const result = await discoverDiscourseImports({
    docsDir: path.join(tmpdir(), "discussion-bridge-no-existing-directory"),
    discourseUrl: "https://forum.example.com",
    category: "Impact",
    tags: ["title-i"],
    order: "natural-title",
    limit: 1,
    fetch: fetcher,
  });

  assert.deepEqual(result.candidates.map((candidate) => candidate.topicId), [2]);
  assert.deepEqual(result.includedCategoryIds, [18]);
});

test("discovery manifest output is create-only and rejects an empty candidate set", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-discovery-manifest-"));
  const filePath = path.join(dir, "imports", "reviewed.json");
  try {
    const resolved = await writeImportDiscoveryManifest(filePath, {
      version: 1,
      imports: [{ topic: "https://forum.example.com/t/topic/21", sourceMode: "discourse-imported" }],
    });
    assert.equal(resolved, path.resolve(filePath));
    assert.match(await readFile(filePath, "utf8"), /"version": 1/);
    await assert.rejects(
      writeImportDiscoveryManifest(filePath, {
        version: 1,
        imports: [{ topic: "https://forum.example.com/t/topic/22" }],
      }),
      /already exists/i,
    );
    await assert.rejects(
      writeImportDiscoveryManifest(path.join(dir, "empty.json"), { version: 1, imports: [] }),
      /non-empty imports array/i,
    );
    await assert.rejects(
      writeImportDiscoveryManifest(path.join(dir, "invalid.json"), {
        version: 1,
        imports: [{ topic: "21", unsupported: true }],
      }),
      /unknown field.*unsupported/i,
    );
    const secretPath = path.join(dir, "not-created", "secret.json");
    await assert.rejects(
      writeImportDiscoveryManifest(secretPath, {
        version: 1,
        imports: [{ topic: "21" }],
        apiKey: "must-not-be-written",
      }),
      /unknown root field.*apiKey/i,
    );
    await assert.rejects(readFile(secretPath, "utf8"), /ENOENT/);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("import discovery rejects invalid runtime manifest options before network access", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return jsonResponse({});
  };
  const common = {
    docsDir: path.join(tmpdir(), "discussion-bridge-invalid-discovery-options"),
    discourseUrl: "https://forum.example.com",
    category: "guides",
    fetch: fetcher,
  };

  await assert.rejects(
    discoverDiscourseImports({ ...common, sourceMode: "astro-managed" }),
    /invalid discovery source mode.*astro-managed/i,
  );
  await assert.rejects(
    discoverDiscourseImports({ ...common, commentsDisplay: "everything" }),
    /invalid discovery comments display.*everything/i,
  );
  assert.equal(calls, 0);
});

test("validates titles before publishing to Discourse", () => {
  assert.deepEqual(validateDiscourseTopicTitle("DiscussionBridge for Astro"), []);
  assert.match(validateDiscourseTopicTitle("Beta")[0].reason, /too short/);
  assert.equal(validateDiscourseTopicTitle("aaaa bbbb cccc").some((issue) => /unclear/.test(issue.reason)), true);
});

test("import manifest preserves curated order and per-topic policies", () => {
  const manifest = validateImportManifest({
    version: 1,
    imports: [
      {
        topic: "https://forum.example.com/t/section-10102/747",
        commentsDisplay: "fullInteractive",
        sourceMode: "discourse-managed",
      },
      {
        topic: 751,
        commentsDisplay: "fullInteractive",
        heroImage: "../../../assets/hero.png",
        heroAlt: "Descriptive hero",
        output: "title-i/10103-impact.mdx",
        requiredTags: ["TITLE-I"],
      },
      {
        topic: "752",
        pruneProfiles: ["community-call-to-action"],
      },
    ],
  });

  assert.deepEqual(manifest.imports.map((entry) => entry.topic), [
    "https://forum.example.com/t/section-10102/747",
    "751",
    "752",
  ]);
  assert.equal(manifest.imports[0].sourceMode, "discourse-managed");
  assert.equal(manifest.imports[1].heroAlt, "Descriptive hero");
  assert.equal(manifest.imports[1].output, "title-i/10103-impact.mdx");
  assert.deepEqual(manifest.imports[1].requiredTags, ["TITLE-I"]);
  assert.deepEqual(manifest.imports[2].pruneProfiles, ["community-call-to-action"]);
});

test("import manifest writes an explicit output only when required tags match", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-manifest-output-"));
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/t/21.json") {
        return jsonResponse({
          id: 21,
          title: "Section 10101 Impact",
          tags: ["Impact", "TITLE-I"],
          post_stream: { posts: [{ id: 101, post_number: 1, topic_id: 21, topic_slug: "section-10101-impact", cooked: "" }] },
        });
      }
      if (pathname === "/posts/101.json") {
        return jsonResponse({ id: 101, post_number: 1, topic_id: 21, topic_slug: "section-10101-impact", raw: "Imported body", cooked: "" });
      }
      return new Response("Not found", { status: 404, statusText: "Not Found" });
    };

    const [result] = await importExistingDiscourseManifest({
      docsDir: dir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      manifest: {
        version: 1,
        imports: [{ topic: "21", output: "title-i/10101-impact.mdx", requiredTags: ["TITLE-I"] }],
      },
    });

    const expectedPath = path.join(dir, "title-i", "10101-impact.mdx");
    assert.equal(result.filePath, expectedPath);
    assert.match(await readFile(expectedPath, "utf8"), /Imported body/);

    await assert.rejects(
      importExistingDiscourseManifest({
        docsDir: dir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        dryRun: true,
        manifest: {
          version: 1,
          imports: [{ topic: "21", output: "title-ii/10101-impact.md", requiredTags: ["TITLE-II"] }],
        },
      }),
      /missing required import tag\(s\): TITLE-II/,
    );
    await assert.rejects(readFile(path.join(dir, "title-ii", "10101-impact.md"), "utf8"));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import manifest preserves source category drift through preview and atomic overwrite", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-manifest-category-drift-"));
  const output = "guides/source-mode.md";
  const targetPath = path.join(dir, output);
  const originalFetch = globalThis.fetch;
  let categoryId = 6;

  try {
    globalThis.fetch = async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/t/36.json") {
        return jsonResponse({
          id: 36,
          title: "How to Choose a DiscussionBridge Source Mode",
          category_id: categoryId,
          post_stream: {
            posts: [{
              id: 136,
              post_number: 1,
              topic_id: 36,
              topic_slug: "how-to-choose-a-discussion-bridge-source-mode",
              cooked: "",
            }],
          },
        });
      }
      if (pathname === "/posts/136.json") {
        return jsonResponse({
          id: 136,
          post_number: 1,
          topic_id: 36,
          topic_slug: "how-to-choose-a-discussion-bridge-source-mode",
          raw: "Choose one source of truth.",
          cooked: "",
        });
      }
      return new Response("Not found", { status: 404, statusText: "Not Found" });
    };

    const options = {
      docsDir: dir,
      siteUrl: "https://discussionbridge.dev",
      discourseUrl: "https://forum.discussionbridge.dev",
      apiKey: "test-key",
      apiUsername: "test-user",
      overwrite: true,
      manifest: {
        version: 1,
        imports: [{
          topic: "36",
          output,
          sourceMode: "discourse-managed",
          commentsDisplay: "fullInteractive",
        }],
      },
    };

    await importExistingDiscourseManifest(options);
    assert.match(await readFile(targetPath, "utf8"), /discussionSourceCategoryId: 6/);

    categoryId = 7;
    const [preview] = await importExistingDiscourseManifest({ ...options, dryRun: true });
    assert.equal(preview.status, "dry-run-overwrite");
    assert.equal(preview.filePath, targetPath);
    assert.equal(
      preview.reason,
      "source category changed: 6 -> 7; Astro route/navigation unchanged",
    );

    const [refreshed] = await importExistingDiscourseManifest(options);
    const source = await readFile(targetPath, "utf8");
    assert.equal(refreshed.filePath, targetPath);
    assert.equal(
      refreshed.reason,
      "source category changed: 6 -> 7; Astro route/navigation unchanged",
    );
    assert.match(source, /discussionSourceCategoryId: 7/);
    assert.match(source, /discussionSourceMode: "discourse-managed"/);
    assert.match(source, /discussionSync: false/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import manifest rejects duplicate topics and unsafe option shapes", () => {
  assert.throws(
    () => validateImportManifest({
      version: 1,
      apiKey: "must-not-live-here",
      imports: [{ topic: 747 }],
    }),
    /unknown root field.*apiKey/,
  );

  assert.throws(
    () => validateImportManifest({
      version: 1,
      imports: [
        { topic: "https://forum.example.com/t/section-10102/747" },
        { topic: 747 },
      ],
    }),
    /duplicate topic ID 747/,
  );

  assert.throws(
    () => validateImportManifest({
      version: 1,
      imports: [{ topic: 751, heroImage: "hero.png" }],
    }),
    /heroAlt is required/,
  );

  assert.throws(
    () => validateImportManifest({
      version: 1,
      imports: [{ topic: 752, pruneProfile: "community-call-to-action" }],
    }),
    /unknown field.*pruneProfile/,
  );

  assert.throws(
    () => validateImportManifest({
      version: 1,
      imports: [{ topic: 753, output: "../outside.md" }],
    }),
    /output must stay inside the docs directory/,
  );

  assert.throws(
    () => validateImportManifest({
      version: 1,
      imports: [{ topic: 754, requiredTags: ["TITLE-I", "title-i"] }],
    }),
    /requiredTags contains duplicates/,
  );

  assert.throws(
    () => validateImportManifest({
      version: 1,
      imports: [{ topic: 755, sourceMode: "astro-managed" }],
    }),
    /sourceMode must be discourse-imported or discourse-managed/,
  );
});

test("import manifest stages all entries before changing destination files", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-manifest-stage-"));
  const docsDir = path.join(dir, "docs");
  const existingPath = path.join(docsDir, "first-topic.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(existingPath, "existing content\n");
    globalThis.fetch = async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/t/21.json") {
        return jsonResponse({
          id: 21,
          title: "First Topic",
          post_stream: { posts: [{ id: 101, post_number: 1, topic_id: 21, topic_slug: "first-topic", cooked: "" }] },
        });
      }
      if (pathname === "/posts/101.json") {
        return jsonResponse({ id: 101, post_number: 1, topic_id: 21, topic_slug: "first-topic", raw: "replacement", cooked: "" });
      }
      if (pathname === "/t/22.json") {
        return jsonResponse({
          id: 22,
          title: "Second Topic",
          post_stream: { posts: [{ id: 102, post_number: 1, topic_id: 22, topic_slug: "second-topic", cooked: "" }] },
        });
      }
      if (pathname === "/posts/102.json") {
        return jsonResponse({ id: 102, post_number: 1, topic_id: 22, topic_slug: "second-topic", raw: "no matching footer", cooked: "" });
      }
      return new Response("Not found", { status: 404, statusText: "Not Found" });
    };

    await assert.rejects(
      importExistingDiscourseManifest({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        overwrite: true,
        manifest: validateImportManifest({
          version: 1,
          imports: [
            { topic: 21 },
            { topic: 22, pruneProfiles: ["community-call-to-action"] },
          ],
        }),
      }),
      /did not find a verified trailing block/,
    );

    assert.equal(await readFile(existingPath, "utf8"), "existing content\n");
    await assert.rejects(readFile(path.join(docsDir, "second-topic.md"), "utf8"));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import manifest runner revalidates runtime input and dry-run output collisions", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-manifest-collision-"));
  const originalFetch = globalThis.fetch;

  try {
    await assert.rejects(
      importExistingDiscourseManifest({
        docsDir: dir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        manifest: { version: 1, imports: [{ topic: "21" }], apiKey: "must-not-live-here" },
      }),
      /unknown root field.*apiKey/,
    );

    globalThis.fetch = async (url) => {
      const pathname = new URL(url).pathname;
      const topicId = pathname === "/t/21.json" ? 21 : pathname === "/t/22.json" ? 22 : undefined;
      if (topicId) {
        return jsonResponse({
          id: topicId,
          title: `Topic ${topicId}`,
          post_stream: {
            posts: [{ id: 100 + topicId, post_number: 1, topic_id: topicId, topic_slug: "same-slug", cooked: "" }],
          },
        });
      }
      return new Response("Not found", { status: 404, statusText: "Not Found" });
    };

    await assert.rejects(
      importExistingDiscourseManifest({
        docsDir: dir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        dryRun: true,
        manifest: { version: 1, imports: [{ topic: "21" }, { topic: "22" }] },
      }),
      /resolve to the same Astro file/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import manifest aborts when a topic slug changes after preview", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-manifest-slug-race-"));
  const originalFetch = globalThis.fetch;
  let topicReads = 0;

  try {
    globalThis.fetch = async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/t/21.json") {
        topicReads += 1;
        const slug = topicReads === 1 ? "preview-slug" : "staged-slug";
        return jsonResponse({
          id: 21,
          title: "Changing Topic",
          post_stream: { posts: [{ id: 101, post_number: 1, topic_id: 21, topic_slug: slug, cooked: "" }] },
        });
      }
      if (pathname === "/posts/101.json") {
        return jsonResponse({ id: 101, post_number: 1, topic_id: 21, topic_slug: "staged-slug", raw: "content", cooked: "" });
      }
      return new Response("Not found", { status: 404, statusText: "Not Found" });
    };

    await assert.rejects(
      importExistingDiscourseManifest({
        docsDir: dir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        manifest: { version: 1, imports: [{ topic: "21" }] },
      }),
      /different Astro file between preview and staging/,
    );
    await assert.rejects(readFile(path.join(dir, "preview-slug.md"), "utf8"));
    await assert.rejects(readFile(path.join(dir, "staged-slug.md"), "utf8"));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import-existing rejects an unsafe topic slug before writing", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-import-unsafe-slug-"));
  const docsDir = path.join(dir, "docs");
  const escapedPath = path.join(dir, "escaped.md");
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/t/21.json") {
        return jsonResponse({
          id: 21,
          title: "Unsafe Topic",
          post_stream: { posts: [{ id: 101, post_number: 1, topic_id: 21, topic_slug: "../escaped", cooked: "" }] },
        });
      }
      return new Response("Not found", { status: 404, statusText: "Not Found" });
    };

    await assert.rejects(
      importExistingDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        topics: ["21"],
      }),
      /unsafe Astro file path/,
    );
    await assert.rejects(readFile(escapedPath, "utf8"));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import manifest no-overwrite rechecks destinations at commit time", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-manifest-destination-race-"));
  const targetPath = path.join(dir, "stable-slug.md");
  const originalFetch = globalThis.fetch;
  let topicReads = 0;

  try {
    globalThis.fetch = async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/t/21.json") {
        topicReads += 1;
        if (topicReads === 2) await writeFile(targetPath, "appeared after preview\n");
        return jsonResponse({
          id: 21,
          title: "Stable Topic",
          post_stream: { posts: [{ id: 101, post_number: 1, topic_id: 21, topic_slug: "stable-slug", cooked: "" }] },
        });
      }
      if (pathname === "/posts/101.json") {
        return jsonResponse({ id: 101, post_number: 1, topic_id: 21, topic_slug: "stable-slug", raw: "content", cooked: "" });
      }
      return new Response("Not found", { status: 404, statusText: "Not Found" });
    };

    await assert.rejects(
      importExistingDiscourseManifest({
        docsDir: dir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        manifest: { version: 1, imports: [{ topic: "21" }] },
      }),
      /Destination appeared after manifest preview and overwrite is disabled/,
    );
    assert.equal(await readFile(targetPath, "utf8"), "appeared after preview\n");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import manifest preserves an empty destination when overwrite is disabled", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-manifest-empty-destination-"));
  const targetPath = path.join(dir, "stable-slug.md");
  const originalFetch = globalThis.fetch;
  let topicReads = 0;

  try {
    globalThis.fetch = async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/t/21.json") {
        topicReads += 1;
        if (topicReads === 2) await writeFile(targetPath, "");
        return jsonResponse({
          id: 21,
          title: "Stable Topic",
          post_stream: { posts: [{ id: 101, post_number: 1, topic_id: 21, topic_slug: "stable-slug", cooked: "" }] },
        });
      }
      if (pathname === "/posts/101.json") {
        return jsonResponse({ id: 101, post_number: 1, topic_id: 21, topic_slug: "stable-slug", raw: "content", cooked: "" });
      }
      return new Response("Not found", { status: 404, statusText: "Not Found" });
    };

    await assert.rejects(
      importExistingDiscourseManifest({
        docsDir: dir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        manifest: { version: 1, imports: [{ topic: "21" }] },
      }),
      /Destination appeared after manifest preview and overwrite is disabled/,
    );
    assert.equal(await readFile(targetPath, "utf8"), "");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("check-discourse discovers client settings and tag capabilities", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    globalThis.fetch = async (url, init = {}) => {
      const parsed = new URL(url);
      calls.push({ pathname: parsed.pathname, headers: init.headers });

      if (parsed.pathname === "/site/settings.json") {
        return jsonResponse({
          min_topic_title_length: 15,
          max_topic_title_length: 255,
          min_first_post_length: 20,
          min_post_length: 20,
          max_post_length: 32000,
          max_tags_per_topic: 5,
          max_tag_length: 20,
          tagging_enabled: true,
        });
      }

      if (parsed.pathname === "/site.json") {
        return jsonResponse({
          can_tag_topics: true,
          can_create_tag: true,
        });
      }

      if (parsed.pathname === "/categories.json") {
        return jsonResponse({
          category_list: {
            categories: [
              { id: 5, name: "DiscussionBridge for Astro", slug: "discussion-bridge-for-astro", read_restricted: false },
            ],
          },
        });
      }

      if (parsed.pathname === "/tags.json") {
        return jsonResponse({
          tags: [
            { id: 1, name: "discussionbridge", count: 2 },
            { id: 2, text: "blog", count: 1 },
          ],
        });
      }

      if (parsed.pathname === "/embed/info") {
        assert.equal(parsed.searchParams.get("embed_url"), "https://docs.example.com/blog/content-lanes/");
        return jsonResponse({
          topic_id: 27,
          topic_slug: "content-lanes-with-full-comments-in-discussion-bridge-for-astro",
        });
      }

      if (parsed.pathname === "/search/query") {
        return jsonResponse({
          topics: [{
            id: 27,
            slug: "content-lanes-with-full-comments-in-discussion-bridge-for-astro",
          }],
          posts: [{ id: 101, topic_id: 27 }],
        });
      }

      return new Response(`Unexpected request: ${parsed.pathname}`, { status: 500 });
    };

    const result = await checkDiscourse({
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      tags: ["discussionbridge", "blog"],
      pageUrl: "https://docs.example.com/blog/content-lanes/",
    });

    assert.equal(result.settingsAvailable, true);
    assert.equal(result.capabilitiesAvailable, true);
    assert.equal(result.limits.maxPostLength, 32000);
    assert.equal(result.limits.maxTagsPerTopic, 5);
    assert.equal(result.tagCapabilities.canTagTopics, true);
    assert.equal(result.category.name, "DiscussionBridge for Astro");
    assert.deepEqual(result.requestedTags.map((tag) => [tag.name, tag.exists]), [
      ["blog", true],
      ["discussionbridge", true],
    ]);
    assert.deepEqual(result.tagIssues, []);
    assert.deepEqual(result.setupIssues, []);
    assert.equal(result.reconciliation.topicId, 27);
    assert.equal(result.reconciliation.method, "embed-info");
    assert.equal(calls.some((call) => call.pathname === "/site/settings.json"), true);
    assert.equal(calls.some((call) => call.pathname === "/site.json"), true);
    assert.equal(calls.some((call) => call.pathname === "/categories.json"), true);
    assert.equal(calls.some((call) => call.pathname === "/tags.json"), true);
    assert.equal(calls.some((call) => call.pathname === "/embed/info"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("check-discourse can diagnose reconciliation through search fallback", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);

      if (parsed.pathname === "/site/settings.json") return jsonResponse({});
      if (parsed.pathname === "/site.json") return jsonResponse({});
      if (parsed.pathname === "/categories.json") return jsonResponse({});
      if (parsed.pathname === "/tags.json") return jsonResponse({});

      if (parsed.pathname === "/embed/info") {
        return new Response("Not found", { status: 404, statusText: "Not Found" });
      }

      if (parsed.pathname === "/search/query") {
        assert.equal(parsed.searchParams.get("term"), "https://docs.example.com/releases/2_1/");
        return jsonResponse({
          topics: [{ id: 24, slug: "release-lane-demo" }],
          posts: [{ id: 31, topic_id: 24 }],
        });
      }

      return new Response(`Unexpected request: ${parsed.pathname}`, { status: 500 });
    };

    const result = await checkDiscourse({
      discourseUrl: "https://forum.example.com",
      pageUrl: "https://docs.example.com/releases/2_1/",
    });

    assert.equal(result.reconciliation.embedInfoAvailable, false);
    assert.match(result.reconciliation.embedInfoError, /404/);
    assert.equal(result.reconciliation.searchAvailable, true);
    assert.equal(result.reconciliation.topicId, 24);
    assert.equal(result.reconciliation.method, "search");
    assert.deepEqual(result.reconciliation.candidateTopicIds, [24]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("check-discourse reports category and tag setup issues", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);

      if (parsed.pathname === "/site/settings.json") {
        return jsonResponse({
          tagging_enabled: true,
          max_tags_per_topic: 5,
          max_tag_length: 20,
        });
      }

      if (parsed.pathname === "/site.json") {
        return jsonResponse({
          can_tag_topics: true,
          can_create_tag: false,
        });
      }

      if (parsed.pathname === "/categories.json") {
        return jsonResponse({
          category_list: {
            categories: [{ id: 5, name: "DiscussionBridge for Astro" }],
          },
        });
      }

      if (parsed.pathname === "/tags.json") {
        return jsonResponse({
          tags: [{ name: "discussionbridge", count: 2 }],
        });
      }

      return new Response(`Unexpected request: ${parsed.pathname}`, { status: 500 });
    };

    const result = await checkDiscourse({
      discourseUrl: "https://forum.example.com",
      categoryId: 9,
      tags: ["discussionbridge", "release-lane"],
    });

    assert.equal(result.category, undefined);
    assert.deepEqual(result.requestedTags.map((tag) => [tag.name, tag.exists]), [
      ["discussionbridge", true],
      ["release-lane", false],
    ]);
    assert.match(result.setupIssues.join("\n"), /Category 9 was not found/);
    assert.match(result.setupIssues.join("\n"), /release-lane/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("check-discourse falls back to configured limits when site settings are unavailable", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/site/settings.json" || parsed.pathname === "/site.json") {
        return new Response("Forbidden", { status: 403, statusText: "Forbidden" });
      }
      if (parsed.pathname === "/categories.json" || parsed.pathname === "/tags.json") {
        return new Response("Forbidden", { status: 403, statusText: "Forbidden" });
      }
      return new Response(`Unexpected request: ${parsed.pathname}`, { status: 500 });
    };

    const result = await checkDiscourse({
      discourseUrl: "https://forum.example.com",
      configuredLimits: {
        maxTagsPerTopic: 1,
        maxTagLength: 5,
      },
      tags: ["discussionbridge", "blog"],
    });

    assert.equal(result.settingsAvailable, false);
    assert.match(result.settingsError, /403/);
    assert.equal(result.capabilitiesAvailable, false);
    assert.equal(result.limits.maxTagsPerTopic, 1);
    assert.equal(result.limits.maxTagLength, 5);
    assert.equal(result.tagIssues.length, 2);
    assert.match(result.tagIssues.join("\n"), /Too many tags/);
    assert.match(result.tagIssues.join("\n"), /discussionbridge/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Discourse client reports network failures with method and endpoint", async () => {
  const discourse = createDiscourseClient({
    discourseUrl: "https://forum.example.com",
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  });

  await assert.rejects(
    discourse.topic(21),
    /Discourse request failed: network error during GET https:\/\/forum\.example\.com\/t\/21\.json\. fetch failed/,
  );
});

test("publish-new title preflight fails before network writes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-title-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "beta.md");
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "Beta"',
        "---",
        "",
        "# Beta",
        "",
        "Short page title.",
      ].join("\n"),
    );
    globalThis.fetch = mockDiscourseFetch(calls, {
      topic: {
        id: 21,
        title: "Beta",
        category_id: 5,
        visible: true,
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
      createdTopic: {
        topic_id: 22,
        topic_slug: "beta",
      },
    });

    await assert.rejects(
      syncDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        categoryId: 5,
        mode: "publish-new",
      }),
      /Discourse preflight failed/,
    );

    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("publish-new reports Discourse offline failures clearly", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-publish-offline-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "offline.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Offline Publish"',
        "---",
        "",
        "# Offline Publish",
        "",
        "The forum is unavailable during publishing.",
      ].join("\n"),
    );

    globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };

    await assert.rejects(
      syncDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        categoryId: 5,
        mode: "publish-new",
      }),
      /Discourse request failed: network error during POST https:\/\/forum\.example\.com\/posts\.json\. fetch failed/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("publish failures can notify recipients by Discourse private message", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-notify-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "beta.md");
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "Beta"',
        "---",
        "",
        "# Beta",
        "",
        "Short page title.",
      ].join("\n"),
    );
    globalThis.fetch = mockDiscourseFetch(calls, {
      topic: {
        id: 21,
        title: "Beta",
        category_id: 5,
        visible: true,
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
      createdTopic: {
        topic_id: 22,
        topic_slug: "beta",
      },
    });

    await assert.rejects(
      syncDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        categoryId: 5,
        mode: "publish-new",
        notifyOnFailure: {
          enabled: true,
          recipients: ["forum-admin"],
        },
      }),
      /Discourse preflight failed/,
    );

    const pmCall = calls.find((call) => call.pathname === "/posts.json" && call.body?.archetype === "private_message");
    assert.equal(pmCall.body.target_recipients, "forum-admin");
    assert.match(pmCall.body.raw, /Discourse preflight failed/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("notification failure does not mask the original publish failure", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-notify-fail-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "beta.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "Beta"',
        "---",
        "",
        "# Beta",
        "",
        "Short page title.",
      ].join("\n"),
    );
    globalThis.fetch = async () => new Response("PM rejected", { status: 403, statusText: "Forbidden" });

    await assert.rejects(
      syncDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        categoryId: 5,
        mode: "publish-new",
        notifyOnFailure: {
          enabled: true,
          recipients: ["forum-admin"],
        },
      }),
      /Discourse preflight failed/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("preflight validates configured title, body, and tag limits before network writes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-limits-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "limits.md");
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: This Title Is Too Long"',
        'discussionTags: "discussionbridge, starlight-demo, blog, excessive-tag"',
        "---",
        "",
        "# DiscussionBridge for Astro: This Title Is Too Long",
        "",
        "This body deliberately exceeds the configured test limit.",
      ].join("\n"),
    );
    globalThis.fetch = mockDiscourseFetch(calls, {
      topic: {
        id: 21,
        title: "DiscussionBridge for Astro: This Title Is Too Long",
        category_id: 5,
        visible: true,
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
      createdTopic: {
        topic_id: 22,
        topic_slug: "limits",
      },
    });

    await assert.rejects(
      syncDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        categoryId: 5,
        mode: "publish-new",
        preflightLimits: {
          maxTopicTitleLength: 32,
          maxPostLength: 20,
          maxTagsPerTopic: 3,
          maxTagLength: 12,
        },
      }),
      (error) => {
        assert.match(error.message, /Title is too long/);
        assert.match(error.message, /Companion post body is too long/);
        assert.match(error.message, /Too many tags/);
        assert.match(error.message, /Tag "discussionbridge" is too long/);
        assert.match(error.message, /Tag "starlight-demo" is too long/);
        return true;
      },
    );

    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("preflight rejects duplicate managed topic IDs in one sync run", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-duplicate-topic-"));
  const docsDir = path.join(dir, "docs");
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      path.join(docsDir, "simple.md"),
      [
        "---",
        'title: "Simple Comments Mode"',
        "discourseTopicId: 27",
        'discourseTopicUrl: "https://forum.example.com/t/content-lanes/27"',
        "---",
        "",
        "Simple mode renders Discourse comments.",
      ].join("\n"),
    );
    await writeFile(
      path.join(docsDir, "full.md"),
      [
        "---",
        'title: "Full Comments Mode"',
        "discourseTopicId: 27",
        'discourseTopicUrl: "https://forum.example.com/t/content-lanes/27"',
        "---",
        "",
        "Full mode renders Discourse replies.",
      ].join("\n"),
    );

    globalThis.fetch = async (...args) => {
      calls.push(args);
      throw new Error("unexpected network call");
    };

    await assert.rejects(
      syncDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        categoryId: 5,
        mode: "sync-existing",
      }),
      (error) => {
        assert.equal(error.message.match(/Multiple managed pages in this run use the same Discourse topic ID \(27\)/g)?.length, 1);
        assert.match(error.message, /simple\.md/);
        assert.match(error.message, /full\.md/);
        return true;
      },
    );

    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("discussionSync false makes linked display pages non-managing", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-display-only-"));
  const docsDir = path.join(dir, "docs");
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      path.join(docsDir, "managed.md"),
      [
        "---",
        'title: "Managed Comments Mode"',
        "discourseTopicId: 27",
        'discourseTopicUrl: "https://forum.example.com/t/content-lanes/27"',
        "---",
        "",
        "This page owns the companion summary.",
      ].join("\n"),
    );
    await writeFile(
      path.join(docsDir, "display-only.md"),
      [
        "---",
        'title: "Display Only Comments Mode"',
        "discourseTopicId: 27",
        'discourseTopicUrl: "https://forum.example.com/t/content-lanes/27"',
        "discussionSync: false",
        "---",
        "",
        "This page renders the same discussion without managing it.",
      ].join("\n"),
    );

    globalThis.fetch = async (...args) => {
      calls.push(args);
      throw new Error("unexpected network call");
    };

    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      mode: "sync-existing",
      dryRun: true,
    });

    assert.equal(calls.length, 0);
    assert.equal(results.length, 2);
    assert.equal(results.find((result) => result.filePath.endsWith("managed.md"))?.status, "dry-run-update");
    assert.equal(results.find((result) => result.filePath.endsWith("display-only.md"))?.status, "skipped");
    assert.equal(results.find((result) => result.filePath.endsWith("display-only.md"))?.reason, "discussionSync is false");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("discussionSync false is enforced for CRLF frontmatter", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-crlf-guard-"));
  const docsDir = path.join(dir, "docs");
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      path.join(docsDir, "display-only.mdx"),
      [
        "---",
        'title: "CRLF Display Only Page"',
        "discourseTopicId: 434",
        'discourseTopicUrl: "https://forum.example.com/t/existing-topic/434"',
        "discussionSync: false",
        "---",
        "",
        "# CRLF Display Only Page",
      ].join("\r\n"),
    );

    globalThis.fetch = async (...args) => {
      calls.push(args);
      throw new Error("unexpected network call");
    };

    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      mode: "sync-existing",
      dryRun: true,
    });

    assert.equal(calls.length, 0);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "skipped");
    assert.equal(results[0].reason, "discussionSync is false");
    assert.equal(results[0].topicId, 434);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("sync updates preserve CRLF frontmatter line endings", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-crlf-update-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "managed.mdx");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "CRLF Managed Page"',
        "discourseTopicId: 21",
        'discourseTopicUrl: "https://forum.example.com/t/crlf-managed-page/21"',
        "---",
        "",
        "# CRLF Managed Page",
        "",
        "The source body changed.",
      ].join("\r\n"),
    );

    const calls = [];
    globalThis.fetch = mockDiscourseFetch(calls, {
      topic: {
        id: 21,
        title: "CRLF Managed Page",
        category_id: 5,
        visible: true,
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
    });

    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      mode: "sync-existing",
    });

    const updatedSource = await readFile(filePath, "utf8");
    assert.equal(results[0].status, "updated");
    assert.match(updatedSource, /discussionSourceHash: "[a-f0-9]{64}"/);
    assert.doesNotMatch(updatedSource, /(?<!\r)\n/);
    assert.doesNotMatch(updatedSource, /\r\n\r\n---/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("sync-existing can update topic metadata and unlist when source content is unchanged", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-sync-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "index.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Starlight Demo"',
        "discourseTopicId: 21",
        'discourseTopicUrl: "https://forum.example.com/t/discussionbridge-starlight-demo/21"',
        "---",
        "",
        "# DiscussionBridge for Astro: Starlight Demo",
        "",
        "The source body stays stable.",
      ].join("\n"),
    );

    const firstCalls = [];
    globalThis.fetch = mockDiscourseFetch(firstCalls, {
      topic: {
        id: 21,
        title: "DiscussionBridge for Astro: Starlight Demo",
        category_id: 5,
        visible: false,
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
    });

    await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      mode: "sync-existing",
      unlistSyncedTopics: true,
    });

    assert.equal(firstCalls.filter((call) => call.pathname === "/posts/101.json").length, 1);
    const syncedSource = await readFile(filePath, "utf8");
    assert.match(syncedSource, /discussionSourceHash: "[a-f0-9]{64}"/);

    const secondCalls = [];
    globalThis.fetch = mockDiscourseFetch(secondCalls, {
      topic: {
        id: 21,
        title: "Old Topic Title",
        category_id: 4,
        visible: true,
        tags: [
          { id: 1, name: "discussionbridge", slug: "discussionbridge" },
          { id: 2, name: "old-tag", slug: "old-tag" },
        ],
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
      updatedTopic: {
        basic_topic: {
          id: 21,
          title: "DiscussionBridge for Astro: Starlight Demo",
          category_id: 5,
          slug: "discussion-bridge-for-astro-starlight-demo",
        },
        tags: [
          { id: 1, name: "discussionbridge", slug: "discussionbridge" },
          { id: 3, name: "astro", slug: "astro" },
        ],
      },
    });

    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      tags: ["discussionbridge", "astro"],
      mode: "sync-existing",
      unlistSyncedTopics: true,
    });

    assert.equal(results[0].status, "updated");
    assert.equal(results[0].reason, "topic metadata updated; topic tags updated; topic unlisted; topic URL refreshed");
    assert.equal(results[0].topicUrl, "https://forum.example.com/t/discussion-bridge-for-astro-starlight-demo/21");
    assert.equal(secondCalls.some((call) => call.pathname === "/posts/101.json"), false);
    const topicUpdateCall = secondCalls.find((call) => call.pathname === "/t/-/21.json" && call.method === "PUT");
    assert.ok(topicUpdateCall);
    assert.deepEqual(topicUpdateCall.body.tags, [{ name: "discussionbridge" }, { name: "astro" }]);
    assert.equal(secondCalls.some((call) => call.pathname === "/t/21/status.json" && call.method === "PUT"), true);
    const refreshedSource = await readFile(filePath, "utf8");
    assert.notEqual(refreshedSource, syncedSource);
    assert.match(
      refreshedSource,
      /discourseTopicUrl: "https:\/\/forum\.example\.com\/t\/discussion-bridge-for-astro-starlight-demo\/21"/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("sync-existing force updates the managed first post even when source hash is unchanged", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-force-sync-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "index.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Force Sync"',
        "discourseTopicId: 21",
        'discourseTopicUrl: "https://forum.example.com/t/force-sync/21"',
        "---",
        "",
        "# Force Sync",
        "",
        "The source body is stable but the companion template changed.",
      ].join("\n"),
    );

    const seedCalls = [];
    globalThis.fetch = mockDiscourseFetch(seedCalls, {
      topic: {
        id: 21,
        title: "DiscussionBridge for Astro: Force Sync",
        category_id: 5,
        visible: true,
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
    });

    await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      mode: "sync-existing",
    });
    const syncedSource = await readFile(filePath, "utf8");

    const dryRunResults = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      mode: "sync-existing",
      dryRun: true,
      forceSync: true,
    });
    assert.equal(dryRunResults[0].status, "dry-run-update");
    assert.equal(dryRunResults[0].reason, "force sync requested");

    const forceCalls = [];
    globalThis.fetch = mockDiscourseFetch(forceCalls, {
      topic: {
        id: 21,
        title: "DiscussionBridge for Astro: Force Sync",
        category_id: 5,
        visible: true,
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
    });

    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      mode: "sync-existing",
      forceSync: true,
    });

    assert.equal(results[0].status, "updated");
    assert.equal(results[0].reason, "first post rewritten by force sync");
    const updateCall = forceCalls.find((call) => call.pathname === "/posts/101.json" && call.method === "PUT");
    assert.ok(updateCall);
    assert.match(updateCall.body.post.raw, /^# Force Sync/);
    assert.match(updateCall.body.post.raw, /\[Read the source article\]\(https:\/\/docs\.example\.com\/index\/\)/);
    assert.match(updateCall.body.post.raw, /Last synced from Astro: /);
    assert.doesNotMatch(updateCall.body.post.raw, /Last synced from Astro: \d{4}-\d{2}-\d{2}T/);
    assert.doesNotMatch(updateCall.body.post.raw, /Source content:/);
    assert.notEqual(await readFile(filePath, "utf8"), syncedSource);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("sync-existing treats an Astro title change as source-of-truth drift", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-astro-title-drift-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "index.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Updated Title"',
        "discourseTopicId: 21",
        'discourseTopicUrl: "https://forum.example.com/t/original-title/21"',
        'discussionSourceHash: "old-hash"',
        "---",
        "",
        "The source body did not need a heading to make the title drift matter.",
      ].join("\n"),
    );

    const calls = [];
    globalThis.fetch = mockDiscourseFetch(calls, {
      topic: {
        id: 21,
        title: "DiscussionBridge for Astro: Original Title",
        slug: "original-title",
        category_id: 5,
        visible: true,
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
      updatedTopic: {
        basic_topic: {
          id: 21,
          title: "DiscussionBridge for Astro: Updated Title",
          category_id: 5,
          slug: "updated-title",
        },
      },
    });

    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      mode: "sync-existing",
    });

    assert.equal(results[0].status, "updated");
    assert.equal(results[0].reason, "first post rewritten; topic metadata updated; topic URL refreshed");

    const postUpdateCall = calls.find((call) => call.pathname === "/posts/101.json" && call.method === "PUT");
    assert.ok(postUpdateCall);
    assert.match(postUpdateCall.body.post.raw, /The source body did not need a heading/);

    const topicUpdateCall = calls.find((call) => call.pathname === "/t/-/21.json" && call.method === "PUT");
    assert.equal(topicUpdateCall.body.title, "DiscussionBridge for Astro: Updated Title");

    const syncedSource = await readFile(filePath, "utf8");
    assert.match(syncedSource, /discourseTopicUrl: "https:\/\/forum\.example\.com\/t\/updated-title\/21"/);
    assert.match(syncedSource, /discussionSourceHash: "[a-f0-9]{64}"/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("sync-existing corrects manual Discourse topic title drift by topic ID", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-discourse-title-drift-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "index.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Canonical Astro Title"',
        "discourseTopicId: 21",
        'discourseTopicUrl: "https://forum.example.com/t/old-title/21"',
        "---",
        "",
        "# Canonical Astro Title",
        "",
        "Stable source content.",
      ].join("\n"),
    );

    const seedCalls = [];
    globalThis.fetch = mockDiscourseFetch(seedCalls, {
      topic: {
        id: 21,
        title: "DiscussionBridge for Astro: Canonical Astro Title",
        slug: "canonical-astro-title",
        category_id: 5,
        visible: true,
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
    });

    await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      mode: "sync-existing",
    });

    const afterSeed = await readFile(filePath, "utf8");
    const driftCalls = [];
    globalThis.fetch = mockDiscourseFetch(driftCalls, {
      topic: {
        id: 21,
        title: "Manual Discourse Title Drift",
        slug: "manual-discourse-title-drift",
        category_id: 5,
        visible: true,
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
      updatedTopic: {
        basic_topic: {
          id: 21,
          title: "DiscussionBridge for Astro: Canonical Astro Title",
          category_id: 5,
          slug: "canonical-astro-title",
        },
      },
    });

    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      mode: "sync-existing",
    });

    assert.equal(results[0].status, "updated");
    assert.equal(results[0].reason, "topic metadata updated");
    assert.equal(results[0].topicId, 21);
    assert.equal(results[0].topicUrl, "https://forum.example.com/t/canonical-astro-title/21");
    assert.equal(driftCalls.some((call) => call.pathname === "/posts/101.json" && call.method === "PUT"), false);

    const topicUpdateCall = driftCalls.find((call) => call.pathname === "/t/-/21.json" && call.method === "PUT");
    assert.equal(topicUpdateCall.body.title, "DiscussionBridge for Astro: Canonical Astro Title");
    assert.equal(await readFile(filePath, "utf8"), afterSeed);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("sync-existing reports a clear recovery error when a linked topic cannot be read", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-missing-topic-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "index.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Missing Linked Topic"',
        "discourseTopicId: 21",
        'discourseTopicUrl: "https://forum.example.com/t/missing-linked-topic/21"',
        'discussionSourceHash: "old-hash"',
        "---",
        "",
        "# Missing Linked Topic",
        "",
        "The Astro source changed, but the linked Discourse topic is gone.",
      ].join("\n"),
    );

    globalThis.fetch = async (url, init = {}) => {
      const parsed = new URL(url);
      const method = init.method ?? "GET";

      if (method === "GET" && parsed.pathname === "/t/21.json") {
        return new Response("Not found", { status: 404, statusText: "Not Found" });
      }

      return new Response(`Unexpected request: ${method} ${parsed.pathname}`, { status: 500 });
    };

    await assert.rejects(
      syncDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        categoryId: 5,
        mode: "sync-existing",
      }),
      (error) => {
        assert.match(error.message, /Could not read linked Discourse topic 21/);
        assert.match(error.message, /may have been deleted/);
        assert.match(error.message, /https:\/\/docs\.example\.com\/index\//);
        assert.match(error.message, /404 Not Found/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("sync-existing reports a clear recovery error when a linked topic has no first post", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-missing-first-post-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "index.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Missing First Post"',
        "discourseTopicId: 21",
        'discourseTopicUrl: "https://forum.example.com/t/missing-first-post/21"',
        'discussionSourceHash: "old-hash"',
        "---",
        "",
        "# Missing First Post",
        "",
        "The Astro source changed, but the linked Discourse topic has no editable first post.",
      ].join("\n"),
    );

    globalThis.fetch = mockDiscourseFetch([], {
      topic: {
        id: 21,
        title: "DiscussionBridge for Astro: Missing First Post",
        category_id: 5,
        visible: true,
        post_stream: { posts: [{ id: 102, post_number: 2 }] },
      },
    });

    await assert.rejects(
      syncDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        categoryId: 5,
        mode: "sync-existing",
      }),
      /Could not find first post for linked Discourse topic 21.*manual repair/s,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("sync-existing fails when Discourse accepts a topic title update without changing it", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-title-noop-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "index.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "New Topic Title That Should Stick"',
        "discourseTopicId: 21",
        'discourseTopicUrl: "https://forum.example.com/t/old-topic-title/21"',
        'discussionSourceHash: "old-hash"',
        "---",
        "",
        "# New Topic Title That Should Stick",
        "",
        "Stable content.",
      ].join("\n"),
    );

    globalThis.fetch = mockDiscourseFetch([], {
      topic: {
        id: 21,
        title: "Old Topic Title",
        category_id: 5,
        visible: true,
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
      updatedTopic: {
        basic_topic: {
          id: 21,
          title: "Old Topic Title",
        },
      },
    });

    await assert.rejects(
      syncDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        categoryId: 5,
        mode: "sync-existing",
      }),
      /Topic title update was accepted by Discourse but did not change topic 21/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("sync-existing fails when Discourse accepts a tag update without changing tags", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-tag-noop-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "index.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Tag Drift Test"',
        "discourseTopicId: 21",
        'discourseTopicUrl: "https://forum.example.com/t/tag-drift-test/21"',
        'discussionSourceHash: "old-hash"',
        "---",
        "",
        "# DiscussionBridge for Astro: Tag Drift Test",
        "",
        "Stable content.",
      ].join("\n"),
    );

    globalThis.fetch = mockDiscourseFetch([], {
      topic: {
        id: 21,
        title: "DiscussionBridge for Astro: Tag Drift Test",
        category_id: 5,
        visible: true,
        tags: [{ id: 1, name: "old-tag", slug: "old-tag" }],
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
      updatedTopic: {
        basic_topic: {
          id: 21,
          title: "DiscussionBridge for Astro: Tag Drift Test",
          category_id: 5,
          slug: "tag-drift-test",
        },
        tags: [{ id: 1, name: "old-tag", slug: "old-tag" }],
      },
    });

    await assert.rejects(
      syncDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        categoryId: 5,
        tags: ["discussionbridge", "blog"],
        mode: "sync-existing",
      }),
      /Topic tags update was accepted by Discourse but did not change topic 21/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("sync-existing dry run reports source hash changes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "adb-dry-run-reason-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "index.md");

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Changed Title"',
        "discourseTopicId: 21",
        'discourseTopicUrl: "https://forum.example.com/t/old-title/21"',
        'discussionSourceHash: "old-hash"',
        "---",
        "",
        "# Changed Title",
        "",
        "The source body changed.",
      ].join("\n"),
    );

    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      mode: "sync-existing",
      dryRun: true,
    });

    assert.equal(results[0].status, "dry-run-update");
    assert.equal(results[0].reason, "source hash changed");
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("publish-and-sync updates linked pages and creates missing companion topics", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-publish-sync-"));
  const docsDir = path.join(dir, "docs");
  const existingPath = path.join(docsDir, "existing.md");
  const newPath = path.join(docsDir, "new-page.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      existingPath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Existing Page"',
        "discourseTopicId: 21",
        'discourseTopicUrl: "https://forum.example.com/t/existing-page/21"',
        "---",
        "",
        "# Existing Page",
        "",
        "Existing source changed.",
      ].join("\n"),
    );
    await writeFile(
      newPath,
      [
        "---",
        'title: "DiscussionBridge for Astro: New Page"',
        "---",
        "",
        "# New Page",
        "",
        "New source needs a companion topic.",
      ].join("\n"),
    );

    const calls = [];
    globalThis.fetch = mockDiscourseFetch(calls, {
      topic: {
        id: 21,
        title: "DiscussionBridge for Astro: Existing Page",
        category_id: 5,
        visible: false,
        tags: [
          { id: 1, name: "discussionbridge", slug: "discussionbridge" },
          { id: 2, name: "astro", slug: "astro" },
        ],
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
      createdTopic: {
        topic_id: 22,
        topic_slug: "discussion-bridge-for-astro-new-page",
      },
    });

    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      tags: ["discussionbridge", "astro"],
      mode: "publish-and-sync",
    });

    const existingResult = results.find((result) => result.filePath === existingPath);
    const newResult = results.find((result) => result.filePath === newPath);

    assert.equal(existingResult?.status, "updated");
    assert.equal(newResult?.status, "created");
    assert.equal(calls.some((call) => call.pathname === "/posts/101.json" && call.method === "PUT"), true);
    assert.equal(calls.some((call) => call.pathname === "/posts.json" && call.method === "POST"), true);

    const newSource = await readFile(newPath, "utf8");
    assert.match(newSource, /discourseTopicId: 22/);
    assert.match(newSource, /discourseTopicUrl: "https:\/\/forum\.example\.com\/t\/discussion-bridge-for-astro-new-page\/22"/);
    assert.match(newSource, /discussionSourceHash: "[a-f0-9]{64}"/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("publish-new reconciles an existing Discourse embed topic when embed info is unavailable", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-embed-reconcile-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "release.md");
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Release Lane Reconcile"',
        "---",
        "",
        "# Release Lane Reconcile",
        "",
        "This page was first seen by Discourse embedding before the CLI published it.",
      ].join("\n"),
    );

    globalThis.fetch = async (url, init = {}) => {
      const parsed = new URL(url);
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ pathname: parsed.pathname, search: parsed.search, method, body });

      if (method === "POST" && parsed.pathname === "/posts.json") {
        return new Response(JSON.stringify({
          action: "create_post",
          errors: ["Title has already been used"],
        }), {
          status: 422,
          statusText: "Unprocessable Entity",
          headers: { "Content-Type": "application/json" },
        });
      }

      if (method === "GET" && parsed.pathname === "/embed/info") {
        assert.equal(
          parsed.searchParams.get("embed_url"),
          "https://docs.example.com/releases/release/",
        );
        return new Response("Not found", { status: 404, statusText: "Not Found" });
      }

      if (method === "GET" && parsed.pathname === "/search/query") {
        assert.equal(
          parsed.searchParams.get("term"),
          "https://docs.example.com/releases/release/",
        );
        return jsonResponse({
          topics: [{
            id: 24,
            title: "DiscussionBridge for Astro: Release Lane Reconcile",
            slug: "discussion-bridge-for-astro-release-lane-reconcile",
          }],
          posts: [{ id: 501, topic_id: 24 }],
        });
      }

      if (method === "GET" && parsed.pathname === "/t/24.json") {
        return jsonResponse({
          id: 24,
          title: "Old Embedded Title",
          slug: "old-embedded-title",
          category_id: 1,
          visible: true,
          tags: [{ name: "old-tag" }],
          post_stream: {
            posts: [{
              id: 501,
              name: "",
              username: "discussbridge-bot",
              avatar_template: "",
              created_at: new Date(0).toISOString(),
              cooked: "",
              post_number: 1,
              post_type: 1,
              updated_at: new Date(0).toISOString(),
              reply_count: 0,
              reply_to_post_number: null,
              quote_count: 0,
              incoming_link_count: 0,
              reads: 0,
              readers_count: 0,
              score: 0,
              topic_id: 24,
              topic_slug: "old-embedded-title",
            }],
          },
        });
      }

      if (method === "PUT" && parsed.pathname === "/posts/501.json") {
        assert.match(body.post.raw, /This page was first seen by Discourse embedding/);
        assert.match(body.post.raw, /Read the source article/);
        return jsonResponse({ post: { id: 501, post_number: 1 } });
      }

      if (method === "PUT" && parsed.pathname === "/t/-/24.json") {
        assert.equal(body.title, "DiscussionBridge for Astro: Release Lane Reconcile");
        assert.equal(body.category_id, 5);
        assert.deepEqual(body.tags, [{ name: "discussionbridge" }, { name: "releases" }]);
        return jsonResponse({
          basic_topic: {
            id: 24,
            title: body.title,
            slug: "discussion-bridge-for-astro-release-lane-reconcile",
            category_id: body.category_id,
          },
          tags: body.tags,
        });
      }

      return new Response(`Unexpected request: ${method} ${parsed.pathname}`, { status: 500 });
    };

    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      routeBase: "releases",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      tags: ["discussionbridge", "releases"],
      mode: "publish-new",
    });

    assert.equal(results[0].status, "updated");
    assert.equal(results[0].topicId, 24);
    assert.equal(results[0].reason, "reconciled existing embedded topic");
    assert.equal(calls.some((call) => call.pathname === "/embed/info"), true);
    assert.equal(calls.some((call) => call.pathname === "/search/query"), true);
    assert.equal(calls.some((call) => call.pathname === "/posts/501.json" && call.method === "PUT"), true);

    const syncedSource = await readFile(filePath, "utf8");
    assert.match(syncedSource, /discourseTopicId: 24/);
    assert.match(syncedSource, /discourseTopicUrl: "https:\/\/forum\.example\.com\/t\/discussion-bridge-for-astro-release-lane-reconcile\/24"/);
    assert.match(syncedSource, /discussionSourceHash: "[a-f0-9]{64}"/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("multi-target retry reconciles an ambiguous create into the active target binding", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-target-reconcile-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "shared.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "Ambiguous Create Recovery for Regional Forum"',
        'discussionTargets: "community,regional"',
        'discussionPublishTargets: "community,regional"',
        'discussionTargetBindings: "{\\"community\\":{\\"topicId\\":101,\\"topicUrl\\":\\"https://community.example.com/t/shared/101\\",\\"status\\":\\"synced\\"},\\"regional\\":{\\"status\\":\\"failed\\",\\"lastError\\":\\"network timeout\\"}}"',
        "---",
        "",
        "# Ambiguous Create Recovery",
        "",
        "The first regional request may have reached Discourse before the client timed out.",
      ].join("\n"),
    );

    globalThis.fetch = async (url, init = {}) => {
      const parsed = new URL(url);
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;

      if (method === "POST" && parsed.pathname === "/posts.json") {
        return new Response(JSON.stringify({
          action: "create_post",
          errors: ["Embed url has already been taken"],
        }), {
          status: 422,
          statusText: "Unprocessable Entity",
          headers: { "Content-Type": "application/json" },
        });
      }

      if (method === "GET" && parsed.pathname === "/embed/info") {
        return jsonResponse({ topic_id: 909, topic_slug: "ambiguous-create-recovery" });
      }

      if (method === "GET" && parsed.pathname === "/t/909.json") {
        return jsonResponse({
          id: 909,
          title: "Ambiguous Create Recovery for Regional Forum",
          slug: "ambiguous-create-recovery",
          category_id: 5,
          visible: true,
          post_stream: {
            posts: [{
              id: 1909,
              name: "",
              username: "bridge-bot",
              avatar_template: "",
              created_at: new Date(0).toISOString(),
              cooked: "",
              post_number: 1,
              post_type: 1,
              updated_at: new Date(0).toISOString(),
              reply_count: 0,
              reply_to_post_number: null,
              quote_count: 0,
              incoming_link_count: 0,
              reads: 0,
              readers_count: 0,
              score: 0,
              topic_id: 909,
              topic_slug: "ambiguous-create-recovery",
            }],
          },
        });
      }

      if (method === "PUT" && parsed.pathname === "/posts/1909.json") {
        assert.match(body.post.raw, /first regional request may have reached Discourse/);
        return jsonResponse({ post: { id: 1909, post_number: 1 } });
      }

      return new Response(`Unexpected request: ${method} ${parsed.pathname}`, { status: 500 });
    };

    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      targetName: "regional",
      discourseUrl: "https://regional.example.com",
      apiKey: "regional-key",
      apiUsername: "bridge-bot",
      categoryId: 5,
      mode: "publish-new",
    });

    assert.equal(results[0].status, "updated");
    assert.equal(results[0].topicId, 909);
    assert.equal(results[0].reason, "reconciled existing embedded topic");
    const bindings = targetBindingsFromSource(await readFile(filePath, "utf8"));
    assert.equal(bindings.community.topicId, 101);
    assert.equal(bindings.regional.topicId, 909);
    assert.equal(bindings.regional.status, "synced");
    assert.equal(bindings.regional.lastError, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("frontmatter can override lane category, tags, visibility, and failure recipients", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-overrides-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "release.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Release Lane"',
        "discussionCategoryId: 18",
        'discussionTags: "releases, launchlight"',
        "discussionUnlisted: true",
        'discussionNotifyRecipients: "forum-admin,ops-bot"',
        "---",
        "",
        "# Release Lane",
        "",
        "A release-lane page can choose its own Discourse behavior.",
      ].join("\n"),
    );

    const calls = [];
    globalThis.fetch = mockDiscourseFetch(calls, {
      createdTopic: {
        topic_id: 22,
        topic_slug: "discussion-bridge-for-astro-release-lane",
      },
    });

    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      tags: ["docs"],
      mode: "publish-new",
      notifyOnFailure: {
        enabled: false,
        recipients: ["DefaultUser"],
      },
    });

    assert.equal(results[0].status, "created");

    const createCall = calls.find((call) => call.pathname === "/posts.json" && call.method === "POST");
    assert.equal(createCall.body.category, 18);
    assert.deepEqual(createCall.body.tags, ["releases", "launchlight"]);
    assert.match(createCall.body.raw, /^# Release Lane/);
    assert.match(createCall.body.raw, /\[Read the source article\]\(https:\/\/docs\.example\.com\/release\/\)/);
    assert.doesNotMatch(createCall.body.raw, /This is a companion discussion topic for/);
    assert.doesNotMatch(createCall.body.raw, /Source content:/);
    assert.match(createCall.body.raw, /Use this thread for comments, corrections, and follow-up questions\./);

    const visibilityCall = calls.find((call) => call.pathname === "/t/22/status.json" && call.method === "PUT");
    assert.equal(visibilityCall.body.enabled, "false");

    const syncedSource = await readFile(filePath, "utf8");
    assert.match(syncedSource, /discourseTopicId: 22/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("publish-new can label a page with an active discussion target", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-target-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "targeted.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Targeted Page"',
        "---",
        "",
        "# Targeted Page",
        "",
        "This page is linked to one named discussion target.",
      ].join("\n"),
    );

    const calls = [];
    globalThis.fetch = mockDiscourseFetch(calls, {
      createdTopic: {
        topic_id: 22,
        topic_slug: "discussion-bridge-for-astro-targeted-page",
      },
    });

    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      targetName: "community",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      mode: "publish-new",
    });

    assert.equal(results[0].targetName, "community");
    assert.equal(results[0].status, "created");

    const syncedSource = await readFile(filePath, "utf8");
    assert.match(syncedSource, /discussionTarget: "community"/);
    assert.match(syncedSource, /discourseTopicId: 22/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("sync skips pages assigned to a different discussion target", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-target-skip-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "targeted.md");
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Targeted Page"',
        'discussionTarget: "community"',
        "discourseTopicId: 21",
        'discourseTopicUrl: "https://forum.example.com/t/targeted-page/21"',
        "---",
        "",
        "# Targeted Page",
        "",
        "This page belongs to the community target.",
      ].join("\n"),
    );

    globalThis.fetch = mockDiscourseFetch(calls, {
      topic: {
        id: 21,
        title: "DiscussionBridge for Astro: Targeted Page",
        category_id: 5,
        visible: true,
        post_stream: { posts: [{ id: 101, post_number: 1 }] },
      },
    });

    const wrongTarget = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      targetName: "regional",
      discourseUrl: "https://regional.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      mode: "sync-existing",
    });

    assert.equal(wrongTarget[0].status, "skipped");
    assert.match(wrongTarget[0].reason, /not active target "regional"/);
    assert.equal(calls.length, 0);

    const missingTarget = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      categoryId: 5,
      mode: "sync-existing",
    });

    assert.equal(missingTarget[0].status, "skipped");
    assert.match(missingTarget[0].reason, /rerun with --target community/);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("multi-target publishing protects the imported source and creates an independent target binding", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-multi-target-source-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "impact.md");
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "Section 10101 Impact Across Communities"',
        'discussionSourceMode: "discourse-imported"',
        "discussionSync: false",
        'discussionSourceTarget: "repeal-obbba"',
        'discussionTargets: "repeal-obbba,citizen-activist"',
        'discussionPublishTargets: "citizen-activist"',
        "discourseTopicId: 434",
        'discourseTopicUrl: "https://forum.repealobbba.org/t/source-topic/434"',
        "---",
        "",
        "# Section 10101 Impact",
        "",
        "This body came from the protected source forum.",
      ].join("\n"),
    );

    globalThis.fetch = async (...args) => {
      calls.push(args);
      throw new Error("unexpected source-forum write");
    };

    const sourceResults = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://onebigbeautifulbill.us",
      targetName: "repeal-obbba",
      discourseUrl: "https://forum.repealobbba.org",
      apiKey: "source-key",
      apiUsername: "obbba-bot",
      mode: "publish-and-sync",
    });

    assert.equal(sourceResults[0].status, "skipped");
    assert.match(sourceResults[0].reason, /protected by discourse-imported no-writeback policy/);
    assert.equal(sourceResults[0].topicId, 434);
    assert.equal(calls.length, 0);

    globalThis.fetch = mockDiscourseFetch(calls, {
      createdTopic: {
        topic_id: 812,
        topic_slug: "section-10101-impact-across-communities",
      },
    });

    const publicationResults = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://onebigbeautifulbill.us",
      targetName: "citizen-activist",
      discourseUrl: "https://forum.citizenactivist.network",
      apiKey: "publication-key",
      apiUsername: "can-bot",
      mode: "publish-new",
    });

    assert.equal(publicationResults[0].status, "created");
    assert.equal(publicationResults[0].topicId, 812);
    assert.equal(publicationResults[0].targetName, "citizen-activist");

    const source = await readFile(filePath, "utf8");
    const bindings = targetBindingsFromSource(source);
    assert.equal(bindings["citizen-activist"].topicId, 812);
    assert.equal(bindings["citizen-activist"].status, "synced");
    assert.match(bindings["citizen-activist"].topicUrl, /^https:\/\/forum\.citizenactivist\.network\/t\//);
    assert.match(source, /discourseTopicId: 434/);
    assert.match(source, /forum\.repealobbba\.org\/t\/source-topic\/434/);

    calls.length = 0;
    globalThis.fetch = async (...args) => {
      calls.push(args);
      throw new Error("unexpected duplicate create");
    };

    const retryResults = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://onebigbeautifulbill.us",
      targetName: "citizen-activist",
      discourseUrl: "https://forum.citizenactivist.network",
      apiKey: "publication-key",
      apiUsername: "can-bot",
      mode: "publish-new",
    });

    assert.equal(retryResults[0].status, "skipped");
    assert.equal(retryResults[0].reason, "already linked");
    assert.equal(retryResults[0].topicId, 812);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("multi-target publishing protects legacy imported source frontmatter", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-multi-target-legacy-source-"));
  const docsDir = path.join(dir, "docs");
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      path.join(docsDir, "legacy-import.md"),
      [
        "---",
        'title: "Legacy Imported Source Protection"',
        'discussionTarget: "repeal-obbba"',
        'discussionSourceMode: "discourse-imported"',
        "discussionSync: false",
        'discussionTargets: "repeal-obbba,citizen-activist"',
        'discussionPublishTargets: "repeal-obbba,citizen-activist"',
        "discourseTopicId: 434",
        'discourseTopicUrl: "https://forum.repealobbba.org/t/source-topic/434"',
        "---",
        "",
        "This is the frontmatter shape written by earlier package imports.",
      ].join("\n"),
    );

    globalThis.fetch = async () => {
      networkCalls += 1;
      throw new Error("protected source target must not write");
    };
    const results = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://onebigbeautifulbill.us",
      targetName: "repeal-obbba",
      discourseUrl: "https://forum.repealobbba.org",
      apiKey: "source-key",
      apiUsername: "obbba-bot",
      mode: "publish-and-sync",
    });

    assert.equal(results[0].status, "skipped");
    assert.match(results[0].reason, /protected by discourse-imported no-writeback policy/);
    assert.equal(results[0].topicId, 434);
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("multi-target publishing preserves independent bindings across forum runs", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-multi-target-bindings-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "shared.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "A Shared Page for Two Discussion Forums"',
        'discussionTargets: "community,regional"',
        'discussionPublishTargets: "community,regional"',
        "---",
        "",
        "# Shared Page",
        "",
        "One Astro page can maintain independent companion topics.",
      ].join("\n"),
    );

    globalThis.fetch = mockDiscourseFetch([], {
      createdTopic: { topic_id: 101, topic_slug: "shared-page-community" },
    });
    await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      targetName: "community",
      discourseUrl: "https://community.example.com",
      apiKey: "community-key",
      apiUsername: "bridge-bot",
      mode: "publish-new",
    });

    globalThis.fetch = mockDiscourseFetch([], {
      createdTopic: { topic_id: 202, topic_slug: "shared-page-regional" },
    });
    await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      targetName: "regional",
      discourseUrl: "https://regional.example.com",
      apiKey: "regional-key",
      apiUsername: "bridge-bot",
      mode: "publish-new",
    });

    const bindings = targetBindingsFromSource(await readFile(filePath, "utf8"));
    assert.equal(bindings.community.topicId, 101);
    assert.match(bindings.community.topicUrl, /^https:\/\/community\.example\.com\//);
    assert.equal(bindings.regional.topicId, 202);
    assert.match(bindings.regional.topicUrl, /^https:\/\/regional\.example\.com\//);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("multi-target failure state is recoverable by retrying only the failed target", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-multi-target-retry-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "retry.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "Recoverable Multi Target Publication"',
        'discussionTargets: "community,regional"',
        'discussionPublishTargets: "community,regional"',
        'discussionTargetBindings: "{\\"community\\":{\\"topicId\\":101,\\"topicUrl\\":\\"https://community.example.com/t/retry/101\\",\\"status\\":\\"synced\\"}}"',
        "---",
        "",
        "# Recoverable Publication",
        "",
        "A failed regional publication should not disturb the community binding.",
      ].join("\n"),
    );

    globalThis.fetch = async () => new Response("Temporary outage", { status: 503, statusText: "Unavailable" });
    await assert.rejects(
      syncDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        targetName: "regional",
        discourseUrl: "https://regional.example.com",
        apiKey: "regional-key",
        apiUsername: "bridge-bot",
        mode: "publish-new",
      }),
      /503 Unavailable/,
    );

    const failedBindings = targetBindingsFromSource(await readFile(filePath, "utf8"));
    assert.equal(failedBindings.community.topicId, 101);
    assert.equal(failedBindings.community.status, "synced");
    assert.equal(failedBindings.regional.status, "failed");
    assert.match(failedBindings.regional.lastError, /503 Unavailable/);
    assert.ok(failedBindings.regional.lastAttemptedAt);

    globalThis.fetch = mockDiscourseFetch([], {
      createdTopic: { topic_id: 303, topic_slug: "recoverable-multi-target-publication" },
    });
    const retryResults = await syncDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      targetName: "regional",
      discourseUrl: "https://regional.example.com",
      apiKey: "regional-key",
      apiUsername: "bridge-bot",
      mode: "publish-new",
    });

    assert.equal(retryResults[0].status, "created");
    const recoveredBindings = targetBindingsFromSource(await readFile(filePath, "utf8"));
    assert.equal(recoveredBindings.community.topicId, 101);
    assert.equal(recoveredBindings.regional.topicId, 303);
    assert.equal(recoveredBindings.regional.status, "synced");
    assert.equal(recoveredBindings.regional.lastError, undefined);
    assert.equal(recoveredBindings.regional.lastAttemptedAt, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("malformed multi-target bindings fail before network access", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-multi-target-invalid-"));
  const docsDir = path.join(dir, "docs");
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      path.join(docsDir, "invalid.md"),
      [
        "---",
        'title: "Invalid Multi Target Binding Data"',
        'discussionTargets: "community"',
        'discussionTargetBindings: "not-json"',
        "---",
        "",
        "Invalid binding data must fail closed.",
      ].join("\n"),
    );
    globalThis.fetch = async () => {
      networkCalls += 1;
      throw new Error("unexpected network call");
    };

    await assert.rejects(
      syncDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        targetName: "community",
        discourseUrl: "https://community.example.com",
        apiKey: "community-key",
        apiUsername: "bridge-bot",
        mode: "publish-new",
      }),
      /Invalid discussionTargetBindings.*invalid\.md/,
    );
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("routeBase maps content lane files to their public URL prefix", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-route-base-"));
  const docsDir = path.join(dir, "src", "content", "releases");
  const filePath = path.join(docsDir, "2_1.md");

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro 2.1 Release Lane Demo"',
        "---",
        "",
        "# Release Lane",
        "",
        "Release content.",
      ].join("\n"),
    );

    const results = await syncDiscourseTopics({
      docsDir,
      routeBase: "releases",
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "",
      apiUsername: "",
      categoryId: 5,
      mode: "publish-new",
      dryRun: true,
    });

    assert.equal(results[0].pageUrl, "https://docs.example.com/releases/2_1/");
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("import-existing writes linked Astro Markdown from a Discourse topic URL", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-import-"));
  const docsDir = path.join(dir, "blog");
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    globalThis.fetch = mockDiscourseFetch(calls, {
      topic: {
        id: 21,
        title: "Imported Discourse Topic",
        category_id: 5,
        visible: true,
        post_stream: {
          posts: [
            {
              id: 101,
              post_number: 1,
              topic_id: 21,
              topic_slug: "imported-discourse-topic",
              cooked: "<p>Cooked fallback.</p>",
            },
          ],
        },
      },
      post: {
        id: 101,
        name: "DiscussionBridge Forum Editor",
        username: "editorbridgeforum",
        display_username: "DiscussionBridge Forum Editor",
        post_number: 1,
        topic_id: 21,
        topic_slug: "imported-discourse-topic",
        raw: "# Imported Body\n\nThis came from Discourse.",
        cooked: "<p>This came from Discourse.</p>",
      },
    });

    const results = await importExistingDiscourseTopics({
      docsDir,
      routeBase: "blog",
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      topics: ["https://forum.example.com/t/imported-discourse-topic/21/2?u=forum-admin"],
      commentsDisplay: "full",
    });

    assert.equal(results[0].status, "imported");
    assert.equal(results[0].pageUrl, "https://docs.example.com/blog/imported-discourse-topic/");
    assert.equal(calls.some((call) => call.pathname === "/t/21.json"), true);
    assert.equal(calls.some((call) => call.pathname === "/posts/101.json"), true);

    const source = await readFile(path.join(docsDir, "imported-discourse-topic.md"), "utf8");
    assert.match(source, /title: "Imported Discourse Topic"/);
    assert.match(source, /discussionSourceMode: "discourse-imported"/);
    assert.match(source, /discussionSourceAuthorUsername: "editorbridgeforum"/);
    assert.match(source, /discussionSourceAuthorName: "DiscussionBridge Forum Editor"/);
    assert.match(source, /discussionSourceCategoryId: 5/);
    assert.match(source, /discussionSync: false/);
    assert.match(source, /discourseTopicId: 21/);
    assert.match(source, /discussionImportedFrom: "https:\/\/forum\.example\.com\/t\/imported-discourse-topic\/21"/);
    assert.match(source, /discussionImportPolicy: "unpruned"/);
    assert.match(source, /discussionCommentsDisplay: "full"/);
    assert.match(source, /discussionSourceHash: "[a-f0-9]{64}"/);
    assert.match(source, /# Imported Body/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import-existing can label imported frontmatter with a discussion target", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-import-target-"));
  const docsDir = path.join(dir, "blog");
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = mockDiscourseFetch([], {
      topic: {
        id: 21,
        title: "Imported Target Topic",
        category_id: 5,
        visible: true,
        post_stream: {
          posts: [
            {
              id: 101,
              post_number: 1,
              topic_id: 21,
              topic_slug: "imported-target-topic",
              cooked: "<p>Imported target body.</p>",
            },
          ],
        },
      },
      post: {
        id: 101,
        post_number: 1,
        topic_id: 21,
        topic_slug: "imported-target-topic",
        raw: "Imported target body.",
        cooked: "<p>Imported target body.</p>",
      },
    });

    await importExistingDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      targetName: "community",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      topics: ["21"],
    });

    const source = await readFile(path.join(docsDir, "imported-target-topic.md"), "utf8");
    assert.match(source, /discussionTarget: "community"/);
    assert.match(source, /discussionSourceTarget: "community"/);
    assert.match(source, /discussionSourceMode: "discourse-imported"/);
    assert.match(source, /discussionSync: false/);
    assert.match(source, /discourseTopicId: 21/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import-existing can preserve Discourse as the managed source", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-import-managed-"));
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = mockDiscourseFetch([], {
      topic: {
        id: 36,
        title: "How to Choose a DiscussionBridge Source Mode",
        category_id: 6,
        visible: true,
        post_stream: {
          posts: [{
            id: 136,
            post_number: 1,
            topic_id: 36,
            topic_slug: "how-to-choose-a-discussion-bridge-source-mode",
            cooked: "<p>Choose one source of truth.</p>",
          }],
        },
      },
      post: {
        id: 136,
        post_number: 1,
        topic_id: 36,
        topic_slug: "how-to-choose-a-discussion-bridge-source-mode",
        raw: "Choose one source of truth.",
        cooked: "<p>Choose one source of truth.</p>",
      },
    });

    await importExistingDiscourseTopics({
      docsDir: dir,
      siteUrl: "https://discussionbridge.dev",
      targetName: "community",
      discourseUrl: "https://forum.discussionbridge.dev",
      apiKey: "test-key",
      apiUsername: "test-user",
      topics: ["36"],
      sourceMode: "discourse-managed",
      commentsDisplay: "fullInteractive",
    });

    const source = await readFile(
      path.join(dir, "how-to-choose-a-discussion-bridge-source-mode.md"),
      "utf8",
    );
    assert.match(source, /discussionSourceMode: "discourse-managed"/);
    assert.match(source, /discussionSync: false/);
    assert.match(source, /discussionTarget: "community"/);
    assert.match(source, /discussionSourceTarget: "community"/);
    assert.match(source, /discourseTopicId: 36/);
    assert.match(source, /discussionCommentsDisplay: "fullInteractive"/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import-existing adds a leading hero image with alt text", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-import-hero-"));
  const docsDir = path.join(dir, "blog");
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = mockDiscourseFetch([], {
      topic: {
        id: 21,
        title: "Imported Hero Topic",
        category_id: 5,
        visible: true,
        post_stream: {
          posts: [
            {
              id: 101,
              post_number: 1,
              topic_id: 21,
              topic_slug: "imported-hero-topic",
              cooked: "<p>Imported hero body.</p>",
            },
          ],
        },
      },
      post: {
        id: 101,
        post_number: 1,
        topic_id: 21,
        topic_slug: "imported-hero-topic",
        raw: "Imported hero body.",
        cooked: "<p>Imported hero body.</p>",
      },
    });

    await importExistingDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      topics: ["21"],
      heroImage: "../../../assets/hero image.png",
      heroAlt: "One Big [not so] Beautiful Bill",
    });

    const source = await readFile(path.join(docsDir, "imported-hero-topic.md"), "utf8");
    assert.match(source, /!\[One Big \[not so\\\] Beautiful Bill\]\(<\.\.\/\.\.\/\.\.\/assets\/hero image\.png>\)/);
    assert.ok(source.indexOf("![") < source.indexOf("Imported hero body."));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import-existing requires alt text for a configured hero image", async () => {
  await assert.rejects(
    importExistingDiscourseTopics({
      docsDir: "unused",
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      topics: ["21"],
      heroImage: "../../../assets/hero.png",
    }),
    /heroAlt is required when heroImage is configured/,
  );

  await assert.rejects(
    importExistingDiscourseTopics({
      docsDir: "unused",
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      topics: ["21"],
      heroImage: "   ",
      heroAlt: "Descriptive alt text",
    }),
    /heroImage is required when heroAlt is configured/,
  );

  await assert.rejects(
    importExistingDiscourseTopics({
      docsDir: "unused",
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      topics: ["21"],
      heroAlt: "Descriptive alt text",
    }),
    /heroImage is required when heroAlt is configured/,
  );
});

test("import-existing prunes only a verified trailing community call to action", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-import-prune-"));
  const docsDir = path.join(dir, "blog");
  const originalFetch = globalThis.fetch;
  const raw = [
    "# Source Content",
    "",
    "Keep this analysis.",
    "",
    "---",
    "",
    "***Created with AI, Will be Polished by Humans, Powered by You.***",
    "",
    "**[Join the Conversation Today!](https://forum.example.com/signup)**",
    "",
    "---",
    "",
    "Please share how this section is impacting you by telling your [story](https://forum.example.com/c/stories/7).",
  ].join("\n");

  try {
    globalThis.fetch = mockDiscourseFetch([], {
      topic: {
        id: 21,
        title: "Imported Pruned Topic",
        category_id: 5,
        visible: true,
        post_stream: {
          posts: [{ id: 101, post_number: 1, topic_id: 21, topic_slug: "imported-pruned-topic", cooked: "" }],
        },
      },
      post: {
        id: 101,
        post_number: 1,
        topic_id: 21,
        topic_slug: "imported-pruned-topic",
        raw,
        cooked: "",
      },
    });

    await importExistingDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      topics: ["21"],
      pruneProfiles: ["community-call-to-action"],
    });

    const source = await readFile(path.join(docsDir, "imported-pruned-topic.md"), "utf8");
    assert.match(source, /discussionImportPolicy: "pruned:community-call-to-action"/);
    assert.match(source, /Keep this analysis\./);
    assert.doesNotMatch(source, /Created with AI|Join the Conversation|Please share how/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import-existing refuses to prune when the trailing boundary is not verified", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-import-prune-refusal-"));
  const docsDir = path.join(dir, "blog");
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = mockDiscourseFetch([], {
      topic: {
        id: 21,
        title: "Imported Unmatched Prune Topic",
        category_id: 5,
        visible: true,
        post_stream: {
          posts: [{ id: 101, post_number: 1, topic_id: 21, topic_slug: "imported-unmatched-prune-topic", cooked: "" }],
        },
      },
      post: {
        id: 101,
        post_number: 1,
        topic_id: 21,
        topic_slug: "imported-unmatched-prune-topic",
        raw: "# Source Content\n\nDo not remove any of this.",
        cooked: "",
      },
    });

    await assert.rejects(
      importExistingDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        topics: ["21"],
        pruneProfiles: ["community-call-to-action"],
      }),
      /did not find a verified trailing block.*No file was written/,
    );
    await assert.rejects(readFile(path.join(docsDir, "imported-unmatched-prune-topic.md"), "utf8"));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import-existing rejects unsupported and duplicate prune profiles before I/O", async () => {
  const baseOptions = {
    docsDir: "unused",
    siteUrl: "https://docs.example.com",
    discourseUrl: "https://forum.example.com",
    apiKey: "test-key",
    apiUsername: "test-user",
    topics: ["21"],
  };

  await assert.rejects(
    importExistingDiscourseTopics({
      ...baseOptions,
      pruneProfiles: ["unknown-profile"],
    }),
    /Unsupported import prune profile: unknown-profile/,
  );

  await assert.rejects(
    importExistingDiscourseTopics({
      ...baseOptions,
      pruneProfiles: ["community-call-to-action", "community-call-to-action"],
    }),
    /Duplicate import prune profile: community-call-to-action/,
  );
});

test("import-existing refuses to label cooked HTML conversion as an unpruned import", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-import-raw-required-"));
  const docsDir = path.join(dir, "blog");
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = mockDiscourseFetch([], {
      topic: {
        id: 21,
        title: "Imported Topic Without Raw Markdown",
        category_id: 5,
        visible: true,
        post_stream: {
          posts: [
            {
              id: 101,
              post_number: 1,
              topic_id: 21,
              topic_slug: "imported-topic-without-raw-markdown",
              cooked: "<p>Cooked content only.</p>",
            },
          ],
        },
      },
      post: {
        id: 101,
        post_number: 1,
        topic_id: 21,
        topic_slug: "imported-topic-without-raw-markdown",
        cooked: "<p>Cooked content only.</p>",
      },
    });

    await assert.rejects(
      importExistingDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "granular-key-without-raw-access",
        apiUsername: "test-user",
        topics: ["21"],
      }),
      /did not expose raw Markdown.*DISCOURSE_DIAGNOSTICS_API_KEY/s,
    );

    await assert.rejects(readFile(path.join(docsDir, "imported-topic-without-raw-markdown.md"), "utf8"));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import-existing skips existing files unless overwrite is enabled", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-import-skip-"));
  const docsDir = path.join(dir, "blog");
  const filePath = path.join(docsDir, "existing-topic.md");
  const originalFetch = globalThis.fetch;

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(filePath, "keep me\n");
    globalThis.fetch = mockDiscourseFetch([], {
      topic: {
        id: 21,
        title: "Existing Topic",
        category_id: 5,
        visible: true,
        post_stream: {
          posts: [
            {
              id: 101,
              post_number: 1,
              topic_id: 21,
              topic_slug: "existing-topic",
              cooked: "<p>Replacement.</p>",
            },
          ],
        },
      },
      post: {
        id: 101,
        post_number: 1,
        topic_id: 21,
        topic_slug: "existing-topic",
        raw: "Replacement.",
        cooked: "<p>Replacement.</p>",
      },
    });

    const skipped = await importExistingDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      topics: ["21"],
    });

    assert.equal(skipped[0].status, "skipped");
    assert.equal(await readFile(filePath, "utf8"), "keep me\n");

    const overwritten = await importExistingDiscourseTopics({
      docsDir,
      siteUrl: "https://docs.example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test-key",
      apiUsername: "test-user",
      topics: ["21"],
      overwrite: true,
    });

    assert.equal(overwritten[0].status, "imported");
    assert.match(await readFile(filePath, "utf8"), /Replacement\./);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("import-existing overwrite refreshes changed Discourse source ownership", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-import-owner-refresh-"));
  const originalFetch = globalThis.fetch;
  const topic = {
    id: 36,
    title: "How to Choose a DiscussionBridge Source Mode",
    category_id: 6,
    visible: true,
    post_stream: {
      posts: [{
        id: 136,
        name: "Discourse Admin",
        username: "discourseadmin",
        display_username: "Discourse Admin",
        post_number: 1,
        topic_id: 36,
        topic_slug: "how-to-choose-a-discussion-bridge-source-mode",
        cooked: "<p>Choose one source of truth.</p>",
      }],
    },
  };

  try {
    globalThis.fetch = mockDiscourseFetch([], {
      topic,
      post: {
        ...topic.post_stream.posts[0],
        raw: [
          "Choose one source of truth.",
          "",
          "```yaml",
          "discussionSourceCategoryId: 999",
          "```",
        ].join("\n"),
      },
    });

    const options = {
      docsDir: dir,
      siteUrl: "https://discussionbridge.dev",
      targetName: "community",
      discourseUrl: "https://forum.discussionbridge.dev",
      apiKey: "test-key",
      apiUsername: "test-user",
      topics: ["36"],
      sourceMode: "discourse-managed",
      commentsDisplay: "fullInteractive",
    };
    await importExistingDiscourseTopics(options);

    globalThis.fetch = mockDiscourseFetch([], {
      topic: {
        ...topic,
        category_id: 7,
        post_stream: {
          posts: [{
            ...topic.post_stream.posts[0],
            name: "DiscussionBridge Forum Editor",
            username: "editorbridgeforum",
            display_username: "DiscussionBridge Forum Editor",
          }],
        },
      },
      post: {
        ...topic.post_stream.posts[0],
        name: "DiscussionBridge Forum Editor",
        username: "editorbridgeforum",
        display_username: "DiscussionBridge Forum Editor",
        raw: "Choose one source of truth after the ownership transfer.",
      },
    });
    const refreshed = await importExistingDiscourseTopics({ ...options, overwrite: true });

    const source = await readFile(
      path.join(dir, "how-to-choose-a-discussion-bridge-source-mode.md"),
      "utf8",
    );
    assert.match(source, /discussionSourceAuthorUsername: "editorbridgeforum"/);
    assert.match(source, /discussionSourceAuthorName: "DiscussionBridge Forum Editor"/);
    assert.match(source, /discussionSourceCategoryId: 7/);
    assert.doesNotMatch(source, /discourseadmin|Discourse Admin/);
    assert.match(source, /discussionSourceMode: "discourse-managed"/);
    assert.match(source, /discussionSync: false/);
    assert.match(source, /discourseTopicId: 36/);
    assert.equal(refreshed[0].sourceCategoryId, 7);
    assert.equal(
      refreshed[0].reason,
      "source category changed: 6 -> 7; Astro route/navigation unchanged",
    );
    assert.equal(
      refreshed[0].pageUrl,
      "https://discussionbridge.dev/how-to-choose-a-discussion-bridge-source-mode/",
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("frontmatter failure recipients receive page-specific publish errors", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-page-notify-"));
  const docsDir = path.join(dir, "docs");
  const filePath = path.join(docsDir, "release.md");
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "DiscussionBridge for Astro: Release Lane Failure"',
        'discussionNotifyRecipients: "forum-admin,ops-bot"',
        "---",
        "",
        "# Release Lane Failure",
        "",
        "This page will trigger a mocked Discourse publish failure.",
      ].join("\n"),
    );

    globalThis.fetch = async (url, init = {}) => {
      const parsed = new URL(url);
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ pathname: parsed.pathname, method, body });

      if (method === "POST" && parsed.pathname === "/posts.json" && body.archetype === "private_message") {
        return jsonResponse({
          id: 301,
          name: "",
          username: "test-user",
          avatar_template: "",
          created_at: new Date(0).toISOString(),
          cooked: "",
          post_number: 1,
          post_type: 1,
          updated_at: new Date(0).toISOString(),
          reply_count: 0,
          reply_to_post_number: null,
          quote_count: 0,
          incoming_link_count: 0,
          reads: 0,
          readers_count: 0,
          score: 0,
          topic_id: 30,
          topic_slug: "discussion-bridge-publish-failed",
        });
      }

      return new Response("Create failed", { status: 422, statusText: "Unprocessable Entity" });
    };

    await assert.rejects(
      syncDiscourseTopics({
        docsDir,
        siteUrl: "https://docs.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        categoryId: 5,
        mode: "publish-new",
        notifyOnFailure: {
          enabled: true,
          recipients: ["DefaultUser"],
        },
      }),
      /Discourse request failed: 422/,
    );

    const pmCalls = calls.filter((call) => call.pathname === "/posts.json" && call.body?.archetype === "private_message");
    assert.equal(pmCalls.length, 1);
    assert.equal(pmCalls[0].body.target_recipients, "forum-admin,ops-bot");
    assert.match(pmCalls[0].body.raw, /Release Lane Failure/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

function mockDiscourseFetch(calls, { topic, createdTopic, post, updatedTopic }) {
  return async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const topicId = topic?.id ?? 21;
    const postId = post?.id ?? topic?.post_stream?.posts?.[0]?.id ?? 101;
    calls.push({ pathname: parsed.pathname, method, body });

    if (method === "GET" && parsed.pathname === `/t/${topicId}.json`) {
      return jsonResponse(topic);
    }

    if (method === "GET" && parsed.pathname === `/posts/${postId}.json`) {
      return jsonResponse(post ?? topic?.post_stream?.posts?.[0]);
    }

    if (method === "PUT" && parsed.pathname === `/posts/${postId}.json`) {
      return jsonResponse({ post: { id: postId, post_number: 1 } });
    }

    if (method === "PUT" && parsed.pathname === `/t/-/${topicId}.json`) {
      return jsonResponse(updatedTopic ?? { basic_topic: { id: topicId, title: body.title, category_id: body.category_id } });
    }

    if (method === "PUT" && /^\/t\/\d+\/status\.json$/.test(parsed.pathname)) {
      return jsonResponse({ success: "OK" });
    }

    if (method === "POST" && parsed.pathname === "/posts.json" && body.archetype === "private_message") {
      return jsonResponse({
        id: 301,
        name: "",
        username: "test-user",
        avatar_template: "",
        created_at: new Date(0).toISOString(),
        cooked: "",
        post_number: 1,
        post_type: 1,
        updated_at: new Date(0).toISOString(),
        reply_count: 0,
        reply_to_post_number: null,
        quote_count: 0,
        incoming_link_count: 0,
        reads: 0,
        readers_count: 0,
        score: 0,
        topic_id: 30,
        topic_slug: "discussion-bridge-publish-failed",
      });
    }

    if (method === "POST" && parsed.pathname === "/posts.json") {
      return jsonResponse({
        id: 201,
        name: "",
        username: "test-user",
        avatar_template: "",
        created_at: new Date(0).toISOString(),
        cooked: "",
        post_number: 1,
        post_type: 1,
        updated_at: new Date(0).toISOString(),
        reply_count: 0,
        reply_to_post_number: null,
        quote_count: 0,
        incoming_link_count: 0,
        reads: 0,
        readers_count: 0,
        score: 0,
        topic_id: createdTopic.topic_id,
        topic_slug: createdTopic.topic_slug,
      });
    }

    return new Response(`Unexpected request: ${method} ${parsed.pathname}`, { status: 500 });
  };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function topicListItem(id, title, createdAt, options = {}) {
  return {
    id,
    title,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    category_id: options.categoryId ?? 18,
    created_at: createdAt,
    bumped_at: options.bumpedAt ?? createdAt,
    closed: options.closed ?? false,
    archived: options.archived ?? false,
    visible: options.visible ?? true,
    tags: options.tags ?? [],
  };
}

function targetBindingsFromSource(source) {
  const rawValue = source.match(/^discussionTargetBindings:\s*(.+)$/m)?.[1];
  assert.ok(rawValue, "discussionTargetBindings frontmatter is present");
  return JSON.parse(JSON.parse(rawValue));
}
