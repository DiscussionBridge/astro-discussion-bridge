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
- Source-mode names are not currently parsed/enforced by the CLI.
- `import-existing` currently writes link/import metadata but does not write
  `discussionSync: false` or a named source-mode field.

Therefore, the required Alpha import procedure is:

1. run `import-existing --dry-run`;
2. run the live import only after reviewing the destination;
3. immediately add `discussionSync: false` to every imported file;
4. review frontmatter before any directory-wide sync;
5. remove the guard only after explicit promotion to Astro ownership.

Implementation follow-up belongs to Bridge Boss: make imported/non-Astro source
mode safety automatic and machine-verifiable.

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
  },
  replies: {
    refreshOnPageLoad: true,
    refreshEndpoint: "/api/discourse/topics/{topicId}.json",
  },
});
```

- `simple`: Discourse embeddable-comments script; limited display control and
  metadata.
- `full`: Astro-rendered replies; interaction remains in Discourse; browser
  refresh needs CORS or same-origin proxy.
- `fullInteractive`: Discourse full-app iframe; requires full-app embedding and
  compatible sign-in/cookie configuration.

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

## 13. Alpha Release And Support Inputs

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
