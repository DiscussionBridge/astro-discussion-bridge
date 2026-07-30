import assert from "node:assert/strict";
import test from "node:test";
import {
  extractEnrolledSections,
  fetchJsonWithRetry,
  htmlText,
  removeKnownPresentationArtifacts,
  stripMarkdownLinks,
  tokenDiff,
} from "../../../scripts/enrolled-source-lib.mjs";

test("legacy enrolled extraction preserves inline small caps and quoted internal hierarchy", () => {
  const markup = `
    <span class="lbexSectionlevelOLC">SEC. 40005. </span></div></a></p>
    <p><span style="font-size:110%">I</span>N GENERAL &mdash; text.</p>
    <a href="#quoted" id="toc-quoted"><span class="lbexSubChapterLevelOLC">“subchapter C</span>
    <p>Quoted structure remains.</p>
    <a href="#next-part" id="toc-next-part"><span class="lbexSectionlevelOLCBold">PART II</span>
    <p>Authored hierarchy must not leak.</p>
    <span class="lbexSectionlevelOLC">SEC. 40006. </span></div></a></p><p>Next.</p>`;
  const sections = extractEnrolledSections(markup);
  assert.equal(
    sections.get("40005"),
    "IN GENERAL — text. “subchapter C Quoted structure remains.",
  );
  assert.equal(sections.get("40006"), "Next.");
});

test("enrolled analyzer network reads block redirects and bound 429 cleanup", async () => {
  let attempts = 0;
  const resultPromise = fetchJsonWithRetry({
    url: "https://forum.example.com/posts/1.json",
    apiKey: "key",
    apiUsername: "reader",
    fetch: async (_url, init) => {
      attempts += 1;
      assert.equal(init.redirect, "error");
      if (attempts === 5) return new Response("Rate limited", { status: 429 });
      return new Response(new ReadableStream({
        cancel() {
          return new Promise(() => {});
        },
      }), { status: 429, headers: { "Retry-After": "0" } });
    },
  });
  await assert.rejects(resultPromise, /429/);
  assert.equal(attempts, 5);

  let forbiddenAttempts = 0;
  await assert.rejects(
    fetchJsonWithRetry({
      url: "https://forum.example.com/posts/1.json",
      apiKey: "key",
      apiUsername: "reader",
      fetch: async () => {
        forbiddenAttempts += 1;
        return new Response("Forbidden", { status: 403 });
      },
    }),
    /403/,
  );
  assert.equal(forbiddenAttempts, 1);
});

test("legacy enrolled extraction stops at attestation and keeps entities readable", () => {
  const markup = `
    <span class="lbexSectionlevelOLC">SEC. 100205. </span></div></a></p>
    <p>Final &ldquo;text&rdquo; &amp; value.</p>
    <p class="lbexIndent"> Attest: </p><p>Speaker</p>`;
  assert.equal(
    extractEnrolledSections(markup).get("100205"),
    'Final "text" & value.',
  );
  assert.equal(extractEnrolledSections("<p>not a section</p>").size, 0);
});

test("presentation handling is explicit and token differences remain visible", () => {
  const prepared = removeKnownPresentationArtifacts(
    "SEC 70101 Example heading bgcolor f49c0e Body text",
    "Sec. 70101. Example heading",
  );
  assert.deepEqual(prepared, {
    text: "Body text",
    artifacts: ["matching-section-heading", "legacy-bgcolor-residue"],
  });
  assert.equal(stripMarkdownLinks("[chapter](https://example.com/a_(b)) text"), "chapter text");
  assert.deepEqual(tokenDiff(["a", "b", "c"], ["a", "x", "c"]).edits, {
    enrolledChangedSpanTokens: 1,
    communityChangedSpanTokens: 1,
  });
  assert.equal(htmlText("<span>A</span>B<br>C"), "AB C");
});
