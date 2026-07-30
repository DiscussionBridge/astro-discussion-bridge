# Key Management Guide

DiscussionBridge uses Discourse API keys to publish, sync, diagnose, and recover companion topics. Treat keys as operational credentials.

## Key Roles

Use separate keys when possible:

- publishing key: normal `publish-new`, `sync-existing`, and `publish-and-sync` runs
- diagnostics key: normal setup checks and routine read-only diagnostics
- bulk/diagnostics/import key: temporary broader read access for a bounded
  import, comparison, or migration when the durable diagnostics key cannot read
  required raw posts or administrative metadata
- recovery/admin key: rare repair operations that need broader authority

For Alpha, the practical model is:

- use a granular publishing key when it can create topics/posts, read linked topics/posts, update managed first posts, update topic metadata, update tags, and unlist when needed
- keep routine diagnostics on a durable least-privilege diagnostics key
- create a broader bulk/diagnostics/import key only when a bounded machine task
  cannot be completed through the durable diagnostics key; revoke and delete
  that temporary key after the task and its evidence checks finish

The OBBBA implementation uses the four generic role identities:

```text
diagnostics key
read-only diagnostics key
publishing granular key
bulk/diagnostics/import key
```

The first three are durable identity roles and must not be silently repurposed
or have their scope changed when another workflow may depend on them. Key
existence and replacement status must be recorded from explicit operator
confirmation, not inferred from a proposed storage template. The read-only
diagnostics key is the preferred identity for GET-only checks and planning. The
bulk/diagnostics/import key is created when needed and deleted when the bounded
work is finished. This is exceptional temporary elevation, not routine per-run
key churn.

### OBBBA Four-Key Metadata

Store the matching block with each protected OBBBA vault record.

Do not conflate the three identifiers:

1. **Discourse API-key description:** names the generic credential role,
   for example `diagnostics key`.
2. **Selected Discourse user/request actor:** names the forum identity,
   `obbba-bot`.
3. **Vault filename:** names the forum, actor, purpose, and creation date, for
   example `repealobbba-forum-obbba-bot-diagnostics-key-20260721.txt`.

The description answers **what role this key performs**. The selected user
answers **which Discourse identity authorizes the request**. The vault filename
answers **where, for whom, for what, and when the credential record belongs**.
These values are related but do not use the same naming pattern.

Use these exact vault filenames:

```text
repealobbba-forum-obbba-bot-publishing-key-20260721.txt
repealobbba-forum-obbba-bot-diagnostics-key-20260725.txt
repealobbba-forum-obbba-bot-read-only-diagnostics-key-20260725.txt
repealobbba-forum-obbba-bot-bulk-diagnostics-import-key-TEMP-YYYYMMDD.txt
```

Credential filenames follow the established OBBBA pattern:
`repealobbba-forum-{actor}-{purpose}-YYYYMMDD.txt`. The date is the key creation
date. Date-only is acceptable because exact creation time is not operationally
significant here. `TEMP` makes the exceptional lifecycle visible. A
metadata-only template may exist before the key; replace `YYYYMMDD` with the
temporary key's actual creation date only when the key is created. The API-key
descriptions remain the generic role names above; the vault filenames identify
the Discourse forum and actor.

Operator-confirmed active state on 2026-07-25:

```text
publishing granular key — Granular — existing
diagnostics key — Global — newly created
read-only diagnostics key — Read-only — newly created
bulk/diagnostics/import key — not created
```

#### `publishing granular key`

```text
Purpose: Runtime publishing granular key
Use: publish-new, sync-existing, publish-and-sync, check-discourse basic limits
Bot user role: Admin currently; intended future runtime posture is non-admin or least-privilege
Key scope: Granular
Operational rule: Use this for normal OBBBA bridge publishing/runtime operations. Do not use it for setup diagnostics, site settings reads, or admin troubleshooting.
```

#### `diagnostics key`

```text
Purpose: Diagnostics/setup key
Use: check-discourse, setup verification, site settings/capability reads, embed/topic reconciliation when the granular publishing key cannot read the required endpoints
Bot user role: Admin currently; diagnostics key is admin-capable by design
Key scope: Global
Operational rule: Keep this key out of runtime/deploy paths. Use only for setup checks, diagnostics, and controlled troubleshooting.
```

#### `read-only diagnostics key`

```text
Purpose: Read-only diagnostics/planning key
Use: GET-only preflight, comparison reports, routine setup verification, site settings/capability reads, and embed/topic checks
Bot user role: Admin currently; the key can read admin-visible information but cannot make non-GET API requests
Key scope: Read-only
Operational rule: Prefer this key for diagnostics, planning, and comparison work. Do not use it for publishing. Keep it out of runtime/deploy paths unless a reviewed read-only process explicitly requires it.
```

#### `bulk/diagnostics/import key`

```text
Purpose: Temporary bulk diagnostics/import key
Use: Bounded bulk comparison, import, migration, raw-source collection, or recovery work that cannot be completed with the durable read-only diagnostics or granular publishing keys
Bot user role: Admin currently; this temporary key is admin-capable by design
Key scope: Global
Operational rule: Create only for an explicitly bounded task. Keep it out of runtime/deploy paths. Use the read-only diagnostics key instead whenever the task requires GET requests only and that key can access every required endpoint. Revoke and delete after the bounded work, output verification, and evidence review are complete.
```

Established product rule: when documenting or requesting a granular publishing key, provide the exact Discourse scope settings. Do not describe the publishing key as "similar", "roughly", or "mostly" once a product key model has been settled.

Discourse API keys have two independent controls:

- **User Level:** `All Users` or `Single User`;
- **Scope:** `Global`, `Read-only`, or `Granular`.

With `All Users`, Discourse allows the request to act on behalf of the username
sent in `Api-Username`. With `Single User`, the key is bound to the selected
user. Scope separately controls which endpoints/actions are available. See
[Discourse Meta: Create and configure an API key](https://meta.discourse.org/t/create-and-configure-an-api-key/230124).

DiscussionBridge now has preferred request-actor controls:

- CLI `--post-as`;
- environment `DISCOURSE_POST_AS`;
- `publishOnBuild` lane/default `postAs` or `postAsEnv`.

Legacy `--api-username`, `DISCOURSE_API_USERNAME`, `apiUsername`, and
`apiUsernameEnv` remain compatible fallbacks. Actor precedence is explicit/lane
`postAs`, named `postAsEnv`, `DISCOURSE_POST_AS`, then legacy API-username
controls. The selected actor is sent as Discourse `Api-Username`.

When Discourse supports or confirms granular diagnostics/read scopes for the required endpoints, move to a two-key model:

- granular publishing key for runtime sync
- granular diagnostics/read key for setup checks

## Required Publishing Capabilities

The publishing key needs enough permission to:

- create topics and posts in the target category
- read existing linked topics and posts
- update the managed first post
- update topic title/category/tag metadata when enabled
- apply tags or create tags when the lane requires it
- unlist topics when `--unlist` is used

On typical Discourse installs, retitling replied topics and changing listing status can require a staff or moderator-capable user.

Use this exact granular publishing/runtime key scope set unless a new feature explicitly requires a documented change:

```text
categories
  list
  show

tags
  list

topics
  write
  update
  read
  status

posts
  edit
  list

search
  show
```

This is the settled runtime publishing key model used for DiscussionBridge-style publishing and sync. Diagnostics/setup work stays on the diagnostics key.

Allowed parameters from the Discourse granular key UI:

```text
categories show
  id: any parameter

posts edit
  id: any parameter

search show
  q: any parameter
  page: any parameter

topics write
  topic_id: any parameter

topics update
  topic_id: any parameter
  category_id: any parameter

topics read
  topic_id: any parameter
  external_id: any parameter

topics status
  topic_id: any parameter
  category_id: any parameter
  status: any parameter
  enabled: any parameter
```

## Required Diagnostics Capabilities

`check-discourse` and controlled import source reads are read-oriented, but
useful diagnostics and first-post raw may require endpoints that granular keys
cannot always read.

It may inspect:

- `/site/settings.json` for client-visible authoring limits
- `/site.json` for user-specific capabilities such as tag permissions
- `/categories.json` for category existence
- `/tags.json` for tag inventory
- `/posts/{id}.json` when `import-existing` must fall back from topic JSON to
  retrieve first-post raw
- `/embed/info?embed_url=...` for existing embedded-topic reconciliation
- exact URL search as a fallback reconciliation check

If a granular key receives `403` for these endpoints, use one of these fallbacks:

- provide explicit CLI/env limits for title/body/tag preflight
- run `check-discourse` with a diagnostics key
- manually verify the Discourse setting and record it in deployment docs

## Environment Variables

Runtime publishing:

```sh
DISCOURSE_POST_AS=discussbridge-bot
DISCOURSE_API_USERNAME=discussbridge-bot
DISCOURSE_API_KEY=publishing-key
```

Prefer `DISCOURSE_POST_AS`. Keep `DISCOURSE_API_USERNAME` only where a current
installation still relies on the compatibility fallback.

Optional diagnostics:

```sh
DISCOURSE_DIAGNOSTICS_API_KEY=diagnostics-key
```

Optional explicit limits:

```sh
DISCOURSE_TITLE_MIN_LENGTH=15
DISCOURSE_MAX_TOPIC_TITLE_LENGTH=255
DISCOURSE_MAX_POST_LENGTH=32000
DISCOURSE_MAX_TAGS_PER_TOPIC=5
DISCOURSE_MAX_TAG_LENGTH=20
```

## Storage

Do:

- store keys in a protected credential vault
- store deployment secrets in the hosting provider's encrypted environment settings
- keep local shell variables session-scoped when testing
- rotate keys after accidental exposure
- keep key filenames descriptive enough to identify purpose and date

Do not:

- commit API keys
- paste real keys into docs, issues, PRs, screenshots, or build logs
- put production keys in example `.env` files
- reuse personal admin keys for routine automation

Example filename convention:

```text
discussionbridge-forum-discussbridge-bot-publishing-granular-key-YYYYMMDD.txt
discussionbridge-forum-discussbridge-bot-diagnostics-key-YYYYMMDD.txt
```

## Credential File Templates

Use the same structure for every stored Discourse API key. Keep the human-readable purpose and scope above the key value.

Whenever setup instructions ask an operator to create a key, present the
matching metadata block together with the key description, user, scope, and
granular permissions. Copy that metadata into the respective protected
credential file above the secret value. The manual and setup interaction show
the placeholder only; they never show or request the real key.

### Publishing Granular Key File

```text
Purpose: Runtime publishing granular key
Use: publish-new, sync-existing, publish-and-sync, check-discourse basic limits
Bot user role: Admin currently; intended future runtime posture is non-admin or least-privilege
Key user level: Record All Users or Single User; prefer Single User for a fixed runtime actor
Key scope: Granular
Operational rule: Use this to validate the minimum permissions needed for normal bridge publishing.

Description
{site-or-project} publishing granular key

Key selected user
{bot-username when User Level is Single User; not applicable for All Users}

Request actor
{resolved postAs / Api-Username}

User Level
{Single User or All Users; if Single User, record the selected user}

Scope
Granular

Scopes
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

Key
{paste key here}
```

### Diagnostics Key File

```text
Purpose: Diagnostics/setup and protected source-read key
Use: check-discourse; controlled import-existing source reads when granular raw-post access fails
Bot user role: Admin
Key user level: Record All Users or Single User and the selected user/actor relationship
Key scope: Global or admin-read capable
Operational rule: Do not use in CI/build unless explicitly intended

Description
{site-or-project} diagnostics key

Key selected user
{admin-bot-username when User Level is Single User; not applicable for All Users}

Request actor
{resolved postAs / Api-Username used for diagnostics}

User Level
{Single User or All Users; if Single User, record the selected user}

Scope
Global or admin-read capable

Permissions
read-only diagnostics and controlled import-existing source reads; global or admin-read capability as required

Key
{paste key here}
```

## Leak Paths

Keys can leak through:

- committed `.env` files
- command history copied into issues or chat
- build logs that print environment variables
- screenshots of terminal windows or admin pages
- CI/CD secret misconfiguration
- shared machines or synced folders with broad access
- package fixtures or demo repos that accidentally include real credentials

If a key leaks, revoke it in Discourse, create a replacement, update the deployment secret, and rerun `check-discourse`.

## Rotation

Rotate keys when:

- a user leaves the project
- a key is pasted into an unsafe place
- permissions change from global to granular
- the bot user's role changes
- moving from Alpha testing to a public release

For rotation:

1. Create the replacement key.
2. Update local or hosting secrets.
3. Run `check-discourse`.
4. Run a dry-run publish or sync.
5. Revoke the old key.
6. Record the rotation date in private ops notes.

## Delegated Posting Investigation

`postAs` is now the implemented preferred actor selector. It changes the
`Api-Username` request actor; it does not transfer ownership of an existing
topic. Whether that actor may differ from the key's selected user depends on the
key's **User Level**, while endpoint authority depends on **Scope**.

Before a write, record and verify the key User Level, its selected user when
`Single User`, the resolved `postAs`/`Api-Username` actor, the key
Scope/granular permissions, and the actor's category/tag/staff permissions.
Live CLI output should show `Post as: USER`; `check-discourse` reports
`Request actor`.

### Nonhuman Identity Inventory

Across connected forums, no two nonhuman accounts may have the same—or
visually ambiguous—username/display-name combination. Encode both role and
origin system.

| Origin | Candidate username | Candidate public name |
| --- | --- | --- |
| DiscussionBridge Forum | `editorbridgeforum` | DiscussionBridge Forum Editor |
| Citizen Activist Network Forum | `editorcanforum` | CAN Forum Editor |

Discourse normalizes username case. Check the exact final username against each
site's length rules and availability before creation. Astro-origin publishing
accounts should identify the originating site/brand rather than only the
destination forum. Preserve established `obbba-bot` as the OBBBA source
identity.

Create a `special-admin` custom group on each forum as the visible inventory
home for nonhuman admin/service accounts. Group membership is organizational
only: it does **not** grant Discourse admin status, category permissions, or API
rights. Assign those separately.

## Build Logs

The CLI should never print key values. Operators should also avoid commands that echo environment variables near build output.

Safe:

```sh
npx astro-discussion-bridge check-discourse --discourse-url https://forum.example.com --category-id 5
```

Unsafe:

```sh
echo $DISCOURSE_API_KEY
```

When reporting support issues, include command, mode, Discourse URL, category ID, tags, page URL, and sanitized error output. Do not include API key values.
