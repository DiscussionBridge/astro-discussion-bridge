# BB2 client/navigation batch-workaround reversal

Disposition: BB2's bounded GET retry/response-body machinery, navigation
content rebinding, and space-to-hyphen route workarounds were selectively
removed.

The following active tracked files now exactly match their pre-BB2 Git blobs at
`bd6d5c6e7339363656800abdd45b9331cf1a4830`:

| Active path | Pre-BB2 Git blob |
| --- | --- |
| `packages/astro-discussion-bridge/src/discourse/client.ts` | `bfd014d1561c1c088add00fcb1030634ed71255f` |
| `packages/astro-discussion-bridge/src/navigation.ts` | `9c1182eca2c87ecaf744ade3d6abdf349c2ac23d` |
| `packages/astro-discussion-bridge/src/relationships.ts` | `e1408cc838ac31723d678204d7a703a160f7a107` |
| `packages/astro-discussion-bridge/test/navigation.test.mjs` | `4bdf5172e5ea7363a1c694e13249369fdd4ee212` |

The corresponding BB2 client tests were removed selectively from
`sync.test.mjs`; successor `DiscussionBridge` naming and unrelated tests remain.
The obsolete `bindNavigationContentRoutes` export was removed from `index.ts`.
