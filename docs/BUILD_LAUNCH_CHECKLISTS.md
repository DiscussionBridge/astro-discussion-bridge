# Product Build/Launch Checklists

Use these checklists as the product dashboard for Discussion Bridge for Astro. They are organized around the operating loop:

publish -> sync -> diagnose -> maintain -> recover -> document

## Alpha Readiness Checklist

### Publish

- [ ] Confirm CLI names/help are clear: `publish-new`, `sync-existing`, `publish-and-sync`, `import-existing`, and `check-discourse`.
- [ ] Decide whether to add a configurable topic title template or prefix, such as `Discussion: {title}`, for sites with short Astro titles.
- [ ] Keep local preflight validation working for dry runs and restricted keys.
- [ ] Confirm title/body/tag preflight messages are friendly enough for non-package authors.
- [ ] Confirm generated first-post body is reader-facing and does not expose implementation labels.
- [ ] Finalize Alpha support and feedback channels.
- [ ] Decide product docs URL: `docs.discussionbridge.dev` or `discussionbridge.dev/docs`.
- [ ] Make `discussionbridge.dev` live in a credible public form before showing Alpha outside the working circle.
- [x] Add proper attribution, ownership, and licensing notes to docs where appropriate.

### Sync

- [ ] Keep expanding `sync-existing` and `publish-and-sync` edge-case tests before widening usage beyond the demo.
- [x] Cover Astro title drift.
- [x] Cover Discourse topic title drift.
- [x] Cover active discussion target mismatch handling.
- [x] Cover linked Discourse topic missing/unreadable.
- [x] Cover linked topic with no first post.
- [x] Cover Discourse client network failures.
- [x] Cover publish-new offline failures.
- [x] Block duplicate managed topic IDs or duplicate page URLs before Discourse writes.
- [ ] Add stronger MDX summary extraction for component-heavy pages.
- [ ] Document when to use `discussionSummary`.
- [ ] Document and test the distinction between Astro/template content tags and Discourse `discussionTags`.
- [ ] Verify tag/category/title/listing sync behavior with current live bot keys one more time before Alpha.

### Diagnose

- [ ] Confirm minimal Discourse granular scopes needed for existing-topic collision reconciliation.
- [ ] Use the two-key model when granular diagnostics/read scopes are available or confirmed.
- [x] Document current fallback: global/admin-capable diagnostics key for setup checks; granular publishing key where it can perform create/update/tag/read actions.
- [ ] Add `check-discourse` examples for global diagnostics key, granular publishing key, and explicit configured limits.
- [ ] Consider reading Discourse title/body/tag constraints from the target instance in `check-discourse`.

### Maintain

- [x] Document maintenance sync as a repeatable test: package version, `--dry-run --details`, live sync, verify Discourse/Astro/cache.
- [ ] Add or update demo npm scripts for lane-specific dry runs using `--details`.
- [ ] Decide whether `--details` should also apply to `import-existing` output.
- [ ] Resolve or document the demo build warning: `Entry docs -> 404 was not found`.
- [ ] Prepare and file a Starlight GitHub issue for the stock Starlight `Entry docs -> 404 was not found` finding; include the likely `getEntry('docs', '404')` source, `disable404Route: true` confirmation, and custom `docs/404.md` route-conflict result.
- [x] Keep the local package demo dependency pointed at the package directory unless a release-packaging test specifically needs a tarball.

### Recover

- [ ] Define the explicit repair path for a deleted Discourse topic linked from Astro.
- [ ] Define the explicit repair path for a deleted first post.
- [ ] Decide whether recovery belongs in a command such as `repair-link`, `relink-topic`, or an `import-existing --overwrite` workflow.
- [x] Keep automatic recreate disabled unless the user explicitly chooses it.
- [ ] Document when to clear Cloudflare cache versus when to treat a sync/deploy as failed.

### Document

- [x] Add a concise Alpha setup guide.
- [x] Add a key-management guide.
- [x] Add a comments-display guide covering `simple`, `full`, and `fullInteractive`.
- [x] Add a content-lanes guide for docs, releases, blog, news, and Starlog-style release notes.
- [x] Add a discussion-safe Markdown guide.
- [x] Add troubleshooting entries for title validation, body length, tag limits, duplicate embed URLs, stale Cloudflare cache, missing topic, missing first post, and Discourse offline.
- [ ] Finalize support and feedback guide after exact channels are chosen.
- [x] Complete one-time Alpha attribution/ownership/licensing pass across public docs.

## Alpha Demo Checklist

- [x] Verify the local Starlight demo builds from `examples/starlight-demo`.
- [ ] Verify live Astro and Starlight demos deploy from the canonical `astro-discussion-bridge` example source trees.
- [ ] Verify docs, releases, blog, news, and comments demo routes.
- [ ] Verify `simple`, `full`, and `fullInteractive` comments modes.
- [ ] Verify full-app embed Discourse settings.
- [ ] Verify `forum.discussionbridge.dev` category, tags, and permissions match the docs.
- [ ] Test with Cloudflare CDN in place on Discourse and document that the bridge works with a CDN-backed forum.
- [ ] Verify topic creation so pages from different Astro hosts do not collide or create confusing duplicate topics.
- [ ] Confirm `embed_url` maps each Astro page to the correct companion topic across hosts.
- [ ] Verify public Alpha demo domains use the demo-lane pattern: `demo.discussionbridge.dev`, `astro.demo.discussionbridge.dev`, `astrostarlight.demo.discussionbridge.dev`, `stockstarlight.demo.discussionbridge.dev`, and future parallel integration hosts.
- [x] Add and build clean stock Starlight control site to compare framework warnings and upgrades.
- [x] Apply demo topic lifecycle policy in Discourse: tagged old/transitional topics `20`, `21`, `24`, and `28` as `historical-reference`; reserve deletion/permanent deletion for true mistakes or sensitive/unsafe content.
- [ ] Retire or clearly mark transitional demo deploy copies under `discussionbridge.dev` after public demo projects build from `astro-discussion-bridge`.

## Release/Upgrade Checklist

- [ ] Maintain an Astro compatibility matrix for Astro 6 and 7.
- [ ] Test demo installs after Astro core and official integration releases, especially `@astrojs/cloudflare`.
- [ ] Add a `doctor` or `check-upgrade` command.
- [ ] Document the recommended upgrade order.
- [ ] Keep Starlight optional.
- [ ] Before any Alpha tag/release, run package tests, local demo build, dry-run CLI checks, and at least one live smoke sync.
- [ ] Decide Alpha release channel: npm, GitHub release, or repo-installable.
- [ ] Confirm release pages, README, package metadata, and demo pages point to the same support and feedback channels.

## Product Roadmap Checklist

- [x] Keep Tier 1 API-only and useful without a Discourse plugin.
- [x] Support one Discourse target per page for Alpha.
- [x] Keep multiple content lanes first-class through config and frontmatter.
- [x] Keep one package with two clear presets: `starlight` and `astro`.
- [x] Keep the Starlight preset focused on Starlight conventions.
- [ ] Preserve future multi-Discourse compatibility in names, helper APIs, and docs language.
- [ ] Consider optional mapping from Astro/template content tags to Discourse topic tags.
- [ ] Package the setup/diagnostics/docs workflow for self-serve users and paid assisted setup.
- [ ] Start a design note for an optional Discourse plugin as the Discourse-side control plane.
- [ ] Investigate Discourse API/plugin support for delegated posting or notifications as configured users in multisite/multichannel agency scenarios, including possible `postAs` or `discussionPostAs` configuration.
- [ ] Design future integration lanes for Statamic and other frameworks.
