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
The direct `resolveControlledCreation` helper also requires an explicit stable
`externalId`; it no longer derives one from the page URL. For an already
published page, preserve the exact existing ID from its frontmatter, local
publication state, or the receiver's authenticated source binding. Do not
assign a fresh ID during a slug or path change: that could create another
topic. First change the same page and install a direct permanent redirect,
then use the receiver's **Change source URL** action for the existing record.
The next build requires exact receiver proof of that transition and resolves
the same resource and topic; a missing or ambiguous proof requires
reconciliation.

An application upgrading from the former direct helper can recover its exact
old URL-derived ID once with `legacyUrlDerivedExternalId(oldCanonicalUrl)`.
Persist that returned value with the native content and pass it as
`externalId` on every later request. This helper is only an upgrade bridge for
already-published content; never use it to assign identity to a new page.
Inspect the bounded operator summary with:

```text
discussionbridge-astro publication-status \
  --state-file .discussionbridge/astro-publication-state.json
```

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

`FromDiscourse.astro` mounts the package's local rich-content renderer after
the sanitized article is present. The same component is exported as
`ImportedRichContent.astro` for custom imported-content roots. It renders
Discourse Mermaid blocks with Mermaid's strict security mode, renders cooked
math and supported `[math]`, `$$...$$`, and inline `$...$` forms with KaTeX,
and makes Discourse `.md-table` wrappers horizontally scrollable on narrow
screens. It never loads a renderer, stylesheet, font, or credential from a
third-party CDN, and it does not reinterpret examples inside `code`, `pre`,
`script`, or `style` elements.

An operator may also authorize DiscussionBridge to materialize a forum-owned
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
atomically writing the content file that corresponds to the authorized URL.
Root URLs write `<slug>.md`; an explicitly configured source path writes
`<source-path>/<slug>.md`. Exact retries are unchanged; a different resource
attempting to claim the same file fails closed. The written page retains the
source revision and topic identity and uses the ordinary Interactive discussion
component. The connection secret never enters the
generated page.
Before writing, the command checks existing native-publication files for the
same resource ID. If its authorized URL now points to another file, it stops
without creating a second page. Changing an existing publication URL requires
an explicit migration and an old-URL redirect; this command does not create
that redirect automatically.

After the initial forum-scale backfill, unattended static synchronization uses
the receiver-owned durable queue in two phases:

```sh
discussionbridge-astro prepare-publication-work \
  --docs-dir src/content/docs \
  --state-file /protected/discussionbridge/astro-publication-work.json \
  --site-url https://site.example.com/ \
  --limit 20 \
  --request-delay-ms 1000

# Build and deploy the exact prepared source, then:
discussionbridge-astro finalize-publication-work \
  --docs-dir src/content/docs \
  --state-file /protected/discussionbridge/astro-publication-work.json \
  --site-url https://site.example.com/
```

`prepare-publication-work` refreshes the Astro destination catalog, waits for
the receiver mapping, claims bounded one-hour leases, and prepares only the
changed or withdrawn native files. `finalize-publication-work` verifies the
exact public resource and publication revision—or verified public absence for
an unpublish—before acknowledging each lease. A platform-side edit that no
longer matches the last DiscussionBridge-written SHA-256 is reported as
attention and is never silently overwritten. Use
`DISCUSSIONBRIDGE_CONNECTION_SECRET_FILE` for the protected unattended
credential; it takes precedence over the legacy direct environment value.
The default limit is 20. A controlled initial backfill may raise it to at most
200 so multiple bounded receiver claims share one build and deployment. A
later prepare invocation can add work to the same still-valid batch up to that
limit; expired leases are moved to attention rather than silently reused. Use
`--request-delay-ms` to pace receiver requests when the forum or its edge has a
lower sustained request ceiling.

For a Cloudflare Workers Static Assets deployment, the operator can prepare
the local content move and permanent redirect together:

```sh
discussionbridge-astro migrate-publication \
  --docs-dir src/content/docs \
  --site-url https://site.example.com/ \
  --resource-id 11111111-1111-4111-8111-111111111111 \
  --old-url https://site.example.com/old-path/ \
  --new-url https://site.example.com/new-path/ \
  --redirects-file public/_redirects
```

The command requires the existing native source file to match the exact old
URL and resource ID. It refuses a destination collision or conflicting redirect,
moves the source file, and adds a `301` rule to Cloudflare's `_redirects`
manifest. A direct reverse move removes the exact old inverse rule before
writing the new one, so the two routes cannot redirect to each other. A
destination with any other redirect remains a conflict requiring operator
reconciliation. It does **not** change the Bridge binding, build, deploy, or verify
the public redirect. Keep publication synchronization paused during the
cutover: with the old Bridge URL still active, it intentionally rejects the
moved file rather than recreating the old path. Build and deploy the migrated
site, verify that the old URL permanently redirects to the new page and that
the new page retains the same resource and topic, then apply the matching
Bridge presentation-binding correction and resume synchronization. If the
redirect cannot be verified, restore the source and manifest before changing
the Bridge binding. Do not use this Cloudflare-specific command for another
hosting target without an equivalent verified redirect mechanism.

## Public exports

- default Astro integration
- `astro-discussion-bridge/controlled-creation`
- `astro-discussion-bridge/web-url`
- `astro-discussion-bridge/bridge-record`
- `astro-discussion-bridge/native-publication`
- `astro-discussion-bridge/publication-work`
- `discussionbridge-astro sync-publications` CLI
- `discussionbridge-astro prepare-publication-work` and
  `finalize-publication-work` CLI
- `discussionbridge-astro migrate-publication` CLI (local Cloudflare cutover preparation)
- `astro-discussion-bridge/Discussion.astro`
- `astro-discussion-bridge/DiscourseDiscussion.astro`
- `astro-discussion-bridge/DiscourseReplies.astro`
- `astro-discussion-bridge/DiscussionCredit.astro`
- `astro-discussion-bridge/FromDiscourse.astro`

## Assurance boundary

### Large-site verification

Run the repeatable temporary 1,000-page build comparison and isolated adapter
census with:

```sh
npm run verify:large-site
```

The verifier alternates a plain Astro build and the same build with
DiscussionBridge publishing enabled in separate Node processes, confirms the complete generated HTML
census, measures the adapter's no-op corpus scan independently, and removes its
temporary fixture. `DISCUSSIONBRIDGE_ASTRO_BENCHMARK_PAGES` and
`DISCUSSIONBRIDGE_ASTRO_BENCHMARK_ROUNDS` may override the bounded defaults.
Total Astro build timings are reported separately from adapter timings because
host load and cache state can materially affect the complete build.

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
