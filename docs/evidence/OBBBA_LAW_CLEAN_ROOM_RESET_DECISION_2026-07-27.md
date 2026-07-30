# OBBBA Law Clean-Room Reset Decision

Created: 2026-07-27  
Status: controlling clean-room direction; cross-lane review requested

## Decision

The inherited OBBBA Law as Amended pipeline is abandoned as an implementation
base.

It is retained only as inert lessons-learned provenance. No legacy source,
test, derived evidence artifact, cardinality, schema, fixture, or design
assumption crosses into the replacement merely because it already exists.

The historical product boundary is Bridge Boss 2 turn
`019f9fe7-0ec3-70a0-9b16-0c073b90e8f4`. The sound product origin is retained:
Astro presents Law as Amended from authoritative external official sources,
while DiscussionBridge and Discourse provide optional verbatim titles,
organization, legislative drafting, and discussion.

All implementation work after that product-origin turn is abandoned. Product
ideas, information architecture, user-experience concepts, and branding may be
restated from first principles. No post-origin code, parser, test, fixture,
cache, generated data, derivative evidence, schema, or implementation
assumption is eligible for reuse.

The replacement starts from an empty implementation boundary.

This reset applies to the OBBBA Law data pipeline. It does not discard
DiscussionBridge, the Astro adapter, Discourse integration, or unrelated
portable product infrastructure.

## Reason

The old pipeline used the 309-item forum metadata inventory to construct an
official authority map. Downstream acquisition used official sources, but its
selection boundary and derived cardinalities had already been dictated by the
forum inventory.

Repairing downstream files individually cannot prove that implicit scope,
fixtures, tests, or schemas are clean. A clean-room boundary is more finite,
auditable, and economical.

## Settled Invariants

- Law as Amended authority comes from authoritative external official sources.
- Forum/Discourse supplies an optional verbatim title plus optional tag,
  category, index, topic, and discussion-binding context only.
- Forum bodies, OBBBA Text, local derivatives, and diagnostics are never
  enacted-law authority.
- The forum inventory count of 309 is not official enacted-law cardinality.
- Section 20009 is enacted, present, and mandatory. Its omission is an artifact
  or parser failure.
- Phil/Boss has settled that Section 70310 does not exist. Stop looking for it
  and do not retain it as provisional pending GovInfo verification. This is not
  an inference from forum, derivative, index, or local absence. A neutral
  exhaustive official-source inventory must not be distorted to preserve the
  conclusion; if it independently produces contradictory controlling evidence,
  stop as `BLOCKED - DOCTRINE/EVIDENCE CONFLICT`.
- Section 71119 is official-source-first. Forum identity cannot establish its
  enacted binding.
- Contradiction stops work as `BLOCKED - DOCTRINE/EVIDENCE CONFLICT`.

## Replacement Flow

```text
authoritative official source discovery
  -> preserved raw source identity, retrieval evidence, bytes, and hashes
  -> neutral parsing
  -> official-source-derived scope and legal-state analysis
  -> reviewed internal evidence
  -> Astro presentation
  -> optional forum metadata and discussion binding
```

Forum metadata is joined after official-source scope is established. It cannot
determine which enacted items exist or how many there are.

## Product Placement

The replacement is OBBBA-specific site/adapter evidence. Its empty root is:

```text
sites/obbba-law-as-amended-clean-room
```

It is not DiscussionBridge Core and is not part of the reusable Astro adapter
package contract. Promotion into Core or `packages/astro-discussion-bridge`
requires a separate Product and architecture decision.

## Reuse Rule

The default disposition of every legacy asset is:

```text
ABANDONED AS IMPLEMENTATION — LESSONS LEARNED ONLY
```

No post-origin implementation asset crosses the clean-room boundary. A useful
idea must be expressed independently as a new requirement or design decision
and implemented anew. Official source material must be freshly acquired with
new retrieval evidence rather than admitted from the abandoned caches.

## Legacy Treatment

- Contaminated executable code, tests, fixtures, and derived artifacts will be
  moved into inert provenance after disposition review.
- Inert provenance must not be importable, executable, registered, or accepted
  as clean-room input.
- Existing official-source-looking artifacts retain only candidate status until
  their origin, retrieval, hash, and selection scope are independently proven.
- The failed boundary checker is legacy work and must not be executed.

## First Build Order

1. Accept the clean-room disposition and physically isolate legacy work.
2. Implement a small dependency boundary that rejects every legacy path.
3. Define official-source acquisition records without forum cardinality.
4. Acquire a fresh authoritative source inventory.
5. Encode the settled 20009, 70310, and 71119 invariants.
6. Add neutral parsing and versioned evidence in small reviewed increments.
7. Join optional forum discussion metadata only after official scope exists.

This decision does not authorize publication or Gate 2.
