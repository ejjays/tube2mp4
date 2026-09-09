import { memo, useEffect, useRef, useState, type ComponentType } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import { Inbox, CloudOff, AlertCircle, Bell, Ghost } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import tw from '../lib/tw';
import { tapSelection, tapSuccess } from '../lib/haptics';
import { compareVersions } from '../lib/updater/manifest';
import BottomSheet from '../components/sheets/BottomSheet';
import UpdateDetailSheet from '../components/sheets/UpdateDetailSheet';
import PostDetailPanel from '../components/social/PostDetailPanel';
import PostMarkdown from '../components/PostMarkdown';
import NotificationsPanel from '../components/social/NotificationsPanel';
import Avatar from '../components/Avatar';
import { CommentIcon, GoogleIcon } from '../components/icons';
import AnimatedCount from '../components/social/AnimatedCount';
import ReactionBar, {
  ReactionPlayContext,
} from '../components/social/ReactionBar';
import {
  isSupabaseConfigured,
  listUpdates,
  listReactions,
  listCommentCounts,
  getExistingUserId,
  fetchUsername,
  fetchProfile,
  setUsername,
  signInAsGuest,
  getAccount,
  getMyAvatarUrl,
  syncProfileAvatar,
  subscribeToFeed,
  toggleReaction,
  summarizeReactions,
  planReactionToggle,
  validateUsername,
  suggestUsernameFrom,
  relativeTime,
  messageOf,
  onAuthChange,
  type Update,
  type UpdateCategory,
  type ReactionRow,
  type ReactionTally,
} from '../lib/social/updates';
import { signInWithGoogle } from '../lib/social/googleAuth';
import finnAvatar from '../../assets/avatars/finn.webp';
import { useSubScreen } from '../hooks/useSubScreen';
import { type SocialDeepLink } from '../lib/social/notificationTap.logic';
import {
  unreadCount,
  subscribeToNotifications,
  badgeLabel,
  type InboxItem,
} from '../lib/social/notifications';
import { getFeedCache, writeFeedCache } from '../lib/social/feedCache';

type IconType = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

const AUTHOR_NAME = 'Phantom';
const RING_COLORS = ['#67e8f9', '#06b6d4', '#0d9488'] as const;
const PROFILE_PIC = finnAvatar;

const CYAN = '#22d3ee';
const CATEGORY_META: Record<UpdateCategory, { label: string }> = {
  feature: { label: 'New feature' },
  optimization: { label: 'Optimization' },
  fix: { label: 'Fix' },
};

type FilterKey = 'all' | UpdateCategory;
const FILTERS: readonly { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'feature', label: 'Features' },
  { key: 'optimization', label: 'Boosts' },
  { key: 'fix', label: 'Fixes' },
];

function CategoryChips({
  active,
  onSelect,
}: {
  active: FilterKey;
  onSelect: (key: FilterKey) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[tw`px-4`, { gap: 8 }]}
    >
      {FILTERS.map((f) => {
        const on = f.key === active;
        return (
          <Pressable
            key={f.key}
            onPress={() => onSelect(f.key)}
            style={[
              tw`rounded-full border px-4 py-2`,
              on ? tw`border-white/25 bg-white/10` : tw`border-white/10`,
            ]}
          >
            <Text
              style={[
                tw`font-sans-medium text-[14px]`,
                on ? tw`text-white` : tw`text-slate-400`,
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function CommentButton({
  onPress,
  count,
}: {
  onPress: () => void;
  count: number;
}) {
  return (
    <Pressable onPress={onPress} style={tw`flex-row items-center px-1 py-1`}>
      <CommentIcon size={22} color="#94a3b8" />
      <AnimatedCount
        value={count}
        style={tw`ml-1.5 font-sans-semibold text-[12px] text-slate-400`}
      />
    </Pressable>
  );
}

const PREVIEW_CHARS = 260;

// native markdown can't be line-measured; clamp the source at the last block
// boundary inside the budget so the preview never cuts mid-table or mid-list
function clampForPreview(text: string): { head: string; clamped: boolean } {
  const clean = text.trimEnd();
  if (clean.length <= PREVIEW_CHARS) return { head: clean, clamped: false };
  const budget = clean.slice(0, PREVIEW_CHARS);
  const boundary = Math.max(
    budget.lastIndexOf('\n\n'),
    budget.lastIndexOf('\n'),
    budget.lastIndexOf(' ')
  );
  let head =
    boundary > PREVIEW_CHARS * 0.5
      ? clean.slice(0, boundary).trimEnd()
      : budget;
  // a cut inside a table leaves bare pipe rows md4c renders as literal text;
  // back off to before the table start instead of showing broken markup
  const rowStart = head.indexOf('\n|');
  if (rowStart >= 0) head = clean.slice(0, rowStart).trimEnd();
  else if (head.startsWith('|')) head = '';
  return { head, clamped: true };
}

function PostCard({
  update,
  isWide,
  tallies,
  commentCount,
  onReact,
  onOpenComments,
  onOpen,
}: {
  update: Update;
  isWide: boolean;
  tallies: ReactionTally[];
  commentCount: number;
  onReact: (emoji: string) => void;
  onOpenComments: () => void;
  onOpen: () => void;
}) {
  const meta = CATEGORY_META[update.category];
  const installed = Constants.expoConfig?.version ?? '0.0.0';
  const { head, clamped } = clampForPreview(update.body);
  return (
    <View style={tw`mb-9`}>
      {update.imageUrl ? (
        <Pressable onPress={onOpen}>
          <Image
            source={{ uri: update.imageUrl }}
            style={[tw`w-full rounded-3xl`, { aspectRatio: 4 / 3 }]}
            contentFit="cover"
            transition={200}
          />
        </Pressable>
      ) : null}

      <Pressable
        onPress={onOpen}
        style={update.imageUrl ? tw`mt-4` : undefined}
      >
        <View style={tw`flex-row items-center justify-between`}>
          <View style={tw`flex-row items-center`}>
            <View
              style={[
                tw`rounded-full px-2.5 py-1`,
                { backgroundColor: 'rgba(34,211,238,0.15)' },
              ]}
            >
              <Text
                style={[tw`font-sans-semibold text-[12px]`, { color: CYAN }]}
              >
                {meta.label}
              </Text>
            </View>
            {update.version ? (
              <Text
                style={[
                  tw`ml-2 font-sans text-[12px]`,
                  compareVersions(installed, update.version) < 0
                    ? tw`font-sans-semibold`
                    : null,
                  {
                    color:
                      compareVersions(installed, update.version) < 0
                        ? CYAN
                        : 'rgba(255,255,255,0.3)',
                  },
                ]}
              >
                v{update.version}
              </Text>
            ) : null}
          </View>
          <Text style={tw`font-sans text-[12.5px] text-slate-500`}>
            {relativeTime(update.publishedAt)}
          </Text>
        </View>
        <Text
          style={tw`mt-1.5 font-sans-bold text-[21px] leading-7 text-white`}
        >
          {update.title}
        </Text>
        <PostMarkdown text={head} style={tw`mt-2.5`} />
        {clamped ? (
          <Text
            onPress={onOpen}
            style={[tw`mt-1 font-sans-medium text-[14px]`, { color: CYAN }]}
          >
            See more
          </Text>
        ) : null}
      </Pressable>

      <View
        style={[
          tw`mt-4 flex-row items-center`,
          isWide ? { gap: 10 } : tw`justify-between`,
        ]}
      >
        <ReactionBar tallies={tallies} onReact={onReact} />
        <CommentButton onPress={onOpenComments} count={commentCount} />
      </View>
    </View>
  );
}

function UsernameSheet({
  open,
  suggestion,
  onClose,
  onSaved,
}: {
  open: boolean;
  suggestion: string;
  onClose: () => void;
  onSaved: (username: string, userId: string) => void;
}) {
  const [value, setValue] = useState(suggestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- sheet-open reset, keeps typing
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect, react-you-might-not-need-an-effect/no-derived-state -- reset username form on sheet open
      setValue(suggestion);
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- clears form error on sheet open
      setError(null);
    }
  }, [open, suggestion]);

  const save = async () => {
    const check = validateUsername(value);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const userId = await setUsername(check.value);
      tapSuccess();
      onSaved(check.value, userId);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={tw`items-center`}>
        <Avatar name={value.trim().length > 0 ? value : 'G'} size={76} />
        <Text
          style={tw`mt-4 font-sans-bold text-[22px] tracking-tight text-white`}
        >
          Pick a username
        </Text>
        <Text
          style={tw`mt-1.5 text-center font-sans text-[13px] leading-5 text-slate-400`}
        >
          This is how you show up on reactions and comments.
        </Text>
      </View>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="username"
        placeholderTextColor="#5b6472"
        autoCapitalize="none"
        autoCorrect={false}
        textAlign="center"
        style={tw`mt-5 rounded-2xl border border-white/15 bg-black/30 px-4 py-3 font-sans text-[16px] text-white`}
      />
      {error ? (
        <Text style={tw`mt-2 text-center font-sans text-[12px] text-red-400`}>
          {error}
        </Text>
      ) : null}
      <Pressable
        onPress={() => void save()}
        disabled={busy}
        style={[
          tw`mt-4 items-center rounded-2xl py-3.5`,
          busy ? tw`bg-slate-700` : tw`bg-primary`,
        ]}
      >
        <Text
          style={[tw`font-sans-semibold text-[15px]`, { color: '#04101f' }]}
        >
          Save
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

function SkeletonLine({ twClass = 'h-3 rounded-full' }: { twClass?: string }) {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.8, { duration: 1200 }), -1, true);
  }, [pulse]);

  const animated = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return <Animated.View style={[tw`bg-white/10 ${twClass}`, animated]} />;
}

function SkeletonImage() {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.8, { duration: 1200 }), -1, true);
  }, [pulse]);

  const animated = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <Animated.View
      style={[
        tw`w-full mb-4 rounded-3xl bg-white/10`,
        { aspectRatio: 4 / 3 },
        animated,
      ]}
    />
  );
}

function SkeletonBadge() {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.8, { duration: 1200 }), -1, true);
  }, [pulse]);

  const animated = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <Animated.View
      style={[
        tw`rounded-full`,
        { width: 68, height: 22, backgroundColor: 'rgba(34, 211, 238, 0.15)' },
        animated,
      ]}
    />
  );
}

function UpdatesSkeleton() {
  return (
    <View>
      {[1, 2, 3].map((cardId) => (
        <View key={`card-${cardId}`} style={tw`mb-9`}>
          <SkeletonImage />

          <View style={tw`flex-row items-center justify-between`}>
            <View style={tw`flex-row items-center`}>
              <SkeletonBadge />
              <View style={tw`ml-2`}>
                <SkeletonLine twClass="w-8 h-2" />
              </View>
            </View>
            <SkeletonLine twClass="w-14 h-2" />
          </View>

          <View style={tw`mt-1.5`}>
            <SkeletonLine twClass="w-4/5 h-6 rounded-full" />
          </View>

          <View style={tw`mt-2`}>
            <SkeletonLine twClass="w-full h-3 rounded-full" />
          </View>
          <View style={tw`mt-1.5`}>
            <SkeletonLine twClass="w-full h-3 rounded-full" />
          </View>
          <View style={tw`mt-1.5`}>
            <SkeletonLine twClass="w-4/5 h-3 rounded-full" />
          </View>

          <View style={tw`mt-4 flex-row items-center justify-between`}>
            <View style={tw`flex-row gap-2 items-center`}>
              {[1, 2, 3].map((i) => (
                <SkeletonLine
                  key={`reaction-${cardId}-${i}`}
                  twClass={`h-6 rounded-full ${i === 1 ? 'w-10' : i === 2 ? 'w-12' : 'w-11'}`}
                />
              ))}
            </View>
            <SkeletonLine twClass="w-10 h-5 rounded-full" />
          </View>
        </View>
      ))}
    </View>
  );
}

function Notice({
  Icon,
  title,
  body,
}: {
  Icon: IconType;
  title: string;
  body: string;
}) {
  return (
    <View style={tw`mt-16 items-center px-8`}>
      <View
        style={tw`h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/5`}
      >
        <Icon size={26} color="#475569" strokeWidth={1.8} />
      </View>
      <Text style={tw`mt-4 font-sans-semibold text-[16px] text-slate-200`}>
        {title}
      </Text>
      <Text
        style={tw`mt-1.5 text-center font-sans text-[13px] leading-5 text-slate-500`}
      >
        {body}
      </Text>
    </View>
  );
}

export type FeedData = {
  updates: Update[];
  reactions: ReactionRow[];
  commentCounts: Record<string, number>;
  userId: string | null;
  username: string | null;
  myAvatar: string | null;
};

function UpdatesScreen({
  visible,
  onFullScreen,
  deepLink,
  onDeepLinkHandled,
}: {
  visible: boolean;
  onFullScreen?: (open: boolean) => void;
  deepLink?: SocialDeepLink | null;
  onDeepLinkHandled?: () => void;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 160 });
  }, [visible, progress]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const contentMax =
    screenW >= 768 ? Math.min(Math.round(screenW * 0.68), 1200) : undefined;

  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [detailUpdate, setDetailUpdate] = useState<Update | null>(null);
  const [postUpdate, setPostUpdate] = useState<Update | null>(null);
  const [focusComment, setFocusComment] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const inbox = useSubScreen(visible);
  const [usernameOpen, setUsernameOpen] = useState(false);
  const [nameSuggestion, setNameSuggestion] = useState('');
  const [cat, setCat] = useState<FilterKey>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const pendingReact = useRef<{ update: Update; emoji: string } | null>(null);
  const usernameResolver = useRef<((ok: boolean) => void) | null>(null);
  const localReactAt = useRef(0);
  const [reactionTick, setReactionTick] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-you-might-not-need-an-effect/no-event-handler, react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- bump reaction animation tick on tab show
    if (visible) setReactionTick((t) => t + 1);
  }, [visible]);

  const feedQuery = useQuery({
    queryKey: ['updatesFeed'],
    enabled: isSupabaseConfigured && visible,
    staleTime: 1000 * 60 * 5,
    initialData: () => getFeedCache() ?? undefined,
    initialDataUpdatedAt: 0,
    queryFn: async (): Promise<FeedData> => {
      const list = await listUpdates();
      const ids = list.map((item) => item.id);
      const [reactions, commentCounts, existingId] = await Promise.all([
        listReactions(ids),
        listCommentCounts(ids),
        getExistingUserId(),
      ]);
      const [profile, googleAvatar] = await Promise.all([
        existingId ? fetchProfile(existingId) : Promise.resolve(null),
        getMyAvatarUrl(),
      ]);
      void syncProfileAvatar();
      const data: FeedData = {
        updates: list,
        reactions,
        commentCounts,
        userId: existingId,
        username: profile?.username ?? null,
        myAvatar: profile?.avatarUrl ?? googleAvatar,
      };
      void writeFeedCache(data);
      return data;
    },
  });

  const updates = feedQuery.data?.updates ?? [];
  const reactionRows = feedQuery.data?.reactions ?? [];
  const commentCounts = feedQuery.data?.commentCounts ?? {};
  const userId = feedQuery.data?.userId ?? null;
  const myName = feedQuery.data?.username ?? null;
  const myAvatar = feedQuery.data?.myAvatar ?? null;

  useEffect(() => {
    if (!isSupabaseConfigured || !visible) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      const sinceLocal = Date.now() - localReactAt.current;
      const delay = sinceLocal < 1500 ? 1800 : 300;
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['updatesFeed'] });
      }, delay);
    };
    const unsubscribe = subscribeToFeed(refresh);
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [visible, queryClient]);

  useEffect(() => {
    if (!isSupabaseConfigured || !visible || !userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect, react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- reset unread when feed hidden
      setUnread(0);
      return undefined;
    }
    let alive = true;
    const refresh = () => {
      unreadCount()
        .then((count) => {
          if (alive) setUnread(count);
        })
        .catch(() => undefined);
    };
    refresh();
    const unsubscribe = subscribeToNotifications(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [visible, userId]);

  // auth state listener: invalidate feed when sign-in/out happens elsewhere (e.g. Settings)
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    const unsub = onAuthChange(() => {
      void queryClient.invalidateQueries({ queryKey: ['updatesFeed'] });
    });
    return unsub;
  }, [queryClient]);

  const ensureIdentity = async (
    mode: 'google' | 'guest' | 'auto' = 'auto'
  ): Promise<boolean> => {
    if (mode === 'auto') {
      return !!queryClient.getQueryData<FeedData>(['updatesFeed'])?.userId;
    }
    setError(null);
    if (mode === 'guest') {
      try {
        await signInAsGuest();
        void queryClient.invalidateQueries({ queryKey: ['updatesFeed'] });
        return true;
      } catch (err) {
        setError(messageOf(err));
        return false;
      }
    }
    try {
      const uid = await signInWithGoogle();
      if (!uid) return false;
      // sync profile avatar before invalidating, else the composer keeps the
      // generic fallback until the next unrelated refetch
      await syncProfileAvatar();
      const existing = await fetchUsername(uid);
      if (existing) {
        queryClient.setQueryData<FeedData>(['updatesFeed'], (old) =>
          old ? { ...old, userId: uid, username: existing } : old
        );
        void queryClient.invalidateQueries({ queryKey: ['updatesFeed'] });
        return true;
      }
      const acc = await getAccount();
      setNameSuggestion(suggestUsernameFrom(acc?.name ?? null));
      setUsernameOpen(true);
      return await new Promise<boolean>((resolve) => {
        usernameResolver.current = resolve;
      });
    } catch (err) {
      setError(messageOf(err));
      return false;
    }
  };

  const onUsernameSaved = (username: string, savedId: string) => {
    queryClient.setQueryData<FeedData>(['updatesFeed'], (old) =>
      old ? { ...old, userId: savedId, username } : old
    );
    void queryClient.invalidateQueries({ queryKey: ['updatesFeed'] });
    setUsernameOpen(false);
    usernameResolver.current?.(true);
    usernameResolver.current = null;
  };

  const onUsernameClose = () => {
    setUsernameOpen(false);
    usernameResolver.current?.(false);
    usernameResolver.current = null;
  };

  const doReact = (updateId: string, emoji: string, uid: string) => {
    tapSelection();
    localReactAt.current = Date.now();
    const previous = reactionRows;
    const action = planReactionToggle(previous, updateId, emoji, uid);
    const next =
      action === 'insert'
        ? [...previous, { updateId, emoji, userId: uid }]
        : previous.filter(
            (row) =>
              !(
                row.updateId === updateId &&
                row.emoji === emoji &&
                row.userId === uid
              )
          );
    queryClient.setQueryData<FeedData>(['updatesFeed'], (old) =>
      old ? { ...old, reactions: next } : old
    );
    toggleReaction(updateId, emoji, previous).catch((err) => {
      queryClient.setQueryData<FeedData>(['updatesFeed'], (old) =>
        old ? { ...old, reactions: previous } : old
      );
      setError(messageOf(err));
    });
  };

  const commitReact = (update: Update, emoji: string) => {
    const uid =
      queryClient.getQueryData<FeedData>(['updatesFeed'])?.userId ?? null;
    if (uid) doReact(update.id, emoji, uid);
  };

  const onReact = async (update: Update, emoji: string) => {
    if (!(await ensureIdentity())) {
      pendingReact.current = { update, emoji };
      setSignInOpen(true);
      return;
    }
    commitReact(update, emoji);
  };

  const chooseGuest = async () => {
    if (!(await ensureIdentity('guest'))) return;
    setSignInOpen(false);
    await feedQuery.refetch().catch(() => undefined);
    const pending = pendingReact.current;
    pendingReact.current = null;
    if (pending) commitReact(pending.update, pending.emoji);
  };

  const chooseGoogle = async () => {
    if (!(await ensureIdentity('google'))) return;
    setSignInOpen(false);
    await feedQuery.refetch().catch(() => undefined);
    const pending = pendingReact.current;
    pendingReact.current = null;
    if (pending) commitReact(pending.update, pending.emoji);
  };

  const openDetail = (update: Update) => {
    tapSelection();
    setDetailUpdate(update);
  };

  const openDetailComments = (update: Update) => {
    tapSelection();
    setPostUpdate(update);
    onFullScreen?.(true);
  };

  const closePost = () => {
    tapSelection();
    setPostUpdate(null);
    setFocusComment(null);
    onFullScreen?.(false);
  };

  const openInbox = () => {
    tapSelection();
    setUnread(0);
    inbox.setOpen(true);
  };

  const openUpdateComments = (
    updateId: string,
    commentId: string | null = null
  ) => {
    const target = updates.find((item) => item.id === updateId);
    if (!target) return;
    setFocusComment(commentId);
    setPostUpdate(target);
    onFullScreen?.(true);
  };

  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- deep link waits async feed load
    if (!deepLink || !visible || updates.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-you-might-not-need-an-effect/no-derived-state, react-you-might-not-need-an-effect/no-pass-data-to-parent -- deep link opens post once feed loaded
    openUpdateComments(deepLink.updateId, deepLink.commentId);
    onDeepLinkHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inline callbacks recreated per render re-render unstable
  }, [deepLink, visible, updates.length]);

  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent, react-you-might-not-need-an-effect/no-pass-data-to-parent -- prop-sync parent fullscreen, live state
    onFullScreen?.(postUpdate !== null || inbox.open);
  }, [postUpdate, inbox.open, onFullScreen]);

  const selectCat = (key: FilterKey) => {
    tapSelection();
    setCat(key);
  };

  const renderBody = () => {
    if (!isSupabaseConfigured) {
      return (
        <Notice
          Icon={CloudOff}
          title="Updates offline"
          body="Add your Supabase URL and key to enable updates, reactions and comments."
        />
      );
    }
    if (feedQuery.isLoading) return <UpdatesSkeleton />;
    if (feedQuery.isError && updates.length === 0) {
      return (
        <Notice
          Icon={AlertCircle}
          title="Couldn't load updates"
          body={messageOf(feedQuery.error)}
        />
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
        isWide={contentMax != null}
        tallies={summarizeReactions(reactionRows, update.id, userId)}
        commentCount={commentCounts[update.id] ?? 0}
        onReact={(emoji) => void onReact(update, emoji)}
        onOpenComments={() => openDetailComments(update)}
        onOpen={() => openDetail(update)}
      />
    ));
  };

  return (
    // skipcq: JS-0415
    <ReactionPlayContext.Provider value={reactionTick}>
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: '#080d1a' },
          fadeStyle,
        ]}
      >
        <View style={tw`flex-1`}>
          <ScrollView
            style={tw`flex-1`}
            contentContainerStyle={[
              tw`items-center px-4 pb-36`,
              { paddingTop: insets.top + 14 },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  feedQuery
                    .refetch()
                    .catch(() => undefined)
                    .finally(() => setRefreshing(false));
                }}
                tintColor="#22d3ee"
                colors={['#22d3ee']}
                progressBackgroundColor="#17324c"
                progressViewOffset={insets.top}
              />
            }
          >
            <View
              style={[tw`w-full`, contentMax ? { maxWidth: contentMax } : null]}
            >
              <View
                style={tw`mb-4 ml-1 mr-1 flex-row items-center justify-between`}
              >
                <Text
                  style={tw`font-sans-bold text-[30px] tracking-tight text-white`}
                >
                  Updates
                </Text>
                {isSupabaseConfigured && userId ? (
                  <Pressable onPress={openInbox} hitSlop={10} style={tw`p-1`}>
                    <Bell size={24} color="#cbd5e1" strokeWidth={2} />
                    {unread > 0 ? (
                      <View
                        style={[
                          tw`absolute items-center justify-center rounded-full px-1`,
                          {
                            top: -3,
                            right: -5,
                            minWidth: 18,
                            height: 18,
                            backgroundColor: '#ef4444',
                          },
                        ]}
                      >
                        <Text style={tw`font-sans-bold text-[10px] text-white`}>
                          {badgeLabel(unread)}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                ) : null}
              </View>
              {isSupabaseConfigured && updates.length > 0 ? (
                <View style={tw`mb-6 -mx-4`}>
                  <CategoryChips active={cat} onSelect={selectCat} />
                </View>
              ) : null}
              {error && updates.length > 0 ? (
                <Text style={tw`mb-3 px-1 font-sans text-[12px] text-red-400`}>
                  {error}
                </Text>
              ) : null}
              {renderBody()}
            </View>
          </ScrollView>
        </View>

        {postUpdate ? (
          <PostDetailPanel
            update={postUpdate}
            tallies={summarizeReactions(reactionRows, postUpdate.id, userId)}
            myName={myName}
            myAvatar={myAvatar}
            ensureIdentity={ensureIdentity}
            focusCommentId={focusComment}
            onReact={(emoji) => void onReact(postUpdate, emoji)}
            onClose={closePost}
          />
        ) : null}

        <Animated.View
          pointerEvents={inbox.open ? 'auto' : 'none'}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#080d1a' },
            inbox.style,
          ]}
        >
          {inbox.mounted ? (
            <NotificationsPanel
              visible={inbox.open}
              onBack={() => {
                tapSelection();
                inbox.setOpen(false);
              }}
              onOpen={(item: InboxItem) => {
                inbox.setOpen(false);
                if (item.updateId) {
                  openUpdateComments(item.updateId, item.commentId);
                }
              }}
            />
          ) : null}
        </Animated.View>

        <UpdateDetailSheet
          update={detailUpdate}
          tallies={
            detailUpdate
              ? summarizeReactions(reactionRows, detailUpdate.id, userId)
              : []
          }
          authorName={AUTHOR_NAME}
          authorPic={PROFILE_PIC}
          ringColors={RING_COLORS}
          onReact={(emoji) => {
            if (detailUpdate) void onReact(detailUpdate, emoji);
          }}
          onOpenComments={() => {
            if (!detailUpdate) return;
            const target = detailUpdate;
            setDetailUpdate(null);
            openDetailComments(target);
          }}
          onClose={() => setDetailUpdate(null)}
        />
        <UsernameSheet
          open={usernameOpen}
          suggestion={nameSuggestion}
          onClose={onUsernameClose}
          onSaved={onUsernameSaved}
        />
        <BottomSheet
          open={signInOpen}
          onClose={() => {
            pendingReact.current = null;
            setSignInOpen(false);
          }}
          restRatio={0.3}
          border="subtle"
          radius={20}
        >
          <View style={tw`items-center px-2 pt-2`}>
            <Text
              style={tw`font-sans-bold text-[22px] tracking-tight text-white`}
            >
              Sign in to react
            </Text>
            <Text
              style={tw`mt-0.5 text-center font-sans text-[13px] text-slate-400`}
            >
              Pick how you want to continue
            </Text>
          </View>
          <View style={tw`mt-7`}>
            <Pressable
              onPress={() => void chooseGuest()}
              style={({ pressed }) => [
                tw`flex-row items-center justify-center rounded-full border border-white/15 bg-white/5 py-4`,
                pressed ? { transform: [{ scale: 0.98 }] } : null,
              ]}
            >
              <Ghost size={16} color="#cbd5e1" strokeWidth={2} />
              <Text
                numberOfLines={1}
                style={tw`ml-2 font-sans-semibold text-[13px] text-slate-100`}
              >
                Continue as Anonymous
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void chooseGoogle()}
              style={({ pressed }) => [
                tw`mt-2 flex-row items-center justify-center rounded-full bg-white py-4`,
                pressed ? { transform: [{ scale: 0.98 }] } : null,
              ]}
            >
              <GoogleIcon size={16} />
              <Text
                numberOfLines={1}
                style={tw`ml-2 font-sans-bold text-[13px] text-[#1f1f1f]`}
              >
                Sign in with Google
              </Text>
            </Pressable>
          </View>
        </BottomSheet>
      </Animated.View>
    </ReactionPlayContext.Provider>
  );
}

export default memo(UpdatesScreen);
