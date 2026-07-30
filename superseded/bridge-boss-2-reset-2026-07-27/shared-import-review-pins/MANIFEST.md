# BB2 shared-import review-pin reversal

Disposition: the BB2 review-pin, legal-text hash-profile, body-edit, and
space-to-hyphen route workaround hunks were selectively removed from
`import-existing.ts` and `import-manifest.ts`. Both tracked files now match the
exact pre-BB2 source identity at
`bd6d5c6e7339363656800abdd45b9331cf1a4830`.

The OBBBA-specific test was quarantined as inert provenance:

| Original path | Bytes | SHA-256 |
| --- | ---: | --- |
| `packages/astro-discussion-bridge/test/obbba-text-body-edits.test.mjs` | 8887 | `e15cf659123a7d59cf06f9fea1cca9295e7012310e4d4cca021c5187620f11a5` |

Generic imports, manifest validation, official-source comparison, pruning, and
source disclosure remain active.
