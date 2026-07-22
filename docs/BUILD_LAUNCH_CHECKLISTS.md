# Product Build/Launch Checklists

Use these checklists as the product dashboard for Discussion Bridge for Astro. They are organized around the operating loop:

publish -> sync -> diagnose -> maintain -> recover -> document

## Alpha Readiness Checklist

### Release-Scope Doctrine

- [x] Treat this dashboard/checklist as the cumulative Alpha scope source of
      truth; new plugin or multi-target gates do not displace prior accepted
      items, and items remain until Phil explicitly removes them.
- [x] Treat Alpha as nearly feature-complete for the declared product promise;
      include known central capabilities or narrow the promise honestly.
- [x] Treat Beta primarily as refinement of exercised behavior: usability,
      compatibility, reliability, performance, packaging, docs, installation,
      recovery, support, and presentation.
- [x] Keep long-term roadmap, plugin expansion, and Layer 3 ideas outside Alpha
      when they are not part of the declared product promise.
- [x] Allow Beta feedback to reveal genuinely missing capability without using
      planned feature deferral as the default Beta strategy.

### Brutal Current Split

#### Phil/Ops Prerequisites Before Alpha Can Be Public

- [ ] Reconfigure Discussion Bridge Cloudflare under the new ownership/account plan: owning account, admin email, DNS, Pages, redirects, Access, Workers, billing boundary, and operator roles.
- [ ] Complete Cloudflare Pages work for `docs.discussionbridge.dev`: create/configure the Pages project for `sites/docs`, attach the custom domain, confirm the live production deploy, and verify the raw Pages hostname redirects to the custom domain.
- [ ] Create live Discourse Alpha Support category.
- [ ] Route `alphasupport@discussionbridge.dev` into Discourse.
- [ ] Confirm final public support links after the live support category and email route exist.

#### Codex/Product Work That Can Continue Now

- [x] Tighten CLI/help text and friendly validation messages.
- [x] Build and publish the paired Human Manual and Machine Manual in the repository and generated Starlight docs site.
- [ ] Route the paired manuals through Manual Boss review for consistency, presentation, secrets, usability, accessibility, screenshot/video placeholders, and public/private boundaries; resolve Alpha-blocking findings before public release.
- [ ] Add or confirm `check-discourse` examples for global diagnostics key, granular publishing key, and explicit configured limits.
- [ ] Finish docs link wiring once Phil/Ops prerequisites produce final URLs.
- [ ] Prepare the repeatable live smoke-pass script/checklist so it is ready when Cloudflare/support wiring is done.
- [ ] Keep polishing sync/recovery documentation without adding major feature scope.

### Publish

- [x] Confirm CLI names/help are clear: `publish-new`, `sync-existing`, `publish-and-sync`, `import-existing`, and `check-discourse`.
- [ ] Decide whether to add a configurable topic title template or prefix, such as `Discussion: {title}`, for sites with short Astro titles.
- [ ] Keep local preflight validation working for dry runs and restricted keys.
- [x] Confirm title/body/tag preflight messages are friendly enough for non-package authors.
- [ ] Confirm generated first-post body is reader-facing and does not expose implementation labels.
- [x] Finalize Alpha support and feedback channel model: GitHub Issues for formal product work, GitHub Discussions for repo-bound design/implementation discussion, Discourse Alpha Support plus `alphasupport@discussionbridge.dev` for support discovery/community memory, and cross-links when support becomes tracked work.
- [ ] Create live Discourse Alpha Support category, route `alphasupport@discussionbridge.dev` into Discourse, and wire final channel links into README, docs, package metadata, demo pages, and release notes. Phil/Ops owns the live category and email route; Codex owns final link wiring after those exist.
- [x] Product docs URL decided: use `docs.discussionbridge.dev` with Starlight. Keep `discussionbridge.dev/docs` only as a redirect or fallback if needed.
- [x] Deploy the Starlight docs site source for `docs.discussionbridge.dev` into the repo under `sites/docs`, generated from repository `docs/*.md`.
- [ ] Reconfigure Discussion Bridge Cloudflare under the new ownership/account plan before Alpha: owning account, admin email, DNS, Pages, redirects, Access, Workers, billing boundary, and operator roles. Phil/Ops prerequisite.
- [ ] Complete Cloudflare Pages work for `docs.discussionbridge.dev`: create/configure the Pages project for `sites/docs`, attach the custom domain, confirm the live production deploy, and verify the raw Pages hostname redirects to the custom domain. Phil/Ops prerequisite.
- [x] Make `discussionbridge.dev` live in a credible public form before showing Alpha outside the working circle.
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
- [ ] Run the repeatable live smoke pass before Alpha and before each release candidate. It covers publish/sync; docs, releases, blog, news, and comments demo routes; `simple`, `full`, and `fullInteractive` comments modes; full-app embed Discourse settings; and `forum.discussionbridge.dev` category, tags, and permissions.
- [ ] Enforce source modes before Alpha: `astro-managed`, `discourse-managed`, and `discourse-imported` are documented, and `discussionSync: false` is enforced, but `import-existing` does not yet add the writeback guard automatically or persist an enforced source-mode field.

### Import

- [ ] Add explicit manifest input for curated production imports while preserving caller-supplied topic order.
- [ ] Add a category selector that discovers/lists available categories and accepts category ID or an unambiguous slug/name, including subcategories.
- [ ] Add deterministic "next in selected category" behavior: oldest Discourse `created_at` first, with topic ID as the stable tie-breaker.
- [ ] Add import filters for tags, created-date range, open/closed status, and limit.
- [ ] Add optional oldest/newest ordering by Discourse `created_at` and natural topic-title ordering for numbered source collections.
- [ ] Ensure import sequencing never uses `bumped_at`, last reply, or latest activity.
- [ ] Preview discovered candidates before import and prevent already imported topics from being selected again.
- [ ] Add optional imported-page hero placement and require non-empty alt text whenever a hero image is configured.

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
- [x] Document the demo build warning: `Entry docs -> 404 was not found`.
- [ ] Prepare and file a Starlight GitHub issue for the stock Starlight `Entry docs -> 404 was not found` finding; include the likely `getEntry('docs', '404')` source, `disable404Route: true` confirmation, and custom `docs/404.md` route-conflict result.
- [x] Keep the local package demo dependency pointed at the package directory unless a release-packaging test specifically needs a tarball.

### Recover

- [ ] Define the explicit repair path for a deleted Discourse topic linked from Astro.
- [ ] Define the explicit repair path for a deleted first post.
- [ ] Decide whether recovery belongs in a command such as `repair-link`, `relink-topic`, or an `import-existing --overwrite` workflow.
- [x] Keep automatic recreate disabled unless the user explicitly chooses it.
- [ ] Document when to clear Cloudflare cache versus when to treat a sync/deploy as failed.

### Document

- [x] Add paired entry-point manuals: `docs/HUMAN_MANUAL.md` for operators and `docs/MACHINE_MANUAL.md` for exact reusable implementation facts and site-specific runbook generation.
- [x] Include the paired manuals in the generated `sites/docs` Starlight site and verify both routes build.
- [ ] Complete Manual Boss Alpha quality review of the paired manuals and record or resolve findings.
- [x] Add paired reusable site-specific Human and Machine Runbook templates that consume settled Machine Manual inputs.
- [x] Create the first paired OBBBA runbooks for `onebigbeautifulbill.us` and `forum.repealobbba.org`, preserving topic `434`, `discourse-imported`, and `discussionSync: false` while exposing unresolved implementation inputs.
- [ ] Review and replace or approve screenshot/video placeholders after Manual Boss confirms usability, accessibility, secret safety, and public/private boundaries.
- [x] Add a concise Alpha setup guide.
- [x] Add a key-management guide.
- [x] Add a comments-display guide covering `simple`, `full`, and `fullInteractive`.
- [x] Add a content-lanes guide for docs, releases, blog, news, and Starlog-style release notes.
- [x] Add a discussion-safe Markdown guide.
- [x] Add troubleshooting entries for title validation, body length, tag limits, duplicate embed URLs, stale Cloudflare cache, missing topic, missing first post, and Discourse offline.
- [x] Finalize support and feedback guide with Alpha channel model.
- [ ] Update public support links after the Alpha Support category and email route are live.
- [x] Complete one-time Alpha attribution/ownership/licensing pass across public docs.

## Alpha Demo Checklist

- [x] Verify the local Starlight demo builds from `examples/starlight-demo`.
- [x] Verify live Astro and Starlight demos deploy from the canonical `astro-discussion-bridge` example source trees.
- [ ] Include demo routes, comments modes, full-app embed settings, and forum category/tag/permission checks in the repeatable live smoke pass before Alpha and every release candidate.
- [ ] Test with Cloudflare CDN in place on Discourse and document that the bridge works with a CDN-backed forum.
- [ ] Verify topic creation so pages from different Astro hosts do not collide or create confusing duplicate topics.
- [ ] Confirm `embed_url` maps each Astro page to the correct companion topic across hosts.
- [x] Verify public Alpha demo domains use the demo-lane pattern: `demo.discussionbridge.dev`, `astro.demo.discussionbridge.dev`, `astrostarlight.demo.discussionbridge.dev`, `stockstarlight.demo.discussionbridge.dev`, and future parallel integration hosts.
- [x] Add and build clean stock Starlight control site to compare framework warnings and upgrades.
- [x] Apply demo topic lifecycle policy in Discourse: tagged old/transitional topics `20`, `21`, `24`, and `28` as `historical-reference`; reserve deletion/permanent deletion for true mistakes or sensitive/unsafe content.
- [x] Retire or clearly mark transitional demo deploy copies under `discussionbridge.dev` after public demo projects build from `astro-discussion-bridge`.

## Release/Upgrade Checklist

- [ ] Record the Code Boss pass/fail result against the exact release candidate; complete all blocking edits and obtain re-review where required before Product Boss approval.
- [ ] Confirm Bridge Boss technical verification and Manual Boss quality review are complete before Product Boss approval.
- [ ] For every Alpha, Beta, release candidate, patch, and Current release, confirm the Human and Machine Manuals are ready for the exact release; treat this as a release blocker.
- [ ] Record Product Boss documentation sign-off for every release before publishing; code completion alone is not release readiness.
- [ ] Record separate Product Boss release approval for every release, covering intended scope, operator readiness, known limitations, and the coherent release package; this does not replace Bridge Boss technical verification or Manual Boss quality review.
- [ ] Maintain an Astro compatibility matrix for Astro 6 and 7.
- [ ] Test demo installs after Astro core and official integration releases, especially `@astrojs/cloudflare`.
- [ ] Add a `doctor` or `check-upgrade` command.
- [ ] Document the recommended upgrade order.
- [ ] Keep Starlight optional.
- [ ] Before any Alpha tag/release, run package tests, local demo build, dry-run CLI checks, and at least one live smoke sync.
- [x] Alpha release channel decided: GitHub release plus repo-installable. Hold npm until late Beta, after the first support/docs loop survives real use.
- [ ] Confirm release pages, README, package metadata, and demo pages point to the same support and feedback channels after the Alpha Support category and email route are live.

## Product Roadmap Checklist

- [x] Keep Tier 1 API-only and useful without a Discourse plugin.
- [ ] Complete implementation design review for proposed active Alpha
      multi-target pages; do not mark the capability complete before review and
      live proof.
- [x] Keep multiple content lanes first-class through config and frontmatter.
- [x] Keep one package with two clear presets: `starlight` and `astro`.
- [x] Keep the Starlight preset focused on Starlight conventions.
- [ ] Preserve future multi-Discourse compatibility in names, helper APIs, and docs language.
- [ ] Add an unobtrusive, configurable comments-boundary credit such as `Discussion connection by Discussion Bridge` or `Discourse connection by Discussion Bridge`; verify wording, link destination, accessibility, and behavior across `simple`, `full`, and `fullInteractive` modes.
- [ ] Consider optional mapping from Astro/template content tags to Discourse topic tags.
- [ ] Package the setup/diagnostics/docs workflow for self-serve users and paid assisted setup.
- [ ] Use the OBBBA implementation lane as a real-world Discourse-to-Astro proof path: import/prune a `forum.repealobbba.org` topic into `onebigbeautifulbill.us`, keep it `discourse-imported` until explicit promotion, and feed lessons back into Discussion Bridge.
- [ ] Preserve the Citizen Activist structured-document path: Discourse wiki topics as source material, Astro as polished public act/section pages, with status, last-edit context, source topic links, comments, and no accidental writeback.
- [ ] Preserve the OBBBA many-to-one topology: `onebigbeautifulbill.us` / `OBBBA.us`, `repealobbba.org`, `repealobbbaact.us`, and possibly `repealobbbapledge.us` can all connect to `forum.repealobbba.org`, with source direction varying by site or lane.
- [ ] Explicitly verify selected `onebigbeautifulbill.us` pages remain bound to
      `forum.repealobbba.org` as the first edge of the topology matrix.
- [x] Use canonical hostname `forum.citizenactivist.network` and public
      description “A community of activists”; keep Cloudflare/account ownership
      placement as a separate Ops decision.
- [ ] Configure that forum as an explicit Discussion Bridge target and select
      clearly labeled `onebigbeautifulbill.us` proof pages without changing the
      production OBBBA lanes on `forum.repealobbba.org`.
- [ ] Prove the same selected `onebigbeautifulbill.us` page uses an explicit
      ordered target list for `forum.repealobbba.org` and
      `forum.citizenactivist.network`.
- [ ] Run target-specific diagnostics and dry-run, build, deploy, and verify
      each live page/topic binding; prove source-target no-writeback and no
      unintended writes to any other target.
- [ ] Add one or two clearly labeled Discussion Bridge demo/credit pages on `onebigbeautifulbill.us` whose companion discussions live on `forum.discussionbridge.dev`; keep the production OBBBA source lane on `forum.repealobbba.org` and use the cross-forum pages to prove per-page target selection without implying full many-to-many support.
- [ ] Persist each target's forum identity, topic ID/URL, sync state, error
      state, and display policy independently.
- [ ] Define primary rendered discussion versus additional linked/rendered
      targets; never silently choose one target.
- [ ] Prove recoverable partial success: retain successful bindings, report the
      failed target, and retry idempotently without duplicate topics.
- [ ] Record the completed Alpha proof as one-page multi-forum capability plus
      multiple-sites-to-one-forum convergence, without claiming the future
      general many-to-many administration plane.
- [ ] Prove import layers sequentially before Alpha end-stage: no image/no prune, image only, prune only, then image plus prune.
- [ ] Use `repealobbbaact.us` as an Alpha end-stage package-installed test for Discourse-source structured pages, source-mode safety, comments rendering, and Cloudflare deployment.
- [x] Phil confirmed the optional Discourse plugin vertical slice belongs in
      cumulative Alpha scope.
- [ ] Build an optional `Discussion Bridge for
      Discourse` v0.1 Alpha slice for `fullInteractive` Mermaid/table rendering
      parity plus the architecture/test baseline for later control-plane work.
      Keep Tier 1 API-only and fully usable without plugin installation.
- [ ] Keep the full control plane, post-as-user, PM automation, and general
      many-to-many management out of plugin v0.1 unless separately approved.
- [x] Use logical/workspace path
      `DiscussionBridge/plugins/discourse-discussion-bridge` for the proposed
      plugin; leave physical GitHub repo naming/placement to Boss/folder review.
- [ ] Investigate Discourse API/plugin support for delegated posting or notifications as configured users in multisite/multichannel agency scenarios, including possible `postAs` or `discussionPostAs` configuration.
- [ ] Design future integration lanes for Statamic and other frameworks.
