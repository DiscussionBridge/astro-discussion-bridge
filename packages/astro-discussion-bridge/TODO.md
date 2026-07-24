# TODO

Use this as the working roadmap for Discussion Bridge for Astro. Keep the operating loop in view:

publish -> sync -> diagnose -> maintain -> recover -> document

## Alpha Readiness

Goal: make Tier 1 excellent enough that a real Astro/Starlight user can install it, connect one Discourse instance, publish/sync companion topics, diagnose setup problems, and recover from common mistakes without us hand-holding every step.

Release rule: Alpha, Beta, release candidates, patches, and Current releases do
not ship on code completion alone. The Human and Machine Manuals must be ready
for the exact release, Product Boss documentation sign-off must be recorded,
and separate Product Boss release approval must be recorded. Documentation
sign-off confirms the docs match the release; release approval confirms the
product release is coherent across intended scope, operator readiness, known
limitations, and its documentation package. Neither replaces Bridge Boss
technical verification or Manual Boss quality review.

Product Boss release approval requires a recorded Code Boss pass/fail result
against the exact release candidate. A failed, unresolved, or edit-pending
review blocks approval. Complete blocking edits and record re-review where
required, then confirm Bridge Boss technical verification and Manual Boss
quality review before Product Boss approval.

### Brutal Current Split

#### Phil/Ops Prerequisites Before Alpha Can Be Public

- Reconfigure Discussion Bridge Cloudflare under the new ownership/account plan: owning account, admin email, DNS, Pages, redirects, Access, Workers, billing boundary, and operator roles.
- Complete Cloudflare Pages work for `docs.discussionbridge.dev`: create/configure the Pages project for `sites/docs`, attach the custom domain, confirm the live production deploy, and verify the raw Pages hostname redirects to the custom domain.
- Create live Discourse Alpha Support category.
- Route `alphasupport@discussionbridge.dev` into Discourse.
- Confirm final public support links after the live support category and email route exist.

#### Codex/Product Work That Can Continue Now

- Tightened CLI/help text and friendly validation messages.
- Built the paired Human Manual and Machine Manual and included them in the generated Starlight docs site.
- Route the paired manuals through Manual Boss review and resolve Alpha-blocking consistency, presentation, secret-safety, usability, accessibility, placeholder, and public/private-boundary findings before public release.
- Add or confirm `check-discourse` examples for global diagnostics key, granular publishing key, and explicit configured limits.
- Finish docs link wiring once Phil/Ops prerequisites produce final URLs.
- Prepare the repeatable live smoke-pass script/checklist so it is ready when Cloudflare/support wiring is done.
- Keep polishing sync/recovery documentation without adding major feature scope.

### Publish

- Confirmed final CLI command names and help output are clear: `publish-new`, `sync-existing`, `publish-and-sync`, `discover-imports`, `import-existing`, and `check-discourse`.
- Decide whether to add a configurable topic title template or prefix, such as `Discussion: {title}`, for sites with short page titles.
- Keep local preflight validation available for dry runs and unauthenticated checks.
- Confirmed title/body/tag preflight messages are friendly enough for non-package authors.
- Confirm generated first-post body is reader-facing and does not expose implementation labels.
- Finalized the public Alpha support channel model in `docs/SUPPORT_AND_FEEDBACK.md`: GitHub Issues for formal product work, GitHub Discussions for repo-bound design/implementation discussion, Discourse Alpha Support plus `alphasupport@discussionbridge.dev` for support discovery/community memory, and cross-links when support becomes tracked work.
- Create live Discourse Alpha Support category, route `alphasupport@discussionbridge.dev` into Discourse, and wire final channel links into README, package metadata, demo pages, and release notes. Phil/Ops owns the live category and email route; Codex owns final link wiring after those exist.
- Product docs URL decided: use `docs.discussionbridge.dev` with Starlight. Keep `discussionbridge.dev/docs` only as a redirect or fallback if needed.
- Deployed the Starlight docs site source into the repo under `sites/docs`, generated from repository `docs/*.md`.
- Reconfigure Discussion Bridge Cloudflare under the new ownership/account plan before Alpha: owning account, admin email, DNS, Pages, redirects, Access, Workers, billing boundary, and operator roles. Phil/Ops prerequisite.
- Complete Cloudflare Pages work for `docs.discussionbridge.dev`: create/configure the Pages project for `sites/docs`, attach the custom domain, confirm the live production deploy, and verify the raw Pages hostname redirects to the custom domain. Phil/Ops prerequisite.
- Make `discussionbridge.dev` live in a credible public form before showing Alpha outside the working circle.
- Added proper attribution, ownership, and licensing notes to docs where appropriate as an Alpha gate item. Treat this as a once-and-done pass unless ownership, dependencies, copied examples, or source material changes.

### Sync

- Expand tests around `sync-existing` and `publish-and-sync` edge cases before widening usage beyond the demo.
- Covered: Astro title changes, Discourse topic title drift, active discussion target mismatch handling, linked Discourse topic missing/unreadable, linked topic with no first post, Discourse client network failures, and publish-new offline failures.
- Add stronger MDX summary extraction for component-heavy pages.
- Keep `discussionSummary` as the supported curated summary override and document when to use it.
- Document and test the distinction between Astro/template content tags and Discourse `discussionTags`.
- Verify tag/category/title/listing sync behavior with current live bot keys one more time before Alpha.
- Define source modes for Discourse-to-Astro and Astro-to-Discourse workflows: `astro-managed`, `discourse-managed`, and `discourse-imported`. Do not let an imported or Discourse-managed page write back to Discourse unless the user explicitly promotes or changes the mode.

### Import

- Implemented the read-only `discover-imports` queue workflow with:
  - explicit topic or manifest for curated production imports, preserving caller-supplied order
  - category selector that discovers/lists available categories and accepts category ID or an unambiguous slug/name, including subcategories
  - next in the selected category, defaulting to oldest Discourse `created_at` first with topic ID as the stable tie-breaker
  - optional filters for tags, created-date range, open/closed status, and limit
  - optional oldest/newest ordering by Discourse `created_at`, or natural topic-title ordering for numbered source collections such as `Sec. 10102`, `Sec. 10103`, and `Sec. 10104`
- Enforced that discovery never sequences by `bumped_at`, last reply, or latest activity. Community discussion cannot reorder the publishing queue.
- Preview discovered candidates before import, exclude existing source/target topic links from local frontmatter, and optionally create a new non-overwriting strict v1 manifest.

- Keep `import-existing` safe by default: preserve topic ID and URL, write an editable Astro copy, and avoid automatic sync back to Discourse.
- Add optional imported-page hero placement with required non-empty alt text.
- Support both import paths:
  - import clean: prune known boilerplate blocks during import
  - import whole: bring the topic into Astro, then let a human edit it down in GitCMS or another editor
- Add pruning rules for common Discourse-topic boilerplate, such as AI/polish disclaimers, forum signup CTAs, and conversation prompts.
- Use `forum.repealobbba.org` topic 434 and `onebigbeautifulbill.us/title-i/10101-impact/` as a live coding-in-public demo once Alpha is close enough. The demo should show how a Discourse-origin topic can become a polished Astro page without losing the original discussion link.
- Add an explicit promote-source path before allowing a Discourse-imported page to become `astro-managed`.
- Use the Citizen Activist structured-document model to guide `discourse-managed` work: Discourse wiki topics can act as source material, Astro can publish the polished act/section page, and the public page should show source topic, status, last-edit context, and comments without accidental writeback.
- Model the OBBBA many-to-one topology before full many-to-many: `onebigbeautifulbill.us` / `OBBBA.us`, `repealobbba.org`, `repealobbbaact.us`, and possibly `repealobbbapledge.us` can all connect to `forum.repealobbba.org`, with source direction varying by site or lane.
- Test import layers sequentially: no image/no prune, image only, prune only, then image plus prune. Use required alt text for image-enabled imports.
- Use `repealobbbaact.us` as an Alpha end-stage package test: install/build from the package, prove Discourse-source structured sections, source-mode safety, comments rendering, and Cloudflare deployment without relying on copied prototype comments code.

### Diagnose

- Confirm the minimal Discourse granular scopes needed for existing-topic collision reconciliation. Live testing showed the current granular publishing key can hit create collisions but cannot read `/embed/info` or exact URL search, while the global publishing key can reconcile topic 24.
- When Discourse granular diagnostics/read scopes are available or confirmed, document and test the two-key model: granular publishing key for normal sync plus diagnostics key for setup checks.
- Until then, keep the fallback explicit: global/admin-capable diagnostics key for setup checks; granular publishing key where it can perform create/update/tag/read actions.
- Consider reading Discourse title/body/tag constraints from the target instance in `check-discourse`, while keeping explicit CLI/env limits for dry runs and restricted keys.
- Add `check-discourse` examples for global diagnostics key, granular publishing key, and explicit configured limits.
- Investigate whether a Discourse admin/bot API key can post or send messages as another Discourse user, what endpoint/scope enables it if supported, and whether that behavior is appropriate for Discussion Bridge. Potential future use case: one trusted configuration/control-plane bot publishing notices or dashboard/admin messages across multiple users, sites, channels, or client forums in a multisite/agency setup. Possible future config shape: `postAs: "username"` in site/lane config or `discussionPostAs: "username"` in frontmatter. If supported, CLI/check output should make the operating key user and effective posting user explicit.

### Maintain

- Keep the maintenance sync process documented as a repeatable test: confirm package version, dry-run with `--details`, live sync, verify Discourse, verify Astro, consider Cloudflare cache.
- Add or update npm scripts in the demo for lane-specific dry runs using `--details`.
- Decide whether `--details` should also apply to `import-existing` output.
- File the prepared upstream Starlight issue for the documented demo build warning: `Entry docs -> 404 was not found`.
- Keep the local package demo dependency pointed at the package directory unless a release-packaging test specifically needs a tarball.

### Recover

- Define the explicit repair path for a deleted Discourse topic linked from Astro.
- Define the explicit repair path for a deleted first post.
- Decide whether recovery belongs in a command such as `repair-link`, `relink-topic`, or an `import-existing --overwrite` workflow.
- Keep automatic recreate disabled unless the user explicitly chooses it; do not guess when ownership cannot be proven.
- Document when to clear Cloudflare cache versus when to treat a sync/deploy as failed.

### Document

- Added a concise Alpha setup guide: Discourse settings, bot user, keys, Astro install, category/tags, first dry run, first publish, first sync.
- Added a key-management guide: current fallback, future two-key model, key storage, key rotation, and why build logs must not reveal secrets.
- Added a comments-display guide covering `simple`, `full`, and `fullInteractive`.
- Added a content-lanes guide for docs, releases, blog, news, and future Starlog-style release notes.
- Added a discussion-safe Markdown guide for Astro content that will also render acceptably in Discourse.
- Added troubleshooting entries for title validation, body length, tag limits, duplicate embed URLs, stale Cloudflare cache, missing topic, missing first post, and Discourse offline.
- Finalized the support and feedback guide with the Alpha channel model.
- Update public support links after the Alpha Support category and email route are live.
- Completed one-time Alpha attribution/ownership/licensing pass across public docs.

## Alpha Demo Matrix

- Verify the local Starlight demo builds from `examples/starlight-demo`.
- Verify the live Starlight demo deploys from the deployed repo/content tree, not the package repo demo tree.
- Before Alpha and before each release candidate, run the repeatable live smoke pass. It covers docs, releases, blog, news, and comments demo routes; `simple`, `full`, and `fullInteractive` comments modes; forum category/tag/permission settings; and these full-app embed Discourse settings:
  - `Embed full app`: yes
  - `Embed full app signin flow`: yes
  - `Suppress third party analytics in embed`: yes
  - `Embed support markdown`: yes
  - `Embed set canonical URL`: yes
  - `Embed unlisted`: yes
  - `Embed any origin`: no unless specifically needed
  - `Embed topics list`: no unless specifically needed
- Test with Cloudflare CDN in place on Discourse and document that the bridge works with a CDN-backed forum.
- Verify topic creation so pages from different Astro hosts do not collide or create confusing duplicate topics.
- Confirm `embed_url` maps each Astro page to the correct companion topic across hosts.

## Upgrade And Release Process

- Maintain an Astro compatibility matrix for Astro 6 and 7. Treat Astro 5 as possible future legacy support only after explicit testing.
- Test demo installs after Astro core and official integration releases, especially `@astrojs/cloudflare`.
- Add a `doctor` or `check-upgrade` command that reports installed Astro, adapter, preset, provider, package version, and likely configuration issues.
- Document the recommended order: upgrade Astro official packages first, then verify Discussion Bridge.
- Keep Starlight optional so Astro core sites are not forced to install it.
- Before any Alpha tag/release, run package tests, local demo build, dry-run CLI checks, and at least one live smoke sync.
- Alpha release channel decided: use GitHub release plus repo-installable. Hold npm until late Beta, after the first support/docs loop survives real use.
- Confirm every release page, README, package metadata, and demo page points to the same support and feedback channels after the Alpha Support category and email route are live.

## Product Roadmap

### Tier 1: API-Only Bridge

- Keep Tier 1 generous and usable without a Discourse plugin.
- Support one Discourse target per page for Alpha.
- Keep one package, `astro-discussion-bridge`, with clear presets: `preset: "starlight"` for Starlight documentation sites and `preset: "astro"` for broader Astro content sites.
- Keep the Starlight preset focused on Starlight conventions unless there is a strong product reason to do otherwise.
- Preserve future multi-Discourse compatibility by avoiding hard-coded single-forum assumptions in names, helper APIs, and docs language where `discussion target` fits.
- Keep multiple content lanes first-class through config and frontmatter.
- Consider optional mapping from Astro/template content tags to Discourse topic tags. Keep it opt-in so a site's editorial taxonomy is not automatically forced into its forum taxonomy.
- Use the OBBBA implementation lane as a real-world Discourse-to-Astro proof path: import/prune a `forum.repealobbba.org` topic into `onebigbeautifulbill.us`, keep it `discourse-imported` until explicit promotion, and feed lessons back into Discussion Bridge.
- Preserve a path for community-authored legislation and structured-document sites where Discourse is the drafting/revision layer and Astro is the public presentation layer. First likely proof: `repealobbbaact.us`.
- Preserve many-to-one now and many-to-many later: multiple public sites may share one forum backbone, and future users may connect multiple sites to multiple forums by lane, region, chapter, language, audience, or campaign.
- Design a restrained, configurable comments-boundary credit. Candidate wording is `Discussion connection by Discussion Bridge` or `Discourse connection by Discussion Bridge`; final wording, default state, and configuration remain open. It must link to the canonical product page, remain visually secondary, be accessible in every comments mode, and come from package configuration rather than site content.
- Add one or two clearly labeled `onebigbeautifulbill.us` demo/credit pages targeting companion topics on `forum.discussionbridge.dev`. Use explicit per-page target selection, keep production OBBBA content on `forum.repealobbba.org`, and document the result as a bounded cross-forum topology proof—not full many-to-many support.

### Tier 2: Assisted Setup And Services

- Package the setup/diagnostics/docs workflow so community users can self-serve, while paid help can hand-hold setup, migration, and customization.
- Identify which support tasks are repeatable enough to become commands, docs, or templates.

### Tier 3: Optional Discourse Plugin

- Start a design note for an optional Discourse plugin as the Discourse-side control plane.
- Keep the API-only bridge useful without a plugin; the plugin should enhance, not replace, the package.
- Explore bridge-aware admin settings, content lane management, source mappings, duplicate detection, richer native notifications, health/status endpoints, and operations topics/categories.
- Explore whether the plugin/control-plane model should support trusted posting, notifications, or admin dashboard messages on behalf of configured users. Treat impersonation/delegated posting as high-trust and audit-sensitive, not a casual publishing default.
- Design the plugin surface so Astro, Statamic, and future adapters can use the same Discourse-side concepts.

## Future Frameworks And Platforms

- Use Discussion Bridge for Statamic as the next parallel naming/integration lane when that work begins.
- Research future Discourse integrations for Next.js, Nuxt, SvelteKit, Hugo/static sites, and Cloudflare Workers.
- Design metadata so Discourse-specific fields can coexist with generic discussion fields without breaking existing Discourse users.
- Define, but do not fully implement yet, the future shape for one Astro site connected to multiple Discourse instances. Use cases include public plus private communities, regional/language forums, internal staff plus public user forums, and central advocacy or industry organizations pushing canonical content into chapter or regional discussion communities.

## Dependency Audit

- Review the dependency advisories reported by `npm install --package-lock-only`.
- Run `npm audit` and identify which packages introduce the advisories.
- Prefer targeted dependency upgrades where possible.
- Avoid `npm audit fix --force` unless the breaking-change impact has been reviewed.
- Re-run `npm run check` and `npm run build` after any dependency changes.
