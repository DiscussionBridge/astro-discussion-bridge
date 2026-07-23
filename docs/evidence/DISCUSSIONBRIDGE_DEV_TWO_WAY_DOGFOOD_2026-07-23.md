# DiscussionBridge.dev Two-Way Dogfood Evidence — 2026-07-23

This sanitized record supports the bounded live claims in the Discussion Bridge
manuals and Alpha checklist. It contains no credentials, account identifiers,
protected paths, or private deployment data.

## Reviewed Build And Deployment

| Item | Sanitized evidence |
| --- | --- |
| Apex source commit | `d68ffc4` — `Add two-way Discussion Bridge dogfood` |
| Review | Code Boss final PASS |
| Apex build | Clean detached `npm ci` and production build passed; the apex build generated **5 public routes** |
| Deployment time | 2026-07-23 09:00:47 America/Los_Angeles |
| Canonical apex | HTTP 200 |
| Raw Pages hostname | `https://discussionbridge-dev.pages.dev` returned HTTP 301 to the canonical apex |

The five-route count belongs to the DiscussionBridge.dev apex production build.
It is separate from the product documentation-site build, which synchronized
20 documentation sources and generated 21 HTML pages during the corresponding
Product Boss documentation pass.

## Direction One: Site Starts A Conversation

| Item | Sanitized evidence |
| --- | --- |
| Astro route | `/blog/every-connection-has-a-job/` returned HTTP 200 |
| Source ownership | `astro-managed` |
| Companion topic | `forum.discussionbridge.dev` topic `37` |
| Topic category | `5` |
| Wiki | `false` |
| Tags | `discussionbridge`, `community`, `product` |

The blog and topic are one Astro-to-Discourse connection. Topic `37` has its
own reply stream.

## Direction Two: Community Develops Durable Knowledge

| Item | Sanitized evidence |
| --- | --- |
| Astro route | `/guides/how-to-choose-a-discussion-bridge-source-mode/` returned HTTP 200 |
| Source ownership | `discourse-managed` |
| Source/primary topic | `forum.discussionbridge.dev` topic `36` |
| Topic category | `6` |
| Wiki | `true` |
| Tags | `discussionbridge`, `source-mode`, `guide` |
| Page markers | Source disclosure present; primary `fullInteractive` discussion bound to topic `36` |
| No-writeback check | Deliberate `sync-existing --dry-run` skipped with the `discourse-managed` no-writeback reason |

Topic `36` remains the editing source and primary discussion. Its reply stream
is independent from topic `37`; no replies are merged.

## Known Notices

- The clean apex install reported one high-severity npm audit finding.
- No automatic `npm audit fix` was run.
- The production build retained the Mermaid chunk warning above 500 kB.

These notices remain release work. This record does not claim they are fixed.

## Claim Boundary

This evidence proves two separate, live, single-writer Discussion Bridge
connections on DiscussionBridge.dev. It does not prove merged replies, a
general control plane, or general forum-to-forum orchestration.
