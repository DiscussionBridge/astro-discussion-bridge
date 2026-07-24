# Product Notes

## Strategy Discovered Through Building

Discussion Bridge started with a practical need: Astro pages should have real Discourse discussions. Building the bridge revealed the larger system around that need:

- publishing lanes
- source-of-truth rules
- diagnostics and setup checks
- key models and permission boundaries
- operational docs as product memory
- future Discourse plugin control-plane possibilities
- central organization, chapter, regional, public, private, and internal community use cases
- static publishing clarity plus community continuity
- content lanes and explicit source ownership
- diagnostic/runtime key boundaries
- bidirectional but single-writer flows
- purposeful connections where every connection has a job
- local/national federation
- optional Discourse-side enhancement without making Tier 1 plugin-dependent

This is a WebSynergetics-style process: start with useful work, let the work expose the system, then capture the reusable pattern where it belongs.

This product definition was discovered through implementation. It is not a
retrofitted feature list: an initially undefined static-site/community
connection problem exposed the operating model one real constraint at a time.

## Public Alpha Distribution

The Astro package's intended public Alpha path is a GitHub prerelease and npm
prerelease from the same reviewed commit. Use a semver prerelease (candidate
example `0.1.0-alpha.1`) and npm dist-tag `alpha`; never assign Alpha to
`latest`. Public users install `astro-discussion-bridge@alpha`. Reserve `latest`
for stable. Repo/tarball installation remains a development/recovery fallback.

Actual npm publication remains open until the release gates pass. The registry
path is itself product proof: it must expose packaging, exports, CLI bin,
dependencies, installation, docs, and support problems before stable. Beta
continues on a deliberately selected prerelease tag rather than being the first
npm publication.

### Attribution And Licensing Release Contract

The automated attribution gate is now part of the package suite (73/73, Code
Boss final PASS). It checks objective license parity/holder, metadata,
production dependency licenses with explicit allowlist or reviewed override
evidence, required packed contents, README/non-affiliation and rendered links,
tracked-media provenance, and protected paths. Khroma 2.1.0 has durable reviewed
MIT evidence.

The docs build runs a bounded `--docs-scope` gate before rendering and reports
`PASS (docs scope)` while explicitly skipping npm package contents because they
require the built release candidate. Its 20/21 result is therefore not the full
73/73 package gate.

Both automated gates remain distinct from Manual Boss semantic judgment.
Release requires an exact `Attribution and Licensing: PASS / FAIL / N/A`,
reviewed paths, and a sanitized record tied to the release commit. That Manual
Boss result is now PASS for the corrected exact candidate through `b09dbce`
atop `7127eb1` and `462b3ae`, with no remaining findings. The
[sanitized review record](https://github.com/DiscussionBridge/astro-discussion-bridge/blob/main/docs/evidence/ATTRIBUTION_LICENSING_REVIEW_B09DBCE_2026-07-23.md)
records reviewed paths and the correction history. Later candidates require a
new semantic review.

## Product Frame

Discussion Bridge shows a path from static publishing to living community infrastructure.

Publish from Astro. Discuss in Discourse. Keep the relationship alive.

Static sites are excellent at clarity, speed, ownership, and presentation. Discourse is excellent at memory, reply, trust, moderation, notification, and continuity. Discussion Bridge gives organizations a practical path between those worlds without forcing them to give up either one.

## Operating Principle

WebSynergetics finds the durable system by doing the useful work.

For Discussion Bridge, the durable product loop is:

publish -> sync -> diagnose -> maintain -> recover -> document

Every feature should make that loop more usable, understandable, and recoverable. The product is not only topic creation; it is the operating system around linked publishing and community discussion.

## Product Identity At The Comments Boundary

A restrained credit near the comments boundary may help readers understand what
connects the page and forum. Candidate wording is `Discussion connection by
Discussion Bridge` or `Discourse connection by Discussion Bridge`. The final
wording, default, and configuration are not yet decided.

The credit should link to the canonical product page, remain visually secondary,
be accessible, work in `simple`, `full`, and `fullInteractive`, and be emitted by
package configuration rather than hard-coded into site content.

## Bounded Cross-Forum Proof

Alpha includes implemented multi-target operation. Package commit `60e41e1`
establishes the code and test baseline; the OBBBA/Citizen Activist live topology
proof remains an open release gate:

- the same selected `onebigbeautifulbill.us` page connects to both
  `forum.repealobbba.org` and `forum.citizenactivist.network` through an explicit
  ordered target list;
- bounded demo/credit pages connect to `forum.discussionbridge.dev`;
- multiple Astro/public sites converge on `forum.repealobbba.org`;

The bounded OBBBA → Citizen Activist live proof completed at adoption commit
`36df91c98a35251edd6ddd657cca42ddf0acdafa`. The live 10101 page preserves
Repeal OBBBA topic 434 as protected source and primary `fullInteractive`
discussion, while accessible Additional discussions navigation links to Citizen
Activist topic 9. Target diagnostics, target-specific dry-run, publication,
unchanged retry, clean build, deployment, live binding checks, and no-writeback
checks passed.

After closure, Citizen Activist topic 9 accepted a live reply as public post 2.
The Astro page still embedded protected/primary Repeal OBBBA topic 434, and the
Citizen Activist thread remained independently reachable through accessible
Additional discussions navigation. This strengthens interaction/presentation
evidence only; it does not expand the bounded claim.

This proves the exercised same-page two-forum topology, not a general
many-to-many administration plane. Credential records remain protected; their
format cleanup is a vault task, not public documentation. Dependency review is
still required for the exact install's 10 audit findings (1 low, 1 moderate,
8 high); do not run an automatic audit fix.

The CitizenActivist.Network forum is publicly described as “A community of
activists.”

For each non-default target, configure the named target, select the pages
explicitly, run diagnostics, verify build and live topic/page bindings, and prove
there is no cross-target writeback. Production OBBBA source lanes remain on
`forum.repealobbba.org`.

This is a real Alpha product capability, not topology wording alone. The model
must distinguish the source target from publication/discussion targets and
persist forum identity, topic ID/URL, sync state, error state, and display policy
for every target independently. An imported or Discourse-managed source retains
its no-writeback protection while the page may publish explicitly to another
target.

Comments presentation must declare one primary rendered discussion and how
additional targets are linked or rendered; the bridge must never silently pick
one. Multi-target writes use recoverable partial-success semantics: keep
successful bindings, report the failed target, and retry idempotently without
creating duplicate topics. Diagnostics, dry-run, CLI output, manuals, and live
proof are target-specific. General many-to-many administration remains later.

The settled frontmatter contract is:

- `discussionTargets`: ordered CSV of every named target for the page;
- `discussionPublishTargets`: explicit writable subset;
- `discussionSourceTarget`: protected imported/managed source target;
- `discussionTargetBindings`: JSON scalar map keyed by target, preserving each
  topic ID/URL, source hash, sync time, status, sanitized error, and attempt time;
- `discussionPrimaryTarget`: required when more than one linked discussion exists.

The CLI intentionally operates on one explicit `--target` per run. Build-time
publishing may use ordered `publishOnBuild.lanes`; each lane names its target and
may supply its own forum URL and direct or named-environment credentials. Lanes
run sequentially, so a later failure does not erase earlier success. Retry only
the failed target. A 422 embed/title collision is reconciled to the discovered
owning topic for that target. Malformed binding JSON or shape fails before any
network access.

At presentation time the declared primary discussion renders in the chosen
comments mode. Additional discussions appear as accessible named links, with
optional `targetLabels`. Multiple linked discussions without an explicit primary
fail clearly instead of choosing silently. Reusable parsing, presentation, label,
and type helpers are public through `astro-discussion-bridge/targets`.

The `forum.` hostname is deliberately literal and operationally clear; community
meaning belongs in the forum identity and copy. Cloudflare/account ownership
placement remains an Ops decision.

### Every connection has a job

Discussion Bridge does not pour every conversation into one shared comment
stream. It connects each page to the right community for a declared reason.
Every connection tells people who the conversation is for, what they can do
there, and where the durable source lives. Each community keeps its own members,
moderation, permissions, history, and context.

Target labels alone are insufficient. The Citizen Activist additional-target
reply felt odd because the interface named a destination without explaining why
that connection mattered. Reader-facing language should instead say things like:

- **Discuss with the Citizen Activist Community** — Public advocacy discussion.
  Replies remain in the CAN Community.
- **Review with the policy team** — Private internal review for staff and
  subject-matter experts.
- **Discuss with your state chapter** — Local implementation and impact
  discussion.
- **View the source wiki** — This guide is maintained by the community in
  Discourse.

Independent replies remain independent; the bridge must not silently merge
them. Primary versus additional presentation stays explicit. Relay, promotion,
or summary behavior is later scope and requires its own contract.

### Every Automated Actor Has An Origin

The preferred Astro-to-Discourse actor is now configured with `--post-as`,
`DISCOURSE_POST_AS`, or lane/default `postAs`/`postAsEnv`; legacy API-username
controls remain fallback-compatible. The resolved actor is sent as
`Api-Username`. Discourse key User Level controls whether a key is bound to one
user or may act for a supplied username, while key Scope independently controls
endpoints.

`postAs` does not silently transfer ownership of an existing topic. Owner
transfer remains a separate future operation. Imported source-author metadata
now follows the current Discourse first-post author during explicit overwrite
refresh and renders only through a safe same-forum profile link. Profile URL
construction preserves a Discourse subfolder base, so a topic under
`https://example.com/forum/t/...` links to
`https://example.com/forum/u/editorbridgeforum`. Regression coverage includes
that base preservation plus real `--post-as` CLI execution and dry-run actor
output; those regressions remain covered in the current 79/79 package suite.

Source category is now durable WHEREFROM metadata. Import records
`discussionSourceCategoryId`; skip, dry-run overwrite, and live overwrite
compare the current Discourse category with the existing opening YAML
frontmatter. A change is reported as `source category changed: OLD -> NEW;
Astro route/navigation unchanged`. Overwrite refreshes that source fact but
does not move the destination file, public route, or Astro navigation lane.
Those WHERETO decisions remain explicit and reviewable. Direct and strict
atomic-manifest paths preserve the reason and all source/no-writeback
protections. Opening-frontmatter parsing is LF/CRLF/BOM safe and ignores
body/code-block lookalikes. Code Boss passed the reviewed implementation; the
current package suite passes 79/79.

Many-to-many operation must not create identical or visually ambiguous
nonhuman identities across forums. Service identities encode role plus origin:
candidate forum-source editors are `editorbridgeforum` / **Discussion Bridge
Forum Editor** and `editorcanforum` / **CAN Forum Editor**, subject to each
forum's normalized username rules and availability. Astro-origin actors name
their source site/brand; established `obbba-bot` remains the OBBBA source
identity.

Each forum should use a `special-admin` custom group as the visible inventory
for nonhuman admin/service accounts. That group is not an authorization
mechanism and grants no admin status, category permissions, or API rights.

Category intent is source- and target-specific. A configured category is
authoritative for Astro-managed topics and sync corrects drift. Without a
configured category, manual Discourse placement remains. Discourse-managed and
imported source topics are protected from category writeback, while each
publication target keeps an independent category contract.

Citizen Activist Network supports both directions through separate page/topic
pairs with explicit ownership. Astro-managed `citizenactivist.network` content
may publish companion topics to `forum.citizenactivist.network`; selected forum
topics may become Discourse-managed or imported Astro pages. Never make the same
item writable in both directions at once. That single-writer rule prevents
publication loops.

The public promise is: **Publish from the site. Learn in the community. Turn
what the community knows into durable pages.** One site and one community can
work in both directions: an Astro apex blog post can start discussion on the CAN
forum, while a protected community-authored Discourse source topic or how-to
can become a durable page on the apex site without losing its forum source or
history. Wiki status is optional.

Candidate implementation vocabulary—pending design review, not final or
implemented—is `role`/`purpose`, `audience`, `callToAction`, `description`, a
visibility/context note, direction/source ownership, and presentation as
embedded primary versus linked additional. Candidate roles include
`primary-community`, `public-community`, `chapter`, `internal-review`,
`expert-feedback`, `source-wiki`, and `syndication`.

### Local ownership. National reach.

A governed chapter-to-national connection is a strong future use case. A local
chapter can promote selected work from a designated category on its own forum
into a mapped national category, remaining visibly credited and linked to the
place where the work began. Local coordination replies and national learning/
amplification replies remain separate because they have different jobs.

The reverse direction is also useful: national campaign guidance can distribute
to selected chapter forums for local discussion and adaptation. This is a
governed hub-and-spoke/federated pattern, not silent post duplication. Public
language can say **Discuss with the local chapter**, **Join the national
discussion**, **See how other chapters are responding**, or **Share this chapter
report with the national community**.

Future design must carry source forum/topic and chapter identity, parent/child
relationship, mapped categories, required region/chapter tags, automatic versus
moderator-approved promotion, public/private eligibility, attribution/return
link, target-specific title/CTA/description, one-way first-post sync,
independent replies, target-specific recovery/idempotency, and moderation
ownership at both levels. Optional posting as chapter identity is later scope.
Current Discussion Bridge does not claim full forum-to-forum orchestration.
These governance mappings and approvals belong in future optional plugin/control-
plane design; they must not become a Tier 1 plugin dependency.

## CDN-Backed Discourse Field Proof

`forum.repealobbba.org` is served through Cloudflare CDN. The completed OBBBA
work therefore proves Discussion Bridge compatibility with this production
CDN-backed Discourse deployment across the workflows actually exercised:
diagnostics/API reads, imports, topic reconciliation and protected source links,
`fullInteractive` comments and signed-in replies, source disclosure, and
no-writeback behavior.

The claim is deliberately bounded. It does not guarantee every Cloudflare,
CDN, WAF, or cache-rule combination. Operators must preserve Discourse API/JSON
paths, embed/full-app routes, authentication and cookies, and websocket behavior.
When edge behavior differs from direct origin, investigate cache/WAF treatment.
The bounded Citizen Activist multi-target live gate is complete; wider matrix
edges and general administration remain separate scope.

## Discourse Source Disclosure

Source provenance is implemented and reviewed at `a9d2097` (Code Boss PASS,
68/68). `DiscussionSource.astro` gives imported and Discourse-managed pages a
quiet, accessible source notice near the article start. It is deliberately
separate from comments and the proposed Discussion Bridge credit.

The helper resolves only `discourse-imported` and `discourse-managed`; Astro-
managed and unknown modes produce no notice. It prefers an explicit URL, then
the imported-from URL, then the protected source-target binding, and finally
legacy topic metadata. Unsafe URLs are skipped without suppressing the notice.
On multi-target pages provenance follows the protected source—not an additional
publication forum.

The package exports the component plus `resolveDiscussionSourceNotice`,
`DiscussionSourceMode`, and `DiscussionSourceNotice` through the root and
`./source`. Canonical Astro and Starlight boundaries are wired.

OBBBA adoption is complete at `aa7846d` using reviewed artifact
`astro-discussion-bridge-0.1.0-alpha-a9d2097-f3fbb73e.tgz` (SHA256
`F3FBB73E95D52B5799FBEBE5221298040FD32292EDA8BD76C257C0C19E4267B2`). A clean
detached install/build passed, deployment succeeded, and all five canonical
Title I routes showed exactly one correctly labeled source aside/link to their
protected Repeal OBBBA topics while preserving the discussion boundary. No
Discourse write occurred. The later Citizen Activist publication preserved this
protected source and did not write back to it.

## Alpha Import Queue Principle

Alpha includes deterministic import discovery, not only one-off topic import.
Curated manifests preserve the caller's chosen order. Category queue work first
discovers categories and subcategories, then selects one by ID or unambiguous
slug/name. After preview, “next” defaults to oldest Discourse `created_at`, with
topic ID as the stable tie-breaker. Tags, created-date range, open/closed status,
and limit remain optional filters.

Community activity is not publishing priority. `bumped_at`, last reply, and
latest activity must never reorder an import queue. Operators preview candidates
first, and already imported topics stay out of the selectable queue.

For numbered legislative or structured collections, natural topic-title/name
ordering is also an Alpha option when creation dates are muddled. This is still
editorial ordering, never latest-activity ordering.

The read-only `discover-imports` implementation now turns that principle into
an operator workflow. It lists and selects categories by exact ID, slug, or
name; optionally includes descendants; filters by tags, created range,
open/closed state, and limit; and orders oldest/newest by `created_at` with a
topic-ID tie-break or by natural title. It recursively excludes local source
and target-binding topic IDs, previews candidates, supports JSON, and may write
a new—but never overwrite an existing—strict v1 manifest. Public-category
discovery requires no site URL or credentials.

Final review tightened the safety boundary: runtime source-mode/comments-display
values reject before network or local scans; the writer validates before
dereference/filesystem work; exclusions use only opening-frontmatter
`discourseTopicId` and strictly parsed target bindings; unrelated `topicId`
metadata stays eligible. Descendants are fetched directly and deduplicated,
and date-only `created-to` includes the full UTC day.

Code Boss returned PASS after three correction rounds, the package suite passes
84/84, and the full attribution/package gate passes. A live read-only CDN-backed
TITLE-I/category-18 run scanned 320 topics, excluded five already imported
topics, and returned the next ten natural-title candidates beginning with topic
754 (Section 10106); it wrote no files. Implementation, live read-only proof,
and Code Boss review are complete.

The next OBBBA Title I batch also proved a key-model boundary. Topic 754 was
readable at `/t/754.json`, but its first post lacked raw Markdown. Fetching that
first post by post ID at `/posts/761.json` returned 403 with the granular key;
`761` in that endpoint is the post ID, not the separate topic 761 in the batch.
The diagnostics/global key could read the required raw endpoint. Until
Discourse exposes or identifies a suitable
granular raw-post scope, controlled `import-existing` source reads may use the
protected diagnostics key in memory. It remains prohibited from CI/build,
runtime publishing, and deployment configuration.

The exact ten-topic manifest then completed live import, clean build, corrected
deployment, and per-route verification. Ten Astro files were created with zero
Discourse writes; all ten canonical routes are live with their expected source,
hero, disclosure, and discussion boundary. This is bounded OBBBA field
evidence, not a claim that every Discourse permission model or CDN/WAF policy
behaves identically.

## Accessible Hero Imports

Alpha supports an optional leading hero during `import-existing`, but image and
meaningful alt text are inseparable inputs. The bridge preserves the normalized
Discourse body after inserting the leading image and supports local paths, URLs,
spaces, and escaped alt text. This keeps accessibility part of the import
contract rather than a cleanup step.

## Fail-Closed Import Pruning

Pruning is an explicit import policy, not a loose text cleanup. The first Alpha
profile removes a known trailing community call-to-action only when its complete
boundary and marker set are verified. Ambiguity fails before writing, and the
selected profile is preserved in import metadata.

Because hero, pruning, and comments policy may differ by topic, deterministic
multi-page refresh uses the reviewed ordered import manifest. It preserves
caller order and each topic's policy, rejects ambiguous inputs, preflights and
stages the complete batch, then uses atomic creation or overwrite rollback. A
blanket “update all” cannot safely reconstruct heterogeneous page policy.

The OBBBA five-page live proof (`434`, `747`, `751`, `752`, `753`) confirmed one
correctly bound discussion per route and the expected hero/prune policies. It
also established a release lesson: production-shaped verification must include
a clean build of the exact tracked commit. A dirty local deletion had hidden a
stale tracked starter page, so the removal was isolated before deployment while
unrelated changes and superseded artifacts remained untouched.

Curated import routing now has an explicit WHEREFROM/WHERETO product model.
WHEREFROM proves the Discourse source identity, curated order, category where
applicable, and required tags/filters before writing. WHERETO fixes the Astro
content root, safe output file, public route, site identity, and Astro navigation
lane. Manifest
v1 expresses this with its current flat fields (`topic` and `requiredTags`;
`docsDir`, `output`, site/route settings, and the site title-lane map). A nested
`from`/`to` schema may be explored later, but is not a v1 redesign.

The OBBBA Title-lane proof requires `TITLE-I` on all five source topics, routes
each entry explicitly, generates Starlight Title I–X navigation from the site
map, and passed clean build plus live verification on Worker version
`cde279d5-1c27-452c-964f-59d8dfd7c320`.

## Comments Rendering Ownership

For active Alpha consideration on CAN, use the existing Discourse Mermaid theme
component as the immediate baseline for normal topics, and start a bounded
optional `Discussion Bridge for Discourse` slice for Mermaid inside full-app
embeds, table presentation parity, embed-context detection, and tests. This is a
proposal pending design/review; it is not completed. Tier 1 remains API-only and
must not require the plugin.

The live OBBBA outer Astro page renders its Mermaid SVG and five HTML tables.
The cooked Discourse HTML for topic `434` still contains `code.lang-mermaid`
and a table. In `fullInteractive`, that content lives in a cross-origin iframe
owned by Discourse; host Astro transforms and CSS cannot cross that boundary to
render Mermaid or restyle the tables.

The package's bridge-rendered `full` mode has now completed that parity review.
It lazily renders Mermaid 11 with strict security and source-preserving failure
fallback, styles tables for readability and overflow, and exposes
`replies.renderMermaid` as a default-true public option. The lazy chunk may cause
Vite's greater-than-500-kB build warning, but is fetched only when needed.

`fullInteractive` remains a different product boundary. The ordinary topic-434
view renders Mermaid through the Discourse theme component, but the full-app
comments embed leaves Mermaid as raw code because normal theme-component JS is
not loaded there. Tables parse but need stronger embedded styling. The immediate
supported table path is Discourse `common/embedded.scss`, targeted with the new
embed class hook. Mermaid remains open pending a Discourse embed extension,
plugin, or upstream answer; it is not fixed by the `full` implementation.

The official Discourse Mermaid offering is specifically the official
**Discourse Mermaid theme component**, not a plugin. Keep four paths distinct:
use the existing theme component, fork/extend that theme component, build the
separate optional `Discussion Bridge for Discourse` plugin, or pursue an
upstream Discourse change. Never call the official theme component the
“Discussion Bridge Mermaid plugin.” Tier 1 remains API-only and independent.

Commit `d7800d7` passed Code Boss review and 51/51 package tests plus plain Astro
and Starlight production builds. This implementation pass made no OBBBA content
writes and performed no live deployment.

## Alpha And Beta Product Doctrine

### Alpha Feature Lock

The cumulative Alpha feature/function set in the build/launch checklist is now
locked. New work after the lock must close a recorded promise or release gate,
fix behavior exercised by implementation or users, or be approved explicitly as
a scope change. Remaining unchecked work is the proof, operations,
documentation, compatibility, and release work required to finish the locked
promise.

Alpha should be nearly feature-complete for the product promise it declares.
Major capabilities already known to be central belong in Alpha scope or must be
removed from that promise; planned deferral of known product pillars is not the
default Beta strategy. This does not pull every long-term, plugin, or Layer 3
idea into Alpha.

Beta primarily refines what real users exercise: usability, compatibility,
reliability, performance, packaging, documentation, installation, recovery,
support, and presentation. User evidence may still reveal a genuinely missing
capability during Beta, but Beta is not the planned home for central pillars we
already understand.

Tier 1 remains the free/self-serve, API-only floor and must remain useful without
installing a Discourse plugin. A separate optional `Discussion Bridge for
Discourse` plugin is accepted Alpha product work, pending implementation design
and proof. Its bounded v0.1 vertical slice provides
`fullInteractive` Mermaid/table rendering parity inside the Discourse-owned
embed plus the architecture and test baseline for later control-plane work.

That slice does not include the full control plane, post-as-user, PM automation,
or general many-to-many administration. The roadmap must not imply that Tier 1
requires plugin installation.

Alpha scope is cumulative. The plugin and same-page multi-target gates add to,
and do not replace, any previously accepted Alpha gate. The existing dashboard
and build/launch checklists are the source of truth for the complete scope;
items remain active unless Phil explicitly removes them.

All three Alpha software tracks remain free/open source unless a later explicit
decision changes that: `astro-discussion-bridge`, the optional light
`Discussion Bridge for Discourse` plugin, and public docs/community support.
Paid value is implementation help, handholding, managed hosting and operations,
customization, support, and consulting. Operators remain responsible for
third-party infrastructure costs.

### DiscussionBridge.dev Dogfood Loop

Alpha must prove both directions as separate, single-writer connections:

1. An Astro-managed `discussionbridge.dev` blog post publishes a public
   companion discussion to `forum.discussionbridge.dev`.
2. A community wiki/how-to on `forum.discussionbridge.dev` is republished as a
   durable public guide on `discussionbridge.dev`.

The wiki lane is `discourse-managed`, uses `discussionSync: false`, discloses
its source, refreshes deterministically, and has an explicit public route and
Astro navigation lane. Its source forum topic remains the primary discussion.
Edits originate in the wiki topic; the site republishes reviewed source.
Comments presentation is explicit, and independent reply streams are never
described or presented as merged.

The reader-facing outcome is: “The site starts conversations. The community
develops durable knowledge. The site publishes what the community learns.”

Package commit `1731547` closes the explicit import-mode implementation gap.
Code Boss passed the change with 72/72 tests. `import-existing` now selects
`discourse-imported` or `discourse-managed`, defaults to imported, rejects
`astro-managed`, always retains `discussionSync: false`, and supports per-entry
manifest `sourceMode`. A public dry run of forum topic `36` passed for the
planned guide route
`/guides/how-to-choose-a-discussion-bridge-source-mode/`.

The reviewed artifact is
`astro-discussion-bridge-0.1.0-alpha-1731547-7d8951d1.tgz` with SHA256
`7d8951d15f4b0a4a4f14e238665bc41c28255c6f2cdcb1979105926ba6f4affb`.
The apex guide schema now retains import metadata while allowing imported
guides without hand-authored `description`/`pubDate`, and the Astro 7 engine
contract is Node `>=22.12.0`.

Apex commit `d68ffc4` completed the bounded two-direction dogfood proof with
Code Boss PASS, a clean detached install/build producing five actual public
apex routes, push, and live Cloudflare deployment on 2026-07-23. That apex
route count is separate from the Product Boss readable-docs render of 20
synchronized documentation sources and 21 generated HTML pages. The
Astro-managed blog route binds
independent public topic `37`. The Discourse-managed guide discloses and renders
wiki topic `36` as its primary fullInteractive discussion. A deliberate guide
sync dry run skipped for no-writeback, and the raw Pages hostname redirects to
the canonical apex.

The claim is limited to these two separate single-writer connections; it does
not merge reply streams or prove general forum-to-forum orchestration. One high
npm audit finding and the Mermaid >500 kB chunk warning remain recorded; no
automatic audit fix was run.
[Sanitized verification evidence](https://github.com/DiscussionBridge/astro-discussion-bridge/blob/main/docs/evidence/DISCUSSIONBRIDGE_DEV_TWO_WAY_DOGFOOD_2026-07-23.md)
preserves the live facts that are not contained in the apex source commit.

### OBBBA Navigation And Taxonomy Contract

The proposed OBBBA redesign separates bill structure from content lens:

- **Bill Structure** contains the content lenses **OBBBA Text** first,
  **Impact** second, and **Law as Amended** later when suitable.
- Discourse categories identify the content lens.
- Discourse tag groups identify hierarchy:
  Title → Subtitle → Chapter → Subchapter → Part.
- Index topics are the authority for authored order, labels, landing pages, and
  navigation.
- A content topic's tags place it at the deepest applicable hierarchy node.

Index topics do not need redundant Title tags merely to satisfy Discussion
Bridge. The bridge must consume a well-architected forum rather than require
the forum to distort its taxonomy. Public field evidence confirms
`/tag_groups/filter/search.json` exposes the relevant OBBBA tag groups and
members, but group membership order is not treated as canonical. Index topics
remain the ordering authority. Preserve source tags as provenance; do not
automatically expose workflow tags as public navigation.

The UX principle is **complete structure, progressive presentation**. Every
published item remains reachable through navigation, while the ordinary page
view shows the content lenses and Titles globally and expands only the current
lens, current Title, and active Subtitle/Chapter/Subchapter/Part branch. Other
branches remain collapsed but user-expandable, with expansion preserved where
appropriate. Index pages provide the complete outline/browse surface.
Breadcrumbs, authored previous/next links, and search provide additional ways
through the structure.

Do not visibly render—or preferably unnecessarily place in the DOM—hundreds of
Title VII section links on every route. On tablet and mobile, the navigation
drawer should open the active branch and remain keyboard- and screen-reader
usable. Verification must cover desktop, laptop, tablet, and mobile, with
specific scale testing against Title VII.

The reusable product direction is a canonical navigation/taxonomy manifest
generated from Discourse categories, tag groups, and index topics. Starlight
and plain Astro adapters decide how that manifest is presented. Progressive,
complete, and compact are candidate presentation concepts, not locked
configuration names. Proposed OBBBA destinations are
`/obbba-text/title-i/...` and `/impact/title-i/...`; redirects are not required
at this stage.

Package implementation is complete at `e775af3`, with bounded public-field
429 handling corrected at `bc8acb5` and legal case-comparison safety corrected
at `db1c57a`. Code Boss final PASS and 107/107 tests plus `npm run check`
passed. `discover-navigation` builds the strict adapter-neutral
navigation manifest read-only from category, exact tag-group, and index-topic
authority. `DiscussionNavigation` provides progressive presentation, and the
Starlight sidebar adapter plus plain Astro demo consume the result. Authored
links must be same-origin/base-path safe; local routes bind only when the source
topic matches. The create-only manifest supports anonymous or authenticated
discovery and preserves source-tag provenance.

Read-only OBBBA field runs discovered 381 OBBBA Text nodes and 317 Impact nodes,
each with Titles I–X and exact hierarchy tag-group selection, with no writes.
Core Astro built exactly three public routes; the non-routed importer fixture
validated generated scalar provenance. Desktop/mobile browser checks passed
without horizontal overflow and showed navigation plus reciprocal links.

OBBBA initially adopted the navigation artifact at `dd9c100` and refreshed the
case-safe artifact at `5a455f1`. Exact clean install/build passed with 18 public
HTML routes. Read-only discovery produced 18 exact
hierarchy tag groups and 16 local bindings: OBBBA Text category 5/index topic
12 contained 381 nodes and one local route; Impact category 18/index topic 435
contained 317 nodes and 15 local routes. The progressive sidebar places OBBBA
Text before Impact; unimported nodes use forum fallbacks and local nodes use
canonical Astro routes.

Desktop 1440 and mobile 390 checks passed with no overflow or page errors.
Deep Title VII opened progressively while 87 summary nodes remained collapsed;
the mobile menu was usable and locked body scroll while open. This closes the
current full-hierarchy desktop/mobile adoption proof. Broader responsive and
accessibility verification remains open as more content is imported. Law as
Amended remains outside current Astro adoption.

### Official-Source Enrichment And Cross-Lens Relations

The reusable enrichment model distinguishes two source roles on a
Discourse-managed public-record page. Official-text authority belongs to the
authoritative public record:

- **Content source:** the protected Discourse source topic. It may be a wiki,
  but wiki status is optional metadata rather than the ownership or safety
  basis.
- **Official text:** the authoritative public record, identified by document,
  structural locator, citation/page range, and official links.

For OBBBA, the authoritative record is Congress.gov Public Law 119-21. Use the
Congress.gov text page as the durable overview, USLM XML for machine-readable
hierarchy and text, official TXT for page-marker/fallback evidence, and PDF for
authoritative visual verification. Cite Statutes at Large pages rather than
ambiguous PDF file-page numbers.

Proposed metadata includes document/law identity, section ID and label,
official citation and URLs, check time, source hash, and comparison result.
Outcomes are `exact`, `presentation-only`, `substantive-difference`, and
`unresolved`. Missing, duplicate, or ambiguous section matching must fail
closed or require review. Comparison must never silently rewrite community
text.

Presentation-only normalization may remove Markdown link syntax, whitespace
and line-wrap differences, typographic punctuation, official page furniture,
and official side notes, but it must preserve substantive wording and
numbering. The comparator preserves case. Capitalization-only differences are
`substantive-difference` and use the review/explicit-override path because legal
capitalization can identify defined terms or identifiers.

The first bounded field proof compared forum topic 34/post 40, Section 10101,
with USLM identifier `/us/pl/119/21/tI/stA/s10101`. After bounded
normalization, both sources contained 608 tokens and 3,148 normalized
characters with zero substantive differences. The official citation is Public
Law 119-21, Section 10101, 139 Stat. 80–81. This represents that section only;
it does not establish that all OBBBA topics match. A future comparison-only
batch report must count all four outcomes and write no content changes.

Public pages should independently link **Content source** to the community wiki
and **Official text** to the identified law/section and citation. Keep this
provenance/authority layer separate from related-content navigation.

A stable shared key such as `sectionId` should generate reciprocal Related
links across **OBBBA Text**, **Law as Amended**, **Impact**, and future
**Stories**. The aggregate graph is many-to-many: one section can list many
Stories, and one Story can reference many sections.
Regenerating the adapter-neutral relationship/taxonomy manifest plus rebuilding
Astro should update reciprocal links without body reimport or manual per-page
edits. A reader-facing pattern is:
`Related: Read the enacted text · Explore the impact · View 3 community stories`.

The public-accountability chain is official record → structured section →
legal/practical analysis → human consequences → community scrutiny/correction.
The components are Official text, Law as Amended, Impact, Stories, Community,
Provenance, Source comparison, and Navigation. This model generalizes to
Congress, state legislatures, municipal ordinances, regulations, budgets,
ballot measures, and agency rulemaking.

This is strategy discovered through implementation. Commit `e775af3`
implements strict `us-public-law` enrichment, fail-closed manifest-v2
preflight, source-tag provenance, stable `sectionId` many-to-many Stories,
accessible `DiscussionRelations`, and virtual
rebuild-time relationship generation. Official URLs are restricted to HTTPS
Congress.gov hosts, including final redirects; USLM XML is primary, official
TXT is fallback, and PDF is optional visual evidence. Only an explicit
per-entry override permits a substantive comparison result.

No-overwrite imports skip before raw-post or official-source reads. OBBBA topic
34 is now locally imported as `discourse-managed` with `discussionSync: false`,
source author/category/tags preserved, official comparison
`presentation-only`, and citation 139 Stat. 80–81. All 15 Impact pages carry
`contentLens: impact` and stable `sectionId`; reciprocal Section 10101 links
render in both directions.

OBBBA refreshed the corrected comparator at `5a455f1`; its clean 18-route build
passed and exact deployment is Worker
`8dc5a047-feb5-45e1-8c40-b1425cfd63c4`. The official-text and Impact routes
both return 200 with the expected provenance, citation, relation, and topic
markers; live sidebar order is OBBBA Text before Impact. `publishOnBuild` was
false and no Discourse publication/sync occurred.

Post-deploy read-only GETs confirmed both independent Discourse identities:
source topic 34 remains category 5 with first poster `editor`, one post,
`last_posted_at` `2025-07-14T17:03:43.795Z`; Impact topic 434 remains category
18 with first poster `editor`, 12 posts, `last_posted_at`
`2026-07-22T05:14:56.195Z` and `wiki=true`. Topic 34 currently reports
`wiki=false`; do not
describe this specific topic as a wiki. It remains the protected
`discourse-managed` source under the Bridge source-mode contract. These GETs
produced no post or write.

Batch official-source comparison beyond Section 10101, additional OBBBA Text
imports/lenses, Law as Amended, broader scale/accessibility proof, and the
reported dependency vulnerabilities remain open.

Public Discourse 429 handling uses sequential tag-group reads, retries only
429, allows at most three retries, honors bounded `Retry-After` seconds/date or
fallback delay, and cancels rejected bodies with a 50 ms bound. It never
retries 403.

The reviewed package artifact is
`astro-discussion-bridge-0.1.0-alpha-db1c57a-17b3dba9.tgz`, SHA256
`17b3dba90891f8a5222389dd351bfb5904ab8c5a32e53dd86745233dda452eb4`,
with 52 files and 86,864 bytes.

### Verified Documentation Update Metadata

Docs-site commit `02206f7` implements verified page-update metadata. Each
readable page shows **Last updated** and
**Applies to: Discussion Bridge Alpha** directly below its title. The footer
repeats only Last updated and links to the exact canonical source on GitHub.
Desktop 1440 and mobile 390 visual/DOM checks passed.

Last updated means the canonical documentation source changed; it is not a
build or deployment timestamp. The tracked
`docs/DOCS_PAGE_METADATA.json` ledger stores one date and SHA-256 for every
synchronized source. Normal builds do not consult Git history. They fail closed
when a source is missing, membership is stale, or a byte-level hash differs.

After intentionally editing canonical files under `docs/`, run
`npm run refresh-metadata` from `sites/docs`. The explicit refresh preserves
unchanged dates, updates changed pages, initializes new entries, and rebuilds
exact source membership. Prebuild runs metadata tests before synchronization
and the bounded attribution check.

This verifies update metadata and source correspondence. It does not replace
semantic review, attribution/licensing review, or release approval.

### After Alpha

Beta primarily refines exercised usability, compatibility, reliability,
performance, packaging, installation, recovery, support, documentation, and
presentation. The optional plugin v0.1 remains intentionally light and may be
revisited as locked gates close and user feedback arrives. The full control
plane, broad forum-to-forum orchestration, post-as-user, PM automation, and
general many-to-many administration remain excluded later work unless
separately approved. Tier 1 remains fully useful without the plugin.

The current logical/workspace home for that optional plugin is
`DiscussionBridge/plugins/discourse-discussion-bridge`. The `plugins` directory
may move higher later. Physical GitHub repository naming and placement remain a
Boss/folder decision because GitHub organizations do not provide nested
repositories.
