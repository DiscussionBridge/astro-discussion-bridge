import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import discussionBridge from "../dist/index.js";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("presentation has one mapped fullInteractive surface followed by one credit", async () => {
  const discussion = await fs.readFile(path.join(packageDir, "src/components/Discussion.astro"), "utf8");
  const discourse = await fs.readFile(path.join(packageDir, "src/components/DiscourseDiscussion.astro"), "utf8");
  assert.equal((discussion.match(/<DiscourseDiscussion\b/g) ?? []).length, 1);
  assert.equal((discussion.match(/<DiscussionCredit\b/g) ?? []).length, 1);
  assert.ok(discussion.indexOf("<DiscussionCredit") > discussion.indexOf("<DiscourseDiscussion"));
  assert.match(discussion, /config\.comments\.enabled\s*&&[\s\S]*<DiscourseDiscussion[\s\S]*<DiscussionCredit/);
  assert.match(discourse, /const resolvedTopicId = topicId \?\? topicReference\?\.topicId/);
  assert.match(discourse, /topicId: resolvedTopicId/);
  assert.doesNotMatch(discourse, /discourseEmbedUrl|fullApp:\s*false|simple/);
  assert.doesNotMatch(discussion, /DiscourseReplies|targets?|relationships?|navigation/i);
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
