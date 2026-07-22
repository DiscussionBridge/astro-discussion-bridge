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

  assert.match(discussion, /topicId=\{Astro\.props\.topicId\}/);
  assert.match(
    discourseDiscussion,
    /\.\.\.\(topicId \? \{ topicId \} : \{ discourseEmbedUrl: embedUrl \}\)/,
  );
});
