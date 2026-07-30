# OBBBA Enrolled-Source Comparison — Final Zero-Write Report

Date: 2026-07-24 (Pacific)  
Machine report: `OBBBA_ENROLLED_SOURCE_COMPARISON_2026-07-24.json`

## Baseline and safety boundary

This comparison uses the local legacy enrolled-bill source
`BILLS-119hr1enr.xml` for H.R. 1, 119th Congress. Despite its extension, the
file contains legacy GPO HTML markup. It is the source stage used to populate
the protected OBBBA Text topics.

The run read 307 opening posts from `forum.repealobbba.org`. It made **zero
Discourse writes** and **zero Astro content writes**. Credentials were consumed
in-process and are not present in either evidence file.

The parser:

- joins inline small-cap spans without inventing spaces;
- stops at authored Title, Subtitle, Chapter, Subchapter, Part, and attestation
  boundaries;
- preserves quoted legal structures inserted inside a section;
- treats a retained matching `SEC. …` heading as presentation metadata; and
- reports legacy `bgcolor` residue explicitly rather than silently treating it
  as enacted text.

## Final result

| Outcome | Sections |
| --- | ---: |
| Normalized exact | 301 |
| Presentation-only | 4 |
| Word difference requiring disposition | 2 |
| Unresolved | 0 |
| **Total** | **307** |

The four presentation-only results are:

- Sections 70101, 70301, and 70342 retain their matching `SEC. …` headings in
  the community post.
- Section 10601 contains a trailing legacy `bgcolor` token.

## Two explicitly disposed exceptions

### Section 10401

The author confirmed that the community source intentionally contains an
explanatory footnote beginning:

> Footnotes Not found in US Code apparently a direction to the Secretary …

It also contains legacy color metadata. The enrolled legal text resumes after
the note. This belongs in community text and must not be represented as OBBBA
Text or silently folded into authoritative text.

### Section 40005

The provision heading is present near the beginning of the community post:

> 20306. Special appropriations for Mars missions, Artemis missions, and Moon
> to Mars program

Direct inspection of the protected first-post raw Markdown confirmed it on
line 3 as:

> **“§ 20306. Special appropriations for Mars missions, Artemis missions, and
> Moon to Mars program**

The remaining comparison result refers to a **second occurrence**. The enrolled
text ends subsection `(b) Clerical amendment` by adding the same `20306`
entry to the title 51 table of sections. The community post ends immediately
after “by adding at the end the following:” and omits that repeated 13-token
table entry. The operative Section 20306 provision is present, but the clerical
amendment is incomplete.

## Publish interpretation

The protected source agrees with the enrolled baseline for all 307 operative
section bodies after bounded presentation handling except for the disclosed
Section 40005 clerical table-entry omission. Section 10401 has a confirmed
community-only annotation. No changed operative provision is demonstrated.

The signed Public Law USLM comparison remains separate evidence. It is useful
as a later authoritative-law reference, but its case presentation and omitted
struck/inserted values made it unsuitable as the sole provenance baseline for
the text populated from the enrolled bill.
