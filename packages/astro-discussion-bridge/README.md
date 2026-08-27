# DiscussionBridge for Astro

Alpha publishing-side consumer for the plain DiscussionBridge Discourse plugin.
It has two functions only:

- authenticated, server-side companion-topic creation or resolution during an
  Astro build; and
- mapped comments-only `fullInteractive` presentation through Discourse Core.

It is not an API-key publisher, import tool, multi-forum framework, generic
diagnostic client, or independent forum control plane.

## Configuration

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import discussionBridge from "astro-discussion-bridge";

export default defineConfig({
  integrations: [
    discussionBridge({
      discourseUrl: "https://forum.example.com",
      siteUrl: "https://site.example.com",
      comments: {
        enabled: true,
        dynamicHeight: true,
        credit: { enabled: true },
      },
      publishOnBuild: {
        enabled: true,
        docsDir: "src/content",
        lane: "docs",
        visibility: "unlisted",
      },
    }),
  ],
});
```

Set these build-server values; never expose them through public Astro config:

```dotenv
DISCUSSIONBRIDGE_CONNECTION_ID=astro-alpha
DISCUSSIONBRIDGE_CONNECTION_SECRET=replace-with-the-plugin-connection-secret
```

`publishOnBuild` defaults to disabled. When enabled, missing credentials or
`siteUrl` fail the build. The endpoint is fixed at
`/discussion-bridge/connections/resolve.json`; there is no direct Discourse
Core fallback.

Only a published Markdown or MDX page with both of these exact values may issue
a request:

```yaml
discussionCommentsDisplay: fullInteractive
discussionSync: true
```

`draft: true` or `published: false` prevents publication. Optional
`discussionCategoryId` and `discussionTags` are bounded requests; the forum
retains final category, tag, lane, actor, and visibility authority. A stored
`discourseTopicId` or `discourseTopicUrl` is never trusted by itself: the
adapter authenticates with the plugin again and requires the returned durable
mapping to match before preserving the binding.

## Presentation

Use `Discussion.astro` with a completed mapping:

```astro
---
import Discussion from "astro-discussion-bridge/Discussion.astro";
---

<Discussion frontmatter={Astro.props.frontmatter} />
```

The component renders one mapped `fullInteractive` discussion and one optional
DiscussionBridge credit. Discourse Core owns authentication, accounts,
sessions, composer/actions, moderation, persistence, and dynamic iframe height.
There is no simple/full/replies fallback.

## Public exports

- default Astro integration
- `astro-discussion-bridge/controlled-creation`
- `astro-discussion-bridge/web-url`
- `astro-discussion-bridge/Discussion.astro`
- `astro-discussion-bridge/DiscourseDiscussion.astro`
- `astro-discussion-bridge/DiscussionCredit.astro`

## Assurance boundary

The preservation baseline is commit
`f92e0dad18091353133288dcc05074fbd6e21675`. This deletion-oriented reduction
must pass its new focused build, tests, package-inventory check, independent
code review, installation, rollback, and combined Astro/forum acceptance before
release. This README grants none of those acceptances.

The contract record is
`../../docs/evidence/DISCUSSIONBRIDGE_PLUGIN_V0_1_CONTRACT_2026-08-02.md`.

## Attribution and independence

Built by Phil Henry / WebSynergetics with AI-assisted development.

DiscussionBridge is independent and is not affiliated with, endorsed by, or
sponsored by Discourse, Astro, or their maintainers. See the public
[human manual](https://github.com/DiscussionBridge/docs/blob/main/docs/HUMAN_MANUAL.md)
and [attribution, ownership, and license record](https://github.com/DiscussionBridge/docs/blob/main/docs/ATTRIBUTION_OWNERSHIP_LICENSE.md).
