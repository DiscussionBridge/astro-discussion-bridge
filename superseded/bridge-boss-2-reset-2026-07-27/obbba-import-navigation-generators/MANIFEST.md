# BB2 OBBBA import/navigation generator quarantine

Disposition: quarantined, inert provenance. These OBBBA-specific generators,
validators, tests, and generated import evidence are not active
DiscussionBridge implementation or operating inputs. Destinations preserve
their original repository-relative paths.

| Original path | Bytes | SHA-256 |
| --- | ---: | --- |
| `scripts/build-obbba-impact-import-manifest.mjs` | 5456 | `9e17fd828b47012c2a0409c76235e58bce228c09d666a0a2f8f496da950eca06` |
| `scripts/build-obbba-text-import-manifest.mjs` | 5716 | `ec4f00c816a2e0939f92c35881db889d72ca31c3b500d5d4170c96d2b2c79ca1` |
| `scripts/obbba-impact-import-manifest-lib.mjs` | 3591 | `86de3430fec0bff2d42ec8d20c3d291e1dc026d168ddc28f3a2c542bc26bdefb` |
| `scripts/obbba-text-import-manifest-lib.mjs` | 4934 | `238bec76dadad92d6e35f0b572f4d7ec6f16e6204eb293112f153bbd7ffeaac9` |
| `scripts/generate-obbba-impact-config.mjs` | 2646 | `dc36e82c12e24646e5d55c1816cd14276be3bc1163071c44fe3b104559ca7137` |
| `scripts/refresh-navigation-content-routes.mjs` | 1457 | `bdc84b3f6396ec45644a42f23d14d490a4eb0d9edf21ced8cacbb6dd8bc5b424` |
| `scripts/verify-obbba-navigation-acceptance.mjs` | 5333 | `e3e743180d9272eef096fd7322a9b6f08aa2f65f9bf43b0dcd7ad6e5b8794d21` |
| `scripts/test/obbba-impact-import-manifest-integration.test.mjs` | 1893 | `cb16e4765748fa60c0af881d5bc04ce87d47b5e1b2427a056e0506bd83fdaff8` |
| `packages/astro-discussion-bridge/test/obbba-text-evidence-validator.test.mjs` | 3889 | `7fde559ed075d42fe78c1be00d6c55d8a805af6da2ef51b67908da772ab7a1b7` |
| `docs/evidence/discussionbridge-imports-obbba-text-approved-v4-20260726.json` | 154409 | `7c65e8c2e4490d9cc4e0cd7028d9da661aa862daafde5435366303244611dfe1` |

The shared import core and its body-edit test are intentionally outside this
group. Their BB2 hunks require a separate selective tracked-file reversal.
