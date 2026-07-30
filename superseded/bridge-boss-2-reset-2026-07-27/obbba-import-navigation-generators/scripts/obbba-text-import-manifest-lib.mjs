import { createHash } from "node:crypto";

export function validateApprovedEnrolledBytes(bytes, expectedSha256) {
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error(`OBBBA enrolled comparison bytes are not the approved packet: ${actual}.`);
  }
  return JSON.parse(Buffer.from(bytes).toString("utf8"));
}

export function validateEnrolledComparisonPacket(value) {
  if (
    value?.version !== 2
    || value?.mode !== "comparison-only"
    || value?.writes?.discourse !== 0
    || value?.writes?.astroContent !== 0
    || value?.baseline?.stage !== "enrolled-bill"
    || value?.baseline?.measure !== "H.R. 1, 119th Congress"
    || value?.baseline?.sourceFile !== "BILLS-119hr1enr.xml"
    || !/^[a-f0-9]{64}$/.test(value?.baseline?.sourceSha256)
    || !/^[a-f0-9]{64}$/.test(value?.baseline?.priorReportSha256)
  ) {
    throw new Error("OBBBA enrolled comparison is not the approved zero-write V2 evidence shape.");
  }
  const expectedSummary = {
    total: 307,
    "normalized-exact": 301,
    "presentation-only": 4,
    "case-only": 0,
    "word-difference": 2,
    unresolved: 0,
  };
  for (const [key, count] of Object.entries(expectedSummary)) {
    if (value.summary?.[key] !== count) {
      throw new Error(`OBBBA enrolled comparison summary mismatch for ${key}.`);
    }
  }
  if (!Array.isArray(value.entries) || value.entries.length !== 307) {
    throw new Error("OBBBA enrolled comparison must contain exactly 307 entries.");
  }

  const sections = new Set();
  const topics = new Set();
  const counts = new Map();
  for (const entry of value.entries) {
    if (
      !entry || typeof entry !== "object"
      || !/^[A-Za-z0-9.-]+$/.test(entry.sectionId)
      || typeof entry.label !== "string" || !entry.label.trim()
      || !Number.isInteger(entry.topicId) || entry.topicId < 1
      || entry.sourceUrl !== `https://forum.repealobbba.org/t/${entry.topicId}`
      || !["normalized-exact", "presentation-only", "word-difference"].includes(entry.outcome)
      || !/^[a-f0-9]{64}$/.test(entry.communityHash)
      || typeof entry.postUpdatedAt !== "string" || Number.isNaN(Date.parse(entry.postUpdatedAt))
      || !Number.isInteger(entry.enrolledCharacters) || entry.enrolledCharacters < 1
      || !Number.isInteger(entry.communityCharacters) || entry.communityCharacters < 1
      || !Number.isInteger(entry.enrolledTokens) || entry.enrolledTokens < 1
      || !Number.isInteger(entry.communityTokens) || entry.communityTokens < 1
    ) {
      throw new Error("OBBBA enrolled comparison contains an invalid entry.");
    }
    if (sections.has(entry.sectionId) || topics.has(entry.topicId)) {
      throw new Error("OBBBA enrolled comparison contains duplicate identities.");
    }
    sections.add(entry.sectionId);
    topics.add(entry.topicId);
    counts.set(entry.outcome, (counts.get(entry.outcome) ?? 0) + 1);
  }
  for (const outcome of ["normalized-exact", "presentation-only", "word-difference"]) {
    if ((counts.get(outcome) ?? 0) !== value.summary[outcome]) {
      throw new Error(`OBBBA enrolled comparison entry count mismatch for ${outcome}.`);
    }
  }
  const differences = value.entries.filter((entry) => entry.outcome === "word-difference");
  if (
    differences.length !== 2
    || differences[0].sectionId !== "10401" || differences[0].topicId !== 60
    || differences[1].sectionId !== "40005" || differences[1].topicId !== 99
  ) {
    throw new Error("OBBBA enrolled comparison exception identities are invalid.");
  }
  return value;
}

export function validateEnrolledSectionAuthority(value, comparison) {
  if (
    value?.version !== 1
    || value?.mode !== "enrolled-section-authority"
    || value?.writes?.discourse !== 0
    || value?.writes?.astroContent !== 0
    || value?.source?.comparisonSha256
      !== "128ab8e7884cfe18acab62082f714ae32943b9600a9ddeeee35215dbf6211ae9"
    || value?.source?.enrolledSourceSha256 !== comparison?.baseline?.sourceSha256
    || value?.summary?.total !== 307
    || !Array.isArray(value?.entries)
    || value.entries.length !== 307
  ) {
    throw new Error("OBBBA enrolled section authority has an invalid zero-write evidence shape.");
  }
  const reviewed = new Map(comparison.entries.map((entry) => [entry.sectionId, entry]));
  const seenSections = new Set();
  const seenTopics = new Set();
  for (const entry of value.entries) {
    const source = reviewed.get(entry?.sectionId);
    if (
      !source
      || entry.topicId !== source.topicId
      || entry.sourceUrl !== source.sourceUrl
      || !/^[a-f0-9]{64}$/.test(entry.enrolledLegalTextSha256)
      || seenSections.has(entry.sectionId)
      || seenTopics.has(entry.topicId)
    ) {
      throw new Error("OBBBA enrolled section authority contains an invalid or duplicate identity.");
    }
    seenSections.add(entry.sectionId);
    seenTopics.add(entry.topicId);
  }
  return value;
}
