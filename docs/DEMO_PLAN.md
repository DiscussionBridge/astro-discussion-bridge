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
- Demo/test companion topics can be unlisted to keep category discovery clean while preserving direct links and embeds.
- Topic title/category metadata sync is part of the managed companion-topic path, subject to Discourse permissions.

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

## Notes

Coding Horror is useful as a public reference, but it cannot be used for embedded localhost testing because its Discourse instance does not authorize our local/demo host.
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



