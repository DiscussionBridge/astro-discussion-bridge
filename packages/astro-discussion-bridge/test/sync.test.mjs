import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { importExistingDiscourseTopics } from "../dist/import-existing.js";
import { syncDiscourseTopics, validateDiscourseTopicTitle } from "../dist/sync/index.js";

test("validates titles before publishing to Discourse", () => {
  assert.deepEqual(validateDiscourseTopicTitle("Discussion Bridge for Astro"), []);
  assert.match(validateDiscourseTopicTitle("Beta")[0].reason, /too short/);
  assert.equal(validateDiscourseTopicTitle("aaaa bbbb cccc").some((issue) => /unclear/.test(issue.reason)), true);
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
      /Discourse topic title preflight failed/,
    );

    assert.equal(calls.length, 0);
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
          recipients: ["PhilH"],
        },
      }),
      /Discourse topic title preflight failed/,
    );

    const pmCall = calls.find((call) => call.pathname === "/posts.json" && call.body?.archetype === "private_message");
    assert.equal(pmCall.body.target_recipients, "PhilH");
    assert.match(pmCall.body.raw, /Discourse topic title preflight failed/);
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
          recipients: ["PhilH"],
        },
      }),
      /Discourse topic title preflight failed/,
    );
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
        'title: "Discussion Bridge for Astro: Starlight Demo"',
        "discourseTopicId: 21",
        'discourseTopicUrl: "https://forum.example.com/t/discussionbridge-starlight-demo/21"',
        "---",
        "",
        "# Discussion Bridge for Astro: Starlight Demo",
        "",
        "The source body stays stable.",
      ].join("\n"),
    );

    const firstCalls = [];
    globalThis.fetch = mockDiscourseFetch(firstCalls, {
      topic: {
        id: 21,
        title: "Discussion Bridge for Astro: Starlight Demo",
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
      unlistSyncedTopics: true,
    });

    assert.equal(results[0].status, "updated");
    assert.equal(secondCalls.some((call) => call.pathname === "/posts/101.json"), false);
    assert.equal(secondCalls.some((call) => call.pathname === "/t/-/21.json" && call.method === "PUT"), true);
    assert.equal(secondCalls.some((call) => call.pathname === "/t/21/status.json" && call.method === "PUT"), true);
    assert.equal(await readFile(filePath, "utf8"), syncedSource);
  } finally {
    globalThis.fetch = originalFetch;
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
        'title: "Discussion Bridge for Astro: Existing Page"',
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
        'title: "Discussion Bridge for Astro: New Page"',
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
        title: "Discussion Bridge for Astro: Existing Page",
        category_id: 5,
        visible: false,
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
        'title: "Discussion Bridge for Astro: Release Lane"',
        "discussionCategoryId: 18",
        'discussionTags: "releases, launchlight"',
        "discussionUnlisted: true",
        'discussionNotifyRecipients: "PhilH,OpsBot"',
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
    assert.match(createCall.body.raw, /^\[Discussion Bridge for Astro: Release Lane\]\(https:\/\/docs\.example\.com\/release\/\)/);
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
        'title: "Discussion Bridge for Astro: Targeted Page"',
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
        'title: "Discussion Bridge for Astro: Targeted Page"',
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
        title: "Discussion Bridge for Astro: Targeted Page",
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
        'title: "Discussion Bridge for Astro 2.1 Release Lane Demo"',
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
      topics: ["https://forum.example.com/t/imported-discourse-topic/21/2?u=philh"],
      commentsDisplay: "full",
    });

    assert.equal(results[0].status, "imported");
    assert.equal(results[0].pageUrl, "https://docs.example.com/blog/imported-discourse-topic/");
    assert.equal(calls.some((call) => call.pathname === "/t/21.json"), true);
    assert.equal(calls.some((call) => call.pathname === "/posts/101.json"), true);

    const source = await readFile(path.join(docsDir, "imported-discourse-topic.md"), "utf8");
    assert.match(source, /title: "Imported Discourse Topic"/);
    assert.match(source, /discourseTopicId: 21/);
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
    assert.match(source, /discourseTopicId: 21/);
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
        'title: "Discussion Bridge for Astro: Release Lane Failure"',
        'discussionNotifyRecipients: "PhilH,OpsBot"',
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
    assert.equal(pmCalls[0].body.target_recipients, "PhilH,OpsBot");
    assert.match(pmCalls[0].body.raw, /Release Lane Failure/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

function mockDiscourseFetch(calls, { topic, createdTopic, post }) {
  return async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ pathname: parsed.pathname, method, body });

    if (method === "GET" && parsed.pathname === "/t/21.json") {
      return jsonResponse(topic);
    }

    if (method === "GET" && parsed.pathname === "/posts/101.json") {
      return jsonResponse(post ?? topic?.post_stream?.posts?.[0]);
    }

    if (method === "PUT" && parsed.pathname === "/posts/101.json") {
      return jsonResponse({ post: { id: 101, post_number: 1 } });
    }

    if (method === "PUT" && parsed.pathname === "/t/-/21.json") {
      return jsonResponse({ basic_topic: { id: 21, title: body.topic.title } });
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
