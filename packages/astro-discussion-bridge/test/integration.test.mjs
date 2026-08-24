import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import discussionBridge from "../dist/index.js";
import { syncDiscourseTopics } from "../dist/sync/index.js";

test("credit defaults are public and unsafe link protocols fail closed", async () => {
  let plugins = [];
  const integration = discussionBridge({
    discourseUrl: "https://community.example.com",
  });
  await integration.hooks["astro:config:setup"]({
    config: { root: pathToFileURL(`${process.cwd()}${path.sep}`) },
    updateConfig(config) {
      plugins = config.vite?.plugins ?? [];
    },
  });
  const resolved = plugins[0].resolveId("virtual:discussion-bridge/config");
  const source = plugins[0].load(resolved);
  const config = JSON.parse(source.replace(/^export default /, "").replace(/;$/, ""));

  assert.deepEqual(config.comments.credit, {
    enabled: true,
    prefix: "Connected by",
    label: "DiscussionBridge",
    href: "https://discussionbridge.dev/",
  });
  assert.equal(config.comments.embedHeight, "800px");
  assert.equal(config.comments.dynamicHeight, true);
  assert.equal(config.comments.embedMinHeight, "360");
  assert.equal(config.comments.embedMaxHeight, "900");
  assert.equal(config.comments.embedViewportMaxHeight, "none");
  assert.throws(
    () => discussionBridge({
      discourseUrl: "https://community.example.com",
      comments: { credit: { href: "javascript:alert(1)" } },
    }),
    /comments\.credit\.href must be an absolute HTTP\(S\) URL/,
  );
});

test("fullInteractive dynamic height is Core-owned and rejects a competing CSS ceiling", async () => {
  let plugins = [];
  const integration = discussionBridge({
    discourseUrl: "https://community.example.com",
    comments: {
      display: "fullInteractive",
      embedHeight: "500px",
      dynamicHeight: false,
      embedMinHeight: "300",
      embedMaxHeight: "700",
      embedViewportMaxHeight: "none",
    },
  });
  await integration.hooks["astro:config:setup"]({
    config: { root: pathToFileURL(`${process.cwd()}${path.sep}`) },
    updateConfig(config) {
      plugins = config.vite?.plugins ?? [];
    },
  });
  const resolved = plugins[0].resolveId("virtual:discussion-bridge/config");
  const source = plugins[0].load(resolved);
  const config = JSON.parse(source.replace(/^export default /, "").replace(/;$/, ""));

  assert.equal(config.comments.embedHeight, "500px");
  assert.equal(config.comments.dynamicHeight, false);
  assert.equal(config.comments.embedMinHeight, "300");
  assert.equal(config.comments.embedMaxHeight, "700");
  assert.equal(config.comments.embedViewportMaxHeight, "none");

  assert.throws(
    () => discussionBridge({
      discourseUrl: "https://community.example.com",
      comments: { display: "fullInteractive", embedViewportMaxHeight: "65vh" },
    }),
    /embedViewportMaxHeight no longer accepts a CSS ceiling/,
  );
});

test("invalid site-level connection jobs fail during integration setup", () => {
  assert.throws(
    () => discussionBridge({
      discourseUrl: "https://community.example.com",
      connections: {
        jobs: {
          community: {
            purpose: "product support",
            audience: "DiscussionBridge Community",
            callToAction: "Ask the DiscussionBridge Community",
            description: "Get implementation help.",
            unsupported: undefined,
          },
        },
      },
    }),
    /Invalid connections\.jobs: connection job for target "community" has unsupported field\(s\): unsupported/,
  );
});

test("Astro integration exposes a rebuild-time relationship manifest", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "discussion-bridge-relationship-integration-"));
  const docsDir = path.join(projectRoot, "src", "content", "docs");
  let plugins = [];

  try {
    await mkdir(path.join(docsDir, "impact"), { recursive: true });
    await writeFile(
      path.join(docsDir, "impact", "section-10101.md"),
      [
        "---",
        'title: "Section 10101 Impact"',
        'contentLens: "impact"',
        'sectionId: "10101"',
        "---",
        "",
        "Impact.",
      ].join("\n"),
    );
    const integration = discussionBridge({
      preset: "starlight",
      discourseUrl: "https://forum.example.com",
      siteUrl: "https://example.com",
      relationships: {
        enabled: true,
        lenses: {
          impact: {
            label: "Impact",
            callToAction: "Explore the impact",
          },
        },
      },
    });
    await integration.hooks["astro:config:setup"]({
      config: { root: pathToFileURL(`${projectRoot}${path.sep}`) },
      updateConfig(config) {
        plugins = config.vite?.plugins ?? [];
      },
    });
    assert.equal(plugins.length, 1);
    const resolved = plugins[0].resolveId("virtual:discussion-bridge/relationships");
    const source = plugins[0].load(resolved);
    assert.equal(typeof source, "string");
    const manifest = JSON.parse(source.replace(/^export default /, "").replace(/;$/, ""));
    assert.equal(manifest.entries.length, 1);
    assert.equal(manifest.entries[0].url, "https://example.com/impact/section-10101/");
    assert.deepEqual(manifest.entries[0].sectionIds, ["10101"]);
    assert.equal(manifest.lenses.impact.callToAction, "Explore the impact");
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("publishOnBuild lanes can publish one page to independent Discourse targets", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "discussion-bridge-build-targets-"));
  const docsDir = path.join(projectRoot, "src", "content", "blog");
  const filePath = path.join(docsDir, "shared.md");
  const originalFetch = globalThis.fetch;
  const originalCommunityKey = process.env.TEST_COMMUNITY_DISCOURSE_KEY;
  const originalRegionalKey = process.env.TEST_REGIONAL_DISCOURSE_KEY;
  const originalCommunityPostAs = process.env.TEST_COMMUNITY_POST_AS;
  const originalUsername = process.env.TEST_BRIDGE_USERNAME;
  const calls = [];

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        'title: "Build Published to Two Discussion Forums"',
        'discussionTargets: "community,regional"',
        'discussionPublishTargets: "community,regional"',
        "---",
        "",
        "# Shared Build Page",
        "",
        "The build runs one recoverable publication lane per forum.",
      ].join("\n"),
    );

    process.env.TEST_COMMUNITY_DISCOURSE_KEY = "community-secret";
    process.env.TEST_REGIONAL_DISCOURSE_KEY = "regional-secret";
    process.env.TEST_COMMUNITY_POST_AS = "community-editor";
    process.env.TEST_BRIDGE_USERNAME = "bridge-bot";

    globalThis.fetch = async (url, init = {}) => {
      const parsed = new URL(url);
      const headers = new Headers(init.headers);
      const topicId = parsed.hostname === "community.example.com" ? 401 : 402;
      calls.push({
        hostname: parsed.hostname,
        pathname: parsed.pathname,
        apiKey: headers.get("Api-Key"),
        apiUsername: headers.get("Api-Username"),
      });

      return new Response(JSON.stringify({
        topic_id: topicId,
        topic_slug: `shared-build-${topicId}`,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const integration = discussionBridge({
      preset: "astro",
      discourseUrl: "https://primary.example.com",
      siteUrl: "https://docs.example.com",
      publishOnBuild: {
        enabled: true,
        lanes: [
          {
            name: "community",
            docsDir: "src/content/blog",
            targetName: "community",
            discourseUrl: "https://community.example.com",
            apiKeyEnv: "TEST_COMMUNITY_DISCOURSE_KEY",
            postAsEnv: "TEST_COMMUNITY_POST_AS",
          },
          {
            name: "regional",
            docsDir: "src/content/blog",
            targetName: "regional",
            discourseUrl: "https://regional.example.com",
            apiKeyEnv: "TEST_REGIONAL_DISCOURSE_KEY",
            apiUsernameEnv: "TEST_BRIDGE_USERNAME",
          },
        ],
      },
    });

    integration.hooks["astro:config:setup"]({
      config: { root: pathToFileURL(`${projectRoot}${path.sep}`) },
      updateConfig() {},
    });
    await integration.hooks["astro:build:start"]({ logger: { info() {} } });

    assert.deepEqual(
      calls.map((call) => [call.hostname, call.apiKey, call.apiUsername]),
      [
        ["community.example.com", "community-secret", "community-editor"],
        ["regional.example.com", "regional-secret", "bridge-bot"],
      ],
    );

    const bindings = targetBindingsFromSource(await readFile(filePath, "utf8"));
    assert.equal(bindings.community.topicId, 401);
    assert.match(bindings.community.topicUrl, /^https:\/\/community\.example\.com\//);
    assert.equal(bindings.regional.topicId, 402);
    assert.match(bindings.regional.topicUrl, /^https:\/\/regional\.example\.com\//);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("TEST_COMMUNITY_DISCOURSE_KEY", originalCommunityKey);
    restoreEnv("TEST_REGIONAL_DISCOURSE_KEY", originalRegionalKey);
    restoreEnv("TEST_COMMUNITY_POST_AS", originalCommunityPostAs);
    restoreEnv("TEST_BRIDGE_USERNAME", originalUsername);
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("publishOnBuild uses the forum-controlled endpoint without exposing its secret", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "discussion-bridge-controlled-build-"));
  const docsDir = path.join(projectRoot, "src", "content", "comments");
  const filePath = path.join(docsDir, "plugin-sandbox.md");
  const originalFetch = globalThis.fetch;
  const originalId = process.env.TEST_BRIDGE_CONNECTION_ID;
  const originalSecret = process.env.TEST_BRIDGE_CONNECTION_SECRET;
  const calls = [];
  const originalSource = [
    "---",
    'title: "Plugin-Controlled Full Interactive Discussion"',
    'discussionCommentsDisplay: "fullInteractive"',
    "---",
    "",
    "The forum owns companion-topic creation policy.",
  ].join("\n");

  try {
    await mkdir(docsDir, { recursive: true });
    await writeFile(filePath, originalSource);
    process.env.TEST_BRIDGE_CONNECTION_ID = "astrostarlight-sandbox";
    process.env.TEST_BRIDGE_CONNECTION_SECRET = "server-only-secret";

    globalThis.fetch = async (url, init = {}) => {
      const headers = new Headers(init.headers);
      const body = JSON.parse(String(init.body));
      calls.push({
        url: String(url),
        redirect: init.redirect,
        hasAbortSignal: init.signal instanceof AbortSignal,
        connection: headers.get("X-DiscussionBridge-Connection"),
        secret: headers.get("X-DiscussionBridge-Secret"),
        body,
      });
      return new Response(JSON.stringify({
        outcome: calls.length === 1 ? "created" : "resolved",
        reason: calls.length === 1 ? "durable_mapping_created" : "existing_mapping",
        topic_id: 908,
        requested: { visibility: "listed" },
        effective: { visibility: "unlisted" },
        core_fallback: false,
      }), {
        status: calls.length === 1 ? 201 : 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const integration = discussionBridge({
      preset: "starlight",
      discourseUrl: "https://sandbox-forum.example.com",
      siteUrl: "https://astrostarlight.example.com",
      publishOnBuild: {
        enabled: true,
        lanes: [{
          name: "plugin-sandbox",
          docsDir: "src/content/comments",
          routeBase: "comments",
          controlledCreation: {
            connectionIdEnv: "TEST_BRIDGE_CONNECTION_ID",
            connectionSecretEnv: "TEST_BRIDGE_CONNECTION_SECRET",
            lane: "comments",
            visibility: "listed",
          },
        }],
      },
    });

    let plugins = [];
    await integration.hooks["astro:config:setup"]({
      config: { root: pathToFileURL(`${projectRoot}${path.sep}`) },
      updateConfig(config) {
        plugins = config.vite?.plugins ?? [];
      },
    });
    const publicConfigSource = plugins[0].load(plugins[0].resolveId("virtual:discussion-bridge/config"));
    assert.doesNotMatch(publicConfigSource, /server-only-secret|TEST_BRIDGE_CONNECTION_SECRET|controlledCreation/);

    await integration.hooks["astro:build:start"]({ logger: { info() {} } });
    const firstSource = await readFile(filePath, "utf8");
    assert.match(firstSource, /discourseTopicId: 908/);
    assert.match(firstSource, /discourseTopicUrl: "https:\/\/sandbox-forum\.example\.com\/t\/908"/);

    // Simulate a recoverable local binding loss: the forum mapping remains and
    // the same adapter request must resolve it without creating another topic.
    await writeFile(filePath, originalSource);
    await integration.hooks["astro:build:start"]({ logger: { info() {} } });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://sandbox-forum.example.com/discussion-bridge/connections/resolve.json");
    assert.equal(calls[0].redirect, "error");
    assert.equal(calls[0].hasAbortSignal, true);
    assert.equal(calls[0].connection, "astrostarlight-sandbox");
    assert.equal(calls[0].secret, "server-only-secret");
    assert.equal(calls[0].body.connection.connection_id, "astrostarlight-sandbox");
    assert.equal(calls[0].body.connection.source_url, "https://astrostarlight.example.com/comments/plugin-sandbox/");
    assert.equal(calls[0].body.connection.lane, "comments");
    assert.equal(calls[0].body.connection.visibility, "listed");
    assert.equal(calls[1].body.connection.source_url, calls[0].body.connection.source_url);
    assert.match(await readFile(filePath, "utf8"), /discourseTopicId: 908/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("TEST_BRIDGE_CONNECTION_ID", originalId);
    restoreEnv("TEST_BRIDGE_CONNECTION_SECRET", originalSecret);
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("forum-controlled publication fails closed on transport and response boundary violations", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "discussion-bridge-controlled-boundaries-"));
  const docsDir = path.join(projectRoot, "content");
  const filePath = path.join(docsDir, "page.md");
  const originalFetch = globalThis.fetch;
  const source = "---\ntitle: Controlled Publication Boundary Test\n---\n\nBody.\n";
  const run = async (fetcher, overrides = {}) => {
    await writeFile(filePath, source);
    globalThis.fetch = fetcher;
    return syncDiscourseTopics({
      docsDir,
      mode: "publish-new",
      siteUrl: "https://site.example.com",
      discourseUrl: "https://forum.example.com",
      controlledCreation: {
        connectionId: "boundary-test",
        connectionSecret: "server-only-secret",
        requestTimeoutMs: 50,
        maxResponseBytes: 64,
        ...overrides,
      },
    });
  };

  try {
    await mkdir(docsDir, { recursive: true });

    await assert.rejects(
      run(async (_url, init) => {
        assert.equal(init.redirect, "error");
        throw new TypeError("redirect mode is set to error for a cross-origin redirect");
      }),
      /cross-origin redirect/,
    );

    await assert.rejects(
      run(async () => {
        const response = new Response(JSON.stringify({
          outcome: "created",
          topic_id: 10,
          core_fallback: false,
        }), { headers: { "Content-Type": "application/json" } });
        Object.defineProperty(response, "url", { value: "https://attacker.invalid/result" });
        return response;
      }),
      /left the configured Discourse origin or path boundary/,
    );

    await assert.rejects(
      run((_url, init) => new Promise((_resolve, reject) => {
        const holdOpen = setTimeout(() => reject(new Error("test timeout")), 1_000);
        init.signal.addEventListener("abort", () => {
          clearTimeout(holdOpen);
          reject(init.signal.reason);
        }, { once: true });
      }), { requestTimeoutMs: 10 }),
      /timeout|aborted/i,
    );

    await assert.rejects(
      run(async () => new Response("x".repeat(65), { headers: { "Content-Type": "application/json" } })),
      /size limit/,
    );
    await assert.rejects(
      run(async () => new Response("{", { headers: { "Content-Type": "application/json" } })),
      /invalid response/i,
    );
    await assert.rejects(
      run(async () => new Response(JSON.stringify({ reason: "connection_disabled" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })),
      /rejected: connection_disabled/,
    );
    await assert.rejects(
      run(async () => new Response(JSON.stringify({
        outcome: "pending",
        topic_id: 10,
        core_fallback: false,
      }), { headers: { "Content-Type": "application/json" } })),
      /unsupported outcome: pending/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(projectRoot, { force: true, recursive: true });
  }
});

function targetBindingsFromSource(source) {
  const rawValue = source.match(/^discussionTargetBindings:\s*(.+)$/m)?.[1];
  assert.ok(rawValue, "discussionTargetBindings frontmatter is present");
  return JSON.parse(JSON.parse(rawValue));
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
