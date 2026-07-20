import { defineConfig } from "astro/config";
import discussionBridge from "astro-discussion-bridge";

export default defineConfig({
  site: "https://astro.demo.discussionbridge.dev",
  integrations: [
    discussionBridge({
      provider: "discourse",
      preset: "astro",
      discourseUrl: "https://forum.discussionbridge.dev",
      siteUrl: "https://astro.demo.discussionbridge.dev",
      comments: {
        display: "simple",
      },
      replies: {
        refreshEndpoint: "/api/discourse/topics/{topicId}.json",
      },
      publishOnBuild: {
        enabled: false,
        lanes: [
          {
            name: "blog",
            docsDir: "src/content/blog",
            routeBase: "blog",
            categoryId: 5,
            tags: ["discussionbridge", "astro", "astro-demo", "blog"],
          },
        ],
      },
    }),
  ],
});
