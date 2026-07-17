import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { syncDiscourseTopics } from "../dist/sync/index.js";

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

function mockDiscourseFetch(calls, { topic, createdTopic }) {
  return async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ pathname: parsed.pathname, method, body });

    if (method === "GET" && parsed.pathname === "/t/21.json") {
      return jsonResponse(topic);
    }

    if (method === "PUT" && parsed.pathname === "/posts/101.json") {
      return jsonResponse({ post: { id: 101, post_number: 1 } });
    }

    if (method === "PUT" && parsed.pathname === "/t/-/21.json") {
      return jsonResponse({ basic_topic: { id: 21, title: body.topic.title } });
    }

    if (method === "PUT" && parsed.pathname === "/t/21/status.json") {
      return jsonResponse({ success: "OK" });
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
