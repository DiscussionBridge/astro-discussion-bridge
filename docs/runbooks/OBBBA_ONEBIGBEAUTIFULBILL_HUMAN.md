# OBBBA Human Runbook: onebigbeautifulbill.us and forum.repealobbba.org

Status: existing proof-page package migration and live fullInteractive interaction verified; fresh-import Alpha gate open
Environment: current live proof lane plus local canonical source  
Last verified from workspace facts: 2026-07-21  
Companion: [OBBBA Machine Runbook](./OBBBA_ONEBIGBEAUTIFULBILL_MACHINE.md)

This runbook covers the first real OBBBA Discussion Bridge lane:

- public site: `https://onebigbeautifulbill.us`
- community/source forum: `https://forum.repealobbba.org`
- proof page: `https://onebigbeautifulbill.us/title-i/10101-impact/`
- source topic: `https://forum.repealobbba.org/t/sec-10101-re-evaluation-of-thrifty-food-plan-impact/434`

Spelling matters: the canonical forum hostname is `forum.repealobbba.org`.

Never place passwords, API keys, tokens, private account values, or production
secrets in this runbook, screenshots, tickets, or chat.

## 1. What This Lane Does

The forum holds the source discussion and community history. The Astro/Starlight
site presents a polished public impact-analysis page. The current Section 10101
page was manually imported, pruned, and polished from Discourse topic `434`.

The current relationship is intentionally one-way:

```text
forum.repealobbba.org topic 434
              |
              | manual import and prune
              v
onebigbeautifulbill.us/title-i/10101-impact/
              |
              | display the original discussion
              v
forum.repealobbba.org topic 434
```

Astro must not write the polished page back to the Discourse first post unless a
human explicitly promotes the page to `astro-managed`.

**Visual placeholder:** approved source-topic-to-public-page diagram.

## 2. Current Ownership And Review Lanes

| Responsibility | Lane |
| --- | --- |
| OBBBA/Discussion Bridge implementation | Bridge Boss |
| Discussion Bridge code review | Code Boss |
| OBBBA product manuals and runbooks | Product Boss |
| Manual quality and public/private review | Manual Boss |
| Cloudflare, DNS, forum, and account operations | Phil/Ops |

## 3. Current Site State

The canonical active repository is:

```text
https://github.com/OneBigBeautifulBill/onebigbeautifulbill.us.git
```

The canonical local source lane is:

```text
C:\CodeProjects\Projects\OBBBA\sites\onebigbeautifulbill.us\astro
```

The current site uses Astro 7, Starlight, Mermaid, the Cloudflare adapter, OG
image generation, and `astro-discussion-bridge`. The Alpha integration uses the
unique packed artifact
`vendor/astro-discussion-bridge-0.1.0-alpha-9ed59065.tgz`; it is not the final
release distribution.

> **Stop if:** work is pointed at the `legacy-source` directory, a copied deploy
> tree, a different forum spelling, or a different repository without an
> explicit source-ownership decision.

## 4. Source-Mode Safety

The proof page currently contains:

```yaml
discussionSourceMode: discourse-imported
discussionSync: false
discourseTopicId: 434
discourseTopicUrl: https://forum.repealobbba.org/t/sec-10101-re-evaluation-of-thrifty-food-plan-impact/434
discussionImportedFrom: https://forum.repealobbba.org/t/sec-10101-re-evaluation-of-thrifty-food-plan-impact/434
discussionImportPolicy: manually-pruned
discussionCommentsDisplay: fullInteractive
```

Before editing or building, confirm `discussionSync: false` is still present.
Editing the Astro page does not promote it. Promotion requires a recorded human
decision, an ownership review, and an explicit change to the source mode.

This MDX file uses Windows CRLF line endings. The package recognizes both LF and
CRLF frontmatter boundaries and preserves the existing line-ending style when
it updates frontmatter.

> **Stop if:** the guard is absent, the topic ID is not `434`, the source URL
> changes unexpectedly, or anyone proposes writeback without explicit promotion.

## 5. Read And Edit The Proof Page

Open:

```text
src/content/docs/title i/10101-impact.mdx
```

The page should contain:

- the Section 10101 impact analysis;
- the image `src/assets/obbbanotso.png` with alt text `One Big (not so)
  Beautiful Bill`;
- links back to the source topic/footnotes;
- the Discourse topic ID and URL;
- `fullInteractive` comments configuration;
- `discussionSync: false`.
- an import of `astro-discussion-bridge/Discussion.astro`.

Preserve the imported source relationship even when polishing prose in Astro or
GitCMS. Forum-only boilerplate may be pruned, but source attribution and the
discussion link remain.

## 6. Build And Preview

From the canonical Astro project root:

```sh
npm run build
```

You should see the Section 10101 route generated along with site assets and
search output. The known Starlight warning may appear:

```text
Entry docs -> 404 was not found
```

The verified build also reported the existing large-chunk warning and punycode
deprecation. The deployment-shaped build passed after installing the packed
Alpha artifact. An `npm clean-install` wrapper timed out after 184 seconds, but
the package resolved afterward and the complete build passed; a timeout alone
is not proof of either success or failure.

Sandboxed builds may also fail when OG image font fetching needs external
network access or Wrangler tries to write profile logs. A deployment-shaped
build previously passed with normal network/profile access.

> **Stop if:** the Section 10101 route is missing, the source-mode guard changes,
> a real credential appears in output, or a new build failure is dismissed as a
> known warning without verification.

## 7. Verify The Discussion

The selected proof mode is `fullInteractive` because the page is long enough to
show the Discourse interaction after the article and because the OBBBA lane is
intended to encourage forum participation.

Verify:

1. Open `https://onebigbeautifulbill.us/title-i/10101-impact/`.
2. Confirm the public analysis renders completely.
3. Confirm the discussion area points to topic `434` on
   `forum.repealobbba.org`.
4. Test logged-out behavior.
5. Test logged-in reply, like, quote, and sign-in behavior when the full app
   embed is enabled.
6. Test desktop and mobile layout.
7. Confirm the public page remains readable when the forum is unavailable.

This page explicitly links topic `434`. In that case, the full-app embed must use
the topic ID; it does not require Discourse to reconcile the public page URL to
an owning topic. A page-URL embed-info `404` or an exact search with no owner is
a separate diagnostic result, not evidence that topic `434` is broken.

If the embed does not open topic `434`, inspect the generated `topicId`, forum
host, full-app setting, CSP/embed configuration, and fallback link. Use the
native `full` display as a deliberate fallback only after recording the decision.

**Screenshot placeholders:** desktop and mobile Section 10101 page with the
discussion beginning below the article body.

**Video placeholder:** signed-out page load followed by Discourse sign-in and a
test reply on the approved test topic/account.

The existing proof-page signed-in reply item is complete. The approved browser session
created post `12`, containing `Test post after Discussion Bridge update`, at
`https://forum.repealobbba.org/t/434/12`. Topic `434` now has 12 posts. The test
account identifier is intentionally omitted from this runbook.

## 8. Current Key Model

The Discourse bot user is `obbba-bot`. The settled key model is:

- granular publishing/runtime key for future routine bridge operations;
- separate global/admin-capable diagnostics key for setup checks;
- diagnostics key kept out of runtime and deployment paths.

The key values belong in the approved credential vault. This runbook records
only names, purposes, and scopes.

The publishing scopes are:

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

The current proof page is import/display-only. Do not run publish or sync against
it merely because publishing credentials exist.

## 9. Verified Alpha Integration And Next Pass

Bridge Boss completed the local package migration without a Discourse write:

1. The site consumes the unique packed Alpha artifact.
2. Astro is configured for Starlight, the canonical site/forum URLs,
   `fullInteractive`, and `publishOnBuild: false`.
3. The proof page imports the package `Discussion.astro` component.
4. All source-mode, topic, manually-pruned content, image, alt text, and comments
   settings were preserved.
5. The package regression suite passed 35/35, including CRLF guard and
   write-side line-ending preservation tests.
6. The deployment-shaped OBBBA build passed.
7. Generated HTML contains topic ID `434`, `fullApp=true`, the correct forum
   URL, and the correct fallback topic URL.
8. No publish, sync, import, overwrite, or other Discourse write occurred.

Code Boss's P2 review correction is included: the shipped embed declaration now
distinguishes an explicit `topicId` from a `discourseEmbedUrl`, while allowing
the optional `fullApp` and `embedHeight` settings.

The corrected safe preview recognized linked topic `434` and skipped the page
with reason `discussionSync is false`: 0 created, 0 updated, 1 skipped,
0 unchanged, and 0 dry-run. The earlier `not linked` result was caused by CRLF
frontmatter parsing and did not write to Discourse.

The next pass is live behavior verification, resolution of the remaining Ops
inputs, Code Boss review of the exact candidate, and replacement of the packed
Alpha artifact with the approved GitHub release asset at release time.

The Discourse category ID and required topic tags for this proof lane are not
yet recorded in the durable source reviewed for this runbook. They must be
confirmed before any command that could create or update topic metadata.

> **Stop if:** the explicit topic changes unexpectedly, a write is proposed for
> this imported lane, or category/tag values are guessed.

## 10. Deployment And Domain Checks

The Astro configuration uses:

```text
site: https://onebigbeautifulbill.us
Cloudflare worker name: onebigbeautifulbill
production branch: main
```

Live deployment evidence:

- Package implementation/manual commit `7aadcf63c76b8ebd9e0c9383b5c7386ad704396e`
  is on `main`.
- OBBBA integration commit `f277171` and deterministic deployment fix
  `e9c279dbe1b0bec512ff7fcf0c9ec6f17f0dd6b8` were pushed.
- Worker `onebigbeautifulbill` deployed successfully as version
  `85478ec8-af54-42bf-828e-2e0f2f1e0337` at
  `https://onebigbeautifulbill.systems-b95.workers.dev`.
- The canonical proof page returns HTTP 200 and contains the package signature:
  topic `434`, `fullApp=true`, the correct forum and fallback URLs, and the hero
  image. The legacy `data-topic-id` renderer is absent.
- Topic `434` remains visible, open, unarchived, and has 12 posts. A signed-in
  reply was created and verified after deployment.
- `publishOnBuild` remains false; deployment performed no publish, sync, or
  import write.

`wrangler.jsonc` now pins the operational Cloudflare account ID so deployment is
deterministic. The private account label is intentionally omitted from this
public-facing runbook. The broader OBBBA-versus-Citizen-Activist ownership
decision remains open.

Verify the deployed commit, HTTPS, the Section 10101 route, the source topic,
the embed host setting, and comments behavior. Cloudflare account ownership and
the OBBBA-versus-Citizen-Activist ownership boundary remain an Ops decision; do
not invent or relocate that boundary in this runbook.

## 11. Recovery

- If topic `434` is missing or deleted, do not recreate it automatically.
- If the Astro page is missing, recover it from the canonical repository and
  verify its source metadata before deploying.
- If comments fail, keep the public analysis readable and retain a direct link
  to the forum topic.
- If the deployment appears stale, verify the commit and forum state, then test
  cache bypass or a narrowly scoped purge.
- If a credential leaks, revoke it, replace it through the private vault path,
  and rerun diagnostics. Never record the replacement value here.

## 12. Release Sign-Off

### Deferred Demo And Credit Work

After the broader fresh-import OBBBA gate is approved, add one or two clearly labeled demo/credit
pages on `onebigbeautifulbill.us` whose companion topics live on
`forum.discussionbridge.dev`. Each page must select that target explicitly.
Production OBBBA pages and source content remain on `forum.repealobbba.org`.

Describe this only as a bounded cross-forum topology proof—one step toward
many-to-many—not as general many-to-many support. The planned comments-boundary
credit must remain configurable, secondary, accessible, and outside site content.
Its final wording and default remain undecided.

For the exact OBBBA release candidate:

- [ ] Code Boss pass/fail recorded.
- [ ] Blocking code-review edits completed and re-reviewed where required.
- [ ] Bridge Boss technical verification completed.
- [ ] Manual Boss quality review completed.
- [ ] OBBBA Human and Machine Runbooks match the release candidate.
- [ ] Product Boss documentation sign-off recorded.
- [ ] Product Boss release approval recorded separately.

No OBBBA release ships because code alone is complete.

### Broader Alpha Gate Still Open

The completed milestone is **existing proof-page package migration and live
fullInteractive interaction verified**. It does not close the full OBBBA
Discourse-to-Astro Alpha gate.

Fresh topics and pages must still prove:

- [ ] Import with no hero and no pruning.
- [ ] Hero placement only, including required alt text.
- [ ] Prune rules only.
- [ ] Hero placement plus prune rules, including required alt text.
- [ ] Each generated page has `discussionSourceMode: discourse-imported`,
      `discussionSync: false`, and the correct topic ID and URL.
- [ ] Each approved proof builds, deploys, renders live, and displays comments.
- [ ] No proof accidentally writes imported Astro content back to Discourse.

## 13. Current Open Inputs

- [ ] Confirm the Discourse category ID for the proof lane.
- [ ] Confirm required Discourse tags for topic `434`/the impact-analysis lane.
- [ ] Confirm full-app embed settings and explicit-topic behavior live.
- [x] Complete local package migration and deployment-shaped build verification.
- [ ] Replace the packed Alpha artifact with the approved GitHub release asset
      for the release candidate.
- [ ] Confirm Cloudflare ownership/account boundary.
- [x] Verify live canonical proof page and Worker deployment signature.
- [x] Verify a signed-in browser-session reply against topic `434`.
- [ ] Complete the fresh import/hero/prune proof matrix above.
- [ ] Complete Manual Boss review and approve or replace visual placeholders.
