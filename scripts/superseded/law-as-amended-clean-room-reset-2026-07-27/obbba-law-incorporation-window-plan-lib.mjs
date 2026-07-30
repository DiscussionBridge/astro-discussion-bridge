import { createHash } from "node:crypto";

const AUTHORITY_MAP_SHA256 =
  "977639eacd190746b9bf347fb933bf7434cbf80891d1b7255007c9daf2edcf26";
const BEFORE_RELEASE = "119-27not21";
const AFTER_RELEASE = "119-31";

export function buildObbbaLawIncorporationWindowPlan({ authorityMapText }) {
  if (sha256(authorityMapText) !== AUTHORITY_MAP_SHA256) {
    throw new Error("Approved OBBBA Law authority-map byte commitment does not match.");
  }
  const map = parseJson(authorityMapText);
  if (map?.version !== 1
    || map?.mode !== "obbba-law-official-authority-map"
    || map?.summary?.total !== 309
    || map?.summary?.classifiedToUsCode !== 227
    || map?.summary?.classificationRows !== 635
    || !Array.isArray(map.entries) || map.entries.length !== 309) {
    throw new Error("Authority map has an unexpected schema or summary.");
  }
  const targetsByTitle = new Map();
  const identities = new Set();
  for (const entry of map.entries) {
    if (!/^\d+$/.test(entry.sectionId) || !Array.isArray(entry.classifications)) {
      throw new Error("Authority map contains an invalid section entry.");
    }
    for (const classification of entry.classifications) {
      const { uscTitle, uscSection } = classification;
      if (!/^\d{1,2}$/.test(uscTitle)
        || !/^[A-Za-z0-9.-]+$/.test(uscSection)) {
        throw new Error("Authority map contains an unsupported USC target.");
      }
      const identity = `${uscTitle}:${uscSection}`;
      identities.add(identity);
      const sections = targetsByTitle.get(uscTitle) ?? new Set();
      sections.add(uscSection);
      targetsByTitle.set(uscTitle, sections);
    }
  }
  const titles = [...targetsByTitle.entries()]
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([uscTitle, sections]) => ({
      uscTitle,
      targetSections: [...sections].sort(sectionSort),
      before: releaseSource("before-obbba-incorporation", BEFORE_RELEASE, uscTitle),
      after: releaseSource("first-later-release", AFTER_RELEASE, uscTitle),
    }));
  if (titles.length !== 20 || identities.size !== 332) {
    throw new Error("Authority map did not produce the reviewed 20-title/332-target set.");
  }
  return {
    version: 1,
    mode: "obbba-law-incorporation-window-input-plan",
    attributionRule:
      "Release differences are state evidence only; OBBBA attribution requires "
      + "Public Law 119-21 classification/enacted-law evidence.",
    inputs: { authorityMapSha256: AUTHORITY_MAP_SHA256 },
    releases: {
      before: {
        releasePoint: BEFORE_RELEASE,
        meaning: "last OLRC release expressly excluding Public Law 119-21",
        indexUrl:
          "https://uscode.house.gov/download/releasepoints/us/pl/119/27not21/"
          + "usc-rp@119-27not21.htm",
      },
      after: {
        releasePoint: AFTER_RELEASE,
        meaning: "first later OLRC release incorporating Public Law 119-21",
        limitation: "also includes intervening public laws through 119-31",
        indexUrl:
          "https://uscode.house.gov/download/releasepoints/us/pl/119/31/"
          + "usc-rp@119-31.htm",
      },
    },
    summary: {
      titles: titles.length,
      uniqueUscTargets: identities.size,
      sourceArchives: titles.length * 2,
    },
    titles,
  };
}

export function validateObbbaLawIncorporationWindowPlan(
  value,
  { authorityMapText },
) {
  const expected = buildObbbaLawIncorporationWindowPlan({ authorityMapText });
  if (stableJson(value) !== stableJson(expected)) {
    throw new Error("Incorporation-window plan does not match its authority map.");
  }
  return value;
}

function releaseSource(role, releasePoint, uscTitle) {
  const title = uscTitle.padStart(2, "0");
  const directory = releasePoint === BEFORE_RELEASE ? "27not21" : "31";
  return {
    role,
    releasePoint,
    archiveUrl:
      `https://uscode.house.gov/download/releasepoints/us/pl/119/${directory}/`
      + `xml_usc${title}@${releasePoint}.zip`,
    expectedArchiveEntry: `usc${title}.xml`,
  };
}

function sectionSort(left, right) {
  return left.localeCompare(right, "en", { numeric: true });
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Authority map is not valid JSON.");
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
