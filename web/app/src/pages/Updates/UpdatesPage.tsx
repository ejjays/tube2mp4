import { useState, useEffect } from 'react';
import {
  Inbox,
  CloudOff,
  AlertCircle,
  MessageCircle,
  Bell,
} from 'lucide-react';
import SEO from '../../components/utils/SEO';
import {
  isSupabaseConfigured,
  listUpdates,
  listReactionTallies,
  listCommentCounts,
  relativeTime,
  type Update,
  type UpdateCategory,
  type ReactionTally,
} from '../../lib/social/updates';

type FilterKey = 'all' | UpdateCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'feature', label: 'Features' },
  { key: 'optimization', label: 'Boosts' },
  { key: 'fix', label: 'Fixes' },
];

const CYAN = '#22d3ee';

const CATEGORY_STYLES: Record<
  string,
  { bg: string; border: string; label: string }
> = {
  feature: {
    bg: 'rgba(34,211,238,0.15)',
    border: 'border-cyan-400/30',
    label: 'New feature',
  },
  optimization: {
    bg: 'rgba(34,197,94,0.15)',
    border: 'border-green-400/30',
    label: 'Optimization',
  },
  fix: {
    bg: 'rgba(245,158,11,0.15)',
    border: 'border-amber-400/30',
    label: 'Fix',
  },
};

function Notice({
  Icon,
  title,
  body,
}: {
  Icon: typeof Inbox;
  title: string;
  body: string;
}) {
  return (
    <div className="mt-16 flex flex-col items-center px-8">
      <div className="h-16 w-16 flex items-center justify-center rounded-3xl border border-white/10 bg-white/5">
        <Icon size={26} color="#475569" strokeWidth={1.8} />
      </div>
      <p className="mt-4 font-semibold text-base text-slate-200">{title}</p>
      <p className="mt-1.5 text-center text-sm leading-5 text-slate-500">
        {body}
      </p>
    </div>
  );
}

function SkeletonPulse({
  className,
  style,
}: {
  className?: string;
  style?: Record<string, string>;
}) {
  return (
    <div
      className={`bg-white/10 ${className ?? ''}`}
      style={{
        animation: 'skelPulse 1200ms ease-in-out infinite alternate',
        ...style,
      }}
    />
  );
}

function UpdatesSkeleton() {
  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      {[1, 2, 3].map((cardId) => (
        <div key={cardId} className="mb-9">
          <SkeletonPulse
            className="w-full mb-4 rounded-3xl"
            style={{ aspectRatio: '4/3' }}
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <SkeletonPulse className="h-5 w-16 rounded-full" />
              <div className="ml-2">
                <SkeletonPulse className="w-8 h-2 rounded-full" />
              </div>
            </div>
            <SkeletonPulse className="w-14 h-2 rounded-full" />
          </div>

          <div className="mt-1.5">
            <SkeletonPulse className="w-4/5 h-6 rounded-full" />
          </div>

          <div className="mt-2">
            <SkeletonPulse className="w-full h-3 rounded-full" />
          </div>
          <div className="mt-1.5">
            <SkeletonPulse className="w-full h-3 rounded-full" />
          </div>
          <div className="mt-1.5">
            <SkeletonPulse className="w-4/5 h-3 rounded-full" />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-2 items-center">
              <SkeletonPulse className="h-6 w-10 rounded-full" />
              <SkeletonPulse className="h-6 w-12 rounded-full" />
              <SkeletonPulse className="h-6 w-11 rounded-full" />
            </div>
            <SkeletonPulse className="w-10 h-5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryChips({
  active,
  onSelect,
}: {
  active: FilterKey;
  onSelect: (key: FilterKey) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
      {FILTERS.map((f) => {
        const on = f.key === active;
        return (
          <button
            key={f.key}
            onClick={() => onSelect(f.key)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              on
                ? 'border-white/25 bg-white/10 text-white'
                : 'border-white/10 text-slate-400 hover:text-white/80'
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

function CommentButton({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  return (
    <button onClick={onPress} className="flex items-center gap-1.5 px-1 py-1">
      <MessageCircle size={22} color="#94a3b8" />
      <span className="font-semibold text-xs text-slate-400 tabular-nums">
        {count}
      </span>
    </button>
  );
}

function ReactionBar({
  tallies,
  onReact,
}: {
  tallies: ReactionTally[];
  onReact: (emoji: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {tallies.map((tally) => (
        <button
          key={tally.emoji}
          onClick={() => onReact(tally.emoji)}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors"
          style={{
            backgroundColor: tally.mine
              ? 'rgba(34,211,238,0.16)'
              : 'rgba(20,30,55,0.7)',
          }}
        >
          <span className="text-base leading-none">{tally.emoji}</span>
          <span
            className="font-semibold text-xs tabular-nums"
            style={{ color: tally.mine ? CYAN : '#94a3b8' }}
          >
            {tally.count}
          </span>
        </button>
      ))}
    </div>
  );
}

function PostCard({
  update,
  tallies,
  commentCount,
  onReact,
  onOpenComments,
  onOpen,
}: {
  update: Update;
  tallies: ReactionTally[];
  commentCount: number;
  onReact: (emoji: string) => void;
  onOpenComments: () => void;
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const catStyle = CATEGORY_STYLES[update.category] ?? CATEGORY_STYLES.feature;
  const isLong = update.body.length > 280;

  const contentHeader = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ backgroundColor: catStyle.bg, color: CYAN }}
        >
          {catStyle.label}
        </span>
        {update.version ? (
          <span className="text-xs text-white/30">v{update.version}</span>
        ) : null}
      </div>
      <span className="text-xs text-slate-500">
        {relativeTime(update.publishedAt)}
      </span>
    </div>
  );

  const contentBody = (
    <>
      <h3 className="mt-1.5 font-bold text-xl leading-7 text-white">
        {update.title}
      </h3>
      <div className="mt-2 text-sm leading-relaxed text-white/60">
        {isLong && !expanded ? (
          <>
            {update.body.slice(0, 280)}
            <span className="text-white/30">... </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              className="text-cyan-400 hover:text-cyan-300 text-xs"
            >
              See more
            </button>
          </>
        ) : (
          update.body
        )}
        {expanded && isLong && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(false);
            }}
            className="text-cyan-400 hover:text-cyan-300 block mt-1 text-xs"
          >
            show less
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="mb-9">
      {update.imageUrl ? (
        <button onClick={onOpen} className="w-full text-left">
          <img
            src={update.imageUrl}
            alt=""
            className="w-full rounded-3xl object-cover"
            style={{ aspectRatio: '4/3' }}
            loading="lazy"
          />
        </button>
      ) : null}

      <div style={update.imageUrl ? { marginTop: 16 } : undefined}>
        <button onClick={onOpen} className="w-full text-left">
          {contentHeader}
          {contentBody}
        </button>

        <div className="mt-4 flex items-center gap-2.5">
          <ReactionBar tallies={tallies} onReact={onReact} />
          <CommentButton count={commentCount} onPress={onOpenComments} />
        </div>
      </div>
    </div>
  );
}

export default function UpdatesPage() {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [talliesMap, setTalliesMap] = useState<Map<string, ReactionTally[]>>(
    new Map()
  );
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<FilterKey>('all');

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(null);
      setLoading(false);
      return () => {};
    }
    let cancelled = false;
    async function load() {
      try {
        const updates = await listUpdates();
        if (cancelled) return;
        setUpdates(updates);
        const ids = updates.map((upd) => upd.id);
        const [talliesResults, counts] = await Promise.all([
          Promise.all(ids.map((id) => listReactionTallies(id))),
          listCommentCounts(ids),
        ]);
        if (cancelled) return;
        const tm = new Map<string, ReactionTally[]>();
        ids.forEach((id, i) => tm.set(id, talliesResults[i]));
        setTalliesMap(tm);
        setCommentCounts(counts);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load updates');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function renderBody() {
    if (!isSupabaseConfigured) {
      return (
        <Notice
          Icon={CloudOff}
          title="Updates offline"
          body="Add your Supabase URL and key to enable updates, reactions and comments."
        />
      );
    }
    if (loading) return <UpdatesSkeleton />;
    if (error && updates.length === 0) {
      return (
        <Notice Icon={AlertCircle} title="Couldn't load updates" body={error} />
      );
    }
    if (updates.length === 0) {
      return (
        <Notice
          Icon={Inbox}
          title="No updates yet"
          body="New features, boosts and fixes will show up here."
        />
      );
    }
    const shown =
      cat === 'all' ? updates : updates.filter((item) => item.category === cat);
    if (shown.length === 0) {
      return (
        <Notice
          Icon={Inbox}
          title="Nothing here yet"
          body="No updates in this category."
        />
      );
    }
    return shown.map((update) => (
      <PostCard
        key={update.id}
        update={update}
        tallies={talliesMap.get(update.id) ?? []}
        commentCount={commentCounts.get(update.id) ?? 0}
        onReact={() => {}}
        onOpenComments={() => {}}
        onOpen={() => {}}
      />
    ));
  }

  const heading = (
    <div className="mb-4 ml-1 mr-1 flex items-center justify-between">
      <h1 className="font-bold text-[30px] tracking-tight text-white">
        Updates
      </h1>
      {isSupabaseConfigured ? (
        <button className="relative p-1">
          <Bell size={24} color="#cbd5e1" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      <SEO
        title="Updates"
        description="Latest features, optimizations, and fixes for Phantom"
      />
      <div
        className="w-full min-h-screen"
        style={{ backgroundColor: '#030014' }}
      >
        <div
          className="mx-auto px-4 pb-36 pt-[calc(env(safe-area-inset-top)+14px)]"
          style={{ maxWidth: 768 }}
        >
          {heading}

          {isSupabaseConfigured && updates.length > 0 ? (
            <div className="mb-6 -mx-4">
              <CategoryChips active={cat} onSelect={setCat} />
            </div>
          ) : null}

          {renderBody()}
        </div>
      </div>
    </>
  );
}
