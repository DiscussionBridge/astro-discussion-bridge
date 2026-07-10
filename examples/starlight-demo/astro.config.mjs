import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import discussionBridge from "astro-discussion-bridge";

export default defineConfig({
  site: "https://docs.example.com",
  integrations: [
    starlight({
      title: "DiscussionBridge Demo",
      components: {
        Footer: "./src/components/Footer.astro",
      },
      sidebar: [
        {
          label: "Demo",
          items: [
            { label: "Welcome", slug: "" },
            { label: "Existing MD Page", slug: "existing-md-page" },
          ],
        },
      ],
    }),
    discussionBridge({
      provider: "discourse",
      preset: "starlight",
      discourseUrl: "https://discourse.codinghorror.com",
      siteUrl: "https://docs.example.com",
      publishOnBuild: {
        enabled: false,
      },
    }),
  ],
});
