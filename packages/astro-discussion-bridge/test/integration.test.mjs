import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import discussionBridge from "../dist/index.js";

test("invalid site-level connection jobs fail during integration setup", () => {
  assert.throws(
    () => discussionBridge({
      discourseUrl: "https://community.example.com",
      connections: {
        jobs: {
          community: {
            purpose: "product support",
            audience: "Discussion Bridge Community",
            callToAction: "Ask the Discussion Bridge Community",
            description: "Get implementation help.",
            unsupported: undefined,
          },
        },
      },
    }),
    /Invalid connections\.jobs: connection job for target "community" has unsupported field\(s\): unsupported/,
  );
});

test("publishOnBuild lanes can publish one page to independent Discourse targets", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "discussion-bridge-build-targets-"));
  const docsDir = path.join(projectRoot, "src", "content", "blog");
  const filePath = path.join(docsDir, "shared.md");
  const originalFetch = globalThis.fetch;
  const originalCommunityKey = process.env.TEST_COMMUNITY_DISCOURSE_KEY;
  const originalRegionalKey = process.env.TEST_REGIONAL_DISCOURSE_KEY;
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
            apiUsernameEnv: "TEST_BRIDGE_USERNAME",
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
        ["community.example.com", "community-secret", "bridge-bot"],
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
    restoreEnv("TEST_BRIDGE_USERNAME", originalUsername);
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
