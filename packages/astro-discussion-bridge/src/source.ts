import {
  parseDiscussionTargetBindings,
  type DiscussionTargetBindings,
} from "./targets.js";
import { normalizePublicHttpUrl } from "./web-url.js";

export type DiscussionSourceMode =
  | "astro-managed"
  | "discourse-imported"
  | "discourse-managed";

export interface DiscussionSourceNotice {
  mode: "discourse-imported" | "discourse-managed";
  message: string;
  sourceUrl?: string;
  sourceAuthorUsername?: string;
  sourceAuthorName?: string;
  sourceAuthorProfileUrl?: string;
}

export function resolveDiscussionSourceNotice(input: {
  mode?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  sourceAuthorUsername?: string;
  sourceAuthorName?: string;
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
  const sourceAuthorUsername = safeDiscourseUsername(input.sourceAuthorUsername);
  const sourceAuthorName = input.sourceAuthorName?.trim() || sourceAuthorUsername;
  const sourceAuthorProfileUrl = sourceUrl && sourceAuthorUsername
    ? profileUrlForSource(sourceUrl, sourceAuthorUsername)
    : undefined;
  const message = mode === "discourse-imported"
    ? `This page originated in ${sourceLabel} and was imported here for publication.`
    : `This page is managed in ${sourceLabel} and published here for easier reading.`;

  return {
    mode,
    message,
    sourceUrl,
    ...(sourceAuthorUsername
      ? {
          sourceAuthorUsername,
          sourceAuthorName,
          sourceAuthorProfileUrl,
        }
      : {}),
  };
}

function firstSafeWebUrl(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (!value?.trim()) continue;
    try {
      return normalizePublicHttpUrl(value, "Discussion source URL", {
        allowQuery: true,
        allowFragment: true,
      });
    } catch {
      // Continue to the next source candidate.
    }
  }
  return undefined;
}

function safeDiscourseUsername(value: string | undefined): string | undefined {
  const username = value?.trim();
  return username && /^[a-z0-9_.-]+$/i.test(username) ? username : undefined;
}

function profileUrlForSource(sourceUrl: string, username: string): string | undefined {
  try {
    const url = new URL(sourceUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const topicIndex = segments.indexOf("t");
    const baseSegments = topicIndex >= 0 ? segments.slice(0, topicIndex) : [];
    const profilePath = `/${[...baseSegments, "u", encodeURIComponent(username)].join("/")}`;
    return new URL(profilePath, url.origin).href;
  } catch {
    return undefined;
  }
}
