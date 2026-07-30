# OBBBA Law Gate 1 Baseline And Reachability Inventory

Created: 2026-07-26
Status: Gate 1 controlling recovery evidence

This is sanitized inventory and governance evidence only. It is not legal
publication authority, does not authorize Gate 2 or later work, and contains no
legal body text or credentials.

## Repository Baselines

### Discussion Bridge

- Branch: `main`
- HEAD: `46e08781b9bf71def5f34205fbe086e61ca41faa`
- Upstream state at inventory: one commit ahead of `origin/main`
- Worktree: extensive modified and untracked documentation, package, test,
  import, official-source, and Law-as-Amended work

This is not yet a clean or release-ready baseline.

### One Big Beautiful Bill Astro Site

- Nested repository branch: `main`
- HEAD: `5a455f12e49f4504607528e4f2a5cd85797a6598`
- Modified configuration/component/schema files and largely untracked populated
  content
- Local content inventory: 307 OBBBA Text pages and 135 Impact pages
- Law-as-Amended content root: absent
- Installed navigation SHA-256:
  `dc03edd102b2b0e4446315240721f8856228ac3b30df56d9e863a1ed288ba598`
- Premature Law-as-Amended navigation candidates: present and untracked
- Package dependency:
  `vendor/astro-discussion-bridge-0.1.0-alpha-routefix-b8117b4c.tgz`
  is referenced by `package.json` and is untracked
- `dist` is ignored and contained 1,986 files totaling 186,012,930 bytes at
  inventory time; the custom 404 artifact was present

This is materially built and populated but not a reproducible committed
baseline.

## Superseded And Directly Reachable Law Chain

| Path | SHA-256 | Classification |
|---|---|---|
| `scripts/build-obbba-law-enacted-derivative-manifest.mjs` | `e5e4531e186a66ef3d5574ffd8046c6dbbc9b799158435e9688fb8e77891f17c` | Superseded; directly executable |
| `scripts/test/obbba-law-enacted-derivative-manifest.test.mjs` | `50336226c9d18fab3edc6c6458df709fb69242c8c7e1a1c78f402cf97058078e` | Superseded test |
| `docs/evidence/OBBBA_LAW_ENACTED_DERIVATIVE_MANIFEST_2026-07-26.json` | `1c183bf7d93d37af2f095b2817f857092cb9449a34d303a9b91d5b5f48a9b0b4` | Superseded provenance only |
| `scripts/write-obbba-law-as-amended-pages.mjs` | `73571d80e0e4dbaa7961a4cfb08d36760355119871568cfe4ca3857b2a779019` | Superseded; directly executable |
| `scripts/test/obbba-law-as-amended-writer-transaction.test.mjs` | `8f3f5630045725cc558f520dc211d2f43983a4b2218f8fad96241010523ea50b` | Superseded test; imports writer |

The current writer:

- imports the superseded derivative-manifest validator;
- pins the superseded derivative artifact;
- reads the OBBBA Text content root;
- hard-codes 82 enacted-only entries and a 300-page outcome;
- calls the derivative-body renderer; and
- contains a direct `main()` entrypoint.

Neither repository root nor the package registers these Law one-offs as package
commands or exports. The package default test only runs
`packages/astro-discussion-bridge/test/*.test.mjs`. Direct entrypoints and
script-level imports nevertheless make the superseded chain reachable.

## Partial And Provisional Work

| Path | SHA-256 | Classification |
|---|---|---|
| `scripts/obbba-law-as-amended-page-renderer.mjs` | `1c070bb71636fe1f00b4104b28fcfb7edde44f3d28cddb2a413d39cd88026bb0` | Partial: official branch candidate; enacted derivative branch invalid |
| `scripts/test/obbba-law-as-amended-page-renderer.test.mjs` | `8b7703953181bf43e39f771d6e6187dd893b634a2ad87c69f4b422e0e3205225` | Partial |
| `scripts/obbba-law-as-amended-page-plan-lib.mjs` | `5fe99c7a5403b1375ee5e5080b073133cfd58f02e7a711eaf2843e73dad08e30` | Provisional planning only |
| `scripts/build-obbba-law-as-amended-page-plan.mjs` | `18079f5920f0aa81eed99d4fb27175e108171ad459ff893cf27fabf01fe47c2e` | Provisional planning only |
| `docs/evidence/OBBBA_LAW_AS_AMENDED_PAGE_INPUT_PLAN_2026-07-26.json` | `b2b5abde4e24d878501c007faf0e460d3a7badcabb0272c4728b29580a1e243b` | Forum/USC classification planning only; not authority or final cardinality |

Transaction-hardening concepts may be reusable after later review. The current
writer executable is not reusable as an active publication path.

## Rendering-Commitment Contamination

| Path | SHA-256 | Classification |
|---|---|---|
| `scripts/build-obbba-law-uslm-rendering-commitments.mjs` | `e91aaa2356636e9e8990acadb555900d7d8c5c8a43fbfaac11d8d4313ff32e63` | Partial/unsafe; regeneration prohibited |
| `scripts/test/obbba-law-uslm-rendering-commitments.test.mjs` | `4ddd927ac1ca15f398c4b80666651c739ec71b1a3f4f61121c062bcf96c58bda` | Partial/unsafe with generator |
| `docs/evidence/OBBBA_LAW_USLM_RENDERING_COMMITMENTS_2026-07-26.json` | `4798677ffa04d2237a60359465108f5e12d46b6dc4d9101e23a3ade1a8e66422` | Existing candidate derived evidence only |

The generator explicitly excludes `entry.sectionId === "20009"`. It must not be
run before corrected design and review. The existing artifact reports 313 USC
targets and 590 role entries: 277 `before` and 313 `current`, with no Section
20009 identity. It remains only a candidate commitment set pending later exact
role-set proof; it does not establish enacted content or cardinality.

## Enrolled Diagnostic And QA Chain

| Path | SHA-256 |
|---|---|
| `scripts/analyze-enrolled-source.mjs` | `08797cb8682493f9d604bc9944dfa1ad3e4083c3bc0daed6a17f2111db44b2e5` |
| `scripts/enrolled-source-lib.mjs` | `1cd429a93b10940e0b809478503e308cf647add57463bc0cd682b77705241695` |
| `scripts/build-obbba-enrolled-section-authority.mjs` | `47eee2c053486a2f5a926b6ff373a532ec8aaa0820579e6dfb5edbf621be266a` |
| `packages/astro-discussion-bridge/test/enrolled-source-analyzer.test.mjs` | `3ab98f8baeb9a62885f1e08fe88cdf37f26ef1c0331873378a90ef8b74407be4` |
| `docs/evidence/OBBBA_ENROLLED_SECTION_AUTHORITY_2026-07-26.json` | `f10f9b688ed8c7ff0168b72587cfdea2ddc30a55ee0390e659f901b4616309b2` |

The artifact has 307 entries and omits 20009, 71119, and nonexistent Section
70310. The Section 20009 omission is an artifact coverage failure. The Section
71119 omission cannot establish Law status or a coverage failure before its
authoritative official-source binding is established. The Section 70310
omission is not a coverage failure and must not trigger a search or
missing-section workflow. The chain is diagnostic and QA only.

Bounded use remains permitted for the separate OBBBA Text QA/import lane through
`scripts/build-obbba-text-import-manifest.mjs`. Law authority, body, cardinality,
rendering, and writer use are prohibited. The superseded enacted-derivative
builder is a prohibited Law consumer.

## Retained Candidate Evidence

These hashes establish artifact identity, not self-authorizing legal truth:

| Artifact | SHA-256 |
|---|---|
| Forum metadata | `434761fa42bbd67e2b9b6b8e1523d87fb85b238a5e376c0d6c5ab004e0a16f67` |
| Official authority map | `977639eacd190746b9bf347fb933bf7434cbf80891d1b7255007c9daf2edcf26` |
| USC release plan V3 | `5a76438265c076c3be6188fed52ebf21078ea928177a8659e03be1fc209bb6c7` |
| Incorporation-window plan | `562759559ff62101394fe512c38e68593fbbc8ce2d10f3719f101d351d875c10` |
| Incorporation archive evidence | `5dc17fedeaaccfa834ce41732047685b80006d4158151a103b3ad1ec68d63f79` |
| Incorporation XML evidence | `84136240ddc76309e82dd7d39ca8c4cd4fce08a0bdd737ce0075aa55f0829577` |
| Versioned section store | `90e1f677227f510fd2b25f370d200ba49d5cc6476706d3be50bad66092177cdd` |
| State comparison index | `c2de89f8b5ff24485c19a4dc1c5658ce0a86ada9fba5030ec8de9adfccda76e5` |
| Attribution index V2 | `ea33c90c3c860385d016a58e10cdc92f5eb97e4620a3e406fa8696074fbc3ec7` |
| Rendering commitments | `4798677ffa04d2237a60359465108f5e12d46b6dc4d9101e23a3ade1a8e66422` |

Each remains subject to its later exact-gate validation and source-role limits.

## Active Documentation Claim Inventory

### Canonical, Metadata-Current, Sync-Listed Sources

| Path | SHA-256 | Claim locations |
|---|---|---|
| `docs/PRODUCT_NOTES.md` | `8563f5a0a379ebe714906ad9097af4200f81b41c29b3e6477425acd5c349a447` | 209-224 |
| `docs/runbooks/OBBBA_ONEBIGBEAUTIFULBILL_HUMAN.md` | `e10ab5e7ddd342c62c6d00c52087bb0b8d003f55b06e831bbb3850b79d36756f` | 37-57 |
| `docs/BUILD_LAUNCH_CHECKLISTS.md` | `1abab637bfedf8dcd59f9276e1e1858abf0765fa5179f4f45871380d496b9fee` | 344-352 |

All three metadata records were refreshed and current as of 2026-07-27.

### Active Generated Publication Inputs

| Path | SHA-256 | Claim locations |
|---|---|---|
| `sites/docs/src/content/docs/product-notes.md` | `dd915017f3b264811aff1bf06ea8da82be32e80d744557584c3ffad147f6d6bb` | 214-229 |
| `sites/docs/src/content/docs/runbooks-obbba-onebigbeautifulbill-human.md` | `6a1330c2714a10eb22868e4f8557f8671e4815a7e3f979347b773d9ac2f40bdd` | 42-62 |
| `sites/docs/src/content/docs/build-launch-checklists.md` | `1619673dff7d1ac2b32f0178dc4944c89cbfa7409a9f5d5dfcba4b49344c9a34` | 349-357 |

`scripts/sync-docs-site-content.mjs` lists the three canonical sources and
regenerates `sites/docs/src/content/docs`. Generated status does not make these
copies absent or remove publication risk.

Section 70310 does not exist and must not be pursued as a missing enacted
section. The six canonical and generated documents were inspected and corrected
on 2026-07-27. They now state that 70310 does not exist, limit 309 to forum
metadata and discussion-binding inventory, and make Section 71119
official-source-first. Section 20009 remains settled-present and mandatory.
Forum/Discourse metadata is optional context only and must not lead or establish
Section 71119's enacted binding.

### Post-Sync Evidence

- Metadata ledger SHA-256:
  `1f97b072ccc441a521458b4b4293c373deee27718f501a456fadaf53d1121817`
- Sanitized 28-file post-sync manifest:
  `docs/evidence/DOCS_GENERATED_POST_SYNC_MANIFEST_2026-07-27.json`
- Manifest SHA-256:
  `7f211f6709fd254568343bae9732dc99271650431fc0346242f1a00f1a5e8f0b`
- Aggregate generated-output digest:
  `7265749b4667f3dbeef8291774c655b047a935837b66aae0473369fb76b017cf`

The established workflow rewrites all 28 generated pages into a Git-ignored
directory. A complete pre-sync manifest was not captured, so this evidence does
not claim that none of the other 25 pages changed during the first sync. A
second sync was byte-idempotent. The sync script now supports a non-writing
`--check` mode and exact repeated `--expect-change=<generated-file>` allowlist
arguments for future pre-sync change-set enforcement.

## Active Gate 1 Blockers

- directly executable superseded enacted-derivative builder and Law writer;
- script tests that import the contaminated writer chain;
- unsafe rendering-commitment generator and test;
- untracked vendor package dependency in the OBBBA site;
- premature Law-as-Amended navigation candidates;
- unexplained dirty, deployed, and committed baseline mismatch across both
  repositories;
- active canonical and generated documentation claims awaiting source-status
  review; and
- absence of a reproducible Law-as-Amended destination and review-evidence
  baseline.

Gate 1 is not complete while these blockers remain.
