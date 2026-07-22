# Discussion Bridge for Astro Machine Manual

This is the exact, reusable implementation memory for Discussion Bridge for
Astro. Use it with the [Human Manual](./HUMAN_MANUAL.md) to generate a
site-specific runbook. It may name variables, paths, endpoints, and scopes; it
must never contain real secret values.

## 1. Product And Package

```yaml
product: Discussion Bridge for Astro
package: astro-discussion-bridge
package_root: packages/astro-discussion-bridge
cli_source: packages/astro-discussion-bridge/src/cli.ts
sync_source: packages/astro-discussion-bridge/src/sync/index.ts
import_source: packages/astro-discussion-bridge/src/import-existing.ts
public_docs: docs
default_starlight_dir: src/content/docs
default_astro_dir: src/content
```

Package commands run from the consuming Astro project root:

```sh
npx astro-discussion-bridge --help
npx astro-discussion-bridge check-discourse [options]
npx astro-discussion-bridge publish-new [docsDir] [options]
npx astro-discussion-bridge sync-existing [docsDir] [options]
npx astro-discussion-bridge publish-and-sync [docsDir] [options]
npx astro-discussion-bridge import-existing [docsDir] --topic URL[,URL] [options]
```

`sync` is a backward-compatible alias for `publish-new`; do not use it in new
runbooks because the side effect is less obvious.

## 2. Site-Specific Generation Inputs

Collect and validate before generating a runbook:

```yaml
site_name: required
repository: required
project_root: required
environment: dev | staging | live | placeholder
framework_preset: astro | starlight
site_url: required absolute HTTPS URL for live use
discourse_url: required absolute URL
api_username: required for live writes
publishing_key_location: private reference only; never key value
diagnostics_key_location: private reference only; never key value
active_target: optional logical target name
comments_display: simple | full | fullInteractive
deployment_target: optional, e.g. Cloudflare Pages
verification_urls: required for live lanes
lanes:
  - name: required
    docs_dir: required
    route_base: optional
    source_mode: astro-managed | discourse-managed | discourse-imported
    category_id: required for create/update intent
    tags: []
    listed: true | false
    managing_page_rule: exactly one managing Astro page per topic
    recovery_owner: required for production
```

Reject or pause generation when source mode, route base, public URL, destination
forum, category, or managing page is unknown.

## 3. Key Model

### Publishing Key

Use for `publish-new`, `sync-existing`, and `publish-and-sync`.

Exact settled granular scopes:

```text
categories:list
categories:show
posts:edit
posts:list
search:show
tags:list
topics:write
topics:update
topics:read
topics:status
```

Known allowed-parameter entries from the Discourse granular-key UI:

```text
categories show: id=any
posts edit: id=any
search show: q=any, page=any
topics write: topic_id=any
topics update: topic_id=any, category_id=any
topics read: topic_id=any, external_id=any
topics status: topic_id=any, category_id=any, status=any, enabled=any
```

The API user also needs the forum/category authority required by the action.
Retitling replied topics and changing listing status may require staff or
moderator capability even when the key has the matching endpoint scope.

### Diagnostics Key

Current fallback: global/admin-capable, read-oriented setup key. Use for
`check-discourse`, site metadata/capability reads, and controlled reconciliation
when the granular publishing key returns `403` or insufficient data. Do not put
this key in routine runtime/deploy paths.

Target future state: a granular diagnostics/read key after required Discourse
site metadata scopes are confirmed.

### Environment Variables

```text
DISCOURSE_URL
SITE_URL
DISCOURSE_API_USERNAME
DISCOURSE_API_KEY
DISCOURSE_DIAGNOSTICS_API_KEY
DISCOURSE_CATEGORY_ID
DISCOURSE_TAGS
DISCUSSION_TARGET
DISCUSSION_PAGE_URL
DISCOURSE_NOTIFY_RECIPIENTS
DISCOURSE_TITLE_MIN_LENGTH
DISCOURSE_MAX_TOPIC_TITLE_LENGTH
DISCOURSE_MAX_POST_LENGTH
DISCOURSE_MAX_TAGS_PER_TOPIC
DISCOURSE_MAX_TAG_LENGTH
```

Resolution behavior:

- CLI values override environment values.
- `check-discourse` prefers `--diagnostics-api-key` or
  `DISCOURSE_DIAGNOSTICS_API_KEY`, then falls back to the publishing key.
- `--dry-run` publish/sync does not require API username/key.
- live publish/sync/import requires `DISCOURSE_API_USERNAME` and
  `DISCOURSE_API_KEY`.

## 4. Source-Mode Contract

| Source mode | Required operational guard | Writable by publish/sync? |
| --- | --- | --- |
| `astro-managed` | explicit ownership decision | yes |
| `discourse-managed` | `discussionSync: false` | no |
| `discourse-imported` | `discussionSync: false` until explicit promotion | no |

Current implementation facts:

- `discussionSync: false` is read and enforced by sync preflight.
- A guarded page reports `skipped` with reason `discussionSync is false`.
- Frontmatter parse/update paths accept LF and CRLF boundaries and preserve the
  source file's existing line-ending style when writing updates.
- Sync preflight remains guard-driven, while the reviewed import path generates
  `discussionSourceMode: discourse-imported` and boolean `discussionSync: false`.
- Import preserves the Discourse topic ID and URL.

Therefore, the required Alpha import procedure is:

1. run `import-existing --dry-run`;
2. run the live import only after reviewing the destination;
3. verify the generated source mode, boolean sync guard, topic ID, and URL;
4. review frontmatter before any directory-wide sync;
5. remove the guard only after explicit promotion to Astro ownership.

## 5. Frontmatter Contract

Line-ending invariant:

```yaml
accepted_frontmatter_boundaries:
  - LF
  - CRLF
update_behavior: preserve existing source line-ending style
required_regression_case: discussionSync false is enforced for CRLF frontmatter
required_write_regression: frontmatter updates preserve CRLF source style
```

Publishing may write:

```yaml
discussionTarget: "community"          # only when a target is active
discourseTopicId: 123
discourseTopicUrl: "https://forum.example.com/t/example/123"
discussionSourceHash: "sha256-value"
discussionLastSyncedAt: "ISO-8601 timestamp"
```

Import currently writes:

```yaml
discussionTarget: "community"          # optional
discourseTopicId: 123
discourseTopicUrl: "https://forum.example.com/t/example/123"
discussionSourceHash: "sha256-value"
discussionImportedAt: "ISO-8601 timestamp"
discussionCommentsDisplay: "full"      # only when requested
```

Operator-supplied controls and overrides include:

```yaml
discussionSync: false
discussionCommentsDisplay: simple      # simple | full | fullInteractive
discussionSummary: |
  Curated Discourse-safe companion content.
discourseCategoryId: 5
discussionTags: "product, docs"
```

## 6. Command Contract And Expected Results

### `check-discourse`

Reconciliation contract:

```yaml
explicit_existing_topic:
  input: discourseTopicId
  embed_config: '{ topicId }'
  page_url_reconciliation_required: false
  verification: read and validate the explicit topic directly
url_owned_topic:
  input: no discourseTopicId
  embed_config: '{ discourseEmbedUrl: embedUrl }'
  page_url_reconciliation_required: true
```

Keep `embed-info`/exact-URL-search results in diagnostics even for explicitly
linked topics, but do not treat a `404` or no URL owner as a topic failure when
the explicit topic is healthy.

Read-only endpoints may include:

```text
/site/settings.json
/site.json
/categories.json
/tags.json
/embed/info?embed_url=...
exact URL search fallback
```

Canonical command:

```sh
npx astro-discussion-bridge check-discourse \
  --discourse-url https://forum.example.com \
  --category-id 5 \
  --tags product,docs \
  --page-url https://docs.example.com/example-page/
```

Expected output sections:

```text
Discourse URL
Site settings
Site capabilities
Limits
Tag capabilities
Category
Requested tags / Tag inventory / Tag issues
Setup issues / Setup warnings
Reconciliation lookup (when page URL supplied)
```

Exit code is nonzero when tag issues or setup issues exist. Unavailable metadata
may be reported as warnings/unknown values.

### `publish-new`

Creates only missing companion topics and skips linked pages.

```sh
npx astro-discussion-bridge publish-new src/content/docs --dry-run --details
npx astro-discussion-bridge publish-new src/content/docs
```

Expected per-page statuses include `dry-run-create`, `created`, `skipped`, and
failure output. A live create writes topic link and sync metadata to frontmatter.

### `sync-existing`

Updates only pages with `discourseTopicId`; skips missing links and guarded pages.

```sh
npx astro-discussion-bridge sync-existing src/content/blog \
  --route-base blog --dry-run --details
npx astro-discussion-bridge sync-existing src/content/blog --route-base blog
```

Expected statuses include `dry-run-update`, `updated`, `unchanged`, and
`skipped`. `--force` rewrites the managed first post even when the source hash is
unchanged. `--unlist` changes topic visibility and may require staff authority.

### `publish-and-sync`

Creates missing topics and syncs linked topics in one explicit run:

```sh
npx astro-discussion-bridge publish-and-sync src/content/releases \
  --route-base releases --dry-run --details
```

Use only after checking that every non-Astro-managed page in the directory has
`discussionSync: false`.

### `import-existing`

```sh
npx astro-discussion-bridge import-existing src/content/docs \
  --topic https://forum.example.com/t/example/123 \
  --site-url https://docs.example.com \
  --comments-display full \
  --dry-run
```

Hero options:

```text
--hero-image PATH|URL
--hero-alt TEXT
```

Validation contract:

```yaml
pairing: bidirectional_required
hero_alt: non_empty_after_trim
explicit_errors:
  - bare option
  - inline-empty value
  - whitespace-only alt
  - hero image without alt
  - hero alt without image
output:
  placement: leading image before raw body
  image_syntax: angle-wrapped destination
  alt_escaping: supported
  internal_path_spaces: supported
```

Prune option:

```text
--prune-profile community-call-to-action
```

```yaml
profile: community-call-to-action
mode: opt_in
removal_scope: trailing block after horizontal rule
markers_all_required:
  - Join the Conversation Today
  - /signup
  - Please share how
  - /c/stories/
failure_before_io:
  - no verified boundary
  - unknown profile
  - duplicate profile
  - bare option
  - empty value
success_metadata:
  discussionImportPolicy: pruned:community-call-to-action
```

Accepted topic references: numeric ID or URL whose host matches
`DISCOURSE_URL`. Expected statuses: `dry-run-import`, `dry-run-overwrite`,
`imported`, `skipped`. Existing files are skipped unless `--overwrite` is used.
After live import, apply the source-mode guard described above.

### Alpha Import Discovery / Queue Contract

```yaml
selection_modes:
  curated:
    input: explicit topics or manifest
    ordering: preserve caller-supplied order
  next_in_category:
    category_discovery: list available categories and subcategories
    category_selector: ID or unambiguous slug/name
    category_selection: required before queue preview
    default_order: created_at ascending
    tie_breaker: topic ID ascending
filters_optional:
  - tags
  - created_at range
  - open/closed status
  - limit
ordering_optional:
  - oldest by created_at
  - newest by created_at
  - natural topic title/name for numbered collections
forbidden_order_fields:
  - bumped_at
  - last reply
  - latest activity
pre_import:
  preview_selected_category_queue: required
  preview_candidates: required
  exclude_already_imported_topics: required
alpha_requirement: true
```

The stable comparison key for the default queue is `(created_at, topic_id)`.
Community replies must never reorder publishing candidates.

Manifest refresh gate:

```yaml
command: import-existing --manifest PATH --overwrite
purpose: deterministic multi-page refresh with per-topic policy
schema:
  format: strict_json
  top_level_keys: [version, imports]
manifest_entry_fields:
  - topic
  - requiredTags
  - output
  - commentsDisplay
  - heroImage
  - heroAlt
  - pruneProfiles
ordering: preserve caller-supplied manifest order
reject:
  - duplicate_topics
  - manifest_and_direct_option_mixing
validation:
  - runner_revalidation
  - dry_run_collision_and_path_preflight
  - path_containment_before_writes
write_model:
  - stage_all_entries_before_writes
  - exclusive_atomic_creation_without_overwrite
  - atomic_overwrite_with_rollback
regression_coverage:
  - slug_drift
  - destination_race
  - zero_byte_output
  - path_traversal
blanket_update_all_safe: false
package_gate: pass_51_of_51
obbba_site_live_proof: pass_topics_434_747_751_752_753
```

Every import route has two validated contracts:

```yaml
WHEREFROM:
  discourse_base_or_target: required
  topic_identity_or_curated_manifest_order: required
  category: required_when_lane_uses_one
  required_tags_and_filters: validate_against_live_source_before_write
WHERETO:
  docs_dir: deterministic Astro content root
  output: safe relative .md or .mdx file
  public_identity: site_url + route_base
  navigation: Astro navigation lane
  invariants: [deterministic, reviewable, path_contained, never_latest_activity]
manifest_v1_mapping:
  wherefrom: [topic, requiredTags]
  whereto: [docsDir, output, site-url, route-base, astro_navigation_lane_map]
future_schema_note: nested from/to may be considered later; do not redesign v1 now
```

`requiredTags` comparisons are case-insensitive assertions against live
Discourse tags and fail before any write. Discourse topic tags may arrive as
strings or objects. `output` must be a safe relative `.md` or `.mdx` path;
nested parent directories are created only after the entire destination passes
validation and containment checks.

### Starlight Imported-Page Integration

Stock Starlight `docsSchema()` may strip custom bridge fields, and imported
Markdown pages do not contain a hand-written `<Discussion>` component. A
Starlight consumer must:

1. extend `docsSchema` with the Discussion Bridge frontmatter fields;
2. install `src/components/MarkdownContent.astro` at the page boundary;
3. wire it through `starlight.components.MarkdownContent`;
4. remove per-page explicit `<Discussion>` instances when the boundary override
   is active, preventing duplicate discussions.

Verification requires exactly one discussion instance per linked page with the
expected topic ID and display mode.

## 7. Common CLI Options

```text
--dry-run
--details
--target NAME
--route-base PATH
--discourse-url URL
--site-url URL
--api-username USER
--api-key KEY
--tags TAG[,TAG]
--category-id ID
--force
--unlist
--notify-on-failure
--notify-recipients USER[,USER]
--title-min-length N
--max-topic-title-length N
--max-post-length N
--max-tags-per-topic N
--max-tag-length N
--skip-title-validation
```

Do not put real keys on a command line in a runbook; use protected environment
variables so keys do not enter shell history.

## 8. Lanes And Route-Base Rules

URL derivation joins `siteUrl`, normalized `routeBase`, and the Markdown path
relative to `docsDir`, with `index` collapsed to its parent path.

Examples:

```text
docsDir=src/content/blog
file=src/content/blog/content-lanes.md
routeBase=blog
result=https://docs.example.com/blog/content-lanes/

docsDir=src/content/releases
file=src/content/releases/2_1.md
routeBase=releases
result=https://docs.example.com/releases/2_1/
```

Pre-write invariants:

- one managing Astro source page per Discourse topic in a run;
- no duplicate managed page URL in a run;
- active `discussionTarget` must match `--target`/`DISCUSSION_TARGET`;
- display-only comparison pages use `discussionSync: false`;
- category and tags are checked before live writes;
- computed URLs are reviewed with `--details`.

## 9. Comments Display Contract

```js
discussionBridge({
  provider: "discourse",
  discourseUrl: "https://forum.example.com",
  siteUrl: "https://docs.example.com",
  comments: {
    display: "full", // simple | full | fullInteractive
    embedHeight: "800px",
    className: "discussion-bridge-embed",
  },
  replies: {
    refreshOnPageLoad: true,
    refreshEndpoint: "/api/discourse/topics/{topicId}.json",
    renderMermaid: true,
  },
});
```

- `simple`: Discourse embeddable-comments script; limited display control and
  metadata.
- `full`: Astro-rendered replies; interaction remains in Discourse; browser
  refresh needs CORS or same-origin proxy.
- `fullInteractive`: Discourse full-app iframe; requires full-app embedding and
  compatible sign-in/cookie configuration.

Rendering boundary:

```yaml
fullInteractive:
  owner: cross_origin_Discourse_iframe
  host_Astro_transforms_or_CSS_cross_boundary: false
  mermaid_and_table_styling_owner: Discourse
  ordinary_topic_434_mermaid_theme_result: SVG
  full_app_embed_topic_434_mermaid_result: raw_code
  full_app_embed_theme_component_js_loaded: false
  table_parse: pass
  table_presentation: weak_until_embedded_CSS
  immediate_table_path: Discourse common/embedded.scss targeted by embed class
  mermaid_embed_solution: open_extension_plugin_or_upstream
full:
  owner: Astro_rendered_bridge_component
  parity_review: pass_d7800d7_code_boss_final
  renderMermaid_default: true
  renderMermaid_opt_out: false
  mermaid_version: 11
  security_level: strict
  loading: lazy_when_reply_contains_mermaid
  failure: preserve_source_and_allow_module_load_retry
  tables: readable_borders_padding_and_horizontal_overflow
  repeated_components: claim_each_replies_container_once
embed_class_hooks:
  comments.className: forwarded_to_window.DiscourseEmbed.className
  embedClassName_components: [Discussion, DiscourseDiscussion, DiscourseComments]
```

The lazy Mermaid chunk is emitted during a `full`-capable build and may trigger
Vite's greater-than-500-kB warning, but browsers fetch it only when a full-mode
reply contains Mermaid.

Verification matrix:

```text
simple: embed loads, full discussion link works
full: build/render fetch works, browser refresh works, unavailable state works
fullInteractive: logged-out load, logged-in reply/like/quote, mobile height/CSP
```

For a live signed-in interaction item, record sanitized evidence:

```yaml
topic_id: expected topic
post_number: created test post number
direct_post_url: public verification URL
content_marker: non-sensitive test text
post_count_after: observed count
astro_embed_signature_after:
  topic_id: expected topic
  full_app: true
  retired_renderer: absent
private_account_identifier: omit
```

Creating the reply is an intentional browser-session action, not a package
publish/sync/import operation. Verify the forum result read-only afterward.

Fresh-import gate matrix:

```yaml
cases:
  - { hero: false, prune: false }
  - { hero: true, prune: false, alt_text: required }
  - { hero: false, prune: true }
  - { hero: true, prune: true, alt_text: required }
per_case_assertions:
  - discussionSourceMode == discourse-imported
  - discussionSync == false
  - topic ID and URL preserved
  - build/deploy/live render pass
  - comments pass
  - no writeback
```

Do not use an existing-page migration or signed-in interaction result as a
substitute for this matrix.

Component propagation invariant:

```text
Discussion.astro -> DiscourseDiscussion.astro -> DiscourseComments.astro
```

If `topicId` is supplied, every layer must preserve it and the browser embed
configuration must use `{ topicId }`. Regression tests must cover this path.

Shipped browser declaration contract:

```ts
type DiscourseEmbedConfig =
  | { topicId: number; discourseEmbedUrl?: never }
  | { discourseEmbedUrl: string; topicId?: never };

// Both alternatives may also include:
// fullApp?: boolean
// embedHeight?: string
```

Do not model `topicId` and `discourseEmbedUrl` as simultaneously required or
freely co-present; they represent alternative ownership/linking paths.

Planned boundary-credit contract (not implemented in the current reviewed
artifact):

```yaml
comments_credit:
  configurable: required
  candidate_text:
    - Discussion connection by Discussion Bridge
    - Discourse connection by Discussion Bridge
  canonical_product_link: required
  visually_secondary: required
  accessible: required
  supported_modes: [simple, full, fullInteractive]
  hard_coded_in_site_content: false
  final_default_and_schema: unresolved
```

## 10. Cloudflare Pages / Domain Verification

Cloudflare-specific values are site inputs, not package constants. Record:

```yaml
repository: canonical repository URL
production_branch: main
root_directory: consuming Astro project path
build_command: npm run build
output_directory: site-specific Astro output, commonly dist
custom_domain: exact public hostname
astro_site: exact public URL
discussion_bridge_site_url: exact public URL
discourse_embed_host: exact hostname
account_id: explicit deployment account identifier in approved site config
worker_name: exact Worker name when using Workers
worker_version: deployment evidence
workers_dev_endpoint: deployment verification endpoint
```

When more than one Cloudflare account is available, pin the intended
`account_id` in the approved deployment configuration so CLI/CI selection is
deterministic. Manuals and support bundles should describe the placement without
copying private account labels or login email addresses.

Verification:

1. Pages deployment corresponds to the intended commit and canonical source.
2. Custom domain resolves and HTTPS is valid.
3. Astro `site`, Discussion Bridge `siteUrl`, CLI `SITE_URL`, and the public
   hostname agree.
4. Discourse allows that exact embed hostname.
5. A lane page and its companion topic resolve in both directions.
6. The selected comments mode works on desktop and mobile.
7. Cache bypass or narrowly scoped purge is tested before declaring stale
   output a failed sync/deploy.
8. The Worker endpoint and canonical domain serve the intended candidate.
9. Generated HTML contains the expected package/topic signature and does not
   contain the retired renderer signature.

Before deployment commits, inspect the consuming site's worktree. Preserve and
report unrelated pre-existing changes; do not absorb them into deployment-only
commits.

Build the exact tracked candidate from a clean checkout or detached worktree
before release. A dirty local deletion can hide a stale tracked page or asset
reference and make the working-tree build pass when the committed candidate
fails. Isolate the correction in its own reviewed commit, rebuild that exact
commit, and leave unrelated unstaged changes and untracked artifacts untouched.

## 11. Known Failures And Recovery

| Failure | Detection | Recovery |
| --- | --- | --- |
| Missing credentials | CLI missing-configuration message | Set protected env vars; rerun dry run. |
| Site metadata `403` | `check-discourse` unavailable/warning | Use diagnostics key or explicit preflight limits. |
| Title/body/tag validation | Local preflight failure | Correct content/settings; rerun dry run. |
| Embed URL already taken | Publish error or reconciliation output | Prove ownership, resolve with diagnostics, then link/retry. |
| Page URL has no embed owner but `topicId` is explicit | Embed-info `404` or exact search has no result | Validate the explicit topic and generated `{ topicId }`; do not auto-relink. |
| Wrong category/route | `--details` or post-write verification | Stop writes; correct lane; assess/relink affected topic explicitly. |
| Active target mismatch | `skipped` with target reason | Use the matching `--target`; do not remove labels casually. |
| `discussionSync is false` | guarded page skipped | Expected for display/import/Discourse-owned pages; remove only on approved promotion. |
| Topic deleted | topic read failure | Do not auto-recreate; decide restore, relink, or replacement. |
| First post deleted | missing-first-post failure | Restore or choose explicit repair; do not silently replace. |
| Discourse offline | clear network/API failure | Preserve Astro shell; retry after service recovery. |
| Stale CDN output | source/topic correct but public view stale | Verify commit/topic, bypass cache, then purge relevant cache only. |

CLI/build output is authoritative. Failure-notification PMs are best effort and
must not be treated as the only failure record.

## 12. Standard Verification Loop

```text
1. Confirm intended package build/version.
2. Confirm lane inputs and source modes.
3. Run check-discourse.
4. Run intended operation with --dry-run --details.
5. Review every page URL, target, topic ID, category, tag, and reason.
6. Run live command without changing other arguments.
7. Verify Discourse topic, first post, metadata, tags, and listing state.
8. Verify Astro source/frontmatter and local build.
9. Verify deployed URL, comments mode, and cache state.
10. Sanitize logs before sharing; update manuals with newly confirmed facts.
```

## 13. Multi-Target Frontmatter And Execution

The frontmatter values are YAML scalars. CSV fields preserve target order; the
binding map is serialized JSON:

```yaml
discussionSourceMode: discourse-imported
discussionSync: false
discussionTarget: repeal-obbba
discussionSourceTarget: repeal-obbba
discussionTargets: repeal-obbba,citizen-activist
discussionPublishTargets: citizen-activist
discussionPrimaryTarget: repeal-obbba
discussionTargetBindings: '{"repeal-obbba":{"topicId":434,"topicUrl":"https://forum.repealobbba.org/t/434","status":"synced"},"citizen-activist":{"status":"failed","lastError":"sanitized target error","lastAttemptedAt":"2026-07-22T00:00:00.000Z"}}'
```

Operate one target per CLI invocation:

```powershell
npx astro-discussion-bridge publish-and-sync src/content/docs --target citizen-activist --dry-run
npx astro-discussion-bridge publish-and-sync src/content/docs --target citizen-activist
```

`discussionSync: false` does not authorize source writeback. The named source
remains protected for `discourse-imported` and `discourse-managed`; only a target
listed in `discussionPublishTargets` is writable. New targeted imports set both
legacy `discussionTarget` and `discussionSourceTarget`. A legacy imported page
without the latter protects its legacy `discussionTarget`.

Run ordered `publishOnBuild.lanes` sequentially when build-time publishing is
intended. Each lane needs `targetName` and may override `discourseUrl`,
`apiKey`/`apiUsername`, or named `apiKeyEnv`/`apiUsernameEnv`. Do not put secret
values in frontmatter, manuals, or committed configuration.

On failure, inspect only the active target's binding. Preserve other successful
bindings and retry with the failed `--target`. A stored error is whitespace-
normalized, truncated, and paired with `lastAttemptedAt`. A reconciled 422
embed/title collision records the discovered owning topic in the active binding
and clears its failure state. Invalid binding JSON or shape must fail before
network access.

## 14. Alpha Release And Support Inputs

```yaml
release_scope_doctrine:
  alpha: nearly_feature_complete_for_declared_product_promise
  scope_model: cumulative
  source_of_truth: existing_dashboard_and_build_launch_checklists
  new_gates_displace_existing_gates: false
  removal_authority: explicit_Phil_direction
  beta_primary_work:
    - usability
    - compatibility
    - reliability
    - performance
    - packaging
    - documentation
    - installation
    - recovery
    - support
    - presentation
  beta_missing_capability_from_user_evidence: allowed
  planned_major_pillar_deferral_to_beta: prohibited_by_default
  long_term_and_layer_3_outside_declared_promise: later
tiers:
  tier_1:
    transport: Discourse_API
    plugin_required: false
    role: free_self_serve_floor
  optional_discourse_plugin:
    alpha_vertical_slice_status: accepted_Alpha_pending_design_implementation_and_proof
    v0_1: fullInteractive_Mermaid_table_parity_plus_architecture_tests
    not_v0_1: [full_control_plane, post_as_user, PM_automation, general_many_to_many]
    tier_1_dependency: false
    logical_workspace_path: DiscussionBridge/plugins/discourse-discussion-bridge
    physical_github_repo: unresolved_Boss_folder_decision
multi_target_implementation:
  commit: 60e41e1
  review: Code_Boss_PASS
  tests: 62_of_62_PASS
  package_check: PASS
  package_dry_run: PASS
  frontmatter:
    discussionTargets: ordered_CSV_target_names
    discussionPublishTargets: explicit_writable_subset_CSV
    discussionSourceTarget: explicit_protected_source
    discussionTargetBindings: JSON_scalar_map_by_target
    discussionPrimaryTarget: required_when_multiple_linked
  cli: one_explicit_--target_per_run
  publish_on_build: ordered_sequential_lanes
  recovery: retain_success_retry_failed_target_idempotently
  malformed_binding_state: fail_before_network
  public_export: astro-discussion-bridge/targets
alpha_topology_proof:
  status: implementation_complete_live_proof_pending
  production_obbba_target: https://forum.repealobbba.org
  citizen_activist_target:
    canonical: https://forum.citizenactivist.network
    public_description: A community of activists
    hostname_policy: literal_forum_prefix_identity_in_copy
    cloudflare_account_ownership: unresolved_Ops_decision
  bounded_demo_target: https://forum.discussionbridge.dev
  exact_matrix:
    - { from: same_selected_onebigbeautifulbill.us_page, to: https://forum.repealobbba.org }
    - { from: same_selected_onebigbeautifulbill.us_page, to: https://forum.citizenactivist.network }
    - { from: bounded_demo_credit_pages, to: https://forum.discussionbridge.dev }
    - { from: multiple_Astro_public_sites, to: https://forum.repealobbba.org }
  proof_meaning:
    one_page_multiple_forums: first_two_edges
    multiple_sites_one_forum: fourth_edge
  contract:
    source_target_distinct_from_publication_discussion_targets: required
    target_list: explicit_ordered
    binding_fields: [topic_id, topic_url, source_hash, last_synced_at, status, last_error, last_attempted_at]
    presentation_policy: explicit_primary_plus_accessible_additional_links
    source_no_writeback: preserve_for_discourse_imported_and_discourse_managed
    comments_presentation: explicit_primary_plus_additional_linked_or_rendered
    silent_primary_selection: prohibited
    write_semantics: recoverable_partial_success
    successful_bindings_on_other_target_failure: retain
    retry: target_specific_idempotent_no_duplicate_topics
    target_specific_surfaces: [diagnostics, dry_run, CLI_output, manuals, live_proof]
  required_gate:
    - configure_named_target
    - select_clearly_labeled_pages
    - run_target_diagnostics
    - verify_build_and_live_page_topic_binding
    - prove_no_cross_target_writeback
  claim: topology_many_to_many_across_sites_pages_forums
  later_scope: general_many_to_many_administration
```

```yaml
release_channel:
  alpha: GitHub release plus repository-installable
  npm: held until late Beta
support:
  formal_work: GitHub Issues
  setup_and_field_reports: Discourse Alpha Support category
  email_intake: alphasupport@discussionbridge.dev -> Discourse
  private_help: paid implementation/migration
release_prerequisites:
  - Code Boss pass/fail result recorded against the exact release candidate
  - blocking code-review edits complete and re-reviewed where required
  - Bridge Boss technical verification complete
  - Manual Boss quality review complete
  - Human and Machine Manuals ready for the exact release
  - Product Boss documentation sign-off recorded
  - Product Boss release approval recorded
  - live Alpha Support category verified
  - email route verified
  - README, docs, metadata, demos, and release notes agree
  - package tests and demo build pass
  - dry-run CLI checks pass
  - at least one controlled live smoke sync passes
```

Support bundles may include package/framework versions, sanitized commands and
output, lane name, public URLs, category ID, tags, key type, and dry-run result.
They must not include key values, credentials, private account data, or
production secrets.

## 14. Durable Update Rule

When implementation confirms or changes a command, field, scope, endpoint,
failure, recovery path, or deployment invariant:

1. update this machine manual;
2. update the corresponding human instruction when operator behavior changes;
3. update the focused guide or checklist;
4. route implementation gaps to Bridge Boss and manual-quality review to Manual
   Boss.
