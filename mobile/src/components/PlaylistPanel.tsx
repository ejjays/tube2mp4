import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  Image,
  Keyboard,
  StyleSheet,
} from 'react-native';
import { useBackHandler } from '../lib/back';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  ArrowLeft,
  Search,
  Download,
  Music,
  Check,
  AlertCircle,
  Loader,
} from 'lucide-react-native';
import tw from '../lib/tw';
import SearchOverlay, { SearchHighlight } from './SearchOverlay';
import { tapSelection, tapSuccess } from '../lib/haptics';
import { resolve } from '../extractors';
import { runDownload } from '../lib/download/downloadPipeline';
import { prettyName, type DownloadState } from '../lib/format';
import { getFilenameFormat, getNotify, formatName } from '../lib/settings';
import { notifyDownloadComplete } from '../lib/notify';
import {
  startDownloadService,
  stopDownloadService,
  updateDownloadProgress,
  setDownloadCancelHandler,
} from '../lib/fgservice';
import type {
  VideoInfo,
  PlaylistEntry,
  Format,
} from '@phantom/extractors';

type Props = {
  info: VideoInfo;
  visible: boolean;
  onClose: () => void;
};

type RowStatus =
  'idle' | 'queued' | 'resolving' | 'downloading' | 'saved' | 'error';

type DownloadMode = 'audio' | 'video';

type RowState = { status: RowStatus; progress: number; message?: string };

function pickAudioFormat(info: VideoInfo): Format | null {
  const mp3 = info.formats.find((fmt) => fmt.extension === 'mp3');
  if (mp3) return mp3;
  const audio = info.formats
    .filter((fmt) => fmt.isAudio && !fmt.isVideo)
    .sort((x, y) => (y.tbr ?? 0) - (x.tbr ?? 0))[0];
  return audio ?? null;
}

const BATCH_MAX_HEIGHT = 720;
function pickVideoFormat(info: VideoInfo): Format | null {
  const capped = info.formats.find(
    (fmt) => fmt.isVideo && (fmt.height ?? 0) <= BATCH_MAX_HEIGHT
  );
  return capped ?? info.formats.find((fmt) => fmt.isVideo) ?? null;
}

function pickFormat(info: VideoInfo, mode: DownloadMode): Format | null {
  return mode === 'video' ? pickVideoFormat(info) : pickAudioFormat(info);
}

function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return '';
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function PlaylistPanel({ info, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const playlist = info.playlist;

  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchMode, setBatchMode] = useState<DownloadMode>('audio');
  const [focusEntryId, setFocusEntryId] = useState<string | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const entryPositions = useRef<Map<string, number>>(new Map());

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setShowSearch(false);
    const term = searchQuery.trim().toLowerCase();
    if (term && playlist) {
      const matched = playlist.entries.filter((e) =>
        e.title?.toLowerCase().includes(term)
      );
      if (matched.length > 0) setFocusEntryId(matched[0].id);
    }
    setSearchQuery('');
  }, [searchQuery, playlist]);

  const toggleEntry = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (!playlist) return;
    setSelectedIds((prev) => {
      if (prev.size === playlist.entries.length) return new Set();
      return new Set(playlist.entries.map((e) => e.id));
    });
  }, [playlist]);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      progress.value = withTiming(0, {
        duration: 220,
        easing: Easing.in(Easing.cubic),
      });
    }
  }, [visible, progress]);

  useBackHandler(() => {
    if (!visible) return false;
    if (showSearch) {
      closeSearch();
      return true;
    }
    if (!batchRunning) {
      tapSelection();
      onClose();
    }
    return true;
  }, 10);

  useEffect(() => {
    if (!focusEntryId) return;
    const scrollTimer = setTimeout(() => {
      const y = entryPositions.current.get(focusEntryId);
      if (y != null && scrollRef.current) {
        scrollRef.current.scrollTo({ y, animated: true });
      }
    }, 150);
    const clearTimer = setTimeout(() => setFocusEntryId(null), 2600);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [focusEntryId]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: (1 - progress.value) * 80 }],
  }));

  const setRow = useCallback((id: string, patch: Partial<RowState>) => {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const cancelBatch = useCallback(() => {
    cancelledRef.current = true;
    batchAbortRef.current?.abort();
    setBatchRunning(false);
    setDownloadCancelHandler(null);
    void stopDownloadService().catch(() => undefined);
  }, []);

  const downloadOne = useCallback(
    async (
      entry: PlaylistEntry,
      controller: AbortController,
      mode: DownloadMode
    ) => {
      setRow(entry.id, { status: 'resolving', progress: 0 });
      let perInfo: VideoInfo;
      try {
        const watchedUrl = `https://www.youtube.com/watch?v=${entry.id}`;
        const resolved = await resolve(watchedUrl);
        if (!resolved || !resolved.formats.length) {
          throw new Error('No formats');
        }
        perInfo = resolved;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Resolve failed';
        setRow(entry.id, { status: 'error', progress: 0, message: msg });
        return;
      }
      const fmt = pickFormat(perInfo, mode);
      if (!fmt) {
        setRow(entry.id, {
          status: 'error',
          progress: 0,
          message: mode === 'video' ? 'No video format' : 'No audio format',
        });
        return;
      }

      setRow(entry.id, { status: 'downloading', progress: 0 });
      const fmtName = await getFilenameFormat();
      const title = entry.title?.trim() || perInfo.title;
      const artist = entry.channel?.trim() || perInfo.uploader;
      const stem = prettyName(formatName(fmtName, title, artist, 'youtube'));

      try {
        const outcome = await runDownload({
          info: perInfo,
          format: fmt,
          stem,
          tag: { title, artist },
          signal: controller.signal,
          onState: (state: DownloadState) => {
            const ds =
              state.status === 'downloading'
                ? { status: 'downloading' as const, progress: state.progress }
                : state.status === 'saved'
                  ? { status: 'saved' as const, progress: 100 }
                  : state.status === 'error'
                    ? {
                        status: 'error' as const,
                        progress: 0,
                        message: 'Download failed',
                      }
                    : null;
            if (ds) setRow(entry.id, ds);
          },
        });
        if (outcome.status === 'saved') {
          setRow(entry.id, { status: 'saved', progress: 100 });
          if (await getNotify()) {
            await notifyDownloadComplete(
              stem,
              perInfo.thumbnail,
              'youtube',
              fmt.extension || 'mp4',
              outcome.uri
            ).catch(() => undefined);
          }
        } else {
          setRow(entry.id, {
            status: 'error',
            progress: 0,
            message: 'Save denied',
          });
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        const msg = e instanceof Error ? e.message : 'Download failed';
        setRow(entry.id, { status: 'error', progress: 0, message: msg });
      }
    },
    [setRow]
  );

  const runBatch = useCallback(async () => {
    if (!playlist || batchRunning) return;
    const selected = playlist.entries.filter((e) => selectedIds.has(e.id));
    if (selected.length === 0) return;
    tapSelection();
    setBatchRunning(true);
    cancelledRef.current = false;
    const controller = new AbortController();
    batchAbortRef.current = controller;
    setDownloadCancelHandler(() => controller.abort());
    await startDownloadService().catch(() => undefined);

    const total = selected.length;
    let done = 0;
    updateDownloadProgress(0);

    try {
      for (const entry of selected) {
        if (cancelledRef.current) break;
        await downloadOne(entry, controller, batchMode);
        done += 1;
        updateDownloadProgress(Math.round((done / total) * 100));
      }
      if (!cancelledRef.current) tapSuccess();
    } finally {
      setBatchRunning(false);
      batchAbortRef.current = null;
      setDownloadCancelHandler(null);
      void stopDownloadService().catch(() => undefined);
    }
  }, [playlist, batchRunning, batchMode, downloadOne, selectedIds]);

  if (!playlist) return null;

  const selected = playlist.entries.filter((e) => selectedIds.has(e.id));
  const selectedCount = selected.length;
  const total = playlist.entries.length;
  const completed = selected.filter(
    (e) => rows[e.id]?.status === 'saved'
  ).length;
  const failed = selected.filter((e) => rows[e.id]?.status === 'error').length;
  const anyFailed = failed > 0;
  const allSelected = selectedCount === total;
  const query = searchQuery.trim().toLowerCase();
  const filteredEntries = query
    ? playlist.entries.filter((e) => e.title?.toLowerCase().includes(query))
    : playlist.entries;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, tw`bg-[#0f0f0f]`, containerStyle]}
    >
      <ScrollView
        ref={scrollRef}
        style={tw`flex-1`}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[tw`relative w-full`, { paddingTop: insets.top }]}>
          {info.thumbnail ? (
            <Image
              source={{ uri: info.thumbnail }}
              style={tw`absolute inset-0 h-full w-full`}
              resizeMode="cover"
              blurRadius={80}
            />
          ) : null}
          <View style={tw`absolute inset-0 bg-black/40`} />

          <View style={tw`flex-row items-center justify-between px-4 pb-2`}>
            <Pressable
              hitSlop={12}
              onPress={() => {
                if (batchRunning) {
                  cancelBatch();
                } else {
                  tapSelection();
                  onClose();
                }
              }}
              accessibilityLabel={batchRunning ? 'Stop' : 'Back'}
            >
              <View style={tw`h-9 w-9 items-center justify-center`}>
                <ArrowLeft size={24} color="#ffffff" />
              </View>
            </Pressable>
            <View style={tw`flex-row items-center gap-5`}>
              {batchRunning ? (
                <Text style={tw`text-[13px] font-medium text-white/85`}>
                  {completed}/{total}
                </Text>
              ) : null}
              <Pressable
                hitSlop={12}
                onPress={() => {
                  tapSelection();
                  Keyboard.dismiss();
                  if (showSearch) {
                    closeSearch();
                  } else {
                    setShowSearch(true);
                  }
                }}
                accessibilityLabel="Search"
              >
                <Search size={22} color={showSearch ? '#22d3ee' : '#ffffff'} />
              </Pressable>
            </View>
          </View>

          <View style={tw`px-4 pt-2`}>
            <View
              style={[
                tw`w-full overflow-hidden rounded-xl bg-[#2a2a2a]`,
                { aspectRatio: 16 / 9 },
              ]}
            >
              {info.thumbnail ? (
                <Image
                  source={{ uri: info.thumbnail }}
                  style={tw`h-full w-full`}
                  resizeMode="cover"
                />
              ) : (
                <View style={tw`h-full w-full items-center justify-center`}>
                  <Music size={40} color="#888" />
                </View>
              )}
            </View>
          </View>

          <View style={tw`mt-4 px-4`}>
            <Text style={tw`text-xl font-bold text-white`} numberOfLines={2}>
              {playlist.title}
            </Text>
            {playlist.author ? (
              <View style={tw`mt-1 flex-row items-center gap-2`}>
                {playlist.authorAvatar ? (
                  <Image
                    source={{ uri: playlist.authorAvatar }}
                    style={tw`h-5 w-5 rounded-full bg-[#444]`}
                  />
                ) : null}
                <Text style={tw`text-[14px] text-white/80`}>
                  by {playlist.author}
                </Text>
              </View>
            ) : null}
            <Text style={tw`mt-2 text-[12px] text-[#aaaaaa]`}>
              Playlist • {total} {total === 1 ? 'video' : 'videos'}
              {anyFailed ? ` • ${failed} failed` : ''}
            </Text>
          </View>

          <View style={tw`mt-6 flex-row items-center gap-2 px-4`}>
            {(['video', 'audio'] as const).map((mode) => {
              const active = batchMode === mode;
              return (
                <Pressable
                  key={mode}
                  disabled={batchRunning}
                  onPress={() => {
                    tapSelection();
                    setBatchMode(mode);
                  }}
                  style={tw`h-8 rounded-full px-3.5 items-center justify-center ${
                    active ? 'bg-white' : 'bg-white/10'
                  }`}
                  accessibilityLabel={
                    mode === 'video' ? 'Video mode' : 'Audio mode'
                  }
                >
                  <Text
                    style={tw`text-[12px] font-semibold capitalize ${
                      active ? 'text-black' : 'text-white/70'
                    }`}
                  >
                    {mode}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              disabled={batchRunning || selectedCount === 0}
              style={tw`ml-auto h-11 flex-row items-center justify-center gap-1.5 rounded-full px-5 ${
                batchRunning || selectedCount === 0 ? 'bg-white/30' : 'bg-white'
              }`}
              onPress={() => void runBatch()}
              accessibilityLabel={
                selectedCount === 0 ? 'Select items first' : 'Download selected'
              }
            >
              {batchRunning ? (
                <Loader size={14} color="#000000" />
              ) : (
                <Download size={14} color="#000000" />
              )}
              <Text
                style={tw`text-[13px] font-bold ${batchRunning || selectedCount === 0 ? 'text-white/50' : 'text-black'}`}
              >
                {batchRunning ? `${completed}/${selectedCount}` : 'Download'}
              </Text>
            </Pressable>
          </View>

          {batchRunning ? (
            <Pressable
              style={tw`mx-4 mt-2 h-10 flex-row items-center justify-center rounded-full bg-[#272727]`}
              onPress={cancelBatch}
              accessibilityLabel="Stop"
            >
              <Text style={tw`text-[13px] font-semibold text-white`}>Stop</Text>
            </Pressable>
          ) : null}

          <LinearGradient
            colors={
              [
                'rgba(15,15,15,0)',
                'rgba(15,15,15,0)',
                '#0f0f0f',
                '#0f0f0f',
              ] as const
            }
            locations={[0, 0.5, 0.88, 1] as const}
            style={tw`h-20 w-full`}
            pointerEvents="none"
          />
        </View>

        <View style={tw`flex-row items-center justify-end px-4 pb-1 -mt-4`}>
          <Pressable
            hitSlop={8}
            disabled={batchRunning}
            onPress={toggleAll}
            accessibilityLabel={allSelected ? 'Deselect all' : 'Select all'}
          >
            <Text style={tw`text-[13px] font-semibold text-cyan-400`}>
              {selectedCount === 0
                ? 'Select all'
                : allSelected
                  ? 'Deselect all'
                  : `Selected (${selectedCount})`}
            </Text>
          </Pressable>
        </View>

        <View style={[tw`pb-8`, { paddingBottom: 32 + insets.bottom }]}>
          {playlist.entries.map((entry) => (
            <View
              key={entry.id}
              onLayout={(e) =>
                entryPositions.current.set(entry.id, e.nativeEvent.layout.y)
              }
            >
              <SearchHighlight active={focusEntryId === entry.id}>
                <PlaylistRow
                  entry={entry}
                  state={rows[entry.id]}
                  checked={selectedIds.has(entry.id)}
                  onToggle={toggleEntry}
                />
              </SearchHighlight>
            </View>
          ))}
        </View>
      </ScrollView>

      <SearchOverlay
        visible={showSearch}
        searchQuery={searchQuery}
        query={query}
        results={filteredEntries}
        hint={`Search ${total} videos`}
        placeholder="Search in playlist…"
        onSearchChange={setSearchQuery}
        onClear={() => {
          tapSelection();
          setSearchQuery('');
        }}
        onBack={() => {
          tapSelection();
          closeSearch();
        }}
        renderRow={(entry) => (
          <Pressable
            key={entry.id}
            onPress={() => {
              tapSelection();
              setFocusEntryId(entry.id);
              setShowSearch(false);
              Keyboard.dismiss();
            }}
          >
            <PlaylistRow
              entry={entry}
              state={rows[entry.id]}
              checked={selectedIds.has(entry.id)}
              onToggle={() => {}}
            />
          </Pressable>
        )}
      />
    </Animated.View>
  );
}

function PlaylistRow({
  entry,
  state,
  checked,
  onToggle,
}: {
  entry: PlaylistEntry;
  state?: RowState;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  const status = state?.status ?? 'idle';
  const showSpinner = status === 'resolving' || status === 'downloading';
  const durationLabel = formatDuration(entry.durationSec);

  return (
    <Pressable
      onPress={() => onToggle(entry.id)}
      style={tw`flex-row items-center gap-3 px-4 py-2.5`}
    >
      <View style={tw`relative`}>
        {entry.thumb ? (
          <Image
            source={{ uri: entry.thumb }}
            style={tw`h-[90px] w-[160px] rounded-xl bg-[#2a2a2a]`}
            resizeMode="cover"
          />
        ) : (
          <View
            style={tw`h-[90px] w-[160px] items-center justify-center rounded-xl bg-[#2a2a2a]`}
          >
            <Music size={20} color="#888" />
          </View>
        )}
        {durationLabel ? (
          <View
            style={tw`absolute bottom-1.5 right-1.5 flex-row items-center gap-1 rounded bg-black/85 px-1.5 py-0.5`}
          >
            <Text style={tw`text-[11px] font-medium text-white`}>
              {durationLabel}
            </Text>
          </View>
        ) : null}
        {status === 'downloading' && typeof state?.progress === 'number' ? (
          <View
            style={[
              tw`absolute bottom-0 left-0 h-1 rounded bg-red-500`,
              { width: `${state.progress}%` },
            ]}
          />
        ) : null}
      </View>

      <View style={tw`flex-1 gap-0.5`}>
        <Text
          style={tw`text-[14px] font-medium leading-tight text-white`}
          numberOfLines={2}
        >
          {entry.title || entry.id}
        </Text>
        {entry.channel ? (
          <Text style={tw`text-[12px] text-[#aaaaaa]`} numberOfLines={1}>
            {entry.channel}
          </Text>
        ) : null}
        {status === 'error' && state?.message ? (
          <Text style={tw`text-[12px] text-red-400`} numberOfLines={1}>
            {state.message}
          </Text>
        ) : null}
      </View>

      <View style={tw`w-7 items-center justify-center`}>
        {showSpinner ? (
          <Loader size={18} color="#ffffff" />
        ) : status === 'saved' ? (
          <Check size={18} color="#4ade80" />
        ) : status === 'error' ? (
          <AlertCircle size={18} color="#f87171" />
        ) : (
          <View
            style={tw`h-6 w-6 items-center justify-center rounded-full border-2 ${
              checked ? 'border-cyan-400 bg-cyan-400' : 'border-white/40'
            }`}
          >
            {checked && <Check size={14} color="#000000" />}
          </View>
        )}
      </View>
    </Pressable>
  );
}
