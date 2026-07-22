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

This is a WebSynergetics-style process: start with useful work, let the work expose the system, then capture the reusable pattern where it belongs.

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

Live-gate status verified 2026-07-22: `forum.citizenactivist.network` does not
resolve (`curl` error 6), and no Citizen Activist forum credential lane was found
in the protected by-site vault locations checked. The forum, DNS, TLS, ownership,
and non-secret operational coordinates are an explicit Boss/Ops prerequisite,
routed to task `019f42a5-bd80-77a2-98bc-af5b57db0d8a`. This is not a Bridge code
failure. Do not mark the topology gate complete until provisioning and live proof
both succeed.

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
`./source`. Canonical Astro and Starlight boundaries are wired. OBBBA remains a
separate installation/live-proof gate because its current vendor artifact does
not include `a9d2097`.

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

Commit `d7800d7` passed Code Boss review and 51/51 package tests plus plain Astro
and Starlight production builds. This implementation pass made no OBBBA content
writes and performed no live deployment.

## Alpha And Beta Product Doctrine

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

The current logical/workspace home for that optional plugin is
`DiscussionBridge/plugins/discourse-discussion-bridge`. The `plugins` directory
may move higher later. Physical GitHub repository naming and placement remain a
Boss/folder decision because GitHub organizations do not provide nested
repositories.
