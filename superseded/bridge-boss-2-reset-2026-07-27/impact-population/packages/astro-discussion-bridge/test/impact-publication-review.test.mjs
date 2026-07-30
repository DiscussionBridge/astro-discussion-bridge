import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildImpactPopulationDryRun,
  createImpactPlaceholderSnapshot,
} from "../dist/impact-population.js";
import {
  assessImpactContent,
  buildImpactPublicationReview,
  readPublicPost,
  releaseResponseBody,
  retryAfterMilliseconds,
  writeCreateOnlyJson,
} from "../../../scripts/review-obbba-impact-population.mjs";

const placeholderRaw = "Canonical placeholder.";
const developedRaw = `# Legislative and Policy Analysis

## Section 10101

### Executive Summary

${"Developed analysis. ".repeat(520)}

### What Section 10101 Actually Does

Developed mechanism.

### Day-to-Day Government Process Changes

Developed process.

### Effects on Consumers

Developed consumer effects.

### Effects on Businesses

Developed business effects.

### Environmental and Climate Impact

Developed environmental effects.

### Impact Summary

Developed summary.

### Key References and Sourcing

[Primary source](https://example.com/primary).`;

function populationReport(rawContent = developedRaw) {
  const placeholder = createImpactPlaceholderSnapshot({
    sectionId: "82001",
    topicId: 1002,
    postId: 1009,
    topicUrl: "https://forum.repealobbba.org/t/1002",
    capturedAt: "2026-07-25T00:00:00.000Z",
    rawContent: placeholderRaw,
  });
  return buildImpactPopulationDryRun({
    placeholder,
    generatedAt: "2026-07-25T01:00:00.000Z",
    candidates: [{
      sectionId: "10101",
      topicId: 434,
      postId: 441,
      sourceUrl: "https://forum.repealobbba.org/t/434",
      rawContent,
    }],
  });
}

test("review classifies real ATX headings and never serializes raw content", async () => {
  const source = populationReport();
  const report = await buildImpactPublicationReview({
    populationReportBytes: JSON.stringify(source),
    populationReportPath: "population.json",
    readPost: async () => ({
      id: 441,
      topic_id: 434,
      post_number: 1,
      raw: developedRaw,
    }),
    now: () => new Date("2026-07-25T02:00:00.000Z"),
  });
  assert.equal(report.summary.publicationReviewCandidate, 1);
  assert.equal(report.summary.manualCleanupReview, 0);
  assert.equal(report.inputs.reviewedEntries, 1);
  assert.doesNotMatch(JSON.stringify(report), /Developed analysis/);
});

test("heading names in prose do not satisfy missing Markdown headings", () => {
  const prose = `${"Words ".repeat(520)}
Executive Summary and Effects on Consumers are discussed here.
What Section 10101 Actually Does is also merely prose.`;
  const assessment = assessImpactContent(prose, "10101");
  assert.equal(assessment.recommendation, "manual-cleanup-review");
  assert.ok(assessment.flags.includes("missing-standard-headings"));
  assert.ok(assessment.missingHeadings.includes("executive summary"));
});

test("wrong-section and fenced heading examples cannot satisfy required structure", () => {
  const wrongSection = assessImpactContent(
    developedRaw.replace(
      "### What Section 10101 Actually Does",
      "### What Section 999 Actually Does",
    ),
    "10101",
  );
  assert.equal(wrongSection.recommendation, "manual-cleanup-review");
  assert.ok(wrongSection.missingHeadings.includes("what section"));

  const fenced = assessImpactContent(
    developedRaw.replace(
      "### What Section 10101 Actually Does",
      "```markdown\n### What Section 10101 Actually Does\n```",
    ),
    "10101",
  );
  assert.equal(fenced.recommendation, "manual-cleanup-review");
  assert.ok(fenced.missingHeadings.includes("what section"));
});

test("safe legacy heading aliases pass only with the matching section identity", () => {
  const legacy = developedRaw
    .replace("### Executive Summary", "### Plain-English Summary")
    .replace("### What Section 10101 Actually Does", "### What This Section Actually Does")
    .replace("### Effects on Consumers", "### Consumer Impact")
    .replace("### Effects on Businesses", "### Business and Local Economic Impact")
    .replace("### Impact Summary", "### Practical Bottom Line");
  assert.equal(
    assessImpactContent(legacy, "10101").recommendation,
    "publication-review-candidate",
  );
  const wrongIdentity = legacy.replace("## Section 10101", "## Section 999");
  assert.ok(
    assessImpactContent(wrongIdentity, "10101").missingHeadings.includes("section identity"),
  );
});

test("editorial-note prose in a reference description is not a draft marker", () => {
  const cited = `${developedRaw}

The source contains an editorial note identifying the statutory amendment.`;
  assert.ok(!assessImpactContent(cited, "10101").flags.includes("draft-marker"));
  assert.ok(
    assessImpactContent(`${developedRaw}\n\nEditorial note: revise this.`, "10101")
      .flags.includes("draft-marker"),
  );
});

test("strict population validation rejects tampering before any post read", async () => {
  const source = populationReport();
  source.summary.total = 99;
  let reads = 0;
  await assert.rejects(
    () => buildImpactPublicationReview({
      populationReportBytes: JSON.stringify(source),
      populationReportPath: "population.json",
      readPost: async () => {
        reads += 1;
        throw new Error("must not run");
      },
    }),
    /summary is inconsistent/,
  );
  assert.equal(reads, 0);
});

test("identity and hash drift fail before report creation", async () => {
  const bytes = JSON.stringify(populationReport());
  await assert.rejects(
    () => buildImpactPublicationReview({
      populationReportBytes: bytes,
      populationReportPath: "population.json",
      readPost: async () => ({
        id: 999,
        topic_id: 434,
        post_number: 1,
        raw: developedRaw,
      }),
    }),
    /identity mismatch/,
  );
  await assert.rejects(
    () => buildImpactPublicationReview({
      populationReportBytes: bytes,
      populationReportPath: "population.json",
      readPost: async () => ({
        id: 441,
        topic_id: 434,
        post_number: 1,
        raw: `${developedRaw}\ndrift`,
      }),
    }),
    /source drift/,
  );
});

test("bounded cleanup cannot hang and retry parsing supports seconds, dates, and body", async () => {
  await releaseResponseBody(
    { body: { cancel: () => new Promise(() => {}) } },
    async () => {},
  );
  assert.equal(
    await retryAfterMilliseconds(
      new Response("", { status: 429, headers: { "Retry-After": "2" } }),
    ),
    2_000,
  );
  assert.equal(
    await retryAfterMilliseconds(
      new Response("", {
        status: 429,
        headers: { "Retry-After": "Thu, 01 Jan 2026 00:00:03 GMT" },
      }),
      { now: () => Date.parse("Thu, 01 Jan 2026 00:00:00 GMT") },
    ),
    3_000,
  );
  assert.equal(
    await retryAfterMilliseconds(new Response(JSON.stringify({
      extras: { wait_seconds: 4 },
    }), { status: 429, headers: { "content-type": "application/json" } })),
    4_000,
  );
});

test("GET reader bounds persistent 429 and does not retry non-429 failures", async () => {
  let attempts = 0;
  await assert.rejects(
    () => readPublicPost(441, {
      fetch: async () => {
        attempts += 1;
        return new Response("", { status: 429, headers: { "Retry-After": "0" } });
      },
      delayFn: async () => {},
    }),
    /HTTP 429/,
  );
  assert.equal(attempts, 4);

  attempts = 0;
  await assert.rejects(
    () => readPublicPost(441, {
      fetch: async () => {
        attempts += 1;
        return new Response("", { status: 500 });
      },
      delayFn: async () => {},
    }),
    /HTTP 500/,
  );
  assert.equal(attempts, 1);
});

test("review report writing is create-only", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "impact-review-"));
  const output = path.join(directory, "review.json");
  const report = { version: 1, writes: { discourse: 0, astroContent: 0 } };
  await writeCreateOnlyJson(output, report);
  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), report);
  await assert.rejects(() => writeCreateOnlyJson(output, report), /EEXIST/);
});
