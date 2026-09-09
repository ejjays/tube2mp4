import { supabase, isSupabaseConfigured } from '../supabase';
import type {
  Update,
  UpdateCategory,
  ReactionRow,
  ReactionTally,
} from './updates.logic';

class NotConfiguredError extends Error {
  name = 'NotConfiguredError';
  constructor() {
    super('Supabase is not configured');
  }
}

function client() {
  if (!supabase) throw new NotConfiguredError();
  return supabase;
}

export async function listUpdates(): Promise<Update[]> {
  const { data, error } = await client()
    .from('updates')
    .select('id, version, title, body, category, published_at, image_url')
    .order('published_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as {
    id: string;
    version: string | null;
    title: string;
    body: string;
    category: string;
    published_at: string;
    image_url: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    title: row.title,
    body: row.body,
    category: row.category as UpdateCategory,
    publishedAt: row.published_at,
    imageUrl: row.image_url,
  }));
}

export async function listReactions(updateId: string): Promise<ReactionRow[]> {
  const { data, error } = await client()
    .from('reactions')
    .select('update_id, emoji, user_id')
    .eq('update_id', updateId);
  if (error) throw error;
  return (
    (data ?? []) as { update_id: string; emoji: string; user_id: string }[]
  ).map((row) => ({
    updateId: row.update_id,
    emoji: row.emoji,
    userId: row.user_id,
  }));
}

export async function listCommentCounts(
  updateIds: string[]
): Promise<Map<string, number>> {
  if (updateIds.length === 0) return new Map();
  const { data, error } = await client()
    .from('comments')
    .select('update_id')
    .in('update_id', updateIds);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const id = (row as { update_id: string }).update_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export async function listReactionTallies(
  updateId: string
): Promise<ReactionTally[]> {
  const { data, error } = await client()
    .from('reactions')
    .select('emoji')
    .eq('update_id', updateId);
  if (error) throw error;
  const tally = new Map<string, number>();
  for (const row of data ?? []) {
    const emoji = (row as { emoji: string }).emoji;
    tally.set(emoji, (tally.get(emoji) ?? 0) + 1);
  }
  return Array.from(tally.entries()).map(([emoji, count]) => ({
    emoji,
    count,
    mine: false,
  }));
}

export { isSupabaseConfigured };
export {
  REACTION_EMOJIS,
  summarizeReactions,
  planReactionToggle,
  validateUsername,
  validateComment,
  suggestUsernameFrom,
  relativeTime,
  messageOf,
} from './updates.logic';
export type {
  Update,
  UpdateCategory,
  UpdateComment,
  ReactionRow,
  ReactionTally,
} from './updates.logic';
