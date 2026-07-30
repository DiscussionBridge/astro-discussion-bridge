# OBBBA Law versioned source and attribution model

## Purpose

Discussion Bridge must distinguish legal state from legal causation. A
difference between two United States Code releases proves that the Code changed;
it does not, by itself, prove which public law caused every difference.

## Authoritative snapshots

The Law as Amended pipeline uses four related authorities:

1. **Pre-OBBBA baseline:** OLRC release `118-250not159`, retained as the broad
   pre-enactment historical baseline already acquired by the pipeline.
2. **Last OLRC release expressly excluding OBBBA:** `119-27not21`, dated
   2025-07-18. This release includes later 119th Congress work through Public Law
   119-27 while expressly excluding Public Law 119-21.
3. **First later OLRC release incorporating OBBBA:** `119-31`, dated 2025-07-30.
   It incorporates Public Law 119-21, but it is not an OBBBA-only snapshot
   because intervening public laws are also present.
4. **Present law:** the reviewed current OLRC title releases, presently the
   title-level `119-102` files under the aggregate `119-102not101` index.

## Attribution rule

No current/prior or `119-31`/`119-27not21` text difference may be labeled an
“OBBBA change” solely because it appears between those releases.

An OBBBA attribution requires:

- a Public Law 119-21 classification record from OLRC or an enacted-law
  provision from GovInfo; and
- where Code editorial history is used, an amendment/source note that
  explicitly identifies Public Law 119-21.

The release comparisons are supporting state evidence:

- `119-27not21` → `119-31` shows the narrow incorporation window, subject to
  intervening-law contamination;
- `118-250not159` → current shows longer historical change, not OBBBA causation;
- `119-31` → current shows later evolution after initial incorporation.

## Local source-store requirement

The portable Discussion Bridge source store must key every document and selected
provision by authority, release point, title, section identifier, source URL,
byte hash, and extraction hash. It must preserve multiple releases concurrently
so the same machinery can analyze Public Law 119-21 or any later bill without
overwriting historical state.

The selector may emit ambiguity, absent-in-release, transfer, repeal, note-only,
or intervening-change review states. It must never repair or guess a missing
identity and must never infer legislative causation from text difference alone.
