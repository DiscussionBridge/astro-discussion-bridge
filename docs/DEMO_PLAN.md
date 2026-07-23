# Demo Plan

## Goal

Develop in public with a visible path from local preview to a live Cloudflare demo backed by a real Discourse sandbox. Discussion Bridge is Discourse-first; the Astro demo should prove an excellent Discourse integration across Astro, Starlight, and deployment targets.

## Demo Source Ownership

Canonical demo implementations live with the product package that proves them.

- `astro-discussion-bridge` owns canonical package code, tests, examples, and demo source for Discussion Bridge for Astro.
- `discussionbridge.dev` owns the apex/product site, docs/site ecosystem, demo presentation/index pages, links, and support structure.

Do not duplicate demo source into `discussionbridge.dev` just because a deploy target is easier to wire that way. If a separate deploy repo is intentionally needed later, make that a named architecture decision rather than an ad hoc copy.

## Demo Stages

1. Local preview/test
   - Run the Starlight demo at `http://localhost:4321`.
   - Add `localhost` or `localhost:4321` as a Discourse embedding host when supported.
   - Use this for quick UI and build smoke testing.

2. Live Astro demo on Cloudflare
   - Deploy the demo fixture to a public Cloudflare URL.
   - Use `astro.demo.discussionbridge.dev` as the stable Astro demo hostname.
   - Use this as the real embed-host test target.

3. Live Astro/Starlight demo on Cloudflare
   - Deploy the Starlight docs demo fixture to a public Cloudflare URL.
   - Use `astrostarlight.demo.discussionbridge.dev` as the stable Astro/Starlight demo hostname.
   - Use this as the real docs-site embed-host test target.

4. Live Discourse category for Astro
   - Use `forum.discussionbridge.dev` as the Discourse host.
   - Use the public `Discussion Bridge for Astro` category at `https://forum.discussionbridge.dev/c/alpha/5` for test/demo topics.
   - Use Discourse category ID `5` for `publish-new` tests.
   - Use tags for product and demo details, for example `discussionbridge`, `astro`, `starlight-demo`, and `cloudflare-demo`.
   - Current forum tag settings for Alpha testing: max tags per topic `6`, max tag length `30`.
   - Current key set includes global publishing, global diagnostics, and granular publishing candidate keys for the `discussbridge-bot` user.
   - Longer term, retire the global publishing key after the granular publishing key proves it can create topics/posts in Alpha, read existing topics/posts, update the managed first post for linked companion topics, update topic metadata/tags, and unlist demo/test topics.
   - Use the two-key model when granular diagnostics/read scopes are available or confirmed: granular publishing key for normal sync, diagnostics key for setup checks.
   - Current fallback: global/admin-capable diagnostics key for setup checks; granular publishing key where it can perform create/update/tag/read actions.
   - Use `check-discourse` as the read-only lane readiness check before live publishing. It reads `/site/settings.json` for client-visible authoring limits, `/site.json` for user-specific tag capabilities such as `can_tag_topics` and `can_create_tag`, `/categories.json` for the configured category, and `/tags.json` for requested tag inventory. Current granular publishing key returns `403` for some site-level endpoints, so diagnostics may need a global key or explicit configured limits.
   - Topic visibility and retitling replied topics require a Discourse user with enough topic-management authority.
   - Enable embedding for localhost preview, `demo.discussionbridge.dev`, `astro.demo.discussionbridge.dev`, and `astrostarlight.demo.discussionbridge.dev`.
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
- Topic title/category/tag metadata sync is part of the managed companion-topic path, subject to Discourse permissions.

## Bridge Contract Test Matrix

- Astro title changes after publish: `sync-existing` should update the managed first post content; topic-title updates may require moderator/staff authority once a topic has replies.
- Discourse topic title changes after publish: Astro rendering should keep working because `discourseTopicId` is durable. Stored topic URLs may become cosmetically stale, but Discourse should redirect old slugs for the same topic ID.
- Discourse first post deleted: sync should fail clearly with a managed-first-post missing error. Do not silently create replacement content.
- Discourse topic deleted: render and sync paths should fail or degrade clearly for the linked page. Any repair/recreate command should be explicit, not automatic.
- Discourse instance offline: `simple` and `fullInteractive` should still render host-page markup; `full` server-rendered replies show a temporary unavailable state without breaking the article shell; page-load refresh remains best-effort; publish/sync commands fail with a clear network error.
- Active discussion target mismatch: pages marked with `discussionTarget` should be skipped unless the active target matches, preventing accidental sync to the wrong Discourse instance.
- Missing active discussion target: pages marked with `discussionTarget` should tell the user which `--target` to rerun with.
- Same Astro site with multiple future Discourse targets: keep as a compatibility test for future namespaced targets, not current Tier 1 behavior.

## Maintenance Test Process

Use maintenance syncs as explicit tests, not one-off commands. Before syncing existing live topics, confirm the local demo package is current by checking the installed CLI output or searching the installed package for the expected companion-body text. Then run a lane dry run with `--details`, inspect the computed title, page URL, topic ID, output status, and reason text, run the live sync, and verify both Discourse and Astro. Use `--force` when the maintenance intent is to rewrite first posts even though page source hashes are unchanged, such as after changing the companion topic template.

When testing live deployed Astro behavior, run sync from the canonical demo source for the deployed site. For Discussion Bridge for Astro demos, that source should live under `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\examples\...`. Transitional deploy copies under `discussionbridge.dev` should be treated as deployment artifacts or cleanup candidates, not as long-term source of truth.

Blog lane smoke test:

```powershell
npx astro-discussion-bridge sync-existing src/content/blog `
  --route-base blog `
  --discourse-url https://forum.discussionbridge.dev `
  --site-url https://astrostarlight.demo.discussionbridge.dev `
  --category-id 5 `
  --tags discussionbridge,starlight-demo,blog `
  --force `
  --dry-run `
  --details
```

If the dry run is correct, rerun the same command without `--dry-run`. The live CLI output should identify whether it rewrote the first post, updated topic metadata, updated topic tags, changed listing status, or found unchanged metadata. Verify the Discourse first post starts with reader-facing content, includes a source article link near the bottom, and does not show implementation labels such as `This is a companion discussion topic for:` or `Source content:`.

Because the demo runs behind Cloudflare/CDN caching, include cache state in maintenance verification. If Discourse or Astro still appears to show stale content after a confirmed live sync or deployment, clear the relevant Cloudflare cache or test with a cache-bypassing request before treating the sync as failed.

## Alpha Public Demo Domains

Use `demo.discussionbridge.dev` as the public demo hub, then put each runnable demo under that lane:

- `demo.discussionbridge.dev` for the demo index/chooser.
- `astro.demo.discussionbridge.dev` for the plain Astro/core demo.
- `astrostarlight.demo.discussionbridge.dev` for the Astro + Starlight demo.
- `stockstarlight.demo.discussionbridge.dev` for a clean stock Starlight control site.
- Future integration lanes should follow the same pattern, such as `statamic.demo.discussionbridge.dev` and a more specific Statamic demo host when needed.

Older internal/test hostnames such as `astrodemo.discussionbridge.dev`, `astro.discussionbridge.dev`, `astrostarlight.discussionbridge.dev`, and `astrostarlightdemo.discussionbridge.dev` should be treated as transitional test artifacts, redirects, or retired names, not the public Alpha naming pattern.

As part of the Alpha gate, verify each public demo hostname, Discourse embed host setting, companion topic URL, Cloudflare Pages project, and docs link uses the public hostname rather than a transitional test hostname.

Cloudflare Pages projects for public package demos should normally build from `DiscussionBridge/astro-discussion-bridge` with the appropriate example root directory, such as `examples/astro-demo` or `examples/starlight-demo`. `DiscussionBridge/discussionbridge.dev` should point to those demos from the product site rather than owning their implementation source.

## Demo Topic Lifecycle

Existing demo/build/test topics in Discourse should be handled deliberately:

- Use the `historical-reference` tag for old demo topics that are still useful as evidence, build history, or comparison material.
- Use unlisting when a topic should remain reachable by direct link or embed but should not appear in normal category discovery.
- Do not use `deprecated` for ordinary old demo topics; reserve it for user-facing features, docs, commands, or behaviors that have been superseded.
- Delete or permanently delete only when a topic is truly accidental, misleading beyond repair, sensitive, unsafe, spammy, or legally/operationally inappropriate to retain.
- Avoid SQL-level permanent deletion for routine demo cleanup. Use normal Discourse moderation tools unless there is a specific operations reason.

Default Alpha policy: preserve useful test history with `historical-reference` plus optional unlisting. Going forward, apply `historical-reference` as soon as a demo/build/test topic stops being current, needed, useful, or becomes generally unwanted in normal discovery.

Current cleanup pass completed:

- Tagged old/transitional demo topics `20`, `21`, `24`, and `28` as `historical-reference`.
- Leave current public demo topics `27`, `33`, and `34` untagged as historical for now.

```powershell
$env:DISCOURSE_URL="https://forum.discussionbridge.dev"
$env:DISCOURSE_POST_AS="discussbridge-bot"
$env:DISCOURSE_API_KEY="..."
node scripts/tag-discourse-topics.mjs --tag historical-reference 20 21 24 28 --dry-run
node scripts/tag-discourse-topics.mjs --tag historical-reference 20 21 24 28
```

## Live Publish Checkpoints

- 2026-07-16: Starlight demo published companion topics to the public Discussion Bridge for Astro category.
  - `existing-md-page.md`: https://forum.discussionbridge.dev/t/existing-md-page/20
  - `index.md`: https://forum.discussionbridge.dev/t/discussionbridge-starlight-demo/21
  - Post as / request actor: `discussbridge-bot`
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
  - Product note: embedded Discourse topics can exist before CLI publishing. The package now reconciles existing-topic collisions through `/embed/info?embed_url=...` and exact URL search fallback. Live temporary-file test against topic 24 succeeded with the global publishing key; the current granular publishing key could not read `/embed/info` or search, so minimal granular scopes still need confirmation.
- 2026-07-19: Plain Astro demo created locally and published companion topic 34.
  - Source route: `examples/astro-demo/src/content/blog/core-astro-bridge.md`
  - Intended public URL: `https://astro.demo.discussionbridge.dev/blog/core-astro-bridge/`
  - Companion topic: https://forum.discussionbridge.dev/t/core-astro-discussion-bridge-demo/34
  - The page renders Astro content tags as site/template metadata and publishes Discourse tags through CLI/lane config.
- 2026-07-19: Stock Starlight control site added at `examples/stock-starlight`.
  - Intended public URL: `https://stockstarlight.demo.discussionbridge.dev/`
  - `npm install` completed with 0 vulnerabilities.
  - `npm run build` completed.
  - The clean stock control still emitted `Entry docs -> 404 was not found`, so that warning is not caused by Discussion Bridge wiring.
  - Investigation found the likely source in `@astrojs/starlight/utils/routing/data.ts`: Starlight's generated 404 route calls `getEntry('docs', '404')` to check for an optional user 404 entry. When no `src/content/docs/404.md` exists, Astro logs the missing entry even though Starlight falls back correctly.
  - `disable404Route: true` removes the warning, confirming it is tied to the injected Starlight 404 route.
  - Adding `src/content/docs/404.md` removes the missing-entry warning but creates a route conflict warning because the docs catch-all also tries to render `/404`, so that is not a clean workaround.
  - TODO: Prepare and file a Starlight GitHub issue with the stock-control reproduction and likely source. Exact open-issue search for `Entry docs -> 404 was not found` found no existing report.

## Notes

Coding Horror is useful as a public reference, but it cannot be used for embedded localhost testing because its Discourse instance does not authorize our local/demo host.

When testing `fullInteractive`, confirm Discourse admin has `Embed full app` enabled. If the Astro page sends `fullApp: true` but Discourse still serves the legacy embed comments view, links may open Discourse directly instead of behaving like the full embedded app. For the current demo, use these Discourse embedding settings: full app yes, full app sign-in flow yes, suppress third-party analytics in embed yes, support markdown yes, set canonical URL yes, unlisted yes, any origin no, topics list no, and allowed embed selectors empty/default.

`fullInteractive` uses Discourse's own fixed composer/sign-in surface inside the iframe. In the current Astro demo, the article is short enough that the comments iframe is fully visible in the viewport, so the logged-in editor or logged-out sign-in button is immediately visible at the bottom of the embed. Compare against the Discourse blog full-app embed reference, where enough article content pushes the comment section lower on the page and the composer is not seen until the reader reaches the comments area. Add a longer article-body test page before judging whether composer placement needs theme or sizing work.

After browser-heavy inspection, local Astro builds can hit Node out-of-memory failures from workstation memory pressure. Close extra browser tabs and retry the build before treating the failure as a code defect.
## Domain Strategy

Reusable pattern:

```text
C:\CodeProjects\Planning\Procedure Docs\standards\product-demo-domain-pattern.md
```

- `discussionbridge.dev` is the primary product/docs domain.
- `discussionbridge.com` redirects to `discussionbridge.dev`.
- `demo.discussionbridge.dev` hosts the public demo index/chooser.
- `astro.demo.discussionbridge.dev` hosts the live plain Astro/core demo.
- `astrostarlight.demo.discussionbridge.dev` hosts the live Astro/Starlight demo.
- `stockstarlight.demo.discussionbridge.dev` hosts the clean stock Starlight control.
- `forum.discussionbridge.dev` hosts the Discourse instance.
- Discussion Bridge is the umbrella product family.
- Discussion Bridge for Astro is this Astro/Starlight integration and demo lane.
- Future integration lanes can use parallel names such as Discussion Bridge for Statamic.
- Public demo hostnames should sit under the demo lane, then start with the integration family: `astro.demo`, `astrostarlight.demo`, `statamic.demo`, `statamicsomething.demo`.
- Tags should carry product, integration, demo, and provider details such as `discussionbridge`, `astro`, `astro-demo`, `starlight-demo`, `cloudflare-demo`.



