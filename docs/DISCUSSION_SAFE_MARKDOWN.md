# Discussion-Safe Markdown Guide

DiscussionBridge syncs companion content to Discourse. Astro remains the rich publishing surface; Discourse receives Markdown that should invite conversation, survive quoting, render in email digests, and stay useful over time.

Use discussion-safe Markdown when an Astro page should be mirrored into the managed first post. Use `discussionSummary` when the Astro page uses features that should not be sent to Discourse as-is.

## Works Well By Default

These are good candidates for direct sync:

- headings
- paragraphs
- emphasis
- links
- blockquotes
- ordered and unordered lists
- inline code
- fenced code blocks
- basic Markdown tables when the target Discourse site supports tables
- public absolute image URLs
- plain video links when Discourse Onebox supports the host

Example:

```md
## Release Notes

This release improves publishing diagnostics and live sync behavior.

- Adds `check-discourse`
- Improves duplicate embed URL reconciliation
- Keeps Astro as the source of truth

See the [setup guide](https://docs.example.com/setup/) for details.
```

## Use `discussionSummary` For Rich Astro Pages

Use a curated summary when the Astro page includes:

- Starlight directives
- Astro components
- MDX JSX
- imported local assets
- image components
- custom cards, tabs, accordions, or callouts
- client-side charts
- interactive widgets
- Mermaid diagrams
- LaTeX or math notation
- embedded media or iframes
- page-local styles or scripts

Example:

```yaml
title: Understanding the Impact Model
discussionSummary: |
  This page explains the impact model and links to the published source page for charts, tables, and interactive details.

  Key discussion points:

  - whether the assumptions are clear
  - where the examples need more detail
  - which follow-up pages would help
```

`discussionSummary` should be reader-facing. Avoid implementation labels like `Source content:` or `This is a companion discussion topic for:`.

## Images

Prefer public absolute URLs in companion content.

Good:

```md
![Architecture diagram](https://docs.example.com/images/bridge-flow.png)
```

Risky:

```md
![Architecture diagram](../../assets/bridge-flow.png)
```

Local Astro image imports and optimized image components do not automatically become Discourse uploads. For Alpha, either use public absolute image URLs or summarize the visual in `discussionSummary`.

## Videos and Embeds

Use plain links when Discourse Onebox supports the host:

```md
https://www.youtube.com/watch?v=example
```

Avoid assuming arbitrary iframe embeds will render in Discourse. They depend on Discourse settings, allowed hosts, and site plugins.

## Mermaid and Math

Mermaid and math can work when the target Discourse site has matching support enabled. Do not assume they will work on every forum.

For portable companion content:

- include a short text summary
- link back to the Astro page for the full rendered diagram or equation
- use `discussionSummary` when the diagram is central and Discourse support is uncertain

## Tables

Tables are useful for policy, release, and technical pages, but long or wide tables can be unpleasant in forum posts and email digests.

For small tables, direct sync can work:

```md
| Setting | Recommended |
|---|---|
| Embed full app | yes |
| Embed any origin | no |
```

For large tables, use `discussionSummary` with a short explanation and link to the Astro page.

## Links Back to Astro

DiscussionBridge adds a source article link near the bottom of the managed first post. Page content can still include links when they are useful, but avoid repeating the page title and source URL at the top of every companion topic.

The Discourse topic title already carries the page title. The first post should start with useful content.

## Preflight Limits

Discourse authoring limits vary by site. Use local preflight settings to catch common failures before a live write:

```sh
npx astro-discussion-bridge publish-new src/content/docs \
  --title-min-length 15 \
  --max-topic-title-length 255 \
  --max-post-length 32000 \
  --max-tags-per-topic 5 \
  --max-tag-length 20 \
  --dry-run \
  --details
```

Equivalent environment variables:

- `DISCOURSE_TITLE_MIN_LENGTH`
- `DISCOURSE_MAX_TOPIC_TITLE_LENGTH`
- `DISCOURSE_MAX_POST_LENGTH`
- `DISCOURSE_MAX_TAGS_PER_TOPIC`
- `DISCOURSE_MAX_TAG_LENGTH`

## Practical Rule

If the Astro page is mostly Markdown, direct sync is usually fine.

If the Astro page is a designed experience, sync a curated `discussionSummary`.

The goal is not to flatten Astro into Discourse. The goal is to give Discourse enough clear, useful context to host the conversation.

