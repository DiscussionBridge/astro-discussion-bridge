# Adapter Alpha Hardening — 2026-08-22

Status: accepted local and stable-preproduction evidence for the Alpha adapter
hardening checklist. This record contains no credential values.

## Exact package compatibility matrix

The exact release-package candidate is adapter commit
`dc460b04fa507b94349edcc3ec8d0973259ad3ec`. It was packed directly from that
clean commit as `astro-discussion-bridge-0.1.0.tgz`.

- byte size: `96,458`
- SHA-256: `58d76d17b8680e3f6be691e6cd22e62bdba92b9c2bf5d037034ac0702da050ba`
- npm SHA-1: `a1e57d2fbf3863929e12a5fa0525ebc6ff188003`
- npm integrity: `sha512-zgzZYl/hsjJba8apSsvafMEVNTMVi7NgxfqNZgO3KMwAQseVNlVAw2YRsW7klSQW6J0ov2MmTI2WofFBlBgSRw==`
- inventory: 53 files, `418,461` unpacked bytes

The complete npm-pack inventory was inspected. It contains `LICENSE`, the
candidate `README.md` and `TODO.md`, the package manifest, compiled `dist`
surface, the published Astro components, and `src/virtual.d.ts`. No credential,
fixture, local-path, acceptance-evidence, scratch, or unintended file was
included.

Two newly created isolated consumers installed that same immutable tarball by
its local file identity and completed 2-page static Starlight builds:

| Astro | Starlight | Result |
| --- | --- | --- |
| `6.4.8` | `0.40.0` | exact-tarball install and 2-page static build passed |
| `7.2.4` | `0.41.7` | exact-tarball install and 2-page static build passed |

The Starlight versions are deliberately different because `0.40.0` supports
Astro 6 while `0.41.7` requires Astro 7. The adapter's optional peer range
continues to cover both.

The prior matrix packed parent commit
`48cb78c6a083699a516972c3b69c9b31ab5817cf`. That evidence did not qualify the
later candidate because `README.md` and `TODO.md` are published package files.
This exact-candidate replay supersedes that artifact-identity claim. The commit
that records this evidence is record-only and is not a replacement package
candidate.

## Regression and source-safety evidence

The regression suite covers:

- title validation and Astro/Discourse title drift;
- category, tag, listing, and per-page policy changes;
- active-target mismatch and protected source-target behavior;
- duplicate/collision checks and exact-URL reconciliation;
- network and notification failures;
- missing topic and missing first-post stop behavior;
- isolated retry of a failed multi-target binding;
- `discussionSync: false` and imported/managed no-writeback;
- explicit reviewed promotion to `astro-managed` before writeback.

The Alpha recovery contract remains operator controlled. Missing/deleted state
stops with a diagnostic; repair uses Discourse restore or an explicitly reviewed
relink/recreate change. The adapter does not infer ownership from a similar title
or search result.

## Live key-scope replay

`check-discourse` was replayed read-only against
`dev-forum.discussionbridge.dev` as `discussbridge-bot` with two newly generated
acceptance-only keys. Both keys were revoked immediately after the checks; the
post-check active count was zero.

The global diagnostics key confirmed:

- client settings and user capabilities available;
- title range 15–255, first-post/post minimum 20, post maximum 32,000;
- six tags per topic, tag length 30, tagging enabled;
- category 5 `Discussion Bridge for Astro`, not read restricted;
- `alpha` and `discussionbridge` tags present;
- no setup or tag issues;
- the known core embed URL
  `https://astrostarlight.demo.discussionbridge.dev/comments/simple`
  resolved through `/embed/info` to topic 39 and exact search agreed.

The granular publishing key confirmed the current documented boundary:

- category and tag inventory were readable;
- explicit configured limits were honored;
- site-wide settings, user capabilities, `/embed/info`, and exact search were
  denied with 403 and reported as warnings/unknown rather than guessed;
- no setup or tag issue was invented from unavailable evidence.

Therefore Alpha retains the two-key model: a granular publishing key for normal
writes and a broader diagnostics key for setup and collision/reconciliation
checks until Discourse exposes a confirmed narrower diagnostics scope set.

## Alpha scope decisions

- `discussionSummary` is the supported Alpha escape hatch for component-heavy
  MDX. Automatic JSX/component summarization moves to Beta.
- Explicit page titles plus live limits and preflight are sufficient for Alpha.
  Configurable title templates/prefixes move to Beta.
