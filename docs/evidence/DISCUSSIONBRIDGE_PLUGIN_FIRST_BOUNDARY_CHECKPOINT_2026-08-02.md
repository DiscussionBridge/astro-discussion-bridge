# DiscussionBridge for Discourse — First-Boundary Checkpoint

Date: 2026-08-02

Status: historical completed first-boundary snapshot. It records the inert
standalone skeleton before controlled creation was implemented. It is not the
current implementation authority and was never installed, enabled, deployed,
released, or bound to a live Discourse forum.

Current implementation authority:
`docs/evidence/DISCUSSIONBRIDGE_PLUGIN_CONTROLLED_CREATION_2026-08-02.md` and
`C:\CodeProjects\CodeWorksLabs\DiscussionBridge\plugins\discourse-discussion-bridge\CONTROLLED_CREATION_MANIFEST.json`.

## Controlling direction

The forum operator owns final actor, category, tags, visibility, connection,
and embed policy. Adapter values are requests. The Alpha creation path is an
authenticated create-or-resolve operation under a configured active
non-`system` service identity before iframe exposure. New topics default to
unlisted. Failure is closed and never silently falls through to Core
reader-triggered `system` creation.

Existing-topic migration is separate. Production comments-only
`fullInteractive` follows controlled topic creation and must omit companion
post 1 from the embed layout without changing the normal topic.

Controlling contract:
`docs/evidence/DISCUSSIONBRIDGE_PLUGIN_V0_1_CONTRACT_2026-08-02.md`

- 6,883 bytes
- SHA-256 `205af8ecb76ea8243e0f5a63b5b62babb79cac10b7cb8239bc61ce87bc7c7607`

## Workspace and license

- Logical path: `DiscussionBridge/plugins/discourse-discussion-bridge`
- Physical local root:
  `C:\CodeProjects\CodeWorksLabs\DiscussionBridge\plugins\discourse-discussion-bridge`
- Intended standalone repository: `DiscussionBridge/discourse-discussion-bridge`
- License: GPL-2.0-or-later
- Theme-component placement: prohibited

## Skeleton identity

The skeleton contains 21 payload files and 29,362 bytes. Its commitment is SHA-256 over
UTF-8 rows sorted by ordinal relative path, each formatted
`path<TAB>bytes<TAB>sha256` and joined with LF, with no trailing LF:

`65974ad33c107460252412e9e90a9c407a53499946596a2f20a019c536641005`

The exact 21-member row set is recorded in `FIRST_BOUNDARY_MANIFEST.json`
(3,867 bytes; SHA-256
`b153be4d88a90d55a51c87abc83f9d4d18bab020c4cc6962e829faa0f13813a1`).
The manifest excludes itself and every unlisted path.

Included surfaces:

- `plugin.rb`, README, GPL license, settings, and server locale;
- canonical-source and policy value/service objects;
- create-or-resolve orchestration interface;
- an explicit unimplemented comments-only presenter;
- connection and audit models;
- two migrations with unique source/topic identity constraints;
- fail-closed JSON endpoint returning `implementation_incomplete` after
  authentication while actual creation remains unimplemented; and
- plugin, canonical-source, policy, orchestration, request, and pending
  comments-only RSpec contracts.

## Safe posture verified structurally

- plugin default disabled;
- endpoint default disabled;
- Core zero-touch compatibility default disabled;
- visibility default unlisted;
- connection secret marked secret;
- no literal credential value found;
- every endpoint response declares `core_fallback: false`;
- actual topic creation is not wired into the controller;
- a bounded SHA-256 source-identity digest and topic ID have database
  uniqueness constraints;
- identity reservation occurs before topic creation, with explicit complete,
  conflict, and failed recovery states;
- actor/category/tag authorization is injected by the forum and fails closed
  when incomplete;
- audit requested/effective state uses strict allowlists rather than copying
  request hashes; and
- comments-only `fullInteractive` is a `NotImplementedError` boundary with
  pending zero-reply, replied-topic, and long-first-post specs.

## Canonical documentation corrected

The following active authorities now agree with the contract:

- `docs/PRODUCT_NOTES.md`
- `docs/HUMAN_MANUAL.md`
- `docs/MACHINE_MANUAL.md`
- `docs/BUILD_LAUNCH_CHECKLISTS.md`
- `docs/COMMENTS_DISPLAY.md`
- `docs/ALPHA_SETUP.md`
- `packages/astro-discussion-bridge/README.md`
- `packages/astro-discussion-bridge/TODO.md`

They no longer describe the first plugin slice as Mermaid/table-only or the
70vh host ceiling as a correction for the long-first-post document.

## Verification completed

- Plugin tree structural assertions: PASS (21-file payload tree; defaults, endpoint
  posture, uniqueness, placeholder, and
  secret-literal scan passed).
- Plugin YAML parsed with the package's installed `yaml` library: PASS 2/2.
- Docs metadata gate: PASS 2/2.
- Canonical/generated docs synchronization: PASS, 26 pages; check-only reports
  no generated changes.
- Attribution/licensing and protected-path docs gate: PASS.
- Readable Starlight docs build: PASS, 27 HTML pages; Pagefind and sitemap
  completed.

## Runtime binding completed

The inert skeleton is now verified against stock local Discourse commit
`6b2f4579ba6802a7c556459e596c3150b67403aa` with Ruby 3.4.10. Ruby syntax,
Discourse boot, both migrations, Discourse RuboCop, and focused RSpec pass.
RSpec reports 17 examples, 0 failures, and the 3 intentionally skipped
comments-only presenter examples.

Exact runtime evidence:
`docs/evidence/DISCUSSIONBRIDGE_PLUGIN_RUNTIME_BINDING_2026-08-02.md`

- 2,604 bytes
- SHA-256 `b81ead09ac9281aef4dcb189725d8805fa2ed89dfd7df031234be0c57e97a958`

## Next bounded implementation slice

Against the recorded exact harness, implement authenticated controlled topic
creation end to end with database-backed idempotency, configured actor
permission checks, policy enforcement, durable audit, and no silent Core
fallback. Rebind and revalidate if the supported Discourse commit changes.
Only after controlled creation passes should comments-only `fullInteractive`
be implemented.

## Explicit exclusions

No live installation, forum mutation, existing-topic migration, arbitrary
impersonation, broad forum-to-forum administration, private-message automation,
comments-only implementation, deployment, release, Gate 2, or portable-Core
adoption occurred or is authorized by this checkpoint.
