# DiscussionBridge for Astro

Local candidate `0.3.0-alpha.1`, bridge compatibility `0.3`, implements the
current `discussionbridge-core-publication` extension alongside the retained v1
paths. The central source is `../adapter-contract/core-publication-extension.json`
from the component repository root; historical evidence is not the current schema.

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

For a protected local file instead, set `DISCUSSIONBRIDGE_SECRET_FILE` to its
absolute path and leave the inline secret unset. `publishOnBuild.secretFile` is
the equivalent explicit server option. A selected environment file takes
precedence over the legacy environment secret; explicit inline/file options
must identify one source. The file must be regular, bounded and private to the
build operator (owner-only POSIX mode, operator-managed Windows ACL). It is read
only on the trusted build/server side; credentials and file paths never enter
the public virtual module or generated publication. Direct record retrieval
and native-publication APIs accept the same `secretFile` option.

To publishing records a SHA256 source edition, complete portable HTML digest
and byte length, and the last accepted revision for compare-and-set updates.
Large source stays intact in Astro; the receiver gets a valid HTML text excerpt
with canonical Read More within 48 KiB and the serialized 64 KiB envelope.
Only actual authored source dates are sent. Missing dates, a day without an
authoritative instant, or boolean `lastUpdated` stay null; file checkout/birth,
binding and build time are never substituted. The receiver must confirm its
accepted edition before the native binding and recovery state commit.

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

The eligible page body must render to nonempty HTML within the 48 KiB
published-content bound. The complete local corpus is rendered and validated
before the first remote request; unsupported MDX constructs, empty output, and
oversized output fail the build rather than creating a link-only topic.
Source reads use batches of at most 32 files in stable path order. The Markdown
processor is initialized only when an eligible page needs rendering.

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

The component performs an authenticated bounded GET, verifies the resource,
direction and topic tuple, sanitizes cooked HTML through an allowlist, and
emits only safe content plus the Discourse topic link. It never ships the
connection secret to browser JavaScript.

An operator may also authorize The Bridge to materialize a forum-owned
publication as a genuine Astro content page. The binding must explicitly carry
native-materialization authority; ordinary From Discourse presentation records
are skipped. With the same protected build credentials configured, run:

```sh
discussionbridge-astro sync-publications \
  --docs-dir src/content/docs \
  --site-url https://site.example.com
```

The command negotiates the current core extension and validates the source topic,
exact destination origin and route, stable resource, author, revision and complete
sanitized content before
atomically writing `comments/<slug>.md`. Exact retries are unchanged; a
different resource attempting to claim the same file fails closed. The written
page retains exact source creation/update metadata, forum name and source edition.
An explicit binding mode or `--comments-display simple|full|interactive` seeds a
new page; existing frontmatter selection and operator fields survive updates.
Include the normal `Discussion.astro` in the native layout to show that selection.
The connection secret never enters the
generated page.

First publication preserves every existing unowned target, including an empty
file. Updates require structured native-publication ownership metadata for the
same resource and topic; a resource marker in ordinary page text is insufficient.
Symlinks and directory junctions are refused, and first creation claims the completed
file exclusively. Ordinary replacement or edits detected before an owned update
are refused; this does not claim an atomic defense against hostile filesystem
races.

Complete From content arrives in digest-verified 32 KiB chunks, with bounded
metadata and chunk JSON responses. These transport bounds do not cap publication
size. Changed editions restart detail retrieval up to three times on 409; unchanged
editions avoid downloading the body. An explicit withdrawal drafts only an exactly
owned Starlight page and retains its private recovery bytes and identity. Restoration
repairs that same page and restores its prior draft choice. Missing records or
failed requests never imply withdrawal. Generic Astro consumers must honor draft
exclusion; local drafting is pending until their build/output checks confirm it.

## Optional rich content

The package carries maintained Mermaid/KaTeX source, locally bundled JS/CSS/fonts,
licenses and `src/assets/RICH_CONTENT_PROVENANCE.json`. Nothing inserts this
integration into a site or changes a theme. Select it explicitly in the native
article layout:

```astro
---
import RichContent from "astro-discussion-bridge/RichContent.astro";
---
<RichContent selector="article" />
```

It renders fenced `mermaid` and `math` code using text and safe engine settings,
and reruns on `astro:page-load`. Failed diagrams retain their source block. Native
HTML tables keep their native/theme presentation. Existing equivalent renderers
remain operator-owned; keep this component absent when using them. Reproduce the
assets from repository source with `npm ci && npm run build:rich`; prebuilt package
use needs no renderer build or CDN. This supports those portable forms and does
not claim every Discourse rich extension or actual browser/navigation qualification.

## Public exports

- default Astro integration
- `astro-discussion-bridge/controlled-creation`
- `astro-discussion-bridge/web-url`
- `astro-discussion-bridge/bridge-record`
- `astro-discussion-bridge/native-publication`
- `astro-discussion-bridge/operational-state`
- `discussionbridge-astro sync-publications` CLI
- `astro-discussion-bridge/Discussion.astro`
- `astro-discussion-bridge/DiscourseDiscussion.astro`
- `astro-discussion-bridge/DiscourseReplies.astro`
- `astro-discussion-bridge/DiscussionCredit.astro`
- `astro-discussion-bridge/FromDiscourse.astro`
- `astro-discussion-bridge/RichContent.astro`

## Assurance boundary

The installable package uses the existing `/discussion-bridge/v1` integration.
Historical unintegrated protocol proposals are not runtime exports, package
contents, or core acceptance requirements. Current metadata, editions, chunking
and selected modes use the central core-publication extension. Direct From widgets
can explicitly pass `display="simple"`, `"full"` or `"interactive"`; omission
retains their body-only behavior. Actual source update time and generic name are
rendered when supplied. Unknown source creation stays unknown.

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

### Disposable 1,000-page qualification asset

The npm package ships `scripts/verify-thousand-pages.mjs`. Run it from a built
checkout or installed package with an absolute, previously absent evidence path:

```sh
node scripts/verify-thousand-pages.mjs --evidence /absolute/astro-local-evidence.json
```

It creates and removes its own disposable 1,000-native-Markdown-page corpus,
using deterministic content/URLs, the actual supported author renderer,
controlled-creation path and schema-version-1 operational state. Its receiver
is an in-process synthetic fixture. Continuing edition, exact retry, staged
receipt restart and canonical-drift assertions retain stable native topic and
resource identities. Versioned evidence includes input/member/source/tool
hashes, census/outcomes and synthetic receipts. Optional `--artifact
/absolute/package.tgz` adds the exact package artifact hash. It makes no forum requests and
uses no real connection secret. It separately records public verification as
unqualified: actual forum delivery, generated Astro/Starlight output, browser
navigation and public deployment still require native qualification. This
reconstructed asset replaces an absent historical verifier; it is not evidence
that the historical verifier or its acceptance claims were recovered.
