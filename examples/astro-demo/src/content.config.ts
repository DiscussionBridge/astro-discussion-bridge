import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const discussionFields = {
  discourseTopicId: z.union([z.string(), z.number()]).optional(),
  discourseTopicUrl: z.string().url().optional(),
  discussionEmbedUrl: z.string().url().optional(),
  discussionCommentsDisplay: z.enum(["simple", "full", "fullInteractive"]).optional(),
  discussionSync: z.boolean().optional(),
};

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.md" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    ...discussionFields,
  }),
});

export const collections = { blog };
