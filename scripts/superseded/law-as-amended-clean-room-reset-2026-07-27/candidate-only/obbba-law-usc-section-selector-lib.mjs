import { createHash } from "node:crypto";

const SECTION_PARENTS = new Set([
  "title",
  "subtitle",
  "chapter",
  "subchapter",
  "part",
  "subpart",
  "division",
  "level",
]);

export function indexUscSections(xml, expectedTitle, requestedSections) {
  if (typeof xml !== "string" || !xml.includes("<uscDoc")) {
    throw new Error("USC selector input is not a USLM document.");
  }
  const entries = new Map();
  const stack = [];
  let titleIdentityCount = 0;
  let offset = 0;
  while (offset < xml.length) {
    const opening = xml.indexOf("<", offset);
    if (opening < 0) break;
    if (xml.startsWith("<!--", opening)) {
      offset = requireTerminator(xml, opening, "-->", "comment");
      continue;
    }
    if (xml.startsWith("<![CDATA[", opening)) {
      offset = requireTerminator(xml, opening, "]]>", "CDATA");
      continue;
    }
    if (xml.startsWith("<?", opening)) {
      offset = requireTerminator(xml, opening, "?>", "processing instruction");
      continue;
    }
    if (xml.startsWith("<!", opening)) {
      offset = findTagEnd(xml, opening) + 1;
      continue;
    }
    const end = findTagEnd(xml, opening);
    const token = xml.slice(opening, end + 1);
    const closing = /^<\s*\/\s*([A-Za-z_][\w:.-]*)\s*>$/.exec(token);
    if (closing) {
      const frame = stack.pop();
      if (!frame || frame.name !== closing[1]) {
        throw new Error(`USC XML element stack mismatch at ${opening}.`);
      }
      if (frame.selection) {
        addSelection(entries, {
          ...frame.selection,
          fragment: xml.slice(frame.start, end + 1),
        });
      }
      offset = end + 1;
      continue;
    }
    const start = /^<\s*([A-Za-z_][\w:.-]*)\b([\s\S]*?)\/?\s*>$/.exec(token);
    if (!start) {
      throw new Error(`USC XML token is malformed at ${opening}.`);
    }
    const name = start[1];
    const selfClosing = /\/\s*>$/.test(token);
    const parent = stack.at(-1)?.name;
    const identifier = attributeValue(token, "identifier");
    let selection;
    if (name === "title"
      && identifier === `/us/usc/t${expectedTitle}`) {
      titleIdentityCount += 1;
    }
    if (name === "section") {
      const identity = identifier && new RegExp(
        `^/us/usc/t${escapeRegex(expectedTitle)}/s([^/]+)$`,
      ).exec(identifier);
      if (identity) {
        const titleAncestor = [...stack]
          .reverse()
          .find((frame) => frame.name === "title");
        if (stack.some((frame) => frame.name === "section")
          || !SECTION_PARENTS.has(parent)
          || titleAncestor?.identifier !== `/us/usc/t${expectedTitle}`) {
          throw new Error(
            `USC target section has invalid structural ancestry: ${identifier}.`,
          );
        }
        const canonicalSection = identity[1].replaceAll("–", "-");
        if (!/^[A-Za-z0-9.-]+$/.test(canonicalSection)) {
          throw new Error(`USC section identity is invalid: ${identifier}.`);
        }
        if (!requestedSections || requestedSections.has(canonicalSection)) {
          selection = {
            uscTitle: expectedTitle,
            uscSection: canonicalSection,
            sourceIdentifier: identifier,
            start: opening,
          };
        }
      }
    }
    if (selfClosing) {
      if (selection) {
        addSelection(entries, {
          ...selection,
          fragment: token,
        });
      }
    } else {
      stack.push({ name, identifier, start: opening, selection });
    }
    offset = end + 1;
  }
  if (stack.length) {
    throw new Error(`USC XML has unclosed element: ${stack.at(-1).name}.`);
  }
  if (titleIdentityCount !== 1) {
    throw new Error(
      `USC document must contain exactly one title identity /us/usc/t${expectedTitle}.`,
    );
  }
  return entries;
}

export function selectUscTargets(xml, expectedTitle, targets) {
  if (!Array.isArray(targets) || !targets.length
    || targets.some((target) => !/^[A-Za-z0-9.-]+$/.test(target))
    || new Set(targets).size !== targets.length) {
    throw new Error("USC selector targets are empty, invalid, or duplicated.");
  }
  const index = indexUscSections(xml, expectedTitle, new Set(targets));
  return targets.map((target) => index.get(target) ?? {
    state: "absent",
    uscTitle: expectedTitle,
    uscSection: target,
  });
}

function addSelection(entries, selection) {
  if (entries.has(selection.uscSection)) {
    throw new Error(
      `USC section identity is duplicated: ${selection.sourceIdentifier}.`,
    );
  }
  const { start: _start, ...entry } = selection;
  entries.set(entry.uscSection, {
    state: "present",
    ...entry,
    bytes: Buffer.byteLength(entry.fragment, "utf8"),
    sha256: sha256(entry.fragment),
  });
}

function attributeValue(token, name) {
  const matches = [...token.matchAll(
    new RegExp(`\\s${escapeRegex(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "g"),
  )];
  if (matches.length > 1) {
    throw new Error(`USC element repeats attribute: ${name}.`);
  }
  return matches.length ? (matches[0][1] ?? matches[0][2]) : undefined;
}

function findTagEnd(xml, start) {
  let quote;
  for (let index = start + 1; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  throw new Error(`USC XML tag is unterminated at ${start}.`);
}

function requireTerminator(xml, start, terminator, label) {
  const end = xml.indexOf(terminator, start + 2);
  if (end < 0) throw new Error(`USC XML ${label} is unterminated.`);
  return end + terminator.length;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
