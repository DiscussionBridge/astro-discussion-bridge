# OBBBA Machine Runbook: onebigbeautifulbill.us and forum.repealobbba.org

Status: existing proof-page package migration and live fullInteractive interaction verified; fresh-import Alpha gate open
Last verified from workspace facts: 2026-07-21  
Companion: [OBBBA Human Runbook](./OBBBA_ONEBIGBEAUTIFULBILL_HUMAN.md)

No secret values belong in this file.

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
  alpha_artifact: vendor/astro-discussion-bridge-0.1.0-alpha-729d85f-ad0bdf0b.tgz
  alpha_artifact_sha256: ad0bdf0bf181389b4f6677cee7170e4c57d9c6293b6a91d282a0537bd35f10fa
  package_commit: 729d85f
  page_component: astro-discussion-bridge/Discussion.astro
  previous_comments_component: src/components/DiscourseComments.astro
  previous_comments_api_route: src/pages/api/discourse-comments.json.ts
  source_metadata_present: true
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
package_reference: file:vendor/astro-discussion-bridge-0.1.0-alpha-729d85f-ad0bdf0b.tgz
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
  version: 85478ec8-af54-42bf-828e-2e0f2f1e0337
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
  package_version_or_build: 0.1.0-alpha-729d85f-ad0bdf0b packed reviewed artifact
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

The packed file is an Alpha integration artifact, not a release distribution.
Replace it with the approved GitHub release asset when the release candidate is
approved; update `package.json` and `package-lock.json`, then rerun the complete
verification chain.

## 9. Verification Record

```yaml
verification:
  package_repo_commit_pushed_main: 7aadcf63c76b8ebd9e0c9383b5c7386ad704396e
  obbba_integration_commit_pushed: f277171
  obbba_deployment_fix_commit_pushed: e9c279dbe1b0bec512ff7fcf0c9ec6f17f0dd6b8
  source_frontmatter_guard: pass
  source_topic_id: pass_434
  source_forum_hostname: pass_forum.repealobbba.org
  package_integration: pass_alpha_artifact
  package_regression_suite: pass_38_of_38
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
```

Broader OBBBA Discourse-to-Astro Alpha gate:

```yaml
fresh_import_gate:
  status: open
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
  proofs_required:
    - name: fresh_topic_no_hero_no_prune
      section: 10102
      topic_id: 747
      status: pass
      hero: false
      prune_rules: false
    - name: fresh_topic_hero_only
      section: 10103
      topic_id: 751
      status: pass
      hero: true
      hero_image: ../../../assets/obbbanotso.png
      hero_alt_text: One Big (not so) Beautiful Bill over the U.S. Capitol
      prune_rules: false
      normalized_raw_match:
        chars: 20081
        lines: 181
        sha256: f2f25c1b0cece52154d7dd0358c3db08d065596b2a6df5a4625fbf1989c24098
    - name: fresh_topic_prune_only
      section: 10104
      topic_id: 752
      status: pending_next
      hero: false
      prune_rules: true
    - name: fresh_topic_hero_and_prune
      section: 10105
      topic_id: 753
      status: pending_after_10104
      hero: true
      hero_alt_text: required
      prune_rules: true
  update_all_after_matrix: required
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

Do not infer completion of this broader gate from the existing topic-434 page.

OBBBA Starlight integration invariant:

```yaml
page_boundary_component: src/components/MarkdownContent.astro
starlight_wiring: starlight.components.MarkdownContent
content_schema: docsSchema extended with Discussion Bridge fields
per_page_explicit_Discussion_component: prohibited_when_boundary_override_active
verified_single_fullInteractive_instances:
  - { section: 10101, topic_id: 434, count: 1, hero: true }
  - { section: 10102, topic_id: 747, count: 1, hero: false }
  - { section: 10103, topic_id: 751, count: 1, hero: true }
```

## 10. Known Failures And Recovery

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

Deferred topology/credit inputs; these do not alter the open fresh-import gate:

```yaml
post_gate_demo:
  public_site: https://onebigbeautifulbill.us
  page_count: 1_or_2
  labeling: explicit_demo_or_credit
  companion_forum: https://forum.discussionbridge.dev
  target_selection: explicit_per_page
  production_obbba_forum_remains: https://forum.repealobbba.org
  support_claim: bounded_cross_forum_topology_proof
  full_many_to_many_claim: false
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
