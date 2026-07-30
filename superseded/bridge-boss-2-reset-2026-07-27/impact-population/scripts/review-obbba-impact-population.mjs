import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateImpactPopulationDryRunReport } from "../packages/astro-discussion-bridge/dist/impact-population.js";

const EXPECTED_AUTHORITY = new URL("https://forum.repealobbba.org");
const EDITORIAL_PATTERNS = [
  ["replace-instruction", /\breplace (?:the|this) .{0,120}\bwith (?:the|this)\b/i],
  ["todo", /\bTODO\b/],
  ["tbd", /\bTBD\b/],
  ["citation-needed", /\[(?:citation needed|cite)\]/i],
  ["draft-marker", /(?:^|\n)\s{0,3}(?:>\s*)?(?:[*_]{1,2})?(?:draft note|editor(?:ial)? note|needs editing)\b/im],
];
const PLACEHOLDER_PATTERNS = [
  ["placeholder-question", /What does this Sec \(section\) actually do\?/i],
  ["placeholder-process-question", /How will it change day to day government processes\?/i],
  ["placeholder-consumer-question", /Will it impact consumers\? Businesses\?/i],
  ["placeholder-story-invitation", /Please share how this section is impacting you, your family, your business/i],
];

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeImpactContent(value) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseAtxHeadings(value) {
  const headings = [];
  let fence;
  for (const line of value.split("\n")) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) {
        fence = { character: marker[0], length: marker.length };
      } else if (
        marker[0] === fence.character
        && marker.length >= fence.length
        && new RegExp(`^\\s{0,3}${fence.character === "`" ? "`" : "~"}{${fence.length},}\\s*$`).test(line)
      ) {
        fence = undefined;
      }
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^\s{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/)?.[1];
    if (heading) headings.push(heading);
  }
  return headings
    .map((heading) => heading
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase());
}

export function assessImpactContent(rawContent, sectionId) {
  if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*$/.test(sectionId)) {
    throw new Error("Impact review sectionId is invalid.");
  }
  const normalizedRaw = normalizeImpactContent(rawContent);
  const headings = parseAtxHeadings(normalizedRaw);
  const normalizedSectionId = sectionId.toLowerCase();
  const headingRequirements = [
    ["section identity", (heading) => (
      heading === `section ${normalizedSectionId}`
      || heading.startsWith(`section ${normalizedSectionId}:`)
      || heading.startsWith(`section ${normalizedSectionId} -`)
    )],
    ["executive summary", (heading) => (
      heading === "executive summary" || heading === "plain-english summary"
    )],
    ["what section", (heading) => (
      heading === `what section ${normalizedSectionId} actually does`
      || heading === "what this section actually does"
    )],
    ["day-to-day government process changes", (heading) => (
      heading === "day-to-day government process changes"
    )],
    ["effects on consumers", (heading) => (
      heading === "effects on consumers" || heading === "consumer impact"
    )],
    ["effects on businesses", (heading) => (
      heading === "effects on businesses" || heading === "business and local economic impact"
    )],
    ["environmental and climate impact", (heading) => (
      heading === "environmental and climate impact"
    )],
    ["impact summary", (heading) => (
      heading === "impact summary" || heading === "practical bottom line"
    )],
    ["key references and sourcing", (heading) => (
      heading === "key references and sourcing"
    )],
  ];
  const missingHeadings = headingRequirements
    .filter(([, matches]) => !headings.some(matches))
    .map(([label]) => label);
  const flags = [
    ...PLACEHOLDER_PATTERNS
      .filter(([, pattern]) => pattern.test(normalizedRaw))
      .map(([name]) => name),
    ...EDITORIAL_PATTERNS
      .filter(([, pattern]) => pattern.test(normalizedRaw))
      .map(([name]) => name),
  ];
  const words = normalizedRaw ? normalizedRaw.split(/\s+/u).length : 0;
  if (words < 500) flags.push("short-content");
  if (missingHeadings.length) flags.push("missing-standard-headings");
  const uniqueFlags = [...new Set(flags)].sort();
  return {
    normalizedRaw,
    metrics: {
      characters: normalizedRaw.length,
      words,
      headings: headings.length,
      markdownLinks: (normalizedRaw.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g) ?? []).length,
    },
    flags: uniqueFlags,
    missingHeadings,
    recommendation: uniqueFlags.length
      ? "manual-cleanup-review"
      : "publication-review-candidate",
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function releaseResponseBody(response, delayFn = delay) {
  try {
    if (response.body) await Promise.race([response.body.cancel(), delayFn(50)]);
  } catch {
    // Custom response bodies cannot make bounded cleanup hang or mask the response.
  }
}

function boundedRetryMilliseconds(value) {
  return Math.min(60_000, Math.max(250, Math.ceil(value)));
}

export async function retryAfterMilliseconds(response, options = {}) {
  const now = options.now ?? Date.now;
  const delayFn = options.delayFn ?? delay;
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return boundedRetryMilliseconds(seconds * 1_000);
    }
    const date = Date.parse(value);
    if (!Number.isNaN(date)) return boundedRetryMilliseconds(date - now());
  }
  try {
    const body = await Promise.race([
      response.clone().json(),
      delayFn(100).then(() => undefined),
    ]);
    const waitSeconds = Number(body?.extras?.wait_seconds);
    if (Number.isFinite(waitSeconds) && waitSeconds >= 0) {
      return boundedRetryMilliseconds(waitSeconds * 1_000);
    }
  } catch {
    // Malformed/custom bodies fall back to one bounded second.
  }
  return 1_000;
}

export async function readPublicPost(postId, options = {}) {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const delayFn = options.delayFn ?? delay;
  const onRateLimit = options.onRateLimit ?? (() => {});
  const url = new URL(`/posts/${postId}.json`, EXPECTED_AUTHORITY);
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    const response = await fetchFn(url, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json" },
    });
    if (response.status >= 300 && response.status < 400) {
      await releaseResponseBody(response, delayFn);
      throw new Error(`Redirect blocked while reading public post ${postId}.`);
    }
    if (response.status === 429 && attempt < 3) {
      const waitMilliseconds = await retryAfterMilliseconds(response, {
        now: options.now,
        delayFn,
      });
      onRateLimit(waitMilliseconds, attempt + 1);
      await releaseResponseBody(response, delayFn);
      await delayFn(waitMilliseconds);
      continue;
    }
    if (!response.ok) {
      const status = response.status;
      await releaseResponseBody(response, delayFn);
      throw new Error(`Public post ${postId} read failed with HTTP ${status}.`);
    }
    return response.json();
  }
  throw new Error(`Public post ${postId} exceeded the bounded retry budget.`);
}

export async function buildImpactPublicationReview(input) {
  const populationReport = JSON.parse(input.populationReportBytes);
  validateImpactPopulationDryRunReport(populationReport);
  const reviewEntries = populationReport.entries.filter(
    (entry) => entry.outcome === "review-required",
  );
  const entries = [];
  for (const [index, entry] of reviewEntries.entries()) {
    const post = await input.readPost(entry.postId);
    if (
      post.id !== entry.postId
      || post.topic_id !== entry.topicId
      || post.post_number !== 1
      || typeof post.raw !== "string"
    ) {
      throw new Error(`Public post identity mismatch for section ${entry.sectionId}.`);
    }
    const assessment = assessImpactContent(post.raw, entry.sectionId);
    const liveSha256 = sha256(assessment.normalizedRaw);
    if (liveSha256 !== entry.communitySha256) {
      throw new Error(`Live source drift detected for section ${entry.sectionId}.`);
    }
    entries.push({
      sectionId: entry.sectionId,
      topicId: entry.topicId,
      postId: entry.postId,
      sourceUrl: entry.sourceUrl,
      communitySha256: entry.communitySha256,
      postUpdatedAt: entry.postUpdatedAt,
      existingAstroUrl: entry.existingAstroUrl,
      metrics: assessment.metrics,
      flags: assessment.flags,
      missingHeadings: assessment.missingHeadings,
      recommendation: assessment.recommendation,
    });
    input.onProgress?.(index + 1, reviewEntries.length, entry);
  }
  return {
    version: 1,
    generatedAt: (input.now ?? (() => new Date()))().toISOString(),
    mode: "impact-publication-review",
    sourcePopulationReport: path.resolve(input.populationReportPath),
    inputs: {
      populationReportBytesSha256: sha256(input.populationReportBytes),
      reviewedEntries: reviewEntries.length,
    },
    writes: { discourse: 0, astroContent: 0 },
    summary: {
      total: entries.length,
      publicationReviewCandidate: entries.filter(
        (entry) => entry.recommendation === "publication-review-candidate",
      ).length,
      manualCleanupReview: entries.filter(
        (entry) => entry.recommendation === "manual-cleanup-review",
      ).length,
      existingAstroPages: entries.filter((entry) => entry.existingAstroUrl).length,
    },
    entries,
  };
}

export async function writeCreateOnlyJson(outputPath, report) {
  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

async function main() {
  const [populationReportPath, outputPath] = process.argv.slice(2);
  if (!populationReportPath || !outputPath) {
    throw new Error(
      "Usage: node scripts/review-obbba-impact-population.mjs POPULATION_REPORT_JSON OUTPUT_JSON",
    );
  }
  const populationReportBytes = await fs.readFile(
    path.resolve(populationReportPath),
    "utf8",
  );
  const report = await buildImpactPublicationReview({
    populationReportBytes,
    populationReportPath,
    readPost: (postId) => readPublicPost(postId, {
      onRateLimit: (waitMilliseconds, attempt) => console.log(
        `Rate limited; waiting ${Math.ceil(waitMilliseconds / 1_000)}s (retry ${attempt}/3).`,
      ),
    }),
    onProgress: (completed, total, entry) => console.log(
      `Reviewed ${completed}/${total}: Section ${entry.sectionId}, topic ${entry.topicId}.`,
    ),
  });
  await writeCreateOnlyJson(outputPath, report);
  console.log(
    `Impact review: candidates ${report.summary.publicationReviewCandidate}, `
      + `manual-cleanup ${report.summary.manualCleanupReview}.`,
  );
  console.log(`Report written: ${path.resolve(outputPath)}`);
  console.log("No Discourse topics or Astro content files were changed.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
