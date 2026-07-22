# Discussion Bridge for Astro Human Manual

This manual is the operator-facing path for connecting Astro pages to Discourse.
It explains the decisions, safe sequence, expected results, and points where an
operator should stop. Use the [Machine Manual](./MACHINE_MANUAL.md) beside it
when exact commands, fields, scopes, or recovery checks matter.

Discussion Bridge keeps each system doing the job it does well:

- Astro owns fast, structured public pages.
- Discourse owns identity, replies, moderation, notifications, and community
  memory.
- Discussion Bridge maintains the declared relationship between them.

This is Alpha documentation. Preview every write, keep publishing opt-in, and
verify both systems after a live operation.

## 1. Plan The Connection

Before installing anything, record one row for each content lane:

| Decision | Example |
| --- | --- |
| Astro site URL | `https://docs.example.com` |
| Discourse URL | `https://forum.example.com` |
| Content directory | `src/content/docs` |
| Route base | empty for docs, `blog` for `/blog/...` |
| Discourse category ID | `5` |
| Discourse tags | `product,docs` |
| Source mode | `astro-managed`, `discourse-managed`, or `discourse-imported` |
| Comments mode | `simple`, `full`, or `fullInteractive` |
| Listing behavior | listed or unlisted |

A content lane is one source directory plus its route, category, tags, and
operating behavior. Docs, blog posts, news, and releases should normally be
separate lanes.

> **Stop if:** the public page URL, source owner, category, or managing page is
> unclear. A wrong route base or source mode can attach or write to the wrong
> discussion.

**Visual placeholder:** lane-planning worksheet with one completed docs lane.

## 2. Choose The Source Mode

The source mode is an editorial safety decision.

| Mode | Source of truth | Allowed bridge behavior |
| --- | --- | --- |
| `astro-managed` | Astro | May publish a new topic and sync its managed first post. |
| `discourse-managed` | Discourse | Display or pull from Discourse; do not write back. |
| `discourse-imported` | Imported Astro copy | Edit locally if desired, but do not write back until explicitly promoted. |

For every `discourse-managed` or `discourse-imported` page, add this frontmatter
guard:

```yaml
discussionSync: false
```

The named source modes currently express operating policy; the CLI write guard
is `discussionSync: false`. `import-existing` does not add that guard
automatically in the current Alpha implementation. Add it immediately after a
live import and review it before running any directory-wide sync command.

Promotion means a human explicitly decides Astro will become the source of
truth, reviews the page and linked topic, and removes the guard. Editing an
imported file by itself is not promotion.

> **Stop if:** an imported or Discourse-owned page lacks `discussionSync:
> false`, or promotion was not explicitly approved.

## 3. Prepare Discourse

1. Create a dedicated bot user, such as `discussbridge-bot`.
2. Create or choose the destination category.
3. Create the planned tags, or confirm the bot can create them.
4. Add the exact Astro hostname as an allowed embedding host.
5. Create a granular publishing key for routine publish and sync operations.
6. Create a separate diagnostics key for setup checks when granular reads are
   insufficient.

The settled publishing scopes are:

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

The diagnostics key is currently a global/admin-capable fallback for
`check-discourse` and controlled troubleshooting. Do not place it in the normal
runtime or deployment path.

Store key values only in a credential vault, session environment, or hosting
provider secret store. Never place them in source files, screenshots, issues,
chat, or build logs.

> **Stop if:** the routine publishing key is broader than intended without a
> recorded reason, the diagnostics key is configured as the normal publishing
> key, or a real key appears in a file or screenshot.

**Screenshot placeholder:** Discourse granular-key screen showing only the
settled publishing scopes and no visible key value.

## 4. Install And Configure Astro

From the Astro project root:

```sh
npm install astro-discussion-bridge
```

Configure the integration in `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import discussionBridge from "astro-discussion-bridge";

export default defineConfig({
  site: "https://docs.example.com",
  integrations: [
    discussionBridge({
      provider: "discourse",
      preset: "astro",
      discourseUrl: "https://forum.example.com",
      siteUrl: "https://docs.example.com",
      comments: { display: "simple" },
      publishOnBuild: { enabled: false },
    }),
  ],
});
```

Use `preset: "starlight"` for Starlight and `preset: "astro"` for broader
Astro sites. Keep `publishOnBuild.enabled` false until the lane has passed
explicit CLI dry runs and a controlled live test.

For Starlight placement and the layout override, follow
[Alpha Setup](./ALPHA_SETUP.md). You should see the Astro site build normally
and the discussion area appear only on pages with linked topic metadata.

## 5. Configure Credentials Without Exposing Them

Set these in the shell running the command or in a protected CI/deployment
secret store:

```text
DISCOURSE_URL
SITE_URL
DISCOURSE_API_USERNAME
DISCOURSE_API_KEY
DISCOURSE_DIAGNOSTICS_API_KEY
```

`DISCOURSE_DIAGNOSTICS_API_KEY` is optional. When absent,
`check-discourse` falls back to the publishing key and may report metadata as
unavailable rather than failing.

You should be able to run a command without printing any key value.

## 6. Use The Safe Operating Loop

Use this loop for every lane:

1. **Diagnose:** run `check-discourse`.
2. **Preview:** run the intended command with `--dry-run --details`.
3. **Review:** confirm title, page URL, target, topic ID, category, tags, and
   skip/update reason.
4. **Write:** remove `--dry-run` only when the preview is correct.
5. **Verify:** inspect Discourse, Astro, and deployed behavior.
6. **Record:** preserve new failures or recovery facts in the manuals.

### Check The Forum

```sh
npx astro-discussion-bridge check-discourse \
  --discourse-url https://forum.example.com \
  --category-id 5 \
  --tags product,docs \
  --page-url https://docs.example.com/example-page/
```

You should see discovered limits, tag capabilities, category details, setup
issues or warnings, and reconciliation details when `--page-url` is present.
Warnings about unavailable site metadata mean the key could not prove the
setting; they are not permission to guess.

Page-URL reconciliation and explicit existing-topic linking are different:

- When a page supplies `discourseTopicId`, that topic ID is authoritative for
  the native/full-app embed. A page-URL embed-info `404` or exact search with no
  owner does not invalidate a healthy explicit topic.
- When no topic ID is supplied, the embed uses the page URL and URL ownership
  must reconcile correctly before release.

Always verify the explicit topic directly as well as recording any independent
page-URL reconciliation result.

### Publish Missing Topics

Use `publish-new` for `astro-managed` pages that do not yet have a topic ID.

```sh
npx astro-discussion-bridge publish-new src/content/docs --dry-run --details
npx astro-discussion-bridge publish-new src/content/docs
```

The live run should create missing companion topics and write link/sync metadata
to the Astro frontmatter. Already-linked pages are skipped.

### Sync Linked Topics

Use `sync-existing` when Astro owns already-linked topics.

```sh
npx astro-discussion-bridge sync-existing src/content/docs --dry-run --details
npx astro-discussion-bridge sync-existing src/content/docs
```

Pages without `discourseTopicId` and pages with `discussionSync: false` are
skipped. Use `--force` only when deliberately rewriting a first post despite an
unchanged source hash.

Files may use either LF or Windows CRLF line endings. The bridge recognizes both
frontmatter forms and preserves the existing style when it updates frontmatter.
If a valid linked page is unexpectedly reported as `not linked`, stop before any
write and check frontmatter-boundary parsing rather than relinking the topic.
Both read-side guard recognition and write-side line-ending preservation are
covered by regression tests.

### Publish And Sync A Mixed Lane

```sh
npx astro-discussion-bridge publish-and-sync src/content/docs --dry-run --details
npx astro-discussion-bridge publish-and-sync src/content/docs
```

This is convenient but has the broadest write surface. Prefer the narrower
commands when separating creation from maintenance makes review easier.

### Import An Existing Topic

```sh
npx astro-discussion-bridge import-existing src/content/docs \
  --topic https://forum.example.com/t/example-topic/123 \
  --site-url https://docs.example.com \
  --dry-run
```

After reviewing the destination, run the command without `--dry-run`, then add:

```yaml
discussionSync: false
```

You should see a Markdown file linked to the original topic. Review the imported
body and frontmatter before building or editing. Avoid `--overwrite` unless the
replacement is intentional and recoverable.

> **Stop if:** a dry run shows an unexpected page URL, topic ID, target,
> category, managing page, overwrite, or writeback-eligible imported page.

## 7. Choose A Comments Display Mode

| Mode | Use it when | Verify |
| --- | --- | --- |
| `simple` | A lightweight Discourse embed is enough. | Embed host is allowed; basic comments load. |
| `full` | Astro-native display and reply metadata matter. | Replies and likes render; browser refresh works through CORS or a proxy. |
| `fullInteractive` | Logged-in reply, like, quote, and moderation should remain inside Discourse. | Full-app embed, sign-in, iframe height, and mobile behavior work. |

For `full`, configure a same-origin `refreshEndpoint` when browser CORS does not
allow direct topic JSON reads. For `fullInteractive`, enable Discourse's full-app
embed settings and test both signed-in and signed-out users.

For an existing topic, pass its topic ID through the complete component path.
The native embed should configure `{ topicId }` when it is present and fall back
to `{ discourseEmbedUrl: embedUrl }` only when there is no explicit topic ID.

**Screenshot placeholders:** one desktop and one mobile capture for each mode.

**Video placeholder:** sign in, reply, like, and return to the Astro page in
`fullInteractive` mode.

### Planned Comments-Boundary Credit

A future configurable credit may say `Discussion connection by Discussion
Bridge` or `Discourse connection by Discussion Bridge`. Final wording, default
behavior, and configuration remain undecided. It must link to the canonical
product page, remain visually secondary, be accessible, work across all three
comments modes, and not be hard-coded into site content.

This is a roadmap item and does not change the current reviewed artifact or its
deployment gate.

## 8. Content Lanes And Route Bases

If `src/content/blog/example.md` renders at `/blog/example/`, use:

```sh
--route-base blog
```

The page URL is part of the Discourse ownership contract. Check it in
`--details` output before every lane's first live write. Only one Astro page may
manage a topic in a run; comparison pages should use `discussionSync: false`.

Keep Astro/template content tags separate from Discourse `discussionTags`
unless an explicit mapping is introduced later.

## 9. Deploy And Verify On Cloudflare Pages

Discussion Bridge does not require Cloudflare Pages, but the Alpha demos use it.
For a static Astro site:

1. Build from the canonical repository and the intended site/example root.
2. Use the project's normal install and `npm run build` commands.
3. Confirm the output directory matches the Astro/Cloudflare project settings.
4. Set the final public URL in Astro `site` and Discussion Bridge `siteUrl`.
5. Attach the intended custom domain and wait for HTTPS to become valid.
6. Add that exact hostname to Discourse's allowed embed hosts.
7. Verify the homepage, a lane route, its companion topic, and comments.
8. When Workers are used, verify both the Worker endpoint and canonical domain.
9. Confirm the deployed page has the expected package/topic signature and that
   any retired renderer is absent.

If more than one Cloudflare account is available, the approved site deployment
configuration should pin the intended account so deployment is repeatable. Keep
private account labels and login addresses out of public manuals and screenshots.

Before making a deployment-only commit, inspect the site worktree. Preserve and
report unrelated pre-existing edits instead of silently including them.

If the deployed page looks stale, verify the deployment commit and Discourse
topic first. Then test with a cache-bypassing request or clear only the relevant
Cloudflare cache. Do not treat a confirmed sync as failed until cache state is
ruled out.

> **Stop if:** the deployment uses a transitional copy instead of canonical
> source, the custom domain differs from `siteUrl`, HTTPS is invalid, or the
> Discourse embed host does not exactly match the public hostname.

## 10. Verify And Recover

After a live operation, verify:

- CLI summary reports the expected created, updated, skipped, or unchanged count.
- the topic title, category, tags, and listing state are correct;
- the first post contains the intended reader-facing content and source link;
- frontmatter contains the expected topic link and sync metadata;
- the Astro page and full-discussion link work;
- comments work in the chosen mode;
- no secret appears in source, output, screenshots, or support material.

Never automatically recreate a deleted topic or first post. Confirm whether the
deletion was intentional, then choose restore, relink, or replacement explicitly.
See [Troubleshooting](./TROUBLESHOOTING.md) for known failures and recovery
guidance.

## 11. Release Readiness And Product Boss Approval

Code completion alone does not make a release ready. For every Alpha, Beta,
release candidate, patch, and Current release, the release record must show:

1. Code Boss reviewed the exact release candidate and recorded pass or fail.
2. All blocking code-review edits are complete and re-reviewed when required.
3. Bridge Boss completed technical verification.
4. Manual Boss completed documentation quality review.
5. The Human and Machine Manuals are ready for the exact release.
6. Product Boss documentation sign-off is recorded.
7. Product Boss release approval is recorded.

These last two decisions are different:

- **Product Boss documentation sign-off** confirms that the manuals and product
  docs accurately describe the proposed release.
- **Product Boss release approval** confirms that the release is coherent across
  intended scope, operator readiness, known limitations, and its documentation
  package.

Product Boss release approval does not replace Code Boss review, Bridge Boss
technical verification, or Manual Boss quality review. A failed, unresolved, or
edit-pending Code Boss review blocks Product Boss approval.

> **Stop if:** any required review is missing, a blocking edit is unresolved,
> the manuals describe a different build, or either Product Boss decision has
> not been recorded for the exact release candidate.

## 12. Alpha Support And Release Channel

The current Alpha release decision is GitHub release plus repository-installable;
npm publication is held until late Beta. The intended support split is:

- GitHub Issues for confirmed bugs, reproducible failures, docs gaps, and
  feature work;
- the Discussion Bridge Alpha Support category for setup questions, field
  reports, screenshots, and community help;
- `alphasupport@discussionbridge.dev` as email intake routed into Discourse;
- paid help for private implementation and migration work.

The live support category and email route remain release prerequisites until
verified. Never include keys or credentials in a support report. Follow
[Support And Feedback](./SUPPORT_AND_FEEDBACK.md) for the sanitized diagnostic
fields to include.

## Related Guides

- [Machine Manual](./MACHINE_MANUAL.md)
- [Alpha Setup](./ALPHA_SETUP.md)
- [Key Management](./KEY_MANAGEMENT.md)
- [Content Lanes](./CONTENT_LANES.md)
- [Comments Display](./COMMENTS_DISPLAY.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
- [Build/Launch Checklists](./BUILD_LAUNCH_CHECKLISTS.md)
