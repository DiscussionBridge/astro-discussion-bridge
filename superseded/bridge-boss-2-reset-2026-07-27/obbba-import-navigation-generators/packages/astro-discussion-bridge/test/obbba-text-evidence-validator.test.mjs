import assert from "node:assert/strict";
import test from "node:test";
import {
  validateEnrolledComparisonPacket,
  validateEnrolledSectionAuthority,
} from "../../../scripts/obbba-text-import-manifest-lib.mjs";

function packet() {
  const entries = [];
  for (let index = 0; index < 307; index += 1) {
    const sectionId = index === 0 ? "10401" : index === 1 ? "40005" : String(50000 + index);
    const topicId = index === 0 ? 60 : index === 1 ? 99 : 1000 + index;
    entries.push({
      sectionId,
      label: `Sec. ${sectionId}. Test`,
      topicId,
      sourceUrl: `https://forum.repealobbba.org/t/${topicId}`,
      outcome: index < 2 ? "word-difference" : index < 6 ? "presentation-only" : "normalized-exact",
      communityHash: "a".repeat(64),
      postUpdatedAt: "2026-01-01T00:00:00.000Z",
      enrolledCharacters: 10,
      communityCharacters: 10,
      enrolledTokens: 2,
      communityTokens: 2,
    });
  }
  return {
    version: 2,
    mode: "comparison-only",
    baseline: {
      stage: "enrolled-bill",
      measure: "H.R. 1, 119th Congress",
      sourceFile: "BILLS-119hr1enr.xml",
      sourceSha256: "b".repeat(64),
      priorReportSha256: "c".repeat(64),
    },
    writes: { discourse: 0, astroContent: 0 },
    summary: {
      total: 307,
      "normalized-exact": 301,
      "presentation-only": 4,
      "case-only": 0,
      "word-difference": 2,
      unresolved: 0,
    },
    entries,
  };
}

test("strict enrolled evidence validator accepts the approved structure and exception identities", () => {
  assert.equal(validateEnrolledComparisonPacket(packet()).entries.length, 307);
});

test("enrolled section authority is identity-bound and rejects duplicate or altered hashes", () => {
  const comparison = packet();
  const authority = {
    version: 1,
    mode: "enrolled-section-authority",
    source: {
      comparisonSha256: "128ab8e7884cfe18acab62082f714ae32943b9600a9ddeeee35215dbf6211ae9",
      enrolledSourceSha256: comparison.baseline.sourceSha256,
    },
    writes: { discourse: 0, astroContent: 0 },
    summary: { total: 307 },
    entries: comparison.entries.map((entry) => ({
      sectionId: entry.sectionId,
      topicId: entry.topicId,
      sourceUrl: entry.sourceUrl,
      enrolledLegalTextSha256: "d".repeat(64),
    })),
  };
  assert.equal(validateEnrolledSectionAuthority(authority, comparison).entries.length, 307);
  const wrongIdentity = structuredClone(authority);
  wrongIdentity.entries[2].topicId += 1;
  assert.throws(() => validateEnrolledSectionAuthority(wrongIdentity, comparison), /invalid or duplicate identity/i);
  const badHash = structuredClone(authority);
  badHash.entries[2].enrolledLegalTextSha256 = "not-a-hash";
  assert.throws(() => validateEnrolledSectionAuthority(badHash, comparison), /invalid or duplicate identity/i);
  const duplicate = structuredClone(authority);
  duplicate.entries[2] = structuredClone(duplicate.entries[3]);
  assert.throws(() => validateEnrolledSectionAuthority(duplicate, comparison), /invalid or duplicate identity/i);
});

test("strict enrolled evidence validator rejects count, identity, duplicate, and write tampering", () => {
  const writes = packet();
  writes.writes.astroContent = 1;
  assert.throws(() => validateEnrolledComparisonPacket(writes), /zero-write/i);

  const swapped = packet();
  swapped.entries[0].sectionId = "99999";
  assert.throws(() => validateEnrolledComparisonPacket(swapped), /exception identities/i);

  const duplicate = packet();
  duplicate.entries[2].topicId = duplicate.entries[3].topicId;
  duplicate.entries[2].sourceUrl = duplicate.entries[3].sourceUrl;
  assert.throws(() => validateEnrolledComparisonPacket(duplicate), /duplicate identities/i);

  const summary = packet();
  summary.summary["normalized-exact"] = 300;
  assert.throws(() => validateEnrolledComparisonPacket(summary), /summary mismatch/i);
});
