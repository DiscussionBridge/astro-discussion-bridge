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

For each key, choose **User Level** and **Scope** independently. `All Users`
allows the request to act for the supplied `Api-Username`; `Single User` binds
the key to its selected user. Scope separately limits endpoints. Discussion
Bridge supplies the preferred request actor from `--post-as`,
`DISCOURSE_POST_AS`, or lane/default `postAs`/`postAsEnv`. Legacy
`--api-username`, `DISCOURSE_API_USERNAME`, `apiUsername`, and `apiUsernameEnv`
remain fallbacks. The resolved actor is sent as `Api-Username`. Live operations
show `Post as: USER`; `check-discourse` shows `Request actor`.

When creating either key, show its complete purpose block with the setup
instructions and copy that block into the respective protected credential file
above the secret value.

Publishing key record:

```text
Purpose: Runtime publishing granular key
Use: publish-new, sync-existing, publish-and-sync, check-discourse basic limits
Bot user role: Admin currently; intended future runtime posture is non-admin or least-privilege
Key user level: Record All Users or Single User; prefer Single User for a fixed runtime actor
Key selected user: Record when User Level is Single User
Request actor: Record resolved postAs / Api-Username
Key scope: Granular
Operational rule: Use this to validate the minimum permissions needed for normal bridge publishing.
```

Diagnostics key record:

```text
Purpose: Diagnostics/setup key
Use: check-discourse only
Bot user role: Admin
Key user level: Record All Users or Single User and the selected user/actor relationship
Key selected user: Record when User Level is Single User
Request actor: Record resolved postAs / Api-Username used for diagnostics
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
settled User Level and publishing scopes, with no visible key value.

Create a `special-admin` custom group as the visible inventory for nonhuman
admin/service accounts. Then assign actual admin, category, and API authority
separately; group membership grants none of those by itself.

For connected forums, prevent actual and visually ambiguous service-account
collisions. Candidate forum-source editors are `editorbridgeforum` /
**Discussion Bridge Forum Editor** and `editorcanforum` / **CAN Forum Editor**.
Verify normalized username length and availability before creation.
Astro-origin actors should identify the source site or brand; keep established
`obbba-bot` as the OBBBA source identity.

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
DISCOURSE_POST_AS
DISCOURSE_API_USERNAME
DISCOURSE_API_KEY
DISCOURSE_DIAGNOSTICS_API_KEY
```

`DISCOURSE_DIAGNOSTICS_API_KEY` is optional. When absent,
`check-discourse` falls back to the publishing key and may report metadata as
unavailable rather than failing.

Prefer `DISCOURSE_POST_AS`; retain `DISCOURSE_API_USERNAME` only for backward
compatibility. `postAs` selects the request actor but does not silently change
ownership of an existing topic.

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
  --source-mode discourse-managed \
  --site-url https://docs.example.com \
  --dry-run
```

Choose `discourse-managed` when edits continue in the source topic. Omit
`--source-mode` or use `discourse-imported` for the imported-copy default.
`astro-managed` is rejected because import is a Discourse-to-Astro operation.

```yaml
discussionSourceMode: discourse-managed
discussionSync: false
```

You should see the selected source mode and `discussionSync: false` generated
with a Markdown file linked to the original topic. Review the imported body and
frontmatter before building or editing. Avoid `--overwrite` unless replacement
is intentional and recoverable. A manifest entry may use `sourceMode` to make
the same selection per topic.

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

Use the read-only discovery command before import:

```text
npx astro-discussion-bridge discover-imports src/content/docs \
  --category TITLE-I \
  --tags TITLE-I \
  --order natural-title \
  --limit 10 \
  --discourse-url https://forum.example.com
```

Use `--list-categories` first when you need IDs, exact slugs, names, parent
relationships, and topic counts. Add `--include-subcategories` only when the
selected lane should include descendants. Other optional controls are
`--created-from`, `--created-to`, `--status all|open|closed`, `--order
oldest|newest|natural-title`, `--limit`, and `--json`.

The command previews only; it never imports. It recursively excludes topic IDs
found in opening-frontmatter `discourseTopicId` or strictly parsed
`discussionTargetBindings`; unrelated `topicId` metadata remains eligible.
Descendant categories are fetched directly and deduplicated. A date-only
`--created-to` includes that entire UTC day.

Add `--manifest-out FILE` to save the reviewed order as a new strict v1
manifest; the command refuses to overwrite an existing file. All runtime
source-mode/comments-display validation finishes before network or local
scans, and manifest validation finishes before dereference or filesystem work.
Generated entries default to `discourse-imported`, with optional
`discourse-managed` source mode and an explicit comments display. Public
categories need neither a site URL nor credentials.

Final reviewed evidence is Code Boss PASS and 84/84 tests plus a live read-only run
against the Cloudflare-CDN-backed Repeal OBBBA forum: category 18, `TITLE-I`,
natural-title order, and limit 10 scanned 320 topics, excluded five already
imported topics, and previewed topics 754, 755, 756, 757, 758, 759, 761, 762,
763, and 764. No file was written.

The OBBBA worked example then saved those ten candidates as a tracked strict v1
manifest, applied a uniform source/comments/tag/hero/alt/prune policy, and ran a
credentialed read-only manifest dry-run. Expected evidence was 0 imported, 0
skipped, 10 dry-run, and `generatedPages=0`. Treat that as candidate-policy and
dry-run approval only; live import, build, deploy, and route verification remain
separate gates.

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

If the source topic later moves to another Discourse category, Discussion
Bridge reports:

```text
source category changed: OLD -> NEW; Astro route/navigation unchanged
```

An overwrite refreshes `discussionSourceCategoryId`, but it does not silently
move the Astro file, public route, or Astro navigation lane. WHEREFROM changed;
WHERETO remains an explicit operator or manifest decision. Review and change
the destination separately only when that is the intended publishing decision.

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

The cumulative Alpha feature/function set is locked in the product checklist.
After the lock, work belongs in Alpha only when it closes an existing promise or
gate, fixes exercised behavior, or is approved explicitly as a scope change.
Unchecked Alpha gates still need to be finished; the lock does not mark them
complete.

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

Discourse Mermaid is the official **theme component** documented at
[Meta topic 218242](https://meta.discourse.org/t/discourse-mermaid/218242) and
[discourse/discourse-mermaid-theme-component](https://github.com/discourse/discourse-mermaid-theme-component).
It is not a plugin. Keep it distinct from a fork/extension of that theme
component, the separate optional `Discussion Bridge for Discourse` plugin, and
an upstream Discourse change.

The optional plugin is a separate product/repository under Boss routing. Its
v0.1 Alpha goal is installable and removable on supported stock/current
Discourse with documented rollback, no ordinary-topic regression, and a live
CAN full-app proof. It must detect embed context explicitly and cover Mermaid,
tables, and tests. Full control plane, general forum-to-forum orchestration,
post-as-user, PM automation, and broad many-to-many administration remain out.

Alpha scope is cumulative. Plugin and multi-target work add to every previously
accepted Alpha gate; they do not rewrite or shorten the promise. Use the existing
dashboard and build/launch checklists as the complete source of truth, and remove
an item only when Phil explicitly directs that change.

All three Alpha software tracks remain free/open source unless explicitly
changed later: the Astro package, the optional light Discourse plugin, and
public docs/community support. Paid offerings are implementation help,
handholding, managed hosting/operations, customization, support, and
consulting. Third-party hosting and infrastructure remain operator-paid.

### DiscussionBridge.dev Dogfood Proof

Alpha must demonstrate the product loop in both directions without creating a
two-writer loop:

1. Publish an Astro-managed `discussionbridge.dev` blog post to a public
   companion discussion on `forum.discussionbridge.dev`.
2. Republish a reviewed community wiki/how-to from
   `forum.discussionbridge.dev` as a durable guide on
   `discussionbridge.dev`.

For the wiki lane, use `discourse-managed` plus `discussionSync: false`, show
source provenance near the article start, preserve the source topic as the
primary discussion, and define the output route and Astro navigation lane
explicitly. Refresh deterministically from the wiki topic. Editors change the
wiki in Discourse; the site republishes the reviewed source. Do not imply that
replies from separate topics are merged.

> **You should see:** a public guide with a clear source link, an explicit
> primary discussion, and predictable navigation placement.

> **Stop if:** the site is able to write back to the wiki source, the source
> topic changes unexpectedly, the destination route drifts, or comments
> presentation silently selects or merges discussions.

The public outcome is: “The site starts conversations. The community develops
durable knowledge. The site publishes what the community learns.”

Implementation and Code Boss review are complete at `1731547` with 72/72 tests.
Apex adoption commit `d68ffc4` also received Code Boss PASS, passed a clean
detached install/build that generated five actual public apex routes, and was
deployed on 2026-07-23. This is distinct from the readable product-docs build,
which synchronized 20 documentation sources and generated 21 HTML pages in this
documentation pass.

<figure>
<pre role="img" aria-label="Two separate Discussion Bridge connections. An Astro-managed blog publishes to forum topic 37. Forum wiki topic 36 publishes to an Astro guide. Their reply streams remain separate.">
Astro-managed blog ──publishes──▶ Forum topic 37

Forum wiki topic 36 ──publishes──▶ Discourse-managed Astro guide

             Reply streams remain separate
</pre>
<figcaption>DiscussionBridge.dev two-direction dogfood topology.</figcaption>
</figure>

Visuals derived from this diagram must use alt text that names both directions
and says the reply streams remain separate. Do not include admin screens,
credentials, tokens, account identifiers, or protected storage in screenshots
or video.

Live verification shows:

- `/blog/every-connection-has-a-job/` returns 200 and binds its independent
  public companion discussion to topic `37`;
- `/guides/how-to-choose-a-discussion-bridge-source-mode/` returns 200, shows
  source disclosure, and renders source wiki topic `36` as the primary
  fullInteractive discussion;
- a deliberate guide `sync-existing --dry-run` skips with the
  `discourse-managed` no-writeback reason;
- the raw Pages hostname redirects to the canonical apex.

This closes the bounded two-direction dogfood gate. It does not claim merged
reply streams or general forum-to-forum orchestration. The clean install still
reported one high-severity npm audit finding, and the Mermaid chunk remains
larger than 500 kB; neither was hidden or changed with an automatic audit fix.
See the
[sanitized verification record](https://github.com/DiscussionBridge/astro-discussion-bridge/blob/main/docs/evidence/DISCUSSIONBRIDGE_DEV_TWO_WAY_DOGFOOD_2026-07-23.md)
for the live markers and claim boundary.

The topic-36 editor-ownership acceptance test remains open. A human operator
must change the wiki first-post owner from `discourseadmin` to the selected
Discussion Bridge Forum editor, edit the wiki while signed in as that editor,
re-import/refresh the `discourse-managed` guide with overwrite, then verify
content and source ownership, build/deploy/live markers, and no Astro
writeback. Actor configuration alone does not complete this test.

Imported pages may now show `Source author: Display Name (@username)` when
Discourse exposes safe author data. The username links only to the same forum's
safe `/u/username` profile, preserving a Discourse subfolder base when present:
`https://example.com/forum/t/...` becomes
`https://example.com/forum/u/editorbridgeforum`. Unsafe usernames are omitted
rather than linked.
An explicit overwrite refresh updates `discussionSourceAuthorUsername` and
`discussionSourceAuthorName` while preserving source mode,
`discussionSync: false`, and topic ID.

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

The intended public Alpha channel is a GitHub prerelease plus an npm prerelease
of the same reviewed Astro-package commit. Publish a semver prerelease such as
`0.1.0-alpha.1` under npm dist-tag `alpha`—never `latest`. The exact first
version remains a release-gate decision. Public installation becomes:

```powershell
npm install astro-discussion-bridge@alpha
```

Reserve `latest` for the first stable release. Beta should deliberately choose
`beta`, `next`, or another documented prerelease tag after Alpha learning; npm
does not begin only in Beta. Repository/tarball installs remain useful for
development, recovery, and fallback, but are not the primary public Alpha path.

Do not publish until the release checklist passes package ownership/publisher
authority, account security, exact version/content review, clean packed and
registry installs in plain Astro and Starlight, exports/components/CLI/feature
smokes, metadata and secret/file hygiene, Code Boss and Manual Boss review,
GitHub/npm commit correspondence, dist-tag verification, consumer install, and
rollback/deprecation procedure. Published npm versions are immutable. Never run
an automatic `npm audit fix` as part of release preparation.

### Attribution And Licensing Gate

Run the full package suite against the exact built release candidate. Its
passing result includes the automated full attribution gate, covering
root/package MIT parity and holder, package metadata, production dependency
licenses against the explicit allowlist or reviewed override evidence,
required npm package contents, README/non-affiliation and rendered links,
tracked-media provenance, and protected-path scanning. Record the exact suite
total in the candidate-specific evidence.

The readable docs build runs a narrower gate. You should see:

```text
Attribution and licensing gate: PASS (docs scope)
npm package contents: SKIPPED (requires built release candidate)
```

The synchronized-source and generated-HTML totals mean synchronization,
rendering, and this bounded docs-scope check passed. Record the exact totals in
the candidate-specific evidence. This result does not verify the release
tarball and does not replace the full package gate.

> **Stop if:** either gate fails, the results are conflated, generated
> attribution output was not regenerated on a fresh checkout, or a
> protected/private path appears.

Automation cannot decide whether attribution is adequate or whether copied,
adapted, branded, or sourced material is appropriate. Before release, Manual
Boss must record `Attribution and Licensing: PASS / FAIL / N/A`, list the paths
reviewed, and create a sanitized review record tied to the exact release
commit.

For candidate `b09dbce` atop `7127eb1` and `462b3ae`, Manual Boss recorded
`Attribution and Licensing: PASS` with no remaining findings or blockers. Read
the [sanitized exact-candidate review record](https://github.com/DiscussionBridge/astro-discussion-bridge/blob/main/docs/evidence/ATTRIBUTION_LICENSING_REVIEW_B09DBCE_2026-07-23.md).
This PASS applies only to that exact candidate; it does not pre-approve later
release changes.

The intended support split is:

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
