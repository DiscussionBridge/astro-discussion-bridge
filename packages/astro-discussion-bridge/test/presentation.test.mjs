import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import discussionBridge from "../dist/index.js";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("presentation preserves simple, full, and mapped fullInteractive modes followed by one credit", async () => {
  const discussion = await fs.readFile(path.join(packageDir, "src/components/Discussion.astro"), "utf8");
  const discourse = await fs.readFile(path.join(packageDir, "src/components/DiscourseDiscussion.astro"), "utf8");
  const replies = await fs.readFile(path.join(packageDir, "src/components/DiscourseReplies.astro"), "utf8");
  assert.equal((discussion.match(/<DiscourseDiscussion\b/g) ?? []).length, 1);
  assert.equal((discussion.match(/<DiscourseReplies\b/g) ?? []).length, 1);
  assert.equal((discussion.match(/<DiscussionCredit\b/g) ?? []).length, 1);
  assert.match(discussion, /display === "simple"/);
  assert.match(discussion, /fullApp=\{display === "fullInteractive"\}/);
  assert.match(discussion, /<DiscourseDiscussion[\s\S]*sourceUrl=\{Astro\.props\.sourceUrl\}/);
  assert.match(replies, /post\.post_number > 1/);
  assert.match(replies, /sanitizeHtml/);
  assert.match(discourse, /const resolvedTopicId = topicId \?\? topicReference\?\.topicId/);
  assert.match(discourse, /resolvedTopicId \? \{ topicId: resolvedTopicId \} : \{ discourseEmbedUrl: sourceUrl \}/);
  assert.match(discourse, /fullInteractive requires one completed Bridge topic mapping/);
  assert.match(discourse, /fullApp \? \{ fullApp: true/);
  assert.doesNotMatch(discussion, /targets?|relationships?|navigation/i);
});

test("plugin-free full mode can start from the canonical Astro page URL", async () => {
  const discussion = await fs.readFile(path.join(packageDir, "src/components/Discussion.astro"), "utf8");
  const discourse = await fs.readFile(path.join(packageDir, "src/components/DiscourseDiscussion.astro"), "utf8");
  assert.match(discussion, /<DiscourseDiscussion[\s\S]*sourceUrl=\{Astro\.props\.sourceUrl\}/);
  assert.match(discourse, /Astro\.props\.sourceUrl \?\? Astro\.url\.href/);
  assert.match(discourse, /normalizePublicHttpUrl/);
  assert.match(discourse, /define:vars=\{\{[^}]*sourceUrl/);
  assert.match(discourse, /discourseEmbedUrl: sourceUrl/);
});

test("From Discourse component renders only server-retrieved sanitized record content", async () => {
  const component = await fs.readFile(path.join(packageDir, "src/components/FromDiscourse.astro"), "utf8");
  assert.match(component, /fetchFromDiscourseRecord/);
  assert.match(component, /astro-discussion-bridge\/bridge-record/);
  assert.match(component, /process\.env\.DISCUSSIONBRIDGE_CONNECTION_SECRET/);
  assert.match(component, /set:html=\{record\.contentHtml\}/);
  assert.match(component, /record\.topicUrl/);
  assert.doesNotMatch(component, /client:|X-DiscussionBridge|connectionSecret\}/);
});

test("Core owns dynamic height and configured ceilings fail closed", () => {
  assert.throws(() => discussionBridge({
    discourseUrl: "https://forum.example/",
    comments: { embedMaxHeight: "900px" },
  }), /height ceilings/);
  assert.throws(() => discussionBridge({
    discourseUrl: "https://forum.example/",
    comments: { embedViewportMaxHeight: "80vh" },
  }), /height ceilings/);
  assert.doesNotThrow(() => discussionBridge({
    discourseUrl: "https://forum.example/",
    comments: { dynamicHeight: true, embedMaxHeight: "none", embedViewportMaxHeight: "none" },
  }));
});
