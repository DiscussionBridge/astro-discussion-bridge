export type ActionIconName =
  | "clap"
  | "confetti"
  | "heart"
  | "hugs"
  | "laughing"
  | "quote"
  | "reply"
  | "surprise"
  | "thumbs-up";

export interface RenderedAction {
  icon?: ActionIconName;
  text?: string;
  label: string;
  count: number;
}

const MAX_ACTION_COUNT = 1_000_000_000;
const MAX_REACTION_ITEMS = 100;

const REACTION_ICONS = new Map<string, ActionIconName>([
  ["+1", "thumbs-up"],
  ["clap", "clap"],
  ["confetti_ball", "confetti"],
  ["heart", "heart"],
  ["hugs", "hugs"],
  ["laughing", "laughing"],
  ["open_mouth", "surprise"],
]);

const REACTION_LABELS = new Map<string, string>([
  ["+1", "thumbs up"],
  ["clap", "claps"],
  ["confetti_ball", "celebrations"],
  ["heart", "likes"],
  ["hugs", "hugs"],
  ["laughing", "laughs"],
  ["open_mouth", "surprises"],
]);

const ICON_MARKUP: Record<ActionIconName, string> = {
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>`,
  "thumbs-up": `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3m0 11V10l5-8a3 3 0 0 1 3 3v4h4.2a2 2 0 0 1 2 2.3l-1.4 8a2 2 0 0 1-2 1.7H7Z"/></svg>`,
  reply: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 17-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
  quote: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11H4a6 6 0 0 1 6-6v2a4 4 0 0 0-4 4h2v6H4v-6Zm12 0h-4a6 6 0 0 1 6-6v2a4 4 0 0 0-4 4h2v6h-4v-6Z"/></svg>`,
  clap: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 13 4-9a2 2 0 0 1 3.7 1.5L13 12"/><path d="m11 14 5-8a2 2 0 0 1 3.5 1.9L15 16"/><path d="M5 12.5V5a2 2 0 0 1 4 0v7"/><path d="M5 12.5 3.6 9.8A2 2 0 1 0 .1 11.7L4.5 20A4 4 0 0 0 8 22h6a5 5 0 0 0 5-5v-1"/></svg>`,
  confetti: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 5-14 9 9-14 5Z"/><path d="M14 4h.01"/><path d="M20 9h.01"/><path d="M16 2l1 2"/><path d="M21 5l-2 1"/></svg>`,
  hugs: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11a4 4 0 1 1 8 0"/><path d="M4 21v-2a6 6 0 0 1 12 0v2"/><path d="M16 14c2.2.5 4 2.4 4 5v2"/></svg>`,
  laughing: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 9h.01"/><path d="M16 9h.01"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/></svg>`,
  surprise: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 9h.01"/><path d="M16 9h.01"/><circle cx="12" cy="15" r="2"/></svg>`,
};

export function reactionAction(value: unknown): RenderedAction | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { id, count } = value as { id?: unknown; count?: unknown };
  if (typeof id !== "string" || !/^[A-Za-z0-9+][A-Za-z0-9_+.-]{0,63}$/.test(id)) {
    return undefined;
  }
  if (!validCount(count)) return undefined;

  const icon = REACTION_ICONS.get(id);

  return {
    ...(icon ? { icon } : { text: id }),
    label: REACTION_LABELS.get(id) ?? id,
    count,
  };
}

export function reactionActions(value: unknown): RenderedAction[] {
  if (!Array.isArray(value) || value.length > MAX_REACTION_ITEMS) return [];
  const seen = new Set<string>();
  const actions: RenderedAction[] = [];
  for (const item of value) {
    const id = item && typeof item === "object" ? (item as { id?: unknown }).id : undefined;
    const action = reactionAction(item);
    if (!action || typeof id !== "string" || seen.has(id)) continue;
    seen.add(id);
    actions.push(action);
  }
  return actions;
}

export function fixedAction(icon: ActionIconName, label: string, count: unknown): RenderedAction | undefined {
  if (!validCount(count)) return undefined;
  return { icon, label, count };
}

export function postActions(value: unknown, enabled: boolean): RenderedAction[] {
  if (!enabled || !value || typeof value !== "object") return [];
  const post = value as {
    actions_summary?: unknown;
    like_count?: unknown;
    quote_count?: unknown;
    reactions?: unknown;
    reply_count?: unknown;
  };
  const reactions = reactionActions(post.reactions);
  const likeSummary = Array.isArray(post.actions_summary)
    ? post.actions_summary.find((action) =>
        action && typeof action === "object" && (action as { id?: unknown }).id === 2
      ) as { count?: unknown } | undefined
    : undefined;
  const like = reactions.length
    ? undefined
    : fixedAction("heart", "likes", post.like_count ?? likeSummary?.count);
  const reply = fixedAction("reply", "replies", post.reply_count);
  const quote = fixedAction("quote", "quotes", post.quote_count);
  return [
    ...reactions,
    ...(like ? [like] : []),
    ...(reply ? [reply] : []),
    ...(quote ? [quote] : []),
  ];
}

export function iconMarkup(name: ActionIconName): string {
  return ICON_MARKUP[name];
}

function validCount(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0
    && value <= MAX_ACTION_COUNT;
}
