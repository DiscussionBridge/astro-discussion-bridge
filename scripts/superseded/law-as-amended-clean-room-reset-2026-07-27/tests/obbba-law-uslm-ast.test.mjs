import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUslmOperativeAst,
} from "../obbba-law-uslm-ast-lib.mjs";

const section = (body, attributes = "") =>
  `<section identifier="/us/usc/t7/s1"${attributes}>${body}</section>`;

test("builds a canonical operative AST with reviewed semantic parity", () => {
  const result = buildUslmOperativeAst(section(
    "<num value=\"1\">§ 1.</num><heading>Test</heading>"
    + "<subsection identifier=\"/us/usc/t7/s1/a\">"
    + "<num value=\"a\">(a)</num><content><p>Text "
    + "<ref href=\"/us/usc/t7/s2\">section 2</ref>.</p></content>"
    + "</subsection><sourceCredit>(source)</sourceCredit>"
    + "<notes type=\"uscNote\"><note topic=\"amendments\"><p>note</p></note></notes>",
  ), { expectedTitle: "7", expectedSection: "1" });
  assert.equal(result.ast.status, "active");
  assert.equal(result.ast.children.some(({ name }) =>
    name === "sourceCredit" || name === "notes"), false);
  assert.match(result.sourceFragmentSha256, /^[a-f0-9]{64}$/);
  assert.match(result.canonicalAstSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.operativeTextCommitment.profile,
    "uslm-operative-text-v1");
});

test("preserves repealed headings, tables, continuations, and signatures", () => {
  const result = buildUslmOperativeAst(section(
    "<num value=\"1\">§ 1.</num><heading>Repealed.</heading>"
    + "<paragraph identifier=\"/us/usc/t7/s1/1\"><num value=\"1\">(1)</num>"
    + "<continuation>continued</continuation><content>"
    + "<table xmlns=\"http://www.w3.org/1999/xhtml\" width=\"50%\">"
    + "<colgroup><col style=\"width: 50%\"/></colgroup><tbody><tr>"
    + "<th colspan=\"3\"><p>Head</p></th><td><p>Cell</p></td>"
    + "</tr></tbody></table></content>"
    + "<subparagraph identifier=\"/us/usc/t7/s1/1/A\"><num value=\"A\">(A)</num>"
    + "<note topic=\"miscellaneous\"><signature><name>Signer</name>"
    + "<title>Office</title></signature></note></subparagraph></paragraph>",
    " status=\"repealed\"",
  ), { expectedTitle: "7", expectedSection: "1" });
  assert.equal(result.ast.status, "repealed");
  assert.match(JSON.stringify(result.ast), /"name":"table"/);
  assert.match(JSON.stringify(result.ast), /"name":"signature"/);
});

test("preserves operative inline footnotes while excluding editorial notes", () => {
  const result = buildUslmOperativeAst(section(
    "<content>Rule<ref class=\"footnoteRef\" idref=\"fn000001\">1</ref>"
    + "<note type=\"footnote\" id=\"fn000001\"><num value=\"1\">1</num>"
    + " footnote</note>.</content>"
    + "<notes type=\"uscNote\"><note topic=\"amendments\"><p>editorial</p>"
    + "</note></notes>",
  ), { expectedTitle: "7", expectedSection: "1" });
  const content = result.ast.children.find(({ name }) => name === "content");
  assert.equal(content.children.some(({ name }) => name === "note"), true);
  assert.equal(JSON.stringify(result.ast).includes("editorial"), false);
});

test("preserves standalone operative notes outside the editorial container", () => {
  const result = buildUslmOperativeAst(section(
    "<paragraph identifier=\"/us/usc/t7/s1/1\"><num value=\"1\">(1)</num>"
    + "<subparagraph identifier=\"/us/usc/t7/s1/1/A\"><num value=\"A\">(A)</num>"
    + "<note topic=\"miscellaneous\"><p>operative annotation</p></note>"
    + "</subparagraph></paragraph><notes type=\"uscNote\"><note topic=\"miscellaneous\">"
    + "<p>editorial annotation</p></note></notes>",
  ), { expectedTitle: "7", expectedSection: "1" });
  const serialized = JSON.stringify(result.ast);
  assert.match(serialized, /operative annotation/);
  assert.doesNotMatch(serialized, /editorial annotation/);
});

test("fails closed on unsafe XML, schema drift, and invalid ancestry", () => {
  for (const [xml, pattern] of [
    [section("<p onclick=\"x\">bad</p>"), /unreviewed attribute/],
    [section("<p role=\"bad\">bad</p>"), /role value is invalid/],
    [section("<p role=\"listItem\" role=\"listItem\">bad</p>"), /repeats an attribute/],
    [section("<p><notes type=\"uscNote\"/></p>"),
      /parent\/child structure is invalid|invalid ancestry/],
    [section("<name>bad</name>"), /parent\/child structure is invalid/],
    [section("<td>bad</td>"), /parent\/child structure is invalid/],
    [section("<table><td><tr><td>bad</td></tr></td></table>"),
      /parent\/child structure is invalid/],
    [section("<ref href=\"javascript:bad\">bad</ref>"), /href value is invalid/],
    [section("<ref href=\"/us/evil/x\">bad</ref>"), /href value is invalid/],
    [section("<ref href=\"/us/usc/t7/../s2\">bad</ref>"), /href value is invalid/],
    [section("<ref href=\"/us/usc/title 7\">bad</ref>"), /href value is invalid/],
    [section("<ref href=\"/us/usc/%2e%2e/s2\">bad</ref>"), /href value is invalid/],
    [section("<ref href=\"/us/usc/.%2e/s2\">bad</ref>"), /href value is invalid/],
    [section("<ref href=\"/us/usc/%41\">bad</ref>"), /href value is invalid/],
    [section("<date date=\"2026-99-99\">bad</date>"), /date value is invalid/],
    [section("substantive"), /substantive text has invalid parent/],
    [section("<content><table>substantive</table></content>"),
      /substantive text has invalid parent/],
    [section("<content><table><tbody><tr>substantive</tr></tbody></table>"
      + "</content>"),
      /substantive text has invalid parent/],
    [section("<paragraph identifier=\"/us/usc/t7/s1/1\"><num value=\"1\">"
      + "(1)</num><subparagraph identifier=\"/us/usc/t7/s1/1/A\">"
      + "<num value=\"A\">(A)</num><note topic=\"miscellaneous\">"
      + "<signature>substantive</signature></note></subparagraph></paragraph>"),
      /substantive text has invalid parent/],
    ["<!DOCTYPE x><section identifier=\"/us/usc/t7/s1\"/>", /DTD or entities/],
    [section("<formula>bad</formula>"), /not reviewed/],
  ]) {
    assert.throws(
      () => buildUslmOperativeAst(xml, {
        expectedTitle: "7", expectedSection: "1",
      }),
      pattern,
    );
  }
});

test("requires every operative footnote reference to resolve to one unique target", () => {
  const valid = "<content>A<ref idref=\"fn000001\">1</ref>"
    + "<note type=\"footnote\" id=\"fn000001\">footnote</note></content>";
  assert.doesNotThrow(() => buildUslmOperativeAst(section(valid), {
    expectedTitle: "7", expectedSection: "1",
  }));
  assert.doesNotThrow(() => buildUslmOperativeAst(section(
    "<content><ref idref=\"fn000001\">1</ref>"
    + "<ref idref=\"fn000001\">1</ref>"
    + "<note type=\"footnote\" id=\"fn000001\">x</note></content>",
  ), { expectedTitle: "7", expectedSection: "1" }));
  for (const body of [
    "<content><ref idref=\"fn000001\">1</ref></content>",
    "<content><note type=\"footnote\" id=\"fn000001\">x</note></content>",
    "<content><ref idref=\"fn000001\">1</ref>"
      + "<note type=\"footnote\" id=\"fn000001\">x</note>"
      + "<note type=\"footnote\" id=\"fn000001\">y</note></content>",
    "<content><ref idref=\"fn000001\">1</ref></content>"
      + "<notes type=\"uscNote\"><note type=\"footnote\" id=\"fn000001\">"
      + "editorial</note></notes>",
    "<content><ref idref=\"fn000001\">1</ref>"
      + "<note topic=\"miscellaneous\" id=\"fn000001\">wrong type</note>"
      + "</content>",
  ]) {
    assert.throws(() => buildUslmOperativeAst(section(body), {
      expectedTitle: "7", expectedSection: "1",
    }), /footnote/);
  }
});
