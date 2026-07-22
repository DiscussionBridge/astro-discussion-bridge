import assert from "node:assert/strict";
import test from "node:test";
import {
  discussionTargetLabel,
  resolveDiscussionPresentation,
} from "../dist/targets.js";

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
  });

  assert.equal(presentation.primary.name, "repeal-obbba");
  assert.equal(presentation.primary.topicId, 434);
  assert.equal(presentation.primary.discourseUrl, "https://forum.repealobbba.org");
  assert.equal(presentation.additional.length, 1);
  assert.equal(presentation.additional[0].name, "citizen-activist");
  assert.equal(presentation.additional[0].topicId, 812);
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
