# Connected Public-Site Inventory — 2026-07-31

Status: current-state inventory for Product review. This document is evidence,
not authorization to edit, populate, publish, deploy, redirect, migrate, or
change forum configuration.

## Boundary

This inventory was gathered independently from current public HTTP responses,
current local repositories, reviewed successor records, and a read-only
Cloudflare Pages project listing. It does not reuse the quarantined Bridge Boss
2 connected-site audit, imports, generated navigation, route counts,
relationships, or repair sequence.

For every surface, the next repair or cutover remains a separately approved
site lane. A reachable page is not proof of correct source ownership,
deployment provenance, content authority, DiscussionBridge configuration, or
release acceptance.

Evidence timestamp: 2026-07-31 PDT.

## DiscussionBridge product estate

| Public surface | Intended product job | Current source boundary | Current public/provider evidence | DiscussionBridge/forum role | Rollback boundary | Exact open gate |
|---|---|---|---|---|---|---|
| `discussionbridge.dev` | Product and brand apex | `DiscussionBridge/discussionbridge.dev`, local `sites/apex`; local repo `main` at `3be4869`, with unrelated local work still requiring candidate isolation | HTTP 200; Cloudflare Pages project `discussionbridge-dev`; exact live deployment identity not captured by this inventory | Product explanation plus exercised two-direction dogfood pages connected to `forum.discussionbridge.dev` | Capture exact current Pages deployment and previous deployable version before change | Freeze an exact clean apex candidate, review current dirty-tree separation, then perform its own Wrangler migration and live acceptance |
| `docs.discussionbridge.dev` | Public manuals and reference documentation | `DiscussionBridge/astro-discussion-bridge`, local `sites/docs`; repo `main` at `ab5e93a` | HTTP 200; title `DiscussionBridge Public Docs`; Pages project `docs-discussionbridge-dev`; Git-connected and modified during this inventory window | Documents the product; no forum topic creation is required for ordinary docs reads | Capture exact Pages deployment and prior version before change | Verify exact source/output identity, raw Pages-host redirect, checked-in Wrangler ownership, links, search, and 404 behavior |
| `demo.discussionbridge.dev` | Demo chooser/hub | `DiscussionBridge/discussionbridge.dev`, local `sites/demo-switcher`; repo `main` at `3be4869` | HTTP 200; Pages project `demo-discussionbridge-dev`; live hub links to the settled dotted Starlight hostname | Navigation only; links to demos and forum discussions | Capture exact Pages deployment and prior version before change | Freeze exact hub candidate, migrate with checked-in Wrangler, and exhaustively verify demo and discussion links |
| `astro.demo.discussionbridge.dev` | Plain Astro publishing and relationship demo | `DiscussionBridge/astro-discussion-bridge`, local `examples/astro-demo`; repo `main` at `ab5e93a` | HTTP 200; Pages project `astro-discussion-bridge`; Git-connected | Connects to `forum.discussionbridge.dev`; topic 38 proves Discourse Core can create a companion topic as `system` on first embed view when no topic ID exists | Capture exact Pages deployment and prior version before change | Preserve current demo behavior while finishing BB2 cleanup; afterward implement the recorded operator-controlled publication default and keep Core visitor-triggered creation explicit opt-in |
| `astrostarlight.demo.discussionbridge.dev` | Astro + Starlight integration and comments-mode demo | `DiscussionBridge/astro-discussion-bridge`, local `examples/starlight-demo`; repo `main` at `ab5e93a`; hostname migration source commit `79491e1` | HTTP 200; Pages project `astrostarlight-demo-discussionbridge-dev`; 13-page build reviewed; simple, full, and signed-in fullInteractive verified live | Connects to `forum.discussionbridge.dev`; exact dotted host is authorized in Discourse | Current and prior Pages deployments remain provider rollback boundary; exact IDs should be captured in the future Wrangler migration record | Demo repair is accepted. Remaining work is its separate checked-in Wrangler migration; do not reopen the retired combined hostname as canonical |
| `stockstarlight.demo.discussionbridge.dev` | Unmodified Starlight control for comparison | `DiscussionBridge/astro-discussion-bridge`, local stock Starlight example; repo `main` at `ab5e93a` | HTTP 200; Pages project `stockstarlightdemodiscussionbridgedev`; Git-connected | No DiscussionBridge connection by design; it is the control | Capture exact Pages deployment and prior version before change | Preserve the no-Bridge control while migrating deployment ownership to checked-in Wrangler |
| `forum.discussionbridge.dev` | Community, demo companion topics, support, and forum-side authority | Self-hosted Discourse; reusable/site operations records belong in the Discourse operations lanes, not Astro repos | HTTP 200 through nginx; signed-in admin verified exact Embeddable Hosts `astro.demo.discussionbridge.dev` and `astrostarlight.demo.discussionbridge.dev`; `embed any origin` is not the accepted model | Discourse Core owns identity, permissions, categories, listing, moderation, and final forum decisions | Server/app backup and exact deployment rollback must be established in the Discourse operations lane before changes | Preserve the two exact embed hosts; separately document and implement forum-authoritative listed/unlisted policy and the future optional plugin boundary |

## Compatibility and alias surfaces

| Surface | Current state | Controlling disposition |
|---|---|---|
| `astrostarlightdemo.discussionbridge.dev` | Permanent HTTP 301 to `astrostarlight.demo.discussionbridge.dev`, preserving path and query; Pages project `astrostarlightdemo-discussionbridge-dev` contains redirect payload only | Compatibility-only. Never serve duplicate demo content, create/reconcile topics against it, or restore it as canonical |
| `discussionbridge.com` | Intended alias for `discussionbridge.dev`; not independently accepted by this inventory | Verify exact redirect status, path/query behavior, provider ownership, and rollback in a separate alias gate |

## OBBBA connected estate

| Public surface | Intended product job | Current source/authority boundary | Current public/provider evidence | DiscussionBridge/forum role | Rollback boundary | Exact open gate |
|---|---|---|---|---|---|---|
| `onebigbeautifulbill.us` | Reader-facing OBBBA explanation, protected Text/Impact proof pages, and clean successor demonstration | `OneBigBeautifulBill/onebigbeautifulbill.us`, local `C:\CodeProjects\Projects\OBBBA\sites\onebigbeautifulbill.us\astro`, `main` at `eeb9562`; official-source/content doctrine remains separate from forum metadata and discussion | HTTP 200; Pages project `onebigbeautifulbill-us`; accepted clean Worker successor remains version `02026df4-2348-471e-a671-af38f287a720`, deployment `33876b6d-428a-413f-90e3-5cb8841fc41d` | Protected pages connect to `forum.repealobbba.org`; approved DiscussionBridge credit/fullInteractive behavior is retained; quarantined BB2 pages remain absent | Former contaminated v29 `2e0d2277-b9fb-40ba-ad85-07cae6d425dc` is emergency rollback provenance only, not clean authority | Treat the clean successor as baseline. Route any content growth, Law pipeline work, or deployment change separately; never reuse quarantined BB2 inputs |
| `obbba.us` / `www.obbba.us` | Short entry domains for `onebigbeautifulbill.us` | Redirect-only provider configuration; no local Astro implementation is required | Both hosts return HTTP 301 to `https://onebigbeautifulbill.us/`; tested paths and queries intentionally collapse to the destination homepage | No independent DiscussionBridge binding; the destination site owns the reader and discussion experience | Preserve the current redirect rule and provider configuration as the rollback boundary | Redirect job is settled and live; reverify both hosts after any DNS, redirect-rule, or destination-domain change |
| `repealobbba.org` | Campaign/news/blog/public organizing site | `RepealOBBBA/repealobbba.org`, local Astro repo `main` at `74e70e1`; site content authority is independent of Law as Amended authority | Requested apex redirects to `https://www.repealobbba.org/`, final HTTP 200; current Pages project is not established by the Systems-account listing | Intended many-to-one connection to `forum.repealobbba.org`; no current DiscussionBridge binding accepted by this inventory | Capture actual provider/deployment and prior version | Fresh site-specific review of source, deployment, content lanes, and forum connection before adopting any old proposed action |
| `repealobbbaact.us` | Future structured act/drafting and package-installed end-stage test | Local site container has no nested Git implementation; the exact Git source connected to provider is unresolved | HTTP 200 with title `Welcome to Starlight`; Pages project `repealobbbaact-us` is Git-connected | Intended future Discourse-source structured-page lane; no current binding accepted | Identify provider Git source and current/prior deployments | Treat the stock Starlight public state as not product-ready. Resolve source ownership before any design, import, or DiscussionBridge work |
| `repealobbbapledge.us` | Simple initial pledge/campaign action surface in the OBBBA product group | Local site container has no nested Git implementation; active source mapping remains unresolved | Apex redirects to `www`; final HTTP 200 with title `Repeal OBBBA Act Pledge`; Pages project `repealobbbapledge-us-temp-placeholder` | No current DiscussionBridge binding verified | Capture the working deployment plus DNS/redirect state before change | Preserve the working simple experience; later inventory its authoritative source as a separate lane and do not infer a Bridge lane from the deployment |
| `forum.repealobbba.org` | OBBBA community memory and production discussion backbone | Self-hosted Discourse; forum content is discussion/source context, never Law as Amended enacted authority | HTTP 200 through Cloudflare | Existing protected bindings, including topic 434, remain production forum edges | Server/app backup and exact deployment rollback belong to the Discourse operations lane | Preserve current production forum behavior; separately inventory exact embed hosts, category/listing policy, keys by role without secrets, and rollback evidence |

## CitizenActivist connected estate

| Public surface | Intended product job | Current source boundary | Current public evidence | DiscussionBridge/forum role | Rollback boundary | Exact open gate |
|---|---|---|---|---|---|---|
| `citizenactivist.network` | Planned public CitizenActivist site with defined future scope | Workspace planning/source material is under `C:\CodeProjects\Projects\CitizenActivist`; no implemented deployable apex site has been established | No implemented apex site is claimed; this is an unstarted product lane, not a broken-site recovery claim | Intended future connection to `forum.citizenactivist.network`; no active public-site binding accepted | To be established when an exact implementation and hosting candidate exists | Preserve the planned scope and start a separate product/build lane when authorized; do not treat the live forum as evidence that the apex has been implemented |
| `forum.citizenactivist.network` | Citizen Activist Community forum and bounded multi-target proof destination | Self-hosted Discourse; forum authority remains with its operator | Confirmed live; HTTP 200 | Existing bounded proof target only; not evidence of a general many-to-many administration plane | Server/app backup and deployment rollback unverified | Preserve the live forum; independently inventory exact proof bindings, permissions, embed hosts, and rollback before new writes |

## Current findings that require separate lanes

1. The six DiscussionBridge Astro-family sites are public and source ownership is
   mostly clear, but each still needs its own exact Wrangler migration record.
2. `astrostarlight.demo.discussionbridge.dev` repair is complete; its old
   combined hostname is correctly compatibility-only.
3. Plain Astro topic 38 exposes the distinction between Discourse Core
   visitor-triggered `system` creation and future DiscussionBridge-controlled
   operator publication. Implementation is intentionally deferred until BB2
   remediation closes.
4. `obbba.us` and `www.obbba.us` now perform their settled redirect-only job:
   both return HTTP 301 to the `onebigbeautifulbill.us` homepage.
5. `repealobbbaact.us` is publicly reachable but still a stock Starlight page;
   its provider-connected Git source is not mapped to the local site container.
6. `repealobbbapledge.us` has a working simple pledge experience whose active
   source still needs a separate future inventory; preserve it meanwhile.
7. `citizenactivist.network` has planned scope but no implemented apex site;
   `forum.citizenactivist.network` is the currently live established surface.
8. No old audit observation authorizes any repair. Each finding above must be
   routed as a discrete Product/Code/Manual/Ops lane with exact candidate and
   rollback evidence.

## Inventory acceptance rule

Product review must confirm the product jobs, source/authority boundaries, and
lane separation. Code review must confirm repository/deployment claims and flag
any technical ambiguity. Manual review must confirm that the inventory cannot
be mistaken for deployment authority or current release acceptance. Only after
those reviews pass may the Connected Public-Site Release Gate inventory item be
marked complete.
