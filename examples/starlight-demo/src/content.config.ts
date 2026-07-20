import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

const companionTopicFields = z.object({
  discourseTopicId: z.union([z.string(), z.number()]).optional(),
  discourseTopicUrl: z.string().url().optional(),
  discussionEmbedUrl: z.string().url().optional(),
  discussionCommentsDisplay: z.enum(["simple", "full", "fullInteractive"]).optional(),
  discussionSync: z.boolean().optional(),
});

const lanePostSchema = companionTopicFields.extend({
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),
});

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: companionTopicFields.extend({
        discussionProvider: z.string().optional(),
        discussionId: z.union([z.string(), z.number()]).optional(),
        discussionUrl: z.string().url().optional(),
      }),
    }),
  }),
  releases: defineCollection({
    loader: glob({ base: "./src/content/releases", pattern: "**/*.md" }),
    schema: lanePostSchema.extend({
      versionNumber: z.string(),
    }),
  }),
  blog: defineCollection({
    loader: glob({ base: "./src/content/blog", pattern: "**/*.md" }),
    schema: lanePostSchema,
  }),
  news: defineCollection({
    loader: glob({ base: "./src/content/news", pattern: "**/*.md" }),
    schema: lanePostSchema,
  }),
  comments: defineCollection({
    loader: glob({ base: "./src/content/comments", pattern: "**/*.md" }),
    schema: lanePostSchema,
  }),
};
