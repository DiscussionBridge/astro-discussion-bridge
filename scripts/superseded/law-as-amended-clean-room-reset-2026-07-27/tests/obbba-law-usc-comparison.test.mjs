import assert from "node:assert/strict";
import test from "node:test";

import {
  compareVersionCommitments,
  operativeLegalTextCommitment,
  publicLaw11921EditorialEvidence,
} from "../obbba-law-usc-comparison-lib.mjs";

test("operative commitment ignores editorial notes, source credit, IDs, and formatting whitespace", () => {
  const first = `<section id="release-a"><num>§ 1.</num><heading>Rule</heading>
<subsection id="a"><num>(a)</num><content>The same law applies.</content></subsection>
<sourceCredit>(Pub. L. 1)</sourceCredit>
<notes><note><p>Editorial note A.</p></note></notes></section>`;
  const second = `<section id="release-b"><num>§ 1.</num><heading>Rule</heading><subsection id="b">
<num>(a)</num><content> The same law
applies. </content></subsection><sourceCredit>(Pub. L. 2)</sourceCredit>
<notes><note><p>Editorial note B.</p></note></notes></section>`;
  assert.deepEqual(
    operativeLegalTextCommitment(first),
    operativeLegalTextCommitment(second),
  );
});

test("operative commitment changes when operative text changes", () => {
  const before = operativeLegalTextCommitment(
    "<section><num>§ 1.</num><content>Old rule.</content></section>",
  );
  const after = operativeLegalTextCommitment(
    "<section><num>§ 1.</num><content>New rule.</content></section>",
  );
  assert.notEqual(before.sha256, after.sha256);
});

test("comparison labels state transitions without claiming causation", () => {
  const a = {
    state: "present",
    operativeTextProfile: "uslm-operative-text-v1",
    operativeTextSha256: "a".repeat(64),
  };
  const b = {
    state: "present",
    operativeTextProfile: "uslm-operative-text-v1",
    operativeTextSha256: "b".repeat(64),
  };
  assert.deepEqual(compareVersionCommitments({
    prior: a,
    before: { state: "absent" },
    after: b,
    current: b,
  }), {
    incorporationWindow: "added",
    broadHistorical: "changed",
    laterEvolution: "unchanged",
  });
});

test("comparison fails closed when a present state lacks semantic commitment", () => {
  assert.throws(
    () => compareVersionCommitments({
      prior: {
        state: "present",
        operativeTextProfile: "uslm-operative-text-v1",
        operativeTextSha256: "a".repeat(64),
      },
      before: { state: "present" },
      after: {
        state: "present",
        operativeTextProfile: "uslm-operative-text-v1",
        operativeTextSha256: "b".repeat(64),
      },
      current: {
        state: "present",
        operativeTextProfile: "uslm-operative-text-v1",
        operativeTextSha256: "b".repeat(64),
      },
    }),
    /exact operative-text commitments/,
  );
});

test("comparison rejects malformed hashes, unknown states, and text on absences", () => {
  const valid = {
    state: "present",
    operativeTextProfile: "uslm-operative-text-v1",
    operativeTextSha256: "a".repeat(64),
  };
  for (const invalid of [
    { ...valid, operativeTextSha256: "a" },
    { ...valid, operativeTextSha256: "A".repeat(64) },
    { state: "unknown" },
    {
      state: "absent",
      operativeTextProfile: "uslm-operative-text-v1",
      operativeTextSha256: "a".repeat(64),
    },
  ]) {
    assert.throws(
      () => compareVersionCommitments({
        prior: valid,
        before: invalid,
        after: valid,
        current: valid,
      }),
      /comparison state|operative-text commitments|cannot carry/,
    );
  }
});

test("unexpected nested editorial containers fail rather than hide operative text", () => {
  for (const element of ["notes", "sourceCredit"]) {
    assert.throws(
      () => operativeLegalTextCommitment(
        `<section><subsection><content>Visible law.</content>`
        + `<${element}>Hidden change.</${element}></subsection></section>`,
      ),
      /unexpected ancestry/,
    );
  }
});

test("attribution evidence uses only parsed PL 119-21 editorial links", () => {
  const evidence = publicLaw11921EditorialEvidence(`<section>
<content><ref href="/us/pl/119/21/s99999">operative mention</ref></content>
<sourceCredit><ref href="/us/pl/119/21/tI/s10306/c">Public Law</ref></sourceCredit>
<notes><note><p>
<ref href="/us/pl/119/21/s10306/c/1">Amendment</ref>
<ref href="/us/pl/119/210/s10306">Different law</ref>
<code>href="/us/pl/119/21/s77777"</code>
</p></note></notes></section>`);
  assert.deepEqual(evidence, {
    profile: "uslm-pl119-21-editorial-links-v2",
    statusHeadingLinks: [],
    sourceCreditLinks: ["/us/pl/119/21/tI/s10306/c"],
    noteLinks: ["/us/pl/119/21/s10306/c/1"],
    referencedObbbaSections: ["10306"],
  });
});

test("attribution evidence permits genuine generic PL links without inventing a section", () => {
  assert.deepEqual(
    publicLaw11921EditorialEvidence(
      '<section><notes><ref href="/us/pl/119/21">Public Law</ref></notes></section>',
    ),
    {
      profile: "uslm-pl119-21-editorial-links-v2",
      statusHeadingLinks: [],
      sourceCreditLinks: [],
      noteLinks: ["/us/pl/119/21"],
      referencedObbbaSections: [],
    },
  );
});

test("attribution accepts a direct PL citation in an official repealed status heading only", () => {
  const href = "/us/pl/119/21/tV/s50103";
  assert.deepEqual(
    publicLaw11921EditorialEvidence(
      `<section status="repealed"><heading>Repealed. `
      + `<ref href="${href}">Public Law</ref></heading></section>`,
    ),
    {
      profile: "uslm-pl119-21-editorial-links-v2",
      statusHeadingLinks: [href],
      sourceCreditLinks: [],
      noteLinks: [],
      referencedObbbaSections: ["50103"],
    },
  );
  assert.deepEqual(
    publicLaw11921EditorialEvidence(
      `<section><heading>Ordinary <ref href="${href}">mention</ref></heading></section>`,
    ).statusHeadingLinks,
    [],
  );
});
