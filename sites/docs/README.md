# DiscussionBridge Docs Site

This is the Starlight site for `docs.discussionbridge.dev`.

The editable source docs live in the repository-level `docs/` folder. The docs site generates Starlight content from those files before local dev and production builds.

## Local Commands

```powershell
npm run refresh-metadata
npm run sync-content
npm run build
npm run preview
```

Run `refresh-metadata` after editing any canonical file under `docs/`. It updates
the tracked `docs/DOCS_PAGE_METADATA.json` ledger. Normal builds verify each
source hash and fail instead of publishing a stale or shallow-clone-derived
date.

## Cloudflare Pages

Recommended project settings:

```text
Project name: docs-discussionbridge-dev
Repository: DiscussionBridge/astro-discussion-bridge
Production branch: main
Root directory: sites/docs
Build command: npm run build
Build output directory: dist
Custom domain: docs.discussionbridge.dev
```

After the custom domain is active, redirect the generated Pages hostname to the custom domain.

```text
https://docs-discussionbridge-dev.pages.dev -> https://docs.discussionbridge.dev
```

The docs site source is already deployed into this repository under `sites/docs`. The remaining launch work is Cloudflare Pages: create/configure the Pages project, attach the custom domain, confirm the latest production deploy is green, and verify the raw `pages.dev` hostname redirects to `docs.discussionbridge.dev`.

Use the Cloudflare redirect procedure in:

```text
C:\CodeProjects\Planning\Procedure Docs\procedures\cloudflare\cloudflare-pages-redirect-pages-dev-to-custom-domain.md
```
