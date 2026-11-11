# DiscussionBridge for Astro and Starlight

DiscussionBridge for Astro works with plain Astro and Astro with Starlight.
It publishes eligible native articles to Discourse, materializes authorized
Discourse content as native pages, and displays discussions.

**V4 Alpha source:** [`v0.4.0-alpha.1.astro.3`](https://github.com/DiscussionBridge/astro-discussion-bridge/tree/v0.4.0-alpha.1.astro.3) · [GitHub Actions](https://github.com/DiscussionBridge/astro-discussion-bridge/actions/runs/43107201438)

The adapter uses the [V4 R7 contract](https://github.com/DiscussionBridge/discussionbridge-adapter-contract/tree/09d77c0209835c2d996aad294d161f167c7bd838). See the
[setup and native publication guide](packages/astro-discussion-bridge/docs/NATIVE_V4.md)
for configuration, lifecycle commands, and local limitations.

## Ordinary development and package checks

From `packages/astro-discussion-bridge`, run `npm ci --ignore-scripts`,
`node scripts/refresh-contract.mjs --check`, `npm run build:browser`, and
`npm test`. The test command creates one ordinary saved npm archive and supplies
that exact archive to the native package-consumer tests. `npm run test:package`
runs the original package-consumer case alone with the same setup. TypeScript
and native framework dependencies resolve from this package's own lockfile,
not an absolute developer cache or ignored `.tools` aliases.

The maintainer-only offline refresh is
`node scripts/refresh-contract.mjs --source PATH_TO_SHARED_SOURCE`. It verifies
the pinned artifact identity, ownership and every output destination before
copying; ordinary customer installation does not run it or fetch a protocol.
The private provenance separates seven shipped runtime/descriptor/license
members from the three fixed development fixtures. The browser build stages
outputs and actual dependency permission notices before writes; unknown or
edited notice files are preserved. No CDN or new customer build hook is added.

The native development fixture uses Astro 7.3.8 and pins Satteri 0.11.6 for
development tests. The adapter's peer dependency range is defined by the
[package manifest](packages/astro-discussion-bridge/package.json).
