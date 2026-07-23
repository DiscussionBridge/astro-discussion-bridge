# Attribution And Licensing Review — Candidate b09dbce

This is the sanitized durable review record for the exact Discussion Bridge
Alpha attribution/licensing candidate ending at commit `b09dbce`, atop product
documentation commit `7127eb1` and automated-gate implementation commit
`462b3ae`.

## Results

| Layer | Result |
| --- | --- |
| Full automated package gate | PASS; included in package suite 73/73 |
| Bounded readable-docs gate | PASS (docs scope); 20 synchronized sources / 21 HTML pages |
| npm package contents in docs scope | SKIPPED (requires built release candidate) |
| Manual Boss semantic review | **Attribution and Licensing: PASS** |
| Remaining findings/blockers | None |

These are three separate results. The full package gate, bounded docs gate, and
Manual Boss semantic review do not substitute for one another.

## Reviewed Paths And Surfaces

- `LICENSE`
- `packages/astro-discussion-bridge/LICENSE`
- `packages/astro-discussion-bridge/package.json`
- `packages/astro-discussion-bridge/README.md`
- `docs/ATTRIBUTION_OWNERSHIP_LICENSE.md`
- `docs/THIRD_PARTY_PROVENANCE.json`
- `docs/third-party-licenses/khroma-2.1.0-MIT.txt`
- `scripts/check-attribution.mjs`
- `scripts/sync-docs-site-content.mjs`
- `sites/docs/package.json`
- `packages/astro-discussion-bridge/test/attribution.test.mjs`
- generated readable attribution page and its public links

## Corrected Semantic Findings

The initial semantic review failed. Candidate correction commit `b09dbce`
resolved every blocker:

- removed public Ghost references;
- recorded WordPress, Coding Horror, and Astro Starlog as separate provenance
  entries with precise public sources and `copiedMaterial: false`;
- recorded the WebSynergetics governance-note adaptation as sanitized
  first-party material with its rights basis and no protected filesystem path.

Manual Boss re-reviewed the corrected exact candidate and returned PASS with no
remaining findings or blockers.

## Public/Private Boundary

This record contains repository-relative paths, public source URLs already
recorded in the provenance inventory, and commit identifiers. It contains no
credentials, private account values, protected storage locations, or private
first-party source path.
