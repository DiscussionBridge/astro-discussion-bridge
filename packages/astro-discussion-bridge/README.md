# DiscussionBridge for Astro

Alpha publishing-side adapter for the plain DiscussionBridge Discourse plugin.
It has three bounded functions:

- authenticated, server-side Bridge Record creation or resolution during an
  Astro build, including a rendered and sanitized bounded source-content
  snapshot so the receiving topic contains the article and attribution;
- authenticated From Discourse retrieval and sanitized static presentation;
  and
- three deliberate comments presentations: plugin-free `simple`, plugin-free
  `full`, and plugin-backed comments-only `interactive`.

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
        display: "interactive",
        // Keep interactive bounded; long discussions scroll in the frame.
        dynamicHeight: false,
        credit: { enabled: true },
      },
      publishOnBuild: {
        enabled: true,
        docsDir: "src/content",
        stateFile: ".discussionbridge/astro-publication-state.json",
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

Before each publishing request, the adapter atomically records a secret-free
operation containing the stable external identity, canonical URL, correlation
ID and attempt count. It then records the outcome, retry and reconciliation
state, plus the resolved resource/topic identity. An interrupted request stays
visible as retryable state and the next exact build reuses its correlation and
stable identity. A renewable filesystem lease excludes overlapping live builds;
if its owning process is terminated, a later build reclaims the abandoned lease
after the bounded stale interval and retries that same recorded operation.
Inspect the bounded operator summary with:

```text
discussionbridge-astro publication-status \
  --state-file .discussionbridge/astro-publication-state.json
```

The default comments presentation is plugin-free `full`. Choosing
`interactive` and enabling `publishOnBuild` is an explicit upgrade into the
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
discussionCommentsDisplay: interactive
discussionSync: true
authors:
  - id: astro:phil
    name: Phil
    profileUrl: https://site.example.com/authors/phil/
  - id: astro:discussionbridge-team
    name: DiscussionBridge Team
primaryAuthor: astro:phil
```

The eligible page body must render to nonempty HTML no larger than the
Alpha.21 complete-source bound of 16 MiB. Before any remote mutation, the
adapter validates the complete local corpus and the authenticated connection
capability. A complete first post stays within the smaller of the protocol's
48 KiB resolve bound and the operator-reported Discourse content limit. Larger
sources become structurally valid bounded excerpts with an explicit excerpt
notice and prominent **Read More** link to the exact canonical Astro page;
the complete rendered-source byte count and SHA-256 still travel with the
request. HTML is never cut blindly.

Every authoritative revision carries one persisted opaque revision identity,
positive sequence, source-created time, and source-updated time. Astro-native
`pubDate` (or `date`) and `updatedDate` (or a dated `lastUpdated`) frontmatter
take precedence. When those native values are absent, the adapter uses source
file creation/modification metadata and then preserves the accepted values in
durable state. Normal and wiki-marked pages follow the same path: an exact
replay is idempotent, while changed title, rendered content, or authorship
advances the sequence and updates the existing Bridge Record/topic without
changing its native identity. Creation, source modification, synchronization,
and public-verification times are not interchangeable.

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

Moving an already-bound Astro page is fail-closed. The operator first completes
the receiver's approved source-URL migration, including a permanent redirect.
On the next build, the adapter requests the exact bounded Alpha.21 ancestry
proof for the prior and current URLs, requires the same resource, topic and
Astro external identity, and atomically stages that proof before resolving the
same Bridge Record at the new URL. An interrupted build resumes from the staged
proof without creating a replacement topic. The adapter does not create or
manage provider-specific redirects.

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
  topic JSON. The build-time list remains an immediate no-JavaScript and
  failure fallback; on each page load a credential-free browser request
  refreshes the public replies without waiting for a site rebuild. Both paths
  fetch missing public posts in batches of at most 20, render at most 50
  replies, show the first five immediately, and place the rest behind a native
  **Show more comments** disclosure. The browser sends no cookies or receiver
  credential and requires the forum to allow the exact Astro origin through
  CORS. It requires no DiscussionBridge plugin.
- `full` uses the standard Discourse comments embed. With no stored topic it
  gives Core the canonical Astro page URL so Discourse can create or resolve
  its ordinary embed topic. It requires only normal Discourse embedding
  configuration, not the DiscussionBridge plugin or a connection credential.
- `interactive` uses the plugin-authorized full-app comments frame so
  Discourse owns authentication, composer/actions, moderation, persistence,
  and dynamic iframe height while the companion first post remains out of the
  comments layout.

All three render the optional DiscussionBridge credit. The plugin-free choices
remain supported because not every site wants to install the receiving plugin;
`interactive` exists because the stock embed cannot provide the same
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

The component verifies the authenticated Alpha.21 capability and active Astro
presentation binding, then retrieves the exact resource and source revision.
Inline source content is integrity-checked directly. Larger source content is
retrieved through revision-pinned 32 KiB chunks and is not decoded, sanitized,
or presented until every chunk hash, the exact total byte count, and the
complete SHA-256 agree. It emits only allowlisted content plus the Discourse
topic link and never ships the connection secret to browser JavaScript.

The source-publication API also exposes immutable inventory pages, exact
revision detail, and the independent revocation feed. Resume calls retain both
the snapshot/high-water identity and its policy revision; a changed identity
or policy fails closed instead of silently mixing two snapshots.

An operator may also authorize The Bridge to materialize a forum-owned
publication as a genuine Astro content page. The binding must explicitly carry
native-materialization authority; ordinary From Discourse presentation records
are skipped. With the same protected build credentials configured, run:

```sh
discussionbridge-astro sync-publications \
  --docs-dir src/content/docs \
  --site-url https://site.example.com
```

The command validates the source topic, exact destination origin and route,
stable Bridge resource, author, revision, and bounded sanitized content before
atomically writing `comments/<slug>.md`. Exact retries are unchanged; a
different resource attempting to claim the same file fails closed. The written
page retains the source revision and topic identity and uses the ordinary
`interactive` discussion component. The connection secret never enters the
generated page.

The Alpha.21 set-and-forget publication path is exposed separately through
`publication-worker` and `astro-filesystem-destination`. It consumes only
receiver-resolved work, journals each native mutation, preserves one stable
binding across updates and URL-stable title changes, and refuses unowned files,
symlinks, identity collisions, revision regressions, and unapproved moves.
`hold` and `unpublish` remove only an exact owned file; `restore` recreates the
same binding. Set `DISCUSSIONBRIDGE_FORUM_NAME` (or pass `forumName`) for the
human-visible source-forum label. Deployment remains a platform-owned callback;
`astro-public-verification` verifies the resulting public resource and exact
source revision before the final static acknowledgement.

`ImportedRichContent.astro` is included by the From Discourse and native
discussion presentation. It renders Mermaid with strict security, KaTeX math,
and responsive tables on the initial document and every `astro:page-load`, so
Astro and Starlight client navigation do not leave later pages unprocessed.
Run `npm run verify:large-site` to execute the packaged deterministic 1,000-page
Astro build and adapter-scan verifier.

## Public exports

- default Astro integration
- `astro-discussion-bridge/alpha21-client`
- `astro-discussion-bridge/controlled-creation`
- `astro-discussion-bridge/web-url`
- `astro-discussion-bridge/bridge-record`
- `astro-discussion-bridge/platform-catalog`
- `astro-discussion-bridge/publication-work`
- `astro-discussion-bridge/publication-worker`
- `astro-discussion-bridge/astro-filesystem-destination`
- `astro-discussion-bridge/astro-public-verification`
- `astro-discussion-bridge/source-publication`
- `astro-discussion-bridge/source-publication-state`
- `astro-discussion-bridge/native-publication`
- `discussionbridge-astro sync-publications` CLI
- `astro-discussion-bridge/Discussion.astro`
- `astro-discussion-bridge/DiscourseDiscussion.astro`
- `astro-discussion-bridge/DiscourseReplies.astro`
- `astro-discussion-bridge/DiscussionCredit.astro`
- `astro-discussion-bridge/FromDiscourse.astro`
- `astro-discussion-bridge/ImportedRichContent.astro`

## Assurance boundary

This package is the Astro profile of the eight-profile DiscussionBridge Alpha.
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
