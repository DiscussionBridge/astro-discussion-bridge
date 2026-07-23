# OBBBA Machine Runbook: onebigbeautifulbill.us and forum.repealobbba.org

Status: existing proof-page package migration and live fullInteractive interaction verified; fresh-import Alpha gate open
Last verified from workspace facts: 2026-07-21  
Companion: [OBBBA Human Runbook](./OBBBA_ONEBIGBEAUTIFULBILL_HUMAN.md)

No secret values belong in this file.

```yaml
alpha_feature_lock:
  cumulative_OBBBA_gates_preserved: true
  allowed_new_work:
    - close_existing_gate
    - fix_exercised_behavior
    - explicitly_approved_scope_change
  discussionbridge_dev_dogfood_gate: separate_not_a_replacement
source_mode_import_update:
  implementation: 1731547
  tests: 72/72
  accepted: [discourse-imported, discourse-managed]
  default: discourse-imported
  rejected: [astro-managed]
  manifest_field: sourceMode
  discussionSync: false
  OBBBA_policy_change: none
```

## 1. Resolved System Inputs

```yaml
site:
  name: onebigbeautifulbill.us
  repository: https://github.com/OneBigBeautifulBill/onebigbeautifulbill.us.git
  local_root: 'C:\CodeProjects\Projects\OBBBA\sites\onebigbeautifulbill.us\astro'
  branch: main
  package_repo_commit: 7aadcf63c76b8ebd9e0c9383b5c7386ad704396e
  obbba_integration_commit: f277171
  obbba_deployment_fix_commit: e9c279dbe1b0bec512ff7fcf0c9ec6f17f0dd6b8
  obbba_manifest_commit: 64a4f94
  stale_starter_removal_commit: a225f00
  tag_routed_import_commit: bd591c9
  framework: Astro 7 + Starlight
  site_url: https://onebigbeautifulbill.us
  discourse_url: https://forum.repealobbba.org
  deployment_adapter: '@astrojs/cloudflare'
  cloudflare_worker_name: onebigbeautifulbill
  cloudflare_account_placement: current_operational_account_sanitized
  cloudflare_ownership_boundary: unresolved_obbba_vs_citizen_activist

proof_lane:
  name: title-i-section-10101-impact
  file: 'src/content/docs/title i/10101-impact.mdx'
  public_url: https://onebigbeautifulbill.us/title-i/10101-impact/
  route_base: title-i
  source_mode: discourse-imported
  sync_enabled: false
  import_policy: manually-pruned
  topic_id: 434
  topic_url: https://forum.repealobbba.org/t/sec-10101-re-evaluation-of-thrifty-food-plan-impact/434
  comments_display: fullInteractive
  category_id: unresolved
  tags: unresolved
  managing_page_rule: no Astro writeback until explicit promotion

current_integration:
  package_installed: true
  package_version: 0.1.0
  alpha_artifact: vendor/astro-discussion-bridge-0.1.0-alpha-69846cf-64a151bd.tgz
  alpha_artifact_sha256: 64a151bd1faa7f7453f38b4c8d1b3b5e7bf79a93cfcd4bd48444369c17f2afac
  package_commits:
    - 54bc429
    - 6c01973
    - a646c6b
    - 69846cf
  page_component: astro-discussion-bridge/Discussion.astro
  previous_comments_component: src/components/DiscourseComments.astro
  previous_comments_api_route: src/pages/api/discourse-comments.json.ts
  source_metadata_present: true
  latest_package_main_commit: d7800d7
  latest_package_main_suite: pass_51_of_51
  latest_package_code_boss_review: final_pass
  latest_package_deployed_to_obbba: false
```

Canonical hostname assertion:

```text
forum.repealobbba.org
```

Reject `forum.repealobba.org` or any other spelling unless domain ownership is
explicitly changed and all source/deployment/embed references are migrated.

## 2. Current Frontmatter Contract

File:

```text
C:\CodeProjects\Projects\OBBBA\sites\onebigbeautifulbill.us\astro\src\content\docs\title i\10101-impact.mdx
```

Required current fields:

```yaml
discussionSourceMode: discourse-imported
discussionSync: false
discourseTopicId: 434
discourseTopicUrl: https://forum.repealobbba.org/t/sec-10101-re-evaluation-of-thrifty-food-plan-impact/434
discussionImportedFrom: https://forum.repealobbba.org/t/sec-10101-re-evaluation-of-thrifty-food-plan-impact/434
discussionImportPolicy: manually-pruned
discussionCommentsDisplay: fullInteractive
```

Pre-write assertion:

```text
discussionSourceMode == discourse-imported
discussionSync == false
discourseTopicId == 434
discourseTopicUrl host == forum.repealobbba.org
```

Any failed assertion blocks publish/sync.

The proof MDX uses CRLF line endings. Frontmatter parsing and update paths must
accept both LF and CRLF delimiters and preserve the file's existing line-ending
style when updating frontmatter.

The shipped `window.DiscourseEmbed` declaration models mutually exclusive
explicit-topic and URL-owned alternatives: `topicId` or `discourseEmbedUrl`,
with optional `fullApp` and `embedHeight`.

## 3. Current Build Contract

```yaml
package_manager: npm
install_command: npm ci
build_command: npm run build
package_reference: file:vendor/astro-discussion-bridge-0.1.0-alpha-69846cf-64a151bd.tgz
astro_site: https://onebigbeautifulbill.us
wrangler:
  compatibility_date: '2026-06-30'
  compatibility_flags:
    - global_fetch_strictly_public
  main: '@astrojs/cloudflare/entrypoints/server'
  assets_directory: ./dist/client
  assets_binding: ASSETS
  observability: true
```

Known build conditions:

```yaml
known_warning:
  - 'Entry docs -> 404 was not found'
  - large chunk warning
  - punycode deprecation
sandbox_constraints:
  - external OG font fetch may fail without network access
  - Wrangler profile log writes may fail under sandbox restrictions
deployment_shaped_result: pass after Alpha artifact install
clean_install_note: wrapper timed out after 184 seconds, but npm ls subsequently resolved astro-discussion-bridge@0.1.0 and the full build passed
wrangler_deploy:
  result: pass
  worker: onebigbeautifulbill
  version: cde279d5-1c27-452c-964f-59d8dfd7c320
  workers_dev_endpoint: https://onebigbeautifulbill.systems-b95.workers.dev
  deterministic_account_id_in_wrangler_jsonc: true
```

Verification command:

```powershell
Set-Location -LiteralPath 'C:\CodeProjects\Projects\OBBBA\sites\onebigbeautifulbill.us\astro'
npm run build
```

Expected output includes the generated `/title-i/10101-impact/` route. Do not
classify a new failure as a known warning without matching the exact condition.

## 4. Current Package And Comments Contract

```yaml
display: fullInteractive
component: astro-discussion-bridge/Discussion.astro
topic_id: 434
topic_url: https://forum.repealobbba.org/t/sec-10101-re-evaluation-of-thrifty-food-plan-impact/434
embed_url: https://onebigbeautifulbill.us/title-i/10101-impact/
fallback_api: /api/discourse-comments.json?topicId=434
discourse_base_url_default: https://forum.repealobbba.org
```

Astro integration:

```js
discussionBridge({
  preset: "starlight",
  discourseUrl: "https://forum.repealobbba.org",
  siteUrl: "https://onebigbeautifulbill.us",
  comments: { display: "fullInteractive" },
  publishOnBuild: { enabled: false },
})
```

The proof MDX imports `astro-discussion-bridge/Discussion.astro`. Generated HTML
must contain `topicId="434"`, `fullApp=true`, the canonical forum URL, and the
topic-434 fallback URL.

```yaml
when_topic_id_present:
  discourse_embed_config: '{ topicId: 434 }'
  page_url_reconciliation_required: false
when_topic_id_absent:
  discourse_embed_config: '{ discourseEmbedUrl: embedUrl }'
  page_url_reconciliation_required: true
```

Live checks:

```text
GET https://onebigbeautifulbill.us/title-i/10101-impact/
GET https://forum.repealobbba.org/t/434.json
GET https://onebigbeautifulbill.us/api/discourse-comments.json?topicId=434
```

Do not assume these checks pass merely because the local source is correct.
Bridge Boss must verify live embed settings, topic/page association, signed-in
behavior, and fallback behavior.

## 5. Key Contract

API username:

```text
obbba-bot
```

Environment variable names:

```text
DISCOURSE_URL
SITE_URL
DISCOURSE_API_USERNAME
DISCOURSE_API_KEY
DISCOURSE_DIAGNOSTICS_API_KEY
DISCUSSION_PAGE_URL
```

Exact publishing scopes:

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

Credential references belong in the private OBBBA credential vault. This
runbook must not name a key value or expose a vault payload.

## 6. Safe Diagnostics Command

Prerequisites:

```yaml
package_available_to_project: true_alpha_artifact
diagnostics_key_available_privately: required
category_id: unresolved_not_required_for_page_reconciliation
tags: unresolved_not_required_for_page_reconciliation
```

Use the installed package invocation:

```powershell
$env:DISCOURSE_URL='https://forum.repealobbba.org'
$env:SITE_URL='https://onebigbeautifulbill.us'
$env:DISCOURSE_API_USERNAME='obbba-bot'
$env:DISCUSSION_PAGE_URL='https://onebigbeautifulbill.us/title-i/10101-impact/'
npx astro-discussion-bridge check-discourse --page-url $env:DISCUSSION_PAGE_URL
```

Supply the diagnostics key privately in the shell/session. Do not add it to the
command or this file.

Observed read-only result:

```yaml
page_url: https://onebigbeautifulbill.us/title-i/10101-impact/
embed_info: 404
exact_url_search_owning_topic: none
setup_issues: none
settings:
  min_title_length: 15
  max_title_length: 255
  min_first_post_length: 15
  min_post_length: 15
  max_post_length: 150000
  max_tags_per_topic: 7
  max_tag_length: 51
  tagging_enabled: true
capabilities:
  bot_can_tag: true
  bot_can_create_tags: true
topic_434:
  healthy: true
  public: true
  closed: false
  category_id: 18
  post_count: 12
  first_post_editable: true
```

This page-URL result is not a failure for this proof lane. The page explicitly
links existing topic `434`, so the embed uses `topicId`. Treat page-URL
reconciliation as a separate diagnostic and do not automatically relink.

## 7. Prohibited Current Commands

Until explicit promotion and approval for a live write, do not run these
commands against the directory containing the proof page:

```text
publish-new
sync-existing
publish-and-sync
import-existing --overwrite
```

Reasons:

```yaml
source_mode: discourse-imported
writeback_guard: discussionSync=false
current_page_already_exists: true
current_page_manually_pruned: true
category_id: unresolved
tags: unresolved
package_installed: true_alpha_artifact
```

`import-existing` would generate a new slug-based Markdown file rather than
magically replace the existing curated MDX path. Do not use it as a repair or
refresh operation without an explicit design.

## 8. Package Migration Inputs For Bridge Boss

```yaml
migration:
  target_package: astro-discussion-bridge
  package_version_or_build: 0.1.0-alpha-69846cf-64a151bd packed reviewed artifact
  preserve:
    - discussionSourceMode=discourse-imported
    - discussionSync=false
    - topic ID 434
    - source topic URL
    - manually-pruned public content
    - image and alt text
    - fullInteractive behavior or an explicitly approved fallback
    - readable forum-offline fallback
  compare:
    - custom DiscourseComments.astro
    - custom discourse-comments JSON API route
    - package Discussion/DiscourseDiscussion components
    - CORS/proxy behavior
    - signed-in full-app embed behavior
  unresolved:
    - category ID
    - lane tags
    - full-app embed settings live state
    - Cloudflare ownership/account boundary
```

The packed file is an Alpha integration artifact, not the primary public release
distribution. After the release gates pass, replace it with the exact reviewed
registry `astro-discussion-bridge@alpha` artifact corresponding to the GitHub
prerelease commit; update `package.json` and `package-lock.json`, then rerun the
complete verification chain. Keep repo/tarball installation documented as a
development/recovery fallback.

## 9. Verification Record

```yaml
verification:
  package_repo_commit_pushed_main: 7aadcf63c76b8ebd9e0c9383b5c7386ad704396e
  obbba_integration_commit_pushed: f277171
  obbba_deployment_fix_commit_pushed: e9c279dbe1b0bec512ff7fcf0c9ec6f17f0dd6b8
  obbba_manifest_commit_pushed: 64a4f94
  stale_starter_removal_commit_pushed: a225f00
  package_tag_safe_outputs_commit_pushed: 69846cf
  obbba_tag_routed_import_commit_pushed: bd591c9
  staged_obbba_site_slice_code_boss_review: pass
  clean_detached_build_at_bd591c9: pass
  stale_tracked_starter_page_removed: src/content/docs/impact/example.md
  stale_starter_failure: referenced_removed_assets/obbba.png
  source_frontmatter_guard: pass
  source_topic_id: pass_434
  source_forum_hostname: pass_forum.repealobbba.org
  package_integration: pass_alpha_artifact
  package_regression_suite: pass_50_of_50
  code_boss_review: final_pass
  crlf_write_preservation_regression: pass
  discourse_embed_declaration_review: pass_code_boss_p2_fixed
  local_deployment_shaped_build: pass
  generated_html_topic_id: pass_434
  generated_html_full_app: pass_true
  generated_html_forum_and_fallback_urls: pass
  discourse_write_requests: none
  guarded_preview:
    linked_topic_id: 434
    page_url: https://onebigbeautifulbill.us/title-i/10101-impact/
    status: skipped
    reason: discussionSync is false
    summary: '0 created, 0 updated, 1 skipped, 0 unchanged, 0 dry-run'
  live_page:
    url: https://onebigbeautifulbill.us/title-i/10101-impact/
    http_status: 200
    package_embed_signature: pass
    topic_id: 434
    full_app: true
    forum_url: pass
    fallback_topic_url: pass
    hero_image: present
    legacy_data_topic_id_renderer: absent
  live_topic_434:
    visible: true
    open: true
    archived: false
    post_count: 12
    signed_in_reply_test:
      result: pass
      post_number: 12
      direct_url: https://forum.repealobbba.org/t/434/12
      content_marker: Test post after Discussion Bridge update
      account_identifier_recorded: false
  existing_proof_page_interaction_item: pass_signed_in_reply
  post_interaction_embed_check:
    topic_id: 434
    full_app: true
    legacy_data_topic_id_renderer: absent
  discourse_diagnostics: pass_setup_issues_none
  topic_434_read_check: pass_public_open_category_18_posts_12_editable
  page_url_reconciliation: no_owner_found_not_required_with_explicit_topic_id
  secret_review: pass_no_values_recorded
  publish_on_build: false
  discourse_write_operations: none
  package_repo_state: clean_matches_origin_main
  obbba_preserved_unstaged_changes:
    - README
    - custom component cleanup
    - starter content cleanup
  deployment_commits_absorbed_preserved_changes: false
  superseded_untracked_artifacts_touched: false
```

Broader OBBBA Discourse-to-Astro Alpha gate:

```yaml
fresh_import_gate:
  status: pass_live
  discovery_queue:
    alpha_requirement: true
    curated_input: explicit_topic_or_manifest
    curated_order: caller_supplied
    category_discovery: list_categories_and_subcategories
    category_selector: id_or_unambiguous_slug_or_name
    category_selection_before_preview: required
    next_in_category_default: created_at_ascending
    stable_tie_breaker: topic_id_ascending
    optional_filters: [tags, created_date_range, open_closed, limit]
    optional_order: [oldest_created_at, newest_created_at]
    optional_natural_order: numbered_topic_title_or_name
    forbidden_order: [bumped_at, last_reply, latest_activity]
    preview_selected_category_queue_before_import: required
    exclude_already_imported: required
  current_tag_routed_proofs:
    shared_policy:
      required_tags: [TITLE-I]
      comments_display: fullInteractive
      hero: true
      hero_alt_text: exact_required
      prune_profiles: [community-call-to-action]
      raw_prefix_match: pass
      footer_markers_absent: pass
    entries:
      - { topic_id: 434, output: 10101-impact.mdx, removed_chars: 456 }
      - { topic_id: 747, output: generated_sec_route, removed_chars: 511 }
      - { topic_id: 751, output: generated_sec_route, removed_chars: 549 }
      - { topic_id: 752, output: generated_sec_route, removed_chars: 453 }
      - { topic_id: 753, output: generated_sec_route, removed_chars: 441 }
  local_matrix_status: complete
  live_deployment_verification: pass
  live_worker_version: cde279d5-1c27-452c-964f-59d8dfd7c320
  live_routes:
    - topic_id: 434
      http_status: 200
    - topic_id: 747
      http_status: 200
    - topic_id: 751
      http_status: 200
    - topic_id: 752
      http_status: 200
    - topic_id: 753
      http_status: 200
  live_boundary_count_each: 1
  live_topic_binding: pass
  live_hero_prune_policy: pass
  live_exact_hero_alt: pass
  live_cta_footer_absent: pass
  sidebar_groups: [Title I, Title II, Title III, Title IV, Title V, Title VI, Title VII, Title VIII, Title IX, Title X]
  title_i_unique_destinations: 5
  accidental_discourse_writeback: none
  deterministic_refresh:
    current_single_command_safe: true_with_reviewed_manifest
    package_gate: pass
    command_shape: import-existing --manifest PATH --overwrite
    per_topic_fields: [requiredTags, output, commentsDisplay, heroImage, heroAlt, pruneProfiles]
    manifest_order: preserve_caller_order
    strict_schema: JSON_version_and_imports_only
    duplicate_topics: reject
    direct_option_mixing: reject
    runner_revalidation: required
    preflight: [dry_run, collision, path_containment]
    staging: all_entries_before_write
    no_overwrite_creation: atomic_exclusive
    overwrite_failure: rollback
    regressions: [slug_drift, destination_race, zero_byte, traversal]
    obbba_manifest: discussionbridge-imports.json
    obbba_order: [434, 747, 751, 752, 753]
    wherefrom:
      discourse_base: https://forum.repealobbba.org
      required_tags_each: [TITLE-I]
      validation_before_write: required
    whereto:
      docs_dir: site_configured_content_root
      output_each: safe_relative_md_or_mdx
      route_base: title-i
      site_url: https://onebigbeautifulbill.us
      astro_navigation_lane_map: discussionbridge-title-lanes.json
      implementation: Starlight_Title_sidebar_groups
      path_containment: required
    manifest_v1_fields: [topic, requiredTags, output, commentsDisplay, heroImage, heroAlt, pruneProfiles]
    future_nested_from_to_schema: possible_not_current
    execution:
      atomic_import: 5_imported_in_order
  every_proof_must_verify:
    - generated discussionSourceMode=discourse-imported
    - generated discussionSync=false
    - topic ID and URL preserved
    - build passes
    - deploy passes
    - live page renders
    - approved comments mode works
    - no accidental writeback
```

This broader gate passed from the five-page live matrix, not from the existing
topic-434 page alone.

Remaining OBBBA site-slice gate:

```yaml
status: complete
completed:
  - Code Boss PASS on staged OBBBA site slice
  - manifest site slice committed and pushed as 64a4f94
  - tag-routed site slice committed and pushed as bd591c9
  - exact candidate deployed as Worker version cde279d5-1c27-452c-964f-59d8dfd7c320
  - topics 434, 747, 751, 752, and 753 verified live
  - exactly one correctly bound discussion per route
  - expected hero and prune policy verified live
  - no accidental Discourse writeback
```

Prune profile contract:

```yaml
profile: community-call-to-action
opt_in_only: true
boundary: trailing block after horizontal rule
all_markers_required:
  - Join the Conversation Today
  - /signup
  - Please share how
  - /c/stories/
no_verified_boundary: hard_failure_before_file_write
invalid_profile_input_before_io:
  - unknown profile
  - duplicate profile
  - bare CLI option
  - empty CLI value
```

OBBBA Starlight integration invariant:

```yaml
page_boundary_component: src/components/MarkdownContent.astro
starlight_wiring: starlight.components.MarkdownContent
content_schema: docsSchema extended with Discussion Bridge fields
per_page_explicit_Discussion_component: prohibited_when_boundary_override_active
verified_single_fullInteractive_instances:
  - { section: 10101, topic_id: 434, count: 1, hero: true }
  - { section: 10102, topic_id: 747, count: 1, hero: true }
  - { section: 10103, topic_id: 751, count: 1, hero: true }
  - { section: 10104, topic_id: 752, count: 1, hero: true }
  - { section: 10105, topic_id: 753, count: 1, hero: true }
rendering_boundary:
  outer_astro_page:
    mermaid_svg: present
    html_tables: 5
  topic_434_cooked_html:
    code_lang_mermaid: present
    table: present
  fullInteractive:
    owner: cross_origin_Discourse_iframe
    host_Astro_transform_or_CSS_access: none
    ordinary_topic_434_mermaid: rendered_to_svg
    full_app_embed_topic_434_mermaid: raw_code
    full_app_embed_theme_component_js: absent
    tables: parsed_weak_style
    immediate_table_path: Discourse_common_embedded_scss_with_embed_class_hook
    mermaid_resolution: open_Discourse_embed_extension_plugin_or_upstream
  full:
    package_commit: d7800d7
    parity_review: pass
    code_boss: final_pass
    package_tests: 51_of_51
    plain_astro_build: pass
    starlight_build: pass_known_docs_404_only
    mermaid: version_11_strict_lazy_default_true_opt_out_false
    failure_fallback: source_preserved_and_module_load_retryable
    tables: borders_padding_horizontal_overflow
    repeated_component_guard: claim_container_once
    lazy_chunk_warning: emitted_over_500k_but_fetched_only_when_needed
  embed_class_hooks:
    comments_className_forwarded_to_window_DiscourseEmbed: true
    embedClassName_public_components: [Discussion, DiscourseDiscussion, DiscourseComments]
  obbba_content_writes_this_pass: none
  obbba_live_deployment_this_pass: none
```

## 10. Known Failures And Recovery

```yaml
cdn_backed_discourse_proof:
  verified_at: 2026-07-22
  forum: https://forum.repealobbba.org
  CDN: Cloudflare
  result: PASS_for_exercised_workflows
  workflows:
    - check_discourse_API_reads
    - topic_imports
    - target_topic_reconciliation
    - protected_source_links
    - fullInteractive_comments
    - signed_in_reply
    - five_live_source_disclosures
    - no_writeback
  preserve: [API_paths, JSON_endpoints, embed_full_app_routes, authentication_cookies, websockets]
  edge_origin_difference: investigate_cache_and_WAF
  universal_CDN_WAF_guarantee: false
  citizen_activist_topology_gate: separate_open
```

```yaml
failures:
  - symptom: source-mode guard missing
    recovery: restore discussionSync=false; audit changes; do not sync
    owner: Bridge Boss
  - symptom: topic 434 missing or unreadable
    recovery: confirm forum state; choose restore or explicit relink; no auto-create
    owner: Bridge Boss plus forum operator
  - symptom: fullInteractive does not open topic 434 despite explicit topic ID
    recovery: verify generated topicId, full-app settings, CSP/embed host, and live package asset; do not infer failure from page-URL embed-info alone
    owner: Bridge Boss plus forum operator
  - symptom: page URL embed-info is 404 or exact URL search has no owner
    recovery: if topicId is explicit, record it separately and verify that topic directly; if topicId is absent, resolve URL ownership before release
    owner: Bridge Boss
  - symptom: sandbox build fails on OG font or Wrangler profile log
    recovery: reproduce in approved deployment-shaped environment; do not hide unrelated failures
    owner: Bridge Boss
  - symptom: public content stale
    recovery: verify commit and topic, bypass cache, then narrowly purge relevant cache
    owner: Bridge Boss plus Ops
```

## 11. Release Evidence

Additive Alpha topology/credit inputs; these do not replace or close any existing Alpha gate:

```yaml
post_gate_demo:
  public_site: https://onebigbeautifulbill.us
  page_count: 1_or_2
  labeling: explicit_demo_or_credit
  companion_forum: https://forum.discussionbridge.dev
  target_selection: explicit_ordered_per_page_target_list
  production_obbba_forum_remains: https://forum.repealobbba.org
  support_claim: bounded_cross_forum_topology_proof
  general_many_to_many_administration_claim: false
  citizen_activist:
    canonical_forum: https://forum.citizenactivist.network
    public_description: A community of activists
    cloudflare_account_ownership: unresolved_Ops_decision
    pages: selected_and_clearly_labeled
    target_selection: member_of_explicit_ordered_page_target_list
  alpha_topology_claim: one_page_multi_forum_plus_many_sites_one_forum
  status: bounded_live_proof_complete
  live_evidence:
    verified_at: 2026-07-22
    adoption_commit: 36df91c98a35251edd6ddd657cca42ddf0acdafa
    Code_Boss: PASS
    clean_detached_build: PASS
    worker_version: 632db326-bc0d-4047-b74b-7e74d3588dbf
    canonical_page_HTTP: 200
    adoption_files:
      - src/components/MarkdownContent.astro
      - src/content.config.ts
      - src/content/docs/title i/10101-impact.mdx
  implementation:
    commit: 60e41e1
    review: Code_Boss_PASS
    tests: 62_of_62_PASS
    package_check: PASS
    package_dry_run: PASS
  exact_matrix:
    - { from: same_selected_onebigbeautifulbill.us_page, to: https://forum.repealobbba.org }
    - { from: same_selected_onebigbeautifulbill.us_page, to: https://forum.citizenactivist.network }
    - { from: bounded_demo_credit_pages, to: https://forum.discussionbridge.dev }
    - { from: multiple_Astro_public_sites, to: https://forum.repealobbba.org }
  contract:
    source_target_vs_publication_targets: distinct
    publication_targets: explicit_ordered_list
    binding_fields: [topic_id, topic_url, source_hash, last_synced_at, status, last_error, last_attempted_at]
    presentation_policy: explicit_primary_plus_accessible_additional_links
    protected_source_no_writeback: required
    comments: explicit_primary_plus_additional_linked_or_rendered
    partial_success: retain_success_report_failure_retry_idempotently
    target_specific: [diagnostics, dry_run, CLI_output, manuals, live_proof]
    frontmatter:
      discussionTargets: ordered_CSV_target_names
      discussionPublishTargets: explicit_writable_subset_CSV
      discussionSourceTarget: explicit_protected_source_target
      discussionTargetBindings: JSON_scalar_map_by_target
      discussionPrimaryTarget: required_when_multiple_linked_topics
    execution:
      CLI: one_explicit_--target_per_run
      publishOnBuild: ordered_sequential_lanes_with_per_lane_target_and_credentials
    presentation:
      primary: rendered_in_selected_comments_mode
      additional: accessible_named_links
      optional_labels: targetLabels
      missing_primary_with_multiple_links: hard_failure
    recovery:
      failure_state: sanitized_truncated_error_plus_attempt_time
      retry: failed_target_only
      collision_422: reconcile_owning_topic_into_active_binding
      malformed_bindings: fail_before_network
  later_scope: general_many_to_many_administration
  completed_gate: [design_review, implementation, Code_Boss_review, package_tests, partial_failure_retry_tests]
  proof:
    diagnostics: PASS
    source_topic: { target: repeal-obbba, topic_id: 434, posts: 12, source_mode: discourse-imported, discussionSync: false }
    primary_comments: { mode: fullInteractive, fullApp: true, topic_id: 434 }
    publication_topic:
      target: citizen-activist
      topic_id: 9
      url: https://forum.citizenactivist.network/t/sec-10101-re-evaluation-of-thrifty-food-plan-impact/9
      category: { id: 5, name: One Big Beautiful Bill, slug: one-big-beautiful-bill, public: true }
      visible: true
      tags: [discussionbridge, obbba, impact, title-i]
      interaction_addendum:
        posts_count: 2
        highest_post_number: 2
        last_poster: discourseadmin
        public_JSON_verified: true
    retry: unchanged_no_duplicate
    additional_navigation_links: 1
    Astro_primary_topic_after_additional_reply: 434
    interaction_claim: presentation_separation_only_gate_scope_unchanged
  content_correction:
    commit: 4fffe5e
    change: removed_stray_flowchart_editing_instruction_only
    Mermaid_source_preserved: true
    active_target: citizen-activist
    target_topic_updated: 9
    source_topic_434_changed: false
    topic_9_posts_count: 2
    target_specific_dry_run: PASS
    live_sync: PASS
    clean_detached_build: PASS
    worker_version: 344dfe40-8b71-4ff4-aea2-bc831af9c51d
    canonical_live_HTTP: 200
    Astro_Mermaid_rendered: true
    primary_and_additional_presentation_preserved: true
  connection_job:
    public_lead: Every connection has a job
    explicit_human_role: required_product_behavior_not_yet_implemented
    label_and_CTA_match_role: required
    independent_replies_merged: false
    bidirectional_CAN_requires_separate_pairs: true
    same_item_dual_write: prohibited
    configuration_vocabulary: pending_design_review
    source_writeback: none
  lane:
    docsDir: src/content/docs/title i
    route_base: title-i
    active_target: citizen-activist
    earlier_broad_dry_run: rejected_before_write_wrong_root_index_and_route
  dependency_audit: { total: 10, low: 1, moderate: 1, high: 8, resolved: false, action: manual_dependency_review }
  known_notices: [Starlight_docs_to_404, chunk_size, punycode_deprecation]
  temporary_detached_worktree: removed_after_deployment
  protected_credentials:
    records_exist: true
    copy_paths_account_values_or_secrets_here: prohibited
    legacy_format_cleanup: protected_vault_task
source_disclosure:
  implementation_commit: a9d2097
  review: Code_Boss_PASS
  tests: 68_of_68_PASS
  package_exports_verified: true
  OBBBA_gate: complete
  adoption_commit: aa7846d
  artifact: vendor/astro-discussion-bridge-0.1.0-alpha-a9d2097-f3fbb73e.tgz
  artifact_sha256: F3FBB73E95D52B5799FBEBE5221298040FD32292EDA8BD76C257C0C19E4267B2
  Code_Boss_adoption_review: PASS
  clean_detached_npm_ci_build: PASS
  publishOnBuild: false
  Discourse_writes: none
  deployed_worker_version: 005b9ff2-c880-43e4-b759-31ec2d02bed5
  canonical_Title_I_routes_verified: 5
  per_route_evidence:
    Content_source_aside_count: 1
    source_link_count: 1
    source_forum: forum.repealobbba.org
    source_label: Repeal OBBBA Forum
    imported_wording: exact
    existing_discussion_boundary: present
  citizen_activist_topology_gate: separate_open
  component: astro-discussion-bridge/DiscussionSource.astro
  placement: canonical_Starlight_MarkdownContent_near_article_start
  protected_source: https://forum.repealobbba.org
  additional_publication_target_must_not_be_used_as_provenance: true
  separate_from: [comments_boundary, Discussion_Bridge_credit]
  safe_links_only: absolute_http_https
  no_safe_link_behavior: render_notice_without_link
comments_boundary_credit:
  implementation_state: planned_not_current_artifact
  candidate_text:
    - Discussion connection by Discussion Bridge
    - Discourse connection by Discussion Bridge
  canonical_product_link: required
  accessible_and_visually_secondary: required
  modes: [simple, full, fullInteractive]
  site_content_hard_coding: prohibited
  final_wording_default_config: unresolved
```

```yaml
release_candidate: unresolved
code_boss_review:
  result: not_recorded
  blocking_edits_complete: false
  re_review_complete: false
bridge_boss_technical_verification:
  result: not_recorded
manual_boss_quality_review:
  result: not_recorded
runbooks_ready:
  result: first_pass_not_approved
product_boss_documentation_sign_off:
  result: not_approved
product_boss_release_approval:
  result: not_approved
```

Reject release approval while any value above is unresolved, failed, incomplete,
or tied to a different release candidate.

## 12. Durable Feedback Rule

When the OBBBA lane confirms package behavior, embed settings, category/tags,
failure handling, migration steps, or recovery:

1. update this Machine Runbook;
2. update the OBBBA Human Runbook;
3. update the general Discussion Bridge manuals when the fact is reusable;
4. route implementation changes to Bridge Boss;
5. route code review to Code Boss;
6. route manual quality review to Manual Boss;
7. record Product Boss documentation sign-off and release approval separately.
