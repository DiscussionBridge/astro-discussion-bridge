# Content Lanes Guide

A content lane maps a group of Astro content to Discourse behavior.

One Astro or Starlight site may publish several kinds of content:

- docs
- blog posts
- news posts
- release notes
- comments-mode demos

Each lane can use its own source directory, route base, category, tags, listing behavior, notification settings, and comments display mode.

## Why Lanes Matter

Lanes keep one site from becoming one undifferentiated publishing pipe.

For example:

- docs can publish to a support or documentation category
- blog posts can publish to a general discussion category
- news posts can publish to announcements
- release notes can publish to releases
- demo/test topics can be unlisted while still supporting direct links and embeds

This keeps Astro as the publishing surface and Discourse as the relationship surface, without losing editorial structure.

## CLI Lane Pattern

Run commands from the Astro project root.

Docs lane:

```sh
npx astro-discussion-bridge publish-new src/content/docs \
  --discourse-url https://forum.example.com \
  --site-url https://docs.example.com \
  --category-id 5 \
  --tags discussionbridge,docs \
  --dry-run \
  --details
```

Blog lane:

```sh
npx astro-discussion-bridge sync-existing src/content/blog \
  --route-base blog \
  --discourse-url https://forum.example.com \
  --site-url https://docs.example.com \
  --category-id 6 \
  --tags discussionbridge,blog \
  --dry-run \
  --details
```

Release lane:

```sh
npx astro-discussion-bridge publish-and-sync src/content/releases \
  --route-base releases \
  --discourse-url https://forum.example.com \
  --site-url https://docs.example.com \
  --category-id 7 \
  --tags discussionbridge,releases \
  --dry-run \
  --details
```

Remove `--dry-run` only after the preview shows the expected page URLs, titles, tags, category, and topic IDs.

## Build Hook Lanes

Keep build publishing opt-in.

```js
discussionBridge({
  provider: "discourse",
  discourseUrl: "https://forum.example.com",
  siteUrl: "https://docs.example.com",
  publishOnBuild: {
    enabled: true,
    lanes: [
      {
        name: "docs",
        docsDir: "src/content/docs",
        categoryId: 5,
        tags: ["discussionbridge", "docs"],
      },
      {
        name: "blog",
        docsDir: "src/content/blog",
        routeBase: "blog",
        categoryId: 6,
        tags: ["discussionbridge", "blog"],
      },
      {
        name: "releases",
        docsDir: "src/content/releases",
        routeBase: "releases",
        categoryId: 7,
        tags: ["discussionbridge", "releases"],
      },
    ],
  },
});
```

Use explicit CLI dry runs before enabling build publishing for a lane.

## Frontmatter Overrides

Pages can override lane defaults when needed.

```yaml
title: Content Lanes With Full Comments
discourseCategoryId: 6
discussionTags: "discussionbridge, blog"
discussionCommentsDisplay: full
discussionSummary: |
  This page explains how one Astro site can publish multiple content lanes into Discourse.
```

Use `discussionSummary` when the Astro source contains components, MDX JSX, Starlight directives, local images, charts, Mermaid, math, or other content that should be curated before syncing to Discourse.

Use `discussionSync: false` when a page should display an existing Discourse discussion but should not publish or sync the companion topic first post.

## Content Tags And Discourse Tags

`discussionTags` are Discourse topic tags. They are explicit bridge metadata.

Astro content tags are site/template metadata. Astro does not require one universal tag system, and Starlight does not provide a public blog-style tag taxonomy by default. A template may define its own `tags`, `contentTags`, or similar field.

For Alpha, keep these layers separate:

- use `discussionTags` or lane `tags` for Discourse topic tags
- leave ordinary Astro/template tags to the site template
- keep the Starlight demo close to official Starlight, with Discussion Bridge fields added deliberately
- use `preset: "starlight"` for Starlight documentation sites and `preset: "astro"` for broader Astro content sites

A future Discussion Bridge feature can optionally map content tags to Discourse tags when configured. That should be opt-in so sites can keep editorial taxonomy separate from forum taxonomy.

Possible future config shape:

```js
discussionBridge({
  tags: {
    fromFrontmatter: "tags",
    fallback: ["discussionbridge"],
  },
});
```

Use `discussionbridge.dev` or another tag-capable Astro template to prove normal Astro content tags separately from `discussionTags`.

## Route Base

Use `--route-base` when the source directory does not map directly to the site root.

Examples:

- `src/content/blog/content-lanes.md` with `--route-base blog` becomes `/blog/content-lanes/`
- `src/content/news/content-lanes-live.md` with `--route-base news` becomes `/news/content-lanes-live/`
- `src/content/releases/2_1.md` with `--route-base releases` becomes `/releases/2_1/`

The page URL is part of the Discourse embed ownership contract. A wrong route base can create or sync the wrong companion topic.

## Companion Ownership

One Discourse companion topic should have one managing Astro source page in a publish or sync run.

This matters when building comparison pages, such as `simple`, `full`, and `fullInteractive` comments-mode demos that intentionally show the same Discourse conversation in different ways. Those pages can render the same discussion, but they should not all manage the same topic first post.

Use one of these patterns:

- choose one Astro page as the managed source and let the other pages display the discussion only
- split demos into separate lanes and run only the lane that should manage the topic
- add `discussionSync: false` to pages that should render an existing discussion without managing it
- remove duplicate `discourseTopicId` frontmatter from pages that should not render or update the topic
- give each demo page its own Discourse topic when each page should be independently synced

The CLI preflight blocks duplicate managed topic IDs or duplicate page URLs in one run before any Discourse writes happen.

## Tags and Categories

Before a live run:

- confirm the category ID exists
- confirm requested tags exist or the API user can create tags
- confirm `max_tags_per_topic`
- confirm `max_tag_length`
- confirm the bot user can tag topics

Use `check-discourse` to verify what the bridge can read:

```sh
npx astro-discussion-bridge check-discourse \
  --discourse-url https://forum.example.com \
  --category-id 6 \
  --tags discussionbridge,blog
```

If a granular key cannot read enough setup metadata, use explicit limits or a diagnostics key.

## Listing Behavior

Use `--unlist` for demo/test companion topics that should keep direct links and embeds working without appearing in category discovery.

```sh
npx astro-discussion-bridge sync-existing src/content/blog \
  --route-base blog \
  --category-id 6 \
  --tags discussionbridge,blog \
  --unlist
```

Changing listing status can require a moderator or staff-capable Discourse user.

## Starlog-Style Releases

Astro's Starlog example is a good model for release notes:

- source directory: `src/content/releases`
- route base: `releases`
- Discourse category: releases or announcements
- tags: `discussionbridge`, `releases`, version tags when useful

Release notes work well as a lane because they need both a stable published page and an ongoing community/support thread.

## Live Verification Checklist

For each lane:

- run `check-discourse`
- run `publish-new`, `sync-existing`, or `publish-and-sync` with `--dry-run --details`
- verify computed page URLs and topic IDs
- run the live command
- verify Discourse title, category, tags, and first post
- verify the Astro page and comments
- account for CDN cache before treating a result as failed
