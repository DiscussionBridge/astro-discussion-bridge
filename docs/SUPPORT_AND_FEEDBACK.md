# Support And Feedback

DiscussionBridge needs a clear support path before Alpha. Users should know where to report bugs, where to ask setup questions, and when to request hands-on help.

## Alpha Support Model

Recommended split:

- GitHub issues: reproducible bugs, regressions, missing docs, and feature requests
- GitHub Discussions or a Discourse category: setup questions, examples, configuration discussion, and community help
- paid implementation help: private setup, migration, customization, and hand-holding

Use one public canonical support page or README section that points to the active channels.

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

