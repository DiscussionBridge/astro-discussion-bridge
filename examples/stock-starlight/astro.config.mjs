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
      ],
    }),
  ],
});
