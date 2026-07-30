import { readFile } from "node:fs/promises";
import { selectUscTargets } from "./obbba-law-usc-section-selector-lib.mjs";

const ROOT = new URL("../", import.meta.url);

const datasets = {
  prior: ".discussionbridge-cache/obbba-law-usc-xml-2026-07-26/documents",
  before: ".discussionbridge-cache/obbba-law-usc-incorporation-xml-2026-07-26/documents",
  after: ".discussionbridge-cache/obbba-law-usc-incorporation-xml-2026-07-26/documents",
  current: ".discussionbridge-cache/obbba-law-usc-xml-2026-07-26/documents",
};

const rolePrefix = {
  prior: "prior",
  before: "before",
  after: "after",
  current: "current",
};

const map = JSON.parse(await readFile(
  new URL(
    "../docs/evidence/OBBBA_LAW_OFFICIAL_AUTHORITY_MAP_2026-07-26.json",
    import.meta.url,
  ),
  "utf8",
));

const targetsByTitle = new Map();
for (const entry of map.entries) {
  for (const classification of entry.classifications) {
    const targets = targetsByTitle.get(classification.uscTitle) ?? new Set();
    targets.add(classification.uscSection);
    targetsByTitle.set(classification.uscTitle, targets);
  }
}

const results = [];
for (const [uscTitle, targets] of [...targetsByTitle.entries()]
  .sort(([left], [right]) => Number(left) - Number(right))) {
  const title = uscTitle.padStart(2, "0");
  const presentByRole = {};
  for (const role of Object.keys(datasets)) {
    const path = new URL(
      `../${datasets[role]}/${rolePrefix[role]}-usc${title}.xml`,
      import.meta.url,
    );
    const xml = await readFile(path, "utf8");
    const identifiers = new Set(
      selectUscTargets(xml, uscTitle, [...targets])
        .filter((entry) => entry.state === "present")
        .map((entry) => entry.uscSection),
    );
    presentByRole[role] = identifiers;
  }
  for (const uscSection of targets) {
    results.push({
      uscTitle,
      uscSection,
      prior: presentByRole.prior.has(uscSection),
      before: presentByRole.before.has(uscSection),
      after: presentByRole.after.has(uscSection),
      current: presentByRole.current.has(uscSection),
    });
  }
  process.stdout.write(`Scanned USC ${uscTitle}: ${targets.size} targets.\n`);
}

const patterns = new Map();
for (const result of results) {
  const pattern = ["prior", "before", "after", "current"]
    .map((role) => result[role] ? "1" : "0")
    .join("");
  patterns.set(pattern, (patterns.get(pattern) ?? 0) + 1);
}
process.stdout.write(
  `Targets: ${results.length}\n`
  + `Presence patterns (prior,before,after,current):\n`
  + [...patterns.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pattern, count]) => `- ${pattern}: ${count}`)
    .join("\n")
  + "\nExceptions:\n"
  + results.filter((entry) =>
    !(entry.prior && entry.before && entry.after && entry.current))
    .map((entry) =>
      `- ${entry.uscTitle}:${entry.uscSection} `
      + `${entry.prior ? 1 : 0}${entry.before ? 1 : 0}`
      + `${entry.after ? 1 : 0}${entry.current ? 1 : 0}`)
    .join("\n")
  + "\n",
);
