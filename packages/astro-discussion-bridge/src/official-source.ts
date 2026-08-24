import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

export type OfficialSourceComparisonOutcome =
  | "exact"
  | "presentation-only"
  | "substantive-difference"
  | "unresolved";

export interface UsPublicLawSourceProfile {
  profile: "us-public-law";
  law: string;
  title?: string;
  congressUrl: string;
  xmlUrl: string;
  textUrl?: string;
  pdfUrl?: string;
  pdfPageOffset?: number;
}

export type OfficialSourceProfile = UsPublicLawSourceProfile;

export interface OfficialTextMetadata {
  profile: "us-public-law";
  law: string;
  title?: string;
  section: string;
  label: string;
  heading?: string;
  citation: string;
  congressUrl: string;
  xmlUrl: string;
  textUrl?: string;
  pdfUrl?: string;
  comparison: Exclude<OfficialSourceComparisonOutcome, "unresolved">;
  checkedAt: string;
  sourceHash: string;
  sourceFormat: "uslm" | "txt";
}

export interface OfficialSourceComparison {
  metadata: OfficialTextMetadata;
  officialText: string;
  normalizedOfficialText: string;
  normalizedCommunityText: string;
  firstDifference?: {
    tokenIndex: number;
    officialContext: string;
    communityContext: string;
  };
}

export interface CompareOfficialSourceOptions {
  source: OfficialSourceProfile;
  sectionId: string;
  communityText: string;
  checkedAt?: string;
  fetch?: typeof globalThis.fetch;
  documentCache?: Map<string, Promise<string>>;
}

type PreserveOrderNode = Record<string, unknown> & {
  ":@"?: Record<string, string>;
};

interface PageReference {
  volume: number;
  page: number;
  identifier: string;
}

interface ExtractedSection {
  heading: string;
  text: string;
  pages: PageReference[];
}

export async function compareOfficialSource(
  options: CompareOfficialSourceOptions,
): Promise<OfficialSourceComparison> {
  const sectionId = validateSectionId(options.sectionId);
  const source = validateOfficialSourceProfile(options.source);
  const fetcher = options.fetch ?? globalThis.fetch;
  let extracted: ExtractedSection;
  let sourceFormat: OfficialTextMetadata["sourceFormat"] = "uslm";
  try {
    const xml = await fetchOfficialSourceDocument(
      source.xmlUrl,
      fetcher,
      options.documentCache,
      "application/xml,text/xml;q=0.9,*/*;q=0.1",
    );
    extracted = extractUsPublicLawSection(xml, sectionId);
  } catch (xmlError) {
    if (!source.textUrl) throw xmlError;
    try {
      const text = await fetchOfficialSourceDocument(
        source.textUrl,
        fetcher,
        options.documentCache,
        "text/plain,text/html;q=0.8,*/*;q=0.1",
      );
      extracted = extractUsPublicLawSectionFromText(text, sectionId);
      sourceFormat = "txt";
    } catch (textError) {
      throw new Error(
        `Official source could not resolve Section ${sectionId} from USLM XML or TXT. ` +
        `USLM: ${errorMessage(xmlError)} TXT: ${errorMessage(textError)}`,
      );
    }
  }
  const officialForExactComparison = normalizeExactText(extracted.text);
  const communityForExactComparison = normalizeExactText(stripMarkdownLinks(options.communityText));
  const normalizedOfficialText = normalizeLegalText(extracted.text);
  const normalizedCommunityText = normalizeLegalText(stripMarkdownLinks(options.communityText));
  const comparison = officialForExactComparison === communityForExactComparison
    ? "exact"
    : normalizedOfficialText === normalizedCommunityText
      ? "presentation-only"
      : "substantive-difference";
  const firstDifference = comparison === "substantive-difference"
    ? firstTokenDifference(normalizedOfficialText, normalizedCommunityText)
    : undefined;
  const citation = citationForPages(extracted.pages, sectionId);
  const structuralLabel = [source.title, `Section ${sectionId}`].filter(Boolean).join(", ");
  const heading = sentenceCaseHeading(extracted.heading);

  return {
    metadata: {
      profile: source.profile,
      law: source.law,
      ...(source.title ? { title: source.title } : {}),
      section: sectionId,
      label: structuralLabel,
      ...(heading ? { heading } : {}),
      citation,
      congressUrl: source.congressUrl,
      xmlUrl: source.xmlUrl,
      ...(source.textUrl ? { textUrl: source.textUrl } : {}),
      ...(source.pdfUrl
        ? { pdfUrl: pdfUrlForPages(source.pdfUrl, extracted.pages, source.pdfPageOffset) }
        : {}),
      comparison,
      checkedAt: options.checkedAt ?? new Date().toISOString(),
      sourceHash: createHash("sha256").update(normalizedOfficialText).digest("hex"),
      sourceFormat,
    },
    officialText: extracted.text,
    normalizedOfficialText,
    normalizedCommunityText,
    ...(firstDifference ? { firstDifference } : {}),
  };
}

export function validateOfficialSourceProfile(value: unknown): OfficialSourceProfile {
  if (!isRecord(value)) throw new Error("Official source profile must be an object.");
  const allowed = new Set([
    "profile",
    "law",
    "title",
    "congressUrl",
    "xmlUrl",
    "textUrl",
    "pdfUrl",
    "pdfPageOffset",
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new Error(`Official source profile contains unknown field(s): ${unknown.join(", ")}.`);
  }
  if (value.profile !== "us-public-law") {
    throw new Error(`Unsupported official source profile: ${String(value.profile)}.`);
  }

  return {
    profile: value.profile,
    law: requiredString(value.law, "official source law"),
    ...(value.title === undefined ? {} : { title: requiredString(value.title, "official source title") }),
    congressUrl: requiredCongressUrl(value.congressUrl, "official source congressUrl"),
    xmlUrl: requiredCongressUrl(value.xmlUrl, "official source xmlUrl"),
    ...(value.textUrl === undefined
      ? {}
      : { textUrl: requiredCongressUrl(value.textUrl, "official source textUrl") }),
    ...(value.pdfUrl === undefined
      ? {}
      : { pdfUrl: requiredCongressUrl(value.pdfUrl, "official source pdfUrl") }),
    ...(value.pdfPageOffset === undefined
      ? {}
      : { pdfPageOffset: requiredNonNegativeInteger(value.pdfPageOffset, "official source pdfPageOffset") }),
  };
}

export function parseOfficialTextMetadata(value: unknown): OfficialTextMetadata | undefined {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!isRecord(parsed) || parsed.profile !== "us-public-law") return undefined;
  const comparison = parsed.comparison;
  if (
    comparison !== "exact"
    && comparison !== "presentation-only"
    && comparison !== "substantive-difference"
  ) return undefined;
  try {
    return {
      profile: parsed.profile,
      law: requiredString(parsed.law, "official text law"),
      ...(parsed.title === undefined ? {} : { title: requiredString(parsed.title, "official text title") }),
      section: requiredString(parsed.section, "official text section"),
      label: requiredString(parsed.label, "official text label"),
      ...(parsed.heading === undefined
        ? {}
        : { heading: requiredString(parsed.heading, "official text heading") }),
      citation: requiredString(parsed.citation, "official text citation"),
      congressUrl: requiredCongressUrl(parsed.congressUrl, "official text congressUrl"),
      xmlUrl: requiredCongressUrl(parsed.xmlUrl, "official text xmlUrl"),
      ...(parsed.textUrl === undefined
        ? {}
        : { textUrl: requiredCongressUrl(parsed.textUrl, "official text textUrl") }),
      ...(parsed.pdfUrl === undefined
        ? {}
        : { pdfUrl: requiredCongressUrl(parsed.pdfUrl, "official text pdfUrl") }),
      comparison,
      checkedAt: requiredString(parsed.checkedAt, "official text checkedAt"),
      sourceHash: requiredString(parsed.sourceHash, "official text sourceHash"),
      sourceFormat: parsed.sourceFormat === "uslm" || parsed.sourceFormat === "txt"
        ? parsed.sourceFormat
        : "uslm",
    };
  } catch {
    return undefined;
  }
}

export function extractUsPublicLawSection(xml: string, sectionId: string): ExtractedSection {
  const parsed = new XMLParser({
    ignoreAttributes: false,
    preserveOrder: true,
    attributeNamePrefix: "@_",
    trimValues: false,
  }).parse(xml) as PreserveOrderNode[];
  const matches: ExtractedSection[] = [];
  let currentPage: PageReference | undefined;

  const walk = (nodes: PreserveOrderNode[]): void => {
    for (const node of nodes) {
      const element = elementForNode(node);
      if (!element) continue;

      if (element.name === "page") {
        currentPage = pageReference(node, element.children) ?? currentPage;
        continue;
      }

      if (element.name === "section" && sectionValue(element.children) === sectionId) {
        const nestedPages = collectPageReferences(element.children);
        const pages = dedupePages([
          ...(currentPage ? [currentPage] : []),
          ...nestedPages,
        ]);
        matches.push({
          heading: directChildText(element.children, "heading").trim(),
          text: sectionText(element.children).trim(),
          pages,
        });
        if (nestedPages.length) currentPage = nestedPages.at(-1);
        continue;
      }

      walk(element.children);
    }
  };

  walk(parsed);

  if (matches.length === 0) {
    throw new Error(`Official source does not contain Section ${sectionId}. No file was written.`);
  }
  if (matches.length > 1) {
    throw new Error(`Official source contains multiple matches for Section ${sectionId}. No file was written.`);
  }
  if (!matches[0].pages.length) {
    throw new Error(`Official source does not expose a Statutes at Large page for Section ${sectionId}. No file was written.`);
  }
  return matches[0];
}

export function extractUsPublicLawSectionFromText(
  documentText: string,
  sectionId: string,
): ExtractedSection {
  const text = textPayload(documentText);
  const sectionPattern = new RegExp(
    `^\\s*SEC\\.\\s+${escapeRegExp(sectionId)}\\.\\s+(.+?)\\s*$`,
    "gmi",
  );
  const matches = [...text.matchAll(sectionPattern)];
  if (matches.length === 0) {
    throw new Error(`Official TXT source does not contain Section ${sectionId}. No file was written.`);
  }
  if (matches.length > 1) {
    throw new Error(`Official TXT source contains multiple matches for Section ${sectionId}. No file was written.`);
  }
  const match = matches[0];
  const start = match.index;
  if (start === undefined) throw new Error(`Official TXT source could not locate Section ${sectionId}.`);
  const afterHeading = start + match[0].length;
  const nextSection = /^\s*SEC\.\s+[A-Za-z0-9.-]+\./gmi;
  nextSection.lastIndex = afterHeading;
  const next = nextSection.exec(text);
  const end = next?.index ?? text.length;
  const preceding = text.slice(0, start);
  const precedingPages = [...preceding.matchAll(/\[\[Page\s+(\d+)\s+STAT\.\s+(\d+)\]\]/gi)];
  const startPageMatch = precedingPages.at(-1);
  const sectionBlock = text.slice(afterHeading, end);
  const pages: PageReference[] = [];
  if (startPageMatch) {
    pages.push({
      volume: Number(startPageMatch[1]),
      page: Number(startPageMatch[2]),
      identifier: `/us/stat/${startPageMatch[1]}/${startPageMatch[2]}`,
    });
  }
  for (const page of sectionBlock.matchAll(/\[\[Page\s+(\d+)\s+STAT\.\s+(\d+)\]\]/gi)) {
    pages.push({
      volume: Number(page[1]),
      page: Number(page[2]),
      identifier: `/us/stat/${page[1]}/${page[2]}`,
    });
  }
  if (!pages.length) {
    throw new Error(`Official TXT source does not expose a Statutes at Large page for Section ${sectionId}.`);
  }
  const body = sectionBlock
    .replace(/\[\[Page\s+\d+\s+STAT\.\s+\d+\]\]/gi, " ")
    .replace(/<<NOTE:[\s\S]*?>>/g, " ")
    .trim();
  return {
    heading: match[1].trim(),
    text: body,
    pages: dedupePages(pages),
  };
}

export function normalizeLegalText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F`'"]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sectionText(children: PreserveOrderNode[]): string {
  return children
    .filter((child) => {
      const element = elementForNode(child);
      return !element || (element.name !== "num" && element.name !== "heading");
    })
    .map((child) => textForNode(child, new Set(["page", "sidenote"])))
    .join("");
}

function textForNode(node: PreserveOrderNode, excluded: Set<string>): string {
  if (typeof node["#text"] === "string") return node["#text"];
  const element = elementForNode(node);
  if (!element || excluded.has(element.name)) return "";
  return element.children.map((child) => textForNode(child, excluded)).join("");
}

function directChildText(children: PreserveOrderNode[], name: string): string {
  const child = children.find((candidate) => elementForNode(candidate)?.name === name);
  return child ? textForNode(child, new Set(["sidenote", "page"])) : "";
}

function sectionValue(children: PreserveOrderNode[]): string | undefined {
  const numberNode = children.find((candidate) => elementForNode(candidate)?.name === "num");
  const value = numberNode?.[":@"]?.["@_value"]?.trim();
  return value || undefined;
}

function collectPageReferences(nodes: PreserveOrderNode[]): PageReference[] {
  const pages: PageReference[] = [];
  const walk = (children: PreserveOrderNode[]): void => {
    for (const child of children) {
      const element = elementForNode(child);
      if (!element) continue;
      if (element.name === "page") {
        const page = pageReference(child, element.children);
        if (page) pages.push(page);
      } else {
        walk(element.children);
      }
    }
  };
  walk(nodes);
  return pages;
}

function pageReference(node: PreserveOrderNode, children: PreserveOrderNode[]): PageReference | undefined {
  const identifier = node[":@"]?.["@_identifier"]?.trim();
  const match = identifier?.match(/^\/us\/stat\/(\d+)\/(\d+)$/);
  if (!identifier || !match) return undefined;
  const text = children.map((child) => textForNode(child, new Set())).join("").trim();
  if (!/\bSTAT\.\s+\d+\b/i.test(text)) return undefined;
  return {
    volume: Number(match[1]),
    page: Number(match[2]),
    identifier,
  };
}

function elementForNode(node: PreserveOrderNode): { name: string; children: PreserveOrderNode[] } | undefined {
  const entry = Object.entries(node).find(([key, value]) =>
    key !== ":@" && key !== "#text" && !key.startsWith("?") && Array.isArray(value)
  );
  return entry
    ? { name: entry[0], children: entry[1] as PreserveOrderNode[] }
    : undefined;
}

function citationForPages(pages: PageReference[], sectionId: string): string {
  const volumes = new Set(pages.map((page) => page.volume));
  if (volumes.size !== 1) {
    throw new Error(`Section ${sectionId} crosses unsupported Statutes at Large volumes. No file was written.`);
  }
  const sorted = [...new Set(pages.map((page) => page.page))].sort((left, right) => left - right);
  const pageRange = sorted.length === 1 ? String(sorted[0]) : `${sorted[0]}-${sorted.at(-1)}`;
  return `${pages[0].volume} Stat. ${pageRange}`;
}

function pdfUrlForPages(
  pdfUrl: string,
  pages: PageReference[],
  pdfPageOffset?: number,
): string {
  const url = new URL(pdfUrl);
  if (url.hash || pdfPageOffset === undefined) return url.href;
  const firstStatPage = Math.min(...pages.map((page) => page.page));
  const pdfPage = firstStatPage - pdfPageOffset;
  url.hash = `page=${Math.max(1, pdfPage)}`;
  return url.href;
}

async function fetchOfficialSourceDocument(
  url: string,
  fetcher: typeof globalThis.fetch,
  cache?: Map<string, Promise<string>>,
  accept = "*/*",
): Promise<string> {
  const existing = cache?.get(url);
  if (existing) return existing;
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let currentUrl = requiredCongressUrl(url, "official source request URL");
    try {
      for (let redirects = 0; redirects <= 3; redirects += 1) {
        const response = await fetcher(currentUrl, {
          headers: { Accept: accept },
          redirect: "manual",
          signal: controller.signal,
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          await response.body?.cancel().catch(() => undefined);
          if (redirects === 3) {
            throw new Error("Official source exceeded the redirect limit. No file was written.");
          }
          if (!location) throw new Error("Official source redirect omitted Location. No file was written.");
          currentUrl = requiredCongressUrl(
            new URL(location, currentUrl).href,
            "official source redirect URL",
          );
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          throw new Error(`Official source request failed: ${response.status} ${response.statusText}. No file was written.`);
        }
        if (response.url) {
          try {
            requiredCongressUrl(response.url, "official source final response URL");
          } catch (error) {
            await response.body?.cancel().catch(() => undefined);
            throw error;
          }
        }
        const body = await readBoundedOfficialSource(response);
        if (!body.trim()) throw new Error("Official source returned an empty document. No file was written.");
        return body;
      }
      throw new Error("Official source exceeded the redirect limit. No file was written.");
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new Error("Official source request timed out. No file was written.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  })();
  cache?.set(url, request);
  return request;
}

async function readBoundedOfficialSource(response: Response): Promise<string> {
  const maxBytes = 8 * 1024 * 1024;
  const declared = response.headers.get("content-length");
  if (declared) {
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("Official source response exceeds the size limit. No file was written.");
    }
  }
  if (!response.body) throw new Error("Official source response body is unavailable. No file was written.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        throw new Error("Official source response exceeds the size limit. No file was written.");
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}

function textPayload(value: string): string {
  if (!/<(?:!doctype|html)\b/i.test(value)) return value;
  const pre = value.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/i)?.[1];
  if (!pre) throw new Error("Official TXT endpoint returned HTML without a text payload.");
  return decodeHtml(pre.replace(/<[^>]+>/g, ""));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeExactText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function stripMarkdownLinks(value: string): string {
  let output = "";
  let index = 0;
  while (index < value.length) {
    if (value[index] !== "[") {
      output += value[index];
      index += 1;
      continue;
    }

    const labelEnd = value.indexOf("]", index + 1);
    if (labelEnd < 0 || value[labelEnd + 1] !== "(") {
      output += value[index];
      index += 1;
      continue;
    }

    let depth = 1;
    let cursor = labelEnd + 2;
    while (cursor < value.length && depth > 0) {
      if (value[cursor] === "(") depth += 1;
      else if (value[cursor] === ")") depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) {
      output += value[index];
      index += 1;
      continue;
    }
    output += value.slice(index + 1, labelEnd);
    index = cursor;
  }
  return output;
}

function firstTokenDifference(
  official: string,
  community: string,
): OfficialSourceComparison["firstDifference"] {
  const officialTokens = official.split(" ");
  const communityTokens = community.split(" ");
  const limit = Math.max(officialTokens.length, communityTokens.length);
  let tokenIndex = 0;
  while (tokenIndex < limit && officialTokens[tokenIndex] === communityTokens[tokenIndex]) {
    tokenIndex += 1;
  }
  const start = Math.max(0, tokenIndex - 8);
  const end = tokenIndex + 12;
  return {
    tokenIndex,
    officialContext: officialTokens.slice(start, end).join(" "),
    communityContext: communityTokens.slice(start, end).join(" "),
  };
}

function sentenceCaseHeading(value: string): string {
  const lower = value.trim().replace(/\.$/, "").toLocaleLowerCase("en-US");
  return lower ? `${lower[0].toLocaleUpperCase("en-US")}${lower.slice(1)}` : "";
}

function validateSectionId(value: string): string {
  const sectionId = value.trim();
  if (!/^[A-Za-z0-9.-]+$/.test(sectionId)) {
    throw new Error(`Official source sectionId is invalid: ${value}.`);
  }
  return sectionId;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function requiredCongressUrl(value: unknown, label: string): string {
  const text = requiredString(value, label);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS congress.gov URL.`);
  }
  if (
    url.protocol !== "https:"
    || (url.hostname !== "congress.gov" && url.hostname !== "www.congress.gov")
    || url.username
    || url.password
    || url.port
  ) {
    throw new Error(`${label} must be an absolute HTTPS congress.gov URL.`);
  }
  return url.href;
}

function requiredNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return Number(value);
}

function dedupePages(pages: PageReference[]): PageReference[] {
  const seen = new Set<string>();
  return pages.filter((page) => {
    if (seen.has(page.identifier)) return false;
    seen.add(page.identifier);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
