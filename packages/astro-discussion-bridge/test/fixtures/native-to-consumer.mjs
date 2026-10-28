import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "astro";
import integration from "../../dist/index.js";

export async function buildToConsumer(state, packedRoot, nativeCapture = false, fullSource = false) {
  await mkdir(path.join(state.root, "src/pages/articles"), { recursive: true });
  await writeFile(path.join(state.root, "package.json"), JSON.stringify({ name: "test-owned-current-v4-to-consumer", private: true, type: "module" }));
  await writeFile(path.join(state.root, "src/content.config.ts"), `import { defineCollection, z } from 'astro:content'; import { glob } from 'astro/loaders'; export const collections = { docs: defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/docs' }), schema: z.object({ title: z.string(), consumerField: z.string() }).passthrough() }) };`);
  const packageRoot = packedRoot ?? fileURLToPath(new URL("../../", import.meta.url));
  const privateKey = `discussionbridge-native-consumer-${randomUUID()}`;
  const captureImports = nativeCapture ? `import {experimental_AstroContainer as Container} from 'astro/container';
import {fileURLToPath} from 'node:url';
import privateBinding from 'test-owned-native-source-binding';` : "";
  const captureCode = nativeCapture ? `const container=await Container.create();
await privateBinding.beforeCapture?.();
const captured=await privateBinding.capture(privateBinding.options,{filePath:fileURLToPath(new URL(entry.filePath,${JSON.stringify(pathToFileURL(state.root + path.sep).href)})),nativeBody:entry.body,sourceArticleUrl:Astro.url.href,render:async()=>{const html=await container.renderToString(Content,{request:Astro.request}); await privateBinding.afterRender?.(html); return html;}});
const frontmatter=captured.frontmatter;` : "const frontmatter=entry.data;";
  const article = fullSource ? `<article {...privateBinding.attributes(captured.source)}><h1 data-discussionbridge-source-title>{entry.data.title}</h1><div data-discussionbridge-source-content={frontmatter.discussionbridgeExternalId} set:html={captured.source.nativeHtml}/><Discussion frontmatter={frontmatter}/></article>` : `<article data-native-resource={frontmatter.discussionbridgeResourceId}><h1>{entry.data.title}</h1><Content/><Discussion frontmatter={frontmatter}/></article>`;
  await writeFile(path.join(state.root, "src/pages/articles/[slug].astro"), `---
import { getCollection, render } from 'astro:content';
import Discussion from ${JSON.stringify(path.join(packageRoot, "src/components/Discussion.astro").replaceAll("\\", "/"))};
${captureImports}
export async function getStaticPaths() { return (await getCollection('docs', entry => !entry.data.draft && entry.data.published !== false)).map(entry => ({ params: { slug: ${fullSource ? "entry.data.slug ?? entry.id" : "entry.id"} }, props: { entry } })); }
const { entry } = Astro.props; const { Content } = await render(entry);
${captureCode}
---
<!doctype html><html><head><title>{entry.data.title}</title></head><body><header>Consumer owns brand</header><nav>Consumer owns navigation</nav>${article}<footer>Consumer owns footer</footer></body></html>`);
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  const ownResolve = value => {
    const exported = manifest.exports[value === manifest.name ? "." : "." + value.slice(manifest.name.length)];
    const target = typeof exported === "string" ? exported : exported?.import;
    assert.equal(typeof target, "string"); return path.resolve(packageRoot, target);
  };
  const runtimeRoot = "C:/CodeProjects/Products/DiscussionBridge/codex crap/astro/packages/astro-discussion-bridge/node_modules";
  const runtime = createRequire(path.join(runtimeRoot, "astro/package.json"));
  const plugin = packedRoot ? (await import(pathToFileURL(path.join(packedRoot, "dist/index.js")).href)).default : integration;
  // This no-install fixture binds the actual exported package module in the
  // server process. A normal installed consumer uses a server-only import.
  const capture = (await import(pathToFileURL(ownResolve("astro-discussion-bridge/controlled-creation")).href))[fullSource ? "captureControlledSourceNative" : "captureNativeRenderedSource"];
  assert.equal(typeof capture, "function");
  const attributes = fullSource ? (await import(pathToFileURL(path.join(packageRoot,"dist/to-source-profile.js")).href)).sourceArticleAttributes : undefined;
  globalThis[privateKey] = { options: state.options, capture, attributes, beforeCapture: state.beforeCapture, afterRender: state.afterRender };
  try { await build({ root: pathToFileURL(state.root + path.sep), configFile: false, site: state.options.siteUrl, force: true, logLevel: "silent", trailingSlash: "always",
    integrations: [plugin({ discourseUrl: state.options.discourseUrl, siteUrl: state.options.siteUrl, comments: { credit: { enabled: false } }, publishOnBuild: { enabled: true,
      docsDir: state.docsDir, stateFile: state.options.stateFile, routeBase: state.options.routeBase, ...state.options.controlledCreation } })],
    vite: { plugins: [{name:'test-owned-server-binding',resolveId(id){return id==='test-owned-native-source-binding'?'\0test-owned-native-source-binding':undefined;},load(id){return id==='\0test-owned-native-source-binding'?`export default globalThis[${JSON.stringify(privateKey)}];`:undefined;}}], resolve: { alias: [
      { find: "astro", replacement: "astro", customResolver: value => runtime.resolve(value) },
      { find: manifest.name, replacement: manifest.name, customResolver: ownResolve },
      { find: "sanitize-html", replacement: path.join(runtimeRoot, "sanitize-html") },
      { find: "dompurify", replacement: path.join(runtimeRoot, "dompurify") },
    ] } } }); } finally { delete globalThis[privateKey]; }
  try { return await readFile(path.join(state.root, `dist/articles/${state.expectedSlug ?? "source"}/index.html`), "utf8"); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
