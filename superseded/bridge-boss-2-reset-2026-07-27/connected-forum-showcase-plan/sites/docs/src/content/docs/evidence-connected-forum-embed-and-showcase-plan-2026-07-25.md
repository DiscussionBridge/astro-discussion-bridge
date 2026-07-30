---
title: "Connected Forum Embed and Showcase Plan"
lastUpdated: 2026-07-27
appliesTo: "DiscussionBridge Alpha"
editUrl: "https://github.com/DiscussionBridge/astro-discussion-bridge/edit/main/docs/evidence/CONNECTED_FORUM_EMBED_AND_SHOWCASE_PLAN_2026-07-25.md"
---

Date: 2026-07-25  
Status: Local inventory complete; live forum configuration and apex implementation remain open

## Finding

Recent forum setup established categories, tags, bot identities, and Bridge
targets, but did not complete the Discourse embedding configuration on every
connected forum. The public `discussionbridge.dev` apex describes the two
publishing directions and links to demos, but it does not yet provide one
coherent product showcase that lets a visitor see the relationships working.

No authenticated forum request, forum setting change, or deployment was
performed during this inventory.

## Embed Configuration Matrix

Each hostname must be listed deliberately. Do not enable `embed any origin` as
a shortcut.

| Discourse control plane | Public host to authorize | Intended relationship | Current acceptance state |
| --- | --- | --- | --- |
| `forum.discussionbridge.dev` | `discussionbridge.dev` | Product blog, guides, and showcase discussion | Configuration not yet verified |
| `forum.discussionbridge.dev` | `demo.discussionbridge.dev` | Demo index and bounded product demonstrations | Configuration not yet verified |
| `forum.discussionbridge.dev` | `astro.demo.discussionbridge.dev` | Astro package demonstration | Configuration not yet verified |
| `forum.discussionbridge.dev` | `astrostarlight.demo.discussionbridge.dev` | Astro Starlight demonstration | Configuration not yet verified |
| `forum.repealobbba.org` | `onebigbeautifulbill.us` | Primary OBBBA Text/Impact discussion relationship | Previously exercised; reverify setting and representative pages |
| `forum.repealobbba.org` | `repealobbba.org` | Repeal OBBBA public site after Astro cutover | Not configured/verified for the future Astro site |
| `forum.repealobbba.org` | `repealobbbaact.us` | Community-authored legislation/public presentation lane | Not configured/verified |
| `forum.citizenactivist.network` | `citizenactivist.network` | Citizen Activist public publishing relationship | Apex and embed relationship not yet implemented |

Additional public hosts must be added only when a real page-to-topic
relationship exists. Linking to an additional forum target does not by itself
require that forum to authorize the page as an embed host.

## Per-Forum Live Gate

For each row that becomes active:

1. Confirm the exact public hostname and HTTPS origin.
2. Add the hostname through Discourse's supported embedding-host UI.
3. Keep `embed any origin` disabled unless a separately reviewed use case
   requires it.
4. Verify the intended full-app settings and sign-in flow.
5. Open a representative public page and confirm the expected topic appears.
6. Verify the direct topic fallback remains usable.
7. Verify an unrelated hostname is not accepted.
8. Record the forum, public host, page URL, topic URL, mode, status, and date as
   acceptance evidence.

Live execution requires an authorized forum administrator and a reviewed,
complete runbook. It must not become an improvised credential exercise.

## DiscussionBridge.dev Showcase

The showcase belongs on the product apex, not only on disconnected demo
subdomains. It should explain and demonstrate one system with multiple
relationships:

- **Astro to Discourse:** a source-controlled article owns the published text;
  its Discourse companion owns the living discussion.
- **Discourse to Astro:** a community wiki owns the working source; Astro
  publishes a reviewed durable guide with no source writeback.
- **One page, more than one community:** show the protected primary discussion
  and a separately identified additional target without implying that both
  forums own the same source.
- **Operational evidence:** show authority, source mode, provenance, last
  synchronization state, and the direct forum fallback in human language.
- **Real implementation proof:** link to the OBBBA implementation as a field
  example while clearly distinguishing product showcase content from production
  civic content.

The first implementation should reuse the existing live blog topic `37`, guide
topic `36`, package components, and demo sites. It should not fabricate activity
or require a live write during page rendering.

## Public Acceptance

- A first-time visitor can explain what DiscussionBridge connects after one
  screen.
- Every showcase relationship names its source authority and discussion role.
- Embedded discussion works when enabled; the direct topic link works when it
  does not.
- The page is useful without signing in and does not expose credentials or
  administrative diagnostics.
- Mobile, keyboard, accessibility, metadata, canonical URL, broken-link, and
  custom-404 checks pass.
- The showcase remains truthful when a forum is temporarily unavailable.

