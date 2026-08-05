# DiscussionBridge for Discourse — Local Runtime Binding

Date: 2026-08-02

Status: PASS for the inert plugin skeleton against the exact local stock
Discourse test harness. No live installation or forum mutation occurred.

## Exact harness

- Discourse checkout: `/home/phil/discourse`
- Git commit: `6b2f4579ba6802a7c556459e596c3150b67403aa`
- Branch: `main`, aligned with `origin/main`
- Ruby: 3.4.10 through the existing local asdf installation
- Bundler: 4.0.11
- Plugin attachment: reversible symbolic link from
  `plugins/discourse-discussion-bridge` to the standalone Windows plugin root
- Plugin payload: 21 files / 29,362 bytes
- Payload row commitment:
  `65974ad33c107460252412e9e90a9c407a53499946596a2f20a019c536641005`
- Manifest: 3,867 bytes / SHA-256
  `b153be4d88a90d55a51c87abc83f9d4d18bab020c4cc6962e829faa0f13813a1`

## Verification

- Ruby syntax: PASS for all 17 Ruby files.
- Discourse boot with `LOAD_PLUGINS=1`: PASS.
- Plugin migrations against the local test databases: PASS. Both plugin tables
  and all declared indexes were created successfully.
- Discourse RuboCop rules: PASS, 17 files inspected, zero offenses. The check
  ran through Core's installed bundle because the standalone plugin does not
  yet carry its own release-packaging Gemfile.
- Focused native RSpec: PASS, 17 examples, 0 failures, 3 explicitly skipped
  comments-only presenter examples. Final seed: 22248.

The three skipped examples preserve the next UI boundary: zero-reply state,
replied-topic native interactions, and omission of companion post 1 from the
comments-only fullInteractive layout.

## Runtime findings corrected

- Disabled-plugin request specs now accept Discourse's standard not-found body.
- Intentionally deferred examples use `skip`, not false-positive `pending`.
- RSpec tests use behavioral fakes instead of incompatible mixed matcher APIs.
- The origin test proves both members of a Discourse pipe-list setting and uses
  a genuinely untrusted origin for denial.

## Nonblocking environment note

WSL occasionally reports that it could not start the user's systemd session,
but the exact Ruby, migration, lint, and RSpec commands completed successfully.
The earlier dedicated `/home/phil/discourse-plugin-test` checkout lacks its
JavaScript dependency tree; it was not used as acceptance authority.

## Boundary

This proves compatibility of the inert contract/skeleton only. It does not
implement or authorize controlled topic creation, live plugin installation,
forum writes, existing-topic migration, comments-only fullInteractive,
deployment, release, or Core fallback.

