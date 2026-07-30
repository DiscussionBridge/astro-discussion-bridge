import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://stockstarlight.demo.discussionbridge.dev",
  integrations: [
    starlight({
      title: "Stock Starlight Control",
      sidebar: [
        {
          label: "Stock Starlight",
          items: [{ label: "Home", slug: "index" }],
        },
        {
          label: "DiscussionBridge",
          items: [
            { label: "Demo hub", link: "https://demo.discussionbridge.dev/" },
            { label: "DiscussionBridge.dev", link: "https://discussionbridge.dev/" },
          ],
        },
      ],
    }),
  ],
});
