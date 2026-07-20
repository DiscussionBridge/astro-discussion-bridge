# Key Management Guide

DiscussionBridge uses Discourse API keys to publish, sync, diagnose, and recover companion topics. Treat keys as operational credentials.

## Key Roles

Use separate keys when possible:

- publishing key: normal `publish-new`, `sync-existing`, and `publish-and-sync` runs
- diagnostics key: setup checks with `check-discourse`
- recovery/admin key: rare repair operations that need broader authority

For Alpha, the practical model is:

- use a granular publishing key when it can create topics/posts, read linked topics/posts, update managed first posts, update topic metadata, update tags, and unlist when needed
- use a global/admin-capable diagnostics key when granular keys cannot read the site metadata or reconciliation endpoints needed by `check-discourse`

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

## Required Diagnostics Capabilities

`check-discourse` is read-only, but useful diagnostics may require endpoints that granular keys cannot always read.

It may inspect:

- `/site/settings.json` for client-visible authoring limits
- `/site.json` for user-specific capabilities such as tag permissions
- `/categories.json` for category existence
- `/tags.json` for tag inventory
- `/embed/info?embed_url=...` for existing embedded-topic reconciliation
- exact URL search as a fallback reconciliation check

If a granular key receives `403` for these endpoints, use one of these fallbacks:

- provide explicit CLI/env limits for title/body/tag preflight
- run `check-discourse` with a diagnostics key
- manually verify the Discourse setting and record it in deployment docs

## Environment Variables

Runtime publishing:

```sh
DISCOURSE_API_USERNAME=discussbridge-bot
DISCOURSE_API_KEY=publishing-key
```

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

Future multisite or agency use cases may need one trusted Discussion Bridge control-plane bot to publish notices, admin messages, or dashboard updates across multiple Discourse users, channels, or client forums.

Before supporting that pattern, confirm:

- whether Discourse allows an admin/bot API key to post or message as another user
- which endpoint, scope, or plugin capability controls that behavior
- how actions are audited in Discourse
- whether the feature should require a separate diagnostics/control-plane key
- whether the behavior belongs in the API-only package, an optional Discourse plugin, or both

Possible future configuration shape:

```js
discussionBridge({
  postAs: "admin-team",
});
```

```yaml
discussionPostAs: "chapter-admin"
```

Default behavior should remain posting as the API key user, usually the Discussion Bridge bot. Any delegated posting should be explicitly configured, never inferred. CLI and diagnostics output should make the distinction visible, for example: `posting as chapter-admin via key user discussbridge-bot`.

Treat delegated posting as a high-trust feature. It should never be enabled as a casual default for routine companion-topic publishing.

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
