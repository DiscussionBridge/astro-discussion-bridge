# Content Lanes Guide

Public Alpha consumers should ultimately receive lane behavior through
`npm install astro-discussion-bridge@alpha`. Local packed artifacts and repository
installs remain development/recovery proof paths until the npm Alpha release
gates pass; they are not the primary public distribution story.

A content lane maps a group of Astro content to Discourse behavior.

Attribution travels with lane content. The automated gate checks objective
license/provenance inventory and protected-path conditions, but a release still
requires Manual Boss semantic review of source rights, adapted material,
trademark/affiliation wording, and public/private boundaries. A package 73/73
or docs 20/21 count is not that human approval.
For the exact corrected candidate through `b09dbce`, Manual Boss separately
recorded `Attribution and Licensing: PASS`; future candidates require their own
review record.

## Two-Direction Dogfood Lanes

The Alpha dogfood proof uses two separate single-writer lanes:

- `discussionbridge.dev` Astro-managed blog -> public companion topic on
  `forum.discussionbridge.dev`;
- `forum.discussionbridge.dev` community wiki/how-to -> a durable public guide
  and Astro navigation lane on `discussionbridge.dev`.

The wiki lane is imported with `--source-mode discourse-managed`. The generated
page preserves `discussionSourceMode: discourse-managed`,
`discussionSync: false`, source provenance, and topic identity; it imports or
refreshes deterministically and keeps the source topic as its primary
discussion. Wiki edits happen in Discourse; the site republishes reviewed
source. These lanes do not merge reply streams.

Live dogfood verification completed in apex commit `d68ffc4`: the blog route
`/blog/every-connection-has-a-job/` binds public companion topic `37`, while
the guide route `/guides/how-to-choose-a-discussion-bridge-source-mode/`
discloses and renders wiki source topic `36` as its primary fullInteractive
discussion. A deliberate guide sync dry run skipped under the
`discourse-managed` no-writeback rule.
[Sanitized live evidence](https://github.com/DiscussionBridge/astro-discussion-bridge/blob/main/docs/evidence/DISCUSSIONBRIDGE_DEV_TWO_WAY_DOGFOOD_2026-07-23.md)
records the HTTP, topic metadata, redirect, build, and known-notice checks.

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

Current Alpha enforcement: `import-existing` accepts only
`discourse-imported` or `discourse-managed` through `--source-mode`, defaults to
`discourse-imported`, and rejects `astro-managed`. It writes the selected
`discussionSourceMode` plus `discussionSync: false`; sync also enforces
no-writeback for both Discourse-source modes. Manifest entries may select the
same contract with `sourceMode`.

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

The bounded live lane is now proven on the 10101 page. Its protected source is
Repeal OBBBA topic 434 and its additional Citizen Activist publication is topic
9. The correct publishing lane is `src/content/docs/title i` with route base
`title-i` and active target `citizen-activist`. A broader root produced a wrong
index/route preview and was rejected before any write; always review the
target-specific dry-run before publication.

Interaction addendum: Citizen Activist topic 9 later accepted public post 2.
The Astro page correctly continued rendering Repeal OBBBA topic 434 as its
protected primary discussion; the independent Citizen Activist conversation
remained reachable through **Additional discussions**. This confirms lane and
presentation separation without broadening the bounded topology claim.

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

## Source Provenance Across Lanes

### Every connection has a job

For each source-to-discussion or publication connection, record an operator-
readable job and expose it in the link label/call to action. Useful roles include
public community, chapter/regional discussion, internal review, subject-matter
feedback, advocacy coordination, and syndication. Do not silently combine reply
streams from independent edges.

Public language should explain who the conversation is for and what readers can
do there, not merely name the destination forum. Configuration vocabulary for
this model is pending design review and is not yet implemented.

CAN may operate in both directions only through separate page/topic pairs:
Astro-managed pages can publish companion topics, while selected forum topics
can become Discourse-managed/imported pages. Assign explicit source ownership
and keep each item single-writer. The same item must never be writable in both
directions simultaneously.

Render `astro-discussion-bridge/DiscussionSource.astro` near the article start
for `discourse-imported` and `discourse-managed` lanes. Do not place it at the
comments boundary. On a multi-target page, resolve provenance from the protected
`discussionSourceTarget` (or legacy source target), never from an additional
publication target. This keeps WHEREFROM disclosure distinct from WHERETO
discussion publication.

The implementation is complete at `a9d2097`. OBBBA adopted it at `aa7846d` and
verified the protected Repeal OBBBA source disclosure across all five live Title
I routes. The later bounded Citizen Activist multi-target proof completed at
`36df91c`; provenance still follows the protected Repeal OBBBA source.

### Chapter and national lanes (future design)

Use **Local ownership. National reach.** as the reader model. A selected local
chapter topic may be promoted into a mapped national category while retaining
chapter attribution and a return link; national guidance may flow to selected
chapter categories for local adaptation. In both directions, declare the source
owner and one-way first-post update direction. Local and national replies stay
independent, and public/private eligibility plus moderation ownership are
enforced at each forum. This governed hub-and-spoke model is not yet implemented
as general forum-to-forum orchestration.

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

Category ownership follows source direction:

- for Astro-managed topics, a configured lane/page category is authoritative
  and sync corrects manual category drift;
- when no category is configured, a manual Discourse category change remains;
- `discourse-managed` and `discourse-imported` source topics are protected from
  category writeback;
- each additional publication target has its own independent target category.

Preview the active target and category before each write. Do not infer one
forum's category from another target.

Use `check-discourse` to verify what the bridge can read:

```sh
npx astro-discussion-bridge check-discourse \
  --discourse-url https://forum.example.com \
  --category-id 6 \
  --tags discussionbridge,blog
```

If a granular key cannot read enough setup metadata, use explicit limits or a diagnostics key.

## Official-Source And Related-Content Lanes

Legal and public-record lanes may have both a community-maintained content
source and a separately identified official text source:

- Content source points to the Discourse wiki topic that editors maintain.
- Official text points to the authoritative document/section and citation.

For OBBBA, the planned lenses are OBBBA Text, Law as Amended, Impact, and
future Stories. A stable shared `sectionId` should connect related pages across
these lanes. Reciprocal Related links belong in a generated, adapter-neutral
relationship/taxonomy manifest, not hand-maintained article bodies.

Stories may reference multiple section IDs, and each section may have multiple
Stories. Adding or removing a Story should require manifest regeneration and
an Astro rebuild, not source-body reimport or edits to every related page.
Provenance/authority disclosures remain separate from Related links.

Commit `e775af3` implements the package/demo enrichment and relationship
contracts: strict `us-public-law`, source-tag provenance, stable `sectionId`,
reciprocal links, one-to-many Stories, and adapter-neutral virtual manifests.
This is not yet OBBBA site adoption. The bounded Section 10101 comparison
remains evidence for one source pair only; broader batch comparison is open,
and Law as Amended is outside current Astro adoption.

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
