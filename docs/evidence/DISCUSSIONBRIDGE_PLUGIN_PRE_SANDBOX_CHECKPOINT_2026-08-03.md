# DiscussionBridge Plugin Pre-Sandbox Checkpoint

Date: 2026-08-03

Status: `pre-sandbox-local-plugin-core-complete`

This checkpoint supersedes the implementation-status portion of
`DISCUSSIONBRIDGE_PLUGIN_ALPHA_HANDOFF_2026-08-02.md`. That earlier record
remains useful product provenance, but its statement that implementation had
not started is no longer current.

## Completed local boundary

The DiscussionBridge for Discourse Alpha plugin core is implemented and
accepted in the disposable local WSL Discourse instance.

Plugin root:

```text
C:\CodeProjects\CodeWorksLabs\DiscussionBridge\plugins\discourse-discussion-bridge
```

Verified Discourse environment:

- checkout: `/home/phil/discourse-plugin-test`;
- Discourse commit: `6b2f4579ba6802a7c556459e596c3150b67403aa`;
- Ruby: `3.4.10`;
- plugin source is linked from the Windows plugin root above;
- local development and test databases contain the plugin migrations.

Implemented Alpha core:

- default-disabled forum control plane;
- authenticated create-or-resolve under a forum-configured non-`system`
  operating identity;
- canonical connection/source identity and idempotent mapping;
- forum-owned global and optional per-lane category, tag, and visibility
  policy;
- comments-only `fullInteractive` presentation that omits companion post 1
  from embed layout without changing the ordinary topic;
- compact zero-reply and naturally sized replied-topic presentation;
- native administrator Health, Settings, mappings/audit, and reconciliation
  surfaces;
- deterministic diagnostics for missing/deleted topics, stale/failed
  mappings, unknown lanes, policy drift, system authorship, and duplicate
  claims;
- administrator-only one-time retry authorization and revocation for eligible
  failed or stale mappings;
- durable audit records and secret-safe projections.

Safe defaults remain intact: plugin disabled, endpoint disabled, controlled
creation unavailable until configured, comments-only disabled, no service
identity, no trusted origins, unlisted creation policy, no silent Core fallback,
and no mutation on plugin load.

## Exact local acceptance identity

Controlling manifest:

```text
C:\CodeProjects\CodeWorksLabs\DiscussionBridge\plugins\discourse-discussion-bridge\ALPHA_LOCAL_ACCEPTANCE_MANIFEST.json
```

Manifest replay on 2026-08-03:

- active members: `65/65`;
- total member bytes: `146277`;
- ordinal row SHA-256:
  `f28f9a630c97bc61c70e36e9549d14733264bec677bb352e8d06d848c466f809`;
- identity mismatches: `0`.

Fresh verification on 2026-08-03:

- complete plugin-aware RSpec: `80 examples, 0 failures`;
- Discourse RuboCop: `46 files inspected, no offenses detected`;
- ESLint: PASS;
- Prettier: PASS;
- Stylelint: PASS.

The first generic RSpec invocation omitted `LOAD_PLUGINS=1` and therefore did
not load plugin constants. It collected zero examples and is an invocation
error, not a product/test failure. The plugin-aware replay above is the
controlling result.

## Settled hosted progression

The hosted estate is settled as:

1. local WSL `/home/phil/discourse-plugin-test` — disposable development;
2. `sandbox-forum.discussionbridge.dev` — disposable live integration sandbox
   on DigitalOcean;
3. `dev-forum.discussionbridge.dev` — stable preproduction on DigitalOcean;
4. `forum.discussionbridge.dev` — production.

The two DigitalOcean forums are separate instances. Each hosted forum must
retain its own database, credentials, deployment identity, backups, mail
posture, and rollback boundary. Sandbox credentials or SSH identities must not
be reused for dev or production.

## Plugin and theme-component relationship

The same local Discourse checkout and the same hosted sandbox may test both the
DiscussionBridge plugin and the planned combined Brand Header/Header Submenus
theme component. They remain separate artifacts and separate deployment paths:

- the plugin is installed at container build time and requires a Discourse
  rebuild;
- the theme component is developed with the Discourse Theme CLI and installed
  or updated through Discourse's theme/component mechanism;
- neither artifact may be hidden inside or treated as an implicit part of the
  other;
- component failure must not compromise plugin rollback, and plugin rebuild
  must not erase the recorded component revision.

No theme-component implementation or acceptance identity is claimed by this
plugin checkpoint.

## Next boundary

The next boundary is the sandbox operations package, not another plugin feature
slice. It should define:

- sanitized DigitalOcean/Discourse instance records;
- dedicated SSH identities and strict host verification;
- a server-only secret boundary;
- exact-revision plugin installation and rebuild;
- theme-component development/promotion mechanics;
- pre-rebuild backup and state capture;
- status, deploy, log, and rollback wrappers that fail closed to the sandbox
  hostname;
- post-rebuild acceptance and evidence capture;
- explicit separation from `dev-forum` and production authority.

Stop after the operations package is reviewed. Provisioning, DNS, SSH-key
installation, plugin installation, component installation, rebuild, migration,
forum mutation, or deployment requires the later sandbox execution boundary.

## Current authority boundary

This checkpoint authorizes no live installation or mutation. No DigitalOcean,
DNS, hosted Discourse, production, Git staging, commit, or push action occurred
while creating it.

