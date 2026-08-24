import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { publishFilesAtomically } from "../dist/atomic-files.js";
import { fetchRefreshPosts } from "../dist/components/browser-refresh.js";
import { assertSafeImportedMarkdown } from "../dist/import-existing.js";
import { importExistingDiscourseManifest } from "../dist/import-manifest.js";

function jsonResponse(payload, url = "https://forum.example.com/community/t/42.json") {
  const response = new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

const validPost = {
  id: 9,
  post_number: 2,
  topic_id: 42,
  topic_slug: "topic",
  score: 1,
  username: "reader",
  created_at: "2026-08-24T00:00:00.000Z",
  cooked: "<p>Sanitized by Discourse</p>",
};

test("browser refresh remains on the exact Discourse subfolder boundary", async () => {
  let request;
  const posts = await fetchRefreshPosts(
    { discourseUrl: "https://forum.example.com/community//", topicId: "42" },
    {
      pageOrigin: "https://astro.example.com",
      fetchImpl: async (url, init) => {
        request = { url: String(url), init };
        return jsonResponse({ post_stream: { posts: [validPost] } });
      },
    },
  );
  assert.equal(request.url, "https://forum.example.com/community/t/42.json");
  assert.equal(request.init.redirect, "error");
  assert.equal(request.init.credentials, "omit");
  assert.deepEqual(posts, [validPost]);
});

test("browser refresh rejects a foreign final response before cooked HTML is returned", async () => {
  await assert.rejects(
    fetchRefreshPosts(
      { discourseUrl: "https://forum.example.com/community", topicId: "42" },
      {
        pageOrigin: "https://astro.example.com",
        fetchImpl: async () => jsonResponse(
          { post_stream: { posts: [{ ...validPost, cooked: '<img src=x onerror="alert(1)">' }] } },
          "https://attacker.invalid/topic.json",
        ),
      },
    ),
    /trusted URL boundary/,
  );
});

test("browser refresh rejects posts from a different topic", async () => {
  await assert.rejects(
    fetchRefreshPosts(
      { discourseUrl: "https://forum.example.com/community", topicId: "42" },
      {
        pageOrigin: "https://astro.example.com",
        fetchImpl: async () => jsonResponse(
          { post_stream: { posts: [{ ...validPost, topic_id: 99 }] } },
        ),
      },
    ),
    /different topic/,
  );
  await assert.rejects(
    fetchRefreshPosts(
      {
        discourseUrl: "https://forum.example.com",
        refreshEndpoint: "/api/discussion/{topicId}",
        topicId: "42",
      },
      {
        pageOrigin: "https://astro.example.com",
        fetchImpl: async () => jsonResponse(
          { id: 99, post_stream: { posts: [validPost] } },
          "https://astro.example.com/api/discussion/42",
        ),
      },
    ),
    /different topic/,
  );
});

test("browser refresh permits only a same-origin absolute-path proxy", async () => {
  const calls = [];
  await fetchRefreshPosts(
    {
      discourseUrl: "https://forum.example.com",
      refreshEndpoint: "/api/discussion/{topicId}",
      topicId: "42",
    },
    {
      pageOrigin: "https://astro.example.com",
      fetchImpl: async (url) => {
        calls.push(String(url));
        return jsonResponse(
          { post_stream: { posts: [validPost] } },
          "https://astro.example.com/api/discussion/42",
        );
      },
    },
  );
  assert.deepEqual(calls, ["https://astro.example.com/api/discussion/42"]);
  await assert.rejects(
    fetchRefreshPosts(
      {
        discourseUrl: "https://forum.example.com",
        refreshEndpoint: "https://attacker.invalid/{topicId}",
        topicId: "42",
      },
      { pageOrigin: "https://astro.example.com", fetchImpl: async () => jsonResponse({}) },
    ),
    /same-origin absolute-path/,
  );
});

test("CommonMark parsing rejects unsafe escaped, nested, reference, and image destinations", () => {
  const unsafe = [
    String.raw`[click \]](javascript:alert(1))`,
    `[outer [inner]](javascript:alert(1))`,
    `[safe label][danger]\n\n[danger]: javascript:alert(1)`,
    `![image](j&#x61;vascript:alert(1))`,
    `[linefeed](%0Ajavascript:alert(1))`,
    `[tab](%09javascript:alert(1))`,
    `[protocol relative](%2f%2fattacker.invalid/path)`,
    `[backslash](%5cjavascript:alert(1))`,
    `![double encoded](%250Ajavascript:alert(1))`,
    `[reference][unsafe]\n\n[unsafe]: %2509javascript:alert(1)`,
    `<javascript:alert(1)>`,
  ];
  for (const source of unsafe) {
    assert.throws(() => assertSafeImportedMarkdown(source, 42), /unsafe Markdown/);
  }
  assert.doesNotThrow(() => assertSafeImportedMarkdown(
    "[relative](../guide) [web](https://example.com) `</script>`\n\n```html\n<script>literal</script>\n```",
    42,
  ));
});

test("atomic publication stages the entire batch before creating a destination", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-atomic-"));
  try {
    const first = path.join(dir, "first.md");
    const second = path.join(dir, "second.md");
    await assert.rejects(
      publishFilesAtomically(
        [
          { targetPath: first, contents: "first" },
          { targetPath: second, sourcePath: path.join(dir, "missing-stage.md") },
        ],
        false,
      ),
      /Could not publish staged files/,
    );
    await assert.rejects(readFile(first), { code: "ENOENT" });
    await assert.rejects(readFile(second), { code: "ENOENT" });

    await writeFile(first, "original");
    await assert.rejects(
      publishFilesAtomically(
        [{ targetPath: first, contents: "replacement" }],
        false,
      ),
      /EEXIST/,
    );
    assert.equal(await readFile(first, "utf8"), "original");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("post-commit backup cleanup failure never rolls back committed targets", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-cleanup-"));
  const first = path.join(dir, "first.md");
  const second = path.join(dir, "second.md");
  const originalWarn = console.warn;
  let backupRemovals = 0;
  const warnings = [];
  try {
    await writeFile(first, "old first");
    await writeFile(second, "old second");
    console.warn = (value) => warnings.push(String(value));
    await publishFilesAtomically(
      [
        { targetPath: first, contents: "new first" },
        { targetPath: second, contents: "new second" },
      ],
      true,
      {
        remove: async (filePath, options) => {
          if (filePath.includes("discussionbridge-backup")) {
            backupRemovals += 1;
            if (backupRemovals === 2) throw new Error("injected backup cleanup failure");
          }
          await rm(filePath, options);
        },
      },
    );
    assert.equal(await readFile(first, "utf8"), "new first");
    assert.equal(await readFile(second, "utf8"), "new second");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /published successfully.*backup cleanup requires attention/);
    assert.equal(
      (await readdir(dir)).filter((name) => name.includes("discussionbridge-backup")).length,
      1,
    );
  } finally {
    console.warn = originalWarn;
    await rm(dir, { recursive: true, force: true });
  }
});

test("failed backup creation preserves the untouched original destination", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-backup-rename-"));
  const target = path.join(dir, "existing.md");
  try {
    await writeFile(target, "original bytes");
    await assert.rejects(
      publishFilesAtomically(
        [{ targetPath: target, contents: "replacement bytes" }],
        true,
        {
          rename: async (oldPath, newPath) => {
            if (oldPath === target && newPath.includes("discussionbridge-backup")) {
              throw new Error("injected backup rename failure");
            }
            await rename(oldPath, newPath);
          },
        },
      ),
      /injected backup rename failure/,
    );
    assert.equal(await readFile(target, "utf8"), "original bytes");
    assert.deepEqual(await readdir(dir), ["existing.md"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("manifest commit rechecks a symlink or junction introduced after preview", async (context) => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-manifest-link-"));
  const docsDir = path.join(dir, "docs");
  const outside = path.join(dir, "outside");
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    await mkdir(docsDir, { recursive: true });
    await mkdir(outside, { recursive: true });
    globalThis.fetch = async (url) => {
      calls += 1;
      if (calls === 3) {
        try {
          await symlink(
            outside,
            path.join(docsDir, "escape"),
            process.platform === "win32" ? "junction" : "dir",
          );
        } catch (error) {
          if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
            context.skip(`This host does not permit a disposable symlink/junction: ${error.code}`);
          } else {
            throw error;
          }
        }
      }
      const pathname = new URL(url).pathname;
      if (pathname === "/t/42.json") {
        return jsonResponse({
          id: 42,
          title: "Manifest Boundary",
          post_stream: { posts: [{ ...validPost, id: 1, post_number: 1, topic_slug: "manifest-boundary" }] },
        });
      }
      if (pathname === "/posts/1.json") {
        return jsonResponse({ ...validPost, id: 1, post_number: 1, topic_slug: "manifest-boundary", raw: "Safe source." });
      }
      return new Response("Not found", { status: 404 });
    };

    await assert.rejects(
      importExistingDiscourseManifest({
        docsDir,
        siteUrl: "https://astro.example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test-key",
        apiUsername: "test-user",
        manifest: {
          version: 1,
          imports: [{ topic: "42", output: "escape/imported.md" }],
        },
      }),
      /symbolic link or reparse-point boundary/,
    );
    await assert.rejects(readFile(path.join(outside, "imported.md")), { code: "ENOENT" });
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});
