# DiscussionBridge Core/Adapter Architecture

Status: Authoritative product architecture  
Decision date: 2026-07-25  
Implementation status: Migration in progress; this document does not claim the
current Astro implementation has already been separated

## Canonical Definition

DiscussionBridge is a Discourse-centered, adapter-driven content and
discussion orchestration system whose portable core connects Discourse with one
or more external publishing systems while preserving authority, provenance,
policy, and auditability.

Discourse is the present operational home and control plane. The human outcome
of preserving a portable core and an architectural path to independence is
autonomy: authorized people can operate, understand, govern, connect, and move
their system without being trapped by a CMS adapter or an accidental
implementation boundary.

The intact decision statement is preserved as source evidence in
[`docs/evidence/DISCUSSION_BRIDGE_DISCOURSE_CENTERED_DOCTRINE_2026-07-25.md`](./evidence/DISCUSSION_BRIDGE_DISCOURSE_CENTERED_DOCTRINE_2026-07-25.md).

## System Boundaries

### DiscussionBridge Core

The portable core owns domain behavior that must remain consistent across every
host and publishing system:

- connections, external-system identities, and capabilities;
- source/target mappings, direction, and single-writer rules;
- content and discussion policies;
- deterministic plans, comparisons, and approval requirements;
- job state, retries, idempotency, recovery, and rollback intent;
- provenance, evidence, and audit records;
- portable adapter contracts and version negotiation.

Core objects must not require a Discourse model, Rails callback, Astro
frontmatter shape, or Statamic collection shape to be understood or tested.
Host- and adapter-specific representations translate to and from portable core
contracts.

### DiscussionBridge for Discourse

The Discourse plugin hosts and operates the core. It is the natural control
plane and primary operating surface for almost all Bridge work:

- authorized users, groups, permissions, and user-created Discourse API keys;
- durable connection and identity records;
- job creation, scheduling, queues, progress, cancellation, and recovery;
- review and approval surfaces;
- operational inventory, health, diagnostics, notices, and audit access;
- Discourse categories, tags, topics, posts, webhooks, APIs, and plugin UI;
- concurrent connections to multiple external publishing systems.

Discourse supplies the operational machinery; it does not redefine portable
domain rules. Host integration belongs behind explicit core interfaces so the
same core can be hosted elsewhere later without being reinvented.

### Publishing-System Adapters

Astro, Statamic, and future adapters are well-featured integrations, not
control planes. Each adapter owns the translation between the portable contract
and its publishing system:

- content discovery and content-format translation;
- local identifiers, paths, routes, collections, and metadata projection;
- rendering and discussion presentation;
- navigation, build, cache, and deployment hooks;
- adapter-specific diagnostics and capability reporting;
- authenticated endpoints or agents needed for safe host-to-adapter work.

One Discourse plugin may coordinate multiple adapters and multiple instances of
the same adapter simultaneously.

### Tier 1 API-Only Compatibility

API-only operation remains supported as a useful compatibility and self-serve
capability. It exercises the same portable contracts and policies wherever
practical. It must not become a second orchestration authority or force every
adapter to reproduce the control plane.

## Authority And Identity

Every Bridge operation involving Discourse is authorized by a user-created
Discourse API key. Durable Bridge identities are operating records around those
keys; they are not alternate authority.

The plugin must make scope, actor, connection, requested action, approval,
execution result, and audit evidence visible. Key rotation and revocation are
normal lifecycle controls when appropriate, not per-run rituals. Exceptional
exposure remediation must not become routine product doctrine.

External adapters may have their own platform credentials. Those credentials
authorize the adapter side only and must be scoped, stored, referenced, and
audited through the connection contract.

## Required Portable Contracts

The first stable contract set comprises:

1. `Connection` — Discourse endpoint, adapter endpoint, capabilities,
   identities, credential references, and lifecycle state.
2. `ResourceIdentity` — stable identities and mappings for topics, posts,
   pages, sections, assets, and related content.
3. `DirectionPolicy` — source authority, permitted reads/writes, single-writer
   boundary, and no-writeback rules.
4. `ChangeSet` — normalized proposed operations with source hashes,
   provenance, and deterministic ordering.
5. `Comparison` — presentation and substantive differences without silently
   normalizing meaningful content.
6. `Approval` — actor, scope, frozen input hashes, decision, and expiry.
7. `Job` — plan, preflight, execution, progress, retry, cancellation, and
   terminal state.
8. `Evidence` — zero-write claims, requests, results, hashes, warnings,
   failures, and audit references.
9. `AdapterCapabilities` — supported operations, limits, versions, and
   compatibility requirements.

Contracts must be serializable, versioned, deterministic where required, and
testable with fake credentials and fixtures.

## Non-Negotiable Invariants

- A connection declares source authority and permitted direction.
- Protected sources are never written back without an explicit policy change
  and reviewed approval.
- Planning and comparison remain distinguishable from execution.
- Zero-write operations make no target writes and report that fact.
- Every write is attributable to an authorized identity and frozen input.
- Retries are bounded and idempotent; ambiguous outcomes enter recovery.
- Redirects and authority drift fail closed for credentialed operations.
- Secrets do not enter arguments, reports, logs, exceptions, or audit payloads.
- Adapters do not acquire independent policy or orchestration authority.
- Current working Astro/API-only workflows remain operable during migration.

## Ownership And Collaboration

- **Bridge Boss** owns DiscussionBridge behavior, core/adapter implementation,
  integration choices, acceptance evidence, and coordinated gates.
- **Discourse Boss** is the close platform partner for plugin architecture,
  Discourse conventions and internals, compatibility, installation, operations,
  and upstream boundaries.
- **Product Boss** owns product interpretation and product-document support.
- **Code Boss** reviews correctness, security, maintainability, tests, and
  migration risk.
- **Manual Boss** owns documentation and manual quality.
- **Boss** owns cross-project routing, continuity, priority, and unresolved
  ownership decisions.

General Discourse core/plugin work remains with Discourse Boss unless it is
specifically DiscussionBridge product behavior. Bridge-specific plugin work is
led by Bridge Boss with close Discourse Boss support.

## Portability Rule

Discourse is a deliberate host, not an accidental prison. Use its mature
facilities fully, but keep portable domain behavior behind host-neutral
interfaces whenever practical. A future standalone host should replace the
host layer—not require a rewrite of connection, policy, planning, comparison,
approval, or audit semantics.

## One Product Family

Everything remains under the DiscussionBridge tent:

- DiscussionBridge for Discourse is the free, fully featured plugin and local
  host.
- DiscussionBridge for Astro is the free, fully featured Astro adapter.
- DiscussionBridge SaaS is the paid, managed standalone host for multi-CMS,
  multi-site, and multi-community orchestration.
- DiscussionBridge Services provides paid implementation, migration,
  customization, training, operations, and extensive support.
- DiscussionBridge Community provides public documentation and community
  support, with team participation as capacity permits.

These are deployment and service models over one product architecture, not
separate products with diverging cores. The free products must remain genuinely
capable. SaaS value comes from managed operation, scale, governance,
convenience, and operational relief rather than artificial limitations.

The intact product-family decision is preserved in
[`docs/evidence/DISCUSSION_BRIDGE_PRODUCT_FAMILY_DOCTRINE_2026-07-25.md`](./evidence/DISCUSSION_BRIDGE_PRODUCT_FAMILY_DOCTRINE_2026-07-25.md).
