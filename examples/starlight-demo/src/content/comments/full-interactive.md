---
title: "Full Interactive Comments Mode"
description: "A demo route for Discourse's full app iframe embed."
date: "2026-07-17"
discourseTopicId: 27
discourseTopicUrl: "https://forum.discussionbridge.dev/t/using-content-lanes-with-discussion-bridge-for-astro/27"
discussionEmbedUrl: "https://astrostarlightdemo.discussionbridge.dev/blog/content-lanes/"
discussionCommentsDisplay: "fullInteractive"
---

## Full interactive mode

This page uses `discussionCommentsDisplay: "fullInteractive"`.

It hands the embedded area back to Discourse as a full app iframe. When Discourse embedding allows it, logged-in users can use Discourse-native interactions such as reply, like, quote, and moderation flows inside the embedded experience.

This demo intentionally points at the same live test topic as the other comments-mode pages so only the rendering mode changes.

For product teams, the appeal of this mode is that the publication and the conversation can keep their own strengths. Astro keeps the article fast, structured, versioned, and pleasant to read. Discourse keeps identity, trust levels, notifications, moderation, quoting, reactions, and the long-running social context that makes a community useful after the original page has shipped.

That split matters most on pages where the comments are not decoration. A release note may need follow-up questions. A docs page may reveal rough edges in an integration. A launch post may become the place where customers compare real usage notes. In those cases, an embedded Discourse surface is not just a comment box; it is the living edge of the page.

The full interactive embed is intentionally more Discourse-shaped than the bridge-rendered `full` mode. The iframe owns the signed-in composer, reply buttons, profile links, quote flows, and topic navigation. Astro owns the surrounding page and decides where the discussion belongs in the reading experience.

This longer demo body is also a layout test. With enough article content above the discussion, the embedded composer should not dominate the first viewport. Readers encounter the page first, then arrive at the live Discourse surface when they reach the comments section.

That is the intended comparison point for this mode: a site-native article with a real Discourse discussion waiting below it, rather than a short test page where the iframe is visible immediately and the fixed composer feels louder than it would in a normal article.
