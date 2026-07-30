import { normalizeLegalText } from "../packages/astro-discussion-bridge/dist/official-source.js";

export function extractEnrolledSections(markup) {
  const marker = /<span class="lbexSectionlevelOLC">SEC\.\s+(\d+)\.\s*<\/span>/gi;
  const matches = [...markup.matchAll(marker)];
  const sections = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const headingEnd = markup.indexOf("</div></a></p>", current.index);
    if (headingEnd < 0) continue;
    const bodyStart = headingEnd + "</div></a></p>".length;
    const nextSection = next?.index ?? markup.length;
    const remainder = markup.slice(bodyStart, nextSection);
    const hierarchyOffset = remainder.search(
      /<a href="#[^"]+" id="toc-[^"]+"><span class="lbex(?:Title|SubTitle|Chapter|SubChapter|Part|SubPart|Division)LevelOLC(?:Bold)?">(?![“"])|<a href="#[^"]+" id="toc-[^"]+"><span class="lbexSectionlevelOLCBold">(?![“"])/i,
    );
    const attestOffset = remainder.search(/<p class="lbexIndent">\s*Attest\s*:/i);
    const offsets = [hierarchyOffset, attestOffset].filter((offset) => offset >= 0);
    const bodyEnd = offsets.length ? bodyStart + Math.min(...offsets) : nextSection;
    sections.set(current[1], htmlText(markup.slice(bodyStart, bodyEnd)));
  }
  return sections;
}

export function htmlText(value) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?(?:p|div|br|tr|td|table|ul|ol|li)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/gi, "\"")
    .replace(/&lsquo;|&rsquo;|&#8216;|&#8217;/gi, "'")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&sect;|&#167;/gi, "§")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

export function stripMarkdownLinks(value) {
  return value.replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, "$1");
}

export function removeKnownPresentationArtifacts(value, label) {
  let text = value;
  const artifacts = [];
  const normalizedLabel = normalizeLegalText(label);
  if (
    text.length > normalizedLabel.length
    && text.slice(0, normalizedLabel.length).toLocaleLowerCase("en-US")
      === normalizedLabel.toLocaleLowerCase("en-US")
    && text[normalizedLabel.length] === " "
  ) {
    text = text.slice(normalizedLabel.length + 1);
    artifacts.push("matching-section-heading");
  }
  const withoutColorResidue = text
    .replace(/\bbgcolor(?:\s+[a-f0-9]{6})?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutColorResidue !== text) {
    text = withoutColorResidue;
    artifacts.push("legacy-bgcolor-residue");
  }
  return { text, artifacts };
}

export function tokenDiff(left, right) {
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (leftEnd > prefix && rightEnd > prefix && left[leftEnd - 1] === right[rightEnd - 1]) {
    leftEnd -= 1;
    rightEnd -= 1;
  }
  return {
    edits: {
      enrolledChangedSpanTokens: leftEnd - prefix,
      communityChangedSpanTokens: rightEnd - prefix,
    },
    firstDifference: prefix === left.length && prefix === right.length
      ? undefined
      : {
          tokenIndex: prefix,
          enrolledContext: left.slice(Math.max(0, prefix - 8), prefix + 12).join(" "),
          communityContext: right.slice(Math.max(0, prefix - 8), prefix + 12).join(" "),
        },
  };
}

export async function fetchJsonWithRetry(input) {
  for (let attempt = 0; attempt <= 4; attempt += 1) {
    const response = await input.fetch(input.url, {
      headers: {
        "Api-Key": input.apiKey,
        "Api-Username": input.apiUsername,
        Accept: "application/json",
      },
      redirect: "error",
    });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 4) {
      await releaseResponseBody(response);
      throw new Error(`Read failed: ${response.status}.`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter)
      ? Math.min(30_000, Math.max(250, retryAfter * 1_000))
      : Math.min(30_000, 2_000 * (attempt + 1));
    await releaseResponseBody(response);
    await wait(delay);
  }
}

async function releaseResponseBody(response) {
  try {
    if (response.body) await Promise.race([response.body.cancel(), wait(50)]);
  } catch {
    // A custom body cannot make the bounded retry path hang.
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
