# Discussion Bridge Site Runbook: {Site Name}

Status: `{draft | review | approved | current}`  
Environment: `{development | staging | production}`  
Release/version: `{package version or release candidate}`  
Last verified: `{YYYY-MM-DD}`  
Companion: [Machine Runbook](./SITE_RUNBOOK_MACHINE_TEMPLATE.md)

This is the human/operator runbook for `{Site Name}`. It explains what to do,
what should happen, when to stop, and how to verify or recover. Replace every
brace-delimited placeholder before approval. Never place passwords, API keys,
tokens, private account values, or production secrets in this file.

## 1. Purpose And Ownership

`{Explain in plain language what this site publishes, why it connects to
Discourse, and what a successful connection gives readers and operators.}`

| Responsibility | Owner |
| --- | --- |
| Product/manual construction | Product Boss |
| Product implementation and technical verification | Bridge Boss |
| Code review | Code Boss |
| Manual quality review | Manual Boss |
| Site/domain/hosting operations | `{operator or team}` |
| Editorial approval | `{editor or team}` |

## 2. Site And Discussion Map

| Item | Site value |
| --- | --- |
| Public Astro site | `{https://site.example.com}` |
| Discourse forum | `{https://forum.example.com}` |
| Repository | `{repository name or safe URL}` |
| Deployment target | `{Cloudflare Pages or other target}` |
| Default comments mode | `{simple | full | fullInteractive}` |
| Active discussion target | `{optional target name or none}` |

### Content lanes

| Lane | Source directory | Public route | Source mode | Category | Tags |
| --- | --- | --- | --- | --- | --- |
| `{docs}` | `{src/content/docs}` | `{/}` | `{astro-managed}` | `{ID/name}` | `{tags}` |
| `{blog}` | `{src/content/blog}` | `{/blog/}` | `{astro-managed}` | `{ID/name}` | `{tags}` |

> **Stop if:** a lane is missing its public route, source owner, destination
> category, or managing-page rule. Do not infer these values.

**Visual placeholder:** approved diagram showing `{Site Name}` lanes and their
Discourse destinations.

## 3. Source-Of-Truth Safety

Use one declared source mode for every lane or page:

- `astro-managed`: Astro owns the content and may update the companion topic.
- `discourse-managed`: Discourse owns the content; Astro must not write back.
- `discourse-imported`: Astro contains an imported copy; writeback remains off
  until a human explicitly promotes it.

Every Discourse-managed or imported page must contain:

```yaml
discussionSync: false
```

Current Alpha limitation: `import-existing` does not add that guard
automatically. Add it immediately after import.

> **Stop if:** a Discourse-owned or imported page lacks the guard, or a proposed
> promotion has not been explicitly approved and recorded.

## 4. Access And Key Safety

The operator needs:

- access to `{repository/project}`;
- access to the `{deployment provider}` project;
- access to Discourse category, tag, API-key, and embedding settings;
- the publishing key through `{private vault reference}`;
- the diagnostics key through `{private vault reference}`.

Do not copy key values into this runbook, terminal screenshots, tickets, chat,
or logs. The publishing key is the routine key. The broader diagnostics key is
for setup checks and controlled troubleshooting only.

**Screenshot placeholder:** sanitized Discourse key-scope selection with no key
value or private account details visible.

## 5. Preflight

1. Open the project at `{absolute or operator-relative project path}`.
2. Confirm the intended branch and release candidate: `{branch/version}`.
3. Confirm the public site URL, forum URL, lane, route base, category, and tags.
4. Confirm every non-Astro-managed page has `discussionSync: false`.
5. Make the required publishing and diagnostics credentials available through
   the approved private mechanism.
6. Run the site-specific diagnostics command from the Machine Runbook.

You should see the expected category, tag state, limits, and no unresolved setup
issues. Warnings marked `unknown` mean the key could not prove the setting.

> **Stop if:** diagnostics reports a setup issue, the category or tags are
> wrong, reconciliation points to an unexpected topic, or any credential value
> appears in output.

## 6. Operating Loop

For every lane, use the same sequence:

1. Diagnose.
2. Preview with `--dry-run --details`.
3. Review every computed page URL, target, topic ID, category, tag, and reason.
4. Run the live command without changing unrelated arguments.
5. Verify Discourse, Astro source, local build, deployed page, and comments.
6. Record new confirmed behavior, failure, or recovery knowledge.

### Publish new companion topics

Use for `{astro-managed lane(s)}` when pages do not yet have topic IDs.

Run the `publish-new` preview from the Machine Runbook. You should see only the
intended pages marked for creation. Run the live command only after review.

### Sync existing companion topics

Use for `{astro-managed lane(s)}` with existing topic IDs. Guarded and unlinked
pages should be skipped. Use `--force` only for an intentional rewrite.

### Publish and sync a mixed lane

Use only when one reviewed run should create missing topics and update linked
topics. This has a broader write surface than the two narrower commands.

### Import an existing Discourse topic

Preview the import first. After the live import, immediately add
`discussionSync: false`, review the imported body and frontmatter, then build.
Do not use `--overwrite` unless replacement is intentional and recoverable.

## 7. Comments Experience

Selected mode: `{simple | full | fullInteractive}`

`{Explain why this mode fits the site and what readers should experience.}`

Verify:

- comments appear on the correct page;
- the full-discussion link reaches the linked topic;
- signed-out behavior is usable;
- signed-in behavior works where required;
- desktop and mobile layout are readable;
- unavailable/forum-offline behavior leaves the article usable.

**Screenshot placeholders:** approved desktop and mobile captures of the chosen
mode.

**Video placeholder:** `{optional interaction path to demonstrate}`.

## 8. Deployment And Domain Verification

1. Confirm deployment builds from `{canonical repository and branch}`.
2. Confirm project root `{root directory}` and build command `{command}`.
3. Confirm the deployment represents the intended commit.
4. Confirm `{custom domain}` resolves with valid HTTPS.
5. Confirm Astro `site`, Discussion Bridge `siteUrl`, CLI `SITE_URL`, and the
   public hostname agree.
6. Confirm Discourse allows the exact public hostname as an embed host.
7. Verify one page from each lane and its companion topic in both directions.

If the public result looks stale, verify the commit and Discourse topic first,
then bypass or narrowly clear cache before classifying the operation as failed.

## 9. Verification Record

| Check | Expected | Result/evidence |
| --- | --- | --- |
| Diagnostics | No unresolved setup issue | `{result or safe link}` |
| Dry run | Only intended changes | `{result or safe link}` |
| Live operation | Expected created/updated/skipped counts | `{result}` |
| Discourse | Correct topic, first post, category, tags, visibility | `{result}` |
| Astro source | Correct topic metadata and guards | `{result}` |
| Build | Successful | `{result}` |
| Deployment | Correct commit and domain | `{result}` |
| Comments | Selected mode works on desktop/mobile | `{result}` |
| Secret review | No credential exposure | `{result}` |

## 10. Known Failures And Recovery

Record only site-specific additions here. Use the general Human and Machine
Manuals for standard failures.

| Symptom | Safe diagnosis | Recovery | Escalation owner |
| --- | --- | --- | --- |
| `{symptom}` | `{checks}` | `{explicit recovery}` | `{owner}` |

Never automatically recreate a deleted topic or first post. Decide whether to
restore, relink, or replace it after confirming intent and ownership.

## 11. Release Sign-Off

Release candidate: `{version/commit}`

- [ ] Code Boss review result recorded: `{pass | fail}`.
- [ ] Blocking code-review edits completed and re-reviewed where required.
- [ ] Bridge Boss technical verification completed.
- [ ] Manual Boss quality review completed.
- [ ] Human and Machine Runbooks match this exact release candidate.
- [ ] Product Boss documentation sign-off recorded.
- [ ] Product Boss release approval recorded separately.

Do not release while any item is incomplete. Product Boss documentation
sign-off confirms the docs match the release. Product Boss release approval is
the separate product-level decision that the release is coherent and ready.

## 12. Support And Escalation

| Need | Route |
| --- | --- |
| Reproducible product defect | `{GitHub Issues URL}` |
| Setup question or field report | `{Discourse support URL}` |
| Private implementation help | `{approved private route}` |
| Code review | Code Boss |
| Implementation correction | Bridge Boss |
| Manual quality | Manual Boss |
| Product/manual construction or release approval | Product Boss |

Support reports may contain versions, public URLs, sanitized commands/output,
lane names, category IDs, tags, and key type. They must not contain keys,
credentials, private account data, or production secrets.

## Template Completion Check

- [ ] No brace-delimited placeholder remains unintentionally.
- [ ] Every command and exact value agrees with the Machine Runbook.
- [ ] Every stop condition is site-appropriate.
- [ ] Every screenshot/video placeholder is approved, replaced, or explicitly
      deferred.
- [ ] Public/private boundaries and secret safety have been reviewed.
- [ ] The rendered runbook is readable on desktop and mobile.
