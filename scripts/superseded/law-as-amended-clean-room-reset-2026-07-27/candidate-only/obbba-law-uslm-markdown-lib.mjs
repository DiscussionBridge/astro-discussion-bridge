import { createHash } from "node:crypto";

import {
  mapOfficialReference,
  OFFICIAL_REFERENCE_MAP_PROFILE,
} from "./obbba-law-official-reference-map.mjs";
import {
  validateUslmOperativeAstResult,
} from "./obbba-law-uslm-ast-lib.mjs";

export const USLM_MARKDOWN_PROFILE = "obbba-uslm-markdown-v1";
export const USLM_VISIBLE_TEXT_PROFILE = "obbba-uslm-visible-text-v1";

const STRUCTURAL = new Set([
  "subsection", "paragraph", "subparagraph", "clause", "subclause",
  "item", "subitem", "level",
]);
const FLOW = new Set(["chapeau", "content", "continuation", "p"]);
const INLINE = new Set([
  "b", "date", "heading", "i", "inline", "name", "note", "num",
  "quotedContent", "span", "sub", "sup", "title",
]);

export function renderUslmAstMarkdown(astResult, { releaseRole } = {}) {
  if (!["before", "current"].includes(releaseRole)) {
    throw new Error("USLM Markdown input is invalid.");
  }
  validateUslmOperativeAstResult(astResult);
  const context = { releaseRole, references: [], tables: [] };
  const rendered = renderNodes(astResult.ast.children, context, "block");
  const body = rendered.markdown
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!body) {
    throw new Error("USLM Markdown output is empty.");
  }
  const semanticText = normalizeSemantic(rendered.tokens.join(" "));
  const reviewed = astResult.operativeTextCommitment;
  const renderedSemantic = {
    profile: reviewed.profile,
    characters: semanticText.length,
    words: semanticText ? semanticText.split(" ").length : 0,
    sha256: sha256(semanticText),
  };
  if (JSON.stringify(renderedSemantic) !== JSON.stringify(reviewed)) {
    throw new Error("USLM Markdown semantic commitment differs from AST.");
  }
  const visibleText = normalizeVisible(rendered.visible);
  const visibleTextCommitment = {
    profile: USLM_VISIBLE_TEXT_PROFILE,
    characters: visibleText.length,
    words: visibleText ? visibleText.split(/\s+/u).length : 0,
    sha256: sha256(visibleText),
  };
  return {
    profile: USLM_MARKDOWN_PROFILE,
    releaseRole,
    sourceFragmentSha256: astResult.sourceFragmentSha256,
    canonicalAstSha256: astResult.canonicalAstSha256,
    operativeTextCommitment: renderedSemantic,
    visibleTextCommitment,
    referenceMapProfile: OFFICIAL_REFERENCE_MAP_PROFILE,
    references: context.references,
    tables: context.tables,
    bodySha256: sha256(body),
    body,
  };
}

function renderNodes(nodes, context, mode) {
  const rendered = nodes.map((node) => renderNode(node, context, mode))
    .filter(({ markdown, visible }) => markdown || visible);
  return combineRendered(rendered, mode === "inline" ? "" : "\n\n",
    mode === "inline" ? "" : " ");
}

function renderNode(node, context, mode) {
  if (node.type === "text") {
    const visible = normalizeLayout(node.value);
    return {
      markdown: protectSourceLineMarkers(escapeMarkdown(visible)),
      visible,
      tokens: [node.value],
    };
  }
  if (STRUCTURAL.has(node.name)) return renderStructural(node, context);
  if (FLOW.has(node.name)) {
    return renderFlowChildren(node.children, context);
  }
  if (INLINE.has(node.name)) return renderInline(node, context);
  if (node.name === "ref" || node.name === "a") {
    return renderReference(node, context);
  }
  if (node.name === "br") {
    return { markdown: "\\\n", visible: " ", tokens: [] };
  }
  if (node.name === "signature") {
    return renderNodes(node.children, context, "block");
  }
  if (node.name === "table") return renderTable(node, context);
  if (["colgroup", "col", "thead", "tbody", "tr", "th", "td"]
    .includes(node.name)) {
    throw new Error(`USLM Markdown table element escaped table renderer: ${node.name}.`);
  }
  throw new Error(`USLM Markdown element has no renderer: ${node.name}.`);
}

function renderFlowChildren(children, context) {
  const blocks = [];
  let inlineRun = [];
  const flushInline = () => {
    if (!inlineRun.length) return;
    const rendered = trimRendered(renderNodes(inlineRun, context, "inline"));
    if (rendered.markdown || rendered.visible || rendered.tokens.length) {
      blocks.push(rendered);
    }
    inlineRun = [];
  };
  for (const child of children) {
    if (child.type === "element" && ["p", "table"].includes(child.name)) {
      flushInline();
      blocks.push(trimRendered(renderNode(child, context, "block")));
    } else {
      inlineRun.push(child);
    }
  }
  flushInline();
  return combineRendered(blocks, "\n\n", " ");
}

function renderStructural(node, context) {
  const lead = [];
  const rest = [];
  for (const child of node.children) {
    if (child.type === "element"
      && (child.name === "num" || child.name === "heading")) lead.push(child);
    else rest.push(child);
  }
  const heading = trimRendered(combineRendered(
    lead.map((node) => renderNode(node, context, "inline")),
    " ",
    " ",
  ));
  const body = trimRendered(renderNodes(rest, context, "block"));
  if (!heading.markdown) return body;
  if (!body.markdown) {
    return {
      markdown: `**${heading.markdown}**`,
      visible: heading.visible,
      tokens: heading.tokens,
    };
  }
  return {
    markdown: `**${heading.markdown}**\n\n${indentNested(body.markdown)}`,
    visible: `${heading.visible} ${body.visible}`,
    tokens: [...heading.tokens, ...body.tokens],
  };
}

function renderInline(node, context) {
  const value = renderNodes(node.children, context, "inline");
  if (node.name === "b") {
    return wrapInlinePresentation(value, "**");
  }
  if (node.name === "i") {
    return wrapInlinePresentation(value, "_");
  }
  return value;
}

function renderReference(node, context) {
  const label = renderNodes(node.children, context, "inline");
  const originalHref = node.attributes.href;
  if (!originalHref) return label;
  const mapped = mapOfficialReference(originalHref, {
    releaseRole: context.releaseRole,
  });
  context.references.push(mapped);
  if (mapped.resolution !== "verified-official-link") return label;
  return {
    markdown: `[${label.markdown}](${escapeDestination(mapped.mappedUrl)})`,
    visible: label.visible,
    tokens: label.tokens,
  };
}

function renderTable(node, context) {
  const rows = [];
  const metadata = {
    width: node.attributes.width,
    xmlns: node.attributes.xmlns,
    columns: [],
    rows: [],
  };
  for (const child of node.children) {
    if (child.type === "text") {
      if (child.value.trim()) {
        throw new Error("USLM Markdown table has substantive direct text.");
      }
    } else if (child.name === "colgroup") {
      metadata.columns.push(...child.children
        .filter((item) => item.type === "element" && item.name === "col")
        .map((item) => ({ ...item.attributes })));
      collectWhitespace(child.children, context);
    } else if (child.name === "thead" || child.name === "tbody") {
      for (const row of child.children) {
        if (row.type === "text") {
          if (row.value.trim()) throw new Error("USLM table group text is invalid.");
          continue;
        }
        rows.push(renderTableRow(row, context, metadata));
      }
    } else {
      throw new Error(`USLM Markdown table child is invalid: ${child.name}.`);
    }
  }
  if (!rows.length) throw new Error("USLM Markdown table has no rows.");
  context.tables.push(metadata);
  return {
    markdown: rows.map((cells, rowIndex) =>
      cells.map((cell, cellIndex) =>
        `**Row ${rowIndex + 1}, cell ${cellIndex + 1}:**\n\n`
        + indentNested(cell.markdown)).join("\n\n")).join("\n\n"),
    visible: rows.flat().map(({ visible }) => visible).join(" "),
    tokens: rows.flat().flatMap(({ tokens }) => tokens),
  };
}

function renderTableRow(row, context, metadata) {
  if (row.name !== "tr") throw new Error("USLM Markdown table row is invalid.");
  const cells = [];
  const cellMetadata = [];
  for (const child of row.children) {
    if (child.type === "text") {
      if (child.value.trim()) throw new Error("USLM table row text is invalid.");
      continue;
    }
    if (child.name !== "th" && child.name !== "td") {
      throw new Error("USLM Markdown table cell is invalid.");
    }
    cells.push(trimRendered(renderNodes(child.children, context, "block")));
    cellMetadata.push({
      kind: child.name,
      colspan: child.attributes.colspan,
      rowspan: child.attributes.rowspan,
    });
  }
  if (!cells.length) throw new Error("USLM Markdown table row has no cells.");
  metadata.rows.push(cellMetadata);
  return cells;
}

function collectWhitespace(nodes, context) {
  for (const node of nodes) {
    if (node.type === "text") {
      if (node.value.trim()) throw new Error("USLM table layout text is invalid.");
    }
  }
}

function indentNested(value) {
  return value.split("\n").map((line) => line ? `> ${line}` : ">").join("\n");
}

function normalizeLayout(value) {
  return value.replace(/\s+/gu, " ");
}

function normalizeSemantic(value) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function escapeMarkdown(value) {
  return value
    .replace(/([\\`*_[\]<>!])/g, "\\$1");
}

function trimRendered(value) {
  return {
    markdown: value.markdown.trim(),
    visible: value.visible.trim(),
    tokens: value.tokens,
  };
}

function wrapInlinePresentation(value, delimiter) {
  const match = /^(\s*)([\s\S]*?)(\s*)$/u.exec(value.markdown);
  const [, leading, core, trailing] = match;
  return {
    ...value,
    markdown: core ? `${leading}${delimiter}${core}${delimiter}${trailing}`
      : value.markdown,
  };
}

function protectSourceLineMarkers(value) {
  return value
    .replace(/^([ \t]{0,3})([#>+\-])/u, "$1\\$2")
    .replace(/^([ \t]{0,3})(\d+)\./u, "$1$2\\.");
}

function combineRendered(values, markdownSeparator, visibleSeparator) {
  return {
    markdown: values.map(({ markdown }) => markdown).join(markdownSeparator),
    visible: values.map(({ visible }) => visible).join(visibleSeparator),
    tokens: values.flatMap(({ tokens = [] }) => tokens),
  };
}

function normalizeVisible(value) {
  return value.normalize("NFKC")
    .replace(/[ \t]+/gu, " ")
    .replace(/ *\n+ */gu, "\n")
    .trim();
}

function escapeDestination(value) {
  return value.replaceAll("(", "%28").replaceAll(")", "%29");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
