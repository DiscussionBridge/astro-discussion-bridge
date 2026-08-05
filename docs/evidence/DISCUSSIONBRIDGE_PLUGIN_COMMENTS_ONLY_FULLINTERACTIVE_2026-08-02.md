# DiscussionBridge Plugin Comments-Only fullInteractive

Date: 2026-08-02

Status: implemented and accepted on the local development server; reviewed
non-production and live-install acceptance remain open. This record authorizes no production
installation, deployment, or forum mutation.

## Implemented boundary

- Operator control `discussion_bridge_comments_only_full_interactive` defaults
  to disabled.
- A full-app request receives the scoped
  `discussion-bridge-comments-only` class only when the plugin, the operator
  option, Discourse full-app embedding, and a completed DiscussionBridge topic
  mapping are all present.
- The plugin extends Discourse Core's `/embed/comments` redirect and preserves
  a valid existing operator class.
- The marker is reserved: caller-supplied copies are stripped and restored only
  after plugin authorization, preventing unmapped or disabled embeds from
  activating comments-only presentation.
- Scoped CSS gives companion post 1 `display: none` only inside that
  comments-only full-app document.
- The stored post, ordinary topic view, replies, composer, native actions, and
  Core zero-reply footer are not rewritten or replaced.
- No host-side height cap, unscoped theme rule, synthetic topic ID, or post
  deletion is used.

## Verification

- Discourse baseline: `6b2f4579ba6802a7c556459e596c3150b67403aa`.
- Ruby: 3.4.10.
- RuboCop: 25 files, zero offenses.
- Non-browser RSpec: 38 examples, zero failures.
- Focused presenter/redirect RSpec: 7 examples, zero failures.
- Browser RSpec: 4 examples, zero failures. It verifies the native empty state,
  visible replies and actions, unchanged ordinary long-topic presentation, and
  rejection of a caller-supplied reserved marker while disabled.
- The successful run used a persistent tmux-hosted Discourse frontend and a
  cleared test stylesheet cache. The master plugin setting is client-visible,
  as required for Discourse to include the plugin stylesheet; credentials and
  operational settings remain server-only.
- Local development runtime acceptance passes empty, replied/actions, ordinary
  long-topic, and operator-disable rollback checks after full client boot. A
  client initializer preserves the server-authorized marker when Discourse
  rebuilds its `<html>` class list.

## Remaining acceptance

Test it on a reviewed non-production forum before any production installation
proposal. Verify compact empty state, short replied topics, long
discussions with a configured maximum, desktop/mobile sizing, and rollback by
disabling the option and plugin.
