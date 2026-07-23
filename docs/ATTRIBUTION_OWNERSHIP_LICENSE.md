# Attribution, Ownership, And Licensing

This document records the public Alpha attribution, ownership, and licensing posture for DiscussionBridge and Discussion Bridge for Astro.

It adapts the WebSynergetics legal and ownership governance working notes for this public repository. The WebSynergetics-level legal/governance records remain the master operating source; this file is the project-facing public version.

## Public Summary

DiscussionBridge is an independent WebSynergetics project.

Discussion Bridge for Astro is the Astro integration package in the DiscussionBridge project family.

Package name:

```text
astro-discussion-bridge
```

Recommended short public attribution:

```text
Built by Phil Henry / WebSynergetics with AI-assisted development.
```

Recommended package/repo attribution:

```text
Copyright (c) 2026 WebSynergetics
Maintainer: Phil Henry
License: MIT
Development: Human-directed, AI-assisted development using Codex and related tools.
```

## Ownership

WebSynergetics owns and maintains this work unless a later file, agreement, or project record says otherwise.

Phil Henry is the current human maintainer/operator for this project.

AI tools, including Codex, may assist with development and documentation, but they are not listed as copyright owners, legal authors, maintainers, or inventors.

The human/operator and organization remain responsible for reviewing, testing, securing, licensing, publishing, and maintaining the work.

## License

The code and documentation in this repository are licensed under the MIT License unless a file says otherwise.

See:

- [Repository license](../LICENSE)
- [Package license](../packages/astro-discussion-bridge/LICENSE)
- [Third-party provenance](./THIRD_PARTY_PROVENANCE.json)
- package metadata: `packages/astro-discussion-bridge/package.json`

MIT requires preserving the copyright notice and license text in copies or substantial portions of the software. MIT does not require disclosure of which tools were used to create the work; the AI-assisted development note is a WebSynergetics transparency convention.

## AI-Assisted Development

This project uses human-directed, AI-assisted development.

Public posture:

- human/org owns and maintains the work
- AI assistance may be disclosed
- AI is not named as legal author, copyright holder, maintainer, or inventor
- code and docs should be reviewed before release
- tests, security checks, dependency review, and license review remain normal release responsibilities
- do not store secrets, credentials, private account values, or production operational details in public attribution notes

## Third-Party Names

This project integrates with and documents use of third-party projects and products. Their names belong to their respective owners.

- Astro is a project of its respective owners and contributors.
- Starlight is an Astro documentation theme/project of its respective owners and contributors.
- Discourse is a project and product of its respective owners and contributors.
- WordPress is referenced as an example of an existing publisher-to-Discourse integration pattern.
- Coding Horror is referenced as a public example of a publisher-to-Discourse publishing/discussion pattern.
- Starlog is referenced as an Astro example pattern for release-note style content.

DiscussionBridge is not affiliated with, sponsored by, endorsed by, or officially connected to Astro, Starlight, Discourse, WordPress, Coding Horror, or the Astro Starlog example unless a future written agreement says otherwise.

## References And Examples

Public examples are used as references for behavior and product shape. They are not copied assets.

When referencing third-party examples:

- link to the source
- describe the example as a reference
- avoid implying endorsement
- avoid copying substantial text, images, branding, or proprietary material
- prefer original DiscussionBridge examples for code and docs

## Demo And Example Content

Demo content in this repository is original project material unless a file says otherwise.

When adding new examples:

- keep example text original
- cite third-party sources when inspiration is specific
- avoid using real customer/private content
- avoid embedding third-party logos or screenshots unless usage rights are clear
- record media ownership and usage rights outside the public repo when a demo uses non-code media assets

## Release Checklist

Before Alpha release:

- run `npm run check:attribution` from `packages/astro-discussion-bridge`
- require an explicit Manual Boss `Attribution and Licensing: PASS / FAIL / N/A` result with reviewed paths
- preserve a sanitized review record for the exact release commit
- confirm every public docs page has appropriate attribution when it mentions third-party products or examples
- confirm root and package license files use the intended copyright holder
- confirm package metadata points to the MIT license
- confirm README support and attribution language is visible enough for users
- confirm no private credentials, private operational notes, or unsupported affiliation claims are present

After Alpha, repeat this pass only when ownership, dependencies, copied examples, source material, or public positioning changes.

A package-test or docs-build total is not, by itself, an attribution/licensing result. The automated gate checks objective repository, dependency, package, link, media-inventory, and protected-path conditions. Manual Boss reviews the semantic questions automation cannot settle: ownership, adequacy, source rights, trademark/affiliation wording, copied or adapted material, and public/private boundaries.

## Automated Gate Reporting

The full package suite includes the full attribution gate. A passing 73/73 run
therefore proves the objective package checks for that candidate: root/package
MIT parity and holder, package metadata, production dependency licenses against
the explicit allowlist or reviewed override evidence, required npm package
contents, README/non-affiliation and rendered links, tracked-media provenance,
and protected-path scanning.

The readable docs build runs only the bounded docs gate. Its required report is:

```text
Attribution and licensing gate: PASS (docs scope)
npm package contents: SKIPPED (requires built release candidate)
```

The 20 synchronized docs sources / 21 generated HTML pages count proves
synchronization and rendering plus that bounded docs-scope check. It does not
prove npm package contents and does not substitute for the full 73/73 package
gate.

Neither automated result is Manual Boss approval. Every exact release requires
a separate Manual Boss result written as `Attribution and Licensing: PASS /
FAIL / N/A`, the paths reviewed, and a sanitized review record tied to the
exact release commit. No Manual Boss PASS is recorded until that review occurs.
