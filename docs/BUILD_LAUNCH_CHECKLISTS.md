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

### Sync

- [ ] Keep expanding `sync-existing` and `publish-and-sync` edge-case tests before widening usage beyond the demo.
- [x] Cover Astro title drift.
- [x] Cover Discourse topic title drift.
- [x] Cover active discussion target mismatch handling.
- [x] Cover linked Discourse topic missing/unreadable.
- [x] Cover linked topic with no first post.
- [x] Cover Discourse client network failures.
- [x] Cover publish-new offline failures.
- [ ] Add stronger MDX summary extraction for component-heavy pages.
- [ ] Document when to use `discussionSummary`.
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
- [x] Keep the local package demo dependency pointed at the package directory unless a release-packaging test specifically needs a tarball.

### Recover

- [ ] Define the explicit repair path for a deleted Discourse topic linked from Astro.
- [ ] Define the explicit repair path for a deleted first post.
- [ ] Decide whether recovery belongs in a command such as `repair-link`, `relink-topic`, or an `import-existing --overwrite` workflow.
- [x] Keep automatic recreate disabled unless the user explicitly chooses it.
- [ ] Document when to clear Cloudflare cache versus when to treat a sync/deploy as failed.

### Document

- [ ] Add a concise Alpha setup guide.
- [ ] Add a key-management guide.
- [ ] Add a comments-display guide covering `simple`, `full`, and `fullInteractive`.
- [ ] Add a content-lanes guide for docs, releases, blog, news, and Starlog-style release notes.
- [ ] Add a discussion-safe Markdown guide.
- [ ] Add troubleshooting entries for title validation, body length, tag limits, duplicate embed URLs, stale Cloudflare cache, missing topic, missing first post, and Discourse offline.

## Alpha Demo Checklist

- [x] Verify the local Starlight demo builds from `examples/starlight-demo`.
- [ ] Verify the live Starlight demo deploys from the deployed repo/content tree, not the package repo demo tree.
- [ ] Verify docs, releases, blog, news, and comments demo routes.
- [ ] Verify `simple`, `full`, and `fullInteractive` comments modes.
- [ ] Verify full-app embed Discourse settings.
- [ ] Verify `forum.discussionbridge.dev` category, tags, and permissions match the docs.
- [ ] Verify topic creation so pages from different Astro hosts do not collide or create confusing duplicate topics.
- [ ] Confirm `embed_url` maps each Astro page to the correct companion topic across hosts.

## Release/Upgrade Checklist

- [ ] Maintain an Astro compatibility matrix for Astro 6 and 7.
- [ ] Test demo installs after Astro core and official integration releases, especially `@astrojs/cloudflare`.
- [ ] Add a `doctor` or `check-upgrade` command.
- [ ] Document the recommended upgrade order.
- [ ] Keep Starlight optional.
- [ ] Before any Alpha tag/release, run package tests, local demo build, dry-run CLI checks, and at least one live smoke sync.
- [ ] Decide Alpha release channel: npm, GitHub release, or repo-installable.

## Product Roadmap Checklist

- [x] Keep Tier 1 API-only and useful without a Discourse plugin.
- [x] Support one Discourse target per page for Alpha.
- [x] Keep multiple content lanes first-class through config and frontmatter.
- [ ] Preserve future multi-Discourse compatibility in names, helper APIs, and docs language.
- [ ] Package the setup/diagnostics/docs workflow for self-serve users and paid assisted setup.
- [ ] Start a design note for an optional Discourse plugin as the Discourse-side control plane.
- [ ] Design future integration lanes for Statamic and other frameworks.
