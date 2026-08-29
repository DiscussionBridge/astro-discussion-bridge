# DiscussionBridge for Astro

Alpha publishing-side adapter for the plain DiscussionBridge Discourse plugin.
It has three bounded functions:

- authenticated, server-side Bridge Record creation or resolution during an
  Astro build;
- authenticated From Discourse retrieval and sanitized static presentation;
  and
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
DISCUSSIONBRIDGE_CONNECTION_ID=dbc_000000000000000000000000
DISCUSSIONBRIDGE_CONNECTION_SECRET=replace-with-the-plugin-connection-secret
```

`publishOnBuild` defaults to disabled. When enabled, missing credentials or
`siteUrl` fail the build. The endpoint is fixed at
`/discussion-bridge/v1/bridge-records/resolve.json`; there is no direct Discourse
Core fallback.

Only a published Markdown or MDX page with both of these exact values may issue
a request:

```yaml
discussionCommentsDisplay: fullInteractive
discussionSync: true
```

`draft: true` or `published: false` prevents publication. The forum retains
category, tag, lane, actor, and visibility authority. A stored
`discussionbridgeResourceId`, `discourseTopicId`, or `discourseTopicUrl` is
never trusted by itself: all three must be present and internally consistent,
and the adapter authenticates with the plugin again and requires the returned
durable Bridge Record tuple to match before preserving the binding.

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

For a From Discourse page, render the record during the server-side/static
build. The component reads credentials only from the build environment:

```astro
---
import FromDiscourse from "astro-discussion-bridge/FromDiscourse.astro";
---

<FromDiscourse
  discourseUrl="https://forum.example.com"
  resourceId="00000000-0000-4000-8000-000000000000"
/>
```

The component performs an authenticated bounded GET, verifies the resource,
direction and topic tuple, sanitizes cooked HTML through an allowlist, and
emits only safe content plus the Discourse topic link. It never ships the
connection secret to browser JavaScript.

## Public exports

- default Astro integration
- `astro-discussion-bridge/controlled-creation`
- `astro-discussion-bridge/web-url`
- `astro-discussion-bridge/bridge-record`
- `astro-discussion-bridge/Discussion.astro`
- `astro-discussion-bridge/DiscourseDiscussion.astro`
- `astro-discussion-bridge/DiscussionCredit.astro`
- `astro-discussion-bridge/FromDiscourse.astro`

## Assurance boundary

This package is the Astro profile of the six-profile DiscussionBridge Alpha.
It must pass build, tests, package-inventory checks, live two-direction
exercise, rollback capture, and the final paired code review before release.
This README grants none of those acceptances.

The contract record is
`../../docs/evidence/DISCUSSIONBRIDGE_PLUGIN_V0_1_CONTRACT_2026-08-02.md`.

## Attribution and independence

Built by Phil Henry / WebSynergetics with AI-assisted development.

DiscussionBridge is independent and is not affiliated with, endorsed by, or
sponsored by Discourse, Astro, or their maintainers. See the public
[human manual](https://github.com/DiscussionBridge/docs/blob/main/docs/HUMAN_MANUAL.md)
and [attribution, ownership, and license record](https://github.com/DiscussionBridge/docs/blob/main/docs/ATTRIBUTION_OWNERSHIP_LICENSE.md).
