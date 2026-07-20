---
title: "Core Astro Discussion Bridge Demo"
description: "A plain Astro content collection page proving Discussion Bridge does not depend on Starlight."
pubDate: "2026-07-19"
tags:
  - discussionbridge
  - astro
  - demo
discussionCommentsDisplay: "simple"
discourseTopicId: 34
discourseTopicUrl: "https://forum.discussionbridge.dev/t/core-astro-discussion-bridge-demo/34"
discussionSourceHash: "16652b9b17bfa6f1b4e09e3b59bb6de54b6b7816ddb245be70cdd4a87c2c1216"
discussionLastSyncedAt: "2026-07-19T17:15:05.119Z"

---

# Core Astro Discussion Bridge Demo

This page is intentionally not a Starlight page. It uses a normal Astro content collection, a regular route, and a site layout that decides where the discussion belongs.

That is the important product test. Discussion Bridge for Astro should not require a documentation framework. Starlight gets a polished preset because Starlight has its own page model, but regular Astro sites should be able to place the bridge exactly where their templates need it.

In this demo, the article owns the reading experience. The discussion section appears after the article body, before any site footer or surrounding chrome. That keeps comments attached to the content rather than hidden inside global layout furniture.

The page uses simple embed mode for the first plain-Astro pass. That lets the comment block render from the page URL before a companion topic has been published. Once a topic ID exists, the same layout can opt into polished `full` rendering or full Discourse interaction.

The same publish and sync commands can target this collection with `--route-base blog`, so the content lane behavior remains consistent across plain Astro and Starlight.
