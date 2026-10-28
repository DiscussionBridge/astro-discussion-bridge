import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { ownedPng } from "./helpers/native-png.mjs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "astro";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import { nativeSource, toFixture } from "./fixtures/cms-to.mjs";

test("public native collection render/container captures the actual ordinary Markdown image asset URL", async t => {
  const article = "![Actual native managed image](../assets/native.png)";
  const state = await toFixture(t, nativeSource(article), "53"), captureFile = path.join(state.root, ".discussionbridge/native-asset-proof.json");
  await mkdir(path.join(state.root, "src/content/assets"), { recursive: true }); await writeFile(path.join(state.root, "src/content/assets/native.png"), ownedPng());
  await mkdir(path.join(state.root, "src/pages/articles"), { recursive: true }); await mkdir(path.dirname(captureFile), { recursive: true });
  await writeFile(path.join(state.root, "package.json"), JSON.stringify({ name: "test-owned-native-asset-capture", private: true, type: "module" }));
  await writeFile(path.join(state.root, "src/content.config.ts"), `import { defineCollection,z } from 'astro:content'; import {glob} from 'astro/loaders'; export const collections={docs:defineCollection({loader:glob({pattern:'**/*.md',base:'./src/content/docs'}),schema:z.object({title:z.string()}).passthrough()})};`);
  await writeFile(path.join(state.root, "src/pages/articles/[slug].astro"), `---
import {getCollection,render} from 'astro:content';
import {experimental_AstroContainer as Container} from 'astro/container';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export async function getStaticPaths(){return(await getCollection('docs')).map(entry=>({params:{slug:entry.id},props:{entry}}));}
const {entry}=Astro.props; const {Content}=await render(entry);
const container=await Container.create();
const html=await container.renderToString(Content,{request:Astro.request});
await writeFile(${JSON.stringify(captureFile)},JSON.stringify({filePath:fileURLToPath(new URL(entry.filePath,${JSON.stringify(pathToFileURL(state.root + path.sep).href)})),body:entry.body,sourceArticleUrl:Astro.url.href,html}));
---
<!doctype html><html><head><title>{entry.data.title}</title></head><body><header>Native consumer</header><Content/></body></html>`);
  const runtimeRoot = "C:/CodeProjects/Products/DiscussionBridge/codex crap/astro/packages/astro-discussion-bridge/node_modules";
  const nativeRuntime = createRequire(path.join(runtimeRoot, "astro/package.json"));
  await build({ root: pathToFileURL(state.root + path.sep), configFile: false, site: state.options.siteUrl, force: true, trailingSlash: "always", logLevel: "silent",
    vite: { resolve: { alias: [{ find: "astro", replacement: "astro", customResolver: value => nativeRuntime.resolve(value) }] } } });
  const captured = JSON.parse(await readFile(captureFile, "utf8")), built = await readFile(path.join(state.root, "dist/articles/source/index.html"), "utf8");
  assert.equal(path.resolve(captured.filePath), state.file);
  const originalSource = await readFile(state.file, "utf8"); assert.equal(originalSource, nativeSource(article), "native original including LF stays intact");
  // Installed native Markdown getEntryInfo uses public frontmatter content.trim;
  // this matches its entry view, never rewrites the retained original article.
  assert.equal(captured.body, parseFrontmatter(originalSource).content.trim()); assert.equal(captured.sourceArticleUrl, "https://astro.example/articles/source/");
  assert.doesNotMatch(captured.html, /__ASTRO_IMAGE_/u);
  const source = /\bsrc="([^"]+)"/u.exec(captured.html)?.[1]; assert.ok(source, "native Content/container retains its actual image URL");
  assert.ok(built.includes(`src="${source}"`), "normal native page and isolated native body use the same asset URL");
  const localAsset = new URL(source, captured.sourceArticleUrl); assert.equal(localAsset.origin, state.options.siteUrl);
  const asset = await readFile(path.join(state.root, "dist", localAsset.pathname)); assert.ok(asset.length > 0, "native build actually emitted the referenced asset");
  assert.equal(state.received.length, 0, "this is public native API seam proof, not a Bridge resolve or live publication");
  t.diagnostic(`Actual native Content/container captured ${Buffer.byteLength(captured.html)} body bytes and emitted ${asset.length} asset bytes; no guessed image target/private marker decoding.`);
});
