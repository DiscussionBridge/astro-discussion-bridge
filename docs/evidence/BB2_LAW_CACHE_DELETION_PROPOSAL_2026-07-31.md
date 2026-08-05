# Bridge Boss 2 Law Cache Deletion Proposal

Date: 2026-07-31  
Status: review pending; deletion not authorized

## Proposed outcome

Permanently delete exactly five contained Bridge Boss 2 Law cache trees after
Code, Product, Manual, and Boss approval. The proposed deletion would remove
1,400 files and reclaim 2,398,775,787 bytes.

This is deletion, not reversal. Exact deleted payload bytes will not remain
locally recoverable. The retained manifest preserves their former identities;
the official archive map preserves a recovery path to the exact recorded
authoritative-source versions; extracted XML can be reconstructed from those
archives. The derived selected-section cache is not legal authority and is not
promised byte-for-byte reconstruction.

No deletion, move, compression, upload, restoration, source fetch, publication,
deployment, or external mutation occurred while preparing this proposal.

## Exact deletion targets

All targets are beneath this resolved parent only:

`C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\.discussionbridge-cache\superseded\law-as-amended-clean-room-reset-2026-07-27`

| Exact child directory | Files | Bytes | Ordinal commitment SHA-256 |
|---|---:|---:|---|
| `obbba-law-usc-archives-2026-07-26` | 40 | 156,205,615 | `6f2abddcc721bcfeeeaae6672a78d8ee8a6a9dcda67951882bbe0b3c4943c68f` |
| `obbba-law-usc-incorporation-archives-2026-07-26` | 40 | 155,942,341 | `eb0bb60dfe339d478fd1d44690a3e1b304410ac7e5517b4fbc48f8f877b9707a` |
| `obbba-law-usc-incorporation-xml-2026-07-26` | 40 | 996,545,696 | `0024a5827ba8c2ccb6c696a1391a8532d51b205b4cb63dbe5d1e4798e0f960ca` |
| `obbba-law-usc-selected-sections-2026-07-26` | 1,240 | 90,833,453 | `dd59a3715d105674bf1e63b4b402a0b0da667f57da9d79dc18c69a9849eb1c7d` |
| `obbba-law-usc-xml-2026-07-26` | 40 | 999,248,682 | `6a14c04f9aaecd392eb14c538c32c0f133add37dac0100f4b9f4f1013a91052a` |
| **Total** | **1,400** | **2,398,775,787** | Five separate commitments; no synthetic directory digest |

The commitments independently reproduce the five cache commitments in the
reviewed legacy disposition manifest using cache-root-relative paths, ordinal
sorting, UTF-8 rows, LF separators, decimal byte lengths, and lowercase SHA-256.

## Preservation package

Retain these records outside the deletion targets:

1. `docs/evidence/BB2_LAW_CACHE_DELETION_MANIFEST_2026-07-31.json`
   - 300,173 bytes
   - SHA-256
     `c947e2e979e108846939f068d13cbed019a79f09e70cbbe8340bcc19aadd61b8`
   - Contains all 1,400 cache-root-relative paths, byte lengths, and SHA-256
     identities, the five aggregate commitments, and all 80 official archive
     source records.
2. The clean-room reset decision, forensic ledger, Step 4 retention ledger,
   legacy disposition manifest, and candidate archive/XML evidence already
   retained under `docs/evidence` or its `superseded` provenance tree.
3. A post-deletion completion record, to be created only by the separately
   reviewed execution step, recording target absence, retained-manifest
   identity, reclaimed bytes, timestamp, and operator/tool boundary.

The create-only generator
`scripts/maintenance/build-bb2-law-cache-deletion-manifest.mjs` is 5,172 bytes
with SHA-256
`a93e9f9b659c9cfc78859b53f651b31db996c33abcd6aa283d1a558b4f31ee34`.
It currently provides pre-deletion deterministic verification. Because it
requires all cache payloads to exist, the execution plan must move it to an
inert superseded provenance location after the last successful pre-delete
verification and before deleting the targets. It must not remain as a broken
active maintenance command after deletion.

## Dependency and authority findings

- Active scan result: zero package, runtime, build, site, navigation,
  relationship, test, CLI, publication, or deployment references to the five
  cache identities outside superseded/forensic records.
- The separate OBBBA site containment verifier validates 434 site payloads and
  navigation recovery records; it does not depend on these five Law cache
  trees.
- The five caches are denied as clean-room inputs, Law as Amended authority,
  official scope/cardinality authority, implementation inputs, publication
  inputs, or repair inputs.
- The preserved candidate archive/XML evidence remains historical forensic
  evidence only. Its official-looking names do not grant controlling authority.
- Deleting these caches does not authorize a new Law pipeline, Gate 2,
  publication, portable-Core adoption, or use of any derivative selection.

## Recovery/reconstruction evidence

The two preserved archive-evidence files contain 80 exact official U.S. Code
House release-point URLs with their release roles, release points, titles,
archive byte lengths, SHA-256 identities, expected XML entries, uncompressed
XML lengths, and CRC32 values.

On 2026-07-31, a read-only HTTP HEAD check of all 80 exact recorded
`https://uscode.house.gov/download/releasepoints/...` URLs returned HTTP 200:

- expected URLs: 80
- responses recorded: 80
- HTTP 200: 80
- failures: 0

This establishes current independent availability of the exact named official
release-point resources. It does not convert the abandoned cache or its
derivatives into legal authority, guarantee perpetual future availability, or
claim that deletion is reversible. Future clean work must reacquire sources
under its own authoritative-source contract and independently verify bytes.

## Required execution contract after approval

1. Resolve the repository root and exact parent directory; block unless both
   equal the paths reviewed above.
2. Verify the preservation manifest identity and run the generator in verify
   mode. Block on any mismatch in 1,400 paths, bytes, member hashes, or five
   commitments.
3. Verify all preservation records exist outside the five targets and contain
   no secrets.
4. Re-run the active-reference scan. Block on any new non-provenance consumer.
5. Move the exact generator bytes to a predetermined inert superseded location,
   verify the move byte-for-byte, and ensure no active registration refers to
   it.
6. Delete only the five explicit resolved child directories. Do not use a glob,
   environment-variable-derived target, workspace root, cache parent, or
   recursive target broader than each named child.
7. Verify all five targets are absent, the cache parent and unrelated caches
   remain intact, and retained evidence identities still reproduce.
8. Create and review a deterministic completion record. Report permanent
   deletion and reclaimed storage honestly.
9. Stop. Do not build, deploy, publish, fetch sources, start Law work, delete
   provider state, or proceed to another cleanup group.

## Rollback and failure boundary

There is no payload rollback after permanent deletion. Therefore all identity,
dependency, preservation, and source-availability checks occur before the first
delete. Any preflight failure blocks the entire operation. A partial deletion
must be reported as a deletion incident; it must not trigger automatic source
reacquisition, derivative regeneration, or reuse of abandoned scripts.

## Explicitly out of scope

- The 434 OBBBA site payloads and their active containment verifier.
- The retired routefix vendor archive.
- Contained scripts, tests, comparison evidence, governance records, or Law
  clean-room boundary records.
- Cloudflare versions, deployments, rollback records, DNS, or live content.
- Discourse settings, topics, API keys, or forum data.
- Any cache outside the five exact named children.
- Any implementation, publication, deployment, commit, push, or release.

## Requested review disposition

Review this as a permanent-deletion proposal. A PASS permits preparation of one
separately reviewed deletion execution step; it does not itself authorize the
delete.
