# Discourse Field Notes

This is a living list of Discourse issues, feature needs, wishlist items, shortcomings, and real-world examples discovered while building and testing Discussion Bridge for Astro.

## Real-World Test Context

- Forum: `https://forum.discussionbridge.dev`
- Astro/Starlight demo: `https://astrostarlightdemo.discussionbridge.dev`
- Primary category: `Discussion Bridge for Astro`, category ID `5`
- Bot user: `discussbridge-bot`
- Current key model under test:
  - global publishing key
  - global diagnostics key
  - granular publishing candidate key

## Confirmed Useful Discourse Capabilities

- Discourse can serve as the durable discussion layer for static Astro/Starlight pages.
- Topic IDs remain durable when topic titles/slugs change.
- The API can create topics, update first posts, update topic metadata, update tags, and toggle listing status when the API user has enough authority.
- Discourse PMs can be used for bridge failure notifications, letting the bridge use Discourse's native notification/email behavior.
- Full-app embeds can provide logged-in reply/like/edit behavior inside an Astro page when Discourse embed settings are configured correctly.
- Discourse edit history is very useful for verifying sync behavior because first-post changes show up clearly.

## Issues And Shortcomings Found

- Granular API keys may be able to publish/update topics but still fail on site-level or discovery endpoints needed for diagnostics and reconciliation.
- Current granular publishing key could read `/categories.json` and `/tags.json`, but could not read `/site/settings.json`, `/site.json`, `/embed/info`, or exact URL search.
- `/embed/info?embed_url=...` can return `404` even when Discourse topic creation rejects the same URL as already taken.
- Existing-topic collisions may surface as `Embed url has already been taken` or `Title has already been used`, depending on Discourse validation order.
- A topic created by Discourse embedding before CLI publishing can block `publish-new` unless the bridge can reconcile the existing topic.
- Topic title updates may require moderator/staff authority after replies exist.
- Discourse's API errors are accurate but not always enough by themselves to tell a site author what to fix.
- Astro/Starlight-specific rendering features do not automatically translate into Discourse Markdown rendering.

## Feature Needs

- A reliable way for an API integration to resolve the topic that owns a given `embed_url`.
- Granular API scopes for read-only site metadata needed by setup tools:
  - client-visible authoring limits
  - tag capabilities for the API user
  - category lookup
  - tag lookup
  - embed URL ownership lookup
  - exact URL search or equivalent reconciliation lookup
- `check-discourse --page-url URL` now probes reconciliation readiness directly by checking `/embed/info` and exact URL search with the configured key.
- Clear Discourse-side documentation for which endpoints are accessible to granular keys and which scopes unlock them.
- A bridge-friendly diagnostics story that does not require making the runtime publishing key global/admin if the site operator wants least privilege.
- Better machine-readable distinction between duplicate title collisions and embed URL ownership collisions.

## Wishlist

- A first-class API endpoint for `GET topic by embed_url`.
- A read-only granular scope for public/client site settings and user-specific capabilities.
- A read-only granular scope for exact URL ownership/reconciliation.
- A Discourse plugin or official extension point that can expose bridge-aware health checks:
  - required settings
  - allowed hosts
  - category/tag permissions
  - embed mode status
  - topic ownership by source URL
- A Discourse-side bridge control plane for future Layer 3 work:
  - source mappings
  - content lanes
  - duplicate detection
  - richer notifications
  - operations topics/categories
  - CMS/framework integration registry

## Product Implications

- Tier 1 should stay API-only and useful without a Discourse plugin.
- Tier 1 should document a practical two-key model:
  - granular or restricted publishing key for normal runtime sync where possible
  - broader diagnostics key for setup checks and reconciliation when granular scopes are insufficient
- Use the two-key model when granular diagnostics/read scopes are available or confirmed.
- Current fallback: global/admin-capable diagnostics key for setup checks; granular publishing key where it can perform create/update/tag/read actions.
- `check-discourse` is important because it turns hidden forum configuration into visible setup feedback before publishing.
- Existing-topic reconciliation is necessary in the real world because Discourse embeds can create topics before CLI publishing runs.
- The bridge should keep failing clearly when it cannot prove the owning topic. Guessing would be worse than stopping.

## Real Examples From Testing

- Topic 24 was created/claimed by Discourse embedding before CLI publishing.
- `publish-and-sync` initially failed with `Embed url has already been taken`.
- `/embed/info?embed_url=https://astrostarlightdemo.discussionbridge.dev/releases/2_1/` returned `404` on the live forum.
- Exact URL search found topic 24 for `https://astrostarlightdemo.discussionbridge.dev/releases/2_1/`.
- Global publishing key successfully reconciled topic 24.
- Granular publishing key failed reconciliation because it could not read `/embed/info` or search, even though it could read categories and tags.
- `check-discourse --page-url https://astrostarlightdemo.discussionbridge.dev/releases/2_1/` now reports the same distinction directly: global key resolves topic 24 by search fallback; current granular publishing key reports reconciliation lookup as unavailable.
- Topic 27 proved live title/tag/first-post sync behavior for the blog lane.
- Full-app embed behavior required Discourse settings:
  - `Embed full app`: yes
  - `Embed full app signin flow`: yes
  - `Suppress third party analytics in embed`: yes
  - `Embed support markdown`: yes
  - `Embed set canonical URL`: yes
  - `Embed unlisted`: yes

## Possible Meta/Feature Request Topics

- Granular API scope for client-visible site settings and user capability checks.
- Granular API scope for embed URL ownership lookup.
- Clarify expected behavior of `/embed/info` when topic creation says an embed URL is already taken.
- Provide a supported endpoint for resolving a topic by source/embed URL.
- Document recommended API permissions for external publishing/comment integrations.
