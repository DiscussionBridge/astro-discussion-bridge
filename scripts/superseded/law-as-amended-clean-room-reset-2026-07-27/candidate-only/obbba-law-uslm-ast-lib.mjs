import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import {
  operativeLegalTextCommitment,
} from "./obbba-law-usc-comparison-lib.mjs";
import {
  USLM_ATTRIBUTE_REGISTRY,
  USLM_ELEMENT_REGISTRY,
  USLM_RENDERER_PROFILE,
} from "./obbba-law-uslm-renderer-registry.mjs";

const require = createRequire(
  new URL("../packages/astro-discussion-bridge/package.json", import.meta.url),
);
const { XMLParser, XMLValidator } = require("fast-xml-parser");
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  trimValues: false,
});
const NOTE_TOPICS = new Set([
  "amendments", "changeOfName", "codification", "definitions",
  "editorialNotes", "effectiveDate", "effectiveDateOfAmendment", "execDoc",
  "executiveOrder", "historicalAndRevision", "miscellaneous",
  "priorProvisions", "prospectiveAmendment", "referencesInText",
  "removalDescription", "repeals", "savings", "separability", "shortTitle",
  "shortTitleOfAmendment", "statutoryNotes", "terminationDate",
  "transferOfFunctions",
]);
const IGNORED_ATTRIBUTES = new Set(["class", "style", "id"]);
const SUBSTANTIVE_TEXT_PARENTS = new Set([
  "b", "chapeau", "content", "continuation", "date", "heading", "i",
  "inline", "name", "note", "num", "p", "ref", "span", "sub", "sup",
  "title", "quotedContent",
]);
const ALLOWED_CHILDREN = new Set(`
section>chapeau section>content section>heading section>num
section>paragraph section>subsection
subsection>chapeau subsection>clause subsection>content
subsection>continuation subsection>heading subsection>num
subsection>paragraph subsection>subparagraph
paragraph>chapeau paragraph>clause paragraph>content
paragraph>continuation paragraph>heading paragraph>num
paragraph>subparagraph
subparagraph>chapeau subparagraph>clause subparagraph>content
subparagraph>continuation subparagraph>heading subparagraph>note
subparagraph>num subparagraph>subclause
clause>chapeau clause>content clause>continuation clause>heading
clause>num clause>subclause
subclause>chapeau subclause>content subclause>heading
subclause>item subclause>level subclause>num
item>chapeau item>content item>heading item>num item>subitem
subitem>content subitem>heading subitem>num
level>content level>num
chapeau>br chapeau>date chapeau>i chapeau>note chapeau>ref chapeau>sub chapeau>sup
content>br content>date content>i content>note content>p content>ref
content>sub content>sup content>table
continuation>br continuation>date continuation>i continuation>note continuation>ref
continuation>sup continuation>table
heading>br heading>date heading>inline heading>note heading>ref heading>sub heading>sup
p>b p>br p>date p>i p>note p>quotedContent p>ref p>span p>sub p>sup p>table
quotedContent>b quotedContent>date quotedContent>i quotedContent>ref
quotedContent>span quotedContent>sub quotedContent>sup quotedContent>br
note>br note>i note>inline note>num note>p note>ref note>sub note>signature
signature>name signature>title
table>colgroup table>thead table>tbody
colgroup>col thead>tr tbody>tr tr>th tr>td th>p td>p
`.trim().split(/\s+/));

export function buildUslmOperativeAst(fragment, {
  expectedTitle,
  expectedSection,
} = {}) {
  if (typeof fragment !== "string" || !fragment
    || !/^[1-9]\d*$/.test(expectedTitle ?? "")
    || !/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(
      expectedSection ?? "",
    )) {
    throw new Error("USLM AST input identity is invalid.");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(fragment)) {
    throw new Error("USLM AST input cannot contain DTD or entities.");
  }
  validateRawOpeningTags(fragment);
  if (XMLValidator.validate(fragment) !== true) {
    throw new Error("USLM AST input is not well-formed XML.");
  }
  const parsed = parser.parse(fragment);
  if (!Array.isArray(parsed) || parsed.length !== 1
    || !Object.hasOwn(parsed[0], "section")) {
    throw new Error("USLM AST requires exactly one section root.");
  }
  const rootAttributes = attributesOf(parsed[0]);
  validateAttributes("section", rootAttributes);
  const expectedIdentifier = `/us/usc/t${expectedTitle}/s${expectedSection}`;
  if (rootAttributes.identifier?.replaceAll("–", "-") !== expectedIdentifier) {
    throw new Error("USLM AST section identity does not match review.");
  }
  const children = buildChildren(parsed[0].section, ["section"]);
  const ast = {
    profile: USLM_RENDERER_PROFILE,
    uscTitle: expectedTitle,
    uscSection: expectedSection,
    sourceIdentifier: rootAttributes.identifier,
    status: rootAttributes.status ?? "active",
    children,
  };
  validateFootnoteReferences(ast);
  const normalized = normalizeText(collectAstText(children).join(" "));
  const reviewed = operativeLegalTextCommitment(fragment);
  const semantic = {
    profile: reviewed.profile,
    characters: normalized.length,
    words: normalized ? normalized.split(" ").length : 0,
    sha256: sha256(normalized),
  };
  if (JSON.stringify(semantic) !== JSON.stringify(reviewed)) {
    throw new Error("USLM AST semantic commitment differs from reviewed text.");
  }
  const result = {
    ast,
    sourceFragmentSha256: sha256(fragment),
    canonicalAstSha256: sha256(stableStringify(ast)),
    operativeTextCommitment: semantic,
  };
  validateUslmOperativeAstResult(result);
  return result;
}

export function validateUslmOperativeAstResult(result) {
  exactKeys(result, [
    "ast", "canonicalAstSha256", "operativeTextCommitment",
    "sourceFragmentSha256",
  ], "result");
  exactKeys(result.ast, [
    "children", "profile", "sourceIdentifier", "status", "uscSection",
    "uscTitle",
  ], "root");
  if (result.ast.profile !== USLM_RENDERER_PROFILE
    || !/^[1-9]\d*$/.test(result.ast.uscTitle)
    || !/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(
      result.ast.uscSection,
    )
    || !["active", "repealed"].includes(result.ast.status)
    || result.ast.sourceIdentifier.replaceAll("–", "-")
      !== `/us/usc/t${result.ast.uscTitle}/s${result.ast.uscSection}`) {
    throw new Error("USLM AST result identity is invalid.");
  }
  validateAstNodes(result.ast.children, ["section"]);
  validateFootnoteReferences(result.ast);
  exactKeys(result.operativeTextCommitment, [
    "characters", "profile", "sha256", "words",
  ], "operative commitment");
  if (result.operativeTextCommitment.profile !== "uslm-operative-text-v1"
    || !Number.isSafeInteger(result.operativeTextCommitment.characters)
    || result.operativeTextCommitment.characters < 0
    || !Number.isSafeInteger(result.operativeTextCommitment.words)
    || result.operativeTextCommitment.words < 0
    || !/^[a-f0-9]{64}$/.test(result.operativeTextCommitment.sha256)
    || !/^[a-f0-9]{64}$/.test(result.sourceFragmentSha256)
    || !/^[a-f0-9]{64}$/.test(result.canonicalAstSha256)) {
    throw new Error("USLM AST result commitment is invalid.");
  }
  const normalized = normalizeText(collectAstText(result.ast.children).join(" "));
  const semantic = {
    profile: "uslm-operative-text-v1",
    characters: normalized.length,
    words: normalized ? normalized.split(" ").length : 0,
    sha256: sha256(normalized),
  };
  if (stableStringify(semantic)
      !== stableStringify(result.operativeTextCommitment)
    || sha256(stableStringify(result.ast)) !== result.canonicalAstSha256) {
    throw new Error("USLM AST result commitment does not match its content.");
  }
  return result;
}

function validateAstNodes(nodes, ancestry) {
  if (!Array.isArray(nodes)) throw new Error("USLM AST nodes are malformed.");
  for (const node of nodes) {
    if (node?.type === "text") {
      exactKeys(node, ["type", "value"], "text node");
      if (typeof node.value !== "string"
        || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(node.value)
        || (node.value.trim()
          && !SUBSTANTIVE_TEXT_PARENTS.has(ancestry.at(-1)))) {
        throw new Error("USLM AST text node is invalid.");
      }
      continue;
    }
    exactKeys(node, ["attributes", "children", "name", "type"], "element node");
    if (node.type !== "element"
      || !Object.hasOwn(USLM_ELEMENT_REGISTRY, node.name)
      || ["notes", "sourceCredit"].includes(node.name)) {
      throw new Error("USLM AST element node is invalid.");
    }
    validateAncestry(node.name, ancestry);
    validateAttributes(node.name, node.attributes);
    if (stableStringify(node.attributes)
      !== stableStringify(semanticAttributes(node.name, node.attributes))) {
      throw new Error("USLM AST contains nonsemantic attributes.");
    }
    validateAstNodes(node.children, [...ancestry, node.name]);
  }
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || stableStringify(Object.keys(value).sort())
      !== stableStringify([...keys].sort())) {
    throw new Error(`USLM AST ${label} schema is invalid.`);
  }
}

function buildChildren(nodes, ancestry, editorial = false) {
  if (!Array.isArray(nodes)) {
    throw new Error("USLM AST child collection is malformed.");
  }
  const output = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new Error("USLM AST node is malformed.");
    }
    const contentKeys = Object.keys(node).filter((key) => key !== ":@");
    if (contentKeys.length !== 1) {
      throw new Error("USLM AST node must contain exactly one value.");
    }
    const name = contentKeys[0];
    if (name === "#text") {
      const text = String(node[name]);
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) {
        throw new Error("USLM AST text contains control characters.");
      }
      const parent = ancestry.at(-1);
      if (!editorial && text.trim()
        && !SUBSTANTIVE_TEXT_PARENTS.has(parent)) {
        throw new Error(
          `USLM AST substantive text has invalid parent: ${parent}.`,
        );
      }
      output.push({ type: "text", value: text });
      continue;
    }
    if (!Object.hasOwn(USLM_ELEMENT_REGISTRY, name)) {
      throw new Error(`USLM AST element is not reviewed: ${name}.`);
    }
    const attributes = attributesOf(node);
    validateAttributes(name, attributes);
    const parent = ancestry.at(-1);
    const category = USLM_ELEMENT_REGISTRY[name];
    if (category === "editorial-boundary") {
      if (name === "note" && !editorial && !ancestry.includes("notes")) {
        output.push({
          type: "element",
          name,
          attributes: semanticAttributes(name, attributes),
          children: buildChildren(node[name], [...ancestry, name]),
        });
        continue;
      }
      if ((name === "notes" || name === "sourceCredit")
        && parent === "section" && ancestry.length === 1) {
        buildChildren(node[name], [...ancestry, name], true);
        continue;
      }
      if (name === "note" && editorial && ancestry.includes("notes")) {
        buildChildren(node[name], [...ancestry, name], true);
        continue;
      }
      throw new Error(`USLM editorial element has invalid ancestry: ${name}.`);
    }
    if (editorial) {
      buildChildren(node[name], [...ancestry, name], true);
      continue;
    }
    validateAncestry(name, ancestry);
    output.push({
      type: "element",
      name,
      attributes: semanticAttributes(name, attributes),
      children: buildChildren(node[name], [...ancestry, name]),
    });
  }
  return output;
}

function validateAncestry(name, ancestry) {
  const parent = ancestry.at(-1);
  if (name === "section") {
    throw new Error("USLM AST cannot contain a nested section.");
  }
  if (!ALLOWED_CHILDREN.has(`${parent}>${name}`)) {
    throw new Error(`USLM AST parent/child structure is invalid: ${parent}>${name}.`);
  }
}

function validateAttributes(name, attributes) {
  const allowed = USLM_ATTRIBUTE_REGISTRY[name];
  const actual = Object.keys(attributes);
  if (actual.some((attribute) => !allowed.includes(attribute))) {
    throw new Error(`USLM AST ${name} has an unreviewed attribute.`);
  }
  for (const [attribute, value] of Object.entries(attributes)) {
    if (typeof value !== "string"
      || /[\u0000-\u001F\u007F]/u.test(value)
      || value.length > 4096) {
      throw new Error(`USLM AST ${name}.${attribute} is invalid.`);
    }
    if (IGNORED_ATTRIBUTES.has(attribute)) continue;
    validateSemanticValue(name, attribute, value);
  }
  if (name === "note" && Object.hasOwn(attributes, "id")) {
    const isFootnote = attributes.type === "footnote";
    const validId = /^fn\d{6}$/.test(attributes.id);
    if (isFootnote !== validId) {
      throw new Error("USLM AST note footnote identity is invalid.");
    }
  } else if (name === "note" && attributes.type === "footnote") {
    throw new Error("USLM AST note footnote identity is invalid.");
  }
}

function validateSemanticValue(name, attribute, value) {
  if (attribute === "identifier"
    && !/^\/us\/usc\/t[1-9]\d*\/s[A-Za-z0-9.–-]+(?:\/[A-Za-z0-9.–-]+)*$/.test(
      value,
    )) throw invalid(name, attribute);
  if (attribute === "status" && value !== "repealed") {
    throw invalid(name, attribute);
  }
  if (attribute === "date" && !isCalendarDate(value)) {
    throw invalid(name, attribute);
  }
  if (attribute === "href"
    && !isOfficialReferencePath(value)) {
    throw invalid(name, attribute);
  }
  if (attribute === "idref" && !/^fn\d{6}$/.test(value)) {
    throw invalid(name, attribute);
  }
  if (attribute === "xmlns"
    && value !== "http://www.w3.org/1999/xhtml") throw invalid(name, attribute);
  if (attribute === "role"
    && !["crossHeading", "listItem"].includes(value)) {
    throw invalid(name, attribute);
  }
  if (attribute === "topic" && !NOTE_TOPICS.has(value)) {
    throw invalid(name, attribute);
  }
  if (attribute === "type" && !["footnote", "uscNote"].includes(value)) {
    throw invalid(name, attribute);
  }
  if (attribute === "colspan" && !["3", "4"].includes(value)) {
    throw invalid(name, attribute);
  }
  if (attribute === "rowspan" && value !== "2") throw invalid(name, attribute);
  if (attribute === "value"
    && !/^(?:|[A-Za-z0-9.–-]+)$/.test(value)) throw invalid(name, attribute);
  if (attribute === "origin"
    && !isOfficialReferencePath(value)) {
    throw invalid(name, attribute);
  }
  if (attribute === "border" && value !== "0") {
    throw invalid(name, attribute);
  }
  if (attribute === "width" && value !== "50%") {
    throw invalid(name, attribute);
  }
}

function semanticAttributes(name, attributes) {
  return Object.fromEntries(Object.entries(attributes)
    .filter(([attribute, value]) =>
      !IGNORED_ATTRIBUTES.has(attribute)
      || (name === "note" && attribute === "id"
        && attributes.type === "footnote" && /^fn\d{6}$/.test(value)))
    .sort(([left], [right]) => left.localeCompare(right)));
}

function validateFootnoteReferences(ast) {
  const references = new Map();
  const targets = new Map();
  visitAst(ast.children, (node) => {
    const idref = node.attributes?.idref;
    if (idref) {
      references.set(idref, (references.get(idref) ?? 0) + 1);
    }
    if (node.name === "note" && node.attributes?.type === "footnote") {
      const id = node.attributes.id;
      if (!/^fn\d{6}$/.test(id ?? "") || targets.has(id)) {
        throw new Error("USLM AST footnote target identity is invalid.");
      }
      targets.set(id, node);
    }
  });
  for (const [id, count] of references) {
    if (count < 1 || !targets.has(id)) {
      throw new Error(`USLM AST footnote reference does not resolve: ${id}.`);
    }
  }
  for (const id of targets.keys()) {
    if (!references.has(id)) {
      throw new Error(`USLM AST footnote target is not referenced: ${id}.`);
    }
  }
}

function visitAst(nodes, callback) {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    callback(node);
    visitAst(node.children, callback);
  }
}

function isCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
  ));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

function isOfficialReferencePath(value) {
  return /^\/us\/(?:usc|pl|stat|act)\/[A-Za-z0-9._~!$&'()*+,;=:@–-]+(?:\/[A-Za-z0-9._~!$&'()*+,;=:@–-]+)*$/u.test(
    value,
  ) && !value.split("/").some((segment) =>
    segment === "." || segment === "..");
}

function attributesOf(node) {
  const raw = node[":@"] ?? {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("USLM AST attributes are malformed.");
  }
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => {
    if (!key.startsWith("@_")) {
      throw new Error("USLM AST attribute encoding is malformed.");
    }
    return [key.slice(2), String(value)];
  }));
}

function validateRawOpeningTags(xml) {
  let offset = 0;
  while (offset < xml.length) {
    const opening = xml.indexOf("<", offset);
    if (opening < 0) break;
    if (xml.startsWith("<!--", opening)) {
      offset = requireTerminator(xml, opening, "-->");
      continue;
    }
    if (xml.startsWith("<![CDATA[", opening)) {
      offset = requireTerminator(xml, opening, "]]>");
      continue;
    }
    if (xml.startsWith("<?", opening)) {
      offset = requireTerminator(xml, opening, "?>");
      continue;
    }
    const end = findTagEnd(xml, opening);
    const token = xml.slice(opening, end + 1);
    if (!/^<\s*\//.test(token)) {
      const names = [...token.matchAll(
        /\s([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=/g,
      )].map((match) => match[1]);
      if (new Set(names).size !== names.length) {
        throw new Error("USLM AST element repeats an attribute.");
      }
    }
    offset = end + 1;
  }
}

function findTagEnd(xml, start) {
  let quote;
  for (let index = start + 1; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === ">") return index;
  }
  throw new Error("USLM AST tag is unterminated.");
}

function requireTerminator(xml, start, terminator) {
  const end = xml.indexOf(terminator, start + 2);
  if (end < 0) throw new Error("USLM AST markup is unterminated.");
  return end + terminator.length;
}

function collectAstText(nodes, output = []) {
  for (const node of nodes) {
    if (node.type === "text") output.push(node.value);
    else collectAstText(node.children, output);
  }
  return output;
}

function normalizeText(value) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function invalid(name, attribute) {
  return new Error(`USLM AST ${name}.${attribute} value is invalid.`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
