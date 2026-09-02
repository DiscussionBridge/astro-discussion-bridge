import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import discussionBridge from "../dist/index.js";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("default integration is inert and its virtual module contains no credential", async () => {
  const integration = discussionBridge({
    discourseUrl: "https://forum.example/",
    siteUrl: "https://site.example/",
    connectionId: "not-a-public-option",
  });
  let plugin;
  await integration.hooks["astro:config:setup"]({
    config: { root: pathToFileURL(`${packageDir}${path.sep}`) },
    updateConfig(config) { plugin = config.vite.plugins[0]; },
  });
  const resolved = plugin.resolveId("virtual:discussion-bridge/config");
  const source = plugin.load(resolved);
  assert.doesNotMatch(source, /secret|connectionId|connectionSecret/i);
  assert.match(source, /\"display\":\"full\"/);
  let logged = false;
  await integration.hooks["astro:build:start"]({ logger: { info() { logged = true; } } });
  assert.equal(logged, false);
});

test("enabled controlled publishing fails closed without server credentials", async () => {
  const oldId = process.env.DISCUSSIONBRIDGE_CONNECTION_ID;
  const oldSecret = process.env.DISCUSSIONBRIDGE_CONNECTION_SECRET;
  delete process.env.DISCUSSIONBRIDGE_CONNECTION_ID;
  delete process.env.DISCUSSIONBRIDGE_CONNECTION_SECRET;
  try {
    const integration = discussionBridge({
      discourseUrl: "https://forum.example/",
      siteUrl: "https://site.example/",
      publishOnBuild: { enabled: true },
    });
    await assert.rejects(
      () => integration.hooks["astro:build:start"]({ logger: { info() {} } }),
      /requires server-only/,
    );
  } finally {
    if (oldId === undefined) delete process.env.DISCUSSIONBRIDGE_CONNECTION_ID;
    else process.env.DISCUSSIONBRIDGE_CONNECTION_ID = oldId;
    if (oldSecret === undefined) delete process.env.DISCUSSIONBRIDGE_CONNECTION_SECRET;
    else process.env.DISCUSSIONBRIDGE_CONNECTION_SECRET = oldSecret;
  }
});

test("package and source inventory expose only the eight-profile Astro adapter boundary", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(packageDir, "package.json"), "utf8"));
  assert.deepEqual(packageJson.bin, { "discussionbridge-astro": "./dist/cli.js" });
  assert.deepEqual(Object.keys(packageJson.exports).sort(), [
    ".",
    "./Discussion.astro",
    "./DiscussionCredit.astro",
    "./DiscourseDiscussion.astro",
    "./DiscourseReplies.astro",
    "./FromDiscourse.astro",
    "./bridge-record",
    "./controlled-creation",
    "./native-publication",
    "./web-url",
  ].sort());
  assert.deepEqual(packageJson.dependencies, { "@astrojs/markdown-remark": "7.2.4", dompurify: "3.2.7", "sanitize-html": "2.17.7", yaml: "^2.9.0" });
  assert.equal(packageJson.files.includes("src/simple-live.ts"), true);
  assert.equal(packageJson.files.includes("TODO.md"), false);

  const forbidden = /api[-_ ]?key|sync[-_ ]?existing|official[-_ ]?source|relationships?|navigation|multi[-_ ]?target|OBBBA|WordPress|Ghost|Statamic|control plane/i;
  for (const relative of ["src", "package.json", ".env.example"]) {
    const candidate = path.join(packageDir, relative);
    const stat = await fs.stat(candidate);
    const files = stat.isDirectory() ? await walk(candidate) : [candidate];
    for (const file of files) assert.doesNotMatch(await fs.readFile(file, "utf8"), forbidden, file);
  }
});

async function walk(root) {
  const files = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(candidate));
    else if (entry.isFile()) files.push(candidate);
  }
  return files;
}
