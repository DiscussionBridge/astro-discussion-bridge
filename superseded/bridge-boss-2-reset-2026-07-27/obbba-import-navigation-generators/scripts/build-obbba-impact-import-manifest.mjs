import { promises as fs } from "node:fs";
import path from "node:path";
import {
  validateApprovedReviewBytes,
  validateImpactReviewPacket,
} from "./obbba-impact-import-manifest-lib.mjs";

export const APPROVED_REVIEW_BYTES_SHA256 =
  "1e10d10ddb07c06c76627003745733f442fb554b1f9d7b968248a8b98f4579c0";

const [reviewPath, navigationPath, titleLanesPath, outputPath] = process.argv.slice(2);
if (!reviewPath || !navigationPath || !titleLanesPath || !outputPath) {
  throw new Error(
    "Usage: node scripts/build-obbba-impact-import-manifest.mjs REVIEW NAVIGATION TITLE_LANES OUTPUT",
  );
}

const [reviewBytes, navigation, titleLanes] = await Promise.all([
  fs.readFile(path.resolve(reviewPath)),
  readJson(navigationPath),
  readJson(titleLanesPath),
]);
const review = validateApprovedReviewBytes(reviewBytes, APPROVED_REVIEW_BYTES_SHA256);
validateImpactReviewPacket(review);

const impactLens = navigation?.lenses?.find((lens) => lens.key === "impact");
if (!impactLens) throw new Error("Navigation manifest does not contain the Impact lens.");

const navigationSections = new Map();
walk(impactLens.nodes, undefined, (node, titleNode) => {
  if (node.kind !== "section") return;
  if (!Number.isInteger(node.topicId) || navigationSections.has(node.topicId)) {
    throw new Error(`Navigation contains an invalid or duplicate Impact topic: ${node.topicId}.`);
  }
  navigationSections.set(node.topicId, { node, titleNode });
});

const titleTagByDirectory = new Map(
  titleLanes.map((lane) => [lane.directory.toLowerCase(), lane.tag]),
);
const imports = [];
for (const entry of review.entries) {
  if (entry.recommendation !== "publication-review-candidate" || entry.existingAstroUrl) continue;
  if (!/^[A-Za-z0-9.-]+$/.test(entry.sectionId)) {
    throw new Error(`Invalid reviewed section ID: ${entry.sectionId}.`);
  }
  if (!/^[a-f0-9]{64}$/.test(entry.communitySha256)) {
    throw new Error(`Invalid reviewed community digest for Section ${entry.sectionId}.`);
  }
  if (Number.isNaN(Date.parse(entry.postUpdatedAt))) {
    throw new Error(`Invalid reviewed update timestamp for Section ${entry.sectionId}.`);
  }

  const navigationEntry = navigationSections.get(entry.topicId);
  const node = navigationEntry?.node;
  if (!node || node.sourceUrl !== entry.sourceUrl) {
    throw new Error(`Navigation identity mismatch for Section ${entry.sectionId}.`);
  }
  const nodeSectionId = node.label.match(/^Sec\.\s+([A-Za-z0-9.-]+)\./)?.[1];
  if (nodeSectionId !== entry.sectionId) {
    throw new Error(`Navigation section mismatch for topic ${entry.topicId}.`);
  }

  const titleLabel = navigationEntry?.titleNode?.label.match(/^TITLE\s+([IVX]+)/)?.[1];
  const directory = titleLanes.find((lane) => lane.label.toUpperCase() === `TITLE ${titleLabel}`)?.directory;
  if (!directory) throw new Error(`Could not resolve the title lane for Section ${entry.sectionId}.`);
  let route;
  if (node.url) {
    const url = new URL(node.url);
    if (url.origin !== "https://onebigbeautifulbill.us") {
      throw new Error(`Unexpected Impact destination authority for Section ${entry.sectionId}.`);
    }
    route = decodeURIComponent(url.pathname).replace(/^\/|\/$/g, "");
  } else {
    const slug = slugify(node.label);
    route = `${directory}/${slug.endsWith("-impact") ? slug : `${slug}-impact`}`;
  }
  const [routeDirectory] = route.split("/");
  const requiredTitleTag = titleTagByDirectory.get(routeDirectory.toLowerCase());
  if (!requiredTitleTag || !route.endsWith("-impact")) {
    throw new Error(`Could not bind the title lane and Impact route for Section ${entry.sectionId}.`);
  }

  imports.push({
    topic: entry.topicId,
    output: `${route}.md`,
    sourceMode: "discourse-imported",
    commentsDisplay: "fullInteractive",
    heroImage: "../../../assets/obbbanotso.png",
    heroAlt: "One Big (not so) Beautiful Bill over the U.S. Capitol",
    pruneProfiles: ["community-call-to-action"],
    requiredTags: [requiredTitleTag],
    sectionId: entry.sectionId,
    contentLens: "impact",
    expectedCommunitySha256: entry.communitySha256,
    expectedPostUpdatedAt: entry.postUpdatedAt,
  });
}

if (imports.length !== 120) {
  throw new Error(`Expected exactly 120 missing approved Impact pages; found ${imports.length}.`);
}
if (new Set(imports.map((entry) => entry.topic)).size !== imports.length) {
  throw new Error("Generated Impact import manifest contains duplicate topics.");
}
if (new Set(imports.map((entry) => entry.output.toLowerCase())).size !== imports.length) {
  throw new Error("Generated Impact import manifest contains duplicate output paths.");
}

const output = `${JSON.stringify({ version: 2, imports }, null, 2)}\n`;
await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await fs.writeFile(outputPath, output, { encoding: "utf8", flag: "wx" });
process.stdout.write(`Created hash-bound Impact import manifest with ${imports.length} entries: ${path.resolve(outputPath)}\n`);

function walk(nodes, titleNode, visit) {
  for (const node of nodes ?? []) {
    const currentTitle = node.kind === "title" ? node : titleNode;
    visit(node, currentTitle);
    walk(node.children, currentTitle, visit);
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "imported-discourse-topic";
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
}
