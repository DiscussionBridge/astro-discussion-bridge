# DiscussionBridge Plugin Controlled-Creation Evidence

Date: 2026-08-02

Status: PASS locally; not installed, enabled, deployed, released, or connected
to a live forum.

## Implemented boundary

The standalone `DiscussionBridge for Discourse` plugin now implements the
authenticated create-or-resolve path end to end:

- the endpoint and plugin remain default-disabled;
- connection ID and shared secret are checked before request persistence;
- canonical source identity uses a bounded connection ID plus an absolute,
  bounded HTTP(S) URL with no credentials, query, or fragment;
- the forum-configured service actor, category, and existing tags are final
  authority; adapter-provided values remain requests only;
- the repository reserves a digest identity transactionally and resolves
  duplicate/retried requests without duplicate topics;
- mapping completion and the required created audit commit atomically;
- post-commit job failures are logged separately and cannot falsify the
  committed created result or audit;
- the controlled first post identifies the canonical source page;
- new topics are forced unlisted regardless of a request for listed visibility;
- mapping state records the effective actor and topic;
- audit records contain the bounded decision/result fields, never the endpoint
  secret or request headers; and
- rejection is fail-closed with `core_fallback: false`.

The external adapter endpoint follows Discourse's webhook controller posture:
XHR, cookie-CSRF, and login redirects are skipped only for this controller;
constant-time connection ID/secret authentication remains mandatory before
persistence, and the custom secret header is registered for parameter/env
filtering.

Comments-only `fullInteractive`, admin UI, listing review workflow, existing
topic migration, arbitrary impersonation, and live installation remain outside
this boundary.

## Exact local harness

- Discourse: `/home/phil/discourse`
- Discourse commit: `6b2f4579ba6802a7c556459e596c3150b67403aa`
- Ruby: 3.4.10
- plugin development root:
  `C:\CodeProjects\CodeWorksLabs\DiscussionBridge\plugins\discourse-discussion-bridge`

The plugin is symlinked only into the local development checkout for test
loading. No live Discourse installation or forum mutation occurred.

## Verification

- clean replay of both plugin migrations in `discourse_test`: PASS;
- clean replay of both plugin migrations in `discourse_test_multisite`: PASS;
- migration indexes use the bounded source digest, topic ID, and reservation
  token; the redundant unbounded canonical-URL index is absent;
- Discourse Core RuboCop: 25 files inspected, 0 offenses;
- full plugin RSpec: 34 examples, 0 failures, 3 intentionally skipped/pending
  comments-only presentation examples;
- authenticated request proof: create returns the controlled mapping; an
  identical retry resolves it; exactly one topic and one mapping remain;
- forced-unlisted, configured service actor, controlled body, category denial,
  bad-secret no-persistence, production forgery-protection request handling,
  missing-field rejection, reservation collision, atomic audit rollback,
  truthful post-commit failure handling, and audit allowlist behavior are
  covered.

Randomized full-suite seed: `41171`.

## Exact reviewed payload

The verification above is bound to:

`C:\CodeProjects\CodeWorksLabs\DiscussionBridge\plugins\discourse-discussion-bridge\CONTROLLED_CREATION_MANIFEST.json`

- manifest: 5,193 bytes;
- manifest SHA-256:
  `d32fa41d8259a03186abb495d66768c38f0ea5be5644e86ad4deea7b7f037c42`;
- payload: 29 files / 53,151 bytes; and
- ordinal row commitment:
  `7574684f38f5ffb4f5254c8630142c77ebee6058f44230a7894f40aa9c3b6f16`.

The manifest excludes itself, the historical first-boundary manifest, and
unlisted paths. Installation, publication, and deployment remain denied.

## Next practical boundary

Implement the comments-only `fullInteractive` presentation inside Discourse so
the normal topic remains unchanged while the embedded layout omits companion
post 1 and preserves native empty state, replies, login, composer, actions,
moderation, notifications, Mermaid, and tables. Live installation remains a
separate reviewed boundary after that implementation passes locally.
