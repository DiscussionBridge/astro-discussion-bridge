# Discussion Bridge for Astro Human Manual

This manual is the operator-facing path for connecting Astro pages to Discourse.
It explains the decisions, safe sequence, expected results, and points where an
operator should stop. Use the [Machine Manual](./MACHINE_MANUAL.md) beside it
when exact commands, fields, scopes, or recovery checks matter.

Discussion Bridge keeps each system doing the job it does well:

- Astro owns fast, structured public pages.
- Discourse owns identity, replies, moderation, notifications, and community
  memory.
- Discussion Bridge maintains the declared relationship between them.

This is Alpha documentation. Preview every write, keep publishing opt-in, and
verify both systems after a live operation.

## 1. Plan The Connection

Before installing anything, record one row for each content lane:

| Decision | Example |
| --- | --- |
| Astro site URL | `https://docs.example.com` |
| Discourse URL | `https://forum.example.com` |
| Content directory | `src/content/docs` |
| Route base | empty for docs, `blog` for `/blog/...` |
| Discourse category ID | `5` |
| Discourse tags | `product,docs` |
| Source mode | `astro-managed`, `discourse-managed`, or `discourse-imported` |
| Comments mode | `simple`, `full`, or `fullInteractive` |
| Listing behavior | listed or unlisted |

A content lane is one source directory plus its route, category, tags, and
operating behavior. Docs, blog posts, news, and releases should normally be
separate lanes.

> **Stop if:** the public page URL, source owner, category, or managing page is
> unclear. A wrong route base or source mode can attach or write to the wrong
> discussion.

**Visual placeholder:** lane-planning worksheet with one completed docs lane.

## 2. Choose The Source Mode

The source mode is an editorial safety decision.

| Mode | Source of truth | Allowed bridge behavior |
| --- | --- | --- |
| `astro-managed` | Astro | May publish a new topic and sync its managed first post. |
| `discourse-managed` | Discourse | Display or pull from Discourse; do not write back. |
| `discourse-imported` | Imported Astro copy | Edit locally if desired, but do not write back until explicitly promoted. |

For every `discourse-managed` or `discourse-imported` page, add this frontmatter
guard:

```yaml
discussionSync: false
```

The named source modes express operating policy, and the CLI write guard is
`discussionSync: false`. The reviewed Alpha import path generates
`discussionSourceMode: discourse-imported`, boolean `discussionSync: false`, and
preserves the topic ID and URL. Review those fields after every import before
running any directory-wide sync command.

Promotion means a human explicitly decides Astro will become the source of
truth, reviews the page and linked topic, and removes the guard. Editing an
imported file by itself is not promotion.

> **Stop if:** an imported or Discourse-owned page lacks `discussionSync:
> false`, or promotion was not explicitly approved.

## 3. Prepare Discourse

1. Create a dedicated bot user, such as `discussbridge-bot`.
2. Create or choose the destination category.
3. Create the planned tags, or confirm the bot can create them.
4. Add the exact Astro hostname as an allowed embedding host.
5. Create a granular publishing key for routine publish and sync operations.
6. Create a separate diagnostics key for setup checks when granular reads are
   insufficient.

When creating either key, show its complete purpose block with the setup
instructions and copy that block into the respective protected credential file
above the secret value.

Publishing key record:

```text
Purpose: Runtime publishing granular key
Use: publish-new, sync-existing, publish-and-sync, check-discourse basic limits
Bot user role: Admin currently; intended future runtime posture is non-admin or least-privilege
Key scope: Granular
Operational rule: Use this to validate the minimum permissions needed for normal bridge publishing.
```

Diagnostics key record:

```text
Purpose: Diagnostics/setup key
Use: check-discourse only
Bot user role: Admin
Key scope: Global or admin-read capable
Operational rule: Do not use in CI/build unless explicitly intended
```

The settled publishing scopes are:

```text
categories:list
categories:show
posts:edit
posts:list
search:show
tags:list
topics:write
topics:update
topics:read
topics:status
```

The diagnostics key is currently a global/admin-capable fallback for
`check-discourse` and controlled troubleshooting. Do not place it in the normal
runtime or deployment path.

Store key values only in a credential vault, session environment, or hosting
provider secret store. Never place them in source files, screenshots, issues,
chat, or build logs.

See [Key Management](./KEY_MANAGEMENT.md) for the complete credential-file
templates, including description, scope, granular permissions, and the secret
placeholder.

> **Stop if:** the routine publishing key is broader than intended without a
> recorded reason, the diagnostics key is configured as the normal publishing
> key, or a real key appears in a file or screenshot.

**Screenshot placeholder:** Discourse granular-key screen showing only the
settled publishing scopes and no visible key value.

## 4. Install And Configure Astro

From the Astro project root:

```sh
npm install astro-discussion-bridge
```

Configure the integration in `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import discussionBridge from "astro-discussion-bridge";

export default defineConfig({
  site: "https://docs.example.com",
  integrations: [
    discussionBridge({
      provider: "discourse",
      preset: "astro",
      discourseUrl: "https://forum.example.com",
      siteUrl: "https://docs.example.com",
      comments: { display: "simple" },
      publishOnBuild: { enabled: false },
    }),
  ],
});
```

Use `preset: "starlight"` for Starlight and `preset: "astro"` for broader
Astro sites. Keep `publishOnBuild.enabled` false until the lane has passed
explicit CLI dry runs and a controlled live test.

For Starlight placement and the layout override, follow
[Alpha Setup](./ALPHA_SETUP.md). You should see the Astro site build normally
and the discussion area appear only on pages with linked topic metadata.

## 5. Configure Credentials Without Exposing Them

Set these in the shell running the command or in a protected CI/deployment
secret store:

```text
DISCOURSE_URL
SITE_URL
DISCOURSE_API_USERNAME
DISCOURSE_API_KEY
DISCOURSE_DIAGNOSTICS_API_KEY
```

`DISCOURSE_DIAGNOSTICS_API_KEY` is optional. When absent,
`check-discourse` falls back to the publishing key and may report metadata as
unavailable rather than failing.

You should be able to run a command without printing any key value.

## 6. Use The Safe Operating Loop

Use this loop for every lane:

1. **Diagnose:** run `check-discourse`.
2. **Preview:** run the intended command with `--dry-run --details`.
3. **Review:** confirm title, page URL, target, topic ID, category, tags, and
   skip/update reason.
4. **Write:** remove `--dry-run` only when the preview is correct.
5. **Verify:** inspect Discourse, Astro, and deployed behavior.
6. **Record:** preserve new failures or recovery facts in the manuals.

### Check The Forum

```sh
npx astro-discussion-bridge check-discourse \
  --discourse-url https://forum.example.com \
  --category-id 5 \
  --tags product,docs \
  --page-url https://docs.example.com/example-page/
```

You should see discovered limits, tag capabilities, category details, setup
issues or warnings, and reconciliation details when `--page-url` is present.
Warnings about unavailable site metadata mean the key could not prove the
setting; they are not permission to guess.

Page-URL reconciliation and explicit existing-topic linking are different:

- When a page supplies `discourseTopicId`, that topic ID is authoritative for
  the native/full-app embed. A page-URL embed-info `404` or exact search with no
  owner does not invalidate a healthy explicit topic.
- When no topic ID is supplied, the embed uses the page URL and URL ownership
  must reconcile correctly before release.

Always verify the explicit topic directly as well as recording any independent
page-URL reconciliation result.

### Publish Missing Topics

Use `publish-new` for `astro-managed` pages that do not yet have a topic ID.

```sh
npx astro-discussion-bridge publish-new src/content/docs --dry-run --details
npx astro-discussion-bridge publish-new src/content/docs
```

The live run should create missing companion topics and write link/sync metadata
to the Astro frontmatter. Already-linked pages are skipped.

### Sync Linked Topics

Use `sync-existing` when Astro owns already-linked topics.

```sh
npx astro-discussion-bridge sync-existing src/content/docs --dry-run --details
npx astro-discussion-bridge sync-existing src/content/docs
```

Pages without `discourseTopicId` and pages with `discussionSync: false` are
skipped. Use `--force` only when deliberately rewriting a first post despite an
unchanged source hash.

Files may use either LF or Windows CRLF line endings. The bridge recognizes both
frontmatter forms and preserves the existing style when it updates frontmatter.
If a valid linked page is unexpectedly reported as `not linked`, stop before any
write and check frontmatter-boundary parsing rather than relinking the topic.
Both read-side guard recognition and write-side line-ending preservation are
covered by regression tests.

### Publish And Sync A Mixed Lane

```sh
npx astro-discussion-bridge publish-and-sync src/content/docs --dry-run --details
npx astro-discussion-bridge publish-and-sync src/content/docs
```

This is convenient but has the broadest write surface. Prefer the narrower
commands when separating creation from maintenance makes review easier.

### Import An Existing Topic

```sh
npx astro-discussion-bridge import-existing src/content/docs \
  --topic https://forum.example.com/t/example-topic/123 \
  --site-url https://docs.example.com \
  --dry-run
```

After reviewing the destination, run the command without `--dry-run`, then add:

```yaml
discussionSync: false
```

You should see a Markdown file linked to the original topic. Review the imported
body and frontmatter before building or editing. Avoid `--overwrite` unless the
replacement is intentional and recoverable.

> **Stop if:** a dry run shows an unexpected page URL, topic ID, target,
> category, managing page, overwrite, or writeback-eligible imported page.

To place a hero image at the start of an imported page:

```sh
npx astro-discussion-bridge import-existing src/content/docs \
  --topic https://forum.example.com/t/example-topic/123 \
  --hero-image "../../../assets/example hero.png" \
  --hero-alt "Descriptive alternative text" \
  --dry-run
```

`--hero-image` and `--hero-alt` are a required pair. Alt text must contain
meaningful non-whitespace text. The generated Markdown places one angle-wrapped
leading image before the unchanged raw topic body; internal path spaces and
escaped alt text are supported.

> **Stop if:** only one hero option is present, alt text is empty/whitespace, or
> the hero insertion changes the normalized Discourse body.

To remove the known trailing community call-to-action block during import:

```sh
npx astro-discussion-bridge import-existing src/content/docs \
  --topic https://forum.example.com/t/example-topic/123 \
  --prune-profile community-call-to-action \
  --dry-run
```

This opt-in profile removes only a trailing block after a horizontal rule when
all four markers are present: `Join the Conversation Today`, `/signup`, `Please
share how`, and `/c/stories/`. Without a verified boundary, import stops before
writing a file. Unknown, duplicate, bare, or empty profile inputs also fail
before file I/O.

You should see `discussionImportPolicy: "pruned:community-call-to-action"` only
after a successful profiled import.

### Build And Preview An Import Queue

Import discovery/queue is required for Alpha. Use either:

- an explicit topic list or manifest for curated imports; preserve the order the
  operator supplied;
- “next in category” for queue work. First list/discover available categories,
  including subcategories, then select by category ID or an unambiguous
  slug/name. Preview that category's queue and choose the oldest Discourse
  `created_at`, using topic ID as the stable tie-breaker.

After category selection, optional filters may narrow tags, created-date range,
open/closed status, and result limit. Operators may request oldest-first or
newest-first ordering, but both use `created_at`.

For numbered collections whose created dates are unreliable, Alpha may use
natural topic-title/name ordering (for example, Section 10102 before 10103).
This never permits ordering by latest activity.

Always preview the candidate list before importing and exclude topics already
represented by imported Astro pages.

For deterministic refresh of pages with different policies, use the reviewed
Alpha import manifest rather than a blanket update-all operation. Its strict
JSON contains only `version` and ordered `imports`. Each topic entry retains its
own `commentsDisplay`, `heroImage`/`heroAlt`, and `pruneProfiles`, and caller
order is preserved. Run `import-existing --manifest ... --overwrite`.

Preview before writing. The bridge rejects duplicate topics and mixing manifest
mode with direct topic options, revalidates every entry, checks destinations and
path containment, and stages the whole batch before atomic creation or
overwrite rollback. A failed batch must not leave a partial import set.

Treat every import as two joined contracts:

- **WHEREFROM:** the Discourse base or target, explicit topic or curated order,
  category when the lane uses one, and required tags or filters;
- **WHERETO:** the Astro content root, explicit output file, public route, and
  Astro navigation lane, with the site URL fixed as part of public identity.

Validate the source identity and live tag constraints before writing. Make the
destination deterministic, reviewable, and contained inside the content root.
Manifest v1 keeps these as the existing flat fields—such as `topic`,
`requiredTags`, and `output`—rather than a new nested structure. A nested
`from`/`to` form is only a possible future evolution.

> **Never use:** `bumped_at`, last reply, or latest activity for queue order.
> Community participation must not reorder publishing candidates.

## 7. Choose A Comments Display Mode

| Mode | Use it when | Verify |
| --- | --- | --- |
| `simple` | A lightweight Discourse embed is enough. | Embed host is allowed; basic comments load. |
| `full` | Astro-native display and reply metadata matter. | Replies and likes render; browser refresh works through CORS or a proxy. |
| `fullInteractive` | Logged-in reply, like, quote, and moderation should remain inside Discourse. | Full-app embed, sign-in, iframe height, and mobile behavior work. |

For `full`, configure a same-origin `refreshEndpoint` when browser CORS does not
allow direct topic JSON reads. For `fullInteractive`, enable Discourse's full-app
embed settings and test both signed-in and signed-out users.

To close a live signed-in interaction item, create one clearly labeled test
reply through the browser, then verify its public post URL, content marker, and
updated topic count. Recheck the Astro page's topic/full-app signature afterward.
Record the evidence without publishing private account identifiers.

An existing-page interaction result does not prove a fresh-import workflow.
Before closing an import gate, separately test: no hero/no prune, hero only with
alt text, prune only, and hero plus prune. For every case, verify generated
source-mode guards, preserved topic linkage, build/deploy/live rendering,
comments, and no accidental writeback.

For an existing topic, pass its topic ID through the complete component path.
The native embed should configure `{ topicId }` when it is present and fall back
to `{ discourseEmbedUrl: embedUrl }` only when there is no explicit topic ID.

Rendering ownership changes by comments mode. The package's Astro-rendered
`full` mode now has reviewed first-generation parity: Mermaid replies render
client-side by default, and tables receive readable styling plus horizontal
overflow handling. Set `replies.renderMermaid: false` to opt out. Mermaid is
loaded only when a reply needs it; a load or render failure preserves the source
code for recovery instead of destroying the reply.

In `fullInteractive`, the cross-origin iframe belongs to Discourse, so Astro-side
Mermaid transforms and CSS cannot render or restyle content inside it. The
ordinary topic view may render Mermaid while the full-app comments embed still
shows raw Mermaid source because the embed application does not load normal
theme-component JavaScript. Use Discourse embedded CSS, targeted with the bridge
embed class hook, for immediate table presentation. Mermaid still needs a
Discourse-side embed extension, plugin, or upstream solution; do not mark it
fixed.

**Screenshot placeholders:** one desktop and one mobile capture for each mode.

**Video placeholder:** sign in, reply, like, and return to the Astro page in
`fullInteractive` mode.

### Planned Comments-Boundary Credit

A future configurable credit may say `Discussion connection by Discussion
Bridge` or `Discourse connection by Discussion Bridge`. Final wording, default
behavior, and configuration remain undecided. It must link to the canonical
product page, remain visually secondary, be accessible, work across all three
comments modes, and not be hard-coded into site content.

This is a roadmap item and does not change the current reviewed artifact or its
deployment gate.

## 8. Content Lanes And Route Bases

If `src/content/blog/example.md` renders at `/blog/example/`, use:

```sh
--route-base blog
```

The page URL is part of the Discourse ownership contract. Check it in
`--details` output before every lane's first live write. Only one Astro page may
manage a topic in a run; comparison pages should use `discussionSync: false`.

Keep Astro/template content tags separate from Discourse `discussionTags`
unless an explicit mapping is introduced later.

## 9. Deploy And Verify On Cloudflare Pages

Discussion Bridge does not require Cloudflare Pages, but the Alpha demos use it.
For a static Astro site:

1. Build from the canonical repository and the intended site/example root.
2. Use the project's normal install and `npm run build` commands.
3. Confirm the output directory matches the Astro/Cloudflare project settings.
4. Set the final public URL in Astro `site` and Discussion Bridge `siteUrl`.
5. Attach the intended custom domain and wait for HTTPS to become valid.
6. Add that exact hostname to Discourse's allowed embed hosts.
7. Verify the homepage, a lane route, its companion topic, and comments.
8. When Workers are used, verify both the Worker endpoint and canonical domain.
9. Confirm the deployed page has the expected package/topic signature and that
   any retired renderer is absent.

If more than one Cloudflare account is available, the approved site deployment
configuration should pin the intended account so deployment is repeatable. Keep
private account labels and login addresses out of public manuals and screenshots.

Before making a deployment-only commit, inspect the site worktree. Preserve and
report unrelated pre-existing edits instead of silently including them.

Also build the exact committed candidate from a clean checkout or detached
worktree. A local file deletion can make a dirty build look healthy while the
tracked release still contains the stale page. If the clean build finds one,
isolate the removal or repair in its own reviewed commit and build again.

If the deployed page looks stale, verify the deployment commit and Discourse
topic first. Then test with a cache-bypassing request or clear only the relevant
Cloudflare cache. Do not treat a confirmed sync as failed until cache state is
ruled out.

Discussion Bridge has now been exercised against the production
Cloudflare-CDN-backed Discourse deployment at `forum.repealobbba.org`.
Diagnostics/API reads, topic imports, target reconciliation and source-topic
links, `fullInteractive` comments, signed-in replies, five live source notices,
and no-writeback behavior all passed in that bounded environment.

This proves compatibility with that production deployment, not every possible
CDN, WAF, or cache rule. When placing Cloudflare in front of Discourse, preserve
Discourse API paths and JSON endpoints, embed and full-app routes,
authentication/cookies, and websocket behavior. If API or embed behavior differs
from a direct-origin check, investigate cache and WAF handling before treating
the bridge as broken.

> **Stop if:** the deployment uses a transitional copy instead of canonical
> source, the custom domain differs from `siteUrl`, HTTPS is invalid, or the
> Discourse embed host does not exactly match the public hostname.

## 10. Verify And Recover

After a live operation, verify:

- CLI summary reports the expected created, updated, skipped, or unchanged count.
- the topic title, category, tags, and listing state are correct;
- the first post contains the intended reader-facing content and source link;
- frontmatter contains the expected topic link and sync metadata;
- the Astro page and full-discussion link work;
- comments work in the chosen mode;
- no secret appears in source, output, screenshots, or support material.

Never automatically recreate a deleted topic or first post. Confirm whether the
deletion was intentional, then choose restore, relink, or replacement explicitly.
See [Troubleshooting](./TROUBLESHOOTING.md) for known failures and recovery
guidance.

## 11. Release Readiness And Product Boss Approval

Code completion alone does not make a release ready. For every Alpha, Beta,
release candidate, patch, and Current release, the release record must show:

1. Code Boss reviewed the exact release candidate and recorded pass or fail.
2. All blocking code-review edits are complete and re-reviewed when required.
3. Bridge Boss completed technical verification.
4. Manual Boss completed documentation quality review.
5. The Human and Machine Manuals are ready for the exact release.
6. Product Boss documentation sign-off is recorded.
7. Product Boss release approval is recorded.

These last two decisions are different:

- **Product Boss documentation sign-off** confirms that the manuals and product
  docs accurately describe the proposed release.
- **Product Boss release approval** confirms that the release is coherent across
  intended scope, operator readiness, known limitations, and its documentation
  package.

Product Boss release approval does not replace Code Boss review, Bridge Boss
technical verification, or Manual Boss quality review. A failed, unresolved, or
edit-pending Code Boss review blocks Product Boss approval.

> **Stop if:** any required review is missing, a blocking edit is unresolved,
> the manuals describe a different build, or either Product Boss decision has
> not been recorded for the exact release candidate.

### Alpha/Beta Scope Strategy

Alpha should honestly represent the major capabilities in its declared product
promise and be nearly feature-complete for that promise. Beta should primarily
refine real-user experience, compatibility, reliability, performance,
packaging, documentation, installation, recovery, support, and presentation.
This does not move every future or Layer 3 idea into Alpha.

Tier 1 operation remains API-only, free/self-serve, and independent of any
Discourse plugin. An optional Discourse plugin vertical slice has been proposed
and accepted for Alpha, pending implementation design and proof. It is optional,
not a Tier 1 installation requirement. The first slice is limited to
`fullInteractive` Mermaid/table parity and a future-safe architecture/test
baseline—not the full control plane, post-as-user, PM automation, or general
many-to-many management.

Current proposed CAN path is to use the existing Discourse Mermaid theme
component for normal topics and design a bounded optional plugin slice for
Mermaid in full-app embeds, table parity, embed-context detection, and tests.
This remains pending design/review and does not change Tier 1 installation.

Alpha scope is cumulative. Plugin and multi-target work add to every previously
accepted Alpha gate; they do not rewrite or shorten the promise. Use the existing
dashboard and build/launch checklists as the complete source of truth, and remove
an item only when Phil explicitly directs that change.

### Alpha Topology Proof

The Alpha multi-target model is implemented and reviewed. The first two edges
of the bounded live topology proof are complete; the wider matrix still tracks:

- the same selected `onebigbeautifulbill.us` page → `forum.repealobbba.org`;
- that same selected page → `forum.citizenactivist.network`;
- bounded demo/credit pages → `forum.discussionbridge.dev`;
- multiple Astro/public sites → `forum.repealobbba.org`.

The first two prove one Astro page can explicitly connect to several forums; the
last proves many sites can converge on one forum. Citizen Activist
Network's forum identity is “A community of activists.” Its Cloudflare/account
ownership placement remains an Ops decision.

Live adoption commit `36df91c98a35251edd6ddd657cca42ddf0acdafa` proves the
same 10101 page can retain Repeal OBBBA topic 434 as protected source and primary
`fullInteractive` discussion while linking an independent Citizen Activist
topic 9 under accessible **Additional discussions** navigation. Diagnostics,
target-specific dry-run, publication, unchanged retry, clean build, deployment,
live checks, and no-source-writeback verification passed.

Use the narrowest correct content root. For this lane it is
`src/content/docs/title i` with route base `title-i` and active target
`citizen-activist`. An earlier broad dry-run exposed a wrong root/index and a
malformed `title-i/title i` route before any write. Treat previewed route drift
as a stop condition, correct the lane, and rerun dry-run.

Keep credentials in protected storage. Do not copy storage paths, account
values, or secrets into public docs. Existing record-format cleanup belongs in
the protected vault. The exact clean install reported 10 dependency audit
findings (1 low, 1 moderate, 8 high); route them for dependency review and do not
apply an automatic `npm audit fix`.

Post-proof interaction remained correctly separated: Citizen Activist topic 9
accepted a live reply as post 2, while the Astro page continued embedding
protected/primary Repeal OBBBA topic 434. Readers could reach the independent
Citizen Activist conversation through the accessible **Additional discussions**
link. This is interaction/presentation evidence for the closed bounded gate,
not a broader topology claim.

The page must distinguish its protected source target from its ordered
publication/discussion targets. Review each target's forum, topic binding, sync
and error state, and display policy independently. Keep the imported/managed
source protected from writeback while allowing explicitly approved publication
to another forum.

In frontmatter, list the page's targets in order with `discussionTargets`, then
name only writable destinations in `discussionPublishTargets`. Identify the
protected imported/managed source with `discussionSourceTarget`. The bridge keeps
each forum's result independently in `discussionTargetBindings`.

If more than one discussion is linked, choose `discussionPrimaryTarget`. You
should see that discussion rendered in the selected comments mode and the other
targets as accessible named links. Optional `targetLabels` can make those link
names friendlier. Stop if a multi-linked page has no explicit primary; the build
error is protecting the operator from a silent choice.

Run the CLI once per explicit `--target`. If one target fails after another
succeeds, keep the successful binding and retry only the failed target. The
stored failure is target-specific and sanitized. Do not manually discard a
successful binding or create a replacement topic merely because another target
failed.

Choose the primary rendered discussion and state whether additional targets are
linked or rendered; never let the bridge silently select one. If one target
fails, keep successful bindings, report the failure, and retry only that target
idempotently without duplicate topics. Diagnostics, previews, CLI output, and
live checks must identify the target. General administration remains later.

**Every connection has a job.** A reader should understand whether
an additional discussion is for the public community, a chapter or region,
internal review, subject-matter feedback, advocacy coordination, or syndication.
Use that purpose in its visible label and call to action. Never imply that
independent replies have been merged.

Lead with the outcome: “Publish from the site. Learn in the community. Turn what
the community knows into durable pages.” Content can begin on either side;
discussion stays where the people are, and durable knowledge can be published
where readers can find it. A destination-only label is not enough.

Possible reader-facing patterns are **Discuss with the Citizen Activist
Community**, **Review with the policy team**, **Discuss with your state
chapter**, and **View the source wiki**, each followed by a short audience and
context explanation.

CAN can support Astro-to-Discourse and Discourse-to-Astro flows, but only with
separate page/topic pairs and explicit source ownership. Stop if the same item
would be writable in both directions; choose one writer and protect the other
side. Relay, promotion, and summary automation are later features.

Another future pattern is **Local ownership. National reach.** A chapter can
turn local experience into network knowledge without giving up its community,
context, or voice. The national community can discover and discuss chapter work
while every topic remains connected to where it began. Local and national reply
streams stay separate: one serves local coordination/context, the other national
learning/amplification.

The likely reverse path distributes national campaign guidance into selected
chapter forums for local discussion. Before enabling either direction, require
mapped categories, chapter/region metadata, public/private eligibility,
moderator approval policy, source attribution/return links, explicit one-way
updates, and clear moderation owners. General forum-to-forum orchestration is
future design, not current capability.

## 12. Show Where Discourse-Sourced Content Came From

Pages imported from or managed in Discourse should disclose their source near
the start of the article. This notice is separate from comments and from any
Discussion Bridge credit at the comments boundary.

Wire `DiscussionSource` into the canonical page boundary:

```astro
---
import DiscussionSource from "astro-discussion-bridge/DiscussionSource.astro";
---

<DiscussionSource frontmatter={Astro.props.frontmatter} />
```

The plain Astro BlogPost layout and Starlight `MarkdownContent` override are the
canonical placements. You should see a quiet aside labeled **Content source**
with a bold **Source:** prefix:

- `discourse-imported`: “This page originated in Discourse and was imported
  here for publication.”
- `discourse-managed`: “This page is managed in Discourse and published here
  for easier reading.”
- `astro-managed` or unknown mode: no notice.

`sourceLabel` defaults to `Discourse`. Use `sourceLabel`, `message`, and
`linkLabel` to adapt public wording without hiding provenance. Other component
inputs are `class`, `mode`, `sourceUrl`, `targetBindings`, and `frontmatter`.

The source link follows this order: explicit `sourceUrl`,
`discussionImportedFrom`, the protected `discussionSourceTarget` binding (with
legacy `discussionTarget` fallback), then legacy `discourseTopicUrl`. Only
absolute `http` or `https` URLs become links. If every candidate is unsafe or
malformed, the disclosure remains visible without a link.

> **Stop if:** a multi-target page attributes its origin to an additional
> publication target. Provenance must always follow the protected source target.

Package behavior is implemented and reviewed at `a9d2097` with Code Boss PASS
and 68/68 tests. OBBBA adopted reviewed artifact
`astro-discussion-bridge-0.1.0-alpha-a9d2097-f3fbb73e.tgz` at commit `aa7846d`.
Its clean production build and deployment passed. All five canonical Title I
routes now show exactly one **Content source** aside and one source link, with
the imported wording, `Repeal OBBBA Forum` label, and correct protected
`forum.repealobbba.org` topic. The existing discussion boundary remains present.
This closes OBBBA source-disclosure adoption only; it does not close the separate
Citizen Activist topology gate.

## 13. Alpha Support And Release Channel

The current Alpha release decision is GitHub release plus repository-installable;
npm publication is held until late Beta. The intended support split is:

- GitHub Issues for confirmed bugs, reproducible failures, docs gaps, and
  feature work;
- the Discussion Bridge Alpha Support category for setup questions, field
  reports, screenshots, and community help;
- `alphasupport@discussionbridge.dev` as email intake routed into Discourse;
- paid help for private implementation and migration work.

The live support category and email route remain release prerequisites until
verified. Never include keys or credentials in a support report. Follow
[Support And Feedback](./SUPPORT_AND_FEEDBACK.md) for the sanitized diagnostic
fields to include.

## Related Guides

- [Machine Manual](./MACHINE_MANUAL.md)
- [Alpha Setup](./ALPHA_SETUP.md)
- [Key Management](./KEY_MANAGEMENT.md)
- [Content Lanes](./CONTENT_LANES.md)
- [Comments Display](./COMMENTS_DISPLAY.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
- [Build/Launch Checklists](./BUILD_LAUNCH_CHECKLISTS.md)
