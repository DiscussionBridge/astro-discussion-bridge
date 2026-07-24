# Product Build/Launch Checklists

Use these checklists as the product dashboard for Discussion Bridge for Astro. They are organized around the operating loop:

publish -> sync -> diagnose -> maintain -> recover -> document

## Alpha Readiness Checklist

### Release-Scope Doctrine

- [x] Lock the cumulative Alpha feature/function set recorded by this checklist.
      After this lock, new work must close an existing promise or gate, fix
      exercised behavior, or receive explicit approval as a scope change.
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
- [x] Keep all three Alpha software tracks free/open source unless a later
      explicit decision changes that: the Astro API/package, the optional light
      Discourse plugin, and public docs/community support. Paid value is
      implementation labor, handholding, managed hosting/operations,
      customization, support, and consulting; third-party infrastructure
      remains operator-paid.

### DiscussionBridge.dev Two-Direction Dogfood Gate

- [x] Implement and review explicit import source selection in `1731547`
      (Code Boss PASS, 72/72): `--source-mode
      discourse-imported|discourse-managed`, imported default, rejected
      `astro-managed`, persistent `discussionSync: false`, and per-manifest-entry
      `sourceMode`.
- [x] Complete the public credential-free dry run for
      `forum.discussionbridge.dev` topic `36` to
      `/guides/how-to-choose-a-discussion-bridge-source-mode/`; verify the
      Discourse-managed frontmatter and deterministic destination preview.
- [x] Complete the credentialed import, exact clean Astro build/deploy, and
      canonical live guide/source/discussion verification in apex commit
      `d68ffc4` (Code Boss PASS), deployed 2026-07-23. See the
      [sanitized dogfood evidence record](https://github.com/DiscussionBridge/astro-discussion-bridge/blob/main/docs/evidence/DISCUSSIONBRIDGE_DEV_TWO_WAY_DOGFOOD_2026-07-23.md).
- [x] Publish an Astro-managed `discussionbridge.dev` blog post to a public
      companion discussion on `forum.discussionbridge.dev`; verify the page,
      topic, declared connection purpose, comments presentation, and
      site-to-forum single-writer direction. Live route
      `/blog/every-connection-has-a-job/` binds independent topic `37`.
- [x] Select a community wiki/how-to on `forum.discussionbridge.dev` and
      deterministically import/refresh it as a durable public guide on
      `discussionbridge.dev`; live topic `36` is a category-6 wiki.
- [x] For the wiki lane, prove `discussionSourceMode: discourse-managed`,
      `discussionSync: false`, explicit source provenance, preserved source
      topic identity, deterministic output, public route, and Astro navigation
      lane.
- [x] Keep the source forum topic as the primary discussion; make comments
      behavior explicit and verify that edits originate in the wiki topic while
      the site republishes reviewed source without site-to-source writeback. A
      deliberate `sync-existing --dry-run` skipped with the
      `discourse-managed` no-writeback reason.
- [x] State clearly that separate topic reply streams are not merged.
- [x] Use the public outcome: “The site starts conversations. The community
      develops durable knowledge. The site publishes what the community
      learns.”

### Brutal Current Split

#### Phil/Ops Prerequisites Before Alpha Can Be Public

- [x] Provision the operational `forum.citizenactivist.network` prerequisite:
      DNS/TLS, public target category, and protected credential records are
      usable for the bounded OBBBA proof. Keep any broader ownership/Cloudflare
      placement decision in Ops; do not expose protected paths or values.

- [ ] Reconfigure Discussion Bridge Cloudflare under the new ownership/account plan: owning account, admin email, DNS, Pages, redirects, Access, Workers, billing boundary, and operator roles.
- [ ] Complete Cloudflare Pages work for `docs.discussionbridge.dev`: canonical
      docs URLs are 200, but raw
      `https://docs-discussionbridge-dev.pages.dev/` still returns 200. Add and
      verify a 301 to `https://docs.discussionbridge.dev/`.
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
- [ ] Complete Cloudflare Pages work for `docs.discussionbridge.dev`: canonical
      docs URLs are live; configure the raw
      `docs-discussionbridge-dev.pages.dev` hostname to return 301 to the
      custom domain. Phil/Ops prerequisite.
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
- [x] Enforce source modes before Alpha: `import-existing` persists
      `discussionSourceMode: discourse-imported` and `discussionSync: false`;
      sync preflight protects `discourse-imported` and `discourse-managed`
      source targets from writeback.

### Import

- [x] Add strict explicit manifest input for curated production imports,
      preserving caller-supplied topic order and providing validated, atomic
      staging/write/rollback behavior (`a646c6b`, reviewed package suite 49/49).
- [x] Implement read-only `discover-imports` category listing/selection by exact
      ID, slug, or name, with optional descendant subcategories.
- [x] Implement deterministic "next in selected category" behavior: oldest
      Discourse `created_at` first, with topic ID as the stable tie-breaker.
- [x] Add discovery filters for tags, created-date range, open/closed status,
      and limit.
- [x] Add oldest/newest `created_at` ordering and natural topic-title ordering
      for numbered source collections.
- [x] Enforce that import discovery never sequences by `bumped_at`, last reply,
      or latest activity.
- [x] Preview candidates and recursively exclude locally imported
      `discourseTopicId` and target-binding topic IDs.
- [x] Add optional non-overwriting `--manifest-out` for a new strict v1
      manifest, with selectable source mode/comments display and JSON output.
- [ ] Obtain Code Boss review for the 83/83 discovery candidate; implementation
      and live read-only CDN-backed evidence are complete, but review is not.
- [x] Add optional imported-page hero placement and require non-empty alt text
      whenever a hero image is configured (`729d85f`, reviewed package suite
      38/38); reject missing, empty, whitespace-only, or unpaired values before
      write.

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
- [x] Prepare a Starlight GitHub issue write-up for the stock Starlight `Entry docs -> 404 was not found` finding; include the likely `getEntry('docs', '404')` source, `disable404Route: true` confirmation, and custom `docs/404.md` route-conflict result.
- [ ] Reproduce against the current Starlight release and file the prepared GitHub issue.
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
- [x] Implement the automated full attribution/licensing gate in
      `scripts/check-attribution.mjs`, backed by
      `docs/THIRD_PARTY_PROVENANCE.json` and reviewed khroma 2.1.0 MIT
      evidence. Package regression proves a fresh checkout regenerates the
      rendered attribution source before checking it; Code Boss final PASS,
      package suite 73/73.
- [x] Run the bounded docs-scope attribution gate before the readable docs
      build. Require the exact distinctions `PASS (docs scope)` and
      `npm package contents: SKIPPED (requires built release candidate)`.
- [x] Obtain Manual Boss semantic attribution/licensing review for the exact
      candidate through `b09dbce` atop `7127eb1` + `462b3ae`. Result:
      `Attribution and Licensing: PASS`; reviewed paths and corrections are in
      the [sanitized exact-candidate record](https://github.com/DiscussionBridge/astro-discussion-bridge/blob/main/docs/evidence/ATTRIBUTION_LICENSING_REVIEW_B09DBCE_2026-07-23.md).
      Automated 73/73 and docs 20/21 remain separate results.

## Alpha Demo Checklist

- [x] Verify the local Starlight demo builds from `examples/starlight-demo`.
- [x] Verify live Astro and Starlight demos deploy from the canonical `astro-discussion-bridge` example source trees.
- [ ] Include demo routes, comments modes, full-app embed settings, and forum category/tag/permission checks in the repeatable live smoke pass before Alpha and every release candidate.
- [x] Test with Cloudflare CDN in place on Discourse. Production field evidence
      from `forum.repealobbba.org` confirms the exercised diagnostics/API,
      import, reconciliation/source-link, `fullInteractive`, signed-in reply,
      source-disclosure, and no-writeback workflows work through this
      Cloudflare-CDN-backed forum. This is not a guarantee for every CDN/WAF/
      cache-rule configuration.
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
- [x] Alpha release channel decided: corresponding GitHub prerelease plus npm
      prerelease for the Astro package under dist-tag `alpha`, never `latest`.
      Repo/tarball installs remain development/recovery fallback.
- [ ] Confirm npm package name/ownership and publisher authority.
- [ ] Confirm npm account 2FA or trusted publishing.
- [ ] Select the exact reviewed semver prerelease; `0.1.0-alpha.1` is an example,
      not yet the release decision.
- [ ] Run `npm pack --dry-run`, inspect the tarball, and prove it contains only
      intended package files.
- [ ] Clean-install from the packed artifact and then the registry `@alpha`
      artifact in both plain Astro and Starlight demos.
- [ ] Verify exports, public Astro components, CLI bin/help, import/sync,
      comments modes, source disclosure, and multi-target helpers from the
      consumer installs.
- [ ] Verify LICENSE, README, repository, bugs, and homepage metadata.
- [ ] Prove credentials, fixtures, local paths, and unintended files are absent.
- [ ] Record Code Boss PASS and Manual Boss installation/docs review for the
      exact package candidate.
- [ ] Retain the exact candidate's full automated attribution result from
      73/73 and its separate Manual Boss semantic
      `Attribution and Licensing: PASS / FAIL / N/A` review record.
- [ ] Prove GitHub prerelease and npm artifact correspond to the same commit.
- [ ] Verify `npm view`, dist-tags, and a clean consumer install by `@alpha`.
- [ ] Document rollback, deprecation, and yank response; npm versions are
      immutable. Do not run automatic `npm audit fix`.
- [ ] Reserve `latest` for first stable; consciously choose `beta`, `next`, or
      another documented prerelease channel after Alpha learning.
- [ ] Confirm release pages, README, package metadata, and demo pages point to the same support and feedback channels after the Alpha Support category and email route are live.

## Product Roadmap Checklist

- [x] Keep Tier 1 API-only and useful without a Discourse plugin.
- [x] Complete implementation and Code Boss review for Alpha multi-target pages
      (`60e41e1`, package suite 62/62) and the bounded OBBBA → Citizen Activist
      live proof (`36df91c`).
- [x] Keep multiple content lanes first-class through config and frontmatter.
- [x] Keep one package with two clear presets: `starlight` and `astro`.
- [x] Keep the Starlight preset focused on Starlight conventions.
- [x] Provide multi-Discourse target names, frontmatter, presentation helpers,
      and the public `astro-discussion-bridge/targets` export.
- [x] Implement and review accessible Discourse source disclosure (`a9d2097`,
      68/68), including safe URL selection, multi-target protected-source
      provenance, canonical Astro/Starlight placement, and public component/
      helper/type exports.
- [x] Install reviewed artifact
      `astro-discussion-bridge-0.1.0-alpha-a9d2097-f3fbb73e.tgz` into OBBBA,
      wire the canonical source notice near the article start, clean-build and
      deploy adoption commit `aa7846d`, and verify exactly one correct source
      notice/link on all five live Title I routes independently from comments.
- [ ] Add an unobtrusive, configurable comments-boundary credit such as `Discussion connection by Discussion Bridge` or `Discourse connection by Discussion Bridge`; verify wording, link destination, accessibility, and behavior across `simple`, `full`, and `fullInteractive` modes.
- [ ] Consider optional mapping from Astro/template content tags to Discourse topic tags.
- [ ] Package the setup/diagnostics/docs workflow for self-serve users and paid assisted setup.
- [x] Use the OBBBA implementation lane as a real-world Discourse-to-Astro
      proof path: the reviewed manifest imported/pruned five
      `forum.repealobbba.org` topics into `onebigbeautifulbill.us`, preserved
      `discourse-imported` plus no-writeback, and passed clean build, deployment,
      and canonical live route/topic verification.
- [ ] Preserve the Citizen Activist structured-document path: Discourse wiki topics as source material, Astro as polished public act/section pages, with status, last-edit context, source topic links, comments, and no accidental writeback.
- [ ] Preserve the OBBBA many-to-one topology: `onebigbeautifulbill.us` / `OBBBA.us`, `repealobbba.org`, `repealobbbaact.us`, and possibly `repealobbbapledge.us` can all connect to `forum.repealobbba.org`, with source direction varying by site or lane.
- [x] Explicitly verify selected `onebigbeautifulbill.us` pages remain bound to
      `forum.repealobbba.org` as the first edge of the topology matrix.
- [x] Use canonical hostname `forum.citizenactivist.network` and public
      description “A community of activists”; keep Cloudflare/account ownership
      placement as a separate Ops decision.
- [x] Configure that forum as an explicit Discussion Bridge target and select
      clearly labeled `onebigbeautifulbill.us` proof pages without changing the
      production OBBBA lanes on `forum.repealobbba.org`.
- [x] Prove the same selected `onebigbeautifulbill.us` page uses an explicit
      ordered target list for `forum.repealobbba.org` and
      `forum.citizenactivist.network`.
- [x] Run target-specific diagnostics and dry-run, build, deploy, and verify
      each live page/topic binding; prove source-target no-writeback and no
      unintended writes to any other target. Post-proof interaction also
      confirmed Citizen Activist topic 9 accepted public post 2 while the Astro
      page continued to render primary Repeal OBBBA topic 434.
- [ ] Add one or two clearly labeled Discussion Bridge demo/credit pages on `onebigbeautifulbill.us` whose companion discussions live on `forum.discussionbridge.dev`; keep the production OBBBA source lane on `forum.repealobbba.org` and use the cross-forum pages as part of the bounded many-to-many proof without claiming a general administration plane.
- [x] Persist each target's topic ID/URL, source hash, sync state, sanitized
      error, and attempt time independently in target-keyed bindings.
- [ ] Complete any per-target display-policy model beyond the implemented
      explicit primary discussion and accessible additional-target links.
- [x] Define primary rendered discussion versus additional linked
      targets; never silently choose one target.
- [ ] Implement “Every connection has a job”: ensure every connection declares
      its audience/purpose and its visible label/call to action communicates the role (public community,
      chapter/regional, internal review, subject-matter feedback, advocacy
      coordination, syndication, or another approved purpose). Never silently
      merge independent reply streams.
- [ ] Review and finalize configuration vocabulary corresponding to the reader
      model—candidate `role`/`purpose`, `audience`, `callToAction`, `description`,
      visibility/context, direction/source ownership, and primary/additional
      presentation. Do not mark this implemented until design and tests pass.
- [ ] Prove CAN bidirectional operation with separate page/topic pairs and
      explicit source ownership; prevent loops by prohibiting the same item from
      being writable in both directions simultaneously.
- [ ] Design the future governed chapter↔national pattern under “Local
      ownership. National reach.” Include source/chapter identity, parent/child
      relationship, mapped categories, region/chapter tags, promotion approval,
      privacy eligibility, attribution/return links, target-specific copy,
      one-way first-post direction, independent replies, target-specific retry,
      and moderation ownership. Do not claim current general forum-to-forum
      orchestration.
- [x] Implement and test recoverable partial success: retain successful
      bindings, report the failed target, and retry idempotently without
      duplicate topics.
- [x] Record the completed Alpha proof as one-page multi-forum capability plus
      multiple-sites-to-one-forum convergence, without claiming the future
      general many-to-many administration plane. The bounded live OBBBA/CAN
      proof, independent bindings, retry behavior, source no-writeback, and
      additional-discussion interaction are recorded in Product Notes and the
      paired OBBBA runbooks.
- [x] Prove import layers sequentially before Alpha end-stage: no image/no
      prune (`747`), image only (`751`), prune only (`752`), then image plus
      prune (`753`); the reviewed four-case manifest passed source comparison,
      production-shaped build, deployment, and live verification.
- [ ] Use `repealobbbaact.us` as an Alpha end-stage package-installed test for Discourse-source structured pages, source-mode safety, comments rendering, and Cloudflare deployment.
- [x] Phil confirmed the optional Discourse plugin vertical slice belongs in
      cumulative Alpha scope.
- [ ] Build an optional `Discussion Bridge for
      Discourse` v0.1 Alpha slice for `fullInteractive` Mermaid/table rendering
      parity plus the architecture/test baseline for later control-plane work.
      Keep Tier 1 API-only and fully usable without plugin installation.
- [ ] On CAN, evaluate/install the existing Discourse Mermaid theme component
      as the immediate normal-topic baseline, then build the bounded optional
      plugin slice for Mermaid in full-app embeds, table presentation parity,
      embed-context detection, and tests. Do not make Tier 1 depend on it.
- [x] Correct Mermaid terminology: Discourse Mermaid is the official
      **theme component** documented at Meta topic `218242` and repository
      `discourse/discourse-mermaid-theme-component`, never the Discussion Bridge
      plugin.
- [ ] Choose explicitly among the existing official theme component, a
      fork/extension of that theme component, the separate optional Discussion
      Bridge for Discourse plugin, or an upstream Discourse change for
      full-app-embed parity.
- [ ] Build the plugin as a separate Boss-routed product/repository; prove it is
      installable and removable with rollback docs on supported stock/current
      Discourse, has no ordinary-topic regression, and passes live CAN full-app
      embed verification. npm Alpha decisions here apply to the Astro package,
      not Discourse plugin installation.
- [ ] Keep the full control plane, post-as-user, PM automation, and general
      many-to-many management out of plugin v0.1 unless separately approved.
- [x] Use logical/workspace path
      `DiscussionBridge/plugins/discourse-discussion-bridge` for the proposed
      plugin; leave physical GitHub repo naming/placement to Boss/folder review.
- [x] Implement and document preferred request actor controls: `--post-as`,
      `DISCOURSE_POST_AS`, and lane/default `postAs`/`postAsEnv`, with legacy
      API-username controls as fallbacks and the resolved actor sent as
      `Api-Username`. A real CLI execution regression covers `--post-as` and
      dry-run actor output. Current package suite 79/79.
- [x] Document independent Discourse key User Level and Scope behavior:
      `All Users` may act for supplied `Api-Username`; `Single User` is bound
      to its selected user; Scope controls endpoints separately.
- [ ] Create and inventory `special-admin` on each connected forum; verify
      separately assigned admin/category/API authority because group membership
      grants none.
- [ ] Finalize and availability-check collision-safe role+origin identities.
      Current candidates: `editorbridgeforum` / Discussion Bridge Forum Editor
      and `editorcanforum` / CAN Forum Editor. Preserve `obbba-bot`.
- [ ] Complete topic-36 editor-ownership acceptance: transfer first-post
      ownership from `discourseadmin`, edit as the selected editor, overwrite
      refresh the Discourse-managed guide, build/deploy/live verify, and prove
      no Astro writeback.
- [x] Persist Discourse first-post author username/name during import and
      explicit overwrite refresh; render safe same-forum source-author profile
      attribution while preserving the forum's subfolder base, source mode,
      no-writeback, and topic ID.
- [x] Persist `discussionSourceCategoryId` and report source-category changes
      from opening frontmatter only. Overwrite refreshes WHEREFROM metadata
      without moving the Astro file, public route, or navigation lane; direct
      and strict atomic-manifest coverage includes LF, CRLF, BOM, and body/code
      lookalikes. Package suite 79/79; Code Boss PASS.
- [ ] Design an explicit existing-topic owner-transfer operation separately
      from `postAs` and normal sync; neither may silently change ownership.
- [x] Document category authority: configured categories are authoritative for
      Astro-managed topics and sync corrects drift; absent configuration
      preserves manual placement; Discourse-source categories are protected;
      target categories are independent.
- [ ] Design future integration lanes for Statamic and other frameworks.
