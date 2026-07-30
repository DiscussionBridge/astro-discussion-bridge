import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyImportBodyEdits,
  importExistingDiscourseTopics,
  reviewedCommunitySha256,
  validateImportBodyEdits,
} from "../dist/import-existing.js";
import { validateImportManifest } from "../dist/import-manifest.js";

test("reviewed body edits remove one bounded annotation and restore one terminal entry", () => {
  const removed = applyImportBodyEdits(
    "Legal text.\n\n**Footnotes:** Not [found in US Code](https://example.test/code); apparently—a direction to the Secretary. Extra note.\n\n(d) **Tree assistance program**.—Section 1501 applies.",
    [{
      operation: "remove-between-phrases",
      startPhrase: "Footnotes Not found in US Code apparently a direction to the Secretary",
      endPhrase: "(d) Tree assistance program",
    }],
    60,
  );
  assert.doesNotMatch(removed, /Footnotes Not found/);
  assert.match(removed, /\(d\) \*\*Tree assistance program\*\*/);
  assert.match(removed, /\*\*Tree assistance program\*\*/);

  const restored = applyImportBodyEdits(
    "(b) **Clerical amendment**.—The table is amended by adding at the end the following:",
    [{
      operation: "append-after-terminal-phrase",
      terminalPhrase: "by adding at the end the following:",
      content: "“20306. Special appropriations for Mars missions, Artemis missions, and Moon to Mars program.”.",
    }],
    99,
  );
  assert.match(restored.trimEnd(), /“20306\. Special appropriations.*program\.”\.$/s);
});

test("reviewed body edits fail closed on missing, duplicate, reversed, or nonterminal markers", () => {
  const remove = {
    operation: "remove-between-phrases",
    startPhrase: "annotation begins",
    endPhrase: "legal text resumes",
  };
  assert.throws(() => applyImportBodyEdits("no markers", [remove], 60), /matched 0 times.*no content was written/i);
  assert.throws(
    () => applyImportBodyEdits("annotation begins x annotation begins legal text resumes", [remove], 60),
    /matched 2 times.*no content was written/i,
  );
  assert.throws(
    () => applyImportBodyEdits("legal text resumes before annotation begins", [remove], 60),
    /out of order/i,
  );
  assert.throws(
    () => applyImportBodyEdits("anchor followed by drift", [{
      operation: "append-after-terminal-phrase",
      terminalPhrase: "anchor",
      content: "restored",
    }], 99),
    /terminal phrase did not match.*no content was written/i,
  );
  assert.throws(
    () => validateImportBodyEdits([{ operation: "replace-anything", content: "unsafe" }]),
    /unsupported operation/i,
  );
});

test("raw marker boundaries preserve block wrappers without absorbing semantic prefixes", () => {
  const edit = {
    operation: "remove-between-phrases",
    startPhrase: "review note",
    endPhrase: "(d) Tree assistance program",
  };
  assert.equal(
    applyImportBodyEdits(
      "Law.\n\n  - **[review note](https://example.test/note)** extra\n\n  - (d) **Tree assistance program**.—Law resumes.",
      [edit],
      60,
    ),
    "Law.\n\n  - (d) **Tree assistance program**.—Law resumes.",
  );
  assert.equal(
    applyImportBodyEdits(
      "Law.\n\nSemantic prefix: **review note** extra\n\nSemantic subsection prefix: (d) **Tree assistance program**.—Law resumes.",
      [edit],
      60,
    ),
    "Law.\n\nSemantic prefix:\n\n(d) **Tree assistance program**.—Law resumes.",
  );
});

test("body edits require pre-edit and post-transform review pins before direct API or manifest I/O", async () => {
  let networkCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    networkCalls += 1;
    return new Response("unexpected", { status: 500 });
  };
  const edit = {
    operation: "append-after-terminal-phrase",
    terminalPhrase: "reviewed ending",
    content: "approved addition",
  };
  try {
    await assert.rejects(
      importExistingDiscourseTopics({
        docsDir: "unused",
        siteUrl: "https://example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "fake-key",
        apiUsername: "fake-user",
        topics: ["99"],
        bodyEdits: [edit],
      }),
      /bodyEdits require expectedCommunitySha256.*expectedImportedBodySha256/i,
    );
    assert.equal(networkCalls, 0);

    await assert.rejects(
      importExistingDiscourseTopics({
        docsDir: "unused",
        siteUrl: "https://example.com",
        discourseUrl: "https://forum.example.com",
        apiKey: "fake-key",
        apiUsername: "fake-user",
        topics: ["35"],
        expectedCommunityHashProfile: "legal-text",
      }),
      /expectedCommunityHashProfile requires expectedCommunitySha256/i,
    );
    assert.equal(networkCalls, 0);

    assert.throws(
      () => validateImportManifest({
        version: 2,
        imports: [{
          topic: 99,
          sectionId: "40005",
          contentLens: "obbba-text",
          expectedCommunitySha256: "a".repeat(64),
          expectedPostUpdatedAt: "2026-07-26T00:00:00.000Z",
          bodyEdits: [edit],
        }],
      }),
      /bodyEdits require expectedCommunitySha256.*expectedImportedBodySha256/i,
    );
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dry-run executes body transforms and rejects marker or post-transform drift", async () => {
  const raw = "Law begins.\n\nFootnotes: operator note.\n\n(d) Tree assistance program.—Law resumes.";
  const expected = "Law begins.\n\n(d) Tree assistance program.—Law resumes.";
  const edit = {
    operation: "remove-between-phrases",
    startPhrase: "Footnotes",
    endPhrase: "(d) Tree assistance program",
  };
  const temporary = await mkdtemp(path.join(os.tmpdir(), "bridge-body-edit-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/t/60")) {
      return Response.json({
        id: 60,
        title: "Section 10401",
        category_id: 1,
        tags: [],
        post_stream: {
          posts: [{
            id: 600,
            post_number: 1,
            topic_id: 60,
            topic_slug: "section-10401",
            raw,
            updated_at: "2026-07-26T00:00:00.000Z",
            username: "canary",
          }],
        },
      });
    }
    if (String(url).includes("/posts/600")) {
      return Response.json({
        id: 600,
        post_number: 1,
        topic_id: 60,
        topic_slug: "section-10401",
        raw,
        updated_at: "2026-07-26T00:00:00.000Z",
        username: "canary",
      });
    }
    return new Response("unexpected", { status: 404 });
  };
  const base = {
    docsDir: temporary,
    siteUrl: "https://example.test",
    discourseUrl: "https://forum.example.test",
    apiKey: "fake-canary",
    apiUsername: "canary",
    topics: ["60"],
    dryRun: true,
    expectedCommunitySha256: reviewedCommunitySha256(raw, "legal-text"),
    expectedCommunityHashProfile: "legal-text",
    expectedPostUpdatedAt: "2026-07-26T00:00:00.000Z",
    expectedImportedBodyHashProfile: "enrolled-legal-text",
    bodyEdits: [edit],
  };
  try {
    await assert.rejects(
      importExistingDiscourseTopics({
        ...base,
        bodyEdits: [{ ...edit, startPhrase: "missing reviewed marker" }],
        expectedImportedBodySha256: reviewedCommunitySha256(expected, "enrolled-legal-text"),
      }),
      /matched 0 times.*no content was written/i,
    );
    await assert.rejects(
      importExistingDiscourseTopics({
        ...base,
        expectedImportedBodySha256: "f".repeat(64),
      }),
      /does not match the reviewed imported-body SHA-256/i,
    );
    const result = await importExistingDiscourseTopics({
      ...base,
      expectedImportedBodySha256: reviewedCommunitySha256(expected, "enrolled-legal-text"),
    });
    assert.equal(result[0].status, "dry-run-import");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temporary, { recursive: true, force: true });
  }
});

test("legal-text review hashes ignore Markdown link presentation but raw-review hashes do not", () => {
  const linked = "Section 1 amends [7 U.S.C. 2012](https://uscode.house.gov/view).";
  const plain = "Section 1 amends 7 U.S.C. 2012.";
  assert.equal(
    reviewedCommunitySha256(linked, "legal-text"),
    reviewedCommunitySha256(plain, "legal-text"),
  );
  assert.notEqual(
    reviewedCommunitySha256(linked, "reviewed-raw"),
    reviewedCommunitySha256(plain, "reviewed-raw"),
  );
  assert.throws(() => validateImportManifest({
    version: 2,
    imports: [{
      topic: 35,
      sectionId: "10102",
      contentLens: "obbba-text",
      expectedCommunityHashProfile: "legal-text",
    }],
  }), /HashProfile requires expectedCommunitySha256/i);
});
