# TODO

## Dependency Audit

- Review the 4 dependency advisories reported by `npm install --package-lock-only`.
- Run `npm audit` and identify which packages introduce the advisories.
- Prefer targeted dependency upgrades where possible.
- Avoid `npm audit fix --force` unless the breaking-change impact has been reviewed.
- Re-run `npm run check` and `npm run build` after any dependency changes.
## Publish Validation

- Consider a configurable title template or prefix, such as `Discussion: {title}`, for sites with short page titles.
- Consider reading Discourse title constraints from the target instance when authenticated, while keeping local validation available for dry runs.
- Handle Discourse `Embed url has already been taken` by detecting or reconciling the existing topic when Discourse embedding created it before CLI publishing.
## Sync Validation

- Expand tests around `sync-existing` and `publish-and-sync` edge cases before widening usage beyond the demo.
- Add stronger MDX summary extraction for component-heavy pages.
- Consider a user-configurable summary source, such as `discussionSummary` frontmatter.
## Upgrade Process

- Maintain an Astro compatibility matrix for Astro 6 and 7. Treat Astro 5 as possible future legacy support only after explicit testing.
- Test demo installs after Astro core and official integration releases, especially `@astrojs/cloudflare`.
- Add a `doctor` or `check-upgrade` command that reports installed Astro, adapter, preset, and provider versions.
- Document the recommended order: upgrade Astro official packages first, then verify DiscussionBridge.
- Keep Starlight optional so Astro core sites are not forced to install it.
## Internal Demo Matrix

- Add a Starlog-style release lane demo using `src/content/releases`.
- Test one Astro/Starlight site mapping docs, releases, blog, news, changelog, or other source paths to different Discourse categories and tags.
- Demo multiple Astro sites connected to the same Discourse instance.
- Verify Discourse external host/embed settings with more than one Astro hostname.
- Test topic creation so pages from different Astro sites do not collide or create confusing duplicate topics.
- Document recommended namespace strategy: `forum.discussionbridge.dev`, category `Alpha`, and tags such as `discussionbridge`, `starlight-demo`, and `cloudflare-demo`.
- Confirm `embed_url` maps each Astro page to the correct companion topic across hosts.
## Optional Discourse Plugin

- Start a design note for an optional Discourse plugin as the Layer 3 control plane.
- Keep the API-only bridge useful without a plugin; the plugin should enhance, not replace, the package.
- Explore bridge-aware admin settings, content lane management, source mappings, duplicate detection, richer native notifications, health/status endpoints, and operations topics/categories.
- Design the plugin surface so Astro, Statamic, and future adapters can use the same Discourse-side concepts.
## Future Frameworks and Platforms

- Prioritize future framework integrations for Discourse.
- Use Discussion Bridge for Statamic as the next parallel naming/integration lane when that work begins.
- Research future Discourse integrations for Next.js, Nuxt, SvelteKit, Hugo/static sites, and Cloudflare Workers.
- Design metadata so Discourse-specific fields can coexist with generic discussion fields without breaking existing Discourse users.
