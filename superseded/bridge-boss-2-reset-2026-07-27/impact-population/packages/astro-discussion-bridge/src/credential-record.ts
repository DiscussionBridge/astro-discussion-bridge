import fs from "node:fs/promises";
import path from "node:path";

export interface DiscourseApiKeySources {
  optionKey?: string;
  optionFile?: string;
  environmentKey?: string;
  environmentFile?: string;
}

export async function readDiscourseApiKeyRecord(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  let content: string;
  try {
    content = await fs.readFile(resolved, "utf8");
  } catch {
    throw new Error("The protected Discourse API key record could not be read.");
  }
  const candidates = content
    .split(/\r?\n/)
    .filter((line) => /^[0-9a-fA-F]{64}$/.test(line));
  if (candidates.length !== 1) {
    throw new Error(
      "The protected Discourse API key record must contain exactly one unformatted 64-character key line.",
    );
  }
  return candidates[0];
}

export async function resolveDiscourseApiKey(
  sources: DiscourseApiKeySources,
): Promise<string | undefined> {
  const optionKey = present(sources.optionKey);
  const optionFile = present(sources.optionFile);
  const environmentKey = present(sources.environmentKey);
  const environmentFile = present(sources.environmentFile);

  if (optionKey && optionFile) {
    throw new Error(
      "Choose only one explicit diagnostics credential source: key or protected record.",
    );
  }
  if (optionKey) {
    return validateDiscourseApiKey(optionKey);
  }
  if (optionFile) {
    return readDiscourseApiKeyRecord(optionFile);
  }

  if (environmentKey && environmentFile) {
    throw new Error(
      "Choose only one diagnostics credential environment source: key or protected record.",
    );
  }
  if (environmentKey) {
    return validateDiscourseApiKey(environmentKey);
  }
  if (environmentFile) {
    return readDiscourseApiKeyRecord(environmentFile);
  }
  return undefined;
}

function present(value: string | undefined): string | undefined {
  return value === "" || value === undefined ? undefined : value;
}

function validateDiscourseApiKey(value: string): string {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("The Discourse API key must be one unformatted 64-character value.");
  }
  return value;
}
