import assert from "node:assert/strict";
import test from "node:test";
import {
  discussionTargetLabel,
  discourseUrlFromTopicUrl,
  parseDiscussionTargetBindings,
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

test("discussion target bindings are exact, bounded, and contain safe topic links", () => {
  assert.deepEqual(
    parseDiscussionTargetBindings({
      community: {
        topicId: 21,
        topicUrl: "https://forum.example.com/community/t/topic/21",
        status: "synced",
      },
    }),
    {
      community: {
        topicId: 21,
        topicUrl: "https://forum.example.com/community/t/topic/21",
        sourceHash: undefined,
        lastSyncedAt: undefined,
        status: "synced",
        lastError: undefined,
        lastAttemptedAt: undefined,
      },
    },
  );

  for (const binding of [
    { topicUrl: "javascript:alert(1)" },
    { topicUrl: "data:text/html,/t/topic/21" },
    { topicUrl: "//forum.example.com/t/21" },
    { topicUrl: "https://user:secret@forum.example.com/t/21" },
    { topicUrl: "https://forum.example.com/categories" },
    { topicId: 22, topicUrl: "https://forum.example.com/t/topic/21" },
    { topicId: Number.MAX_SAFE_INTEGER + 1 },
    { topicId: 21, typoField: "ignored no longer" },
    { topicId: 21, lastError: "x".repeat(2_049) },
  ]) {
    assert.throws(() => parseDiscussionTargetBindings({ community: binding }));
  }
  assert.throws(
    () => parseDiscussionTargetBindings(Object.fromEntries(
      Array.from({ length: 33 }, (_, index) => [`target-${index}`, { topicId: index + 1 }]),
    )),
    /more than 32 targets/,
  );
  assert.throws(
    () => parseDiscussionTargetBindings({ ["x".repeat(65)]: { topicId: 1 } }),
    /target name/,
  );
  assert.throws(
    () => resolveDiscussionPresentation({
      bindings: Object.fromEntries(
        Array.from({ length: 32 }, (_, index) => [`target-${index}`, { topicId: index + 1 }]),
      ),
      sourceTarget: "source-target",
      sourceBinding: { topicId: 100 },
    }),
    /more than 32 targets/,
  );
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
  assert.throws(
    () => parseDiscussionConnectionJobs({
      ["x".repeat(65)]: {
        purpose: "support", audience: "community", callToAction: "Discuss", description: "Help",
      },
    }),
    /target name/,
  );
  assert.throws(
    () => parseDiscussionConnectionJobs({
      community: {
        purpose: "support", audience: "community", callToAction: "Discuss",
        description: "x".repeat(2_049),
      },
    }),
    /description.*exceeds 2048/,
  );
  assert.throws(
    () => parseDiscussionConnectionJobs(Object.fromEntries(
      Array.from({ length: 33 }, (_, index) => [`target-${index}`, {
        purpose: "support", audience: "community", callToAction: "Discuss", description: "Help",
      }]),
    )),
    /more than 32 connection jobs/,
  );

  const limits = { purpose: 256, audience: 256, callToAction: 512, description: 2_048 };
  for (const [field, limit] of Object.entries(limits)) {
    const exact = {
      purpose: "p", audience: "a", callToAction: "c", description: "d",
      [field]: "x".repeat(limit),
    };
    assert.equal(parseDiscussionConnectionJobs({ community: exact }).community[field], exact[field]);
    assert.throws(
      () => parseDiscussionConnectionJobs({ community: { ...exact, [field]: "x".repeat(limit + 1) } }),
      new RegExp(`${field}.*exceeds ${limit}`),
    );
  }
  assert.equal(
    parseDiscussionConnectionJobs({
      community: { purpose: "é".repeat(128), audience: "a", callToAction: "c", description: "d" },
    }).community.purpose,
    "é".repeat(128),
  );
  assert.throws(
    () => parseDiscussionConnectionJobs({
      community: { purpose: "é".repeat(129), audience: "a", callToAction: "c", description: "d" },
    }),
    /purpose.*exceeds 256/,
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
