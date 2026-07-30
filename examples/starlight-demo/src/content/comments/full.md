---
title: "Full Comments Mode"
description: "A demo route for bridge-rendered Discourse replies with like counts."
date: "2026-07-17"
discourseTopicId: 33
discourseTopicUrl: "https://forum.discussionbridge.dev/t/full-comments-mode/33"
discussionEmbedUrl: "https://astrostarlight.demo.discussionbridge.dev/comments/full/"
discussionCommentsDisplay: "full"
discussionSourceHash: "53896a0a27804e5494e3f2d8665bbeea34250258027d59b1239a7ea8bd69ed55"
discussionLastSyncedAt: "2026-07-19T06:09:47.251Z"

---

## Full mode

This page uses `discussionCommentsDisplay: "full"`.

Astro renders the Discourse replies directly, including reply metadata such as like counts, then refreshes the topic JSON on page load through the same-origin proxy.

This is the best Tier 1 mode when the Astro page should look like it owns the comment presentation while Discourse remains the source of truth.

## One discussion, different presentation modes

DiscussionBridge lets a site choose how a Discourse conversation appears on an Astro page. The same community topic can support a lightweight embed, a polished native comment view, or a full interactive Discourse iframe.

The important rule is ownership. One Astro page should manage the companion topic's first post. Other pages can display the same discussion for demos, comparisons, or alternate reader experiences without trying to rewrite the Discourse source post.

That gives product teams useful flexibility without creating duplicate first-post fights:

- use `simple` when the site wants Discourse's lightweight embed
- use `full` when the site wants polished native comments
- use `fullInteractive` when logged-in Discourse interaction belongs in the page

This page is the managed comparison page for the comments-mode demo. The simple and full interactive comparison pages display the same discussion with `discussionSync: false`.
