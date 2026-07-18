# DiscussionBridge

DiscussionBridge is a Discourse-first integration toolkit for connecting websites, docs, and content pages to Discourse discussions. The first framework integration is Astro, and Starlight is one Astro preset rather than the whole architecture.

It is modeled after the Ghost and WordPress Discourse integrations:

- Astro owns the page.
- Discourse owns the discussion thread.
- An explicit `publish-new` command creates companion topics for pages that need them.
- An explicit `import-existing` command can bring an existing Discourse topic into Astro as a linked Markdown page.
- Page frontmatter can store the discussion topic ID and URL.
- Astro components embed the native Discourse discussion UI, with optional static reply excerpts for server-rendered pages.

## Reference Behavior

A good live example is Coding Horror's Ghost-to-Discourse setup:

- Source post: https://blog.codinghorror.com/thank-you-for-being-a-friend/
- Companion topic: https://discourse.codinghorror.com/t/thank-you-for-being-a-friend/10372

DiscussionBridge is intended to support that same relationship for Astro: publishing or syncing a page creates a linked discussion topic, the topic points back to the original page, and the Astro page can show the native hosted discussion experience.

## Install

```sh
npm install astro-discussion-bridge
```

## Configure Astro

DiscussionBridge is Discourse-first and framework-aware. This package is the Astro integration. Use `preset: "starlight"` for Starlight's docs structure, or omit it for a more general Astro content setup.

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import discussionBridge from "astro-discussion-bridge";

export default defineConfig({
  integrations: [
    starlight({
      title: "Docs",
      components: {
        PageFrame: "./src/components/PageFrame.astro",
      },
    }),
    discussionBridge({
      provider: "discourse",
      preset: "starlight",
      discourseUrl: "https://forum.example.com",
      siteUrl: "https://docs.example.com",
      replies: {
        minScore: 1,
        maxReplies: 5,
      },
      publishOnBuild: {
        enabled: false,
      },
    }),
  ],
});
```

## Presets

`preset: "starlight"` uses `src/content/docs` as the default publish directory and documents the Starlight layout override flow.

Other presets are reserved for broader Astro use cases:

- `astro`
- `astro-content`
- `mdx-inline`
- `cloudflare-worker`

The discussion engine is Discourse. The `provider: "discourse"` field remains explicit so configuration is clear, but the roadmap is focused on framework and platform integrations for Discourse.

## Product Model

Discussion Bridge is designed to be generous without making implementation labor free.

The bridge works because the publication and the conversation keep their own strengths. Astro keeps pages fast, structured, versioned, and pleasant to read. Discourse keeps identity, trust levels, notifications, moderation, quoting, reactions, and the long-running social context that makes a community useful after the original page has shipped. When the comments are not decoration, Discourse becomes the living edge of the page.

- Tier 1 is the API-only bridge: free package, public docs, community support, and paid hand-holding or implementation help when teams need it.
- Tier 2 is the optional Discourse-side power layer: the same support model, with deeper Discourse configuration, operations visibility, and managed integration behavior.

The API-only path should stay useful on its own. A future Discourse plugin should enhance it rather than replace it.

### Discussion targets

Current Tier 1 usage manages one Discourse target topic per Astro page. Use `--target NAME`, `DISCUSSION_TARGET`, or `activeTarget` when you want that single target to be named explicitly, such as `community`, `members`, or `regional`.

When a target is active, DiscussionBridge writes the target label into frontmatter:

```yaml
discussionTarget: "community"
discourseTopicId: 1234
discourseTopicUrl: "https://forum.example.com/t/topic-slug/1234"
```

Later publish/sync runs only manage a targeted page when the active target matches. If a page says `discussionTarget: "community"` and you run with `--target regional`, the page is skipped instead of being synced to the wrong forum. If you omit `--target`, targeted pages are also skipped with a message telling you which target to use.

This is intentionally not full multi-Discourse support yet. It preserves the future path toward namespaced `discussionTargets` while keeping today's frontmatter and commands simple.

## Content Lanes

A content lane is a source content collection or path mapped to Discourse behavior.

For example, one Astro or Starlight site might publish:

- docs to a documentation category
- blog posts to a blog discussion category
- news posts to a news or announcements category
- changelog entries to a releases category

The build hook supports route-level lane defaults today. A lane may define its source directory, Discourse category, tags, publish/sync behavior, listed or unlisted preference, notification recipients, and title validation settings. Individual pages can override the lane's category, tags, listed/unlisted preference, and failure-notification recipients in frontmatter. In the API-only tier, lanes are configuration and frontmatter. In the optional plugin tier, lanes can become visible and manageable inside the Discourse control plane.

Astro's Starlog release-notes example is a useful model: release posts live in a dedicated `src/content/releases` collection, which can map cleanly to a release-notes Discourse category.

## Discussion-Safe Companion Content

DiscussionBridge syncs Discourse-compatible companion content, not the full Astro rendering pipeline. Astro can be rich, custom, and deeply designed. The companion body sent to Discourse should be discussion-safe Markdown: content that renders well in Discourse, invites replies, and survives quoting, moderation, email digests, search, and long-term forum use.

Works well by default:

- headings, paragraphs, emphasis, links, blockquotes, and lists
- inline code and fenced code blocks
- Markdown tables when the target Discourse site supports them
- external image URLs
- plain video links when Discourse Onebox supports the host

Works with matching Discourse setup:

- Mermaid, when Discourse has Mermaid support enabled
- LaTeX or math notation, when Discourse has math support enabled
- embeds or iframes, when Discourse Onebox or embed settings allow them
- local Astro images, when converted to absolute public URLs or uploaded to Discourse

Use `discussionSummary` when an Astro page uses Starlight directives, Astro components, MDX JSX, imported local assets, custom cards, tabs, interactive widgets, client-side charts, or other syntax that Discourse should not be expected to render. A curated summary keeps Discourse useful without flattening the Astro page into lowest-common-denominator content.

## Add Discussion to Starlight

Create a Starlight override component such as `src/components/PageFrame.astro`. This keeps existing `.md` docs working because the discussion component is added by the Starlight layout, not inside each content file.

```astro
---
import Default from "@astrojs/starlight/components/PageFrame.astro";
import Discussion from "astro-discussion-bridge/Discussion.astro";
---

<Default>
  <slot />
  <Discussion />
</Default>
```

`Discussion` uses the configured provider. With `provider: "discourse"`, the default `comments.display: "simple"` mode uses Discourse's embeddable comments script. This is the lightweight path for page comments, but Discourse's embed output may omit some topic action detail such as visible like counts.

Use `comments.display: "full"` when the Astro page should render Discourse replies itself and show reply metadata such as like counts. This mode fetches the linked topic during rendering, then refreshes from Discourse again on page load by default so new replies and like counts can appear without an Astro rebuild. The full Discourse topic remains the source of truth for replying, exact user action attribution, moderation, and logged-in interaction.

Use `comments.display: "fullInteractive"` when you want Discourse's native full app embed inside the page. This keeps logged-in reply, like, quote, and other interaction inside Discourse's iframe instead of reimplementing user actions in Astro. The target Discourse site must support and enable full app embeds in its embedding settings.

Configure the allowed host in Discourse admin under embedding settings, using your Astro/Starlight site hostname.

Recommended Discourse embedding settings for `fullInteractive`:

- `Embed full app`: yes. This is required for Discourse to load the full application in the embedded comments iframe.
- `Embed full app signin flow`: yes when the Astro site and Discourse forum are same-site, such as `docs.example.com` and `forum.example.com`. For unrelated domains, only enable it when Discourse `Same site cookies` is set to `None`.
- `Suppress third party analytics in embed`: yes when the Astro host page already owns analytics pageviews.
- `Embed support markdown`: yes, so embedded replies support useful technical formatting.
- `Embed set canonical URL`: yes when Astro is the canonical publication surface and Discourse is the companion discussion.
- `Embed unlisted`: yes for companion-topic/comment-first sites where topics should stay out of category discovery until someone replies. Leave it off when Discourse categories should behave like public feeds.
- `Embed any origin`: no. Prefer explicit embeddable hosts.
- `Embed topics list`: no unless you are intentionally building topic-list widgets.
- `Allowed embed selectors`: empty/default unless you are using Discourse's native page-scraping embed flow and need to target a specific page region.

`DiscourseDiscussion.astro` is also exported for provider-specific usage, and `DiscourseComments.astro` remains as a compatibility alias.

```js
discussionBridge({
  provider: "discourse",
  discourseUrl: "https://forum.example.com",
  comments: {
    display: "simple", // simple | full | fullInteractive
    embedHeight: "800px",
  },
  replies: {
    refreshOnPageLoad: true,
    // Use a same-origin proxy when the Discourse site does not allow browser CORS.
    refreshEndpoint: "/api/discourse/topics/{topicId}.json",
  },
});
```

Without `refreshEndpoint`, the browser refresh reads directly from `https://forum.example.com/t/{topicId}.json`. That requires the Discourse site to allow browser CORS from the Astro site. Static deployments can avoid CORS by adding a same-origin proxy route and pointing `refreshEndpoint` at it.

### Optional static reply excerpts

`DiscourseReplies` fetches selected replies from the linked Discourse topic and renders them as Astro HTML during server rendering. This can be useful for static excerpts or summaries, but it is not the primary comments UI because it does not preserve Discourse's full logged-in interaction model.

```astro
---
import DiscourseReplies from "astro-discussion-bridge/DiscourseReplies.astro";
import Discussion from "astro-discussion-bridge/Discussion.astro";
---

<DiscourseReplies />
<Discussion />
```

## Publish Missing Topics

Add environment variables to the Astro project that contains your docs.

```sh
DISCOURSE_URL=https://forum.example.com
DISCOURSE_API_KEY=your-api-key
DISCOURSE_API_USERNAME=system
DISCOURSE_CATEGORY_ID=12
DISCOURSE_TAGS=docs,starlight
SITE_URL=https://docs.example.com
```

For create-and-sync workflows, the API user/key must be able to:

- create topics and posts in the target category
- read existing topics and posts
- update the managed first post for linked companion topics

For early testing a global key works, but production usage should prefer the narrowest granular key that still supports those actions.

### Explicit publish command

Run `publish-new` from the Astro project root when you are ready to create missing companion topics.

Preview without creating topics or editing files.

```sh
npx astro-discussion-bridge publish-new src/content/docs --dry-run
```

Create topics for pages that do not already have `discourseTopicId`.

```sh
npx astro-discussion-bridge publish-new src/content/docs
```

Use `--target` when the page should be assigned to a named discussion target.

```sh
npx astro-discussion-bridge publish-new src/content/docs --target community
```

Before any live writes, DiscussionBridge validates managed pages against common Discourse authoring rules. By default, titles must be at least 15 characters and must not look like repeated filler text. Add explicit limits when you want the bridge to fail before Discourse rejects a title, companion body, or tag set.

```sh
npx astro-discussion-bridge publish-new src/content/docs \
  --title-min-length 10 \
  --max-topic-title-length 255 \
  --max-post-length 32000 \
  --max-tags-per-topic 5 \
  --max-tag-length 20
```

The same values can be supplied with `DISCOURSE_TITLE_MIN_LENGTH`, `DISCOURSE_MAX_TOPIC_TITLE_LENGTH`, `DISCOURSE_MAX_POST_LENGTH`, `DISCOURSE_MAX_TAGS_PER_TOPIC`, and `DISCOURSE_MAX_TAG_LENGTH`.

The older `sync` command is kept as an alias, but `publish-new` is the recommended command because it makes the side effect clear.

### Check Discourse

Use `check-discourse` to inspect the target forum before wiring a lane into live publishing.

```sh
npx astro-discussion-bridge check-discourse \
  --discourse-url https://forum.example.com \
  --tags discussionbridge,blog
```

The command reads `/site/settings.json` for client-visible authoring limits and `/site.json` for user-specific tag capabilities. It uses `DISCOURSE_DIAGNOSTICS_API_KEY` or `--diagnostics-api-key` when present; otherwise it uses the normal publishing key. A global key can usually read these endpoints. Some granular keys may receive `403` for site-level endpoints; in that case, pass explicit limits with CLI flags or environment variables and reserve a broader diagnostics key for setup checks.

### Sync Existing Topics

`sync-existing` updates the managed first post for pages that already have `discourseTopicId`. Astro remains the source of truth for the page, while Discourse keeps the companion discussion thread and a reader-facing copy or summary of the current page.

Preview without editing Discourse or files.

```sh
npx astro-discussion-bridge sync-existing src/content/docs --dry-run
```

Update linked companion topics whose source hash has changed.

```sh
npx astro-discussion-bridge sync-existing src/content/docs
```

Use `--force` when the source content is unchanged but you still need to rewrite the managed first post, such as after changing the companion topic template.

```sh
npx astro-discussion-bridge sync-existing src/content/docs --force
```

`sync-existing` does not create missing topics. Pages without `discourseTopicId` are skipped.

Use `--unlist` for demo/test companion topics that should keep direct links and embeds working without appearing in category discovery. The configured Discourse API user must be allowed to change topic visibility; on typical Discourse installs that means a staff or moderator-level user. Retitling replied topics can require the same level of authority.

```sh
npx astro-discussion-bridge sync-existing src/content/docs --unlist
```

### Maintenance Sync Process

Treat first-post maintenance as a repeatable test, especially after changing the companion topic template or lane configuration:

1. Confirm the project is using the expected `astro-discussion-bridge` package build.
2. Run `sync-existing` with `--dry-run` for one lane.
3. Review whether pages report `dry-run-update`, `unchanged`, or `skipped`, including the reason text.
4. Add `--force` when the maintenance intent is to rewrite first posts even if page source hashes are unchanged.
5. Run the same command without `--dry-run` only after the preview looks right.
6. For dry runs, review whether the CLI reports source hash changes, force sync requests, skipped files, or unchanged files.
7. For live syncs, review whether the CLI reports first-post rewrites, topic metadata updates, topic tag updates, listing changes, or unchanged metadata.
8. Verify the Discourse first post starts with the reader-facing page content or summary, includes a source article link near the bottom, and no longer shows old implementation labels.
9. Verify the Astro page and comments still render.
10. Repeat for each lane.

Example blog-lane maintenance pass:

```sh
npx astro-discussion-bridge sync-existing src/content/blog \
  --route-base blog \
  --discourse-url https://forum.example.com \
  --site-url https://docs.example.com \
  --category-id 5 \
  --tags discussionbridge,blog \
  --force \
  --dry-run

npx astro-discussion-bridge sync-existing src/content/blog \
  --route-base blog \
  --discourse-url https://forum.example.com \
  --site-url https://docs.example.com \
  --category-id 5 \
  --tags discussionbridge,blog \
  --force
```

### Publish and Sync

`publish-and-sync` is the explicit full workflow:

- create missing companion topics
- update existing first posts when Astro source content changed
- skip unchanged pages
- leave replies untouched

Preview the full workflow first.

```sh
npx astro-discussion-bridge publish-and-sync src/content/docs --dry-run
```

Then run it intentionally when the dry run looks correct.

```sh
npx astro-discussion-bridge publish-and-sync src/content/docs
```

Add `--unlist` when newly created or synced demo/test topics should be unlisted. This uses the same API credentials as post creation and first-post sync, but Discourse may require a staff or moderator-level API user for topic visibility and retitling replied topics.

`publish-and-sync` uses the same preflight as `publish-new`, so known title, body, and tag problems fail before any Discourse writes happen.

Add `--notify-on-failure` to send a best-effort Discourse private message when a publish or sync run fails. This uses Discourse's normal PM notification and email behavior for the configured recipients. The CLI or build output remains the source of truth, because notification can also fail when credentials or network access are broken.

```sh
npx astro-discussion-bridge publish-and-sync src/content/docs --notify-on-failure --notify-recipients PhilH
```

When a topic is created or synced, DiscussionBridge writes source-tracking metadata to frontmatter:

```yaml
discourseTopicId: 1234
discourseTopicUrl: "https://forum.example.com/t/topic-slug/1234"
discussionSourceHash: "..."
discussionLastSyncedAt: "2026-07-16T00:00:00.000Z"
```

By default, DiscussionBridge syncs the full Markdown or MDX body into the managed first post. Add `discussionSummary` frontmatter when a page should use a curated companion summary instead of the full source body. Configure `maxPostLength` or `DISCOURSE_MAX_POST_LENGTH` when you want local preflight to catch overlong companion bodies before Discourse rejects them.

### Import Existing Topics

`import-existing` is for the reverse onboarding case: the topic already exists in Discourse, and you want Astro to become the source page for it.

Preview one or more imports first.

```sh
npx astro-discussion-bridge import-existing src/content/blog \
  --topic https://forum.example.com/t/existing-topic/123 \
  --site-url https://docs.example.com \
  --discourse-url https://forum.example.com \
  --target community \
  --dry-run
```

Then import intentionally.

```sh
npx astro-discussion-bridge import-existing src/content/blog \
  --topic https://forum.example.com/t/existing-topic/123 \
  --site-url https://docs.example.com \
  --discourse-url https://forum.example.com \
  --comments-display full
```

You can also pass comma-separated ids with `--topic-id 123,124`. Existing files are skipped by default; add `--overwrite` only when you mean to replace the local Markdown file.

Imported files include the Discourse linkage fields, `discussionImportedAt`, and `discussionSourceHash`, so a later `sync-existing` run can tell whether the Astro source has changed before updating the Discourse first post.

### Automatic publish hook

Turn on `publishOnBuild` when you want `astro build` to create missing companion topics before the site builds.

```js
// astro.config.mjs
discussionBridge({
  provider: "discourse",
  preset: "starlight",
  discourseUrl: "https://forum.example.com",
  siteUrl: "https://docs.example.com",
  activeTarget: "community",
  publishOnBuild: {
    enabled: true,
    docsDir: "src/content/docs",
    categoryId: 12,
    tags: ["docs", "starlight"],
  },
});
```

With this option enabled, creating a new doc and running `astro build` will create the missing Discourse topic and write the topic metadata into that doc's frontmatter. Pages that already have `discourseTopicId` are skipped.

Use `publishOnBuild.lanes` when one Astro site has multiple content lanes that should publish to different Discourse categories or tags.

```js
// astro.config.mjs
discussionBridge({
  provider: "discourse",
  preset: "starlight",
  discourseUrl: "https://forum.example.com",
  siteUrl: "https://docs.example.com",
  publishOnBuild: {
    enabled: true,
    lanes: [
      {
        name: "docs",
        docsDir: "src/content/docs",
        categoryId: 12,
        tags: ["docs"],
      },
      {
        name: "releases",
        targetName: "community",
        docsDir: "src/content/releases",
        routeBase: "releases",
        categoryId: 18,
        tags: ["releases", "starlog"],
      },
    ],
  },
});
```

Pages can override the lane defaults when a single release, post, or doc belongs somewhere else in Discourse.

Use `routeBase` when the source directory does not publish at the site root. For example, `docsDir: "src/content/releases"` with `routeBase: "releases"` maps `src/content/releases/2_1.md` to `https://docs.example.com/releases/2_1/`.

```yaml
---
title: "LaunchLight 1.0 Release Notes"
discussionCategoryId: 18
discussionTags: "releases, launchlight"
discussionUnlisted: false
discussionNotifyRecipients: "PhilH,OpsBot"
---
```

Supported per-page overrides:

- `discussionCategoryId`: Discourse category ID for this page's companion topic.
- `discussionCommentsDisplay`: `simple` for the Discourse embed, `full` for bridge-rendered replies with like counts, or `fullInteractive` for Discourse's full app embed.
- `discussionTags`: comma-separated tags used for this page's companion topic. When tags are configured for a page or lane, existing-topic sync reconciles the Discourse topic tags to match. When tags are omitted, DiscussionBridge leaves existing Discourse tags alone.
- `discussionUnlisted`: `true` hides this page's companion topic from category discovery after create/sync.
- `discussionListed`: `true` opts this page back into category discovery when a lane default is unlisted.
- `discussionNotifyRecipients`: comma-separated Discourse usernames to PM if publishing or syncing this page fails.

To also sync existing first posts during `astro build`, opt in explicitly with `syncExisting: true`.

```js
// astro.config.mjs
discussionBridge({
  provider: "discourse",
  preset: "starlight",
  discourseUrl: "https://forum.example.com",
  siteUrl: "https://docs.example.com",
  publishOnBuild: {
    enabled: true,
    syncExisting: true,
    unlistSyncedTopics: true,
    titleMinLength: 15,
    preflightLimits: {
      maxTopicTitleLength: 255,
      maxPostLength: 32000,
      maxTagsPerTopic: 5,
      maxTagLength: 20,
    },
    notifyOnFailure: {
      enabled: true,
      recipients: ["PhilH"],
    },
    docsDir: "src/content/docs",
    categoryId: 12,
    tags: ["docs", "starlight"],
  },
});
```

The build hook is always opt-in. By default, `publishOnBuild.enabled` is `false`, `publishOnBuild.syncExisting` is `false`, `publishOnBuild.unlistSyncedTopics` is `false`, `publishOnBuild.validateTitles` is `true`, and failure PMs are disabled. Only enable `unlistSyncedTopics` when the build-time Discourse API credentials are permitted to unlist managed topics.

For each Markdown or MDX page that does not already have a topic, `publish-new` or the automatic publish hook writes these fields into frontmatter. Existing `.md` files do not need to be converted to `.mdx` unless you want to place Astro components directly inside the page body:

```yaml
discourseTopicId: 1234
discourseTopicUrl: "https://forum.example.com/t/topic-slug/1234"
```

## Per-page Usage

You can also place the components directly on a page. Use `.mdx` for this workflow, because plain `.md` content cannot render Astro components inline.

```astro
---
import Discussion from "astro-discussion-bridge/Discussion.astro";
---

<Discussion topicUrl={Astro.props.frontmatter.discourseTopicUrl} />
```

## Notes

Discourse API credentials are only used by `publish-new`, the optional automatic publish hook, and the server-side client. They are not included in the browser-facing embedded comments component.

`publish-new` and the automatic publish hook send the page URL as `embed_url` when creating the topic, so Discourse can associate the Astro page with its companion discussion when supported by the target Discourse instance.
## Upgrade Process

When Astro releases updates, upgrade Astro and official integrations first, then validate DiscussionBridge in your site.

Astro's official upgrade command updates Astro and official integrations together:

```sh
npx @astrojs/upgrade
```

For DiscussionBridge, use this order:

1. Upgrade Astro and official integrations, such as `@astrojs/cloudflare`.
2. Run your site build without publishing new topics.
3. Run `astro-discussion-bridge publish-new ... --dry-run`.
4. Publish new topics only after the build and dry run look correct.

DiscussionBridge currently supports Astro 6 and 7. Starlight is optional: Astro core sites can use the package without installing `@astrojs/starlight`; Starlight users enable the Starlight behavior with `preset: "starlight"`.
## Roadmap Direction

DiscussionBridge is Discourse-first. The main expansion path is framework and platform coverage around Discourse:

- Astro and Starlight
- Astro content sites
- Cloudflare Workers/Wrangler deployment
- Potential future integrations for frameworks such as Next.js, Nuxt, SvelteKit, or static site generators

An optional Discourse plugin is a likely Layer 3 control plane. It can provide bridge-aware admin settings, source mappings, health/status endpoints, duplicate detection, richer notifications, and a native operations surface for Astro, Statamic, and future adapters.



