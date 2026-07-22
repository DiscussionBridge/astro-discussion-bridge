import {
  parseDiscussionTargetBindings,
  type DiscussionTargetBindings,
} from "./targets.js";

export type DiscussionSourceMode =
  | "astro-managed"
  | "discourse-imported"
  | "discourse-managed";

export interface DiscussionSourceNotice {
  mode: "discourse-imported" | "discourse-managed";
  message: string;
  sourceUrl?: string;
}

export function resolveDiscussionSourceNotice(input: {
  mode?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  importedFrom?: string;
  sourceTarget?: string;
  legacyTarget?: string;
  bindings?: DiscussionTargetBindings | string;
  legacyTopicUrl?: string;
}): DiscussionSourceNotice | undefined {
  const mode = input.mode?.trim().toLowerCase();
  if (mode !== "discourse-imported" && mode !== "discourse-managed") {
    return undefined;
  }

  const sourceTarget = input.sourceTarget?.trim() || input.legacyTarget?.trim();
  const bindings = parseDiscussionTargetBindings(input.bindings);
  const sourceUrl = firstSafeWebUrl(
    input.sourceUrl,
    input.importedFrom,
    sourceTarget ? bindings[sourceTarget]?.topicUrl : undefined,
    input.legacyTopicUrl,
  );
  const sourceLabel = input.sourceLabel?.trim() || "Discourse";
  const message = mode === "discourse-imported"
    ? `This page originated in ${sourceLabel} and was imported here for publication.`
    : `This page is managed in ${sourceLabel} and published here for easier reading.`;

  return { mode, message, sourceUrl };
}

function firstSafeWebUrl(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (!value?.trim()) continue;
    try {
      const url = new URL(value.trim());
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.href;
      }
    } catch {
      // Continue to the next source candidate.
    }
  }
  return undefined;
}
