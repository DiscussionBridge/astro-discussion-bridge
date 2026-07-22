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

## Source Modes

Discussion Bridge should keep the content source of truth explicit.

Source-mode operating vocabulary:

- `astro-managed`: Astro owns the page. Publish and sync commands may create or update the Discourse companion topic.
- `discourse-managed`: Discourse owns the content lifecycle. Astro pulls or renders from Discourse and should not write back to the Discourse first post.
- `discourse-imported`: Astro contains an imported copy of a Discourse topic. Editors can refine it in Astro or GitCMS, but sync back to Discourse stays off until the page is explicitly promoted.

Safety rule: never write back across a source-of-truth boundary unless the user explicitly changes or promotes the source mode.

Current Alpha enforcement detail: the CLI enforces `discussionSync: false`, not
the source-mode names themselves. Add that guard to every `discourse-managed`
or `discourse-imported` page. `import-existing` does not add the guard
automatically yet, so add and review it immediately after import.

For Discourse-to-Astro workflows, support both editorial paths:

- import clean: prune known boilerplate during import
- import whole: bring the topic into Astro, then let a human edit it down in GitCMS or another source editor

Both paths should preserve the linked Discourse topic ID and URL so the Astro page can still render the original discussion.

### Structured Discourse-Managed Pages

Some sites need more than companion comments. Advocacy, policy, standards, product governance, and long-form documentation projects may use Discourse as the drafting room and Astro as the public publishing layer.

In that model, a Discourse topic can be the source for an Astro page. Wiki topics are especially useful when a community is drafting or refining a section over time. The Astro page should present the polished public version while preserving source topic links, comments, status, and last-edit context.

This is a future-facing requirement, but it should guide Tier 1 decisions now:

- keep `discourse-managed` distinct from `astro-managed`
- preserve topic ID, topic URL, source mode, and route metadata during import
- avoid writeback unless a human explicitly promotes the source mode
- allow room for status, revision, and last-edit metadata on rendered pages
- support prune/import behavior for Discourse-only boilerplate

The first real proof lane is OBBBA: `forum.repealobbba.org` to `onebigbeautifulbill.us`, with `repealobbbaact.us` as the stronger future structured-document candidate.

OBBBA also proves a many-to-one shape: `onebigbeautifulbill.us`, `repealobbba.org`, `repealobbbaact.us`, and possibly `repealobbbapledge.us` can all connect to `forum.repealobbba.org`, while each site or lane may use a different source mode. That is distinct from full many-to-many, but it should keep the bridge from assuming one global forum, one global direction, or one global content lane.

The bounded Alpha topology proof adds two explicit alternate-forum paths from
selected `onebigbeautifulbill.us` pages. One uses a dedicated
CitizenActivist.Network Discourse at canonical hostname
`forum.citizenactivist.network`, publicly described as “A community of
activists.” The
other may use `forum.discussionbridge.dev` for clearly labeled demo/credit pages.
Neither changes the managing forum for production OBBBA content lanes.

Together with the existing many-to-one shape, Alpha requires one-page-to-many-
forums publishing. Package commit `60e41e1` implements the target model; live
topology proof remains open. The same selected page uses an explicit ordered list containing
`forum.repealobbba.org` and `forum.citizenactivist.network`. General many-to-many
administration remains outside this gate.

Current external prerequisite (verified 2026-07-22):
`forum.citizenactivist.network` does not resolve, and the checked protected
by-site vault locations contain no Citizen Activist credential lane. Boss/Ops
owns forum/DNS/TLS/ownership provisioning under task
`019f42a5-bd80-77a2-98bc-af5b57db0d8a`. Treat the live proof as blocked on that
prerequisite, not failed in Discussion Bridge.

Required matrix:

```text
same selected onebigbeautifulbill.us page -> forum.repealobbba.org
same selected onebigbeautifulbill.us page -> forum.citizenactivist.network
bounded demo/credit pages              -> forum.discussionbridge.dev
multiple Astro/public sites            -> forum.repealobbba.org
```

The first two edges are bindings of the same page and prove explicit multi-target
publication. The last edge separately proves many sites converging on one forum.

Each target needs independent binding and operational state. Source-target
no-writeback protection remains intact, comments presentation identifies a
primary discussion and additional targets, and partial writes retain successes
for idempotent target-specific retry.

Use `discussionTargets` for the ordered CSV target list,
`discussionPublishTargets` for its explicitly writable subset, and
`discussionSourceTarget` for the protected source. Store independent state in
the JSON scalar `discussionTargetBindings`. When multiple linked discussions
exist, set `discussionPrimaryTarget`; it renders normally while additional
targets appear as accessible named links. `targetLabels` may customize those
names. The CLI handles one explicit `--target` at a time, while ordered
`publishOnBuild.lanes` can execute several named targets sequentially.

Use `forum.` for literal operational clarity; express the community meaning in
the forum identity/copy. Cloudflare/account ownership remains an Ops boundary.

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
