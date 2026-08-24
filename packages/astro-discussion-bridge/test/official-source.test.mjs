import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  compareOfficialSource,
  extractUsPublicLawSection,
  extractUsPublicLawSectionFromText,
  validateOfficialSourceProfile,
} from "../dist/official-source.js";
import {
  importExistingDiscourseManifest,
  validateImportManifest,
} from "../dist/import-manifest.js";

const officialXml = `<?xml version="1.0" encoding="UTF-8"?>
<law xmlns="http://schemas.gpo.gov/xml/uslm">
  <page identifier="/us/stat/139/80">139 STAT. 80</page>
  <title identifier="/us/pl/119/21/tI">
    <num value="I">TITLE I—</num>
    <heading>TEST TITLE</heading>
    <section identifier="/us/pl/119/21/tI/stA/s10101">
      <num value="10101">SEC. 10101. </num>
      <heading>RE-EVALUATION OF THRIFTY FOOD PLAN.</heading>
      <subsection>
        <num value="a">(a) </num>
        <heading>In General<inline>.—</inline></heading>
        <content>Section 3 of the Food and Nutrition Act of 2008 (<ref>7 U.S.C. 2012</ref>) is amended.
          <paragraph>
            <num value="1">“(1) </num>
            <heading><sidenote><p>Definition.</p></sidenote><inline>In general</inline><inline>.—</inline></heading>
            <content>The official wording remains the same.</content>
          </paragraph>
          <page identifier="/us/stat/139/81">139 STAT. 81</page>
          <paragraph>
            <num value="2">“(2) </num>
            <heading>Household adjustments<inline>.—</inline></heading>
            <content>The Secretary shall make household adjustments.</content>
          </paragraph>
        </content>
      </subsection>
    </section>
    <section identifier="/us/pl/119/21/tI/stA/s10102">
      <num value="10102">SEC. 10102. </num>
      <heading>NEXT SECTION.</heading>
      <content>Not part of Section 10101.</content>
    </section>
  </title>
</law>`;

const communityText = `(a) In General.—Section 3 of the Food and Nutrition Act of 2008 ([7 U.S.C. 2012](https://uscode.house.gov/)) is amended.

“(1) In general.—The official wording remains the same.

“(2) Household adjustments.—The Secretary shall make household adjustments.`;

const officialText = `[[Page 139 STAT. 80]]
SEC. 10101. RE-EVALUATION OF THRIFTY FOOD PLAN.

(a) In General.—Section 3 of the Food and Nutrition Act of 2008 (7 U.S.C. 2012) is amended.
“(1) In general.—The official wording remains the same.
[[Page 139 STAT. 81]]
“(2) Household adjustments.—The Secretary shall make household adjustments.

SEC. 10102. NEXT SECTION.

Not part of Section 10101.`;

const profile = {
  profile: "us-public-law",
  law: "Public Law 119-21",
  title: "Title I",
  congressUrl: "https://www.congress.gov/bill/119th-congress/house-bill/1/text",
  xmlUrl: "https://www.congress.gov/119/plaws/publ21/example.xml",
  textUrl: "https://www.congress.gov/example.txt",
  pdfUrl: "https://www.congress.gov/example.pdf",
  pdfPageOffset: 70,
};

test("USLM extraction retains subsection text and Statutes at Large pages", () => {
  const section = extractUsPublicLawSection(officialXml, "10101");
  assert.equal(section.heading, "RE-EVALUATION OF THRIFTY FOOD PLAN.");
  assert.match(section.text, /^\(a\)\s+In General/);
  assert.match(section.text, /“\(1\)\s+In general/);
  assert.doesNotMatch(section.text, /Definition/);
  assert.doesNotMatch(section.text, /139 STAT/);
  assert.doesNotMatch(section.text, /Not part of Section 10101/);
  assert.deepEqual(section.pages.map((page) => page.page), [80, 81]);
});

test("official source comparison separates presentation from substance", async () => {
  const fetcher = async () => new Response(officialXml, { status: 200 });
  const presentation = await compareOfficialSource({
    source: profile,
    sectionId: "10101",
    communityText,
    checkedAt: "2026-07-23T00:00:00.000Z",
    fetch: fetcher,
  });
  assert.equal(presentation.metadata.comparison, "presentation-only");
  assert.equal(presentation.metadata.citation, "139 Stat. 80-81");
  assert.equal(presentation.metadata.label, "Title I, Section 10101");
  assert.equal(presentation.metadata.heading, "Re-evaluation of thrifty food plan");
  assert.equal(presentation.metadata.pdfUrl, "https://www.congress.gov/example.pdf#page=10");
  assert.match(presentation.metadata.sourceHash, /^[a-f0-9]{64}$/);

  const substantive = await compareOfficialSource({
    source: profile,
    sectionId: "10101",
    communityText: communityText.replace("remains the same", "was materially changed"),
    fetch: fetcher,
  });
  assert.equal(substantive.metadata.comparison, "substantive-difference");
  assert.ok(substantive.firstDifference);
  assert.match(substantive.firstDifference.officialContext, /official wording remains/);
  assert.match(substantive.firstDifference.communityContext, /official wording was materially changed/);
});

test("case-only legal differences require substantive review", async () => {
  const comparison = await compareOfficialSource({
    source: profile,
    sectionId: "10101",
    communityText: communityText.replace("In general", "IN GENERAL"),
    fetch: async () => new Response(officialXml, { status: 200 }),
  });

  assert.equal(comparison.metadata.comparison, "substantive-difference");
  assert.ok(comparison.firstDifference);
  assert.match(comparison.firstDifference.officialContext, /In general/);
  assert.match(comparison.firstDifference.communityContext, /IN GENERAL/);
});

test("official TXT fallback extracts one section and records its source format", async () => {
  const section = extractUsPublicLawSectionFromText(officialText, "10101");
  assert.equal(section.heading, "RE-EVALUATION OF THRIFTY FOOD PLAN.");
  assert.deepEqual(section.pages.map((page) => page.page), [80, 81]);
  assert.doesNotMatch(section.text, /NEXT SECTION/);

  const calls = [];
  const comparison = await compareOfficialSource({
    source: profile,
    sectionId: "10101",
    communityText,
    fetch: async (url) => {
      calls.push(String(url));
      return String(url).endsWith(".xml")
        ? new Response("Unavailable", { status: 503, statusText: "Unavailable" })
        : new Response(officialText, { status: 200 });
    },
  });
  assert.equal(comparison.metadata.sourceFormat, "txt");
  assert.equal(comparison.metadata.comparison, "exact");
  assert.deepEqual(calls, [profile.xmlUrl, profile.textUrl]);
});

test("US public-law profiles reject non-Congress authorities and redirected final sources", async () => {
  assert.throws(
    () => validateOfficialSourceProfile({
      ...profile,
      xmlUrl: "https://attacker.example/public-law.xml",
    }),
    /must be an absolute HTTPS congress\.gov URL/,
  );
  for (const xmlUrl of [
    "https://user:secret@www.congress.gov/public-law.xml",
    "https://www.congress.gov:444/public-law.xml",
  ]) {
    assert.throws(
      () => validateOfficialSourceProfile({ ...profile, xmlUrl }),
      /must be an absolute HTTPS congress\.gov URL/,
    );
  }
  assert.throws(
    () => validateOfficialSourceProfile({
      ...profile,
      xmlUrl: "http://www.congress.gov/public-law.xml",
    }),
    /must be an absolute HTTPS congress\.gov URL/,
  );

  const redirected = new Response(officialXml, { status: 200 });
  Object.defineProperty(redirected, "url", {
    value: "https://attacker.example/redirected.xml",
  });
  await assert.rejects(
    compareOfficialSource({
      source: { ...profile, textUrl: undefined },
      sectionId: "10101",
      communityText,
      fetch: async () => redirected,
    }),
    /final response URL must be an absolute HTTPS congress\.gov URL/,
  );

  const credentialedFinal = new Response(officialXml, { status: 200 });
  Object.defineProperty(credentialedFinal, "url", {
    value: "https://user:secret@www.congress.gov/redirected.xml",
  });
  await assert.rejects(
    compareOfficialSource({
      source: { ...profile, textUrl: undefined },
      sectionId: "10101",
      communityText,
      fetch: async () => credentialedFinal,
    }),
    /final response URL must be an absolute HTTPS congress\.gov URL/,
  );
});

test("official source transport validates redirects and bounds response work", async () => {
  await assert.rejects(
    compareOfficialSource({
      source: { ...profile, textUrl: undefined },
      sectionId: "10101",
      communityText,
      fetch: async () => new Response(null, {
        status: 302,
        headers: { Location: "https://attacker.example/source.xml" },
      }),
    }),
    /redirect URL must be an absolute HTTPS congress\.gov URL/,
  );
  await assert.rejects(
    compareOfficialSource({
      source: { ...profile, textUrl: undefined },
      sectionId: "10101",
      communityText,
      fetch: async () => new Response(null, {
        status: 302,
        headers: { Location: "https://user:secret@www.congress.gov/source.xml" },
      }),
    }),
    /redirect URL must be an absolute HTTPS congress\.gov URL/,
  );

  let loopCalls = 0;
  await assert.rejects(
    compareOfficialSource({
      source: { ...profile, textUrl: undefined },
      sectionId: "10101",
      communityText,
      fetch: async () => {
        loopCalls += 1;
        return new Response(null, { status: 302, headers: { Location: profile.xmlUrl } });
      },
    }),
    /redirect limit/,
  );
  assert.equal(loopCalls, 4);

  await assert.rejects(
    compareOfficialSource({
      source: { ...profile, textUrl: undefined },
      sectionId: "10101",
      communityText,
      fetch: async () => new Response("small", {
        headers: { "Content-Length": String(8 * 1024 * 1024 + 1) },
      }),
    }),
    /exceeds the size limit/,
  );

  await assert.rejects(
    compareOfficialSource({
      source: { ...profile, textUrl: undefined },
      sectionId: "10101",
      communityText,
      fetch: async () => new Response("   "),
    }),
    /empty document/,
  );

  await assert.rejects(
    compareOfficialSource({
      source: { ...profile, textUrl: undefined },
      sectionId: "10101",
      communityText,
      fetch: async (_url, init) => {
        assert.ok(init.signal instanceof AbortSignal);
        assert.equal(init.redirect, "manual");
        throw new DOMException("aborted", "AbortError");
      },
    }),
    /timed out/,
  );
});

test("official source transport cancels early rejections and streamed overflow", async () => {
  for (const mode of ["redirect", "declared", "streamed"]) {
    let cancellations = 0;
    const body = new ReadableStream({
      start(controller) {
        if (mode === "streamed") controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
      },
      cancel() {
        cancellations += 1;
      },
    });
    const response = new Response(body, {
      status: mode === "redirect" ? 302 : 200,
      headers: {
        ...(mode === "redirect" ? { Location: "https://attacker.example/source.xml" } : {}),
        ...(mode === "declared" ? { "Content-Length": String(8 * 1024 * 1024 + 1) } : {}),
      },
    });
    await assert.rejects(
      compareOfficialSource({
        source: { ...profile, textUrl: undefined },
        sectionId: "10101",
        communityText,
        fetch: async () => response,
      }),
    );
    assert.equal(cancellations, 1, `${mode} rejection cancels exactly once`);
  }
});

test("manifest v2 performs a no-write comparison and writes enriched provenance atomically", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-official-source-"));
  const originalFetch = globalThis.fetch;
  const calls = [];
  const manifest = validateImportManifest({
    version: 2,
    officialSources: { "obbba-law": profile },
    imports: [{
      topic: 34,
      output: "obbba-text/title-i/10101.md",
      sourceMode: "discourse-managed",
      sectionId: "10101",
      contentLens: "obbba-text",
      officialSource: "obbba-law",
    }],
  });

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      calls.push(parsed.pathname);
      if (parsed.pathname === "/t/34.json") {
        return jsonResponse({
          id: 34,
          title: "Sec. 10101. Re-evaluation of thrifty food plan",
          category_id: 5,
          tags: ["TITLE-I", { name: "Enrolled-Bill-Text" }],
          post_stream: {
            posts: [{
              id: 40,
              post_number: 1,
              topic_id: 34,
              topic_slug: "sec-10101",
              cooked: "",
            }],
          },
        });
      }
      if (parsed.pathname === "/posts/40.json") {
        return jsonResponse({
          id: 40,
          post_number: 1,
          topic_id: 34,
          topic_slug: "sec-10101",
          username: "editor",
          raw: communityText,
          cooked: "",
        });
      }
      if (parsed.pathname.endsWith("/example.xml")) {
        return new Response(officialXml, { status: 200 });
      }
      return new Response("Not found", { status: 404, statusText: "Not Found" });
    };

    const [preview] = await importExistingDiscourseManifest({
      docsDir: dir,
      siteUrl: "https://onebigbeautifulbill.us",
      discourseUrl: "https://forum.repealobbba.org",
      apiKey: "test-key",
      apiUsername: "obbba-bot",
      manifest,
      dryRun: true,
    });
    assert.equal(preview.status, "dry-run-import");
    assert.equal(preview.officialSourceComparison, "presentation-only");
    assert.equal(preview.officialCitation, "139 Stat. 80-81");
    assert.deepEqual(await readdir(dir), []);

    const [result] = await importExistingDiscourseManifest({
      docsDir: dir,
      siteUrl: "https://onebigbeautifulbill.us",
      discourseUrl: "https://forum.repealobbba.org",
      apiKey: "test-key",
      apiUsername: "obbba-bot",
      manifest,
    });
    assert.equal(result.status, "imported");
    const source = await readFile(path.join(dir, "obbba-text", "title-i", "10101.md"), "utf8");
    assert.match(source, /sectionId: 10101/);
    assert.match(source, /contentLens: "obbba-text"/);
    assert.match(source, /discussionSourceLinkLabel: "Community-maintained wiki topic"/);
    assert.ok(source.includes('discussionSourceTags: "[\\"TITLE-I\\",\\"Enrolled-Bill-Text\\"]"'));
    assert.match(source, /officialText: ".+presentation-only/);
    assert.match(source, /139 Stat\\u002e 80-81|139 Stat\. 80-81/);
    assert.equal(calls.filter((pathname) => pathname.endsWith("/example.xml")).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("manifest v2 rejects unresolved profiles and partial relationship metadata", () => {
  assert.throws(
    () => validateImportManifest({
      version: 2,
      officialSources: { "obbba-law": profile },
      imports: [{
        topic: 34,
        sectionId: "10101",
        contentLens: "obbba-text",
        officialSource: "missing",
      }],
    }),
    /unknown profile: missing/,
  );
  assert.throws(
    () => validateImportManifest({
      version: 2,
      imports: [{ topic: 34, sectionId: "10101" }],
    }),
    /sectionId and contentLens must be configured together/,
  );
});

test("dry runs report unresolved sources while writes block unresolved and substantive differences", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-official-blocks-"));
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/t/34.json") {
        return jsonResponse({
          id: 34,
          title: "Section source review",
          post_stream: {
            posts: [{
              id: 40,
              post_number: 1,
              topic_id: 34,
              topic_slug: "section-source-review",
              cooked: "",
            }],
          },
        });
      }
      if (parsed.pathname === "/posts/40.json") {
        return jsonResponse({
          id: 40,
          post_number: 1,
          topic_id: 34,
          topic_slug: "section-source-review",
          raw: communityText.replace("remains the same", "was materially changed"),
          cooked: "",
        });
      }
      if (parsed.pathname.endsWith("/example.xml")) {
        return new Response(officialXml, { status: 200 });
      }
      return new Response("Not found", { status: 404, statusText: "Not Found" });
    };

    const substantiveManifest = validateImportManifest({
      version: 2,
      officialSources: { "obbba-law": profile },
      imports: [{
        topic: 34,
        sectionId: "10101",
        contentLens: "obbba-text",
        officialSource: "obbba-law",
      }],
    });
    const [substantivePreview] = await importExistingDiscourseManifest({
      docsDir: dir,
      siteUrl: "https://example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test",
      apiUsername: "test",
      manifest: substantiveManifest,
      dryRun: true,
    });
    assert.equal(substantivePreview.officialSourceComparison, "substantive-difference");
    await assert.rejects(
      importExistingDiscourseManifest({
        docsDir: dir,
        siteUrl: "https://example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "test",
        apiUsername: "test",
        manifest: substantiveManifest,
      }),
      /substantive differences for topic\(s\): 34/,
    );

    const unresolvedManifest = validateImportManifest({
      version: 2,
      officialSources: { "obbba-law": profile },
      imports: [{
        topic: 34,
        sectionId: "99999",
        contentLens: "obbba-text",
        officialSource: "obbba-law",
      }],
    });
    const [unresolvedPreview] = await importExistingDiscourseManifest({
      docsDir: dir,
      siteUrl: "https://example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test",
      apiUsername: "test",
      manifest: unresolvedManifest,
      dryRun: true,
    });
    assert.equal(unresolvedPreview.officialSourceComparison, "unresolved");
    assert.match(unresolvedPreview.reason, /does not contain Section 99999/);
    assert.deepEqual(await readdir(dir), []);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

test("existing no-overwrite imports skip before raw post and official-source reads", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "discussion-bridge-official-skip-"));
  const originalFetch = globalThis.fetch;
  const calls = [];
  const manifest = validateImportManifest({
    version: 2,
    officialSources: { "obbba-law": profile },
    imports: [{
      topic: 34,
      output: "existing.md",
      sectionId: "10101",
      contentLens: "obbba-text",
      officialSource: "obbba-law",
    }],
  });
  await writeFile(path.join(dir, "existing.md"), "---\ntitle: Existing\n---\n\nExisting.\n");
  try {
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      calls.push(parsed.pathname);
      if (parsed.pathname === "/t/34.json") {
        return jsonResponse({
          id: 34,
          title: "Existing source",
          post_stream: {
            posts: [{
              id: 40,
              post_number: 1,
              topic_id: 34,
              topic_slug: "existing-source",
            }],
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };
    const [result] = await importExistingDiscourseManifest({
      docsDir: dir,
      siteUrl: "https://example.com",
      discourseUrl: "https://forum.example.com",
      apiKey: "test",
      apiUsername: "test",
      manifest,
    });
    assert.equal(result.status, "skipped");
    assert.deepEqual(calls, ["/t/34.json"]);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { force: true, recursive: true });
  }
});

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
