---
title: "Full Comments Mode"
description: "A demo route for bridge-rendered Discourse replies with like counts."
date: "2026-07-17"
discourseTopicId: 27
discourseTopicUrl: "https://forum.discussionbridge.dev/t/using-content-lanes-with-discussion-bridge-for-astro/27"
discussionEmbedUrl: "https://astrostarlightdemo.discussionbridge.dev/blog/content-lanes/"
discussionCommentsDisplay: "full"
---

## Full mode

This page uses `discussionCommentsDisplay: "full"`.

Astro renders the Discourse replies directly, including reply metadata such as like counts, then refreshes the topic JSON on page load through the same-origin proxy.

This is the best Tier 1 mode when the Astro page should look like it owns the comment presentation while Discourse remains the source of truth.
