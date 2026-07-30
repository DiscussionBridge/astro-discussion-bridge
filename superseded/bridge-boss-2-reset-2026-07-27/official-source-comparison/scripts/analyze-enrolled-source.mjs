import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { normalizeLegalText } from "../packages/astro-discussion-bridge/dist/official-source.js";
import {
  extractEnrolledSections,
  fetchJsonWithRetry,
  removeKnownPresentationArtifacts,
  stripMarkdownLinks,
  tokenDiff,
} from "./enrolled-source-lib.mjs";

const [enrolledPath, priorReportPath, outputPath] = process.argv.slice(2);
if (!enrolledPath || !priorReportPath || !outputPath) {
  throw new Error(
    "Usage: node scripts/analyze-enrolled-source.mjs ENROLLED PRIOR_REPORT OUTPUT",
  );
}

const [enrolledMarkup, priorReportText] = await Promise.all([
  fs.readFile(enrolledPath, "utf8"),
  fs.readFile(priorReportPath, "utf8"),
]);
const apiKey = requiredSecret(process.env.DISCOURSE_DIAGNOSTICS_API_KEY, "DISCOURSE_DIAGNOSTICS_API_KEY");
const apiUsername = requiredString(process.env.DISCOURSE_API_USERNAME, "DISCOURSE_API_USERNAME");
const trustedDiscourseUrl = trustedBaseUrl(
  requiredString(process.env.DISCOURSE_URL, "DISCOURSE_URL"),
);

const priorReport = JSON.parse(priorReportText);
validatePriorReport(priorReport);
if (trustedBaseUrl(priorReport.discourseUrl) !== trustedDiscourseUrl) {
  throw new Error("Prior report Discourse URL does not match trusted DISCOURSE_URL.");
}
const enrolledSections = extractEnrolledSections(enrolledMarkup);
const entries = [];
const sectionFilter = process.env.DISCUSSION_BRIDGE_ANALYZE_SECTION;
const priorEntries = sectionFilter
  ? priorReport.entries.filter((entry) => entry.sectionId === sectionFilter)
  : priorReport.entries;

for (const [index, prior] of priorEntries.entries()) {
  const enrolled = enrolledSections.get(prior.sectionId);
  if (!enrolled) {
    entries.push({ ...identity(prior), outcome: "unresolved", error: "Section not found in enrolled source." });
    continue;
  }
  const post = await fetchJsonWithRetry({
    url: new URL(`posts/${prior.postId}.json`, trustedDiscourseUrl).href,
    apiKey,
    apiUsername,
    fetch,
  });
  const community = post?.raw;
  if (typeof community !== "string") {
    entries.push({ ...identity(prior), outcome: "unresolved", error: "First-post raw text is unavailable." });
    continue;
  }

  const enrolledNormalized = normalizeLegalText(enrolled);
  const communityNormalized = normalizeLegalText(stripMarkdownLinks(community));
  const preparedCommunity = removeKnownPresentationArtifacts(
    communityNormalized,
    prior.label,
  );
  const comparedCommunity = preparedCommunity.text;
  const enrolledTokens = enrolledNormalized ? enrolledNormalized.split(" ") : [];
  const communityTokens = comparedCommunity ? comparedCommunity.split(" ") : [];
  const exact = enrolledNormalized === comparedCommunity;
  const presentationOnly = exact && preparedCommunity.artifacts.length > 0;
  const caseOnly = !exact && enrolledNormalized.toLocaleLowerCase("en-US")
    === comparedCommunity.toLocaleLowerCase("en-US");
  const diff = tokenDiff(enrolledTokens, communityTokens);
  if (process.env.DISCUSSION_BRIDGE_ANALYZE_DEBUG === "1") {
    process.stderr.write(`${JSON.stringify({
      sectionId: prior.sectionId,
      enrolledStart: enrolledNormalized.slice(0, 260),
      communityStart: comparedCommunity.slice(0, 260),
    })}\n`);
  }
  entries.push({
    ...identity(prior),
    outcome: presentationOnly
      ? "presentation-only"
      : exact
        ? "normalized-exact"
        : caseOnly
          ? "case-only"
          : "word-difference",
    ...(preparedCommunity.artifacts.length
      ? { presentationArtifacts: preparedCommunity.artifacts }
      : {}),
    enrolledCharacters: enrolledNormalized.length,
    communityCharacters: communityNormalized.length,
    characterDelta: communityNormalized.length - enrolledNormalized.length,
    enrolledTokens: enrolledTokens.length,
    communityTokens: communityTokens.length,
    communityHash: sha256(communityNormalized),
    postUpdatedAt: typeof post.updated_at === "string" ? post.updated_at : undefined,
    tokenDelta: communityTokens.length - enrolledTokens.length,
    tokenEdits: diff.edits,
    firstDifference: diff.firstDifference,
  });

  if ((index + 1) % 25 === 0) process.stderr.write(`Compared ${index + 1}/${priorEntries.length}\n`);
  await new Promise((resolve) => setTimeout(resolve, 350));
}

const summary = {
  total: entries.length,
  "normalized-exact": entries.filter((entry) => entry.outcome === "normalized-exact").length,
  "presentation-only": entries.filter((entry) => entry.outcome === "presentation-only").length,
  "case-only": entries.filter((entry) => entry.outcome === "case-only").length,
  "word-difference": entries.filter((entry) => entry.outcome === "word-difference").length,
  unresolved: entries.filter((entry) => entry.outcome === "unresolved").length,
};
const report = {
  version: 2,
  generatedAt: new Date().toISOString(),
  mode: "comparison-only",
  baseline: {
    stage: "enrolled-bill",
    measure: "H.R. 1, 119th Congress",
    sourceFile: path.basename(enrolledPath),
    sourceSha256: sha256(enrolledMarkup),
    priorReportSha256: sha256(priorReportText),
  },
  writes: { discourse: 0, astroContent: 0 },
  summary,
  entries,
};
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(summary)}\n`);

function identity(entry) {
  return {
    sectionId: entry.sectionId,
    label: entry.label,
    topicId: entry.topicId,
    sourceUrl: entry.sourceUrl,
  };
}

function validatePriorReport(value) {
  if (
    !value
    || ![1, 2].includes(value.version)
    || value.mode !== "comparison-only"
    || value.writes?.discourse !== 0
    || value.writes?.astroContent !== 0
    || !Array.isArray(value.entries)
  ) {
    throw new Error("Prior report is not a recognized zero-write comparison report.");
  }
  for (const entry of value.entries) {
    if (
      !entry
      || typeof entry.sectionId !== "string"
      || !Number.isInteger(entry.topicId)
      || !Number.isInteger(entry.postId)
      || typeof entry.label !== "string"
    ) {
      throw new Error("Prior report contains an invalid comparison entry.");
    }
  }
}

function trustedBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DISCOURSE_URL must be an absolute HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("DISCOURSE_URL must be HTTPS without credentials, query, or fragment.");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.href;
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function requiredSecret(value, label) {
  return requiredString(value, label);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
