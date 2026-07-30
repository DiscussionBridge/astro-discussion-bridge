# Troubleshooting Guide

Start with the CLI or build output. It is the source of truth for publish and sync runs. Discourse notifications are useful, but they can fail when credentials, network access, or forum permissions are broken.

## First Checks

Run from the Astro project root.

```sh
npx astro-discussion-bridge check-discourse \
  --discourse-url https://forum.example.com \
  --category-id 5 \
  --tags discussionbridge,docs
```

Then run the intended publish or sync command with `--dry-run --details`.

```sh
npx astro-discussion-bridge publish-and-sync src/content/docs \
  --dry-run \
  --details
```

Check:

- docs directory
- route base
- computed page URL
- topic ID
- category ID
- tags
- active target
- dry-run status
- skip or failure reason

## Missing API Credentials

Symptom:

```text
Missing required configuration: DISCOURSE_API_KEY or --api-key, plus DISCOURSE_POST_AS or --post-as (legacy API-username controls remain fallback-compatible)
```

Fix:

- set preferred `DISCOURSE_POST_AS` or `--post-as`
- use `DISCOURSE_API_USERNAME` / `--api-username` only as a compatibility fallback
- set `DISCOURSE_API_KEY`
- run from the same shell session where the variables are set
- use hosting-provider encrypted environment variables for deployed builds

PowerShell:

```powershell
$env:DISCOURSE_POST_AS="discussbridge-bot"
$env:DISCOURSE_API_KEY="paste-publishing-key-here"
```

## Title Is Too Short

Symptom:

```text
Title is too short
```

Fix:

- give the Astro page a clearer `title`
- use a title template or prefix when available
- pass a site-appropriate `--title-min-length`
- use `--dry-run --details` before publishing

## Title Already Exists

Symptom:

```text
Title has already been used
```

Fix:

- check whether the topic already exists
- confirm the page does not already have `discourseTopicId`
- confirm the page URL and route base are correct
- use `check-discourse --page-url` to test whether the existing topic can be resolved
- link the page to the existing topic when ownership is clear

## Embed URL Already Taken

Symptom:

```text
Embed url has already been taken
```

Cause:

Discourse may already have a topic for the Astro page URL, often created by native embedding before the CLI published it.

Fix:

```sh
npx astro-discussion-bridge check-discourse \
  --discourse-url https://forum.example.com \
  --category-id 5 \
  --page-url https://docs.example.com/example-page/
```

If the bridge can reconcile the existing topic, rerun publish/sync with a key that can read the required lookup endpoints. If the key cannot read `/embed/info` or exact URL search, use a broader diagnostics key or manually link the page with `discourseTopicId` after confirming ownership.

## Body Too Long

Symptom:

Discourse rejects the post body, or local preflight reports the body exceeds `maxPostLength`.

Fix:

- use `discussionSummary` for long or rich pages
- increase `--max-post-length` only when the Discourse site allows it
- keep large tables, long generated content, and highly designed Astro content on the Astro page
- include a source link back to Astro

## Tag Problems

Symptoms:

- too many tags
- tag too long
- tag does not exist
- API user cannot tag topics
- API user cannot create tags

Fix:

- verify Discourse tag settings
- verify `max_tags_per_topic`
- verify `max_tag_length`
- create tags in advance
- give the bot user permission to tag topics
- use `check-discourse --tags tag1,tag2`

## Wrong Category

Fix:

- confirm the category ID in Discourse
- run `check-discourse --category-id ID`
- verify lane config and CLI flags
- verify page frontmatter overrides
- rerun sync with `--dry-run --details`

## Duplicate Managed Topic Or Page URL

Symptom:

```text
Multiple managed pages in this run use the same Discourse topic ID
```

or:

```text
Multiple managed pages in this run use the same page URL
```

Cause:

More than one Astro source page in the same publish/sync run claims ownership of the same Discourse companion topic or source page URL.

Fix:

- choose one Astro page as the managed source
- make comparison/demo pages display-only
- add `discussionSync: false` to pages that should render the topic without updating the first post
- remove duplicate `discourseTopicId` frontmatter from pages that should not render or update the topic
- split lanes so only the intended source page is included in a management run
- give each managed page its own Discourse topic when each page needs independent sync

This check runs before Discourse writes, including during `--dry-run`.

## Comments Do Not Refresh

For `full` mode:

- confirm the page has `discourseTopicId`
- confirm Discourse topic JSON is readable
- configure `replies.refreshEndpoint` when browser CORS blocks direct reads
- confirm the same-origin proxy route is deployed
- refresh the Astro page after a new Discourse reply

For `simple` mode:

- confirm the Discourse embedding host is allowed
- remember that Discourse controls the rendered output
- visible like counts may not appear

For `fullInteractive` mode:

- confirm `Embed full app` is enabled
- confirm `Embed full app signin flow` is configured appropriately
- classify the relationship correctly: subdomains of one registrable domain are
  cross-origin but same-site; unrelated registrable domains are cross-site
- for a genuinely cross-site embed, confirm the hidden Discourse setting
  `SiteSetting.same_site_cookies` is exactly `"None"`
- test logged-in and logged-out behavior
- test on a page where comments start below the first viewport

If top-level sign-in succeeds but the embed remains at **Waiting for sign-in**,
do not repeat the login loop. That symptom is consistent with a cross-site
iframe that cannot receive the forum session cookie. The hidden setting may not
appear in Admin search. On a self-hosted two-container installation, enter the
production Rails console through the actual web container (`web_only` in the
proven OBBBA installation), record the prior value, and make the controlled
change there. `./launcher enter app` is the standalone-container command and is
wrong for that layout. After the change, clear/reissue forum cookies and verify
top-level login, an ordinary CSRF-protected write, iframe authentication, and an
embedded reply.

## Discourse Refused to Connect

Fix:

- confirm embedding host settings
- confirm the Astro domain exactly matches the allowed host
- confirm `Embed full app` settings if using `fullInteractive`
- confirm HTTPS and certificate status
- check browser console for frame or CSP errors

## Discourse Offline

Publish/sync commands should fail clearly. Do not treat a successful Astro build as proof that Discourse publishing succeeded.

For pages:

- `simple` and `fullInteractive` should leave the Astro page shell intact
- `full` should show a temporary unavailable state when it cannot fetch replies
- the full discussion link should remain available when the topic URL is known

## Deleted Topic

If a linked Discourse topic is deleted, do not automatically recreate it. The bridge cannot safely know whether deletion was intentional.

Fix:

- confirm whether the topic was deleted intentionally
- decide whether to restore, relink, or create a replacement
- use an explicit repair workflow when available
- avoid guessing when ownership cannot be proven

## Deleted First Post

If the first post is missing, sync should fail clearly. The first post is the managed companion content.

Fix:

- confirm the topic state in Discourse
- restore the first post if appropriate
- decide whether relinking or re-importing is safer
- avoid silently creating replacement content in an active discussion

## Active Target Mismatch

Symptom:

A page is skipped because it has `discussionTarget` but the command used a different target or no target.

Fix:

```sh
npx astro-discussion-bridge sync-existing src/content/docs --target community
```

Use target labels to avoid syncing one page to the wrong Discourse instance or community lane.

## Stale Cloudflare or CDN Cache

If Discourse or Astro appears stale after a confirmed sync or deploy:

- trust the CLI/build output first
- verify the Discourse edit history or topic JSON
- verify the deployed Astro commit
- test with a cache-bypassing request
- clear the relevant Cloudflare cache when necessary

Do not classify the sync as failed until cache has been ruled out.

## Failure Notifications

Use `--notify-on-failure` to send a best-effort Discourse private message to configured recipients.

```sh
npx astro-discussion-bridge publish-and-sync src/content/docs \
  --notify-on-failure \
  --notify-recipients FORUM_USERNAME
```

Replace `FORUM_USERNAME` with the exact username of the Discourse account that
should receive the private message. Notifications use Discourse PM behavior.
They are helpful, but the CLI/build log remains authoritative.
