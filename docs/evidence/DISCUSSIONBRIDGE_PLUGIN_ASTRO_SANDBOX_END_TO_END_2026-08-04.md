# DiscussionBridge plugin — Astro sandbox end-to-end acceptance

Date: 2026-08-04  
Status: accepted non-production sandbox boundary

## Outcome

The canonical Starlight demo now proves the preferred Alpha connection path end to end:

1. Astro requests create-or-resolve through the authenticated, server-only DiscussionBridge plugin endpoint.
2. The sandbox forum applies its own actor, category, tags, and visibility policy.
3. Astro persists only the returned topic identity.
4. A repeated request resolves the durable mapping rather than creating another topic.
5. The public page renders fullInteractive comments from the forum identified by the bound topic URL.

Public reader page:
`https://astrostarlight.demo.discussionbridge.dev/comments/plugin-sandbox/`

Sandbox companion topic:
`https://sandbox-forum.discussionbridge.dev/t/10`

## Adapter contract

- `publishOnBuild.controlledCreation` selects the forum-controlled endpoint.
- Connection ID and secret are read only from named server environment variables.
- The credential is not included in the virtual/public Astro configuration, generated HTML, logs, or this evidence.
- The adapter requires `created` or `resolved`, a positive topic ID, and `core_fallback: false`.
- Controlled creation writes `discourseTopicId` and `discourseTopicUrl`; it does not claim that the Astro body was synchronized to Discourse.
- Updates to an existing controlled topic remain forum-owned.
- Dry runs require no connection credential and perform no network write.
- A lane-root `index.md` with an explicit `routeBase` maps to the lane root. The legacy no-`routeBase` `/index/` behavior remains unchanged.
- A bound topic URL controls the forum origin used by simple/fullInteractive embeds and full replies; the site-wide forum URL is only the fallback when a binding has no forum origin.

## Sandbox result

Final forum switches:

- plugin enabled: `true`
- create-or-resolve endpoint enabled: `false`
- comments-only fullInteractive enabled: `true`
- Core zero-touch compatibility: `false`
- `embed_any_origin`: `false`

The exact embeddable-host record authorizes `astrostarlight.demo.discussionbridge.dev`, has no path restriction, and retains category ID 5.

Topic 10 is complete and policy-controlled:

- title: `Plugin-Controlled Sandbox Comments`
- author/service identity: `editorbridgeforum`
- category ID: 5 (`DiscussionBridge Sandbox`)
- tag: `discussionbridge-sandbox`
- effective visibility: unlisted
- posts: 1
- canonical source: `https://astrostarlight.demo.discussionbridge.dev/comments/plugin-sandbox/`

Audit events 6 and 7 record `created / durable_mapping_created` and `resolved / existing_mapping` for topic 10. Repeating the exact adapter request after removing the local binding resolved topic 10; it did not create a duplicate.

The earlier route-normalization probe remains as inert sandbox provenance: mapping 2/topic 9 is unlisted and bound to the superseded `/comments/plugin-sandbox/index/` source. It is not linked from the public demo and must not be deleted or migrated without a separate explicit cleanup decision.

The duplicate-title failure for mapping 3 was recovered only after administrator `discourseadmin` authorized retry. Audit event 5 records `reconciliation_authorized / retry_authorized`; the adapter did not silently retry a failed reservation.

## Backup and rollback

Pre-operation sandbox backup:

- file: `sandbox-2026-08-04-155242-v20260803015314.tar.gz`
- bytes: 4,484,319
- SHA-256: `4d6358465a7e5fae6a8e35f4e6d97a41bb4dc3f25c507f44d2fab3b7a005fc7d`

Cloudflare Pages deployment:

- current production deployment: `5a1c4bca-e3cf-4604-94cf-c5913503a63d`
- current preview: `https://5a1c4bca.astrostarlight-demo-discussionbridge-dev.pages.dev`
- immediate prior deployment: `4b747efe-963e-487b-96d7-733be7e8ca7b`
- pre-boundary deployment: `3f369011-f669-480c-9138-58c2d32decb5`

The replacement uploaded one changed asset and reused 168. No production Discourse instance, DNS record, or production forum setting was changed.

## Verification

- package build and complete test suite: 117/117 PASS
- Starlight static build: 14 pages PASS
- built page: 22,085 bytes / SHA-256 `bcfaa1bfa985716197ebc3dfc390fb4bfe43e454d85ecd75044d0bee4d7c073c`
- built/live page: one DiscussionBridge credit, zero legacy site credits
- built page: zero connection-secret names or secret-header markers
- live custom-domain iframe source: `https://sandbox-forum.discussionbridge.dev/embed/comments?topic_id=10&full_app=true`
- live iframe at the tested 617-pixel content width: 360 pixels high, with the configured `70vh` ceiling
- anonymous direct topic access: PASS; correct title, service author, category, tag, unlisted notice, and source link
- `git diff --check`: PASS; only existing line-ending notices

## Boundary

This is non-production sandbox acceptance. It does not authorize promotion to `dev-forum.discussionbridge.dev`, installation on `forum.discussionbridge.dev`, migration of existing system-authored topics, deletion of sandbox provenance, production credentials, or production forum mutation.
