export const USLM_RENDERER_PROFILE = "obbba-uslm-markdown-v1";

export const OBSERVED_USLM_ELEMENTS = Object.freeze([
  "a",
  "b",
  "br",
  "chapeau",
  "clause",
  "col",
  "colgroup",
  "content",
  "continuation",
  "date",
  "heading",
  "i",
  "inline",
  "item",
  "level",
  "name",
  "note",
  "notes",
  "num",
  "p",
  "paragraph",
  "quotedContent",
  "ref",
  "section",
  "signature",
  "sourceCredit",
  "span",
  "sub",
  "subclause",
  "subitem",
  "subparagraph",
  "subsection",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "title",
  "tr",
]);

export const USLM_ELEMENT_REGISTRY = Object.freeze({
  section: "structural-root",
  subsection: "structural-block",
  paragraph: "structural-block",
  subparagraph: "structural-block",
  clause: "structural-block",
  subclause: "structural-block",
  item: "structural-block",
  subitem: "structural-block",
  level: "structural-block",
  num: "structural-label",
  heading: "structural-heading",
  chapeau: "operative-flow",
  content: "operative-flow",
  continuation: "operative-flow",
  p: "operative-flow",
  quotedContent: "operative-quotation",
  signature: "operative-signature",
  name: "operative-signature",
  title: "operative-signature",
  ref: "official-reference",
  a: "official-reference",
  date: "inline-semantic",
  inline: "inline-semantic",
  b: "inline-format",
  i: "inline-format",
  span: "inline-format",
  sub: "inline-format",
  sup: "inline-format",
  br: "inline-break",
  table: "table",
  colgroup: "table",
  col: "table",
  thead: "table",
  tbody: "table",
  tr: "table",
  th: "table",
  td: "table",
  notes: "editorial-boundary",
  note: "editorial-boundary",
  sourceCredit: "editorial-boundary",
});

export const USLM_ATTRIBUTE_REGISTRY = deepFreeze({
  a: ["href"],
  b: [],
  br: [],
  chapeau: ["class", "style"],
  clause: ["class", "id", "identifier", "style"],
  col: ["style"],
  colgroup: [],
  content: [],
  continuation: ["class", "style"],
  date: ["date"],
  heading: ["class"],
  i: [],
  inline: ["class"],
  item: ["class", "id", "identifier", "style"],
  level: ["class", "id", "identifier", "style"],
  name: [],
  note: ["id", "role", "style", "topic", "type"],
  notes: ["id", "type"],
  num: ["class", "value"],
  p: ["class", "role", "style"],
  paragraph: ["class", "id", "identifier", "status", "style"],
  quotedContent: ["origin"],
  ref: ["class", "href", "idref"],
  section: ["class", "id", "identifier", "status", "style"],
  signature: [],
  sourceCredit: ["id"],
  span: ["class", "style"],
  sub: [],
  subclause: ["class", "id", "identifier", "style"],
  subitem: ["class", "id", "identifier", "style"],
  subparagraph: ["class", "id", "identifier", "style"],
  subsection: ["class", "id", "identifier", "status", "style"],
  sup: [],
  table: ["border", "class", "id", "style", "width", "xmlns"],
  tbody: ["style"],
  td: ["style"],
  th: ["colspan", "rowspan", "style"],
  thead: [],
  title: ["style"],
  tr: ["class", "style"],
});

export function validateUslmRendererCensus(observed) {
  if (!Array.isArray(observed)
    || observed.some((name) => typeof name !== "string")
    || new Set(observed).size !== observed.length) {
    throw new Error("USLM renderer census is invalid.");
  }
  const expected = Object.keys(USLM_ELEMENT_REGISTRY).sort();
  const actual = [...observed].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)
    || JSON.stringify(actual) !== JSON.stringify([...OBSERVED_USLM_ELEMENTS].sort())) {
    const missing = expected.filter((name) => !actual.includes(name));
    const unknown = actual.filter((name) => !expected.includes(name));
    throw new Error(
      `USLM renderer census drift; missing=${missing.join(",")}; `
      + `unknown=${unknown.join(",")}.`,
    );
  }
  return true;
}

export function validateUslmAttributeCensus(observed) {
  if (!observed || typeof observed !== "object" || Array.isArray(observed)
    || JSON.stringify(Object.keys(observed).sort())
      !== JSON.stringify([...OBSERVED_USLM_ELEMENTS].sort())) {
    throw new Error("USLM renderer attribute census element set is invalid.");
  }
  for (const element of OBSERVED_USLM_ELEMENTS) {
    const attributes = observed[element];
    if (!Array.isArray(attributes)
      || attributes.some((name) => typeof name !== "string")
      || new Set(attributes).size !== attributes.length) {
      throw new Error(
        `USLM renderer attribute census is invalid: ${element}.`,
      );
    }
    const expected = [...USLM_ATTRIBUTE_REGISTRY[element]].sort();
    const actual = [...attributes].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      const missing = expected.filter((name) => !actual.includes(name));
      const unknown = actual.filter((name) => !expected.includes(name));
      throw new Error(
        `USLM renderer attribute drift: ${element}; `
        + `missing=${missing.join(",")}; unknown=${unknown.join(",")}.`,
      );
    }
  }
  return true;
}

function deepFreeze(value) {
  for (const item of Object.values(value)) Object.freeze(item);
  return Object.freeze(value);
}

validateUslmRendererCensus([...OBSERVED_USLM_ELEMENTS]);
validateUslmAttributeCensus(USLM_ATTRIBUTE_REGISTRY);
