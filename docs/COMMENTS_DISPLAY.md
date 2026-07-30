# Comments Display Guide

DiscussionBridge supports three comments display modes for Astro pages connected to Discourse topics:

- `simple`
- `full`
- `fullInteractive`

Choose the mode based on how much of the Discourse experience should appear inside the Astro page.

## Quick Choice

Use `simple` when you want the lightest Discourse embed and do not need rich metadata such as visible like counts.

Use `full` when you want Astro-rendered comments that look native to the site, show reply metadata, and refresh from Discourse on page load.

Use `fullInteractive` when logged-in Discourse interaction matters and you want Discourse's native composer, likes, replies, quotes, and moderation UI inside an iframe.

## Configure the Mode

```js
discussionBridge({
  provider: "discourse",
  discourseUrl: "https://forum.example.com",
  siteUrl: "https://docs.example.com",
  comments: {
    display: "full", // simple | full | fullInteractive
    embedHeight: "800px",
  },
});
```

Individual pages can override the configured default with frontmatter when a lane or page needs different behavior.

```yaml
discussionCommentsDisplay: fullInteractive
```

Pages can also render a discussion without managing the Discourse companion first post:

```yaml
discourseTopicId: 27
discourseTopicUrl: "https://forum.example.com/t/example-topic/27"
discussionCommentsDisplay: fullInteractive
discussionSync: false
```

Use that pattern for comparison pages, alternate presentations, or demos where one managed Astro page owns the Discourse first post and other pages only display the same live discussion.

## `simple`

`simple` uses Discourse's embeddable comments script. It is the most lightweight mode.

Best for:

- basic comment embeds
- sites that want Discourse to own most display details
- pages where visible like/reply metadata is not required
- low-maintenance setups

Tradeoffs:

- Discourse controls the rendered markup
- like counts and some topic action details may not appear
- styling control is limited
- logged-in behavior depends on Discourse embed behavior and site settings

## `full`

`full` renders Discourse replies through Astro. The page can fetch replies at build/render time and refresh them from Discourse on page load.

Best for:

- polished native-looking comments
- showing reply counts, like counts, usernames, dates, and reply relationships
- static pages that should still refresh comments in the browser
- sites that want the article and comments to feel like one designed page

Tradeoffs:

- Astro renders the display, so Discourse remains the source of truth for interaction
- replying, liking, quoting, moderation, and exact user action attribution still belong in the full Discourse topic
- browser refresh may need CORS or a same-origin proxy

Recommended configuration:

```js
discussionBridge({
  provider: "discourse",
  discourseUrl: "https://forum.example.com",
  comments: {
    display: "full",
  },
  replies: {
    refreshOnPageLoad: true,
    refreshEndpoint: "/api/discourse/topics/{topicId}.json",
  },
});
```

Without `refreshEndpoint`, browser refresh reads directly from `https://forum.example.com/t/{topicId}.json`. That requires the Discourse site to allow browser CORS from the Astro site. Static deployments can avoid CORS by adding a same-origin proxy route and pointing `refreshEndpoint` at it.

When Discourse is unavailable, `full` should keep the article shell intact and show a temporary unavailable state with an "Open the full discussion" link when the topic URL is available.

## `fullInteractive`

`fullInteractive` embeds Discourse's full app comments experience in an iframe. It uses Discourse for logged-in reply, like, quote, edit, and moderation behavior instead of reimplementing those actions in Astro.

Best for:

- logged-in community interaction
- Discourse-native composer and action buttons
- support/community pages where replies should happen in place
- same-site deployments such as `docs.example.com` and `forum.example.com`

Tradeoffs:

- requires Discourse full app embed settings
- iframe height and composer placement need real page testing
- sign-in behavior depends on cookie and same-site settings
- visual styling belongs mostly to Discourse

Discourse Mermaid is an official **theme component**, not a plugin:

- [Discourse Meta topic 218242](https://meta.discourse.org/t/discourse-mermaid/218242)
- [discourse/discourse-mermaid-theme-component](https://github.com/discourse/discourse-mermaid-theme-component)

Keep four possible paths distinct:

1. use the existing official theme component for supported normal-topic
   behavior;
2. fork or extend that theme component;
3. build the separate optional `DiscussionBridge for Discourse` plugin for
   bounded full-app embed context/table/Mermaid parity;
4. pursue an upstream Discourse change.

Never call the official theme component the “DiscussionBridge Mermaid plugin.”
The optional DiscussionBridge plugin is separate, and Tier 1 API-only operation
must remain fully functional without either extension.

Recommended Discourse settings:

- `Embed full app`: yes
- `Embed full app signin flow`: yes when the Astro site and Discourse forum are same-site, or when SameSite cookies support the iframe sign-in flow
- `Suppress third party analytics in embed`: yes when Astro owns analytics
- `Embed support markdown`: yes
- `Embed set canonical URL`: yes
- `Embed unlisted`: yes as the conservative Core Alpha discovery delay and
  forum-review convention; it is also useful for demo/test companion topics.
  Discourse may list an imported topic after its first reply, so this is not
  guaranteed manual approval. Enforceable manual approval requires the optional
  DiscussionBridge for Discourse workflow or a separately restricted category.
- `Embed any origin`: no unless explicitly needed
- `Embed topics list`: no unless intentionally embedding topic lists
- `Allowed embed selectors`: empty/default unless using Discourse's native page-scraping embed flow

Test `fullInteractive` on a page with enough article body to push comments below the first viewport. Short demo pages can make the fixed Discourse composer or sign-in button appear immediately, which can make the UX look different from a real article.

## DiscussionBridge Credit

DiscussionBridge renders one restrained credit after the complete discussion
surface in `simple`, `full`, and `fullInteractive`:

> Connected by [DiscussionBridge](https://discussionbridge.dev/)

The credit is enabled by default. Operators may disable it without disabling
comments or changing Discourse:

```js
discussionBridge({
  provider: "discourse",
  discourseUrl: "https://forum.example.com",
  comments: {
    credit: {
      enabled: true,
      prefix: "Connected by",
      label: "DiscussionBridge",
      href: "https://discussionbridge.dev/",
    },
  },
});
```

Set `enabled: false` to remove the credit completely. `prefix` and `label` are
plain text and are escaped by Astro. `href` must be an absolute HTTP(S) URL;
unsafe or malformed protocols fail during configuration.

Only the label is linked. The default presentation is centered, visually
secondary, and inherits the host site's small-text, muted-color, and accent
tokens. Hover and keyboard focus shift the linked label to the accent color and
grow a short underline beneath it. Reduced-motion preferences remove the
animation without removing the underline or focus indication.

Stable styling hooks are:

- `.discussion-bridge-credit`
- `.discussion-bridge-credit__prefix`
- `.discussion-bridge-credit__brand`
- `[data-discussion-bridge-credit]`

The DiscussionBridge credit and Discourse's `Powered by Discourse` control are
independent. DiscussionBridge does not query or mirror that Discourse setting.
In `fullInteractive`, the Bridge credit remains outside the cross-origin iframe.

## Support Notes

When reporting a comments issue, include:

- display mode
- Discourse topic URL
- Astro page URL
- whether the user is logged in to Discourse
- browser and device
- Discourse embed settings relevant to the mode
- whether comments update after a page refresh
