import { createHash } from "node:crypto";

export function buildLawAsAmendedForumMetadata({
  navigationText,
  diagnosticReportText,
  expectedNavigationSha256,
  expectedDiagnosticReportSha256,
}) {
  requireHash(navigationText, expectedNavigationSha256, "navigation");
  requireHash(diagnosticReportText, expectedDiagnosticReportSha256, "diagnostic report");
  const navigation = parseJson(navigationText, "navigation");
  const report = parseJson(diagnosticReportText, "diagnostic report");
  const lens = navigation?.lenses?.find((candidate) => candidate.key === "law-as-amended");
  if (!lens) throw new Error("Navigation does not contain the Law as Amended lens.");
  const nodes = sectionNodes(lens.nodes);
  if (nodes.length !== 309) {
    throw new Error(`Law as Amended metadata requires 309 navigation sections; found ${nodes.length}.`);
  }
  const navigationTopicIds = new Set();
  const navigationSectionIds = new Set();
  for (const node of nodes) {
    const identity = sectionId(node.label);
    if (!Number.isInteger(node.topicId) || node.topicId <= 0 || navigationTopicIds.has(node.topicId)) {
      throw new Error("Law as Amended navigation contains an invalid or duplicate topic identity.");
    }
    if (navigationSectionIds.has(identity)) {
      throw new Error("Law as Amended navigation contains a duplicate section identity.");
    }
    navigationTopicIds.add(node.topicId);
    navigationSectionIds.add(identity);
  }
  if (report?.mode !== "obbba-law-as-amended-plan"
    || report?.summary?.total !== 309
    || !Array.isArray(report.entries)
    || report.entries.length !== 309) {
    throw new Error("Diagnostic report does not contain the expected 309-topic observation set.");
  }
  const observations = uniqueMap(report.entries, "diagnostic report");
  if (navigationTopicIds.size !== observations.size
    || [...navigationTopicIds].some((topicId) => !observations.has(topicId))) {
    throw new Error("Navigation and diagnostic report topic identity sets differ.");
  }
  const entries = nodes.map((node) => {
    const observation = observations.get(node.topicId);
    if (!observation) throw new Error(`Diagnostic report is missing topic ${node.topicId}.`);
    if (observation.title !== node.label
      || observation.sectionId !== sectionId(node.label)
      || observation.sourceUrl !== `https://forum.repealobbba.org/t/${node.topicId}`) {
      throw new Error(`Forum metadata identity drift for topic ${node.topicId}.`);
    }
    const normalizedTags = strictTags(observation.normalizedTags, node.topicId);
    return {
      sectionId: observation.sectionId,
      topicId: node.topicId,
      title: node.label,
      sourceUrl: observation.sourceUrl,
      normalizedTags,
    };
  });
  return {
    version: 1,
    mode: "law-as-amended-forum-metadata-only",
    authorityBoundary: {
      forumProvides: ["title", "tags", "topic-identity", "discussion-binding"],
      forumDoesNotProvide: [
        "current-law-text",
        "amendment-history",
        "prior-law-text",
        "official-citations",
      ],
    },
    inputs: {
      navigationSha256: sha256(navigationText),
      diagnosticReportSha256: sha256(diagnosticReportText),
    },
    summary: {
      total: entries.length,
      placeholderTagged: entries.filter((entry) =>
        entry.normalizedTags.some((tag) => tag === "needs-text" || tag === "needs-work")
      ).length,
    },
    entries,
  };
}

function sectionNodes(nodes) {
  return (nodes ?? []).flatMap((node) => [
    ...(node.kind === "section" ? [node] : []),
    ...sectionNodes(node.children),
  ]);
}

function uniqueMap(entries, label) {
  const output = new Map();
  for (const entry of entries) {
    if (!Number.isInteger(entry?.topicId) || entry.topicId <= 0 || output.has(entry.topicId)) {
      throw new Error(`${label} contains an invalid or duplicate topic identity.`);
    }
    output.set(entry.topicId, entry);
  }
  return output;
}

function strictTags(tags, topicId) {
  if (!Array.isArray(tags)
    || tags.some((tag) => typeof tag !== "string" || !tag || tag !== tag.toLowerCase())
    || new Set(tags).size !== tags.length) {
    throw new Error(`Topic ${topicId} has invalid normalized tags.`);
  }
  return [...tags];
}

function sectionId(label) {
  const match = /^Sec\.\s+(\d+)\./.exec(label);
  if (!match) throw new Error(`Law as Amended title lacks a section identity: ${label}.`);
  return match[1];
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function requireHash(text, expected, label) {
  if (!/^[a-f0-9]{64}$/.test(expected) || sha256(text) !== expected) {
    throw new Error(`Approved ${label} byte commitment does not match.`);
  }
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}
