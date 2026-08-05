# DiscussionBridge Plugin Local Development Acceptance

Date: 2026-08-02

Status: PASS for the pinned local Discourse development checkout. This is not
authorization to install on a remote forum or in production.

## Environment

- Discourse commit: `6b2f4579ba6802a7c556459e596c3150b67403aa`.
- Ruby: 3.4.10.
- Frontend: Node 24.18.0, held in a persistent tmux session.
- Plugin source is linked from the standalone DiscussionBridge plugin root.
- Both plugin migrations applied to the disposable development database.

## Safe startup

- Local home returned HTTP 200.
- Plugin master enabled for runtime acceptance.
- Controlled-creation endpoint remained disabled and returned HTTP 503 with
  `endpoint_disabled` and `core_fallback:false`.
- Comments-only behavior caused no topic or post mutation on startup.
- `embed_any_origin` remained disabled; the local allowlist was exactly
  `localhost:3000`.

## Runtime fixture and results

A clearly labeled local-only topic, one completed mapping, and one local-only
reply exercised the accepted boundary.

- Empty embed after full client boot: marker persisted, source post display was
  `none`, source height was zero, native first-reply/sign-in controls remained,
  and document height equaled the 720 px viewport.
- Replied embed: source post remained absent from layout, reply text and native
  post controls were visible, native empty state was absent, and document
  height remained 720 px.
- Ordinary topic: no Bridge marker or embed mode; the source post remained
  `block`, approximately 3,376 px tall, and its source text remained present.
- Operator-disable rollback: Bridge marker disappeared and Core behavior
  returned without removing the reply. The setting was restored afterward.
- Caller-supplied reserved-marker rollback: a full-app caller could not force
  `discussion-bridge-comments-only` while the operator option was disabled;
  the marker was removed, post 1 remained visible, and unrelated valid
  operator classes remained supported.

## Integration findings

- The master enabled Boolean must be client-visible for Discourse to include
  plugin assets. Credentials and all operational policy settings remain
  server-only.
- Discourse rebuilds its `<html>` classes during client boot. The plugin client
  initializer therefore preserves the server-authorized marker only while
  `body.embed-mode` remains active.
- The comments-only marker is reserved. The redirect strips it from caller
  input and restores it only after the enabled completed-mapping check passes.
- External development plugin JavaScript requires its plugin bundle compilation
  before Rails serves the initializer.

## Remaining boundary

Prepare an exact install/disable/rollback plan for a reviewed non-production
Discourse forum. Do not enable the controlled-creation endpoint or mutate
existing topics as part of comments-only installation acceptance.
