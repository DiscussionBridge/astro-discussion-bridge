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

One or two clearly labeled demo/credit pages on `onebigbeautifulbill.us` may use
companion topics on `forum.discussionbridge.dev` through explicit per-page target
selection. Production OBBBA content remains on `forum.repealobbba.org`.

This is a bounded topology proof and one step toward future many-to-many support;
it is not a claim that general many-to-many operation is currently supported.

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
