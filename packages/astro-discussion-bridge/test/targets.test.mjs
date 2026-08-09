import assert from "node:assert/strict";
import test from "node:test";
import {
  discussionTargetLabel,
  discourseUrlFromTopicUrl,
  parseDiscussionConnectionJobs,
  resolveDiscussionPresentation,
} from "../dist/targets.js";

test("discussion forum URL follows the bound topic origin and base path", () => {
  assert.equal(
    discourseUrlFromTopicUrl("https://sandbox-forum.example.com/community/t/plugin-topic/10"),
    "https://sandbox-forum.example.com/community",
  );
  assert.equal(discourseUrlFromTopicUrl(undefined), undefined);
  assert.equal(discourseUrlFromTopicUrl("data:text/html,/t/topic/10"), undefined);
  assert.equal(discourseUrlFromTopicUrl("https://forum.example.com/categories"), undefined);
  assert.equal(discourseUrlFromTopicUrl("https://forum.example.com/t/topic/not-a-number"), undefined);
  assert.equal(discourseUrlFromTopicUrl("https://user:secret@forum.example.com/t/topic/10"), undefined);
});

test("discussion presentation merges a protected source topic with additional targets", () => {
  const presentation = resolveDiscussionPresentation({
    bindings: JSON.stringify({
      "citizen-activist": {
        topicId: 812,
        topicUrl: "https://forum.citizenactivist.network/t/section-impact/812",
        status: "synced",
      },
    }),
    sourceTarget: "repeal-obbba",
    sourceBinding: {
      topicId: 434,
      topicUrl: "https://forum.repealobbba.org/t/section-impact/434",
    },
    primaryTarget: "repeal-obbba",
    requireConnectionJobs: true,
    connectionJobs: {
      "repeal-obbba": {
        purpose: "public OBBBA discussion",
        audience: "Repeal OBBBA community",
        callToAction: "Discuss with the Repeal OBBBA community",
        description: "Follow the public policy discussion.",
      },
      "citizen-activist": {
        purpose: "activist coordination",
        audience: "Citizen Activist Community",
        callToAction: "Discuss with the Citizen Activist Community",
        description: "Connect this section to broader organizing work.",
      },
    },
  });

  assert.equal(presentation.primary.name, "repeal-obbba");
  assert.equal(presentation.primary.topicId, 434);
  assert.equal(presentation.primary.discourseUrl, "https://forum.repealobbba.org");
  assert.equal(presentation.additional.length, 1);
  assert.equal(presentation.additional[0].name, "citizen-activist");
  assert.equal(presentation.additional[0].topicId, 812);
  assert.equal(
    presentation.additional[0].connectionJob.callToAction,
    "Discuss with the Citizen Activist Community",
  );
});

test("discussion presentation requires an explicit primary for multiple linked targets", () => {
  assert.throws(
    () => resolveDiscussionPresentation({
      bindings: {
        community: { topicId: 10, topicUrl: "https://community.example.com/t/page/10" },
        regional: { topicId: 20, topicUrl: "https://regional.example.com/t/page/20" },
      },
    }),
    /set discussionPrimaryTarget explicitly/,
  );
});

test("discussion presentation rejects a primary target without a linked topic", () => {
  assert.throws(
    () => resolveDiscussionPresentation({
      bindings: {
        community: { topicId: 10, topicUrl: "https://community.example.com/t/page/10" },
      },
      primaryTarget: "regional",
    }),
    /has no linked topic/,
  );
});

test("discussion target labels are readable by default", () => {
  assert.equal(discussionTargetLabel("citizen-activist"), "Citizen Activist");
  assert.equal(discussionTargetLabel("repeal_obbba"), "Repeal Obbba");
});

test("explicit connection jobs require complete reader-facing metadata", () => {
  assert.deepEqual(
    parseDiscussionConnectionJobs(JSON.stringify({
      community: {
        purpose: "product support",
        audience: "DiscussionBridge Community",
        callToAction: "Ask the DiscussionBridge Community",
        description: "Get implementation help and share what you learn.",
      },
    })),
    {
      community: {
        purpose: "product support",
        audience: "DiscussionBridge Community",
        callToAction: "Ask the DiscussionBridge Community",
        description: "Get implementation help and share what you learn.",
      },
    },
  );

  assert.throws(
    () => parseDiscussionConnectionJobs({
      community: {
        purpose: "support",
        audience: "",
        callToAction: "Ask for help",
        description: "Get help.",
      },
    }),
    /audience.*non-empty string/,
  );
});

test("required connection jobs fail before rendering anonymous targets", () => {
  assert.throws(
    () => resolveDiscussionPresentation({
      bindings: {
        community: { topicId: 10, topicUrl: "https://community.example.com/t/page/10" },
      },
      requireConnectionJobs: true,
    }),
    /require an explicit connection job: community/,
  );
});
