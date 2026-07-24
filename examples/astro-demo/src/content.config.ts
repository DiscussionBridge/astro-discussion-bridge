import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const discussionFields = {
  contentLens: z.string().optional(),
  discourseTopicId: z.union([z.string(), z.number()]).optional(),
  discourseTopicUrl: z.string().url().optional(),
  discussionImportedFrom: z.string().url().optional(),
  discussionEmbedUrl: z.string().url().optional(),
  discussionCommentsDisplay: z.enum(["simple", "full", "fullInteractive"]).optional(),
  discussionSourceMode: z.enum(["astro-managed", "discourse-imported", "discourse-managed"]).optional(),
  discussionSourceTags: z.union([z.string(), z.array(z.string())]).optional(),
  discussionSourceAuthorUsername: z.string().optional(),
  discussionSourceAuthorName: z.string().optional(),
  discussionSourceCategoryId: z.number().int().positive().optional(),
  discussionSync: z.boolean().optional(),
  sectionId: z.string().optional(),
  officialText: z.union([
    z.string(),
    z.object({
      profile: z.literal("us-public-law"),
      law: z.string(),
      title: z.string().optional(),
      section: z.string(),
      label: z.string(),
      heading: z.string().optional(),
      citation: z.string(),
      congressUrl: z.string().url(),
      xmlUrl: z.string().url(),
      textUrl: z.string().url().optional(),
      pdfUrl: z.string().url().optional(),
      comparison: z.enum(["exact", "presentation-only", "substantive-difference"]),
      checkedAt: z.string(),
      sourceHash: z.string(),
      sourceFormat: z.enum(["uslm", "txt"]),
    }),
  ]).optional(),
};

const contentSchema = z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    ...discussionFields,
});

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.md" }),
  schema: contentSchema,
});

const importedFixtures = defineCollection({
  loader: glob({ base: "./src/content/fixtures", pattern: "**/*.md" }),
  schema: contentSchema,
});

export const collections = { blog, importedFixtures };
