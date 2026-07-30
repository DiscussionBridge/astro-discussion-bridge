# Presets And Placement

DiscussionBridge for Astro has one package and two primary preset stories:

```js
discussionBridge({
  preset: "starlight",
});

discussionBridge({
  preset: "astro",
});
```

The preset should choose sensible defaults. The site still chooses where the discussion appears.

## Starlight Preset

Use `preset: "starlight"` for Starlight documentation sites.

Starlight owns its own page model, routes, content schema, and component slots. For Starlight docs pages, the recommended placement is a Starlight `MarkdownContent` override that renders DiscussionBridge after the page body and before Starlight's real footer.

That keeps the discussion attached to the content, while the footer remains responsible for footer things such as pagination, edit links, and metadata.

Example:

```astro
---
import DefaultMarkdownContent from "@astrojs/starlight/components/MarkdownContent.astro";
import Discussion from "astro-discussion-bridge/Discussion.astro";

const entry = Astro.locals.starlightRoute.entry;
const topicId = entry.data.discourseTopicId;
const topicUrl = entry.data.discussionUrl ?? entry.data.discourseTopicUrl;
---

<DefaultMarkdownContent>
  <slot />
</DefaultMarkdownContent>
{topicUrl && <Discussion topicId={topicId} topicUrl={topicUrl} />}
```

Do not use Starlight's `Footer` override as the main comments hook. It works as a quick prototype, but it makes discussion rendering feel like global page chrome instead of page content.

## Astro Preset

Use `preset: "astro"` for normal Astro sites and content collections.

Astro core does not provide Starlight's `MarkdownContent` component. A plain Astro site should place `<Discussion />` in the page layout or route template that renders the content collection entry.

Example:

```astro
---
import Discussion from "astro-discussion-bridge/Discussion.astro";
---

<article>
  <slot />
</article>
<Discussion
  display={Astro.props.commentsDisplay}
  embedUrl={Astro.props.embedUrl}
  heading="Discussion"
  topicId={Astro.props.topicId}
  topicUrl={Astro.props.topicUrl}
/>
```

This is the same product model as Starlight: the article owns the reading experience, and the discussion appears after the content rather than inside global footer chrome.

## Content Lanes

Custom lanes such as blog, news, releases, or comments-mode demos can use ordinary Astro layouts even inside a Starlight site.

The demo uses:

- `MarkdownContent.astro` for Starlight docs pages.
- `LaneLayout.astro` for custom blog, news, releases, and comments pages.
- `BlogPost.astro` in the plain Astro demo.

This keeps the publishing model consistent while allowing each site framework or template to use its natural rendering hook.

## Alpha Rule

For Alpha, keep the rule simple:

- `preset: "starlight"` means Starlight-aware defaults and docs.
- `preset: "astro"` means Astro-core defaults and docs.
- Placement is explicit and belongs to the site template.
- Publishing and syncing remain CLI/config driven across both presets.
