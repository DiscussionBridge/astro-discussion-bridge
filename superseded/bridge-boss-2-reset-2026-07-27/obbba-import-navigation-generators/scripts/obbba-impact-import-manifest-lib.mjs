import { createHash } from "node:crypto";

export function validateApprovedReviewBytes(bytes, expectedSha256) {
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error(`Impact publication review bytes are not the approved V2 packet: ${actual}.`);
  }
  return JSON.parse(Buffer.from(bytes).toString("utf8"));
}

export function validateImpactReviewPacket(value) {
  if (
    value?.version !== 1
    || value?.mode !== "impact-publication-review"
    || value?.writes?.discourse !== 0
    || value?.writes?.astroContent !== 0
  ) {
    throw new Error("Impact publication review evidence is not a recognized zero-write V1 report.");
  }
  if (
    value?.summary?.total !== 135
    || value?.summary?.publicationReviewCandidate !== 134
    || value?.summary?.manualCleanupReview !== 1
    || value?.summary?.existingAstroPages !== 15
  ) {
    throw new Error("Impact publication review evidence does not have the approved 135/134/1/15 totals.");
  }
  if (!Array.isArray(value.entries) || value.entries.length !== 135) {
    throw new Error("Impact publication review evidence must contain exactly 135 entries.");
  }

  const sectionIds = new Set();
  const topicIds = new Set();
  const postIds = new Set();
  let candidates = 0;
  let cleanup = 0;
  let existing = 0;
  for (const entry of value.entries) {
    if (
      !entry || typeof entry !== "object"
      || !/^[A-Za-z0-9.-]+$/.test(entry.sectionId)
      || !Number.isInteger(entry.topicId) || entry.topicId < 1
      || !Number.isInteger(entry.postId) || entry.postId < 1
      || entry.sourceUrl !== `https://forum.repealobbba.org/t/${entry.topicId}`
      || !/^[a-f0-9]{64}$/.test(entry.communitySha256)
      || typeof entry.postUpdatedAt !== "string" || Number.isNaN(Date.parse(entry.postUpdatedAt))
      || !Array.isArray(entry.flags) || !Array.isArray(entry.missingHeadings)
      || !["publication-review-candidate", "manual-cleanup-review"].includes(entry.recommendation)
    ) {
      throw new Error("Impact publication review evidence contains an invalid entry.");
    }
    if (sectionIds.has(entry.sectionId) || topicIds.has(entry.topicId) || postIds.has(entry.postId)) {
      throw new Error("Impact publication review evidence contains duplicate identities.");
    }
    sectionIds.add(entry.sectionId);
    topicIds.add(entry.topicId);
    postIds.add(entry.postId);
    if (entry.recommendation === "publication-review-candidate") candidates += 1;
    if (entry.recommendation === "manual-cleanup-review") cleanup += 1;
    if (entry.existingAstroUrl !== undefined) {
      let existingUrl;
      try {
        existingUrl = new URL(entry.existingAstroUrl);
      } catch {
        throw new Error("Impact publication review evidence contains an invalid existing Astro URL.");
      }
      if (existingUrl.origin !== "https://onebigbeautifulbill.us") {
        throw new Error("Impact publication review evidence contains an invalid existing Astro URL.");
      }
      existing += 1;
    }
  }

  const cleanupEntries = value.entries.filter((entry) => entry.recommendation === "manual-cleanup-review");
  if (
    candidates !== value.summary.publicationReviewCandidate
    || cleanup !== value.summary.manualCleanupReview
    || existing !== value.summary.existingAstroPages
    || cleanupEntries.length !== 1
    || cleanupEntries[0].sectionId !== "10101"
    || cleanupEntries[0].topicId !== 434
  ) {
    throw new Error("Impact publication review evidence recommendations or quarantine identity are invalid.");
  }
  return value;
}
