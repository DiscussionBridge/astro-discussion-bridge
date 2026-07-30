import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  validateApprovedReviewBytes,
  validateImpactReviewPacket,
} from "../../../scripts/obbba-impact-import-manifest-lib.mjs";

test("approved review byte validator rejects any byte drift", () => {
  const bytes = Buffer.from('{"approved":true}\n');
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.deepEqual(validateApprovedReviewBytes(bytes, digest), { approved: true });
  assert.throws(
    () => validateApprovedReviewBytes(Buffer.from('{"approved":false}\n'), digest),
    /not the approved V2 packet/,
  );
});

test("Impact packet validator accepts complete invariants and rejects structural tampering", () => {
  const valid = syntheticPacket();
  assert.equal(validateImpactReviewPacket(valid), valid);

  const swap = clone(valid);
  swap.entries[0].recommendation = "publication-review-candidate";
  swap.entries[15].recommendation = "manual-cleanup-review";
  assert.throws(() => validateImpactReviewPacket(swap), /quarantine identity/);

  const duplicate = clone(valid);
  duplicate.entries[2].topicId = duplicate.entries[1].topicId;
  duplicate.entries[2].sourceUrl = duplicate.entries[1].sourceUrl;
  assert.throws(() => validateImpactReviewPacket(duplicate), /duplicate identities/);

  const summaryMismatch = clone(valid);
  summaryMismatch.summary.existingAstroPages = 14;
  assert.throws(() => validateImpactReviewPacket(summaryMismatch), /135\/134\/1\/15 totals/);

  for (const mutate of [
    (packet) => { packet.entries[1].sourceUrl = "https://forum.repealobbba.org/t/999"; },
    (packet) => { packet.entries[1].communitySha256 = "not-a-digest"; },
    (packet) => { packet.entries[1].postUpdatedAt = "not-a-date"; },
  ]) {
    const malformed = clone(valid);
    mutate(malformed);
    assert.throws(() => validateImpactReviewPacket(malformed), /invalid entry/);
  }

  const wrongCleanup = clone(valid);
  wrongCleanup.entries[0].sectionId = "10102";
  assert.throws(() => validateImpactReviewPacket(wrongCleanup), /quarantine identity/);
});

function syntheticPacket() {
  const entries = [{
    sectionId: "10101",
    topicId: 434,
    postId: 441,
    sourceUrl: "https://forum.repealobbba.org/t/434",
    communitySha256: "a".repeat(64),
    postUpdatedAt: "2026-07-01T01:35:12.979Z",
    existingAstroUrl: "https://onebigbeautifulbill.us/title%20i/10101-impact/",
    flags: ["replace-instruction"],
    missingHeadings: [],
    recommendation: "manual-cleanup-review",
  }];
  for (let index = 0; index < 134; index += 1) {
    const topicId = 1000 + index;
    entries.push({
      sectionId: String(20000 + index),
      topicId,
      postId: 2000 + index,
      sourceUrl: `https://forum.repealobbba.org/t/${topicId}`,
      communitySha256: (index % 16).toString(16).repeat(64),
      postUpdatedAt: "2026-07-25T12:34:56.000Z",
      ...(index < 14
        ? { existingAstroUrl: `https://onebigbeautifulbill.us/title%20ii/sec-${20000 + index}-impact/` }
        : {}),
      flags: [],
      missingHeadings: [],
      recommendation: "publication-review-candidate",
    });
  }
  return {
    version: 1,
    mode: "impact-publication-review",
    writes: { discourse: 0, astroContent: 0 },
    summary: {
      total: 135,
      publicationReviewCandidate: 134,
      manualCleanupReview: 1,
      existingAstroPages: 15,
    },
    entries,
  };
}

function clone(value) {
  return structuredClone(value);
}
