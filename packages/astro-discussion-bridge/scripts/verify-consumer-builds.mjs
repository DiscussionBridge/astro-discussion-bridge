import { build } from "astro";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import discussionBridge from "../dist/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const astroCli = path.join(packageRoot, "node_modules", "astro", "bin", "astro.mjs");
const execFileAsync = promisify(execFile);
const root = await mkdtemp(path.join(os.tmpdir(), "discussionbridge-astro-consumers-"));

try {
  const astroRoot = path.join(root, "astro");
  await mkdir(path.join(astroRoot, "src", "pages"), { recursive: true });
  await linkConsumerDependencies(astroRoot);
  await writeFile(path.join(astroRoot, "src", "pages", "index.astro"), `---
import Discussion from "astro-discussion-bridge/Discussion.astro";
const shared = { discussionbridgeNativePublication: true, discourseTopicUrl: "https://forum.example/t/example/53", discourseTopicId: 53 };
globalThis.fetch = async () => new Response(JSON.stringify({ post_stream: { posts: [], stream: [] } }), { status: 200, headers: { "content-type": "application/json" } });
---
<main data-discussionbridge-resource-id="11111111-1111-4111-8111-111111111111"><pre><code class="lang-mermaid">flowchart TD</code></pre><p>\\$x^2\\$</p><table><tbody><tr><td>Rich</td></tr></tbody></table></main>
<Discussion frontmatter={{ ...shared, discussionCommentsDisplay: "simple" }} />
<Discussion frontmatter={{ ...shared, discussionCommentsDisplay: "full" }} />
<Discussion frontmatter={{ ...shared, discussionCommentsDisplay: "interactive" }} />
`, "utf8");
  await build({
    root: pathToFileURL(`${astroRoot}${path.sep}`),
    outDir: path.join(astroRoot, "dist"),
    logLevel: "error",
    vite: { resolve: { preserveSymlinks: true } },
    integrations: [discussionBridge({ discourseUrl: "https://forum.example/", comments: { display: "full" } })],
  });

  const starlightRoot = path.join(root, "starlight");
  await mkdir(path.join(starlightRoot, "src", "content", "docs"), { recursive: true });
  await linkConsumerDependencies(starlightRoot);
  await writeFile(path.join(starlightRoot, "astro.config.mjs"), `import { defineConfig } from "astro/config";\nimport starlight from "@astrojs/starlight";\nimport discussionBridge from "astro-discussion-bridge";\nexport default defineConfig({ vite: { resolve: { preserveSymlinks: true } }, integrations: [starlight({ title: "DiscussionBridge Starlight" }), discussionBridge({ discourseUrl: "https://forum.example/", comments: { display: "full" } })] });\n`, "utf8");
  await writeFile(path.join(starlightRoot, "src", "content.config.ts"), `import { defineCollection } from "astro:content";\nimport { docsLoader } from "@astrojs/starlight/loaders";\nimport { docsSchema } from "@astrojs/starlight/schema";\nexport const collections = { docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }) };\n`, "utf8");
  await writeFile(path.join(starlightRoot, "src", "content", "docs", "index.mdx"), `---
title: DiscussionBridge Starlight
discussionbridgeNativePublication: true
discussionCommentsDisplay: full
discourseTopicId: 53
discourseTopicUrl: https://forum.example/t/example/53
---
import Discussion from "astro-discussion-bridge/Discussion.astro";

<div data-discussionbridge-resource-id="11111111-1111-4111-8111-111111111111"><pre><code className="lang-mermaid">flowchart TD</code></pre><p>$x^2$</p><table><tbody><tr><td>Rich</td></tr></tbody></table></div>

<Discussion frontmatter={frontmatter} />
`, "utf8");
  await execFileAsync(process.execPath, [astroCli, "build", "--root", starlightRoot, "--silent"], { windowsHide: true, maxBuffer: 1024 * 1024 });
  process.stdout.write(`${JSON.stringify({ astro: "built", starlight: "built", presentations: ["simple", "full", "interactive"], clientNavigationHook: "astro:page-load" })}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}

async function linkConsumerDependencies(consumerRoot) {
  const sourceNodeModules = path.join(packageRoot, "node_modules");
  const consumerNodeModules = path.join(consumerRoot, "node_modules");
  await mkdir(consumerNodeModules, { recursive: true });

  for (const entry of await readdir(sourceNodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    await symlink(
      path.join(sourceNodeModules, entry.name),
      path.join(consumerNodeModules, entry.name),
      "junction",
    );
  }

  await symlink(
    packageRoot,
    path.join(consumerNodeModules, "astro-discussion-bridge"),
    "junction",
  );
}
