# Support And Feedback

DiscussionBridge needs a clear support path before Alpha. Users should know where to report bugs, where to ask setup questions, and when to request hands-on help.

## Alpha Support Model

Alpha support channel decision:

```text
For Alpha help, check GitHub Issues for known bugs or open work, then start in the Alpha Support category on forum.discussionbridge.dev or email alphasupport@discussionbridge.dev.
```

Channel roles:

- GitHub Issues: confirmed bugs, reproducible failures, docs gaps, feature requests, release tasks, labels, assignment, and release references.
- GitHub Discussions: repo-bound product, design, or implementation discussion when GitHub context matters.
- Discourse Alpha Support category: setup questions, examples, field reports, screenshots, configuration discussion, support discovery, and community help.
- `alphasupport@discussionbridge.dev`: email intake routed into Discourse, not a standalone inbox.
- Paid implementation help: private setup, migration, customization, and hand-holding.

Handoff rule:

- Discourse is the support and community memory.
- GitHub Issues are the formal product work ledger.
- When a Discourse support topic becomes confirmed product work, create or link a GitHub Issue.
- Cross-link the Discourse topic and GitHub Issue so the original support context and formal work record stay connected.
- Release notes should reference GitHub Issues and PRs as the formal record.

Use one public canonical support page or README section that points to the active channels.

Before Alpha, create the live Alpha Support category, route `alphasupport@discussionbridge.dev` into Discourse, and wire these channel links into README, docs, package metadata, demo pages, and release notes.

## What Users Should Include

For bugs or setup issues, ask users to include:

- package version
- Astro version
- Starlight version, if used
- Discourse version, if known
- command run
- sanitized CLI/build output
- docs directory or lane name
- `discourseUrl`, `siteUrl`, category ID, and tags
- whether the key is global, granular, moderator, or admin capable
- whether the issue happens in `--dry-run`

Users must not include API keys or private credentials.

## Triage Labels

Suggested labels:

- `bug`
- `docs`
- `setup`
- `discourse`
- `astro`
- `starlight`
- `comments`
- `publish`
- `sync`
- `diagnostics`
- `recovery`
- `enhancement`

## Alpha Response Policy

For Alpha:

- docs bugs should be treated as product bugs
- reproducible publish/sync failures should be captured as tests when practical
- Discourse configuration discoveries should be copied into field notes
- repeated support questions should become docs, examples, or `check-discourse` checks
- paid help should not replace public docs for common setup paths

## Current Product Track

Once a release is maintained, keep support-channel certainty synchronized across:

- README
- docs index
- release notes
- package metadata
- demo pages
- Discourse support/category links

Every release should answer: where does a user ask for help, report a bug, request a feature, and get implementation assistance?
