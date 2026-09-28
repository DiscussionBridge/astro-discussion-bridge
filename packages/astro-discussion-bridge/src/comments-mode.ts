export type PublicCommentsMode = "simple" | "full" | "interactive";
export type CommentsModeInput = PublicCommentsMode;

export function normalizeCommentsMode(value: unknown): PublicCommentsMode | undefined {
  if (value === "simple" || value === "full" || value === "interactive") return value;
  return undefined;
}

export function isInteractiveCommentsMode(value: unknown): boolean {
  return normalizeCommentsMode(value) === "interactive";
}
