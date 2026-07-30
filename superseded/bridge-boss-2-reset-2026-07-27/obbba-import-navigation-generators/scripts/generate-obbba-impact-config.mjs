import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const [navigationPath, outputPath] = process.argv.slice(2);
if (!navigationPath || !outputPath) {
  throw new Error("Usage: node scripts/generate-obbba-impact-config.mjs NAVIGATION_JSON OUTPUT_JSON");
}

const navigation = JSON.parse(await fs.readFile(path.resolve(navigationPath), "utf8"));
const lens = navigation.lenses?.find((candidate) => candidate.key === "impact");
if (!lens) throw new Error("Navigation manifest does not contain the impact lens.");

const nodes = [];
function collect(items) {
  for (const item of items ?? []) {
    if (item.kind === "section") nodes.push(item);
    collect(item.children);
  }
}
collect(lens.nodes);
if (!nodes.length) throw new Error("Impact lens contains no section topics.");

const placeholder = `What does this Sec (section) actually do?
How will it change day to day government processes?
Will it impact consumers? Businesses?

Please share how this section is impacting you, your family, your business, your district and/or your state by telling your story.

https://forum.repealobbba.org/c/stories/7

This post is a [wiki post](https://forum.repealobbba.org/t/wiki-post-editing-and-usage/445), please jump in or reply with your comments.`;

const normalizedContent = placeholder
  .replace(/\r\n?/g, "\n")
  .split("\n")
  .map((line) => line.replace(/[ \t]+$/g, ""))
  .join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const config = {
  version: 1,
  discourseUrl: navigation.discourseUrl,
  placeholder: {
    version: 1,
    normalizationVersion: "impact-placeholder-v1",
    sectionId: "82001",
    topicId: 1002,
    postId: 1009,
    topicUrl: "https://forum.repealobbba.org/t/sec-82001-loan-repayment-impact/1002",
    capturedAt: "2026-07-25T04:19:04.6433065Z",
    normalizedContent,
    normalizedContentSha256: createHash("sha256").update(normalizedContent).digest("hex"),
  },
  sources: nodes.map((node) => {
    const sectionId = node.label.match(/^\s*Sec\.\s+([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)\.?/i)?.[1];
    if (!sectionId) throw new Error(`Could not derive section ID from ${node.label}.`);
    return {
      sectionId,
      topicId: node.topicId,
      sourceUrl: node.sourceUrl,
      ...(node.url ? { existingAstroUrl: node.url } : {}),
    };
  }),
};

await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await fs.writeFile(path.resolve(outputPath), `${JSON.stringify(config, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
});
console.log(`Wrote ${config.sources.length} Impact sources to ${path.resolve(outputPath)}`);
