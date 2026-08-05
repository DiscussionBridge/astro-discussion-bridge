# DiscussionBridge for Discourse — v0.1 Alpha Contract

Date: 2026-08-02

Status: durable controlling v0.1 Alpha contract. Its first implementation
boundary was the historical inert skeleton; current implementation status is
recorded in
`docs/evidence/DISCUSSIONBRIDGE_PLUGIN_CONTROLLED_CREATION_2026-08-02.md` and
`C:\CodeProjects\CodeWorksLabs\DiscussionBridge\plugins\discourse-discussion-bridge\CONTROLLED_CREATION_MANIFEST.json`.
The plugin is not installed, enabled, deployed, or authorized to mutate a forum
by this record.

## Product and repository identity

- Product: `DiscussionBridge for Discourse`.
- Development root:
  `C:\CodeProjects\CodeWorksLabs\DiscussionBridge\plugins\discourse-discussion-bridge`.
- Intended license: GNU General Public License v2.0 or later, matching the
  normal Discourse plugin ecosystem boundary.
- Supported baseline: current supported Discourse at implementation/test time;
  an exact Discourse commit must be recorded before installation or release.

## Environment progression

Plugin work progresses through four intentionally distinct environments:

1. the local WSL Discourse instance for rapid development and destructive tests;
2. `sandbox-forum.discussionbridge.dev`, a disposable live integration sandbox
   using synthetic fixtures;
3. `dev-forum.discussionbridge.dev`, the stable preproduction acceptance forum;
4. `forum.discussionbridge.dev`, the production forum.

The three hosted forums require separate databases, credentials, deployment
identities, and rollback boundaries. The sandbox may be reset; dev retains
stable acceptance fixtures and should mirror reviewed production behavior.
Local or sandbox success does not imply dev or production acceptance.

## Core and plugin ownership

Discourse Core remains authoritative for authentication, users, topics, posts,
permissions, categories, tags, moderation, composer actions, replies, likes,
quotes, edits, notifications, and normal topic presentation. The plugin adds a
forum-governed DiscussionBridge control plane. It does not replace Core and it
does not alter ordinary topics or embeds unless an authorized DiscussionBridge
policy applies.

`simple` and `full` remain plugin-free production modes. Core-only
`fullInteractive` remains a compatibility/development preview. Production
Alpha `fullInteractive` requires the plugin capability defined below.

## Request authority and effective policy

An Astro, Statamic, or future adapter may request:

- connection identity and adapter identity;
- normalized absolute source URL and optional source identifier;
- title and source metadata;
- proposed category and tags;
- lane;
- requested listed/unlisted state; and
- a correlation/idempotency identifier.

Those values are requests, not forum authority. The Discourse operator
configures policy. The plugin validates and enforces the effective actor,
category, tags, visibility, source mapping, and embed capability. Responses and
audit records must preserve requested and effective state separately.

## Authentication and trust boundary

The create-or-resolve endpoint is disabled unless the plugin and a named
connection are enabled. Requests require a plugin-defined credential associated
with that connection and an allowed absolute HTTP(S) origin/source policy.
Credentials are stored using Discourse secret-setting facilities or another
reviewed secret store and compared without being logged. Browser sessions,
visitor identity, an Origin header by itself, and possession of a source URL
are insufficient authority.

Missing authentication, disabled connections, unauthorized origins, invalid
actors, denied categories/tags, policy failures, collisions, and persistence
failures fail closed. Failure never falls through to reader-triggered Core
topic creation. Core zero-touch creation is a separately selected compatibility
mode with an explicit response path.

## Topic creation and operating identity

The preferred Alpha workflow creates or resolves the companion topic before an
iframe is exposed. The forum operator configures a non-`system` Discourse user
as the service identity. The plugin verifies that the user exists, is active,
is not `system`, and can perform the effective operation in the effective
category with the effective tags.

New topics default to unlisted. A forum operator may list them manually.
Trusted auto-listing may be authorized later by explicit connection, origin,
lane, category, or tag policy. A request to list is never sufficient authority.
The first reply must not bypass a manual-review policy.

Arbitrary impersonation is outside v0.1.

## Canonical identity, idempotency, and collision handling

The canonical source identity comprises the configured connection identity and
the normalized absolute source URL. Equivalent retries return the durable
existing mapping and topic ID. A database uniqueness constraint protects the
identity during concurrent requests.

If a source, topic, or mapping conflicts with the requested identity, the
plugin returns `reconciliation_required`; it never silently selects,
overwrites, retags, relists, or reassigns a topic. The durable source-to-topic
mapping must commit before success is returned or an embed is exposed.

Outcomes are `created`, `resolved`, `rejected`, or
`reconciliation_required`.

## Audit contract

Each decision records:

- timestamp and correlation identifier;
- connection, adapter, and canonical source identity;
- requested actor/category/tags/listing/policy;
- configured and effective actor/category/tags/listing/policy;
- outcome and reason; and
- topic ID when applicable.

API keys, tokens, session secrets, raw authorization values, cookies, and
complete sensitive request headers must never be persisted or logged.

## Existing topics and migration

A preexisting topic may be resolved only through an explicit validated mapping;
otherwise the result is `reconciliation_required`. Changing authorship,
listing, category, tags, or mappings for existing topics is a separate,
reversible migration boundary. Existing topic 38 is evidence of prior
reader-triggered `system` authorship, not authority to mutate it.

## Comments-only `fullInteractive`

The local plugin implements the forum-authorized comments-only full-app
presentation behind a default-disabled operator setting. For a completed
DiscussionBridge mapping, it appends a scoped class through Discourse Core's
full-app redirect. In that embed only, companion post 1 contributes zero layout
height. The normal topic retains post 1 unchanged. The plugin must preserve native zero-reply state, existing
replies, login, composer, reply/like/quote/edit/moderation actions,
notifications, and natural sizing with a forum-approved maximum.

This cannot be implemented as another host height cap, a hidden-but-space-
retaining first post, an unscoped theme rule, or a rewrite/deletion of post 1.

Unit and request verification passes locally. Browser verification also passes
the zero-reply, replied/actions, and ordinary long-topic cases. Production or
live-install acceptance remains open. The local development-server runtime
passes the same cases plus operator-disable rollback after full client boot.

## Administrator health surface

The Alpha plugin exposes a read-only native Discourse administrator page and
JSON contract. It reports default-disabled feature state, whether the
connection credential and trusted origins are configured, the configured
operating identity, effective category/tag authority, mapping-state counts,
audit outcome/reason counts, and explicit controlled-creation readiness
blockers. The response must never serialize the connection credential.
Non-administrators cannot read the endpoint. This surface diagnoses the forum
control plane; it does not edit settings, create topics, reconcile mappings, or
change forum state.

## Native operator settings

Discourse's native plugin Settings tab is the only editable Alpha operator
surface. The connection secret uses the platform's secret setting semantics and
must never be returned by Health or ordinary client payloads. Save-time
validation rejects origins with paths, credentials, queries, fragments, or
wildcards; unavailable/system operating identities; nonexistent categories;
and nonexistent tags. Blank identity/origin/tag values and category `0` remain
valid while setup is incomplete; the Health contract reports the resulting
cross-setting readiness blockers. Visible product labels use `DiscussionBridge`.
Stable route, setting, CSS, database, and plugin identifiers are not renamed.

## Mapping and audit inspection

Administrators may inspect a searchable, paginated, read-only projection of
the forum-owned mapping and audit records. The projection may expose canonical
source URL/digest identity, mapping state, topic identity, effective operating
identity, lane, visibility, audit outcome/reason, correlation/adapter identity,
and timestamps. It must not expose connection credentials or the raw
requested/effective payloads. The Alpha inspector contains no reconciliation,
deletion, authorship migration, visibility change, topic mutation, or retry
action.

## Forum-owned lane policy

The operator may configure an optional JSON array of explicit lane policies.
Each unique lowercase lane selects an existing Discourse category, zero or more
existing tags, and the Alpha `unlisted` visibility. When the array is empty,
the existing global category/tag policy remains active. Once any lane policy is
configured, every controlled-creation request must name a configured lane;
missing and unknown lanes fail closed and are audited. Adapter-proposed
categories, tags, and listing state remain requests and cannot override the
forum-owned result.

## Read-only reconciliation queue

Administrators may inspect deterministic reconciliation issues without changing
forum state. The queue detects missing or deleted topics, failed mappings,
reservations unchanged for at least 15 minutes, missing or unknown configured
lanes, effective category/tag/actor/visibility drift, legacy `system`
authorship, and duplicate source/topic claims if database uniqueness invariants
have been compromised. Each issue has a severity, stable reason code, safe
mapping/source/topic evidence, and a recommended operator action. The Alpha
diagnostic evaluation performs no repair, retry, deletion, visibility,
category/tag, mapping, or authorship mutation. The only queue action currently
available is the separately constrained retry authorization below.

## One-time retry authorization

The first reconciliation action is limited to failed mappings and reservations
unchanged for at least 15 minutes. An administrator may authorize one fresh
adapter retry; this does not itself create or delete a topic. The authorization
is durably attributed and audited, may be revoked before consumption, and is
consumed atomically by the next authenticated request for the same canonical
source. Consumption replaces the reservation token so a superseded in-flight
operation cannot commit. The fresh request must still pass current actor, lane,
category, tag, visibility, origin, and connection policy. Failure returns the
mapping to failed state and requires another explicit authorization.

## First implementation boundary

This boundary includes:

- a valid, default-disabled Discourse plugin skeleton;
- namespaced settings and fail-closed policy interfaces;
- create-or-resolve endpoint interface;
- durable mapping and audit migrations/models;
- service and serializer interfaces that distinguish requested/effective state;
- structural tests for disabled posture, authorization denial, default
  unlisted policy, configured non-system actor, idempotency, collision outcome,
  requested/effective state, secret exclusion, and no silent Core fallback;
- the implemented, default-disabled comments-only `fullInteractive` contract;
- an administrator-only read-only health/status contract; and
- install/disable/remove/rollback documentation.

The skeleton must not expose an enabled public endpoint, create topics, run
background jobs, or mutate existing forum state merely by being installed.

## Explicit exclusions

No live install, forum mutation, existing-topic migration, arbitrary
impersonation, broad forum administration, private-message automation,
production deployment, release claim, Gate 2, or portable-Core adoption is
authorized by this contract.
