import { createHash } from "node:crypto";

const CLASSIFICATION_URL =
  "https://uscode.house.gov/classification/tbl119pl_1st.htm";

export function buildObbbaLawAuthorityMap({
  forumMetadataText,
  classificationDocumentText,
}) {
  const metadata = parseJson(forumMetadataText, "forum metadata");
  if (metadata?.mode !== "law-as-amended-forum-metadata-only"
    || metadata?.summary?.total !== 309
    || !Array.isArray(metadata.entries)
    || metadata.entries.length !== 309) {
    throw new Error("Law authority mapping requires the 309-entry forum metadata manifest.");
  }
  const classifications = parsePublicLaw11921Classifications(classificationDocumentText);
  const byObbbaSection = new Map();
  for (const record of classifications) {
    const baseSection = /^(\d+)/.exec(record.publicLawSection)?.[1];
    if (!baseSection) {
      throw new Error(`Classification has no OBBBA section identity: ${record.publicLawSection}.`);
    }
    const records = byObbbaSection.get(baseSection) ?? [];
    records.push(record);
    byObbbaSection.set(baseSection, records);
  }
  const seenSections = new Set();
  const seenTopics = new Set();
  const entries = metadata.entries.map((entry) => {
    validateMetadataEntry(entry, seenSections, seenTopics);
    const records = byObbbaSection.get(entry.sectionId) ?? [];
    return {
      sectionId: entry.sectionId,
      topicId: entry.topicId,
      title: entry.title,
      discussionUrl: entry.sourceUrl,
      normalizedTags: entry.normalizedTags,
      classificationStatus: records.length
        ? "classified-to-us-code"
        : "no-us-code-classification-record",
      classifications: records,
      enactedAuthority: {
        law: "Public Law 119-21",
        section: entry.sectionId,
        sourceUrl: "https://www.govinfo.gov/app/details/PLAW-119publ21",
      },
    };
  });
  const unknownClassifiedSections = [...byObbbaSection.keys()]
    .filter((sectionId) => !seenSections.has(sectionId));
  if (unknownClassifiedSections.length) {
    throw new Error(
      `Classification contains OBBBA sections outside metadata: ${unknownClassifiedSections.join(", ")}.`,
    );
  }
  return {
    version: 1,
    mode: "obbba-law-official-authority-map",
    sources: {
      forumMetadataRole: "title-tags-topic-binding-only",
      enactedLaw: "Public Law 119-21",
      enactedLawUrl: "https://www.govinfo.gov/app/details/PLAW-119publ21",
      classificationAuthority: "Office of the Law Revision Counsel",
      classificationUrl: CLASSIFICATION_URL,
    },
    inputs: {
      forumMetadataSha256: sha256(forumMetadataText),
      classificationDocumentSha256: sha256(classificationDocumentText),
    },
    summary: {
      total: entries.length,
      classifiedToUsCode: entries.filter((entry) =>
        entry.classificationStatus === "classified-to-us-code"
      ).length,
      noUsCodeClassificationRecord: entries.filter((entry) =>
        entry.classificationStatus === "no-us-code-classification-record"
      ).length,
      classificationRows: classifications.length,
    },
    entries,
  };
}

export function parsePublicLaw11921Classifications(documentText) {
  if (typeof documentText !== "string" || !documentText.trim()) {
    throw new Error("OLRC classification document is empty.");
  }
  const text = htmlToText(documentText);
  const records = [];
  const tuples = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    if (!/\b119-21\b/.test(rawLine)) continue;
    const fields = rawLine.trim().split(/\s{2,}/);
    const lawIndex = fields.indexOf("119-21");
    if (lawIndex < 2 || fields.length < lawIndex + 3) {
      throw new Error(`Could not parse Public Law 119-21 classification row: ${rawLine.trim()}`);
    }
    const [uscTitle, uscSection] = fields;
    const description = fields.slice(2, lawIndex).join(" ").replace(/\s+/g, " ").trim();
    const publicLawSection = fields[lawIndex + 1];
    const statutePages = fields.slice(lawIndex + 2).join(" ");
    if (!/^(?:\d+|A)$/.test(uscTitle)
      || !/^[A-Za-z0-9.-]+$/.test(uscSection)
      || !isClassificationDescription(description)
      || !isPublicLawSectionReference(publicLawSection)
      || !/^\d+(?:\s*[-,]\s*\d+)*$/.test(statutePages)) {
      throw new Error(`Invalid Public Law 119-21 classification row: ${rawLine.trim()}`);
    }
    const record = {
      uscTitle,
      uscSection,
      description,
      publicLaw: "119-21",
      publicLawSection,
      statutePages,
    };
    const tuple = JSON.stringify(record);
    if (tuples.has(tuple)) {
      throw new Error(`Duplicate Public Law 119-21 classification row: ${rawLine.trim()}`);
    }
    tuples.add(tuple);
    records.push(record);
  }
  if (!records.length) {
    throw new Error("OLRC classification document contains no Public Law 119-21 rows.");
  }
  return records;
}

function isClassificationDescription(value) {
  if (value === "") return true;
  if (/^tr (?:to|fr) (?:\d+|A)\/[A-Za-z0-9.-]+$/.test(value)) return true;
  const atom = String.raw`(?:nt(?: \[tbl\]| ed chg)?|ed chg|gen amd|prec|fr|to|new|omitted|repealed)`;
  return new RegExp(`^${atom}(?: ${atom})*$`).test(value);
}

function isPublicLawSectionReference(value) {
  const quoted = value.match(/^(.*?) "([A-Za-z0-9 .-]+)"$/);
  const reference = quoted ? quoted[1] : value;
  if (value.includes('"') && !quoted) return false;
  const group = String.raw`\([A-Za-z0-9]+\)`;
  const groups = `(?:${group})*`;
  const relative = `(?:${group})+`;
  const full = `\\d+${groups}`;
  const endpoint = `(?:${full}|${relative})`;
  const first = `${full}(?:-${endpoint})?`;
  const following = `${endpoint}(?:-${endpoint})?`;
  return new RegExp(`^${first}(?:, ${following})*$`).test(reference);
}

function validateMetadataEntry(entry, seenSections, seenTopics) {
  if (!entry || typeof entry !== "object"
    || !/^\d+$/.test(entry.sectionId)
    || !Number.isInteger(entry.topicId) || entry.topicId <= 0
    || typeof entry.title !== "string"
    || entry.title.match(/^Sec\.\s+(\d+)\./)?.[1] !== entry.sectionId
    || entry.sourceUrl !== `https://forum.repealobbba.org/t/${entry.topicId}`
    || !Array.isArray(entry.normalizedTags)
    || entry.normalizedTags.some((tag) => typeof tag !== "string")
    || seenSections.has(entry.sectionId)
    || seenTopics.has(entry.topicId)) {
    throw new Error("Forum metadata contains an invalid or duplicate identity.");
  }
  seenSections.add(entry.sectionId);
  seenTopics.add(entry.topicId);
}

function htmlToText(value) {
  if (!/<[a-z!/][^>]*>/i.test(value)) return value;
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:pre|p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
