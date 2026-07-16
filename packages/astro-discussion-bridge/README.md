# DiscussionBridge

DiscussionBridge is a Discourse-first integration toolkit for connecting websites, docs, and content pages to Discourse discussions. The first framework integration is Astro, and Starlight is one Astro preset rather than the whole architecture.

It is modeled after the Ghost and WordPress Discourse integrations:

- Astro owns the page.
- Discourse owns the discussion thread.
- An explicit `publish-new` command creates companion topics for pages that need them.
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

`Discussion` uses the configured provider. With `provider: "discourse"`, it uses Discourse's embeddable comments script, which loads the Discourse-hosted discussion experience into the Astro page. This is the recommended path because logged-in Discourse users can interact with the discussion in-place, including replies and likes when the target Discourse site allows it.

Configure the allowed host in Discourse admin under embedding settings, using your Astro/Starlight site hostname.

`DiscourseDiscussion.astro` is also exported for provider-specific usage, and `DiscourseComments.astro` remains as a compatibility alias.

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

The older `sync` command is kept as an alias, but `publish-new` is the recommended command because it makes the side effect clear.

### Sync Existing Topics

`sync-existing` updates the managed first-post summary for pages that already have `discourseTopicId`. Astro remains the source of truth for the page, while Discourse keeps the companion discussion thread and a current summary/link block.

Preview without editing Discourse or files.

```sh
npx astro-discussion-bridge sync-existing src/content/docs --dry-run
```

Update linked companion topics whose source hash has changed.

```sh
npx astro-discussion-bridge sync-existing src/content/docs
```

`sync-existing` does not create missing topics. Pages without `discourseTopicId` are skipped.

### Publish and Sync

`publish-and-sync` is the explicit full workflow:

- create missing companion topics
- update existing first-post summaries when Astro source content changed
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

When a topic is created or synced, DiscussionBridge writes source-tracking metadata to frontmatter:

```yaml
discourseTopicId: 1234
discourseTopicUrl: "https://forum.example.com/t/topic-slug/1234"
discussionSourceHash: "..."
discussionLastSyncedAt: "2026-07-16T00:00:00.000Z"
```

### Automatic publish hook

Turn on `publishOnBuild` when you want `astro build` to create missing companion topics before the site builds.

```js
// astro.config.mjs
discussionBridge({
  provider: "discourse",
  preset: "starlight",
  discourseUrl: "https://forum.example.com",
  siteUrl: "https://docs.example.com",
  publishOnBuild: {
    enabled: true,
    docsDir: "src/content/docs",
    categoryId: 12,
    tags: ["docs", "starlight"],
  },
});
```

With this option enabled, creating a new doc and running `astro build` will create the missing Discourse topic and write the topic metadata into that doc's frontmatter. Pages that already have `discourseTopicId` are skipped.

To also sync existing first-post summaries during `astro build`, opt in explicitly with `syncExisting: true`.

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
    docsDir: "src/content/docs",
    categoryId: 12,
    tags: ["docs", "starlight"],
  },
});
```

The build hook is always opt-in. By default, `publishOnBuild.enabled` is `false`, and `publishOnBuild.syncExisting` is also `false`.

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



