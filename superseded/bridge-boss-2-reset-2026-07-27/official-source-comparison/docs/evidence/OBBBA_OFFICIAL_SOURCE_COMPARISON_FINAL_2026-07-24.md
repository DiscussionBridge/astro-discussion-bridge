# OBBBA Official-Source Comparison — Final Zero-Write Report

Date: 2026-07-24 (Pacific)  
Machine report: `OBBBA_OFFICIAL_SOURCE_COMPARISON_FINAL_2026-07-24.json`

## Purpose and safety boundary

This is the comparison-only gate for the OBBBA Text lens. It read the protected
source topics at `forum.repealobbba.org` and compared their opening posts with
the Public Law 119-21 USLM record published by Congress.gov.

The run made **zero Discourse writes** and **zero Astro content writes**. It did
not populate official-source metadata or add Impact links.

The first attempted batch became rate-limited and was discarded as
non-authoritative. The final run used sequential GET requests, a 350 ms minimum
request interval, and bounded retries for HTTP 429 only. It completed with no
unresolved sections.

## Result

The navigation manifest contains 381 authored nodes. Of those, 307 are actual
section nodes and therefore belong in this comparison.

| Outcome | Sections |
| --- | ---: |
| Exact | 48 |
| Presentation-only | 28 |
| Substantive-difference | 231 |
| Unresolved | 0 |
| **Total sections** | **307** |

The immediate no-substantive-difference queue contains 76 sections: 48 exact
and 28 presentation-only. By Title, that queue is:

| Title | Sections |
| --- | ---: |
| I | 7 |
| II | 8 |
| III | 2 |
| IV | 4 |
| V | 6 |
| VI | 24 |
| VII | 11 |
| VIII | 5 |
| IX | 3 |
| X | 6 |

## Interpretation

The 231 review-required results are deliberately conservative. Many are
capitalization-only differences such as `In General` versus `In general`, or
title-case official headings versus all-caps community headings. The comparator
does not normalize case because capitalization can carry legal meaning.

Not every result in that bucket is merely capitalization. For example, Sections
10302, 10304, and 10305 expose values such as `2023` and `2031` in the community
text where the current USLM extraction context reads only “by striking” and
“inserting.” Those cases may reflect structured-source extraction behavior, but
they must not be approved automatically.

## Enrolled-source follow-up

The forum text was populated from the enrolled bill rather than this signed-law
USLM representation. The subsequent enrolled-source comparison cleared 301
sections as normalized exact and four as presentation-only, leaving only two
bounded source-content exceptions and zero unresolved. See
`OBBBA_ENROLLED_SOURCE_COMPARISON_2026-07-24.md`.

Create the approved population manifest from the enrolled baseline while
retaining this signed-law comparison as separate later-stage authority
evidence. The approved population run can add official-source metadata and
generate the OBBBA Text → Impact links together.
