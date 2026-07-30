import assert from "node:assert/strict";
import test from "node:test";

import { buildUslmOperativeAst } from "../obbba-law-uslm-ast-lib.mjs";
import { renderUslmAstMarkdown } from "../obbba-law-uslm-markdown-lib.mjs";

const ast = (body, attributes = "") => buildUslmOperativeAst(
  `<section identifier="/us/usc/t7/s1"${attributes}>${body}</section>`,
  { expectedTitle: "7", expectedSection: "1" },
);

test("renders readable deterministic Markdown with semantic parity", () => {
  const input = ast(
    "<num value=\"1\">§ 1.</num><heading>Test * law</heading>"
    + "<subsection identifier=\"/us/usc/t7/s1/a\">"
    + "<num value=\"a\">(a)</num><heading>Rule</heading>"
    + "<content><p>See <ref href=\"/us/usc/t7/s2\">section 2</ref>."
    + "</p></content></subsection>",
  );
  const first = renderUslmAstMarkdown(input, { releaseRole: "current" });
  const second = renderUslmAstMarkdown(input, { releaseRole: "current" });
  assert.deepEqual(first, second);
  assert.match(first.body, /\*\*\(a\) Rule\*\*/);
  assert.match(first.body, /\[section 2\]\(https:\/\/uscode\.house\.gov/);
  assert.doesNotMatch(first.body, /<[^>]+>/);
  assert.equal(first.references[0].originalHref, "/us/usc/t7/s2");
  assert.equal(first.operativeTextCommitment.sha256,
    input.operativeTextCommitment.sha256);
});

test("keeps prior and legacy references visible but non-clickable", () => {
  const input = ast(
    "<content><p><ref href=\"/us/usc/t7/s2\">section 2</ref>; "
    + "<ref href=\"/us/act/1935-08-14\">Act</ref>.</p></content>",
  );
  const result = renderUslmAstMarkdown(input, { releaseRole: "before" });
  assert.match(result.body, /section 2; Act\./);
  assert.doesNotMatch(result.body, /https?:/);
  assert.equal(result.references.every(({ resolution }) =>
    resolution === "preserved-non-clickable"), true);
});

test("renders tables without raw HTML and retains structural metadata", () => {
  const input = ast(
    "<content><table xmlns=\"http://www.w3.org/1999/xhtml\" width=\"50%\">"
    + "<colgroup><col style=\"width:50%\"/></colgroup><thead><tr>"
    + "<th colspan=\"3\"><p>Head</p></th></tr></thead><tbody><tr>"
    + "<td><p>Cell | value</p></td></tr></tbody></table></content>",
  );
  const result = renderUslmAstMarkdown(input, { releaseRole: "current" });
  assert.match(result.body, /\*\*Row 1, cell 1:\*\*/);
  assert.match(result.body, /^> Head$/m);
  assert.doesNotMatch(result.body, /\\> Head/);
  assert.match(result.body, /> Cell \| value/);
  assert.equal(result.tables.length, 1);
  assert.equal(result.tables[0].rows[0][0].colspan, "3");
  assert.doesNotMatch(result.body, /<table|<td|<th/);
});

test("fails closed on unknown AST nodes and substantive table layout text", () => {
  const input = ast("<content>text</content>");
  input.ast.children[0].name = "formula";
  assert.throws(
    () => renderUslmAstMarkdown(input, { releaseRole: "current" }),
    /element node is invalid/,
  );
  const table = ast(
    "<content><table><tbody><tr><td><p>x</p></td></tr></tbody></table>"
    + "</content>",
  );
  table.ast.children[0].children[0].children.unshift({
    type: "text", value: "bad",
  });
  assert.throws(
    () => renderUslmAstMarkdown(table, { releaseRole: "current" }),
    /text node is invalid/,
  );
});

test("does not invent quotation punctuation and escapes block Markdown", () => {
  const input = ast(
    "<content><p><quotedContent>“Already quoted.”</quotedContent></p></content>"
    + "<content><p># heading</p><p>&gt; quote</p><p>- list</p>"
    + "<p>+ list</p><p>1. ordered</p><p>![image](target)</p>"
    + "<p>&lt;literal&gt; `code` [label]</p></content>",
  );
  const result = renderUslmAstMarkdown(input, { releaseRole: "current" });
  assert.equal((result.body.match(/“/g) ?? []).length, 1);
  assert.match(result.body, /\\# heading/);
  assert.match(result.body, /\\> quote/);
  assert.match(result.body, /\\- list/);
  assert.match(result.body, /\\\+ list/);
  assert.match(result.body, /1\\\. ordered/);
  assert.match(result.body, /\\!\\\[image\\\]\(target\)/);
  assert.match(result.body, /\\<literal\\>/);
  assert.match(result.body, /\\`code\\`/);
});

test("rejects stale canonical commitments and semantic AST mutations", () => {
  const original = ast(
    "<content><p><ref href=\"/us/usc/t7/s2\">section 2</ref></p>"
    + "<table width=\"50%\"><tbody><tr><td><p>x</p></td></tr></tbody></table>"
    + "</content>",
  );
  for (const mutate of [
    (copy) => { copy.ast.status = "repealed"; },
    (copy) => {
      copy.ast.children[0].children[0].children[0].attributes.href
        = "/us/usc/t7/s3";
    },
    (copy) => {
      copy.ast.children[0].children[1].attributes.width = "51%";
    },
    (copy) => { copy.canonicalAstSha256 = "0".repeat(64); },
  ]) {
    const copy = structuredClone(original);
    mutate(copy);
    assert.throws(
      () => renderUslmAstMarkdown(copy, { releaseRole: "current" }),
      /invalid|commitment|value/,
    );
  }
});

test("preserves inline punctuation adjacency across semantic markup", () => {
  const input = ast(
    "<content><p>(<i>word</i>), <ref href=\"/us/usc/t7/s2\">cite</ref>;"
    + "<sub>2</sub><sup>3</sup>. "
    + "<quotedContent>“source”</quotedContent> "
    + "<ref idref=\"fn000001\">*</ref><note id=\"fn000001\" "
    + "type=\"footnote\"><p>footnote</p></note>!</p></content>",
  );
  const result = renderUslmAstMarkdown(input, { releaseRole: "current" });
  assert.match(result.body, /\(_word_\),/);
  assert.match(result.body, /\]\([^)]*\);23\./);
  assert.match(result.body, /“source” \\\*footnote\\!/);
  assert.equal(result.visibleTextCommitment.profile,
    "obbba-uslm-visible-text-v1");
});

test("preserves source whitespace at inline wrapper boundaries", () => {
  const input = ast(
    "<content><p>A<i> i </i>B<b> b </b>C<span> s </span>D"
    + "<sub> sub </sub>E<sup> sup </sup>F"
    + "<quotedContent> q </quotedContent>G"
    + "<ref href=\"/us/usc/t7/s2\"> ref </ref>H"
    + "<note> note </note>I.</p></content>",
  );
  const result = renderUslmAstMarkdown(input, { releaseRole: "current" });
  assert.match(result.body, /A _i_ B \*\*b\*\* C s D sub E sup F q G/);
  assert.match(result.body, /\[ ref \]\([^)]*\)H note I\./);
  assert.doesNotMatch(result.body, /AiB|AbC|AsD|A_i_B/);
});

test("escapes CommonMark constructs after outer block trimming", () => {
  for (const [source, expected] of [
    [" # heading", "\\# heading"],
    ["\n> quote", "\\> quote"],
    [" - list", "\\- list"],
    ["\n+ list", "\\+ list"],
    [" 1. ordered", "1\\. ordered"],
  ]) {
    const result = renderUslmAstMarkdown(
      ast(`<content><p>${source.replaceAll(">", "&gt;")}</p></content>`),
      { releaseRole: "current" },
    );
    assert.equal(result.body, expected);
  }
  const wrapped = renderUslmAstMarkdown(
    ast("<content><p><span> # heading</span></p></content>"),
    { releaseRole: "current" },
  );
  assert.equal(wrapped.body, "\\# heading");
  const table = renderUslmAstMarkdown(ast(
    "<content><table><tbody><tr><td><p> # cell</p></td></tr></tbody>"
    + "</table></content>",
  ), { releaseRole: "current" });
  assert.match(table.body, /> \\# cell/);
});

test("keeps formatting whitespace outside valid CommonMark delimiters", () => {
  const result = renderUslmAstMarkdown(ast(
    "<content><p>x<b> bold </b>,<i> italic </i>."
    + "<b></b><i> </i>y</p></content>",
  ), { releaseRole: "current" });
  assert.equal(result.body, "x **bold** , _italic_ . y");
  assert.doesNotMatch(result.body, /\*\* bold \*\*|_ italic _/);
});

test("preserves hard breaks and protects every following line marker", () => {
  for (const marker of ["# heading", "> quote", "- list", "+ list", "1. list"]) {
    const escaped = marker.startsWith("1.")
      ? "1\\. list"
      : `\\${marker}`;
    const result = renderUslmAstMarkdown(ast(
      `<content><p>lead<br/>${marker.replaceAll(">", "&gt;")}</p></content>`,
    ), { releaseRole: "current" });
    assert.equal(result.body, `lead\\\n${escaped}`);
  }
  const multiple = renderUslmAstMarkdown(ast(
    "<content><p>lead<br/># one<br/>&gt; two<br/>- three</p></content>",
  ), { releaseRole: "current" });
  assert.equal(multiple.body, "lead\\\n\\# one\\\n\\> two\\\n\\- three");
});

test("protects source lines before adding presentation wrappers", () => {
  const heading = renderUslmAstMarkdown(ast(
    "<heading>lead<br/># marker</heading><content>body</content>",
  ), { releaseRole: "current" });
  assert.match(heading.body, /lead\\\n\\# marker/);

  const inline = renderUslmAstMarkdown(ast(
    "<content><p><note>lead<br/>&gt; note</note></p>"
    + "<p><quotedContent>lead<br/>- quote</quotedContent></p></content>",
  ), { releaseRole: "current" });
  assert.match(inline.body, /lead\\\n\\> note/);
  assert.match(inline.body, /lead\\\n\\- quote/);

  const table = renderUslmAstMarkdown(ast(
    "<content><table><tbody><tr><td><p>lead<br/># cell</p></td>"
    + "</tr></tbody></table></content>",
  ), { releaseRole: "current" });
  assert.match(table.body, /^> lead\\$/m);
  assert.match(table.body, /^> \\# cell$/m);
  assert.doesNotMatch(table.body, /\\> /);
});

test("composes mixed inline and table blocks under p and continuation", () => {
  const tableXml = "<table><tbody><tr><td><p>Cell</p></td></tr></tbody></table>";
  const paragraph = renderUslmAstMarkdown(ast(
    `<content><p>Before${tableXml}After</p></content>`,
  ), { releaseRole: "current" });
  assert.match(paragraph.body,
    /^Before\n\n\*\*Row 1, cell 1:\*\*\n\n> Cell\n\nAfter$/);
  assert.doesNotMatch(paragraph.body, /Before\*\*Row|CellAfter|\\> Cell/);

  const continuation = renderUslmAstMarkdown(ast(
    `<subsection><num>(a)</num><continuation>Before${tableXml}After`
    + "</continuation></subsection>",
  ), { releaseRole: "current" });
  assert.match(continuation.body,
    /> Before\n>\n> \*\*Row 1, cell 1:\*\*\n>\n> > Cell\n>\n> After/);
});

test("preserves inline runs around multiple paragraph and table blocks", () => {
  const result = renderUslmAstMarkdown(ast(
    "<content>Start <i>one</i> <ref href=\"/us/usc/t7/s2\">two</ref>"
    + "<p>Paragraph one.</p>"
    + "<table><tbody><tr><td><p>Cell one.</p></td></tr></tbody></table>"
    + "<p>Paragraph two.</p>"
    + "<table><tbody><tr><td><p>Cell two.</p></td></tr></tbody></table>"
    + " End.</content>",
  ), { releaseRole: "current" });
  assert.match(result.body, /^Start _one_ \[two\]\([^)]*\)\n\nParagraph one\./);
  assert.match(result.body, /Paragraph one\.\n\n\*\*Row 1, cell 1:\*\*/);
  assert.match(result.body, /> Cell one\.\n\nParagraph two\./);
  assert.match(result.body, /> Cell two\.\n\nEnd\.$/);
  assert.equal((result.body.match(/\*\*Row 1, cell 1:\*\*/g) ?? []).length, 2);
  assert.doesNotMatch(result.body, /\\> Cell/);
});
