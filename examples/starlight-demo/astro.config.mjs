import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import discussionBridge from "astro-discussion-bridge";

export default defineConfig({
  site: "https://astrostarlightdemo.discussionbridge.dev",
  integrations: [
    starlight({
      title: "Discussion Bridge for Astro",
      components: {
        Footer: "./src/components/Footer.astro",
      },
      sidebar: [
        {
          label: "Demo",
          items: [
            { label: "Starlight Demo", slug: "" },
            { label: "Plain Markdown Demo", slug: "existing-md-page" },
          ],
        },
      ],
    }),
    discussionBridge({
      provider: "discourse",
      preset: "starlight",
      discourseUrl: "https://forum.discussionbridge.dev",
      siteUrl: "https://astrostarlightdemo.discussionbridge.dev",
      replies: {
        refreshEndpoint: "/api/discourse/topics/{topicId}.json",
      },
      publishOnBuild: {
        enabled: false,
        lanes: [
          {
            name: "docs",
            docsDir: "src/content/docs",
            categoryId: 5,
            tags: ["discussionbridge", "astro", "starlight-demo", "docs"],
          },
          {
            name: "releases",
            docsDir: "src/content/releases",
            routeBase: "releases",
            categoryId: 5,
            tags: ["discussionbridge", "astro", "starlight-demo", "releases"],
          },
          {
            name: "blog",
            docsDir: "src/content/blog",
            routeBase: "blog",
            categoryId: 5,
            tags: ["discussionbridge", "astro", "starlight-demo", "blog"],
          },
          {
            name: "news",
            docsDir: "src/content/news",
            routeBase: "news",
            categoryId: 5,
            tags: ["discussionbridge", "astro", "starlight-demo", "news"],
          },
        ],
      },
    }),
  ],
});
