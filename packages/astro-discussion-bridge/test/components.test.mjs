import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native embeds pass an existing topic ID to Discourse", async () => {
  const discussion = await readFile(
    new URL("../src/components/Discussion.astro", import.meta.url),
    "utf8",
  );
  const discourseDiscussion = await readFile(
    new URL("../src/components/DiscourseDiscussion.astro", import.meta.url),
    "utf8",
  );
  const discourseComments = await readFile(
    new URL("../src/components/DiscourseComments.astro", import.meta.url),
    "utf8",
  );

  assert.match(discussion, /topicId=\{topicId\}/);
  assert.match(discussion, /resolveDiscussionPresentation/);
  assert.match(discussion, /aria-label="Additional discussions"/);
  assert.match(discussion, /discourseUrl=\{discourseUrl\}/);
  assert.match(
    discourseDiscussion,
    /\.\.\.\(topicId \? \{ topicId \} : \{ discourseEmbedUrl: embedUrl \}\)/,
  );
  assert.match(
    discourseDiscussion,
    /\.\.\.\(embedClassName \? \{ className: embedClassName \} : \{\}\)/,
  );
  assert.match(discussion, /embedClassName=\{Astro\.props\.embedClassName\}/);
  assert.match(discourseComments, /embedClassName=\{Astro\.props\.embedClassName\}/);
});

test("full replies preserve Mermaid rendering and readable tables", async () => {
  const replies = await readFile(
    new URL("../src/components/DiscourseReplies.astro", import.meta.url),
    "utf8",
  );

  assert.match(replies, /import\("mermaid"\)/);
  assert.match(replies, /code\.language-mermaid/);
  assert.match(replies, /securityLevel: "strict"/);
  assert.match(replies, /data-discussion-bridge-initialized/);
  assert.match(replies, /Mermaid renderer failed to load/);
  assert.match(replies, /\.discussion-bridge-reply__body table/);
  assert.match(replies, /overflow-x: auto/);
});

test("source disclosure is accessible and links to the source discussion", async () => {
  const source = await readFile(
    new URL("../src/components/DiscussionSource.astro", import.meta.url),
    "utf8",
  );

  assert.match(source, /aria-label="Content source"/);
  assert.match(source, /<strong>Source:<\/strong>/);
  assert.match(source, /View the source discussion/);
  assert.match(source, /resolveDiscussionSourceNotice/);
});
