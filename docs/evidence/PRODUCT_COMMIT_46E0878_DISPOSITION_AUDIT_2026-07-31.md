# Product Commit `46e0878` Disposition Audit

Date: 2026-07-31  
Status: read-only disposition complete; implementation actions require separate approval

## Purpose and authority boundary

This audit classifies commit
`46e08781b9bf71def5f34205fbe086e61ca41faa` (`Define Discussion Bridge core
and product family`) without treating its 16-path appendix as a revert or
deletion list.

The forensic record classifies the commit as cross-lane Product Boss work made
during the Bridge Boss 2 window, not as a direct Bridge Boss 2 commit. Its ideas
and artifacts must therefore be evaluated on their current merits. Neither its
authorship nor its date grants current implementation, Product, source,
publication, or deployment authority.

No file was restored, reverted, moved, deleted, regenerated, staged, committed,
published, deployed, or used as an implementation input during this audit.

## Exact commit identity

- Commit: `46e08781b9bf71def5f34205fbe086e61ca41faa`
- Parent and last exact Git source before the commit:
  `bd6d5c6e7339363656800abdd45b9331cf1a4830`
- Author and committer: `ph1958 <33202278+ph1958@users.noreply.github.com>`
- Timestamp: 2026-07-25 14:24:21 PDT
- Subject: `Define Discussion Bridge core and product family`
- Scope: 16 paths, 12,484 insertions, 42 deletions
- Shape: seven modified pre-existing documentation/metadata files and nine
  newly added architecture, doctrine, evidence, and runbook files

## Executive disposition

Do not revert the commit as a unit.

The commit combined three materially different classes:

1. Sound Product-family and Discourse-centered architectural ideas that were
   subsequently corrected, rebranded, and independently restated.
2. A roadmap that still contains obsolete OBBBA comparison and Impact
   population sequencing and therefore cannot remain an active implementation
   plan in its current form.
3. Five OBBBA comparison/Impact artifacts that are already absent from their
   active paths and quarantined as superseded provenance.

The correct cleanup boundary is path-specific:

- retain the current successor-edited manuals, Product documentation,
  metadata, architecture, and doctrine records;
- replace or supersede the active implementation roadmap rather than reverting
  it to either the original commit or the generic pre-commit state;
- retain the five already-quarantined artifacts only under the Step 4 retention
  policy until separately authorized deletion/archive decisions are made;
- never restore the five quarantined files to their former active paths.

## Path-by-path classification

| Commit path | Current state | Disposition | Reason |
|---|---|---|---|
| `docs/BUILD_LAUNCH_CHECKLISTS.md` | Active; successor-edited | Retain current | It now carries reviewed clean-room, deployment, comments-credit, hostname, documentation, and operational gates. Whole-file or commit-hunk reversal would erase later corrections. |
| `docs/CONTENT_LANES.md` | Active; successor-edited | Retain current | Current lane/authority boundaries were corrected after the commit. Do not reconstruct the July 25 wording. |
| `docs/CORE_ADAPTER_ARCHITECTURE.md` | Active; successor-edited | Retain current, subject to ordinary architecture review | The portable Core, Discourse host, adapter, user-created API-key, authority, portability, and Product-family concepts have independent continuing value and were later corrected. It is not OBBBA implementation authority. |
| `docs/CORE_ADAPTER_IMPLEMENTATION_ROADMAP.md` | Active and registered in public docs | Replace/supersede in a separate bounded documentation step | Phase 0 says to preserve current OBBBA comparison/Impact work as acceptance fixtures; Phase 2 refers to OBBBA comparison/preflight behavior; the Immediate Work Sequence begins with the former Impact population gate. Those premises are superseded by quarantine and the clean reset. Sound phase concepts may be independently restated, but this file must not drive work as written. |
| `docs/DOCS_PAGE_METADATA.json` | Active; successor-edited | Retain current; update only as a consequence of an approved roadmap disposition | Current metadata synchronizes the current documentation set. It is not independently revertible. |
| `docs/HUMAN_MANUAL.md` | Active; extensively successor-edited | Retain current | Manual, brand, Law clean-room, comments-credit, credential-role, and operator corrections postdate the commit. |
| `docs/MACHINE_MANUAL.md` | Active; extensively successor-edited | Retain current | Current machine contract contains later reviewed behavior and safe configuration details. Reversion would reintroduce stale automation guidance. |
| `docs/PRODUCT_NOTES.md` | Active; extensively successor-edited | Retain current | Current Product policy incorporates later clean-room, naming, comments-credit, forum-authority, and deployment decisions. |
| `docs/README.md` | Active; successor-edited | Retain current; update its roadmap link only if the roadmap is later superseded | It is the current documentation index, not an autonomous Product decision. |
| `docs/evidence/DISCUSSION_BRIDGE_DISCOURSE_CENTERED_DOCTRINE_2026-07-25.md` | Active historical/source doctrine, later brand-corrected | Retain as bounded source/provenance | It preserves the original quoted decision and a later canonical interpretation. Exact historical quotations may retain spaced spelling. Current controlling decisions and manuals take precedence if conflict appears. |
| `docs/evidence/DISCUSSION_BRIDGE_PRODUCT_FAMILY_DOCTRINE_2026-07-25.md` | Active historical/source doctrine, later revised | Retain as bounded source/provenance | Core, for Astro, for Discourse, SaaS, Services, and Community remain useful independently restated Product-family concepts. The file is not implementation or release authority. |
| `docs/evidence/OBBBA_ENROLLED_SOURCE_COMPARISON_2026-07-24.json` | Active path absent; exact commit bytes quarantined | Retain quarantined pending Step 4 retention decision; never restore | Local/derived comparison evidence is denied as Law as Amended authority and implementation input. |
| `docs/evidence/OBBBA_ENROLLED_SOURCE_COMPARISON_2026-07-24.md` | Active path absent; exact commit bytes quarantined | Retain quarantined pending Step 4 retention decision; never restore | Same boundary as its JSON payload. |
| `docs/evidence/OBBBA_OFFICIAL_SOURCE_COMPARISON_FINAL_2026-07-24.json` | Active path absent; exact commit bytes quarantined | Retain quarantined pending Step 4 retention decision; never restore | The filename does not grant controlling official-source authority. |
| `docs/evidence/OBBBA_OFFICIAL_SOURCE_COMPARISON_FINAL_2026-07-24.md` | Active path absent; exact commit bytes quarantined | Retain quarantined pending Step 4 retention decision; never restore | Same boundary as its JSON payload. |
| `docs/runbooks/IMPACT_POPULATION_SECURE_TRANSPORT.md` | Active path absent; successor-annotated copy quarantined | Retain quarantined pending Step 4 retention decision; never restore | The former Impact population workflow is abandoned. Generic credential doctrine survives elsewhere and must not depend on this runbook. |

## Quarantined commit artifacts

The four comparison artifacts reproduce the exact blobs committed by `46e0878`:

| Former active path | Quarantine location | Bytes | SHA-256 | Exact commit bytes |
|---|---|---:|---|---|
| `docs/evidence/OBBBA_ENROLLED_SOURCE_COMPARISON_2026-07-24.json` | `superseded/bridge-boss-2-reset-2026-07-27/official-source-comparison/docs/evidence/OBBBA_ENROLLED_SOURCE_COMPARISON_2026-07-24.json` | 208,563 | `128ab8e7884cfe18acab62082f714ae32943b9600a9ddeeee35215dbf6211ae9` | Yes |
| `docs/evidence/OBBBA_ENROLLED_SOURCE_COMPARISON_2026-07-24.md` | `superseded/bridge-boss-2-reset-2026-07-27/official-source-comparison/docs/evidence/OBBBA_ENROLLED_SOURCE_COMPARISON_2026-07-24.md` | 3,320 | `84d73debd39f7300d6904ced3aa7f61f5d1647cf24b771c50b0d5dbbffe8f202` | Yes |
| `docs/evidence/OBBBA_OFFICIAL_SOURCE_COMPARISON_FINAL_2026-07-24.json` | `superseded/bridge-boss-2-reset-2026-07-27/official-source-comparison/docs/evidence/OBBBA_OFFICIAL_SOURCE_COMPARISON_FINAL_2026-07-24.json` | 240,402 | `ca9159d86daa204e468cd182b8e30b5b0040fa243d7d889db640c6a279c3748c` | Yes |
| `docs/evidence/OBBBA_OFFICIAL_SOURCE_COMPARISON_FINAL_2026-07-24.md` | `superseded/bridge-boss-2-reset-2026-07-27/official-source-comparison/docs/evidence/OBBBA_OFFICIAL_SOURCE_COMPARISON_FINAL_2026-07-24.md` | 2,728 | `185a33a62bd2fd10e3b531ada5fef47fa012ad0dcd28589b9cb340895c79deb6` | Yes |

The runbook at
`superseded/bridge-boss-2-reset-2026-07-27/impact-population/docs/runbooks/IMPACT_POPULATION_SECURE_TRANSPORT.md`
is 9,140 bytes with SHA-256
`59cbe10ff9dac457cfb5c2882c61170fb20f3905f0283dfef055558bc1b31a62`.
It was successor-annotated during containment and is intentionally not claimed
as the exact original commit blob.

## Active Product and doctrine findings

### Independently valuable and retained

- DiscussionBridge is an adapter-driven product family rather than an
  OBBBA-specific pipeline.
- DiscussionBridge Core contains portable connection, policy, planning,
  provenance, and audit contracts.
- DiscussionBridge for Discourse is the forum-side host/plugin direction;
  publishing adapters do not acquire independent forum authority.
- Every forum operation remains authorized by user-created Discourse API keys;
  durable identities are operating records, not an alternate authority scheme.
- Astro is the current reference adapter, not the definition of Core.
- Multiple adapters and sites may connect to one or more Discourse communities.
- The free products must remain capable; SaaS value comes from managed
  operation, scale, governance, and service rather than withholding ordinary
  local capability.
- Source authority and direction policy must remain explicit and fail closed.

These findings are retained because they are present in current successor-edited
architecture/Product documentation and agree with later doctrine. They are not
retained merely because they appeared in `46e0878`.

### Superseded or unsafe as active direction

- The July 25 OBBBA comparison artifacts are not acceptance fixtures for new
  Core or adapter work.
- The former Impact population gate is not the immediate Product sequence.
- Quarantined comparison, population, navigation, relationship, cache, or
  generated-content outputs cannot seed a clean implementation.
- OBBBA-specific workflows do not become portable Core or Discourse plugin
  contracts without separate Product/architecture approval.
- Wrangler-first deployment choices for a site do not become universal Core or
  adapter doctrine merely because they were developed in an OBBBA lane.
- Historical quoted spelling does not override the current `DiscussionBridge`
  brand decision.

## Exact next correction proposed after review

The smallest useful implementation step after this audit passes is a
documentation-only roadmap replacement:

1. Preserve the valid Core/Discourse-host/adapter/Product-family direction by
   independently restating it against current doctrine.
2. Remove the obsolete OBBBA comparison, Impact population, and quarantined
   acceptance-fixture sequence.
3. Start the roadmap from the current product baseline and the separately
   approved forum-side plugin scope, without authorizing plugin implementation.
4. Update the documentation index, metadata, and generated copy coherently.
5. Route the exact replacement to Product, Code, and Manual review.

That later step must not edit package/runtime code, restore quarantined files,
start OBBBA or Law work, create a plugin, deploy, publish, or perform forum
writes.

## Explicitly out of scope

- Reverting commit `46e0878` or its parent range.
- Restoring any file from `bd6d5c6` or from the commit.
- Moving or deleting Step 4 provenance.
- Reusing OBBBA comparison or Impact artifacts.
- Changing DiscussionBridge architecture, Product-family doctrine, pricing, or
  plugin implementation.
- Editing manuals, metadata, generated docs, package code, tests, or demos.
- Building, testing, staging, committing, pushing, publishing, deploying, or
  changing Discourse/Cloudflare/DNS state.

## Status

Step 5 disposition is ready for Code, Product, and Manual review. No cleanup or
roadmap rewrite is authorized by this inventory alone.
