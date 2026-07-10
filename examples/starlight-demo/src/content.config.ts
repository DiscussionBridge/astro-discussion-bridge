import { defineCollection, z } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        discussionProvider: z.string().optional(),
        discussionId: z.union([z.string(), z.number()]).optional(),
        discussionUrl: z.string().url().optional(),
        discourseTopicId: z.union([z.string(), z.number()]).optional(),
        discourseTopicUrl: z.string().url().optional(),
      }),
    }),
  }),
};
