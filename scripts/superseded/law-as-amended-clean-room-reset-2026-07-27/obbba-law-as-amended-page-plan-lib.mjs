const SHA256 = /^[a-f0-9]{64}$/;
const SECTION = /^\d+[A-Za-z]?$/;
const USC_SECTION = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const FORUM_TOPIC = /^https:\/\/forum\.repealobbba\.org\/t\/(\d+)$/;
const DESCRIPTION =
  /^(?:|gen amd|new|nt|nt \[tbl\]|nt new|prec|prec new|repealed|tr (?:fr|to) \d+\/[A-Za-z0-9.-]+)$/;
const COMPARISONS = ["unchanged", "changed", "added", "removed"];
const EVIDENCE_PROFILE = "uslm-pl119-21-editorial-links-v2";

export function buildLawAsAmendedPagePlan({
  forumMetadata,
  authorityMap,
  attributionIndex,
  inputHashes,
}) {
  validateInputHashes(inputHashes);
  const forumBySection = validateForumMetadata(forumMetadata);
  const { authorityBySection, authorityTargets } =
    validateAuthorityMap(authorityMap);
  const attributionByTarget =
    validateAttributionIndex(attributionIndex, authorityTargets);
  requireExactSets(forumBySection, authorityBySection, "forum/authority");

  const entries = [];
  const topicIds = new Set();
  const outputPaths = new Set();
  for (const sectionId of [...forumBySection.keys()].sort(sectionSort)) {
    const forum = forumBySection.get(sectionId);
    const authority = authorityBySection.get(sectionId);
    requireForumAuthorityBinding(forum, authority);
    if (topicIds.has(forum.topicId)) {
      throw new Error(`Law page plan topic identity is duplicated: ${forum.topicId}.`);
    }
    topicIds.add(forum.topicId);
    const titleTags = forum.normalizedTags.filter((tag) =>
      /^title-(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/.test(tag));
    if (titleTags.length !== 1) {
      throw new Error(`Law page plan requires exactly one title tag: ${sectionId}.`);
    }
    const pageTitle = forum.title.replace(/\s*\|\s*Law as Amended\s*$/i, "");
    const slug = slugify(pageTitle);
    if (!slug) {
      throw new Error(`Law page plan title has no safe slug: ${sectionId}.`);
    }
    const outputPath = `law-as-amended/${titleTags[0]}/${slug}.md`;
    if (!/^law-as-amended\/title-(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(
      outputPath,
    )) {
      throw new Error(`Law page plan output path is unsafe: ${sectionId}.`);
    }
    const outputIdentity = outputPath.toLowerCase();
    if (outputPaths.has(outputIdentity)) {
      throw new Error(`Law page plan output path is duplicated: ${outputPath}.`);
    }
    outputPaths.add(outputIdentity);

    const officialLawTargets = [];
    const contextTargets = [];
    const reviewTargets = [];
    for (const target of groupSectionTargets(authority.classifications)) {
      const attribution = attributionByTarget.get(targetIdentity(target));
      if (!attribution || !attribution.obbbaSections.includes(sectionId)) {
        throw new Error(`Law page plan attribution binding is missing: ${sectionId}.`);
      }
      const item = projectTarget(target, attribution);
      const explicitMatch =
        attribution.evidenceState === "explicit-editorial-evidence"
        && attribution.matchedObbbaSections.includes(sectionId);
      const contextOnly =
        attribution.evidenceState === "classification-context-only"
        && target.classifications.every(({ description }) =>
          description === "prec" || description === "prec new")
        && Object.values(attribution.comparisons)
          .every((value) => value === "unchanged");
      if (explicitMatch) officialLawTargets.push(item);
      else if (contextOnly) contextTargets.push(item);
      else reviewTargets.push(item);
    }
    const outcome = deriveOutcome({
      classificationStatus: authority.classificationStatus,
      officialLawTargets,
      contextTargets,
      reviewTargets,
    });
    entries.push({
      sectionId,
      topicId: forum.topicId,
      title: pageTitle,
      discussionUrl: forum.sourceUrl,
      normalizedTags: [...forum.normalizedTags],
      outputPath,
      outcome,
      enactedAuthority: {
        law: authority.enactedAuthority.law,
        section: authority.enactedAuthority.section,
        sourceUrl: authority.enactedAuthority.sourceUrl,
      },
      officialLawTargets,
      contextTargets,
      reviewTargets,
    });
  }
  const summary = summarize(entries);
  const plan = {
    version: 1,
    mode: "obbba-law-as-amended-page-input-plan",
    authorityBoundary: {
      forum: "title-tags-topic-and-discussion-binding-only",
      law: "official-sources-only",
      comparison:
        "state evidence only; causation requires explicit authority evidence",
    },
    inputs: { ...inputHashes },
    summary,
    entries,
  };
  rejectForbiddenSerializedContent(plan);
  return plan;
}

function validateInputHashes(value) {
  exactKeys(value, [
    "forumMetadataSha256",
    "authorityMapSha256",
    "attributionIndexSha256",
  ], "input commitments");
  if (Object.values(value).some((hash) => !SHA256.test(hash))) {
    throw new Error("Law page plan input commitments are invalid.");
  }
}

function validateForumMetadata(value) {
  exactKeys(value, [
    "version", "mode", "authorityBoundary", "inputs", "summary", "entries",
  ], "forum metadata");
  if (value.version !== 1 || value.mode !== "law-as-amended-forum-metadata-only"
    || value.summary?.total !== 309 || value.entries?.length !== 309) {
    throw new Error("Law page plan forum metadata is invalid.");
  }
  const result = new Map();
  const topics = new Set();
  for (const entry of value.entries) {
    exactKeys(entry, [
      "sectionId", "topicId", "title", "sourceUrl", "normalizedTags",
    ], "forum entry");
    const match = FORUM_TOPIC.exec(entry.sourceUrl);
    if (!SECTION.test(entry.sectionId) || !Number.isInteger(entry.topicId)
      || entry.topicId < 1 || match?.[1] !== String(entry.topicId)
      || typeof entry.title !== "string" || !entry.title.trim()
      || !Array.isArray(entry.normalizedTags)
      || entry.normalizedTags.some((tag) => typeof tag !== "string")
      || new Set(entry.normalizedTags).size !== entry.normalizedTags.length
      || result.has(entry.sectionId) || topics.has(entry.topicId)) {
      throw new Error("Law page plan forum identity is invalid.");
    }
    result.set(entry.sectionId, entry);
    topics.add(entry.topicId);
  }
  return result;
}

function validateAuthorityMap(value) {
  exactKeys(value, [
    "version", "mode", "sources", "inputs", "summary", "entries",
  ], "authority map");
  if (value.version !== 1 || value.mode !== "obbba-law-official-authority-map"
    || value.summary?.total !== 309
    || value.summary?.classifiedToUsCode !== 227
    || value.summary?.noUsCodeClassificationRecord !== 82
    || value.summary?.classificationRows !== 635
    || value.entries?.length !== 309) {
    throw new Error("Law page plan authority map is invalid.");
  }
  const authorityBySection = new Map();
  const authorityTargets = new Map();
  const tuples = new Set();
  let classified = 0;
  let unclassified = 0;
  let rows = 0;
  for (const entry of value.entries) {
    exactKeys(entry, [
      "sectionId", "topicId", "title", "discussionUrl", "normalizedTags",
      "classificationStatus", "classifications", "enactedAuthority",
    ], "authority entry");
    exactKeys(entry.enactedAuthority, ["law", "section", "sourceUrl"],
      "enacted authority");
    const validStatus =
      entry.classificationStatus === "classified-to-us-code"
      || entry.classificationStatus === "no-us-code-classification-record";
    if (!SECTION.test(entry.sectionId) || authorityBySection.has(entry.sectionId)
      || !validStatus || !Array.isArray(entry.classifications)
      || entry.enactedAuthority.law !== "Public Law 119-21"
      || entry.enactedAuthority.section !== entry.sectionId
      || entry.enactedAuthority.sourceUrl
        !== "https://www.govinfo.gov/app/details/PLAW-119publ21") {
      throw new Error("Law page plan authority identity is invalid.");
    }
    if (entry.classificationStatus === "classified-to-us-code") {
      if (!entry.classifications.length) throw new Error("Classified section is empty.");
      classified += 1;
    } else {
      if (entry.classifications.length) throw new Error("Unclassified section has rows.");
      unclassified += 1;
    }
    for (const row of entry.classifications) {
      validateClassification(row);
      const tuple = JSON.stringify([entry.sectionId, ...Object.values(row)]);
      if (tuples.has(tuple)) throw new Error("Classification tuple is duplicated.");
      tuples.add(tuple);
      rows += 1;
      const identity = targetIdentity(row);
      const target = authorityTargets.get(identity) ?? {
        uscTitle: row.uscTitle, uscSection: row.uscSection,
        obbbaSections: new Set(), classifications: [],
      };
      target.obbbaSections.add(entry.sectionId);
      target.classifications.push({
        obbbaSection: entry.sectionId,
        description: row.description,
        publicLawSection: row.publicLawSection,
      });
      authorityTargets.set(identity, target);
    }
    authorityBySection.set(entry.sectionId, entry);
  }
  if (classified !== 227 || unclassified !== 82 || rows !== 635
    || authorityTargets.size !== 332) {
    throw new Error("Law page plan authority counts do not recompute.");
  }
  for (const target of authorityTargets.values()) {
    target.classifications.sort((left, right) =>
      sectionSort(left.obbbaSection, right.obbbaSection)
      || left.publicLawSection.localeCompare(right.publicLawSection));
  }
  return { authorityBySection, authorityTargets };
}

function validateClassification(row) {
  exactKeys(row, [
    "uscTitle", "uscSection", "description", "publicLaw",
    "publicLawSection", "statutePages",
  ], "classification");
  if (!/^[1-9]\d*$/.test(row.uscTitle) || !USC_SECTION.test(row.uscSection)
    || !DESCRIPTION.test(row.description) || row.publicLaw !== "119-21"
    || typeof row.publicLawSection !== "string"
    || typeof row.statutePages !== "string") {
    throw new Error("Law page plan classification is invalid.");
  }
}

function validateAttributionIndex(value, authorityTargets) {
  exactKeys(value, [
    "version", "mode", "authorityBoundary", "inputs", "summary", "entries",
  ], "attribution index");
  exactKeys(value.inputs, [
    "authoritySha256", "sectionStoreEvidenceSha256", "comparisonSha256",
  ], "attribution inputs");
  if (value.version !== 2
    || value.mode !== "obbba-law-usc-attribution-evidence-index"
    || value.summary?.targets !== 332 || value.entries?.length !== 332) {
    throw new Error("Law page plan attribution index is invalid.");
  }
  const result = new Map();
  const states = {};
  for (const entry of value.entries) {
    exactKeys(entry, [
      "uscTitle", "uscSection", "obbbaSections", "classifications",
      "comparisons", "editorialEvidence", "referencedObbbaSections",
      "matchedObbbaSections", "evidenceState",
    ], "attribution entry");
    const identity = targetIdentity(entry);
    if (!authorityTargets.has(identity) || result.has(identity)) {
      throw new Error(`Law page plan attribution identity is invalid: ${identity}.`);
    }
    validateStringArray(entry.obbbaSections, SECTION, "OBBBA sections");
    validateStringArray(entry.referencedObbbaSections, SECTION, "referenced sections");
    validateStringArray(entry.matchedObbbaSections, SECTION, "matched sections");
    exactKeys(entry.comparisons,
      ["incorporationWindow", "broadHistorical", "laterEvolution"],
      "comparisons");
    if (Object.values(entry.comparisons).some((item) => !COMPARISONS.includes(item))) {
      throw new Error("Law page plan comparison is invalid.");
    }
    exactKeys(entry.editorialEvidence, ["after", "current"], "editorial evidence");
    for (const role of ["after", "current"]) validateEditorial(entry.editorialEvidence[role]);
    if (!["explicit-editorial-evidence", "classification-context-only",
      "review-required"].includes(entry.evidenceState)) {
      throw new Error("Law page plan evidence state is invalid.");
    }
    const expected = authorityTargets.get(identity);
    const expectedSections = [...expected.obbbaSections].sort(sectionSort);
    const allLinks = [...new Set(["after", "current"].flatMap((role) => [
      ...entry.editorialEvidence[role].statusHeadingLinks,
      ...entry.editorialEvidence[role].sourceCreditLinks,
      ...entry.editorialEvidence[role].noteLinks,
    ]))].sort();
    const roleReferences = {};
    for (const role of ["after", "current"]) {
      roleReferences[role] = sectionsFromEditorialLinks(
        entry.editorialEvidence[role],
      );
      if (!same(entry.editorialEvidence[role].referencedObbbaSections,
        roleReferences[role])) {
        throw new Error(`Law page plan editorial binding drift: ${role}:${identity}.`);
      }
    }
    const referenced = [...new Set([
      ...roleReferences.after,
      ...roleReferences.current,
    ])].sort(sectionSort);
    const matched = referenced
      .filter((section) => expected.obbbaSections.has(section));
    const descriptions = expected.classifications.map(({ description }) =>
      description);
    const expectedState = allLinks.length
      ? "explicit-editorial-evidence"
      : descriptions.every((description) =>
          description === "prec" || description === "prec new")
        && Object.values(entry.comparisons).every((item) => item === "unchanged")
        ? "classification-context-only"
        : "review-required";
    if (!same(entry.obbbaSections, expectedSections)
      || !same(entry.classifications, expected.classifications)
      || !same(entry.referencedObbbaSections, referenced)
      || !same(entry.matchedObbbaSections, matched)
      || entry.evidenceState !== expectedState) {
      throw new Error(`Law page plan attribution binding drift: ${identity}.`);
    }
    states[entry.evidenceState] = (states[entry.evidenceState] ?? 0) + 1;
    result.set(identity, entry);
  }
  requireExactSets(authorityTargets, result, "authority/attribution");
  if (!same(value.summary.evidenceStates, states)) {
    throw new Error("Law page plan attribution summary does not recompute.");
  }
  return result;
}

function validateEditorial(value) {
  exactKeys(value, [
    "profile", "statusHeadingLinks", "sourceCreditLinks", "noteLinks",
    "referencedObbbaSections",
  ], "editorial commitment");
  if (value.profile !== EVIDENCE_PROFILE) {
    throw new Error("Law page plan editorial profile is invalid.");
  }
  for (const key of ["statusHeadingLinks", "sourceCreditLinks", "noteLinks"]) {
    validateStringArray(value[key], /^\/us\/pl\/119\/21(?:\/|$)/, key);
  }
  validateStringArray(value.referencedObbbaSections, SECTION, "editorial sections");
}

function projectTarget(target, attribution) {
  return {
    uscTitle: target.uscTitle,
    uscSection: target.uscSection,
    classifications: target.classifications.map((item) => ({ ...item })),
    comparisons: { ...attribution.comparisons },
    editorialEvidence: {
      after: projectEditorial(attribution.editorialEvidence.after),
      current: projectEditorial(attribution.editorialEvidence.current),
    },
    matchedObbbaSections: [...attribution.matchedObbbaSections],
    laterEvolutionWarning: attribution.comparisons.laterEvolution === "changed",
  };
}

function projectEditorial(value) {
  return {
    profile: value.profile,
    statusHeadingLinks: [...value.statusHeadingLinks],
    sourceCreditLinks: [...value.sourceCreditLinks],
    noteLinks: [...value.noteLinks],
    referencedObbbaSections: [...value.referencedObbbaSections],
  };
}

function deriveOutcome({
  classificationStatus, officialLawTargets, contextTargets, reviewTargets,
}) {
  if (classificationStatus === "no-us-code-classification-record") {
    if (officialLawTargets.length || contextTargets.length || reviewTargets.length) {
      throw new Error("Enacted-law-only page unexpectedly has USC targets.");
    }
    return "enacted-law-only";
  }
  if (reviewTargets.length) return "review-required";
  if (officialLawTargets.length) return "official-law-page-candidate";
  if (contextTargets.length) return "classification-context-page-candidate";
  throw new Error("Classified page has no coupled target outcome.");
}

function requireForumAuthorityBinding(forum, authority) {
  if (forum.topicId !== authority.topicId || forum.title !== authority.title
    || forum.sourceUrl !== authority.discussionUrl
    || !same(forum.normalizedTags, authority.normalizedTags)) {
    throw new Error(`Law page plan forum/authority binding drift: ${forum.sectionId}.`);
  }
}

function groupSectionTargets(classifications) {
  const targets = new Map();
  for (const row of classifications) {
    const identity = targetIdentity(row);
    const target = targets.get(identity) ?? {
      uscTitle: row.uscTitle, uscSection: row.uscSection, classifications: [],
    };
    target.classifications.push({
      description: row.description,
      publicLawSection: row.publicLawSection,
      statutePages: row.statutePages,
    });
    targets.set(identity, target);
  }
  return [...targets.values()].sort((left, right) =>
    Number(left.uscTitle) - Number(right.uscTitle)
    || sectionSort(left.uscSection, right.uscSection));
}

function summarize(entries) {
  const outcomes = {};
  let officialTargets = 0;
  let contextTargets = 0;
  let reviewTargets = 0;
  let laterEvolutionWarnings = 0;
  for (const entry of entries) {
    outcomes[entry.outcome] = (outcomes[entry.outcome] ?? 0) + 1;
    officialTargets += entry.officialLawTargets.length;
    contextTargets += entry.contextTargets.length;
    reviewTargets += entry.reviewTargets.length;
    laterEvolutionWarnings += [
      ...entry.officialLawTargets,
      ...entry.contextTargets,
      ...entry.reviewTargets,
    ]
      .filter(({ laterEvolutionWarning }) => laterEvolutionWarning).length;
  }
  return {
    pages: entries.length, outcomes, officialTargets, contextTargets,
    reviewTargets, laterEvolutionWarnings,
  };
}

function rejectForbiddenSerializedContent(value) {
  const serialized = JSON.stringify(value);
  if (/"(?:raw|cooked|html|xml|noteText|legalText)"\s*:/.test(serialized)
    || serialized.includes("CONTENT_CANARY")) {
    throw new Error("Law page plan contains forbidden source content.");
  }
}

function validateStringArray(value, grammar, label) {
  if (!Array.isArray(value) || value.some((item) =>
    typeof item !== "string" || !grammar.test(item))
    || new Set(value).size !== value.length) {
    throw new Error(`Law page plan ${label} are invalid.`);
  }
}

function sectionsFromEditorialLinks(value) {
  const sections = [];
  for (const link of [
    ...value.statusHeadingLinks,
    ...value.sourceCreditLinks,
    ...value.noteLinks,
  ]) {
    for (const match of link.matchAll(/\/s(\d+[A-Za-z]?)(?=\/|$)/g)) {
      sections.push(match[1]);
    }
  }
  return [...new Set(sections)].sort(sectionSort);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !same(Object.keys(value).sort(), [...expected].sort())) {
    throw new Error(`Law page plan ${label} schema is invalid.`);
  }
}

function requireExactSets(left, right, label) {
  if (left.size !== right.size
    || [...left.keys()].some((identity) => !right.has(identity))) {
    throw new Error(`Law page plan target-set mismatch: ${label}.`);
  }
}

function targetIdentity(value) {
  return `${value.uscTitle}:${value.uscSection}`;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function slugify(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function sectionSort(left, right) {
  return left.localeCompare(right, "en", { numeric: true });
}
