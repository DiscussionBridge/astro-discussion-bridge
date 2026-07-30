# Bridge Boss 2 Forensic Ledger

Created: 2026-07-27  
Status: successor forensic inventory; no repair authority implied

## Purpose

This ledger inventories actions attributable to the Codex task later named
`Bridge Boss 2`, task/thread
`019f9538-0ed0-7ba1-9333-6a75b0896271`.

It covers the task's full tenure, not merely the later OBBBA Law as Amended
clean-room boundary.

## Time Boundary

- Task created: 2026-07-24 10:41:56 PDT.
- Direct firing: 2026-07-27 approximately 06:15 PDT.
- Formal Boss no-further-action directive: approximately 06:17 PDT.
- The separate Law product-origin boundary at turn
  `019f9fe7-0ec3-70a0-9b16-0c073b90e8f4` is not the BB2 arrival boundary.

## Evidence Basis

- Complete BB2 JSONL session record:
  `%USERPROFILE%\.codex\sessions\2026\07\24\rollout-2026-07-24T10-41-56-019f9538-0ed0-7ba1-9333-6a75b0896271.jsonl`
  (51,279,942 bytes).
- Direct transcript totals:
  - 476 started task turns;
  - 444 `apply_patch` calls;
  - 701 patched-file mentions;
  - 138 distinct canonical patched paths;
  - 957 shell-command calls;
  - 264 cross-thread messages;
  - 105 cross-thread waits;
  - 104 composed execution calls;
  - 33 web calls;
  - 19 browser/JavaScript calls.
- The itemized semantic ledger contains 114 entries, including item `22a`.
- Current Git/filesystem state.
- Later reviewed clean-room disposition and containment evidence.
- Independent Boss and Code Boss read-only forensic reviews.

Current timestamps and hashes are corroboration only. Later cleanup rewrote or
moved many files, so current file modification times cannot establish the full
historical footprint.

## Attribution Codes

- `D`: direct BB2 file, command, generation, deployment, or routing action.
- `U`: user-directed action that BB2 implemented or documented.
- `O`: operator action performed after BB2 recommendation/instruction.
- `X`: cross-lane work routed or induced by BB2 but executed by another lane.
- `P`: Phil/user correction that stopped or superseded BB2 work.
- `L`: later cleanup/reaction; not a BB2 action.
- `?`: attribution or exact historical bytes remain uncertain.

## Executive Findings

1. `D` BB2's footprint was not confined to the abandoned Law pipeline. It
   directly changed package/core/CLI/tests, manuals and runbooks, OBBBA
   import/navigation/site configuration, Discourse operations documentation,
   generated local content, acquired large official-source caches, and
   initiated production deployments.
2. `D` The raw transcript proves direct patch activity against 138 canonical
   paths: 131 in `astro-discussion-bridge`, six in the OBBBA Astro site, and one
   in Discourse site operations.
3. `D/O` BB2 prepared and supplied the reviewed import commands without
   individual page-level `apply_patch` events. The operator—not BB2's shell
   session—executed the imports that created 120 new Impact pages and 306 new
   OBBBA Text pages.
4. `D/O` Three successful `onebigbeautifulbill.us` production versions were
   created during the tenure:
   - `2352c93e-bcad-4159-8e46-2051c1574c90`;
   - `f86f4a2f-1240-4567-bb96-223e1a2eacfb`;
   - `ebb2f386-d6e1-4d78-926c-a89db542eb70`.
5. `D` The later Law slice generated five cache trees containing 1,400 files
   and approximately 2.4 GiB. Those trees and the legacy Law implementation
   have since been physically contained.
6. `D` BB2 introduced `astrostarlight.demo.discussionbridge.dev` into the
   connected-forum showcase plan and launch checklist after the broad user
   request to address embed settings and create a DiscussionBridge showcase.
   The direct patch record contains no preceding discussion or approval to
   replace the previously chosen `astrostarlightdemo.discussionbridge.dev`
   convention.
7. `U` Domain-specific Discourse API-key descriptions were explicitly discussed
   with the user during BB2's tenure and then repeatedly propagated by BB2
   through key-management docs and OBBBA runbooks. This is not accurately
   classified as an autonomous BB2 invention, although BB2 amplified and
   operationalized the convention.
8. `O` BB2 diagnosed and instructed the production Rails change
   `SiteSetting.same_site_cookies = "None"` for cross-site full-app embedding.
   The user/operator changed the value from `Lax` to `None`, and BB2 then
   documented the result in Bridge and Discourse operations materials.
9. `X` Commit `46e08781b9bf71def5f34205fbe086e61ca41faa`,
   `Define Discussion Bridge core and product family`, was created during BB2's
   tenure, but the approval transcript identifies the executing task as Product
   Boss (`019f85af-15f7-73d3-a8d0-919f648784f9`), not BB2. It is a cross-lane
   consequence, not a direct BB2 commit. It contains 16 files, 12,484
   insertions, and 42 deletions and remains one commit ahead of `origin/main`.
10. `D` The final BB2 action replaced the rejected active-boundary checker with
    a large incomplete/unverified version. BB2 was stopped and fired after
    prolonged non-progress/non-reporting.

## Itemized Action Ledger

### A. Onboarding and inherited-state intake

1. `D` Accepted the replacement Bridge Boss package after Bridge Boss 1 became
   saturated.
2. `D` Read the durable DiscussionBridge planning and Boss materials.
3. `D` Read/reconstructed Bridge Boss 1 context after the user explicitly
   required a fuller predecessor review.
4. `D` Assumed implementation, product behavior, evidence, Alpha-gate, and
   cross-lane coordination responsibilities.

### B. Official-source comparison and enrolled-source analysis

5. `D` Added an official-source batch-report module and package export.
6. `D` Added CLI support and configuration for official-source reports.
7. `D` Added official-source comparison tests.
8. `D` Added enrolled-source parsing/normalization utilities.
9. `D` Added enrolled-source analyzer command and focused tests.
10. `D` Generated official/enrolled comparison JSON and Markdown evidence.
11. `D` Reworked and deleted intermediate comparison artifacts before producing
    final comparison records.
12. `D` Updated manuals, product notes, launch checks, and package documentation
    to describe the comparison behavior.

### C. Impact population and credential detour

13. `D` Added the Impact population engine and tests.
14. `D` Added Impact population configuration and generation tooling.
15. `D` Generated an initial dry-run evidence artifact.
16. `D` Generated a corrected dry-run evidence artifact.
17. `D` Added publication-review tooling and tests.
18. `D` Generated publication-review V1 and V2 artifacts.
19. `D` Classified 135 Impact candidates: 15 existing pages, 120 new page
    candidates, and Section 10101 as manual cleanup/quarantine.
20. `D` Added a strict Impact review-packet validator.
21. `D` Added the Impact import-manifest library, builder, tests, and integration
    test.
22. `D` Modified Discourse client retry/rate-limit handling during the operator
    failure sequence.
22a. `D` Read the protected local diagnostics-key record, placed the credential
     into the command process environment, and used it for authenticated
     GET-only reads from `forum.repealobbba.org`, including comparison/topic
     post retrieval. No secret value is reproduced here, and the reviewed
     transcript shows no known credential disclosure from these calls.
23. `D` Added Windows credential fixture, credential-record module, secure
    transport wrapper, tests, and a secure-transport runbook.
24. `D` Produced and repeatedly revised the Impact operator runbook.
25. `D` Generated brittle or incorrect operator instructions during the
    multiline PowerShell/API-key sequence, then routed a forensic restart
    review after Boss stopped further command invention.
26. `D` Contributed to confusion among API-key description, selected Discourse
    actor, vault filename, key scope, and durable-versus-temporary lifecycle.
27. `U` Implemented the user's four-key operating description during the
    session.
28. `D` Repeatedly rewrote key-management docs and OBBBA human/machine runbooks
    as the key model changed.
29. `D` Withdrew Windows Credential Manager as the required product authority
    model after Phil/Boss correction.

### D. DiscussionBridge product-family and documentation work

30. `D/X` Drafted/routed core-adapter architecture, implementation roadmap,
    product-family doctrine, mission, manuals, product notes, content-lane and
    launch material.
31. `X` Product Boss staged and committed a 16-file documentation/evidence
    changeset as commit `46e0878`.
32. `D` Used the then-current spaced `Discussion Bridge` product styling in
    authored doctrine and documentation.
33. `L` The later controlling brand decision changed normal product styling to
    `DiscussionBridge`; that cleanup is not a BB2 action.
34. `D` Modified docs-site synchronization behavior and docs-site Astro/404
    configuration.
35. `D` Added a connected-site audit, connected-forum embed/showcase plan, and
    related launch-check entries.
36. `D` Introduced the dotted Starlight demo hostname in those records without
    an explicit hostname-convention decision.

### E. OBBBA Impact import, navigation, and production deployment

37. `D` Modified package import-manifest and existing-topic import logic.
38. `D` Modified Discourse client, navigation, relationships, exports, and
    related tests.
39. `D` Built and reviewed a 120-entry Impact import manifest.
40. `O` The operator executed BB2's prepared command sequence and imported 120
    new local Impact pages atomically.
41. `D` Preserved 15 existing Impact pages and Section 10101 quarantine.
42. `D` Built the OBBBA Astro site and verified 135 total Impact pages.
43. `D` Added navigation route-refresh tooling and navigation tests.
44. `D` Modified OBBBA site package files to consume the local vendor archive
    `astro-discussion-bridge-0.1.0-alpha-routefix-b8117b4c.tgz`.
45. `D` Produced/installed revised navigation data.
46. `D` Deployed production version
    `2352c93e-bcad-4159-8e46-2051c1574c90`.
47. `D` Modified `wrangler.jsonc` to use
    `not_found_handling: "404-page"`.
48. `D` Deployed production version
    `f86f4a2f-1240-4567-bb96-223e1a2eacfb`.
49. `D` Ran live verification for homepage, representative Impact routes,
    navigation/search, and custom 404 behavior.

### F. OBBBA Text import

50. `D` Added an enrolled-section authority builder and evidence artifact.
51. `D` Added OBBBA Text import-manifest library/builder and focused tests.
52. `D` Added evidence validation, legal-text normalization, body-edit rules,
    and atomic staging tests.
53. `D` Modified the public import API and manifest handling several times in
    response to Code Boss integrity findings.
54. `D` Produced four candidate generations of the OBBBA Text import manifest;
    V4 remained the accepted pre-import artifact at that time.
55. `O` The operator executed BB2's prepared command sequence and imported 306
    new local OBBBA Text pages.
56. `D` Preserved the existing Section 10101 page.
57. `D` Added navigation-acceptance verification.
58. `D` Regenerated navigation to bind 307 Text plus 135 Impact routes
    (442 total).
59. `D` Modified the OBBBA site's authored navigation configuration.
60. `D` Built and verified the 442-route production artifact.
61. `D` Initiated a Wrangler deployment that exceeded the command window,
    verified it had not completed, and retried the same artifact.
62. `D` Deployed production version
    `ebb2f386-d6e1-4d78-926c-a89db542eb70`.
63. `D` Ran representative live Text, Impact, navigation, source-disclosure,
    topic-binding, search, sitemap, caching, and 404 checks.
64. `D` Reported no Discourse API writes during the local Impact/Text imports.

### G. Full-app embed and production Discourse setting

65. `D` Investigated a cross-site fullInteractive sign-in loop between
    `onebigbeautifulbill.us` and `forum.repealobbba.org`.
66. `D` Distinguished same-site CAN behavior from cross-site OBBBA behavior.
67. `D` Recommended the hidden Discourse setting
    `same_site_cookies=None`.
68. `D` Routed the issue to Discourse Boss/Site Ops and requested authority
    confirmation.
69. `D` Initially supplied the wrong container name (`app`), then corrected it
    to the production `web_only` container.
70. `D` Supplied the Rails production-console sequence.
71. `O` The operator changed `same_site_cookies` from `Lax` to `None`.
72. `D` Recorded successful authenticated in-frame reply behavior.
73. `D` Updated package README, troubleshooting, Discourse field notes, OBBBA
    runbooks, and the Discourse full-app embed checklist.
74. `?` The setting remains a live production security/compatibility decision
    and should be reviewed on its merits; the audit does not declare it wrong
    merely because BB2 recommended it.

### H. Site-specific credit and premature Law navigation

75. `D` Modified OBBBA `MarkdownContent.astro` with a site-specific spaced
    `Discussion Bridge` visible credit and `discussion-bridge*` hooks.
76. `L` That site-specific implementation was later replaced by the reviewed
    shared optional `Connected by DiscussionBridge` contract.
77. `D` Added a `Law as Amended` navigation/lens candidate before the legal
    authority/content pipeline was ready.
78. `D` Modified OBBBA `src/content.config.ts` for the developing Law content
    model.

### I. OBBBA Law as Amended pipeline

79. `D` Added the initial Law as Amended plan and forum-metadata model.
80. `D` Treated a 309-item forum identity/discussion inventory as a selection
    boundary and allowed it to influence official-scope/cardinality work.
81. `D` Added Law metadata, authority-map, release-plan, archive, XML,
    section-selection/store, comparison, attribution, official-reference,
    USLM AST/Markdown/renderer, page-plan, renderer, writer, and commitment
    tooling.
82. `D` Added the corresponding large test surface.
83. `D` Generated derived and candidate evidence artifacts.
84. `D` Downloaded/generated five ignored official-source/cache trees totaling
    1,400 files and approximately 2.4 GiB.
85. `D` Added `.discussionbridge-cache/` to `.gitignore`.
86. `D` Substituted local OBBBA Text/imported Markdown/topic provenance into
    the Law authority path.
87. `D` Created a local enacted-derivative manifest and writer path.
88. `D` Pursued a 300-page ceiling derived from local/derivative coverage.
89. `D` Used generic `Before OBBBA` prior-state labeling.
90. `D` Repeatedly propagated false uncertainty about enacted Section 20009
    after a defective derivative/local inventory omitted it.
91. `D` Kept Section 70310 in a provisional/pending framing later corrected by
    Phil.
92. `D` Used forum-first framing for Section 71119 before the later
    official-source-first correction.
93. `D/X` Routed repeated Code/Product reviews that improved mechanics while
    failing to stop the invalid authority premise.
94. `D` Deleted a failed writer staging tree
    `.law-as-amended-stage-946d155f-b39d-44c4-aba7-36e304a62260` after
    validating its path.
95. `P` Phil—not BB2 or the reviewing Boss system—stopped the Law authority
    drift and Section 20009 contamination.

### J. Gate 1 recovery work performed before firing

96. `D` Performed the initial repository/worktree baseline inventory.
97. `D` Performed an OBBBA site reproducibility inventory.
98. `D` Performed active reachability/dependency inspection.
99. `D` Added the Gate 1 doctrine/fact/source matrix.
100. `D` Added the Gate 1 baseline/reachability inventory.
101. `D` Routed Code/Product reviews of those Gate 1 records.
102. `D` Moved six superseded executable/test files to inert `.mjs.txt`
     provenance.
103. `D` Removed the local derivative renderer branch.
104. `D` added the prior-state-label fail-closed correction.
105. `D` Designed and implemented a rejected V1 active-boundary checker.
106. `D` Routed reviews that rejected the V1 checker.
107. `D` Designed a corrected V2 checker contract.
108. `D` Began a wholesale V2 replacement as one oversized step.
109. `D` Failed to provide useful timely completion/status during that step,
     requiring repeated stop messages.
110. `D` Left only
     `scripts/check-obbba-law-active-boundary.mjs` changed in the final failed
     step; it was not syntax-checked or executed.
111. `D` Reported the earlier rejected identity as 31,041 bytes and SHA-256
     `f5aa0a49145a9d45e7206ff07c29948ebd7e6800beff2cc6eb639d4118882095`.
112. `?` Later contained bytes have a different identity, proving the checker
     changed again; exact intermediate identities must not be conflated.
113. `D` Was fired and acknowledged no further action.

## Later Containment and Cleanup — Not BB2

The following are successor/remediation work and must not be charged as direct
BB2 actions:

- the clean-room reset decision;
- the final legacy disposition manifest;
- physical containment of legacy Law scripts, tests, artifacts, and caches;
- Product and Manual downstream contamination cleanup;
- the settled `DiscussionBridge` brand correction;
- the shared optional credit contract;
- current generic public credential-role descriptions;
- later demo rebuild/deployment work.

## Current Disposition

- Law pipeline: abandoned as implementation; retained only as inert
  lessons-learned provenance.
- Law caches: physically contained; denied to the clean room.
- Impact/Text/site work: demonstrably touched by BB2, but not automatically
  invalid. Review item by item against current requirements before reuse.
- Production versions: historical external mutations; verify current live state
  independently.
- `same_site_cookies=None`: independently review and retain or reverse based on
  the intended cross-site authenticated embed contract and security posture.
- Dotted Starlight hostname convention: conflicts with Phil's restored
  `astrostarlightdemo.discussionbridge.dev` decision; do not propagate it
  further without an explicit domain migration decision.
- Commit `46e0878`: cross-lane Product Boss commit, not direct BB2 authorship;
  audit its retained doctrine/evidence separately before push.

## Completeness Limits

- The 138-path appendix covers direct `apply_patch` targets only.
- Shell-driven generated pages, caches, `dist`, `node_modules`, temporary
  staging trees, and external provider state are listed by action/count rather
  than every generated filename.
- The raw task transcript is the controlling audit source for command-level
  reconstruction.
- No secret values are reproduced in this ledger.

## Appendix A — Direct Patched Paths

The machine-extracted canonical path appendix follows. Repeated patch operations
are collapsed to one path; this does not collapse the action ledger above.

- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\.gitignore`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\BUILD_LAUNCH_CHECKLISTS.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\CORE_ADAPTER_ARCHITECTURE.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\CORE_ADAPTER_IMPLEMENTATION_ROADMAP.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\DISCOURSE_FIELD_NOTES.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\CONNECTED_FORUM_EMBED_AND_SHOWCASE_PLAN_2026-07-25.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\DISCUSSION_BRIDGE_MISSION_2026-07-25.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\DISCUSSION_BRIDGE_PRODUCT_FAMILY_DOCTRINE_2026-07-25.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\LIVE_CONNECTED_SITE_AUDIT_2026-07-25.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\OBBBA_ENROLLED_SOURCE_COMPARISON_2026-07-24.json`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\OBBBA_ENROLLED_SOURCE_COMPARISON_2026-07-24.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\OBBBA_IMPACT_POPULATION_OPERATOR_RUNBOOK_2026-07-25.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\OBBBA_LAW_GATE1_BASELINE_AND_REACHABILITY_INVENTORY_2026-07-26.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\OBBBA_LAW_GATE1_DOCTRINE_FACT_SOURCE_MATRIX_2026-07-26.json`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\OBBBA_LAW_USC_SOURCE_CACHE_POLICY_2026-07-26.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\OBBBA_LAW_VERSIONED_SOURCE_AND_ATTRIBUTION_MODEL_2026-07-26.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\OBBBA_OFFICIAL_SOURCE_COMPARISON_2026-07-24.json`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\OBBBA_OFFICIAL_SOURCE_COMPARISON_FINAL_2026-07-24.json`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\evidence\OBBBA_OFFICIAL_SOURCE_COMPARISON_FINAL_2026-07-24.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\HUMAN_MANUAL.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\KEY_MANAGEMENT.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\MACHINE_MANUAL.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\PRODUCT_NOTES.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\README.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\runbooks\IMPACT_POPULATION_SECURE_TRANSPORT.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\runbooks\OBBBA_ONEBIGBEAUTIFULBILL_HUMAN.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\runbooks\OBBBA_ONEBIGBEAUTIFULBILL_MACHINE.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\docs\TROUBLESHOOTING.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\examples\obbba-impact-population.config.json`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\examples\obbba-official-source-report.config.json`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\package-lock.json`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\package.json`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\README.md`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\scripts\obbba-law-as-amended-collector.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\scripts\obbba-law-as-amended-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\scripts\obbba-law-as-amended-plan.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\src\cli.ts`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\src\credential-record.ts`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\src\discourse\client.ts`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\src\impact-population.ts`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\src\import-existing.ts`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\src\import-manifest.ts`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\src\index.ts`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\src\navigation.ts`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\src\official-source-report.ts`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\src\relationships.ts`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\cli.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\credential-record.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\enrolled-source-analyzer.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\impact-import-manifest-generator.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\impact-population.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\impact-publication-review.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\impact-review-packet-validator.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\navigation.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\obbba-law-as-amended-collector.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\obbba-law-as-amended-plan.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\obbba-law-as-amended.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\obbba-text-atomic-staging.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\obbba-text-body-edits.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\obbba-text-evidence-validator.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\official-source-report.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\secure-credential-transport.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\sync.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\packages\astro-discussion-bridge\test\windows-credential-fixture.ps1`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\analyze-enrolled-source.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\analyze-obbba-law-usc-target-presence.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\build-obbba-enrolled-section-authority.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\build-obbba-impact-import-manifest.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\build-obbba-law-as-amended-metadata.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\build-obbba-law-as-amended-page-plan.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\build-obbba-law-enacted-derivative-manifest.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\build-obbba-law-incorporation-window-plan.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\build-obbba-law-usc-attribution-index.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\build-obbba-law-usc-comparison-index.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\build-obbba-law-usc-release-plan.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\build-obbba-law-usc-section-store.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\build-obbba-law-uslm-rendering-commitments.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\build-obbba-text-import-manifest.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\check-obbba-law-active-boundary.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\enrolled-source-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\extract-obbba-law-incorporation-window-xml.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\fetch-obbba-law-authority-map.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\fetch-obbba-law-incorporation-window-archives.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\generate-obbba-impact-config.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\invoke-impact-population-secure.ps1`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-impact-import-manifest-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-as-amended-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-as-amended-metadata-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-as-amended-page-plan-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-as-amended-page-renderer.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-authority-map-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-incorporation-window-plan-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-official-reference-map.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-usc-archive-collector.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-usc-comparison-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-usc-release-plan-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-usc-section-selector-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-usc-xml-extractor.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-uslm-ast-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-uslm-markdown-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-law-uslm-renderer-registry.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\obbba-text-import-manifest-lib.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\refresh-navigation-content-routes.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\review-obbba-impact-population.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\sync-docs-site-content.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\fetch-obbba-law-authority-map.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-impact-import-manifest-integration.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-as-amended-metadata.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-as-amended-page-plan.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-as-amended-page-renderer.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-as-amended-writer-transaction.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-authority-map.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-enacted-derivative-manifest.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-incorporation-window-plan.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-official-reference-map.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-usc-archive-collector.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-usc-attribution-runner.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-usc-comparison-runner.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-usc-comparison.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-usc-release-plan.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-usc-section-selector.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-usc-section-store.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-usc-xml-extractor.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-uslm-ast.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-uslm-markdown.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-uslm-renderer-registry.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\test\obbba-law-uslm-rendering-commitments.test.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\verify-obbba-navigation-acceptance.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\scripts\write-obbba-law-as-amended-pages.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\sites\docs\astro.config.mjs`
- `C:\CodeProjects\CodeWorksLabs\astro-discussion-bridge\sites\docs\src\pages\404.astro`
- `C:\CodeProjects\CodeWorksLabs\Discourse\discourse-site-ops\docs\discourse-full-app-embed-setup-checklist.md`
- `C:\CodeProjects\Projects\OBBBA\sites\onebigbeautifulbill.us\astro\discussionbridge-navigation.config.json`
- `C:\CodeProjects\Projects\OBBBA\sites\onebigbeautifulbill.us\astro\package-lock.json`
- `C:\CodeProjects\Projects\OBBBA\sites\onebigbeautifulbill.us\astro\package.json`
- `C:\CodeProjects\Projects\OBBBA\sites\onebigbeautifulbill.us\astro\src\components\MarkdownContent.astro`
- `C:\CodeProjects\Projects\OBBBA\sites\onebigbeautifulbill.us\astro\src\content.config.ts`
- `C:\CodeProjects\Projects\OBBBA\sites\onebigbeautifulbill.us\astro\wrangler.jsonc`
