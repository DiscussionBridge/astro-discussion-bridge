import assert from "node:assert/strict";
import test from "node:test";

import {
  indexUscSections,
  selectUscTargets,
} from "../obbba-law-usc-section-selector-lib.mjs";

const xml = `<?xml version="1.0"?>
<uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0">
<main><title identifier="/us/usc/t7">
<section id="a" identifier="/us/usc/t7/s1308–1"><num value="1308-1">§ 1308–1.</num><heading>First</heading><subsection identifier="/us/usc/t7/s1308–1/a"><num>(a)</num></subsection></section>
<section identifier="/us/usc/t7/s2012" id="b"><num value="2012">§ 2012.</num><heading>Definitions</heading></section>
</title></main></uscDoc>`;

test("selector indexes exact top-level sections and canonicalizes OLRC en dashes", () => {
  const index = indexUscSections(xml, "7");
  assert.deepEqual([...index.keys()], ["1308-1", "2012"]);
  assert.equal(
    index.get("1308-1").sourceIdentifier,
    "/us/usc/t7/s1308–1",
  );
  assert.match(index.get("1308-1").fragment, /^<section\b/);
  assert.match(index.get("1308-1").fragment, /<\/section>$/);
  assert.match(index.get("1308-1").sha256, /^[a-f0-9]{64}$/);
});

test("selector preserves target order and records immutable absence", () => {
  assert.deepEqual(
    selectUscTargets(xml, "7", ["2012", "1308-1"])
      .map((entry) => entry.uscSection),
    ["2012", "1308-1"],
  );
  assert.deepEqual(
    selectUscTargets(xml, "7", ["9999"]),
    [{
      state: "absent",
      uscTitle: "7",
      uscSection: "9999",
    }],
  );
  assert.throws(
    () => selectUscTargets(xml, "7", ["2012", "2012"]),
    /duplicated/,
  );
});

test("selector rejects duplicate canonical identities, nesting, and malformed closure", () => {
  assert.throws(
    () => indexUscSections(
      xml.replace(
        "</title>",
        '<section identifier="/us/usc/t7/s1308-1"></section></title>',
      ),
      "7",
    ),
    /duplicated/,
  );
  assert.throws(
    () => indexUscSections(
      '<uscDoc><section identifier="/us/usc/t7/s1"><section identifier="/us/usc/t7/s2"></section></section></uscDoc>',
      "7",
    ),
    /nesting|structural ancestry/,
  );
  assert.throws(
    () => indexUscSections(
      '<uscDoc><main><title identifier="/us/usc/t7"><section identifier="/us/usc/t7/s1">',
      "7",
    ),
    /unclosed element/,
  );
});

test("selector ignores markup-like comments/CDATA and rejects nonstructural ancestry", () => {
  const disguised = xml.replace(
    "</title>",
    `<!-- <section identifier="/us/usc/t7/s9997"></section> -->
    <![CDATA[<section identifier="/us/usc/t7/s9998"></section>]]>
    </title>`,
  );
  const index = indexUscSections(disguised, "7");
  assert.equal(index.has("9997"), false);
  assert.equal(index.has("9998"), false);
  assert.throws(
    () => indexUscSections(
      xml.replace(
        "</title>",
        '<note><section identifier="/us/usc/t7/s9999"></section></note></title>',
      ),
      "7",
    ),
    /structural ancestry/,
  );
  const closingText = xml.replace(
    "<heading>Definitions</heading>",
    "<heading><![CDATA[not really </section>]]>Definitions</heading>",
  );
  assert.equal(indexUscSections(closingText, "7").has("2012"), true);
});

test("selector accepts a correctly identified title with no sections and rejects wrong title identity", () => {
  const emptyTitle = `<?xml version="1.0"?>
<uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0">
<main><title identifier="/us/usc/t7"></title></main>
</uscDoc>`;
  assert.deepEqual(
    selectUscTargets(emptyTitle, "7", ["9999"]),
    [{
      state: "absent",
      uscTitle: "7",
      uscSection: "9999",
    }],
  );
  assert.throws(
    () => selectUscTargets(
      emptyTitle.replace("/us/usc/t7", "/us/usc/t8"),
      "7",
      ["9999"],
    ),
    /exactly one title identity/,
  );
});

test("selector binds each selected section to its actual matching title ancestor", () => {
  const substitutedTitle = `<?xml version="1.0"?>
<uscDoc xmlns="http://xml.house.gov/schemas/uslm/1.0"><main>
<title identifier="/us/usc/t7"></title>
<title identifier="/us/usc/t8">
<section identifier="/us/usc/t7/s9999"></section>
</title>
</main></uscDoc>`;
  assert.throws(
    () => selectUscTargets(substitutedTitle, "7", ["9999"]),
    /structural ancestry/,
  );
});

test("selector tolerates an unrelated OLRC duplicate but rejects ambiguity for a requested target", () => {
  const duplicate = xml.replace(
    "</title>",
    `<section identifier="/us/usc/t7/s3598"><heading>First enacted section</heading></section>
<section identifier="/us/usc/t7/s3598"><heading>Second enacted section</heading></section>
</title>`,
  );
  assert.equal(selectUscTargets(duplicate, "7", ["2012"])[0].state, "present");
  assert.throws(
    () => selectUscTargets(duplicate, "7", ["3598"]),
    /duplicated/,
  );
});

test("selector accepts OLRC generic level as a structural section parent", () => {
  const genericLevel = xml.replace(
    '<section id="a" identifier="/us/usc/t7/s1308–1">',
    '<level><heading>GENERAL PROVISIONS</heading><section id="a" identifier="/us/usc/t7/s1308–1">',
  ).replace(
    "</section>\n<section identifier=\"/us/usc/t7/s2012\"",
    "</section></level>\n<section identifier=\"/us/usc/t7/s2012\"",
  );
  assert.equal(
    selectUscTargets(genericLevel, "7", ["1308-1"])[0].state,
    "present",
  );
});
