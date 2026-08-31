# DiscussionBridge for Astro

Alpha publishing-side adapter for the plain DiscussionBridge Discourse plugin.
It has three bounded functions:

- authenticated, server-side Bridge Record creation or resolution during an
  Astro build, including a rendered and sanitized bounded source-content
  snapshot so the receiving topic contains the article and attribution;
- authenticated From Discourse retrieval and sanitized static presentation;
  and
- three deliberate comments presentations: plugin-free `simple`, plugin-free
  `full`, and plugin-backed comments-only `fullInteractive`.

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
        display: "fullInteractive",
        // Keep fullInteractive bounded; long discussions scroll in the frame.
        dynamicHeight: false,
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

The default comments presentation is plugin-free `full`. Choosing
`fullInteractive` and enabling `publishOnBuild` is an explicit upgrade into the
Bridge-enhanced path; installing this package does not silently require the
Discourse plugin or connection credentials.

An existing plugin-free `full` page can be upgraded in place. When its
frontmatter contains an exact `discourseTopicId` and `discourseTopicUrl` pair,
but no Bridge Record fields, the adapter asks the plugin to adopt that topic.
The plugin accepts the request only when Discourse Core already records the
same canonical source URL as that topic's embed identity; otherwise it fails
without creating or replacing a topic. A manually selected `simple` topic is
not automatically adopted because the source credential is not authority to
claim an arbitrary forum topic.

Only a published Markdown or MDX page with both of these exact values may issue
a request:

```yaml
discussionCommentsDisplay: fullInteractive
discussionSync: true
authors:
  - id: astro:phil
    name: Phil
    profileUrl: https://site.example.com/authors/phil/
  - id: astro:discussionbridge-team
    name: DiscussionBridge Team
primaryAuthor: astro:phil
```

The eligible page body must render to nonempty HTML within the 48 KiB
published-content bound. The complete local corpus is rendered and validated
before the first remote request; unsupported MDX constructs, empty output, and
oversized output fail the build rather than creating a link-only topic.

`authors` is optional. When present it is one author object or an array of at
most 20 author objects. Each object requires a stable `id` and display `name`;
an optional `profileUrl` must remain on the configured site origin.
`primaryAuthor` selects the one identity that the receiving connection may map
to the Discourse topic owner and defaults to the first author. The adapter sends
all authors for source credit. It never sends a Discourse username or grants a
source author forum permissions.

`draft: true` or `published: false` prevents publication. The forum retains
category, tag, lane, actor, and visibility authority. A stored complete Bridge
binding is never trusted by itself: the external ID, resource ID, topic ID,
and topic URL must all be present and internally consistent. The adapter
authenticates with the plugin again and requires the returned durable Bridge
Record tuple to match before preserving the binding.

## Presentation

Use `Discussion.astro` with a completed mapping:

```astro
---
import Discussion from "astro-discussion-bridge/Discussion.astro";
---

<Discussion frontmatter={Astro.props.frontmatter} />
```

The component accepts one explicit presentation mode:

- `simple` renders a bounded, sanitized reply list from the public Discourse
  topic JSON. It fetches missing public posts in batches of at most 20, renders
  at most 50 replies, shows the first five immediately, and places the rest
  behind a native **Show more comments** disclosure. It requires no
  DiscussionBridge plugin.
- `full` uses the standard Discourse comments embed. With no stored topic it
  gives Core the canonical Astro page URL so Discourse can create or resolve
  its ordinary embed topic. It requires only normal Discourse embedding
  configuration, not the DiscussionBridge plugin or a connection credential.
- `fullInteractive` uses the plugin-authorized full-app comments frame so
  Discourse owns authentication, composer/actions, moderation, persistence,
  and dynamic iframe height while the companion first post remains out of the
  comments layout.

All three render the optional DiscussionBridge credit. The plugin-free choices
remain supported because not every site wants to install the receiving plugin;
`fullInteractive` exists because the stock embed cannot provide the same
comments-frame interaction and layout.

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
- `astro-discussion-bridge/DiscourseReplies.astro`
- `astro-discussion-bridge/DiscussionCredit.astro`
- `astro-discussion-bridge/FromDiscourse.astro`

## Assurance boundary

This package is the Astro profile of the seven-profile DiscussionBridge Alpha.
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
