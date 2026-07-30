import {
  mapOfficialReference,
} from "./obbba-law-official-reference-map.mjs";

export function renderOfficialLawPage(planEntry, renderedTargets) {
  throw new Error("Law page prior-state label contract is not approved.");

  if (planEntry.outcome !== "official-law-page-candidate") {
    throw new Error("Law page official outcome is invalid.");
  }
  const expectedTargets = [
    ...planEntry.officialLawTargets,
    ...planEntry.contextTargets,
  ];
  const byIdentity = new Map();
  for (const rendered of renderedTargets) {
    const identity = `${rendered.uscTitle}:${rendered.uscSection}`;
    if (byIdentity.has(identity)) {
      throw new Error("Law page rendered target is duplicated.");
    }
    byIdentity.set(identity, rendered);
  }
  const expectedIdentities = new Set(expectedTargets.map((target) =>
    `${target.uscTitle}:${target.uscSection}`));
  if (byIdentity.size !== expectedIdentities.size
    || [...byIdentity.keys()].some((identity) =>
      !expectedIdentities.has(identity))) {
    throw new Error("Law page rendered target set is invalid.");
  }
  const sections = [];
  for (const [label, targets] of [
    ["Official-law target", planEntry.officialLawTargets],
    ["Classification-context target", planEntry.contextTargets],
  ]) {
    for (const target of targets) {
      const rendered = byIdentity.get(
        `${target.uscTitle}:${target.uscSection}`,
      );
      if (!rendered) {
        throw new Error("Law page rendered target is missing.");
      }
      sections.push(renderTarget(label, target, rendered));
    }
  }
  if (!sections.length || planEntry.reviewTargets.length) {
    throw new Error("Law page official candidate target coupling is invalid.");
  }
  return `${frontmatter(planEntry)}\n\n`
    + authorityIntroduction(planEntry)
    + `${sections.join("\n\n---\n\n")}\n`;
}

function frontmatter(entry) {
  return [
    "---",
    `title: ${JSON.stringify(entry.title)}`,
    `sectionId: ${JSON.stringify(entry.sectionId)}`,
    'contentLens: "law-as-amended"',
    `discourseTopicId: ${entry.topicId}`,
    `discourseTopicUrl: ${JSON.stringify(entry.discussionUrl)}`,
    `discussionUrl: ${JSON.stringify(entry.discussionUrl)}`,
    'discussionCommentsDisplay: "fullInteractive"',
    "discussionSync: false",
    "officialSourceManaged: true",
    'officialSourceAuthority: "govinfo-olrc"',
    "---",
  ].join("\n");
}

function authorityIntroduction(entry) {
  return "## Authority and scope\n\n"
    + `Enacted authority: [${entry.enactedAuthority.law}, Section `
    + `${entry.enactedAuthority.section}]`
    + `(${entry.enactedAuthority.sourceUrl}). `
    + "The release comparisons below describe documented legal-text states. "
    + "They do not, by themselves, establish why a change occurred.\n\n";
}

function renderTarget(label, target, rendered) {
  if (!rendered.current
    || Boolean(rendered.before) !== rendered.beforeExpected
    || target.laterEvolutionWarning
      !== (target.comparisons.laterEvolution === "changed")) {
    throw new Error("Law page target state coupling is invalid.");
  }
  const heading = `${label}: ${target.uscTitle} U.S.C. § ${target.uscSection}`;
  const status = rendered.currentStatus === "repealed"
    ? "\n\n> **Current status:** Repealed in the reviewed current source."
    : "";
  const warning = target.laterEvolutionWarning
    ? "\n\n> **Later-evolution notice:** The reviewed current release differs "
      + "from the immediate post-incorporation release. This page does not "
      + "attribute that later difference to OBBBA."
    : "";
  return `## ${escapeHeading(heading)}${status}\n\n`
    + `### Current law\n\n${rendered.current.body}\n\n`
    + "### Neutral release comparison\n\n"
    + `- Incorporation window: ${target.comparisons.incorporationWindow}\n`
    + `- Broader historical comparison: ${target.comparisons.broadHistorical}\n`
    + `- Later evolution: ${target.comparisons.laterEvolution}`
    + `${warning}\n\n`
    + "### Official attribution evidence\n\n"
    + `${renderAttributionEvidence(target)}`;
}

function renderAttributionEvidence(target) {
  const lines = [];
  for (const classification of target.classifications) {
    const description = classification.description
      ? `; classification: ${classification.description}`
      : "";
    lines.push(
      `- Public Law section ${classification.publicLawSection}; `
      + `Statutes at Large page(s) ${classification.statutePages}${description}`,
    );
  }
  const originals = new Set();
  for (const role of ["after", "current"]) {
    const evidence = target.editorialEvidence[role];
    for (const href of [
      ...evidence.statusHeadingLinks,
      ...evidence.sourceCreditLinks,
      ...evidence.noteLinks,
    ]) originals.add(href);
  }
  for (const href of [...originals].sort()) {
    const mapped = mapOfficialReference(href, { releaseRole: "current" });
    if (mapped.resolution === "verified-official-link") {
      lines.push(`- [Official source reference](${mapped.mappedUrl})`);
    } else {
      lines.push(`- Official source reference: \`${href}\` `
        + "(preserved without an unreviewed navigation URL)");
    }
  }
  if (!lines.length) {
    throw new Error("Law page official attribution evidence is empty.");
  }
  return lines.join("\n");
}

function escapeHeading(value) {
  return value.replace(/([\\`*_[\]<>#])/g, "\\$1");
}
