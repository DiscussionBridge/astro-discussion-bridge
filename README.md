# DiscussionBridge for Astro — V4 construction

Unpublished implementation `0.4.0-alpha.1`. This repo selectively retains native
Astro source rendering, safe files/state, comments and browser enhancement with
the exact single V4 development Contract packet. Release identity is null.

The packaged native source publisher, CMS static coordinator, explicit lifecycle
commands and local limitations are documented in
[NATIVE_V4.md](packages/astro-discussion-bridge/docs/NATIVE_V4.md).

The current carry/prune decisions, local checks and unresolved qualification are
in [V4_CARRY_FORWARD.md](docs/V4_CARRY_FORWARD.md). Historical inventory and prior
author evidence remain in the separately maintained Astro successor checkpoint.
They do not establish V4 installation, public delivery or release qualification.

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

This remains an unqualified development candidate. The locked native development
fixture uses Astro 7.3.8 with compatible Markdown dependencies; the adapter's
Astro peer range is unchanged. On the current Windows test host, a plain Astro
page with the retained 45,000 quotation marks still reproduces a native allocation
failure without DiscussionBridge. The ordinary package's original large-content
case passed on both Linux CI nodes with the preceding native dependency set.
The test has not been reduced or skipped. Current patched-package/CI qualification
and the Windows cause/fix remain open; passing source or browser checks do not
close them.
