# Discussion Bridge Site Machine Runbook: {Site Name}

Status: `{draft | review | approved | current}`  
Environment: `{development | staging | production}`  
Release/version: `{package version or release candidate}`  
Last verified: `{YYYY-MM-DD}`  
Companion: [Human Runbook](./SITE_RUNBOOK_HUMAN_TEMPLATE.md)

This template is the exact execution and generation record for one site. Replace
every brace-delimited placeholder. Never store real passwords, API keys, tokens,
private account values, or production secrets here.

## 1. Runbook Inputs

```yaml
site:
  name: "{site name}"
  repository: "{repository name or safe URL}"
  project_root: "{absolute or operator-relative path}"
  environment: "{development | staging | production}"
  framework_preset: "{astro | starlight}"
  site_url: "{https://site.example.com}"
  discourse_url: "{https://forum.example.com}"
  deployment_target: "{Cloudflare Pages or other target}"
  verification_urls:
    - "{public lane URL}"
    - "{companion topic URL after creation/linking}"

credentials:
  post_as: "{preferred request actor username; not secret}"
  legacy_api_username: "{compatibility fallback, if still used; not secret}"
  publishing_key_reference: "{private vault reference; never value}"
  diagnostics_key_reference: "{private vault reference; never value}"

discussion:
  active_target: "{target name or empty}"
  default_comments_display: "{simple | full | fullInteractive}"

lanes:
  - name: "{lane name}"
    docs_dir: "{src/content/docs}"
    route_base: "{empty | blog | releases | other}"
    source_mode: "{astro-managed | discourse-managed | discourse-imported}"
    category_id: {integer}
    tags: ["{tag}"]
    listed: {true | false}
    managing_page_rule: "{exactly one managing Astro page per topic}"
    comments_display: "{simple | full | fullInteractive}"
    verification_url: "{public lane URL}"
    recovery_owner: "{person/team/lane}"
```

Reject generation when site URL, forum URL, lane directory, route base, source
mode, category, managing-page rule, or recovery owner is unknown.

## 2. Key Contract

Publishing key environment:

```text
DISCOURSE_POST_AS={request actor username}
# Legacy fallback only: DISCOURSE_API_USERNAME={bot username}
DISCOURSE_API_KEY={secret value supplied privately at runtime}
```

Diagnostics key environment:

```text
DISCOURSE_DIAGNOSTICS_API_KEY={secret value supplied privately at runtime}
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

The diagnostics key is the current global/admin-capable setup fallback. Keep it
out of routine publishing and deployment paths.

## 3. Site Configuration

File: `{project_root}/astro.config.mjs`

```js
discussionBridge({
  provider: "discourse",
  preset: "{astro | starlight}",
  discourseUrl: "{https://forum.example.com}",
  siteUrl: "{https://site.example.com}",
  comments: {
    display: "{simple | full | fullInteractive}",
  },
  replies: {
    refreshOnPageLoad: true,
    refreshEndpoint: "{/api/discourse/topics/{topicId}.json | omit for direct CORS}",
  },
  publishOnBuild: {
    enabled: false,
  },
});
```

Keep build publishing disabled until every lane has passed explicit diagnostics,
dry-run review, a controlled live write, and verification.

## 4. Source-Mode Enforcement

```yaml
astro-managed:
  discussionSync: true_or_omitted
  writeback: allowed_after_preview

discourse-managed:
  discussionSync: false
  writeback: prohibited

discourse-imported:
  discussionSync: false
  writeback: prohibited_until_explicit_promotion
```

Current implementation limitation: source-mode names are operating metadata,
not CLI-enforced fields. `discussionSync: false` is the enforced guard, and
`import-existing` does not add it automatically.

Pre-write check:

```text
For every file in the command directory:
- identify source mode;
- confirm Discourse-managed/imported files contain discussionSync: false;
- confirm one managing Astro page per topic;
- reject unexplained duplicate topic IDs or page URLs.
```

## 5. Environment Contract

```text
DISCOURSE_URL={https://forum.example.com}
SITE_URL={https://site.example.com}
DISCOURSE_POST_AS={request actor username}
# Legacy fallback only: DISCOURSE_API_USERNAME={bot username}
DISCOURSE_API_KEY={private runtime secret}
DISCOURSE_DIAGNOSTICS_API_KEY={private runtime secret; setup only}
DISCOURSE_CATEGORY_ID={integer}
DISCOURSE_TAGS={comma-separated tags}
DISCUSSION_TARGET={optional target name}
DISCUSSION_PAGE_URL={optional reconciliation URL}
DISCOURSE_NOTIFY_RECIPIENTS={optional comma-separated usernames}
DISCOURSE_TITLE_MIN_LENGTH={optional integer}
DISCOURSE_MAX_TOPIC_TITLE_LENGTH={optional integer}
DISCOURSE_MAX_POST_LENGTH={optional integer}
DISCOURSE_MAX_TAGS_PER_TOPIC={optional integer}
DISCOURSE_MAX_TAG_LENGTH={optional integer}
```

Store values in the approved shell session, vault-backed CI secret, or hosting
secret store. Do not put secret values in this file or command history.

## 6. Lane Command Blocks

Create one completed subsection per lane.

### Lane: `{lane name}`

Resolved inputs:

```yaml
docs_dir: "{path}"
route_base: "{path or empty}"
site_url: "{URL}"
discourse_url: "{URL}"
category_id: {integer}
tags: ["{tag}"]
target: "{name or empty}"
source_mode: "{mode}"
listed: {true | false}
```

Diagnostics:

```sh
npx astro-discussion-bridge check-discourse \
  --discourse-url {DISCOURSE_URL} \
  --category-id {CATEGORY_ID} \
  --tags {TAG_1,TAG_2} \
  --page-url {PUBLIC_PAGE_URL}
```

Expected diagnostics:

```text
category: {expected ID/name}
requested tags: {expected inventory}
setup issues: none
setup warnings: {none or explicitly accepted warning}
owning topic: {expected ID or unknown before creation}
```

Publish-new preview/live:

```sh
npx astro-discussion-bridge publish-new {DOCS_DIR} \
  {--route-base ROUTE_BASE} \
  {--target TARGET} \
  --discourse-url {DISCOURSE_URL} \
  --site-url {SITE_URL} \
  --category-id {CATEGORY_ID} \
  --tags {TAG_1,TAG_2} \
  --dry-run --details
```

Remove only `--dry-run` for the approved live command.

Sync-existing preview/live:

```sh
npx astro-discussion-bridge sync-existing {DOCS_DIR} \
  {--route-base ROUTE_BASE} \
  {--target TARGET} \
  --discourse-url {DISCOURSE_URL} \
  --site-url {SITE_URL} \
  --category-id {CATEGORY_ID} \
  --tags {TAG_1,TAG_2} \
  --dry-run --details
```

Publish-and-sync preview/live:

```sh
npx astro-discussion-bridge publish-and-sync {DOCS_DIR} \
  {--route-base ROUTE_BASE} \
  {--target TARGET} \
  --discourse-url {DISCOURSE_URL} \
  --site-url {SITE_URL} \
  --category-id {CATEGORY_ID} \
  --tags {TAG_1,TAG_2} \
  --dry-run --details
```

Import preview/live:

```sh
npx astro-discussion-bridge import-existing {DOCS_DIR} \
  --topic {TOPIC_URL_OR_ID} \
  {--route-base ROUTE_BASE} \
  {--target TARGET} \
  --discourse-url {DISCOURSE_URL} \
  --site-url {SITE_URL} \
  --comments-display {simple|full|fullInteractive} \
  --dry-run
```

After live import, add `discussionSync: false` before any directory-wide sync.

## 7. Expected Frontmatter

Astro-managed:

```yaml
title: "{page title}"
discussionTarget: "{optional target}"
discourseTopicId: {integer}
discourseTopicUrl: "{topic URL}"
discussionSourceHash: "{sha256}"
discussionLastSyncedAt: "{ISO-8601}"
```

Discourse-imported/display-only:

```yaml
title: "{page title}"
discussionTarget: "{optional target}"
discourseTopicId: {integer}
discourseTopicUrl: "{topic URL}"
discussionSourceHash: "{sha256}"
discussionImportedAt: "{ISO-8601}"
discussionCommentsDisplay: "{mode}"
discussionSync: false
```

## 8. Deployment Contract

```yaml
provider: "{Cloudflare Pages or other}"
repository: "{canonical repository}"
production_branch: "main"
root_directory: "{project root}"
build_command: "npm run build"
output_directory: "{dist or site-specific value}"
custom_domain: "{hostname}"
astro_site_url: "{URL}"
discussion_bridge_site_url: "{URL}"
discourse_embed_host: "{hostname}"
```

Required equality:

```text
Astro site URL == Discussion Bridge siteUrl == CLI SITE_URL == public origin
Discourse embed host == public hostname
```

## 9. Verification Record

```yaml
verification:
  release_candidate: "{version/commit}"
  diagnostics:
    status: "{pass | fail}"
    evidence: "{sanitized output reference}"
  dry_run:
    status: "{pass | fail}"
    expected_counts: "{created/updated/skipped/unchanged}"
  live_operation:
    status: "{pass | fail | not applicable}"
    actual_counts: "{counts}"
  discourse:
    status: "{pass | fail}"
    topic_ids: [{IDs}]
  astro_build:
    status: "{pass | fail}"
  deployment:
    status: "{pass | fail}"
    commit: "{commit}"
  comments:
    status: "{pass | fail}"
    modes_tested: ["{mode}"]
  secret_review:
    status: "{pass | fail}"
```

## 10. Known Failures And Recovery Overrides

```yaml
site_specific_failures:
  - symptom: "{symptom}"
    detection: "{check/output}"
    recovery: "{explicit safe steps}"
    escalation_owner: "{owner/lane}"
    auto_recreate_allowed: false
```

Use the general Machine Manual recovery table unless the site has a confirmed
override. Never infer recovery for a deleted topic or first post.

## 11. Release Evidence And Decisions

```yaml
release_evidence:
  release_candidate: "{version/commit}"
  code_boss_review:
    result: "{pass | fail}"
    blocking_edits_complete: {true | false}
    re_review_complete: {true | false | not_required}
    evidence: "{safe reference}"
  bridge_boss_technical_verification:
    result: "{pass | fail}"
    evidence: "{safe reference}"
  manual_boss_quality_review:
    result: "{pass | fail}"
    evidence: "{safe reference}"
  manuals_ready:
    result: "{pass | fail}"
    human_runbook_version: "{version/hash}"
    machine_runbook_version: "{version/hash}"
  product_boss_documentation_sign_off:
    result: "{approved | not_approved}"
    date: "{YYYY-MM-DD}"
    evidence: "{safe reference}"
  product_boss_release_approval:
    result: "{approved | not_approved}"
    date: "{YYYY-MM-DD}"
    evidence: "{safe reference}"
```

Reject release approval when any prerequisite is failed, unresolved, missing,
or tied to a different release candidate.

## 12. Generation Output Contract

Generate the paired site runbooks together:

```yaml
outputs:
  human_runbook:
    template: docs/SITE_RUNBOOK_HUMAN_TEMPLATE.md
    required_content:
      - plain-language purpose and ownership
      - site/lane map
      - do-this / you-should-see-this steps
      - stop-if warnings
      - comments and deployment verification
      - recovery and support routing
      - visual/video placeholders
      - release sign-off checklist
  machine_runbook:
    template: docs/SITE_RUNBOOK_MACHINE_TEMPLATE.md
    required_content:
      - exact resolved inputs
      - commands and expected output
      - environment variable names and private secret references
      - source-mode guards
      - frontmatter and deployment contracts
      - verification evidence
      - known failures and recovery overrides
      - release evidence and decisions
```

## Template Completion Check

- [ ] No brace-delimited placeholder remains unintentionally.
- [ ] No real secret value is present.
- [ ] Every Human Runbook value agrees with this Machine Runbook.
- [ ] Commands use the exact intended lane paths, routes, target, category, and
      tags.
- [ ] Every non-Astro-managed page is guarded.
- [ ] Verification evidence is tied to the exact release candidate.
- [ ] Code Boss, Bridge Boss, Manual Boss, and both Product Boss decisions are
      recorded separately.
