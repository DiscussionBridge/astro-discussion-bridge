# DiscussionBridge Plugin Local Sandbox Installation Acceptance

Date: 2026-08-02

Status: PASS for the dedicated local WSL plugin-test sandbox. This is not a
live-sandbox or production installation approval.

## Exact sandbox

- Discourse root: `/home/phil/discourse-plugin-test`.
- Discourse commit: `6b2f4579ba6802a7c556459e596c3150b67403aa`.
- Ruby: 3.4.10.
- Plugin source is linked from the standalone Windows workspace.
- Databases: `discourse_plugin_test_development` and
  `discourse_plugin_test_test`.
- Both databases contain 2,373 migrations, including the two DiscussionBridge
  plugin migrations.

## Acceptance

- All dependencies installed from the pinned lockfiles.
- Master plugin, controlled-creation endpoint, and comments-only presentation
  option default to disabled.
- Non-browser plugin RSpec: 38/38.
- Browser RSpec: 4/4, including reserved-marker injection rejection.
- Dedicated frontend compiler completed its initial build.
- Dedicated Rails runtime returned HTTP 200 at `http://127.0.0.1:3100/`.
- Signed-in manual acceptance used three disposable local topics: an initially
  empty mapped comments-only topic, a mapped replied comments-only topic, and
  an ordinary long topic. The comments-only surfaces omitted the companion
  first post and forum header while retaining native reply behavior; the
  ordinary topic retained its normal Discourse presentation.
- A signed-in reply persisted through each surface. Read-only topic JSON after
  the exercise reported topic 8 with posts 1-2, topic 9 with posts 1-3, and
  topic 10 with posts 1-2. This verifies native writes without granting the
  plugin endpoint or any remote forum write authority.
- Natural sizing acceptance passed through disposable host pages using Core's
  content-aware resize messages. Empty and short replied comments-only frames
  grew only enough to contain the native controls and visible discussion.
  Expanding the omitted companion source from approximately 12 KB to 28 KB
  changed the measured Discourse `#main` height by no more than two pixels.
  The focused regression and complete comments-only browser suite passed 4/4.
  The host fixtures were removed after manual acceptance.
- Forum-controlled creation acceptance used a dedicated local service identity
  with an explicitly granted moderator role, the forum-selected Local Sandbox
  category, a trusted local origin, and enforced unlisted visibility. The same
  source request returned `created` and then `resolved` with one topic ID. Topic
  11 and its first post are authored by `bridge_service`, not `system`; the
  durable mapping is complete and records actor ID 2.
- A trust-level service identity without unlisted-topic authority initially
  exposed a preflight gap. Forum authority now rejects that configuration as
  `unlisted_denied` before reservation or creation. Endpoint request tests pass
  7/7, the complete plugin suite passes 43/43, and scoped RuboCop is clean.
- After acceptance the controlled-creation endpoint was disabled and its local
  credential cleared. A read-only HTTP check returned `503 endpoint_disabled`
  with `core_fallback: false`.
- Physical rollback rehearsal moved only the plugin symlink. With the link
  absent the plugin did not load; after restoration it loaded with every
  control still disabled. No plugin source or database payload was removed.

## Boundary

No remote forum, DNS, mail, credentials, production database, or live content
was changed. The future `dev-forum.discussionbridge.dev` live sandbox requires
its own isolated infrastructure, backup, and rollback review.
