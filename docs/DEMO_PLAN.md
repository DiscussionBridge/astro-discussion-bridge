# Demo Plan

## Goal

Develop in public with a visible path from local preview to a live Cloudflare demo backed by a real Discourse sandbox. DiscussionBridge is Discourse-first; the demo should prove an excellent Discourse integration across Astro, Starlight, and deployment targets.

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

4. Live Discourse Alpha category
   - Use `forum.discussionbridge.dev` as the Discourse host.
   - Use the public `Alpha` category at `https://forum.discussionbridge.dev/c/alpha/5` for test/demo topics.
   - Use Discourse category ID `5` for `publish-new` tests.
   - Use tags for product and demo details, for example `discussionbridge`, `starlight-demo`, and `cloudflare-demo`.
   - Create an API key scoped for topic/post creation in the Alpha category.
   - Enable embedding for localhost preview, `astrodemo.discussionbridge.dev`, and `astrostarlightdemo.discussionbridge.dev`.
   - Pre-integration backup checkpoint: `discussion-bridge-forum-2026-07-16-140054-v20260715090434.tar.gz`.

## Test Matrix

- Existing `.md` docs render `<Discussion />` through the Starlight layout override.
- `publish-new --dry-run` detects missing topics without requiring API credentials.
- `publish-new` creates one real Discourse companion topic in the Alpha category.
- The built Cloudflare demo page loads the native Discourse discussion UI.
- Logged-in Discourse users can interact with replies and likes in the embedded UI.
- Multiple Astro hosts can connect to `forum.discussionbridge.dev` without topic collisions, using the `Alpha` category plus tags/URLs for namespacing.

## Live Publish Checkpoints

- 2026-07-16: Starlight demo published companion topics to the public Alpha category.
  - `existing-md-page.md`: https://forum.discussionbridge.dev/t/existing-md-page/20
  - `index.md`: https://forum.discussionbridge.dev/t/discussionbridge-starlight-demo/21
  - API user: `discussbridge-bot`
  - Current key scope: global; replace with granular/category-scoped key when available.
- 2026-07-16: Starlight demo deployed to Cloudflare Pages and verified at https://astrostarlightdemo.discussionbridge.dev/.
  - Homepage returns `200` and links topic 21.
  - `/existing-md-page/` returns `200` and links topic 20.

## Notes

Coding Horror is useful as a public reference, but it cannot be used for embedded localhost testing because its Discourse instance does not authorize our local/demo host.
## Domain Strategy

- `discussionbridge.dev` is the primary product/docs domain.
- `discussionbridge.com` redirects to `discussionbridge.dev`.
- `astrodemo.discussionbridge.dev` hosts the live Astro demo.
- `astrostarlightdemo.discussionbridge.dev` hosts the live Astro/Starlight demo.
- `forum.discussionbridge.dev` hosts the Discourse instance.
- Discourse category names should describe purpose, not repeat the brand. Use `Alpha`, not `DiscussionBridge Alpha`.
- Tags should carry product, demo, and provider details such as `discussionbridge`, `starlight-demo`, `cloudflare-demo`.



