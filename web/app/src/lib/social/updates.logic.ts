export type UpdateCategory = 'feature' | 'optimization' | 'fix';

export type Update = {
  id: string;
  version: string | null;
  title: string;
  body: string;
  category: UpdateCategory;
  publishedAt: string;
  imageUrl: string | null;
};

export type ReactionRow = {
  updateId: string;
  emoji: string;
  userId: string;
};

export type ReactionTally = {
  emoji: string;
  count: number;
  mine: boolean;
};

export type UpdateComment = {
  id: string;
  updateId: string;
  body: string;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
  mine: boolean;
  parentId: string | null;
  likeCount: number;
  liked: boolean;
  gifUrl: string | null;
  imageUrl: string | null;
  creator: boolean;
};

export type Validation =
  | { ok: true; value: string }
  | { ok: false; error: string };

export const REACTION_EMOJIS = ['🔥', '❤️', '🎉', '👍'] as const;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const COMMENT_MAX = 500;

export function validateUsername(raw: string): Validation {
  const value = raw.trim();
  if (value.length < USERNAME_MIN)
    return { ok: false, error: `at least ${USERNAME_MIN} characters` };
  if (value.length > USERNAME_MAX)
    return { ok: false, error: `at most ${USERNAME_MAX} characters` };
  if (!/^\w+$/u.test(value))
    return { ok: false, error: 'letters, numbers, underscore only' };
  return { ok: true, value };
}

export function suggestUsernameFrom(name: string | null): string {
  if (!name) return '';
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gu, '_')
    .replace(/_+/gu, '_');
  const stripped = base.startsWith('_') ? base.slice(1) : base;
  const trimmed = stripped.endsWith('_') ? stripped.slice(0, -1) : stripped;
  const username = trimmed.slice(0, USERNAME_MAX);
  return username.length >= USERNAME_MIN ? username : '';
}

export function validateComment(
  raw: string,
  hasAttachment = false
): Validation {
  const value = raw.trim();
  if (value.length === 0 && !hasAttachment)
    return { ok: false, error: 'comment is empty' };
  if (value.length > COMMENT_MAX)
    return { ok: false, error: `at most ${COMMENT_MAX} characters` };
  return { ok: true, value };
}

export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function summarizeReactions(tallies: ReactionTally[]): string {
  return tallies
    .filter((t) => t.count > 0)
    .sort((a, bCount) => bCount.count - a.count)
    .map((t) => `${t.emoji} ${t.count}`)
    .join('  ');
}

export function planReactionToggle(
  current: ReactionTally[],
  emoji: string
): { action: 'insert' | 'delete' } {
  const tally = current.find((t) => t.emoji === emoji);
  return { action: tally?.mine ? 'delete' : 'insert' };
}

export function messageOf(category: UpdateCategory): string {
  switch (category) {
    case 'feature':
      return 'New feature';
    case 'optimization':
      return 'Optimization';
    case 'fix':
      return 'Bug fix';
    default:
      return category;
  }
}
