# Bridge Boss 2 Emergency-Provenance Retention Inventory — 2026-07-31

Status: read-only retention inventory. This document does not authorize file
movement, deletion, provider-version retirement, rollback, deployment,
publication, restoration, or reuse of quarantined work.

## Purpose and classification

The clean successor is live and accepted, but historical rollback versions and
local quarantine payloads still exist. This inventory separates four jobs:

- `current clean authority`: the accepted production implementation;
- `active emergency rollback`: a time-bounded service-restoration option that
  is known to reopen contamination and is not clean authority;
- `retain forensic`: evidence needed to explain, audit, or verify the cleanup;
- `archive/deletion candidate`: inactive payload whose removal still requires
  a separate exact manifest, retention decision, and approval.

Quarantined content remains denied as implementation, controlling legal or
product evidence authority, source authority, publication input, deployment
input, or repair input. It retains only bounded forensic evidentiary value.

## Current provider deployments

Read-only `wrangler deployments list --name onebigbeautifulbill --json` on
2026-07-31 returned ten deployments. No provider state changed.

| Created UTC | Deployment | Version | Classification | Retention disposition |
|---|---|---|---|---|
| 2026-07-24 03:07 | `0f1aeead-8740-4793-80a0-0f03326b7a3e` | `2fa24e22-2f79-4053-9f3b-436cf9f776b4` | pre-BB2-era provider provenance | Retain in provider history pending ordinary provider retention policy; not a preferred rollback target. |
| 2026-07-24 08:01 | `517cc5fd-7415-4c59-ac9b-572aee21ee3c` | `ebce4f27-f39e-4e4f-b95d-7049c5ffd313` | pre-BB2-era provider provenance | Retain in provider history pending ordinary provider retention policy; not a preferred rollback target. |
| 2026-07-24 08:35 | `b12056e8-6108-4dbc-bac4-cf91d593b385` | `8dc5a047-feb5-45e1-8c40-b1425cfd63c4` | v23 clean-content-era break-glass provenance | Retain as secondary historical reference only. It predates accepted successor behavior and is not the planned rollback target. |
| 2026-07-26 08:59 | `073dacdc-eb0f-4b91-a6fe-a88f48f5fbbd` | `2352c93e-bcad-4159-8e46-2051c1574c90` | BB2 Impact/navigation deployment | Retain forensic provider history; never select as a clean rollback target. |
| 2026-07-26 09:02 | `06c20cd0-8382-4043-9959-02afd65b3cde` | `f86f4a2f-1240-4567-bb96-223e1a2eacfb` | BB2 custom-404 deployment | Retain forensic provider history. The custom-404 idea was independently retained, but this exact version is not clean authority. |
| 2026-07-26 18:15 | `4ab95226-031a-4d71-9841-3e13eff53f5c` | `ebb2f386-d6e1-4d78-926c-a89db542eb70` | BB2 442-route deployment | Retain forensic provider history; never select as a clean rollback target. |
| 2026-07-27 19:33 | `1b57052a-1718-49c9-9bcc-1a74cb296498` | `3d8b7d14-fda9-43c7-a395-bde993af23fc` | cleanup-era intermediate | Retain forensic provider history until the deployment evidence chain is archived; not accepted production authority. |
| 2026-07-27 20:02 | `477d8159-79f9-4661-b73d-4c246daa926c` | `a13de6f3-dabd-4362-8241-8be4f313dab2` | cleanup-era intermediate | Retain forensic provider history until the deployment evidence chain is archived; not accepted production authority. |
| 2026-07-27 20:16 | `05708c20-757b-4db0-94bd-d23d3296f8b3` | `2e0d2277-b9fb-40ba-ad85-07cae6d425dc` | contaminated v29 | Retain temporarily as the primary emergency service-restoration rollback while the current clean deployment remains the only accepted content state. Any rollback to v29 explicitly reopens the contamination incident and requires immediate forward remediation. |
| 2026-07-30 07:58 | `33876b6d-428a-413f-90e3-5cb8841fc41d` | `02026df4-2348-471e-a671-af38f287a720` | current clean authority | Retain as active production. It receives 100% traffic and is the accepted clean successor. |

Provider versions should not be deleted merely to make the list look clean.
Their retirement belongs to provider retention policy after a later clean
deployment supplies a newer independently verified rollback target.

## Local quarantine summary

The five bounded local roots contain 1,973 files and 2,415,230,152 bytes. They
are absent from normal package/site reachability.

| Root | Files | Bytes | Current disposition |
|---|---:|---:|---|
| `superseded/bridge-boss-2-reset-2026-07-27` | 58 | 1,490,763 | Retain forensic manifests and payloads until the BB2 remediation milestone is committed, backed up, and past its retention review. |
| `scripts/superseded` | 50 | 438,298 | Retain inert code/test provenance. Never restore executable extensions or registrations. |
| `docs/evidence/superseded` | 23 | 6,974,572 | Retain governance lessons and deterministic disposition evidence long term; larger derivative reports may later move to non-public archive. |
| `.discussionbridge-cache/superseded` | 1,400 | 2,398,775,787 | Primary archive/deletion candidate. It is a denied local cache, not enacted-law authority or clean-room input. |
| `onebigbeautifulbill.us/astro/superseded` | 442 | 7,550,732 | Retain operator-import and retired-vendor provenance until site cleanup retention closes; then archive/delete payloads under a separately reviewed manifest. |

## Repository quarantine groups

| Group | Files | Bytes | Value and disposition |
|---|---:|---:|---|
| `official-source-comparison` | 13 | 566,226 | Retain forensic. Demonstrates the abandoned report/analyzer boundary and preserves its exact evidence identities. It cannot seed new source work. |
| `impact-population` | 24 | 694,977 | Retain forensic while credential-transport and operator-action history remain relevant. Contains no key value; logs remain non-public provenance. |
| `obbba-import-navigation-generators` | 11 | 191,197 | Retain forensic until the clean OBBBA Text design exists. Never reuse generators or approved-v4 output. |
| `shared-import-review-pins` | 2 | 9,611 | Retain compact proof of the selective pre-BB2 restoration; low storage cost and high audit value. |
| `client-navigation-batch-workarounds` | 1 | 1,032 | Retain compact manifest proving exact pre-BB2 blob restoration. |
| `connected-forum-showcase-plan` | 4 | 17,078 | Retain historical diagnostic provenance until the fresh public-site inventory is committed and backed up; then archive candidate. |
| `live-connected-site-audit` | 3 | 10,642 | Retain historical diagnostic provenance until the fresh inventory replaces it durably; then archive candidate. |

## Law clean-room quarantine groups

| Group | Files | Bytes | Value and disposition |
|---|---:|---:|---|
| `scripts/.../candidate-only` | 6 | 49,719 | Retain inert candidate provenance; denied to the clean room. |
| `scripts/.../tests` | 18 | 129,312 | Retain inert test provenance; denied to active test discovery. |
| Other contained Law scripts | 20 | 195,914 | Retain until the clean-room decision and final commitments are durably backed up; never reactivate. |
| `scripts/superseded/law-as-amended-local-derivative` | 6 | 63,353 | Retain `.mjs.txt` lessons-learned provenance; non-executable by design. |
| `docs/.../candidate-only` | 5 | 201,951 | Retain as candidate-only provenance, not authority. |
| `docs/.../governance-lessons-learned` | 7 | 457,427 | Retain long term; includes the reviewed disposition contract needed to interpret containment. |
| Other contained Law evidence | 11 | 6,315,194 | Archive candidate after exact identities and governance dependencies are confirmed; never treat as current controlling legal or product evidence authority. |

## Contained Law caches

| Cache tree | Files | Bytes | Disposition |
|---|---:|---:|---|
| `obbba-law-usc-archives-2026-07-26` | 40 | 156,205,615 | Archive/deletion candidate after manifest-only retention is approved. |
| `obbba-law-usc-incorporation-archives-2026-07-26` | 40 | 155,942,341 | Archive/deletion candidate after manifest-only retention is approved. |
| `obbba-law-usc-incorporation-xml-2026-07-26` | 40 | 996,545,696 | Highest-value storage deletion candidate; derivative cache, not authority. |
| `obbba-law-usc-selected-sections-2026-07-26` | 1,240 | 90,833,453 | Archive/deletion candidate; derived selection cannot seed clean-room scope. |
| `obbba-law-usc-xml-2026-07-26` | 40 | 999,248,682 | Highest-value storage deletion candidate; derivative cache, not authority. |

Deleting all five cache trees would reclaim 2,398,775,787 bytes, but deletion
is not authorized by this inventory. Before deletion, verify that the reviewed
disposition manifest's deterministic cache commitments reproduce, preserve the
manifest and governance records outside the deletion set, confirm zero active
references, and record whether the cache is recoverable from authoritative
official sources without treating that recoverability as legal authority.

## OBBBA site quarantine groups

| Group | Files | Bytes | Value and disposition |
|---|---:|---:|---|
| `operator-imported-content` | 440 | 7,448,478 | Contains the 426 operator-imported pages, eight auxiliaries, immutable manifest, completion record, navigation backups, and staged baselines. Retain through the current clean deployment's initial retention window. A later payload proposal must also retire/archive or deliberately replace the active containment verifier and preserve every still-required backup/staged-baseline record before any payload is moved or deleted. |
| `vendor-artifacts` | 2 | 102,254 | Retired routefix archive plus manifest. Archive/deletion candidate after the clean package archive and current deployment provenance are durably retained. Never reinstall. |

## Active reachability result

A fresh active-tree scan covered package source/tests, scripts, canonical docs,
examples, sites, and the OBBBA Astro site while excluding `superseded`, build
output, dependencies, and the forensic ledger. It searched the quarantined Law,
Impact, official-source-report, credential-record, import-generator,
review-pin, client/navigation workaround, V4 manifest, and routefix identities.

Result: zero runtime, package, build, site, navigation, relationship, or
deployment references. The only routefix-name occurrence found in the
site-wide scan was inside its own quarantine manifest. One active maintenance
dependency remains: `scripts/maintenance/contain-bb2-obbba-site.mjs` loads the
site quarantine manifest and completion record and requires all 434 payload
destinations plus the navigation backups and staged baselines to remain present
with their recorded identities. That verifier is a recovery/containment guard,
not implementation reachability, but it prevents payload removal under the
current maintenance contract.

## Recommended retention order

1. Keep current clean version `02026df4-2348-471e-a671-af38f287a720` as
   production authority.
2. Keep contaminated v29 only as a clearly labeled, time-bounded emergency
   service rollback until a later clean deployment becomes the reviewed
   rollback target.
3. Keep compact manifests, completion records, clean-room decisions,
   governance lessons, and the final forensic ledger long term.
4. After this ledger passes review and is durably committed/backed up, prepare
   a separate manifest-only deletion proposal for the five cache trees. This is
   the largest safe storage opportunity. Before deletion is proposed, preserve
   deterministic manifests and prove the exact authoritative-source versions
   remain independently reacquirable or reconstructable. Treat that as a
   recovery/reconstruction path, never as reversal or active implementation
   reuse.
5. Later prepare separate payload-retention proposals for the 426 imported
   pages/auxiliaries and retired routefix archive. Do not combine them with the
   cache deletion because their live-deployment provenance is different. Any
   imported-payload proposal must retire/archive or deliberately replace the
   active containment verifier and preserve every still-required navigation
   backup and staged-baseline record before moving or deleting payloads.
6. Do not delete provider deployments as part of local housekeeping. Apply a
   provider retention policy only after another clean deployment and exact
   rollback acceptance.

## Explicitly out of scope

- No local delete, move, compression, restoration, or extension change.
- No Cloudflare version deletion, rollback, deployment, traffic change, or
  configuration change.
- No Discourse, DNS, source, publication, or content write.
- No clean OBBBA Text or Law pipeline design.
- No claim that quarantined official-looking material is authoritative.
