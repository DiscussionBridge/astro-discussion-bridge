import { promises as fs } from "node:fs";
import path from "node:path";

const [siteRootArg, currentArg, candidateArg] = process.argv.slice(2);
if (!siteRootArg || !currentArg || !candidateArg) {
  throw new Error("Usage: node scripts/verify-obbba-navigation-acceptance.mjs SITE_ROOT CURRENT CANDIDATE");
}

const siteRoot = path.resolve(siteRootArg);
const docsRoot = path.join(siteRoot, "src", "content", "docs");
const distRoot = path.join(siteRoot, "dist", "client");
const [current, candidate] = await Promise.all([
  readJson(currentArg),
  readJson(candidateArg),
]);

const currentLenses = new Map(current.lenses.map((lens) => [lens.key, lens]));
const candidateLenses = new Map(candidate.lenses.map((lens) => [lens.key, lens]));
const expectedCounts = new Map([["obbba-text", 307], ["impact", 135]]);
const content = await contentBindings(docsRoot);
const seenUrls = new Set();
let total = 0;

for (const [lensKey, expectedCount] of expectedCounts) {
  const prior = currentLenses.get(lensKey);
  const next = candidateLenses.get(lensKey);
  if (!prior || !next) throw new Error(`Missing navigation lens: ${lensKey}.`);
  if (JSON.stringify(authorityTree(prior.nodes)) !== JSON.stringify(authorityTree(next.nodes))) {
    throw new Error(`${lensKey} source hierarchy changed outside the content-route overlay.`);
  }
  const sections = [];
  walk(next.nodes, (node) => {
    if (node.kind === "section") sections.push(node);
  });
  if (sections.length !== 307) throw new Error(`${lensKey} must retain 307 source sections.`);
  const bound = sections.filter((node) => node.url);
  if (bound.length !== expectedCount) {
    throw new Error(`${lensKey} expected ${expectedCount} local bindings; found ${bound.length}.`);
  }
  for (const node of bound) {
    const url = new URL(node.url);
    if (
      url.origin !== "https://onebigbeautifulbill.us"
      || /%20/i.test(url.href)
      || seenUrls.has(url.href)
    ) {
      throw new Error(`Invalid, cross-lens, duplicate, or non-site navigation URL: ${url.href}`);
    }
    seenUrls.add(url.href);
    const binding = content.get(`${lensKey}:${node.topicId}`);
    if (
      !binding
      || binding.sectionId !== sectionId(node)
      || binding.url !== url.href
    ) {
      throw new Error(`Content identity mismatch for ${lensKey} topic ${node.topicId}.`);
    }
    const htmlPath = path.join(distRoot, ...url.pathname.split("/").filter(Boolean), "index.html");
    if (!await exists(htmlPath)) {
      throw new Error(`Generated HTML is missing for ${url.href}.`);
    }
    total += 1;
  }
}

if (total !== 442 || seenUrls.size !== 442) {
  throw new Error(`Expected 442 unique generated navigation routes; found ${total}.`);
}
process.stdout.write(
  "Navigation acceptance PASS: OBBBA Text 307, Impact 135, total 442; " +
  "all local identities and generated HTML routes verified.\n",
);

function authorityTree(nodes) {
  return nodes.map((node) => ({
    kind: node.kind,
    label: node.label,
    topicId: node.topicId,
    sourceUrl: node.sourceUrl,
    children: authorityTree(node.children ?? []),
  }));
}

function walk(nodes, visit) {
  for (const node of nodes ?? []) {
    visit(node);
    walk(node.children, visit);
  }
}

function sectionId(node) {
  return node.label.match(/^Sec\.\s+([A-Za-z0-9.-]+)\./)?.[1];
}

async function contentBindings(root) {
  const files = await recursiveFiles(root);
  const bindings = new Map();
  for (const file of files.filter((candidate) => /\.(?:md|mdx)$/i.test(candidate))) {
    const source = await fs.readFile(file, "utf8");
    const frontmatter = source.match(/^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    if (!frontmatter) continue;
    const lens = field(frontmatter, "contentLens");
    const topic = Number(field(frontmatter, "discourseTopicId"));
    const section = field(frontmatter, "sectionId");
    if (!expectedCounts.has(lens) || !Number.isInteger(topic) || !section) continue;
    const relative = path.relative(root, file).replace(/\\/g, "/").replace(/\.(?:md|mdx)$/i, "");
    const sourcePathname = relative.endsWith("/index") ? relative.slice(0, -6) : relative;
    const pathname = sourcePathname.split("/").map((segment) => segment.replace(/ +/g, "-")).join("/");
    const url = `https://onebigbeautifulbill.us/${pathname}/`;
    const key = `${lens}:${topic}`;
    if (bindings.has(key)) throw new Error(`Duplicate local content identity: ${key}.`);
    bindings.set(key, { sectionId: section, url });
  }
  return bindings;
}

function field(frontmatter, name) {
  const value = frontmatter.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, "m"))?.[1]?.trim();
  if (!value) return undefined;
  if (value.startsWith("\"") && value.endsWith("\"")) return JSON.parse(value);
  return value;
}

async function recursiveFiles(root) {
  const output = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const resolved = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await recursiveFiles(resolved));
    else if (entry.isFile()) output.push(resolved);
  }
  return output;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
