# Demo Plan

## Goal

Develop in public with a visible path from local preview to a live Cloudflare demo backed by a real Discourse sandbox. Discussion Bridge is Discourse-first; the Astro demo should prove an excellent Discourse integration across Astro, Starlight, and deployment targets.

## Demo Stages

1. Local preview/test
   - Run the Starlight demo at `http://localhost:4321`.
   - Add `localhost` or `localhost:4321` as a Discourse embedding host when supported.
   - Use this for quick UI and build smoke testing.

2. Live Astro demo on Cloudflare
   - Deploy the demo fixture to a public Cloudflare URL.
   - Use `astrodemo.discussionbridge.dev` as the stable Astro demo hostname.
   - Use this as the real embed-host test target.

3. Live Astro/Starlight demo on Cloudflare
   - Deploy the Starlight docs demo fixture to a public Cloudflare URL.
   - Use `astrostarlightdemo.discussionbridge.dev` as the stable Astro/Starlight demo hostname.
   - Use this as the real docs-site embed-host test target.

4. Live Discourse category for Astro
   - Use `forum.discussionbridge.dev` as the Discourse host.
   - Use the public `Discussion Bridge for Astro` category at `https://forum.discussionbridge.dev/c/alpha/5` for test/demo topics.
   - Use Discourse category ID `5` for `publish-new` tests.
   - Use tags for product and demo details, for example `discussionbridge`, `astro`, `starlight-demo`, and `cloudflare-demo`.
   - Current API key is global for the `discussbridge-bot` user.
   - Longer term, replace it with a granular key that can create topics/posts in Alpha, read existing topics/posts, update the managed first post for linked companion topics, update topic metadata, and unlist demo/test topics.
   - Topic visibility and retitling replied topics require a Discourse user with enough topic-management authority.
   - Enable embedding for localhost preview, `astrodemo.discussionbridge.dev`, and `astrostarlightdemo.discussionbridge.dev`.
   - Pre-integration backup checkpoint: `discussion-bridge-forum-2026-07-16-140054-v20260715090434.tar.gz`.

## Test Matrix

- Existing `.md` docs render `<Discussion />` through the Starlight layout override.
- `publish-new --dry-run` detects missing topics without requiring API credentials.
- `publish-new` creates one real Discourse companion topic in the Discussion Bridge for Astro category.
- `sync-existing --dry-run` reports linked pages as unchanged after first posts are synced from Astro source content.
- `publish-and-sync --dry-run` previews both create and sync actions without writing to Discourse.
- The built Cloudflare demo page loads the native Discourse discussion UI.
- Logged-in Discourse users can interact with replies and likes in the embedded UI.
- Multiple Astro hosts can connect to `forum.discussionbridge.dev` without topic collisions, using the Discussion Bridge for Astro category plus tags/URLs for namespacing.
- One Astro/Starlight site can publish multiple content lanes, such as docs and Starlog-style releases, to different Discourse categories or tags.
- Future compatibility test: one canonical Astro site connected to multiple Discourse instances, such as a central advocacy or industry organization publishing source material while linking discussion into chapter, regional, public, private, or member-specific forums. Current Tier 1 work should stay scoped to one Discourse target per page, but avoid hard-coding names or helper APIs in ways that would block a later namespaced target model.
- Demo/test companion topics can be unlisted to keep category discovery clean while preserving direct links and embeds.
- Topic title/category metadata sync is part of the managed companion-topic path, subject to Discourse permissions.

## Bridge Contract Test Matrix

- Astro title changes after publish: `sync-existing` should update the managed first post content; topic-title updates may require moderator/staff authority once a topic has replies.
- Discourse topic title changes after publish: Astro rendering should keep working because `discourseTopicId` is durable. Stored topic URLs may become cosmetically stale, but Discourse should redirect old slugs for the same topic ID.
- Discourse first post deleted: sync should fail clearly with a managed-first-post missing error. Do not silently create replacement content.
- Discourse topic deleted: render and sync paths should fail or degrade clearly for the linked page. Any repair/recreate command should be explicit, not automatic.
- Discourse instance offline: `simple` and `fullInteractive` should still render host-page markup; `full` server-rendered replies, page-load refresh, and publish/sync commands should fail or degrade visibly without breaking the article shell.
- Active discussion target mismatch: pages marked with `discussionTarget` should be skipped unless the active target matches, preventing accidental sync to the wrong Discourse instance.
- Missing active discussion target: pages marked with `discussionTarget` should tell the user which `--target` to rerun with.
- Same Astro site with multiple future Discourse targets: keep as a compatibility test for future namespaced targets, not current Tier 1 behavior.

## Maintenance Test Process

Use maintenance syncs as explicit tests, not one-off commands. Before syncing existing live topics, confirm the local demo package is current by checking the installed CLI output or searching the installed package for the expected companion-body text. Then run a lane dry run, inspect the output, run the live sync, and verify both Discourse and Astro.

Blog lane smoke test:

```powershell
npx astro-discussion-bridge sync-existing src/content/blog `
  --route-base blog `
  --discourse-url https://forum.discussionbridge.dev `
  --site-url https://astrostarlightdemo.discussionbridge.dev `
  --category-id 5 `
  --tags discussionbridge,starlight-demo,blog `
  --dry-run
```

If the dry run is correct, rerun the same command without `--dry-run`. Verify the Discourse first post starts with the article link, includes reader-facing content, and does not show implementation labels such as `This is a companion discussion topic for:` or `Source content:`.

## Live Publish Checkpoints

- 2026-07-16: Starlight demo published companion topics to the public Discussion Bridge for Astro category.
  - `existing-md-page.md`: https://forum.discussionbridge.dev/t/existing-md-page/20
  - `index.md`: https://forum.discussionbridge.dev/t/discussionbridge-starlight-demo/21
  - API user: `discussbridge-bot`
  - Current key scope: global; replace with granular/category-scoped key when available.
- 2026-07-16: Starlight demo deployed to Cloudflare Pages and verified at https://astrostarlightdemo.discussionbridge.dev/.
  - Homepage returns `200` and links topic 21.
  - `/existing-md-page/` returns `200` and links topic 20.
- 2026-07-16: Starlight demo synced existing first posts for topics 20 and 21.
  - Follow-up `sync-existing --dry-run` reported both pages unchanged.
  - Source tracking frontmatter now includes `discussionSourceHash` and `discussionLastSyncedAt`.
- 2026-07-16: Naming pass aligned the demo with the Discussion Bridge product-family strategy.
  - Astro lane name: Discussion Bridge for Astro.
  - Topic 20 title updated through the bot key because the topic has no replies.
  - Topic 21 first post synced, but its topic title remained unchanged through the topic update API after replies existed.
  - Promoting `discussbridge-bot` to moderator allowed `sync-existing --unlist` to unlist topics 20 and 21.
  - Keep `--unlist` opt-in, and use a granular key tied to a staff/moderator-capable user before enabling unlisting in automation.
- 2026-07-17: Content lane demo deployed and tested with docs, releases, blog, and news routes.
  - Blog lane created topic 27.
  - News lane created topic 28.
  - Release lane was already claimed by Discourse embedding as topic 24, so `publish-and-sync` received `Embed url has already been taken`.
  - Linking `src/content/releases/2_1.md` to topic 24 and running `sync-existing --route-base releases` reconciled the topic.
  - Product note: embedded Discourse topics can exist before CLI publishing. Future tooling should detect or reconcile existing `embed_url` ownership where the Discourse API allows it.

## Notes

Coding Horror is useful as a public reference, but it cannot be used for embedded localhost testing because its Discourse instance does not authorize our local/demo host.

When testing `fullInteractive`, confirm Discourse admin has `Embed full app` enabled. If the Astro page sends `fullApp: true` but Discourse still serves the legacy embed comments view, links may open Discourse directly instead of behaving like the full embedded app. For the current demo, use these Discourse embedding settings: full app yes, full app sign-in flow yes, suppress third-party analytics in embed yes, support markdown yes, set canonical URL yes, unlisted yes, any origin no, topics list no, and allowed embed selectors empty/default.

`fullInteractive` uses Discourse's own fixed composer/sign-in surface inside the iframe. In the current Astro demo, the article is short enough that the comments iframe is fully visible in the viewport, so the logged-in editor or logged-out sign-in button is immediately visible at the bottom of the embed. Compare against the Discourse blog full-app embed reference, where enough article content pushes the comment section lower on the page and the composer is not seen until the reader reaches the comments area. Add a longer article-body test page before judging whether composer placement needs theme or sizing work.

After browser-heavy inspection, local Astro builds can hit Node out-of-memory failures from workstation memory pressure. Close extra browser tabs and retry the build before treating the failure as a code defect.
## Domain Strategy

- `discussionbridge.dev` is the primary product/docs domain.
- `discussionbridge.com` redirects to `discussionbridge.dev`.
- `astrodemo.discussionbridge.dev` hosts the live Astro demo.
- `astrostarlightdemo.discussionbridge.dev` hosts the live Astro/Starlight demo.
- `forum.discussionbridge.dev` hosts the Discourse instance.
- Discussion Bridge is the umbrella product family.
- Discussion Bridge for Astro is this Astro/Starlight integration and demo lane.
- Future integration lanes can use parallel names such as Discussion Bridge for Statamic.
- Tags should carry product, integration, demo, and provider details such as `discussionbridge`, `astro`, `starlight-demo`, `cloudflare-demo`.



