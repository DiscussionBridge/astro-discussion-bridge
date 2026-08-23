# TODO

Use this as the working roadmap for DiscussionBridge for Astro. Keep the operating loop in view:

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

#### Remaining Phil/Ops Prerequisites Before Alpha Can Be Public

- Resolve only the still-open DiscussionBridge Cloudflare account/ownership and
  operator-role decisions. The six public Astro-family sites already use
  reviewed, checked-in Wrangler deployments; do not reopen their completed
  migration or describe the docs site as a future Pages project.
- Create live Discourse Alpha Support category.
- Route `alphasupport@discussionbridge.dev` into Discourse.
- Confirm final public support links after the live support category and email route exist.

#### Codex/Product Work That Can Continue Now

- Tightened CLI/help text and friendly validation messages.
- Built the paired Human Manual and Machine Manual and included them in the generated Starlight docs site.
- Route the paired manuals through Manual Boss review and resolve Alpha-blocking consistency, presentation, secret-safety, usability, accessibility, placeholder, and public/private-boundary findings before public release.
- [x] Added and live-confirmed `check-discourse` examples for a global
  diagnostics key, granular publishing key, and explicit configured limits on
  `dev-forum.discussionbridge.dev` without retaining either acceptance key.
- Finish docs link wiring once Phil/Ops prerequisites produce final URLs.
- Prepare the repeatable live smoke-pass script/checklist so it is ready when Cloudflare/support wiring is done.
- Keep polishing sync/recovery documentation without adding major feature scope.

### Publish

- [x] Make DiscussionBridge-controlled publication the preferred Alpha
  companion-topic creation path. The server-side adapter authenticates with a
  configured connection ID and secret to the plugin create-or-resolve endpoint;
  the forum enforces the operating actor, category, tags, and visibility before
  Astro stores the durable topic ID and exposes the comments embed. Direct Core
  API-key publication remains a separate operator-selected adapter mode. Treat
  Discourse Core visitor-triggered embed creation (`system` author, page fetch
  on first embed view) as a separate explicit zero-touch mode rather than a
  silent fallback. Preserve final forum authority over permissions and
  moderation. Topic 38 on `forum.discussionbridge.dev`, bound
  to `astro.demo.discussionbridge.dev/blog/community-continuity/`, is the Alpha
  evidence case for this distinction. BB2 remediation is complete; the adapter
  implementation and disposable-sandbox acceptance are complete, while stable
  preproduction and production promotion remain separate gates.
- Confirmed final CLI command names and help output are clear: `publish-new`, `sync-existing`, `publish-and-sync`, `discover-imports`, `import-existing`, and `check-discourse`.
- Alpha decision: do not add a configurable title template. Exact title
  preflight and an explicit page title are sufficient for Alpha; optional title
  templating is Beta scope.
- Keep local preflight validation available for dry runs and unauthenticated checks.
- Confirmed title/body/tag preflight messages are friendly enough for non-package authors.
- Confirm generated first-post body is reader-facing and does not expose implementation labels.
- Finalized the public Alpha support channel model in `docs/SUPPORT_AND_FEEDBACK.md`: GitHub Issues for formal product work, GitHub Discussions for repo-bound design/implementation discussion, Discourse Alpha Support plus `alphasupport@discussionbridge.dev` for support discovery/community memory, and cross-links when support becomes tracked work.
- Create live Discourse Alpha Support category, route `alphasupport@discussionbridge.dev` into Discourse, and wire final channel links into README, package metadata, demo pages, and release notes. Phil/Ops owns the live category and email route; Codex owns final link wiring after those exist.
- Product docs URL decided: use `docs.discussionbridge.dev` with Starlight. Keep `discussionbridge.dev/docs` only as a redirect or fallback if needed.
- The deployed Starlight documentation source is the independent
  `DiscussionBridge/docs` repository at
  `C:\CodeProjects\Sites\DiscussionBridge\discussionbridge.dev\docs.discussionbridge.dev\site`;
  the old adapter
  repository `sites/docs` copy is superseded and is not a deployment source.
- Resolve the remaining Cloudflare account/ownership and operator-role decisions
  before Alpha promotion. The six public Astro-family sites, including
  `discussionbridge.dev` and `docs.discussionbridge.dev`, are already live from
  reviewed Wrangler deployments; their live state is not an open Pages-build
  task.
- Added proper attribution, ownership, and licensing notes to docs where appropriate as an Alpha gate item. Treat this as a once-and-done pass unless ownership, dependencies, copied examples, or source material changes.

### Sync

- [x] Closed the `sync-existing` and `publish-and-sync` edge-test gate for
  Alpha, including title/category/tag/listing drift, target mismatch, collision,
  network failures, missing topics/posts, and isolated multi-target retry.
- Alpha decision: curated `discussionSummary` is the supported path for
  component-heavy MDX. Automatic JSX/component summarization is Beta scope.
- Keep `discussionSummary` as the supported curated summary override and document when to use it.
- Document and test the distinction between Astro/template content tags and Discourse `discussionTags`.
- Verify tag/category/title/listing sync behavior with current live bot keys one more time before Alpha.
- [x] Enforced and documented `astro-managed`, `discourse-managed`, and
  `discourse-imported` source modes. Imported/managed sources cannot write back;
  promotion requires a reviewed frontmatter change and dry run.

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
- [x] Added the global diagnostics, granular publishing, and explicit-limit
  examples and replayed both key modes against stable preproduction.
- Investigate whether a Discourse admin/bot API key can post or send messages as another Discourse user, what endpoint/scope enables it if supported, and whether that behavior is appropriate for DiscussionBridge. Potential future use case: one trusted configuration/control-plane bot publishing notices or dashboard/admin messages across multiple users, sites, channels, or client forums in a multisite/agency setup. Possible future config shape: `postAs: "username"` in site/lane config or `discussionPostAs: "username"` in frontmatter. If supported, CLI/check output should make the operating key user and effective posting user explicit.

### Maintain

- Keep the maintenance sync process documented as a repeatable test: confirm package version, dry-run with `--details`, live sync, verify Discourse, verify Astro, consider Cloudflare cache.
- Add or update npm scripts in the demo for lane-specific dry runs using `--details`.
- Decide whether `--details` should also apply to `import-existing` output.
- File the prepared upstream Starlight issue for the documented demo build warning: `Entry docs -> 404 was not found`.
- Keep the local package demo dependency pointed at the package directory unless a release-packaging test specifically needs a tarball.

### Recover

- [x] Documented explicit operator-controlled repair for a deleted topic,
  deleted first post, stale link, and failed sync. Alpha uses Discourse restore or
  a reviewed relink/recreate procedure; no automatic repair command guesses
  ownership.
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

- Verify the independent Starlight demo builds from
  `C:\CodeProjects\Sites\DiscussionBridge\discussionbridge.dev\demo.discussionbridge.dev\astrostarlight.demo.discussionbridge.dev\site`.
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
- Document the recommended order: upgrade Astro official packages first, then verify DiscussionBridge.
- Keep Starlight optional so Astro core sites are not forced to install it.
- Before any Alpha tag/release, run package tests, local demo build, dry-run CLI checks, and at least one live smoke sync.
- Alpha release channel decided: use GitHub release plus repo-installable. Hold npm until late Beta, after the first support/docs loop survives real use.
- Confirm every release page, README, package metadata, and demo page points to the same support and feedback channels after the Alpha Support category and email route are live.

## Product Roadmap

### Editorial Publishing Boundary

- Design multiauthor publishing and a Git-based CMS workflow only after the
  public information architecture is settled. Treat author identity, profiles,
  editorial review, submissions, permissions, attribution, preview, and
  publication as one separately reviewed editorial-system boundary; do not
  bolt these controls onto the current public site piecemeal.
- Audit OBBBA Text display headings against authoritative official headings and
  section-body capitalization before the next Text regeneration. The current
  sentence-case conversion can erase acronyms and proper names (confirmed by
  `FEHB` → `Fehb`). Produce a deterministic candidate report and review
  ambiguous capitalization; do not apply blanket title case.

### Tier 1: API-Only Bridge

- Keep Tier 1 generous and usable without a Discourse plugin.
- Support one Discourse target per page for Alpha.
- Keep one package, `astro-discussion-bridge`, with clear presets: `preset: "starlight"` for Starlight documentation sites and `preset: "astro"` for broader Astro content sites.
- Keep the Starlight preset focused on Starlight conventions unless there is a strong product reason to do otherwise.
- Preserve future multi-Discourse compatibility by avoiding hard-coded single-forum assumptions in names, helper APIs, and docs language where `discussion target` fits.
- Keep multiple content lanes first-class through config and frontmatter.
- Consider optional mapping from Astro/template content tags to Discourse topic tags. Keep it opt-in so a site's editorial taxonomy is not automatically forced into its forum taxonomy.
- Use the OBBBA implementation lane as a real-world Discourse-to-Astro proof path: import/prune a `forum.repealobbba.org` topic into `onebigbeautifulbill.us`, keep it `discourse-imported` until explicit promotion, and feed lessons back into DiscussionBridge.
- Preserve a path for community-authored legislation and structured-document sites where Discourse is the drafting/revision layer and Astro is the public presentation layer. First likely proof: `repealobbbaact.us`.
- Preserve many-to-one now and many-to-many later: multiple public sites may share one forum backbone, and future users may connect multiple sites to multiple forums by lane, region, chapter, language, audience, or campaign.
- [x] Ship the restrained, configurable `Connected by DiscussionBridge` comments-boundary credit with a canonical link, operator disable control, accessible hover/focus treatment, reduced-motion behavior, and one placement after the complete discussion surface in every comments mode.
- Add one or two clearly labeled `onebigbeautifulbill.us` demo/credit pages targeting companion topics on `forum.discussionbridge.dev`. Use explicit per-page target selection, keep production OBBBA content on `forum.repealobbba.org`, and document the result as a bounded cross-forum topology proof—not full many-to-many support.

### Tier 2: Assisted Setup And Services

- Package the setup/diagnostics/docs workflow so community users can self-serve, while paid help can hand-hold setup, migration, and customization.
- Identify which support tasks are repeatable enough to become commands, docs, or templates.

### Tier 3: Optional Discourse Plugin

- [x] Settle the Alpha direction: ship a near-full-featured free/open-source
  `DiscussionBridge for Discourse` plugin as the Discourse-side control plane.
  See `docs/evidence/DISCUSSIONBRIDGE_PLUGIN_ALPHA_HANDOFF_2026-08-02.md`.
- Keep the API-only bridge useful without a plugin; the plugin should enhance, not replace, the package.
- Make production-quality `fullInteractive` an Alpha plugin capability. Keep
  core-only `fullInteractive` as a clearly labeled compatibility/development
  preview, not a recommended public-production mode. The plugin must omit the
  companion first post from the authorized embedded layout, including the
  zero-reply case, while preserving native replies, login, composer, actions,
  moderation, and normal forum-topic presentation.
- [x] Implement the default-disabled, completed-mapping-scoped Core redirect
  class and embed-only zero-layout first-post rule locally. Non-browser suite:
  38/38; focused authorization/redirect suite: 7/7; RuboCop: 25/25; browser
  suite: 4/4 for empty, replied/actions, ordinary long-topic presentation, and
  reserved-marker injection rejection. Live installation acceptance remains
  open.
- [x] Complete local development-server runtime acceptance: migrations, safe
  endpoint-disabled startup, compact empty embed, replied/actions embed,
  unchanged ordinary topic, persistent marker after client boot, and
  operator-disable rollback, and caller-supplied reserved-marker rejection. A
  reviewed non-production forum install remains separate.
- [x] Install and rehearse the exact plugin candidate in the dedicated local WSL
  plugin-test sandbox at `/home/phil/discourse-plugin-test`: isolated
  development/test databases, all controls default disabled, 38/38 non-browser,
  4/4 browser, HTTP 200 runtime on port 3100, and reversible symlink
  removal/reinstall PASS.
- [x] Complete signed-in local browser acceptance against disposable fixtures:
  compact comments-only empty and replied surfaces retained native replies,
  the ordinary long topic remained an ordinary forum topic, and one reply
  persisted through each of the three surfaces.
- [x] Provision `sandbox-forum.discussionbridge.dev` as the disposable live
  DiscussionBridge integration sandbox. Give it an isolated server/container,
  database, synthetic fixtures, reset procedure, outbound-mail posture,
  credentials, backups where needed for recovery testing, and an exact rollback
  or rebuild plan. It may be reset and must never share the production forum's
  database or credentials. Live end-to-end acceptance now covers a pre-change
  backup, forum-controlled create then resolve, enforced service actor/category/
  tag/unlisted policy, administrator-authorized failed-reservation recovery,
  exact-host fullInteractive embedding on the public Starlight demo, and final
  endpoint-off rollback. See
  `../../docs/evidence/DISCUSSIONBRIDGE_PLUGIN_ASTRO_SANDBOX_END_TO_END_2026-08-04.md`.
- [ ] After sandbox acceptance, provision `dev-forum.discussionbridge.dev` as
  the stable preproduction acceptance forum. Keep stable fixtures and mirror
  reviewed production settings closely enough to test upgrades, migrations,
  adapter connections, authentication, embeds, email, mobile behavior, backup,
  and rollback before production. Do not use it for disposable experiments.
- Keep `forum.discussionbridge.dev` production-only. Promote only reviewed
  plugin releases and configuration from the dev acceptance boundary; never
  treat local or disposable-sandbox acceptance as production acceptance.
- [x] Restore natural sizing to the comments-only full-app surface. Verify compact
  empty state, short replied topics, long discussions with a configured
  maximum, desktop/mobile behavior, and zero retained layout height from the
  omitted companion first post. Local host-frame acceptance confirms compact
  empty/replied sizing, and a browser regression proves that increasing the
  omitted source length does not increase the Discourse app height. Retain the
  operator-configured maximum for genuinely long discussions; do not substitute
  another unscoped theme CSS workaround.
- [x] Make forum-authorized plugin publication the preferred Alpha companion-topic
  creation path: create/resolve before embed exposure under an explicitly
  configured forum operating identity, persist the topic ID, and prevent a
  reader's first embed view from silently creating a `system`-authored topic.
  Keep Core visitor-triggered creation only as an explicit zero-touch
  compatibility mode. Local sandbox acceptance proves one service-authored
  topic, one durable mapping, idempotent retry, enforced unlisted visibility,
  clean rejection of an underprivileged operating identity, and endpoint-off
  rollback. Do not treat this as permission for arbitrary user impersonation.
- [x] Add a read-only native Discourse administrator Health surface for the
  Alpha plugin. It reports feature switches, connection readiness, operating
  identity, forum authority, mapping state, audit counts, and explicit blockers
  without serializing the connection credential. Focused contract: 5/5;
  complete plugin suite: 48/48; frontend and Ruby lint: PASS. Live sandbox
  installation and end-to-end adapter acceptance are recorded in the 2026-08-04
  sandbox evidence; promotion to the stable dev forum remains separate.
- [x] Use Discourse's native plugin Settings tab as the Alpha editable operator
  surface. Preserve the connection secret as a native write-only secret and
  reject malformed trusted origins, unavailable/system operating identities,
  nonexistent categories, and nonexistent tags at save time. Keep incomplete
  blank/zero setup values valid and let Health report cross-setting readiness.
  Focused validator contract: 4/4; complete plugin suite: 52/52. Visible product
  copy is `DiscussionBridge`; established machine identifiers remain unchanged.
- [x] Add a read-only administrator mappings/audit inspector with server-side
  search, state/outcome filtering, bounded pagination, safe topic/source/actor
  evidence, and no credential or raw requested/effective payload exposure. It
  contains no reconciliation or mutation action. Focused contract: 5/5;
  complete plugin suite: 57/57; frontend and Ruby lint: PASS.
- [x] Add optional forum-owned lane policy configuration. Each configured lane
  selects an existing category and tags while retaining unlisted Alpha
  visibility; missing or unknown lanes fail closed once lane policies are
  present. An empty policy array preserves the global category/tag path.
  Complete plugin coverage: 66/66 (62 non-browser plus 4 browser);
  Ruby/frontend/style lint: PASS.
- [x] Add a read-only administrator reconciliation queue for missing/deleted
  topics, failed or stale mappings, unknown lanes, policy drift, system
  authorship, and duplicate source/topic claims. Emit deterministic severity,
  reason, and recommendation fields without repair or mutation controls.
  Focused contract: 7/7; complete plugin suite: 73/73; Ruby/frontend/style
  lint: PASS.
- [x] Add the first reversible reconciliation action: an administrator may
  authorize one adapter retry for a failed mapping or a reservation stale for
  at least 15 minutes, then revoke it before use. Authorization/revocation are
  audited; consumption replaces the old token and re-applies current forum
  policy. The control does not directly create/delete topics or change
  category, tags, visibility, mapping identity, or authorship. Focused retry
  and reconciliation contract: 18/18; complete plugin suite: 80/80; lint: PASS.
- Explore bridge-aware editable admin settings, content lane management, source
  mappings, duplicate detection, richer native notifications, and operations
  topics/categories.
- Explore whether the plugin/control-plane model should support trusted posting, notifications, or admin dashboard messages on behalf of configured users. Treat impersonation/delegated posting as high-trust and audit-sensitive, not a casual publishing default.
- Design the plugin surface so Astro, Statamic, and future adapters can use the same Discourse-side concepts.

## Future Frameworks And Platforms

- Use DiscussionBridge for Statamic as the next parallel naming/integration lane when that work begins.
- Research future Discourse integrations for Next.js, Nuxt, SvelteKit, Hugo/static sites, and Cloudflare Workers.
- Design metadata so Discourse-specific fields can coexist with generic discussion fields without breaking existing Discourse users.
- Define, but do not fully implement yet, the future shape for one Astro site connected to multiple Discourse instances. Use cases include public plus private communities, regional/language forums, internal staff plus public user forums, and central advocacy or industry organizations pushing canonical content into chapter or regional discussion communities.

## Dependency Audit

- [x] Replayed the dependency audit on 2026-08-22 and identified direct versus
  transitive advisories.
- [x] Applied targeted compatible updates only: Mermaid `11.17.0`, Astro
  `7.2.4`, Starlight `0.41.7`, DOMPurify `3.4.14`, JS-YAML `4.3.1`, Nano ID
  `3.3.18`, PostCSS `8.5.26`, Sharp `0.35.3`, and SVGO `4.0.2`.
- [x] Re-ran `npm audit`: zero known vulnerabilities.
- [x] Re-ran the complete build/test contract: 118/118 pass.
- [x] Replayed `npm pack --dry-run`: 53 files, 95,458-byte tarball,
  415,141 bytes unpacked; no publication occurred.
- Continue to avoid `npm audit fix --force`; future advisories require the same
  targeted review and complete regression replay.
