import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../packages/astro-discussion-bridge/package.json", import.meta.url),
);
const { XMLParser, XMLValidator } = require("fast-xml-parser");

const EXCLUDED_ELEMENTS = new Set(["notes", "sourceCredit"]);
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  trimValues: false,
});

export function operativeLegalTextCommitment(fragment) {
  const parsed = parseSection(fragment);
  const tokens = [];
  collectText(parsed[0].section, tokens, ["section"]);
  const normalizedText = normalizeOperativeText(tokens.join(" "));
  if (!normalizedText) {
    throw new Error("USC section has no operative legal text.");
  }
  return {
    profile: "uslm-operative-text-v1",
    characters: normalizedText.length,
    words: normalizedText.split(" ").length,
    sha256: sha256(normalizedText),
  };
}

export function publicLaw11921EditorialEvidence(fragment) {
  const parsed = parseSection(fragment);
  const sourceCreditLinks = new Set();
  const noteLinks = new Set();
  const statusHeadingLinks = new Set();
  const sectionStatus = parsed[0][":@"]?.["@_status"];
  for (const child of parsed[0].section) {
    if (Object.hasOwn(child, "sourceCredit")) {
      collectPublicLawLinks(child.sourceCredit, sourceCreditLinks);
    } else if (Object.hasOwn(child, "notes")) {
      collectPublicLawLinks(child.notes, noteLinks);
    } else if (sectionStatus === "repealed"
      && Object.hasOwn(child, "heading")) {
      collectPublicLawLinks(child.heading, statusHeadingLinks);
    }
  }
  const links = [...new Set([
    ...sourceCreditLinks,
    ...noteLinks,
    ...statusHeadingLinks,
  ])].sort();
  const referencedObbbaSections = [...new Set(
    links.map((href) => /\/s(\d+[A-Za-z]?)(?:\/|$)/.exec(href)?.[1])
      .filter(Boolean),
  )].sort((left, right) =>
    left.localeCompare(right, "en", { numeric: true }));
  return {
    profile: "uslm-pl119-21-editorial-links-v2",
    statusHeadingLinks: [...statusHeadingLinks].sort(),
    sourceCreditLinks: [...sourceCreditLinks].sort(),
    noteLinks: [...noteLinks].sort(),
    referencedObbbaSections,
  };
}

export function compareVersionCommitments(versions) {
  const required = ["prior", "before", "after", "current"];
  if (!versions || required.some((role) => !versions[role])) {
    throw new Error("USC comparison requires four version commitments.");
  }
  return {
    incorporationWindow: comparePair(versions.before, versions.after),
    broadHistorical: comparePair(versions.prior, versions.current),
    laterEvolution: comparePair(versions.after, versions.current),
  };
}

function comparePair(from, to) {
  validateVersionCommitment(from);
  validateVersionCommitment(to);
  if (from.state === "absent" && to.state === "absent") return "absent";
  if (from.state === "absent" && to.state === "present") return "added";
  if (from.state === "present" && to.state === "absent") return "removed";
  return from.operativeTextSha256 === to.operativeTextSha256
    ? "unchanged"
    : "changed";
}

function validateVersionCommitment(value) {
  if (!value || !["present", "absent"].includes(value.state)) {
    throw new Error("USC comparison state must be present or absent.");
  }
  if (value.state === "present") {
    if (value.operativeTextProfile !== "uslm-operative-text-v1"
      || !/^[a-f0-9]{64}$/.test(value.operativeTextSha256 ?? "")) {
      throw new Error(
        "Present comparison states require exact operative-text commitments.",
      );
    }
  } else if (value.operativeTextProfile !== undefined
    || value.operativeTextSha256 !== undefined) {
    throw new Error("Absent comparison states cannot carry operative text.");
  }
}

function collectText(nodes, output, ancestry) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    for (const [name, value] of Object.entries(node)) {
      if (name === ":@") continue;
      if (name === "#text") {
        output.push(String(value));
      } else if (EXCLUDED_ELEMENTS.has(name)) {
        if (ancestry.length !== 1 || ancestry[0] !== "section") {
          throw new Error(
            `USC editorial element has unexpected ancestry: ${name}.`,
          );
        }
      } else {
        collectText(value, output, [...ancestry, name]);
      }
    }
  }
}

function collectPublicLawLinks(nodes, output) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (Object.hasOwn(node, "ref")) {
      const href = node[":@"]?.["@_href"];
      if (typeof href === "string"
        && /^\/us\/pl\/119\/21(?:\/|$)/.test(href)) {
        output.add(href);
      }
    }
    for (const [name, value] of Object.entries(node)) {
      if (name !== ":@" && name !== "#text") {
        collectPublicLawLinks(value, output);
      }
    }
  }
}

function parseSection(fragment) {
  if (typeof fragment !== "string"
    || XMLValidator.validate(fragment) !== true) {
    throw new Error("USC section fragment is not well-formed XML.");
  }
  const parsed = parser.parse(fragment);
  if (!Array.isArray(parsed) || parsed.length !== 1
    || !Object.hasOwn(parsed[0], "section")) {
    throw new Error("USC comparison input must contain one section root.");
  }
  return parsed;
}

function normalizeOperativeText(value) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
