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
  assert.match(discussion, /discussionConnectionJobs/);
  assert.match(discussion, /job\?\.callToAction/);
  assert.match(discussion, /discussion-bridge-additional__description/);
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

test("discussion credit renders once after the complete discussion composition", async () => {
  const discussion = await readFile(
    new URL("../src/components/Discussion.astro", import.meta.url),
    "utf8",
  );
  const credit = await readFile(
    new URL("../src/components/DiscussionCredit.astro", import.meta.url),
    "utf8",
  );

  assert.equal((discussion.match(/<DiscussionCredit/g) ?? []).length, 1);
  assert.ok(
    discussion.indexOf("<DiscussionCredit") > discussion.indexOf("discussion-bridge-additional"),
  );
  assert.match(credit, /data-discussion-bridge-credit/);
  assert.match(credit, /discussion-bridge-credit__prefix/);
  assert.match(credit, /discussion-bridge-credit__brand/);
  assert.match(credit, /aria-label=\{`\$\{credit\.label\} credit`\}/);
  assert.doesNotMatch(credit, /aria-label="Visit DiscussionBridge"/);
  assert.match(credit, /prefers-reduced-motion: reduce/);
  assert.match(credit, /transform: scaleX\(0\)/);
  assert.match(credit, /transform: scaleX\(1\)/);
});

test("source disclosure is accessible and links to the source discussion", async () => {
  const source = await readFile(
    new URL("../src/components/DiscussionSource.astro", import.meta.url),
    "utf8",
  );

  assert.match(source, /aria-label="Content source"/);
  assert.match(source, /<strong>Content source:<\/strong>/);
  assert.match(source, /View the source discussion/);
  assert.match(source, /resolveDiscussionSourceNotice/);
  assert.match(source, /<strong>Official text:<\/strong>/);
  assert.match(source, /parseOfficialTextMetadata/);
});

test("related content renders an accessible cross-lens navigation boundary", async () => {
  const relations = await readFile(
    new URL("../src/components/DiscussionRelations.astro", import.meta.url),
    "utf8",
  );

  assert.match(relations, /aria-label="Related content"/);
  assert.match(relations, /resolveContentRelationships/);
  assert.match(relations, /virtual:discussion-bridge\/relationships/);
  assert.match(relations, /relationship\.entries\.length === 1/);
});

test("progressive navigation renders accessible nested details and active-page state", async () => {
  const navigation = await readFile(
    new URL("../src/components/DiscussionNavigation.astro", import.meta.url),
    "utf8",
  );
  const branch = await readFile(
    new URL("../src/components/DiscussionNavigationBranch.astro", import.meta.url),
    "utf8",
  );
  assert.match(navigation, /aria-label="Content navigation"/);
  assert.match(navigation, /activeNavigationBranch/);
  assert.match(navigation, /<details/);
  assert.match(branch, /<Astro\.self/);
  assert.match(branch, /aria-current=/);
  assert.match(branch, /node\.url \?\? node\.sourceUrl/);
});
