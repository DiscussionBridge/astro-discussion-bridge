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
      publishOnBuild: {
        enabled: false,
      },
    }),
  ],
});
