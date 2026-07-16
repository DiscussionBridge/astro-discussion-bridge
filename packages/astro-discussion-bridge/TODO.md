# TODO

## Dependency Audit

- Review the 4 dependency advisories reported by `npm install --package-lock-only`.
- Run `npm audit` and identify which packages introduce the advisories.
- Prefer targeted dependency upgrades where possible.
- Avoid `npm audit fix --force` unless the breaking-change impact has been reviewed.
- Re-run `npm run check` and `npm run build` after any dependency changes.
## Publish Validation

- Add preflight validation for Discourse topic titles before live publishing.
- Warn or fail before creating any topics when a page title may be rejected by Discourse title rules, such as titles shorter than the target instance minimum.
- Consider a configurable title template or prefix, such as `Discussion: {title}`, for sites with short page titles.
## Sync Validation

- Add tests around `sync-existing` and `publish-and-sync` before widening usage beyond the demo.
- Add stronger MDX summary extraction for component-heavy pages.
- Consider a user-configurable summary source, such as `discussionSummary` frontmatter.
## Upgrade Process

- Maintain an Astro compatibility matrix for Astro 6 and 7. Treat Astro 5 as possible future legacy support only after explicit testing.
- Test demo installs after Astro core and official integration releases, especially `@astrojs/cloudflare`.
- Add a `doctor` or `check-upgrade` command that reports installed Astro, adapter, preset, and provider versions.
- Document the recommended order: upgrade Astro official packages first, then verify DiscussionBridge.
- Keep Starlight optional so Astro core sites are not forced to install it.
## Internal Demo Matrix

- Demo multiple Astro sites connected to the same Discourse instance.
- Verify Discourse external host/embed settings with more than one Astro hostname.
- Test topic creation so pages from different Astro sites do not collide or create confusing duplicate topics.
- Document recommended namespace strategy: `forum.discussionbridge.dev`, category `Alpha`, and tags such as `discussionbridge`, `starlight-demo`, and `cloudflare-demo`.
- Confirm `embed_url` maps each Astro page to the correct companion topic across hosts.
## Future Frameworks and Platforms

- Prioritize future framework integrations for Discourse.
- Research future Discourse integrations for Next.js, Nuxt, SvelteKit, Hugo/static sites, and Cloudflare Workers.
- Design metadata so Discourse-specific fields can coexist with generic discussion fields without breaking existing Discourse users.
