import assert from "node:assert/strict";
import test from "node:test";

import {
  buildObbbaLawAuthorityMap,
  parsePublicLaw11921Classifications,
} from "../obbba-law-authority-map-lib.mjs";

const classification = `
<html><body><pre>
7     2012                          119-21   10101(a)                 80
7     2025                          119-21   10101(b)(1)              81
26    48D          nt new           119-21   70308(b)                 201
14    1181         prec new         119-21   40001(a) "Subchapter V"  127
26    224          tr to 26/225     119-21   70201(a)                 170
</pre></body></html>`;

function metadataText() {
  const entries = Array.from({ length: 309 }, (_, index) => {
    const sectionId = index === 0
      ? "10101"
      : index === 1
        ? "70308"
        : index === 2
          ? "40001"
          : index === 3
            ? "70201"
            : String(80_000 + index);
    const topicId = index + 1;
    return {
      sectionId,
      topicId,
      title: `Sec. ${sectionId}. Provision ${sectionId} | Law as Amended`,
      sourceUrl: `https://forum.repealobbba.org/t/${topicId}`,
      normalizedTags: ["law-as-amended"],
    };
  });
  return JSON.stringify({
    mode: "law-as-amended-forum-metadata-only",
    summary: { total: 309 },
    entries,
  });
}

test("OLRC parser maps Public Law 119-21 rows without forum content", () => {
  assert.deepEqual(parsePublicLaw11921Classifications(classification), [
    {
      uscTitle: "7",
      uscSection: "2012",
      description: "",
      publicLaw: "119-21",
      publicLawSection: "10101(a)",
      statutePages: "80",
    },
    {
      uscTitle: "7",
      uscSection: "2025",
      description: "",
      publicLaw: "119-21",
      publicLawSection: "10101(b)(1)",
      statutePages: "81",
    },
    {
      uscTitle: "26",
      uscSection: "48D",
      description: "nt new",
      publicLaw: "119-21",
      publicLawSection: "70308(b)",
      statutePages: "201",
    },
    {
      uscTitle: "14",
      uscSection: "1181",
      description: "prec new",
      publicLaw: "119-21",
      publicLawSection: '40001(a) "Subchapter V"',
      statutePages: "127",
    },
    {
      uscTitle: "26",
      uscSection: "224",
      description: "tr to 26/225",
      publicLaw: "119-21",
      publicLawSection: "70201(a)",
      statutePages: "170",
    },
  ]);
});

test("OLRC parser accepts documented numeric subsection, range, and list forms", () => {
  const rows = `
26    142                           119-21   70309(a)-(c)             201
26    904                           119-21   70311(a)-(b)(2)          202
26    250                           119-21   70322(a)(1), (2)         204
22    9613                          119-21   8721-8730(a)             249
22    9613                          119-21   8731, 8732               250, 251`;
  assert.equal(parsePublicLaw11921Classifications(rows).length, 5);
});

test("authority map separates classified and no-record sections", () => {
  const result = buildObbbaLawAuthorityMap({
    forumMetadataText: metadataText(),
    classificationDocumentText: classification,
  });
  assert.equal(result.summary.total, 309);
  assert.equal(result.summary.classifiedToUsCode, 4);
  assert.equal(result.summary.noUsCodeClassificationRecord, 305);
  assert.equal(result.summary.classificationRows, 5);
  assert.equal(result.entries[0].classifications.length, 2);
  assert.equal(result.entries[4].classificationStatus, "no-us-code-classification-record");
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /"cooked"|"raw"|"currentLaw"|"priorLaw"/);
});

test("authority parser and join fail closed on malformed rows and unknown sections", () => {
  assert.throws(
    () => parsePublicLaw11921Classifications(
      "7 2012 119-21 10101(a) 80",
    ),
    /Could not parse/,
  );
  assert.throws(
    () => parsePublicLaw11921Classifications(
      "7     2012         unexpected layout text         119-21   10101(a)   80",
    ),
    /Invalid Public Law/,
  );
  assert.throws(
    () => parsePublicLaw11921Classifications(`${classification}\n${classification}`),
    /Duplicate Public Law/,
  );
  for (const badReference of [
    "40001xyz",
    "40001(a) garbage",
    '40001(a) "Subchapter V" "Extra"',
    '40001(a) "Subchapter V',
    '40001(a) "Subchapter/V"',
    '40001(a) "Subchapter\tV"',
  ]) {
    assert.throws(
      () => parsePublicLaw11921Classifications(
        `14    1181         prec new         119-21   ${badReference}   127`,
      ),
      /Invalid Public Law|Could not parse/,
      badReference,
    );
  }
  assert.throws(
    () => parsePublicLaw11921Classifications(
      "14    1181    prec new    shifted prose    119-21    40001(a)    127",
    ),
    /Invalid Public Law/,
  );
  for (const badDescription of [
    "tr sideways 26/225",
    "tr to 26/225/extra",
    "tr to x/225",
    "tr to 26/225 garbage",
  ]) {
    assert.throws(
      () => parsePublicLaw11921Classifications(
        `26    224    ${badDescription}    119-21    70201(a)    170`,
      ),
      /Invalid Public Law/,
    );
  }
  const unknown = classification.replace("70308(b)", "99999(b)");
  assert.throws(
    () => buildObbbaLawAuthorityMap({
      forumMetadataText: metadataText(),
      classificationDocumentText: unknown,
    }),
    /outside metadata/,
  );
});
