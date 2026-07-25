# Discussion Bridge Core/Adapter Implementation Roadmap

Status: Authoritative migration roadmap; phase gates require normal review  
Architecture: [`CORE_ADAPTER_ARCHITECTURE.md`](./CORE_ADAPTER_ARCHITECTURE.md)  
Source decision: [`DISCUSSION_BRIDGE_DISCOURSE_CENTERED_DOCTRINE_2026-07-25.md`](./evidence/DISCUSSION_BRIDGE_DISCOURSE_CENTERED_DOCTRINE_2026-07-25.md)

## Migration Strategy

This is an incremental extraction, not a rewrite and not a big-bang cutover.
The current Astro package is working prototype and domain evidence. Existing
accepted workflows remain available while behavior is classified, contracted,
and moved behind compatible interfaces.

Every migration change must answer:

1. Is this portable core behavior, Discourse-host behavior, or adapter behavior?
2. What current evidence proves its expected behavior?
3. What compatibility surface must remain during the transition?
4. What review and acceptance evidence closes the change?

## Phase 0 — Preserve And Classify Current Evidence

Outcome: a trustworthy inventory before code moves.

- Freeze the settled doctrine and architecture links.
- Complete a module/dependency inventory of current Astro implementation.
- Classify comparison, Impact population, navigation, relationships, source
  modes, retries, credential handling, and publishing behavior.
- Identify mixed modules that need seams rather than wholesale movement.
- Preserve the current OBBBA comparison and Impact planning work as acceptance
  fixtures for the portable core.
- Record current API-only behavior that must remain compatible.

Gate: Product Boss confirms behavior classification; Code Boss confirms the
inventory identifies dependency and migration risks; Manual Boss confirms the
terms are used consistently.

## Phase 1 — Define The Portable Contract Package

Outcome: host-neutral types and behavior can be tested without Astro or
Discourse runtime objects.

- Define versioned contracts for connections, identities, mappings, direction,
  changesets, comparisons, approvals, jobs, evidence, and capabilities.
- Define deterministic serialization, hashes, validation, and error taxonomy.
- Define host, adapter, credential-reference, queue, persistence, and audit
  interfaces.
- Establish compatibility/version negotiation between host and adapters.
- Port the safest pure logic first: normalization boundaries, comparison
  classification, source policies, deterministic planning, and evidence rules.

Gate: contract fixtures pass independently; no Astro or Discourse model is
required for core tests; Code Boss approves dependency direction.

## Phase 2 — Establish The Discourse Plugin Host

Outcome: Discourse can host the core and operate a no-write vertical slice.

- Coordinate repository placement and plugin skeleton with Discourse Boss.
- Implement plugin settings, migrations, permissions, connection inventory,
  identity records, credential references, and audit storage.
- Implement job lifecycle, queue integration, progress, bounded retry,
  cancellation, and recovery states.
- Build an operator UI for connection health, plan requests, progress,
  comparison results, approvals, and evidence.
- Run the first vertical slice as GET-only and zero-write using the established
  OBBBA comparison/preflight behavior.

Gate: Discourse Boss approves platform fit and compatibility; Code Boss
approves security and job semantics; the zero-write evidence matches the
current accepted behavior.

## Phase 3 — Refactor Astro Into The Reference Adapter

Outcome: Astro remains fully featured while no longer carrying the control
plane.

- Put Astro discovery, frontmatter, collections, routes, navigation,
  components, build hooks, and deployment behavior behind adapter contracts.
- Retain a local/API-only compatibility runner over the same contracts.
- Add capability discovery and adapter health reporting.
- Prove plan/comparison parity between the compatibility runner and
  Discourse-hosted execution.
- Move orchestration policy out of Astro-specific entry points only after
  parity evidence exists.

Gate: existing Astro tests and live acceptance cases pass; no loss of Tier 1
capability; rollback to the prior compatibility surface is documented.

## Phase 4 — Add Reviewed Write Execution

Outcome: authorized operators can safely approve and run routine Bridge jobs
from Discourse.

- Add frozen-plan approvals tied to actor, connection, scope, and hashes.
- Implement adapter write operations with idempotency and ambiguous-outcome
  recovery.
- Preserve source authority and no-writeback rules.
- Add per-operation audit evidence and human-readable summaries.
- Exercise one bounded create/update workflow before enabling batch writes.

Gate: explicit Product, Code, Manual, and Bridge acceptance; recovery and
rollback drills pass; no write is possible from an unapproved or stale plan.

## Phase 5 — Build The Statamic Adapter

Outcome: one Discourse installation controls real connections to both Astro and
Statamic, proving that the architecture is not Astro-shaped.

- Implement Statamic content discovery, mappings, metadata projection,
  rendering hooks, writes, and deployment/cache integration.
- Reuse the portable contracts without Statamic conditionals in the core.
- Demonstrate concurrent Astro and Statamic connections with separate
  direction policies, identities, jobs, and evidence.

Gate: shared conformance suite passes for both adapters; Discourse remains the
single operational control plane.

## Phase 6 — Harden The Adapter Ecosystem

Outcome: additional adapters can be developed without inventing another Bridge.

- Publish an adapter SDK, conformance suite, compatibility policy, and sample
  adapter.
- Define supported deployment topologies and remote-agent trust boundaries.
- Add migrations and version-compatibility procedures.
- Measure job throughput, queue behavior, evidence retention, and recovery.
- Document the criteria for considering a standalone host in the future.

Gate: a new adapter can implement the contract without importing Astro or
Discourse host internals.

## Phase 7 — Discussion Bridge SaaS

Outcome: the same portable core operates as a paid, managed standalone control
plane for multiple CMSs, sites, adapters, and Discourse communities.

- Replace the Discourse host layer with a managed SaaS host while retaining the
  same portable contracts and domain semantics.
- Provide centralized connection inventory, scheduling, monitoring, alerts,
  approvals, audit retention, recovery, and adapter fleet management.
- Support organization and team governance across multiple publishing systems
  and Discourse installations.
- Preserve exportable identities, mappings, evidence, and configuration so
  managed convenience does not undermine customer autonomy.
- Keep the free Discourse plugin and Astro adapter genuinely capable; do not
  create SaaS demand by withholding normal local functionality.

Gate: SaaS proves real multi-system operational value and a documented
migration/export path without forking the Discussion Bridge Core or trust
model.

## Immediate Work Sequence

1. Complete the present read-only OBBBA Impact population evidence gate.
2. Do not add another large orchestration workflow directly to Astro.
3. Finish the current module/dependency classification.
4. Convene Bridge Boss and Discourse Boss on plugin repository placement,
   supported Discourse versions, and the first no-write vertical slice.
5. Submit the portable contract proposal to Product Boss and Code Boss.
6. Ask Manual Boss to align manuals after contracts and names are reviewed.

## Explicitly Deferred

- Replacing user-created Discourse API keys as Bridge authority.
- Per-run key creation and revocation as normal operation.
- A second policy/control plane inside Astro, Statamic, or another adapter.
- A standalone host before the Discourse-hosted core proves its boundaries.
- Detailed Discussion Bridge SaaS packaging, pricing, tenancy, and service
  levels until the portable core and adapter contracts are proven.
- General Discourse core changes without Discourse Boss/upstream routing.
