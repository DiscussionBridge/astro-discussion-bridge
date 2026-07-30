import { createHash } from "node:crypto";

export const CURRENT_INDEX_RELEASE = "119-102not101";
export const CURRENT_RELEASE = "119-102";
export const PRIOR_RELEASE = "118-250not159";
export const AUTHORITY_MAP_SHA256 =
  "977639eacd190746b9bf347fb933bf7434cbf80891d1b7255007c9daf2edcf26";

export function buildObbbaLawUscReleasePlan({ authorityMapText }) {
  if (sha256(authorityMapText) !== AUTHORITY_MAP_SHA256) {
    throw new Error("Approved OBBBA Law authority-map byte commitment does not match.");
  }
  const authorityMap = parseJson(authorityMapText, "authority map");
  validateAuthorityMap(authorityMap);

  const byTitle = new Map();
  for (const entry of authorityMap.entries) {
    for (const classification of entry.classifications) {
      const title = classification.uscTitle;
      if (!/^(?:[1-9]|[1-4]\d|5[0-4]|A)$/.test(title)) {
        throw new Error(`Unsupported U.S. Code title identity: ${title}.`);
      }
      const titleEntry = byTitle.get(title) ?? {
        uscTitle: title,
        obbbaSections: new Set(),
        classificationRows: 0,
      };
      titleEntry.obbbaSections.add(entry.sectionId);
      titleEntry.classificationRows += 1;
      byTitle.set(title, titleEntry);
    }
  }

  const titles = [...byTitle.values()]
    .sort((left, right) => titleSort(left.uscTitle) - titleSort(right.uscTitle))
    .map((entry) => ({
      uscTitle: entry.uscTitle,
      obbbaSections: [...entry.obbbaSections].sort(sectionSort),
      classificationRows: entry.classificationRows,
      current: releaseSource(CURRENT_RELEASE, entry.uscTitle, true),
      prior: releaseSource(PRIOR_RELEASE, entry.uscTitle, false),
    }));

  if (!titles.length) {
    throw new Error("Authority map contains no classified U.S. Code titles.");
  }

  return {
    version: 3,
    mode: "obbba-law-usc-release-input-plan",
    authorityBoundary: {
      forum: "title-tags-topic-binding-only",
      currentLaw: "OLRC current U.S. Code XML release",
      priorLaw: "OLRC pre-OBBBA U.S. Code XML release",
      enactedLaw: "GovInfo Public Law 119-21",
    },
    inputs: {
      authorityMapSha256: AUTHORITY_MAP_SHA256,
    },
    releases: {
      current: {
        indexReleasePoint: CURRENT_INDEX_RELEASE,
        titleReleasePoint: CURRENT_RELEASE,
        indexUrl: "https://uscode.house.gov/download/download.shtml",
      },
      prior: {
        releasePoint: PRIOR_RELEASE,
        indexUrl:
          "https://uscode.house.gov/download/releasepoints/us/pl/118/250not159/"
          + "usc-rp%40118-250not159.htm",
      },
    },
    summary: {
      titles: titles.length,
      classifiedSections: authorityMap.summary.classifiedToUsCode,
      classificationRows: authorityMap.summary.classificationRows,
      sourceArchives: titles.length * 2,
    },
    titles,
  };
}

export function validateObbbaLawUscReleasePlan(value, { authorityMapText }) {
  const expected = buildObbbaLawUscReleasePlan({ authorityMapText });
  if (stableJson(value) !== stableJson(expected)) {
    throw new Error("U.S. Code release plan does not match its authority-map input.");
  }
  return value;
}

function validateAuthorityMap(value) {
  if (!value || value.version !== 1
    || value.mode !== "obbba-law-official-authority-map"
    || value.summary?.total !== 309
    || value.summary?.classifiedToUsCode !== 227
    || value.summary?.noUsCodeClassificationRecord !== 82
    || value.summary?.classificationRows !== 635
    || !Array.isArray(value.entries) || value.entries.length !== 309) {
    throw new Error("Authority map has an unexpected schema or summary.");
  }
  const sections = new Set();
  const topics = new Set();
  let classified = 0;
  let rows = 0;
  for (const entry of value.entries) {
    if (!entry || !/^\d+$/.test(entry.sectionId)
      || !Number.isInteger(entry.topicId) || entry.topicId <= 0
      || sections.has(entry.sectionId) || topics.has(entry.topicId)
      || !Array.isArray(entry.classifications)) {
      throw new Error("Authority map contains an invalid or duplicate identity.");
    }
    sections.add(entry.sectionId);
    topics.add(entry.topicId);
    rows += entry.classifications.length;
    if (entry.classifications.length) classified += 1;
    for (const record of entry.classifications) {
      if (!record || typeof record.uscTitle !== "string"
        || typeof record.uscSection !== "string"
        || record.publicLaw !== "119-21"
        || typeof record.publicLawSection !== "string") {
        throw new Error("Authority map contains an invalid classification commitment.");
      }
    }
  }
  if (classified !== value.summary.classifiedToUsCode
    || rows !== value.summary.classificationRows) {
    throw new Error("Authority map summary does not match its entries.");
  }
}

function releaseSource(releasePoint, title, current) {
  const fileTitle = title === "A" ? "appendix" : title.padStart(2, "0");
  const base = current
    ? "https://uscode.house.gov/download/releasepoints/us/pl/119/102"
    : `https://uscode.house.gov/download/releasepoints/us/pl/118/250not159`;
  return {
    releasePoint,
    archiveUrl: `${base}/xml_usc${fileTitle}@${releasePoint}.zip`,
    expectedArchiveEntry: `usc${fileTitle}.xml`,
  };
}

function titleSort(value) {
  return value === "A" ? 100 : Number(value);
}

function sectionSort(left, right) {
  return Number(left) - Number(right) || left.localeCompare(right);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
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
