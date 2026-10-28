import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ownedTempFixture } from "./helpers/owned-temp.mjs";
import { findMarkdownFiles, readMarkdownSources, stableExternalId, pageUrlForFile, nativeLifecycle, sourceDate, createNativeMarkdownRenderer,
  renderedPublishedContent, nativeContentIdentity, excerptArticle, parseMarkdown, updateFrontmatter } from "../dist/native-source.js";

test("native corpus/identity/routes preserve existing semantics independently of wire transport", async t => {
  const parent = new URL("../.tmp/", import.meta.url); await mkdir(parent, { recursive: true });
  const root = await ownedTempFixture(t, "discussionbridge-native-source-", fileURLToPath(parent));
  await mkdir(path.join(root, "section"));
  await writeFile(path.join(root, "section/source.md"), "---\ntitle: Native\nconsumerField: retained\n---\n# Source\nλ body\n");
  const files = await findMarkdownFiles(root), read = [];
  for await (const entry of readMarkdownSources(files)) read.push(entry);
  assert.equal(read.length, 1);
  const parsed = parseMarkdown(read[0].source), file = files[0], siteBase = new URL("https://site.example/");
  const id = stableExternalId(siteBase, root, file);
  const first = pageUrlForFile({ docsDir: root, filePath: file, siteBase, routeBase: "articles", hasSlug: false });
  const moved = pageUrlForFile({ docsDir: root, filePath: file, siteBase, routeBase: "articles", hasSlug: true, slug: "different" });
  assert.notEqual(first, moved); assert.equal(stableExternalId(siteBase, root, file), id);
  assert.equal(parseMarkdown(updateFrontmatter(read[0].source, { discussionbridgeExternalId: id })).frontmatter.consumerField, "retained");
  assert.equal(parsed.body, parseMarkdown(updateFrontmatter(read[0].source, { discussionbridgeExternalId: id })).body);
});

test("published native lifecycle, dates and complete sanitized content never derive authority from a delivery clock", async t => {
  const active = { discussionSync: true, discussionCommentsDisplay: "interactive" };
  assert.equal(nativeLifecycle(active), "published"); assert.equal(nativeLifecycle({ ...active, draft: true }), "unpublished");
  assert.equal(nativeLifecycle({ ...active, published: false }), "unpublished"); assert.equal(nativeLifecycle({ ...active, discussionSync: false }), "ineligible");
  assert.equal(nativeLifecycle({ ...active, discussionFromDiscourse: true }), "ineligible"); assert.throws(() => nativeLifecycle({ ...active, draft: "false" }));
  assert.equal(sourceDate(undefined), null); assert.equal(sourceDate("2026-10-14"), null); assert.equal(sourceDate("2026-10-14T03:00:00.000Z"), "2026-10-14T03:00:00.000Z");
  const parent = fileURLToPath(new URL("../.tmp/", import.meta.url)); await mkdir(parent, { recursive: true });
  const root = await ownedTempFixture(t, "discussionbridge-native-content-", parent), file = path.join(root, "source.md");
  const body = "# Native\n\n" + "λ prose. ".repeat(10000) + '\n\n```html\n<script>displayedExample()</script>\n```'; await writeFile(file, body);
  const renderer = await createNativeMarkdownRenderer(), preparation = await renderedPublishedContent(body, file, renderer, "https://site.example/articles/source/"), complete = preparation.preparedHtml;
  const identity = nativeContentIdentity(complete), excerpt = excerptArticle(complete, 1000);
  assert.equal(identity.sha256, createHash("sha256").update(complete).digest("hex")); assert.equal(identity.bytes, Buffer.byteLength(complete));
  assert.ok(identity.bytes > 49152); assert.ok(Buffer.byteLength(excerpt) <= 1000); assert.notEqual(identity.sha256, nativeContentIdentity(excerpt).sha256);
  assert.doesNotMatch(complete, /<script/); assert.match(complete, /displayedExample/); assert.match(complete, /λ prose/); assert.throws(() => nativeContentIdentity("\ud800"));
});
