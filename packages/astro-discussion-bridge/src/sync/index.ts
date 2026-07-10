import { promises as fs } from "node:fs";
import path from "node:path";
import { createDiscourseClient } from "../discourse/client.js";

export interface SyncDiscourseTopicsOptions {
  docsDir: string;
  siteUrl: string;
  discourseUrl: string;
  apiKey: string;
  apiUsername: string;
  categoryId?: number;
  tags?: string[];
  dryRun?: boolean;
}

export interface SyncedPage {
  filePath: string;
  title: string;
  pageUrl: string;
  topicId?: number;
  topicUrl?: string;
  status: "created" | "skipped" | "dry-run";
}

interface ParsedMarkdown {
  frontmatter: Record<string, string>;
  body: string;
  rawFrontmatter: string;
}

const markdownExtensions = new Set([".md", ".mdx"]);

export async function syncDiscourseTopics(
  options: SyncDiscourseTopicsOptions,
): Promise<SyncedPage[]> {
  const docsDir = path.resolve(options.docsDir);
  const files = await findMarkdownFiles(docsDir);
  const discourse = createDiscourseClient({
    discourseUrl: options.discourseUrl,
    apiKey: options.apiKey,
    apiUsername: options.apiUsername,
  });
  const results: SyncedPage[] = [];

  for (const filePath of files) {
    const source = await fs.readFile(filePath, "utf8");
    const parsed = parseMarkdown(source);
    const title = parsed.frontmatter.title || findFirstHeading(parsed.body) || titleFromFile(filePath);
    const pageUrl = pageUrlForFile({ docsDir, filePath, siteUrl: options.siteUrl });
    const existingTopicId = parsed.frontmatter.discourseTopicId;

    if (existingTopicId) {
      results.push({
        filePath,
        title,
        pageUrl,
        topicId: Number(existingTopicId),
        topicUrl: parsed.frontmatter.discourseTopicUrl,
        status: "skipped",
      });
      continue;
    }

    if (options.dryRun) {
      results.push({ filePath, title, pageUrl, status: "dry-run" });
      continue;
    }

    const topic = await discourse.createTopic({
      title,
      raw: companionTopicBody({ title, pageUrl }),
      category: options.categoryId,
      tags: options.tags,
      embedUrl: pageUrl,
    });
    const topicUrl = `${discourse.discourseUrl}/t/${topic.topic_slug}/${topic.topic_id}`;

    await fs.writeFile(
      filePath,
      updateFrontmatter(source, {
        discourseTopicId: String(topic.topic_id),
        discourseTopicUrl: topicUrl,
      }),
    );

    results.push({
      filePath,
      title,
      pageUrl,
      topicId: topic.topic_id,
      topicUrl,
      status: "created",
    });
  }

  return results;
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return findMarkdownFiles(fullPath);
      if (entry.isFile() && markdownExtensions.has(path.extname(entry.name))) return [fullPath];
      return [];
    }),
  );

  return files.flat().sort();
}

function parseMarkdown(source: string): ParsedMarkdown {
  if (!source.startsWith("---\n")) {
    return { frontmatter: {}, body: source, rawFrontmatter: "" };
  }

  const end = source.indexOf("\n---", 4);
  if (end === -1) {
    return { frontmatter: {}, body: source, rawFrontmatter: "" };
  }

  const rawFrontmatter = source.slice(4, end);
  return {
    frontmatter: parseSimpleYaml(rawFrontmatter),
    body: source.slice(end + 4).replace(/^\r?\n/, ""),
    rawFrontmatter,
  };
}

function parseSimpleYaml(source: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of source.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;

    values[match[1]] = unquoteYamlValue(match[2].trim());
  }

  return values;
}

function updateFrontmatter(source: string, values: Record<string, string>): string {
  if (!source.startsWith("---\n")) {
    const frontmatter = serializeYaml(values);
    return `---\n${frontmatter}---\n\n${source}`;
  }

  const end = source.indexOf("\n---", 4);
  if (end === -1) {
    const frontmatter = serializeYaml(values);
    return `---\n${frontmatter}---\n\n${source}`;
  }

  const rawFrontmatter = source.slice(4, end);
  const rest = source.slice(end);
  const nextFrontmatter = upsertYamlValues(rawFrontmatter, values);

  return `---\n${nextFrontmatter}${rest}`;
}

function upsertYamlValues(source: string, values: Record<string, string>): string {
  const lines = source.split(/\r?\n/);
  const remaining = new Map(Object.entries(values));
  const nextLines = lines.map((line) => {
    const match = /^([A-Za-z0-9_-]+):/.exec(line);
    if (!match || !remaining.has(match[1])) return line;

    const value = remaining.get(match[1]);
    remaining.delete(match[1]);
    return `${match[1]}: ${quoteYamlValue(value ?? "")}`;
  });

  for (const [key, value] of remaining) {
    nextLines.push(`${key}: ${quoteYamlValue(value)}`);
  }

  return `${nextLines.join("\n").replace(/\n*$/, "")}\n`;
}

function serializeYaml(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}: ${quoteYamlValue(value)}`)
    .join("\n") + "\n";
}

function quoteYamlValue(value: string): string {
  if (/^[0-9]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function unquoteYamlValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function findFirstHeading(body: string): string | undefined {
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function titleFromFile(filePath: string): string {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pageUrlForFile(input: { docsDir: string; filePath: string; siteUrl: string }): string {
  const relative = path.relative(input.docsDir, input.filePath).replace(/\\/g, "/");
  const withoutExtension = relative.replace(/\.(md|mdx)$/i, "");
  const slug = withoutExtension.endsWith("/index")
    ? withoutExtension.slice(0, -"/index".length)
    : withoutExtension;
  const pathname = slug ? `${slug}/` : "";

  return `${input.siteUrl.replace(/\/+$/, "")}/${pathname}`;
}

function companionTopicBody(input: { title: string; pageUrl: string }): string {
  return `This is a companion discussion topic for the original entry at ${input.pageUrl}\n\nUse this thread for comments, corrections, and follow-up questions about ${input.title}.`;
}

