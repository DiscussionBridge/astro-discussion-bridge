import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { verifyControlledSourcePublic } from "../dist/cms-to-source-build.js";
import { sourceArticleAttributes, validateSourceCapture } from "../dist/to-source-profile.js";
import { semanticIdentity } from "../src/private/cms-runtime.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const at = "2026-10-25T11:00:00.000Z", url = "https://source.example/articles/new/";
function fixture() {
  const nativeHtml = '<p>Complete native body.</p><pre><code>&lt;template&gt;displayed code&lt;/template&gt;</code></pre><template><p>Authored supplementary template</p></template>';
  const receipt = { version: 1, profile: "discussionbridge-astro-source-html-1", connectionId: `dbc_${"a".repeat(24)}`, scopeRevision: "scope", serverOrigin: "https://forum.example", siteOrigin: "https://source.example",
    rootDev: "1", rootIno: "1", nativeId: "source.md", externalId: "source-one", resourceId: "11111111-1111-4111-8111-111111111111", topicId: "53", canonicalUrl: url, sourceRevision: "moved-edition", fence: 1,
    originalArticleSha256: sha("Complete native body."), preparedSourceSha256: sha(nativeHtml), preparedSourceBytes: Buffer.byteLength(nativeHtml), nativeSnapshotSha256: sha("synthetic native snapshot"),
    moveId: "22222222-2222-4222-8222-222222222222", proofNonce: Buffer.alloc(32, 7).toString("base64url") };
  const capture = { buildId: "33333333-3333-4333-8333-333333333333", file: "C:/synthetic-native/source.md", fileSha256: sha("synthetic file"), originalKey: sha("synthetic original key"), canonicalUrl: url,
    revision: receipt.sourceRevision, birthBase: "https://source.example/articles/old/", nativeHtml, ownership: receipt, ownershipSha256: sha(semanticIdentity(receipt)), title: "Native article", authors: [{ id: "writer", name: "Writer" }] };
  const escaped = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const attrs = Object.entries(sourceArticleAttributes(capture)).filter(([, value]) => value !== undefined).map(([name, value]) => `${name}="${escaped(value)}"`).join(" ");
  const title = '<h1 data-discussionbridge-source-title>Native article</h1>', content = `<div data-discussionbridge-source-content="source-one">${nativeHtml}</div>`;
  const article = `<article ${attrs}>${title}${content}</article>`;
  const page = body => `<!doctype html><html><head><title>Native article</title></head><body>${body}</body></html>`;
  const built = page(article);
  capture.build = { file: "C:/synthetic-native/dist/articles/new/index.html", html: built, builtAt: at, sha256: sha(built), dependencyMarkup: [], assets: [] };
  validateSourceCapture(capture);
  const verify = async (html = built, type = "text/html; charset=UTF-8", expectedCalls = 1) => {
    const before = structuredClone(capture); let calls = 0;
    try {
      return await verifyControlledSourcePublic(capture, at, at, async (address, init) => {
        calls++; assert.equal(address, url); assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error");
        assert.deepEqual(Object.keys(init.headers).sort(), ["Accept", "Accept-Encoding"].sort());
        const response = new Response(html, { headers: { "content-type": type } }); Object.defineProperty(response, "url", { value: url }); return response;
      });
    } finally { assert.equal(calls, expectedCalls); assert.deepEqual(capture, before, "proof does not rewrite original/private evidence"); }
  };
  return { capture, article, title, content, page, verify };
}

test("source proof keeps genuine native content, displayed code and unrelated authored template", async () => {
  const f = fixture(), proof = await f.verify();
  assert.equal(proof.url, url); assert.equal(proof.source_revision, f.capture.revision);
  assert.equal(proof.source_content_sha256, f.capture.ownership.preparedSourceSha256);
});

for (const boundary of ["article", "title", "content"]) {
  for (const container of ["template", "hidden", "inert"]) test(`source proof rejects ${container} ancestry of owned ${boundary}`, async () => {
    const f = fixture(), selected = f[boundary];
    const inactive = container === "template" ? `<template>${selected}</template>` : `<div ${container}>${selected}</div>`;
    const html = f.page(f.article.replace(selected, inactive));
    f.capture.build.html = html; f.capture.build.sha256 = sha(html); validateSourceCapture(f.capture);
    await assert.rejects(f.verify(html, undefined, 0), /inactive|active|hidden|inert|template/iu);
  });
  for (const attribute of ["hidden", "inert"]) test(`source proof rejects ${attribute} on owned ${boundary} itself`, async () => {
    const f = fixture(), selected = f[boundary], inactive = selected.replace(/^<([a-z][a-z0-9-]*)/u, `<$1 ${attribute}`);
    const html = f.page(f.article.replace(selected, inactive));
    f.capture.build.html = html; f.capture.build.sha256 = sha(html); validateSourceCapture(f.capture);
    await assert.rejects(f.verify(html, undefined, 0), /inactive|active|hidden|inert/iu);
  });
}

for (const container of ["template", "hidden", "inert"]) test(`source proof rejects public-only ${container} ancestor after a genuine native build`, async () => {
  const f = fixture(), inactive = container === "template" ? `<template>${f.article}</template>` : `<div ${container}>${f.article}</div>`;
  await assert.rejects(f.verify(f.page(inactive)), /inactive|active|hidden|inert|template/iu);
});

test("changed native content and issued nonce still cannot produce source proof", async () => {
  const f = fixture();
  await assert.rejects(f.verify(f.page(f.article.replace("Complete native body.", "Changed native body."))), /COMPLETE|native source/iu);
  await assert.rejects(f.verify(f.page(f.article.replace(f.capture.ownership.proofNonce, "wrong"))), /challenge|identity/iu);
});

const acceptedTypes = ["text/html", "TEXT/HTML", "text/html ; charset = UTF-8", 'text/html;charset="UTF-8"', 'text/html; note="a;b"', 'text/html; note="charset=iso-8859-1";charset=UTF-8', "text/html;charset=UTF-8; profile=ordinary", 'text/html; note="escaped\\\"quote"; charset=UTF-8'];
const rejectedTypes = ["text/html-notreally; charset=UTF-8", "application/xhtml+xml", "text/plain", "text/html; charset=iso-8859-1", "text/html; charset=windows-1252", "text/html; charset=UTF-16", 'text/html; charset=""', "text/html; charset", "text/html; charset=UTF-8; charset=iso-8859-1", "text/html; charset=UTF-8; charset=UTF-8", "text/html, text/plain", "text/html; charset=UTF-8, text/html", 'text/html; charset="UTF-8'];
for (const type of acceptedTypes) test(`source proof accepts unambiguous native HTML metadata ${type}`, async () => { await fixture().verify(undefined, type); });
for (const type of rejectedTypes) test(`source proof rejects conflicting/ambiguous HTML metadata ${type}`, async () => { await assert.rejects(fixture().verify(undefined, type), /HTML|UTF|charset|media|content.type/iu); });

const styleAttribute = style => style.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
const styled = (node, style) => node.replace(/^<([a-z][a-z0-9-]*)/u, `<$1 style="${styleAttribute(style)}"`);
for (const boundary of ["article", "title", "content"]) for (const style of ["display: none", "visibility: hidden !important"]) {
  for (const location of ["self", "ancestor"]) test(`source proof rejects explicit ${style} on ${boundary} ${location}`, async () => {
    const f = fixture(), selected = f[boundary], inactive = location === "self" ? styled(selected, style) : `<div style="${styleAttribute(style)}">${selected}</div>`;
    const html = f.page(f.article.replace(selected, inactive));
    f.capture.build.html = html; f.capture.build.sha256 = sha(html); validateSourceCapture(f.capture);
    await assert.rejects(f.verify(html, undefined, 0), /inactive|hidden|display|visibility/iu);
  });
}
for (const style of ["display:none", "visibility:hidden"]) test(`source proof rejects public-only inline ${style} ancestor`, async () => {
  const f = fixture();
  await assert.rejects(f.verify(f.page(`<div style="${styleAttribute(style)}">${f.article}</div>`)), /inactive|hidden|display|visibility/iu);
});
test("source proof permits benign inline styles and quoted custom-property text on actual owned boundaries", async () => {
  const styles = ['--note:"display:none; visibility:hidden"; color:blue', "color: #123456; font-weight: bold", "display:none; display:block", "visibility:hidden; visibility:visible !important"];
  for (const boundary of ["article", "title", "content"]) for (const style of styles) {
    const f = fixture(), html = f.page(f.article.replace(f[boundary], styled(f[boundary], style)));
    f.capture.build.html = html; f.capture.build.sha256 = sha(html); validateSourceCapture(f.capture);
    await f.verify(html);
  }
});

test("source proof rejects known raw-text/native inactive contexts around each owned boundary", async () => {
  for (const container of ["noscript", "textarea", "script", "style", "title", "xmp", "iframe", "noembed", "noframes", "plaintext"]) {
    for (const boundary of ["article", "title", "content"]) {
      const f = fixture(), html = f.page(f.article.replace(f[boundary], `<${container}>${f[boundary]}</${container}>`));
      f.capture.build.html = html; f.capture.build.sha256 = sha(html); validateSourceCapture(f.capture);
      await assert.rejects(f.verify(html, undefined, 0), /inactive|missing|boundary|source|owner/iu, `${container}/${boundary}`);
    }
  }
});
