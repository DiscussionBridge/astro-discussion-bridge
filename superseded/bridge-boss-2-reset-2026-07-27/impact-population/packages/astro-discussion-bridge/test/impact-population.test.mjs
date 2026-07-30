import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildImpactPopulationDryRun,
  classifyImpactPopulationCandidate,
  collectImpactPopulationDryRun,
  createImpactPlaceholderSnapshot,
  normalizeImpactPlaceholderContent,
  loadImpactPopulationReadConfig,
  preflightImpactPopulationAccess,
  validateImpactPlaceholderSnapshot,
  validateImpactPopulationDryRunReport,
  writeImpactPopulationDryRunReport,
} from "../dist/impact-population.js";

const placeholderText = `What does this Sec (section) actually do?
How will it change day to day government processes?
Will it impact consumers? Businesses?

Please share how this section is impacting you, your family, your business, your district and/or your state by telling your story.

https://forum.repealobbba.org/c/stories/7

This post is a [wiki post](https://forum.repealobbba.org/t/wiki-post-editing-and-usage/445), please jump in or reply with your comments.`;

function snapshot() {
  return createImpactPlaceholderSnapshot({
    sectionId: "82001",
    topicId: 1002,
    postId: 5002,
    topicUrl: "https://forum.repealobbba.org/t/sec-82001-loan-repayment-impact/1002",
    capturedAt: "2026-07-24T20:00:00.000Z",
    rawContent: placeholderText,
  });
}

function candidate(overrides = {}) {
  return {
    sectionId: "82001",
    topicId: 1002,
    postId: 5002,
    sourceUrl: "https://forum.repealobbba.org/t/sec-82001-loan-repayment-impact/1002",
    rawContent: placeholderText,
    postUpdatedAt: "2026-07-24T19:00:00.000Z",
    ...overrides,
  };
}

test("normalization is bounded to line endings, trailing spaces, and repeated blank lines", () => {
  const variant = `${placeholderText.replace(/\n\n/g, "  \r\n\r\n\r\n").replace(/(?<!\r)\n/g, "  \r\n")}\r\n`;
  assert.equal(
    normalizeImpactPlaceholderContent(variant),
    placeholderText,
  );
  assert.notEqual(
    normalizeImpactPlaceholderContent(`${placeholderText}\nNew analysis.`),
    normalizeImpactPlaceholderContent(placeholderText),
  );
});

test("snapshot freezes canonical normalized content and verifies its hash", () => {
  const value = snapshot();
  assert.equal(value.normalizationVersion, "impact-placeholder-v1");
  assert.match(value.normalizedContentSha256, /^[a-f0-9]{64}$/);
  assert.equal(validateImpactPlaceholderSnapshot(value).normalizedContent, placeholderText);
  assert.throws(
    () => validateImpactPlaceholderSnapshot({ ...value, normalizedContentSha256: "0".repeat(64) }),
    /does not match/,
  );
});

test("exact placeholder suppresses Astro publication but retains a forum relationship", () => {
  const result = classifyImpactPopulationCandidate({
    placeholder: snapshot(),
    candidate: candidate({ rawContent: `${placeholderText.replace(/\n/g, "\r\n")}\r\n` }),
  });
  assert.equal(result.outcome, "placeholder-suppressed");
  assert.equal(result.publishAstroImpactPage, false);
  assert.equal(result.relationshipLabel, "Forum impact discussion");
  assert.equal(result.relationshipTarget, candidate().sourceUrl);
});

test("a nonmatching source is review-required rather than automatically publishable", () => {
  const result = classifyImpactPopulationCandidate({
    placeholder: snapshot(),
    candidate: candidate({ rawContent: `${placeholderText}\n\nOne new sentence.` }),
  });
  assert.equal(result.outcome, "review-required");
  assert.equal(result.publishAstroImpactPage, false);
});

test("only an exact hash-pinned review creates a publication candidate", () => {
  const changed = candidate({
    rawContent: "This section changes loan repayment administration in three reviewed ways.",
  });
  const reviewedHash = classifyImpactPopulationCandidate({
    placeholder: snapshot(),
    candidate: changed,
  }).communitySha256;
  const approved = classifyImpactPopulationCandidate({
    placeholder: snapshot(),
    candidate: {
      ...changed,
      reviewedPublication: {
        communitySha256: reviewedHash,
        astroUrl: "/impact/sec-82001/",
      },
    },
  });
  assert.equal(approved.outcome, "publication-candidate");
  assert.equal(approved.publishAstroImpactPage, true);
  assert.equal(approved.relationshipTarget, "/impact/sec-82001/");

  const drifted = classifyImpactPopulationCandidate({
    placeholder: snapshot(),
    candidate: {
      ...changed,
      rawContent: `${changed.rawContent} Changed after review.`,
      reviewedPublication: {
        communitySha256: reviewedHash,
        astroUrl: "/impact/sec-82001/",
      },
    },
  });
  assert.equal(drifted.outcome, "review-required");
  assert.match(drifted.reason, /changed after publication review/);
});

test("an existing Astro page is never automatically removed when source matches placeholder", () => {
  const result = classifyImpactPopulationCandidate({
    placeholder: snapshot(),
    candidate: candidate({ existingAstroUrl: "/impact/sec-82001/" }),
  });
  assert.equal(result.outcome, "placeholder-suppressed");
  assert.equal(result.publishAstroImpactPage, false);
  assert.equal(result.driftReviewRequired, true);
  assert.match(result.reason, /preserve it and require drift review/);
});

test("dry-run report has three outcomes, zero writes, deterministic input hashes, and unique identities", () => {
  const developed = candidate({
    sectionId: "82002",
    topicId: 1003,
    postId: 5003,
    sourceUrl: "https://forum.repealobbba.org/t/sec-82002-impact/1003",
    rawContent: "Reviewed developed analysis.",
  });
  const developedHash = classifyImpactPopulationCandidate({
    placeholder: snapshot(),
    candidate: developed,
  }).communitySha256;
  const report = buildImpactPopulationDryRun({
    placeholder: snapshot(),
    generatedAt: "2026-07-24T21:00:00.000Z",
    candidates: [
      candidate(),
      {
        ...developed,
        reviewedPublication: {
          communitySha256: developedHash,
          astroUrl: "/impact/sec-82002/",
        },
      },
      candidate({
        sectionId: "82003",
        topicId: 1004,
        postId: 5004,
        sourceUrl: "https://forum.repealobbba.org/t/sec-82003-impact/1004",
        rawContent: `${placeholderText}\nPartial edit.`,
      }),
    ],
  });
  assert.deepEqual(report.writes, { discourse: 0, astroContent: 0 });
  assert.deepEqual(report.summary, {
    total: 3,
    "placeholder-suppressed": 1,
    "publication-candidate": 1,
    "review-required": 1,
  });
  validateImpactPopulationDryRunReport(report);
  assert.throws(
    () => buildImpactPopulationDryRun({
      placeholder: snapshot(),
      candidates: [candidate(), candidate({ postId: 9999 })],
    }),
    /duplicate topic ID/,
  );
});

test("report writing is validated and create-only", async () => {
  const report = buildImpactPopulationDryRun({
    placeholder: snapshot(),
    generatedAt: "2026-07-24T21:00:00.000Z",
    candidates: [candidate()],
  });
  const directory = await mkdtemp(path.join(os.tmpdir(), "impact-population-"));
  const output = path.join(directory, "report.json");
  await writeImpactPopulationDryRunReport(output, report);
  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), report);
  await assert.rejects(() => writeImpactPopulationDryRunReport(output, report), /EEXIST/);
  await assert.rejects(
    () => writeImpactPopulationDryRunReport(
      path.join(directory, "invalid.json"),
      { ...report, writes: { discourse: 1, astroContent: 0 } },
    ),
    /zero writes/,
  );
  assert.throws(
    () => validateImpactPopulationDryRunReport({
      ...report,
      inputs: { ...report.inputs, snapshotSha256: "0".repeat(64) },
    }),
    /does not match/,
  );
  assert.throws(
    () => validateImpactPopulationDryRunReport({
      ...report,
      summary: {
        ...report.summary,
        total: 2,
        "placeholder-suppressed": 2,
      },
      entries: [...report.entries, { ...report.entries[0] }],
    }),
    /duplicate topic ID/,
  );
});

test("strict config and collector perform credentialed GET-only reads", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "impact-config-"));
  const configPath = path.join(directory, "config.json");
  const configValue = {
    version: 1,
    discourseUrl: "https://forum.repealobbba.org/",
    placeholder: snapshot(),
    sources: [{
      sectionId: "82001",
      topicId: 1002,
      sourceUrl: "https://forum.repealobbba.org/t/sec-82001-loan-repayment-impact/1002",
    }],
  };
  await writeFile(configPath, JSON.stringify(configValue), "utf8");
  const config = await loadImpactPopulationReadConfig(configPath);
  const requests = [];
  const progress = [];
  const report = await collectImpactPopulationDryRun({
    config,
    trustedDiscourseUrl: "https://forum.repealobbba.org",
    apiKey: "read-key",
    apiUsername: "reader",
    generatedAt: "2026-07-24T21:00:00.000Z",
    requestIntervalMs: 0,
    onProgress(completed, total, source) {
      progress.push({ completed, total, topicId: source.topicId });
    },
    fetch: async (url, init = {}) => {
      const parsed = new URL(url);
      requests.push({ path: parsed.pathname, method: init.method ?? "GET", redirect: init.redirect });
      if (parsed.pathname === "/t/1002.json") {
        return new Response(JSON.stringify({
          id: 1002,
          title: "Impact",
          posts_count: 1,
          created_at: "2026-07-24T00:00:00.000Z",
          post_stream: {
            stream: [5002],
            posts: [{
              id: 5002,
              post_number: 1,
              topic_id: 1002,
              topic_slug: "impact",
              cooked: "",
            }],
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (parsed.pathname === "/posts/5002.json") {
        return new Response(JSON.stringify({
          id: 5002,
          post_number: 1,
          topic_id: 1002,
          topic_slug: "impact",
          raw: placeholderText,
          cooked: "",
          updated_at: "2026-07-24T19:00:00.000Z",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    },
  });
  assert.equal(report.entries[0].outcome, "placeholder-suppressed");
  assert.deepEqual(requests.map(({ path }) => path), ["/t/1002.json", "/posts/5002.json"]);
  assert.ok(requests.every(({ method, redirect }) => method === "GET" && redirect === "error"));
  assert.deepEqual(progress, [{ completed: 1, total: 1, topicId: 1002 }]);
});

test("credential preflight uses the collector path for only the frozen canonical topic", async () => {
  const requests = [];
  const config = {
    version: 1,
    discourseUrl: "https://forum.repealobbba.org/",
    placeholder: snapshot(),
    sources: [
      {
        sectionId: "82001",
        topicId: 1002,
        sourceUrl: "https://forum.repealobbba.org/t/1002",
      },
      {
        sectionId: "82002",
        topicId: 1003,
        sourceUrl: "https://forum.repealobbba.org/t/1003",
      },
    ],
  };
  const report = await preflightImpactPopulationAccess({
    config,
    trustedDiscourseUrl: "https://forum.repealobbba.org",
    apiKey: "read-key",
    apiUsername: "reader",
    requestIntervalMs: 0,
    fetch: async (url, init = {}) => {
      const pathname = new URL(url).pathname;
      requests.push({ pathname, method: init.method ?? "GET", redirect: init.redirect });
      if (pathname === "/t/1002.json") {
        return new Response(JSON.stringify({
          id: 1002,
          title: "Impact",
          posts_count: 1,
          created_at: "2026-07-24T00:00:00.000Z",
          post_stream: {
            stream: [5002],
            posts: [{
              id: 5002,
              post_number: 1,
              topic_id: 1002,
              topic_slug: "impact",
              cooked: "",
            }],
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (pathname === "/posts/5002.json") {
        return new Response(JSON.stringify({
          id: 5002,
          post_number: 1,
          topic_id: 1002,
          topic_slug: "impact",
          raw: placeholderText,
          cooked: "",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected preflight request: ${pathname}`);
    },
  });
  assert.deepEqual(
    requests,
    [
      { pathname: "/t/1002.json", method: "GET", redirect: "error" },
      { pathname: "/posts/5002.json", method: "GET", redirect: "error" },
    ],
  );
  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0].topicId, 1002);
  assert.deepEqual(report.writes, { discourse: 0, astroContent: 0 });
});

test("collector rejects trusted authority drift before network access", async () => {
  let fetches = 0;
  await assert.rejects(
    collectImpactPopulationDryRun({
      config: {
        version: 1,
        discourseUrl: "https://forum.repealobbba.org/",
        placeholder: snapshot(),
        sources: [{
          sectionId: "82001",
          topicId: 1002,
          sourceUrl: "https://forum.repealobbba.org/t/1002",
        }],
      },
      trustedDiscourseUrl: "https://other.example.com",
      apiKey: "read-key",
      apiUsername: "reader",
      requestIntervalMs: 0,
      fetch: async () => {
        fetches += 1;
        throw new Error("must not fetch");
      },
    }),
    /does not match trusted URL/,
  );
  assert.equal(fetches, 0);
});

test("collector revalidates direct runtime config before credentialed fetches", async () => {
  let fetches = 0;
  await assert.rejects(
    collectImpactPopulationDryRun({
      config: {
        version: 1,
        discourseUrl: "https://forum.repealobbba.org/",
        placeholder: snapshot(),
        sources: [{
          sectionId: "82001",
          topicId: 1002,
          sourceUrl: "https://attacker.example/t/1002",
        }],
      },
      trustedDiscourseUrl: "https://forum.repealobbba.org",
      apiKey: "read-key",
      apiUsername: "reader",
      requestIntervalMs: 0,
      fetch: async () => {
        fetches += 1;
        throw new Error("must not fetch");
      },
    }),
    /outside trusted Discourse authority/,
  );
  assert.equal(fetches, 0);
});

test("collector verifies the live canonical first-post identity", async () => {
  const config = {
    version: 1,
    discourseUrl: "https://forum.repealobbba.org/",
    placeholder: { ...snapshot(), postId: 9999 },
    sources: [{
      sectionId: "82001",
      topicId: 1002,
      sourceUrl: "https://forum.repealobbba.org/t/1002",
    }],
  };
  await assert.rejects(
    collectImpactPopulationDryRun({
      config,
      trustedDiscourseUrl: "https://forum.repealobbba.org",
      apiKey: "read-key",
      apiUsername: "reader",
      requestIntervalMs: 0,
      fetch: async (url) => {
        const pathname = new URL(url).pathname;
        if (pathname === "/t/1002.json") {
          return new Response(JSON.stringify({
            id: 1002,
            title: "Impact",
            posts_count: 1,
            created_at: "2026-07-24T00:00:00.000Z",
            post_stream: {
              stream: [5002],
              posts: [{
                id: 5002,
                post_number: 1,
                topic_id: 1002,
                topic_slug: "impact",
                raw: placeholderText,
                cooked: "",
              }],
            },
          }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response("not found", { status: 404 });
      },
    }),
    /expected first post 9999.*returned 5002/,
  );
});

test("collector honors bounded 429 retries and releases rejected bodies", async () => {
  let topicAttempts = 0;
  let cancellations = 0;
  const rateLimitEvents = [];
  const config = {
    version: 1,
    discourseUrl: "https://forum.repealobbba.org/",
    placeholder: snapshot(),
    sources: [{
      sectionId: "82001",
      topicId: 1002,
      sourceUrl: "https://forum.repealobbba.org/t/1002",
    }],
  };
  const report = await collectImpactPopulationDryRun({
    config,
    trustedDiscourseUrl: "https://forum.repealobbba.org",
    apiKey: "read-key",
    apiUsername: "reader",
    requestIntervalMs: 0,
    onRateLimit(waitMilliseconds, retryAttempt) {
      rateLimitEvents.push({ waitMilliseconds, retryAttempt });
    },
    fetch: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/t/1002.json" && topicAttempts++ === 0) {
        return {
          status: 429,
          headers: new Headers({ "retry-after": "0" }),
          body: { cancel: async () => { cancellations += 1; } },
        };
      }
      if (pathname === "/t/1002.json" && topicAttempts === 2) {
        return new Response("rate limited", {
          status: 429,
          headers: { "retry-after": new Date(Date.now() - 1_000).toUTCString() },
        });
      }
      if (pathname === "/t/1002.json" && topicAttempts === 3) {
        return new Response(JSON.stringify({
          errors: ["You’ve performed this action too many times."],
          error_type: "rate_limit",
          extras: { wait_seconds: 0, time_left: "0 seconds" },
        }), {
          status: 429,
          headers: { "content-type": "application/json" },
        });
      }
      if (pathname === "/t/1002.json") {
        return new Response(JSON.stringify({
          id: 1002,
          title: "Impact",
          posts_count: 1,
          created_at: "2026-07-24T00:00:00.000Z",
          post_stream: {
            stream: [5002],
            posts: [{
              id: 5002,
              post_number: 1,
              topic_id: 1002,
              topic_slug: "impact",
              raw: placeholderText,
              cooked: "",
            }],
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    },
  });
  assert.equal(topicAttempts, 4);
  assert.equal(cancellations, 1);
  assert.deepEqual(rateLimitEvents, [
    { waitMilliseconds: 250, retryAttempt: 1 },
    { waitMilliseconds: 250, retryAttempt: 2 },
    { waitMilliseconds: 250, retryAttempt: 3 },
  ]);
  assert.equal(report.summary["placeholder-suppressed"], 1);
});

test("collector stops after the bounded persistent-429 retry budget", async () => {
  let attempts = 0;
  const retryAttempts = [];
  await assert.rejects(
    collectImpactPopulationDryRun({
      config: {
        version: 1,
        discourseUrl: "https://forum.repealobbba.org/",
        placeholder: snapshot(),
        sources: [{
          sectionId: "82001",
          topicId: 1002,
          sourceUrl: "https://forum.repealobbba.org/t/1002",
        }],
      },
      trustedDiscourseUrl: "https://forum.repealobbba.org",
      apiKey: "read-key",
      apiUsername: "reader",
      requestIntervalMs: 0,
      onRateLimit(_waitMilliseconds, retryAttempt) {
        retryAttempts.push(retryAttempt);
      },
      fetch: async () => {
        attempts += 1;
        return new Response(JSON.stringify({
          error_type: "rate_limit",
          extras: { wait_seconds: 0 },
        }), {
          status: 429,
          headers: { "content-type": "application/json" },
        });
      },
    }),
    /Discourse request failed: 429/,
  );
  assert.equal(attempts, 4);
  assert.deepEqual(retryAttempts, [1, 2, 3]);
});

test("the generated OBBBA production config passes strict validation", async () => {
  const config = await loadImpactPopulationReadConfig(
    path.resolve("../../examples/obbba-impact-population.config.json"),
  );
  assert.equal(config.placeholder.normalizedContent, placeholderText);
  assert.equal(
    config.placeholder.normalizedContentSha256,
    "5c7566fe0bea552dde76cde1c76dfc8c9d04f0c12a3974d8051d61944d8120b5",
  );
  assert.doesNotMatch(config.placeholder.normalizedContent, /Once implemented/);
  assert.equal(config.sources.length, 307);
  assert.deepEqual(
    config.sources.find((source) => source.topicId === config.placeholder.topicId),
    {
      sectionId: "82001",
      topicId: 1002,
      sourceUrl: "https://forum.repealobbba.org/t/1002",
    },
  );
  assert.equal(config.sources.filter((source) => source.existingAstroUrl).length, 15);
});
