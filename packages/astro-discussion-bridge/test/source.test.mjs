import assert from "node:assert/strict";
import test from "node:test";

import { resolveDiscussionSourceNotice } from "../dist/source.js";

test("source notices are absent for Astro-managed pages", () => {
  assert.equal(resolveDiscussionSourceNotice({ mode: "astro-managed" }), undefined);
  assert.equal(resolveDiscussionSourceNotice({}), undefined);
});

test("imported pages disclose their origin and prefer the imported URL", () => {
  assert.deepEqual(
    resolveDiscussionSourceNotice({
      mode: "discourse-imported",
      sourceLabel: "Repeal OBBBA Forum",
      importedFrom: "https://forum.example.com/t/imported/42",
      legacyTopicUrl: "https://forum.example.com/t/comments/43",
    }),
    {
      mode: "discourse-imported",
      message: "This page originated in Repeal OBBBA Forum and was imported here for publication.",
      sourceUrl: "https://forum.example.com/t/imported/42",
    },
  );
});

test("managed pages resolve the protected source target binding", () => {
  assert.deepEqual(
    resolveDiscussionSourceNotice({
      mode: "discourse-managed",
      sourceTarget: "source-community",
      bindings: JSON.stringify({
        "source-community": {
          topicId: 42,
          topicUrl: "https://forum.example.com/t/source/42",
          status: "synced",
        },
        regional: {
          topicId: 84,
          topicUrl: "https://regional.example.com/t/companion/84",
          status: "synced",
        },
      }),
    }),
    {
      mode: "discourse-managed",
      message: "This page is managed in Discourse and published here for easier reading.",
      sourceUrl: "https://forum.example.com/t/source/42",
    },
  );
});

test("source notices expose a safe Discourse source-author profile", () => {
  assert.deepEqual(
    resolveDiscussionSourceNotice({
      mode: "discourse-managed",
      sourceUrl: "https://forum.example.com/t/managed-guide/36",
      sourceAuthorUsername: "editorbridgeforum",
      sourceAuthorName: "DiscussionBridge Forum Editor",
    }),
    {
      mode: "discourse-managed",
      message: "This page is managed in Discourse and published here for easier reading.",
      sourceUrl: "https://forum.example.com/t/managed-guide/36",
      sourceAuthorUsername: "editorbridgeforum",
      sourceAuthorName: "DiscussionBridge Forum Editor",
      sourceAuthorProfileUrl: "https://forum.example.com/u/editorbridgeforum",
    },
  );
});

test("source notices discard unsafe source-author usernames", () => {
  const notice = resolveDiscussionSourceNotice({
    mode: "discourse-managed",
    sourceUrl: "https://forum.example.com/t/managed-guide/36",
    sourceAuthorUsername: "../admin",
    sourceAuthorName: "Not safe",
  });

  assert.equal(notice?.sourceAuthorUsername, undefined);
  assert.equal(notice?.sourceAuthorProfileUrl, undefined);
});

test("source-author profiles preserve a Discourse subfolder base path", () => {
  const notice = resolveDiscussionSourceNotice({
    mode: "discourse-managed",
    sourceUrl: "https://example.com/forum/t/managed-guide/36",
    sourceAuthorUsername: "editorbridgeforum",
    sourceAuthorName: "DiscussionBridge Forum Editor",
  });

  assert.equal(
    notice?.sourceAuthorProfileUrl,
    "https://example.com/forum/u/editorbridgeforum",
  );
});

test("source notices fail closed on an invalid target binding", () => {
  assert.throws(
    () => resolveDiscussionSourceNotice({
      mode: "discourse-imported",
      sourceUrl: "javascript:alert(document.domain)",
      importedFrom: "data:text/html,unsafe",
      sourceTarget: "source-community",
      bindings: {
        "source-community": { topicUrl: "not a URL" },
      },
      legacyTopicUrl: "https://forum.example.com/t/safe-source/42",
    }),
    /Invalid discussionTargetBindings/,
  );
});

test("source notices reject active URL schemes and use the next safe unbound candidate", () => {
  assert.deepEqual(
    resolveDiscussionSourceNotice({
      mode: "discourse-imported",
      sourceUrl: "javascript:alert(document.domain)",
      importedFrom: "data:text/html,unsafe",
      legacyTopicUrl: "https://forum.example.com/t/safe-source/42",
    }),
    {
      mode: "discourse-imported",
      message: "This page originated in Discourse and was imported here for publication.",
      sourceUrl: "https://forum.example.com/t/safe-source/42",
    },
  );
});

test("source notices reject credentials and bounded malformed values before a safe candidate", () => {
  for (const unsafe of [
    "https://user:secret@forum.example.com/source",
    "https:\\forum.example.com\\source",
    "https://forum.example.com/source\n",
    `https://forum.example.com/${"x".repeat(2_100)}`,
  ]) {
    assert.equal(
      resolveDiscussionSourceNotice({
        mode: "discourse-managed",
        sourceUrl: unsafe,
        legacyTopicUrl: "https://forum.example.com/t/safe-source/42?view=source#first",
      })?.sourceUrl,
      "https://forum.example.com/t/safe-source/42?view=source#first",
    );
  }
});

test("source notices remain visible without a link when every URL is unsafe", () => {
  assert.deepEqual(
    resolveDiscussionSourceNotice({
      mode: "discourse-managed",
      sourceUrl: "javascript:alert(1)",
      importedFrom: "data:text/html,unsafe",
      legacyTopicUrl: "relative/topic/42",
    }),
    {
      mode: "discourse-managed",
      message: "This page is managed in Discourse and published here for easier reading.",
      sourceUrl: undefined,
    },
  );
});
