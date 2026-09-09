import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGenericKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import {
  X,
  Music,
  Music2,
  Pause,
  Play,
  SquarePen,
  ChevronDown,
  Download,
} from 'lucide-react-native';
import tw from '../lib/tw';
import GlowBlob from './backgrounds/GlowBlob';
import VinylGrooves from './backgrounds/VinylGrooves';
import PreviewAudioWebView, {
  type PreviewAudioHandle,
  type PreviewAudioMessage,
} from './webviews/PreviewAudioWebView';
import { useScreenSize } from '../hooks/useScreenSize';
import { VideoInfo, Format } from '@phantom/extractors';
import {
  DownloadState,
  DownloadMeta,
  titleFor,
  subtitleFor,
  badgeFor,
} from '../lib/format';
import { computeLift } from '../lib/keyboardLift';
import EditForm from './PickerEditForm';
import {
  SkeletonBar,
  Badge,
  QualityOption,
  GetFileButton,
} from './picker/PickerParts';
import { PickerFooter } from './picker/PickerFooter';

type Props = {
  info: VideoInfo | null;
  visible: boolean;
  downloads: Record<string, DownloadState>;
  vpnWarning?: boolean;
  onClose: () => void;
  onDownload: (format: Format, meta?: DownloadMeta) => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const glowShadow = {
  shadowColor: '#06b6d4',
  shadowOpacity: 0.25,
  shadowRadius: 40,
  shadowOffset: { width: 0, height: 0 },
  elevation: 20,
};

const panelShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.6,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 16 },
  elevation: 24,
};

function VinylDecorations() {
  return (
    <>
      <LinearGradient
        colors={
          [
            'rgba(6,182,212,0.20)',
            'transparent',
            'rgba(147,51,234,0.25)',
          ] as const
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={tw`absolute inset-0`}
        pointerEvents="none"
      />
      <GlowBlob color="#06b6d4" size={260} x={-110} y={-110} />
      <GlowBlob color="#a855f7" size={260} x={220} y={40} />
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(17,24,39,0.85)'] as const}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={tw`absolute inset-0`}
        pointerEvents="none"
      />
    </>
  );
}

function VinylDisc({
  isPlaying,
  onTogglePlay,
  cover,
}: {
  isPlaying: boolean;
  onTogglePlay: () => void;
  cover?: string;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: isPlaying ? 10000 : 60000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, [isPlaying, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <TouchableOpacity
      onPress={onTogglePlay}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? 'Pause preview' : 'Play preview'}
      style={tw`shrink-0`}
    >
      <Animated.View
        style={[
          tw`h-24 w-24 overflow-hidden rounded-full border-[3px] border-cyan-300 bg-cyan-500/10 p-1`,
          {
            shadowColor: '#06b6d4',
            shadowOpacity: 0.5,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 0 },
            elevation: 12,
          },
          spinStyle,
        ]}
      >
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={tw`h-full w-full rounded-full`}
            contentFit="cover"
          />
        ) : (
          <View
            style={tw`h-full w-full items-center justify-center rounded-full bg-slate-800`}
          >
            <Music size={30} color="#94a3b8" />
          </View>
        )}
        <VinylGrooves size={90} />
      </Animated.View>
      <View
        style={tw`absolute inset-0 items-center justify-center`}
        pointerEvents="none"
      >
        <View
          style={[
            tw`h-4 w-4 rounded-full border-2 border-white/5 bg-gray-900`,
            {
              shadowColor: '#000',
              shadowOpacity: 0.5,
              shadowRadius: 2,
              shadowOffset: { width: 0, height: 1 },
              elevation: 1,
            },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

function EqBar({ index, isPlaying }: { index: number; isPlaying: boolean }) {
  const height = useSharedValue(4);

  useEffect(() => {
    if (isPlaying) {
      const peak = 4 + ((index * 3) % 9);
      height.value = withRepeat(
        withSequence(
          withTiming(peak + 4, {
            duration: 400 + (index % 3) * 100,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(4, {
            duration: 400 + (index % 3) * 100,
            easing: Easing.inOut(Easing.sin),
          })
        ),
        -1,
        true
      );
    } else {
      height.value = withTiming(4, { duration: 240 });
    }
  }, [isPlaying, index, height]);

  const barStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View style={[tw`w-[3px] rounded-full bg-primary`, barStyle]} />
  );
}

const EQ_BAR_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

function Equalizer({ isPlaying }: { isPlaying: boolean }) {
  return (
    <View style={tw`h-3 flex-row items-end gap-[3px] px-0.5`}>
      {EQ_BAR_KEYS.map((key, index) => (
        <EqBar key={key} index={index} isPlaying={isPlaying} />
      ))}
    </View>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  const value = useSharedValue(0);
  useEffect(() => {
    value.value = withTiming(progress, { duration: 300 });
  }, [progress, value]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${interpolate(value.value, [0, 100], [0, 100])}%`,
  }));
  return (
    <View style={tw`h-1 w-full overflow-hidden rounded-full bg-white/10`}>
      <Animated.View style={[tw`h-full overflow-hidden`, fillStyle]}>
        <LinearGradient
          colors={['#22d3ee', '#a855f7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={tw`h-full w-full`}
        />
      </Animated.View>
    </View>
  );
}

function VinylProgressDecor() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.3, 0.75]),
    width: interpolate(pulse.value, [0, 1], [80, 160]),
  }));

  return (
    <View
      pointerEvents="none"
      style={tw`absolute bottom-0 left-0 right-0 h-px overflow-hidden`}
    >
      <LinearGradient
        colors={
          ['transparent', 'rgba(255,255,255,0.10)', 'transparent'] as const
        }
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={tw`h-full w-full`}
      />
      <Animated.View
        style={[
          tw`absolute h-full self-center`,
          { top: 0, left: '50%', marginLeft: -80 },
          pulseStyle,
        ]}
      >
        <LinearGradient
          colors={['transparent', '#22d3ee', 'transparent'] as const}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={tw`h-full w-full`}
        />
      </Animated.View>
    </View>
  );
}

function VinylPlayer({
  info,
  title,
  author,
  isPlaying,
  onTogglePlay,
  audioProgress,
}: {
  info: VideoInfo;
  title: string;
  author: string;
  isPlaying: boolean;
  onTogglePlay: () => void;
  audioProgress: number;
}) {
  return (
    <View
      style={[
        tw`relative w-full overflow-hidden rounded-t-3xl px-5 pb-4 pt-6`,
        { backgroundColor: '#0a0a0f' },
      ]}
    >
      <VinylDecorations />

      <View style={tw`relative z-10 flex-row items-center`}>
        <VinylDisc
          isPlaying={isPlaying}
          onTogglePlay={onTogglePlay}
          cover={info.thumbnail}
        />

        <View style={tw`ml-5 flex-1`}>
          <Text
            style={tw`font-sans-bold text-[17px] text-white`}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={tw`mt-0.5 font-sans-medium text-[13px] text-cyan-400/80`}
            numberOfLines={1}
          >
            {author}
          </Text>

          <View style={tw`mt-3 flex-row items-center`}>
            <TouchableOpacity
              onPress={onTogglePlay}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause preview' : 'Play preview'}
              style={[
                tw`h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary`,
                {
                  shadowColor: '#06b6d4',
                  shadowOpacity: 0.45,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 6,
                },
              ]}
            >
              {isPlaying ? (
                <Pause size={16} fill="#000" color="#000" />
              ) : (
                <Play
                  size={16}
                  fill="#000"
                  color="#000"
                  style={{ marginLeft: 2 }}
                />
              )}
            </TouchableOpacity>
            <View style={tw`ml-3 flex-1`}>
              <Equalizer isPlaying={isPlaying} />
              <View style={tw`mt-2`}>
                <ProgressBar progress={audioProgress} />
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={tw`relative z-10 mt-4 flex-row items-center`}>
        <Music2 size={11} color="#c084fc" />
        <Text
          style={tw`ml-1.5 font-mono-bold text-[9px] uppercase tracking-[3px] text-purple-300/60`}
        >
          Previewing Spotify Content
        </Text>
      </View>

      <VinylProgressDecor />
    </View>
  );
}

type ContentProps = {
  info: VideoInfo;
  downloads: Record<string, DownloadState>;
  title: string;
  author: string;
  setTitle: (v: string) => void;
  setAuthor: (v: string) => void;
  editing: boolean;
  setEditing: Dispatch<SetStateAction<boolean>>;
  dropdownOpen: boolean;
  setDropdownOpen: Dispatch<SetStateAction<boolean>>;
  selectedId: string;
  setSelectedId: Dispatch<SetStateAction<string>>;
  isPlaying: boolean;
  audioProgress: number;
  onTogglePlay: () => void;
  vpnWarning: boolean;
  onClose: () => void;
  onDownload: (format: Format, meta?: DownloadMeta) => void;
};

function PickerContent({
  info,
  downloads,
  title,
  author,
  setTitle,
  setAuthor,
  editing,
  setEditing,
  dropdownOpen,
  setDropdownOpen,
  selectedId,
  setSelectedId,
  isPlaying,
  audioProgress,
  onTogglePlay,
  vpnWarning,
  onClose,
  onDownload,
}: ContentProps) {
  const audioFormats = useMemo(
    () => info.formats.filter((f) => f.isAudio && !f.isVideo),
    [info]
  );
  const selected =
    audioFormats.find((f) => f.formatId === selectedId) ?? audioFormats[0];
  const selectedBadge = selected ? badgeFor(selected) : null;
  const state = selected ? downloads[selected.formatId] : undefined;

  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- seeds default stream when formats arrive
    if (audioFormats.length > 0 && !selectedId) {
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent -- seeds default stream when formats arrive
      setSelectedId(audioFormats[0].formatId);
    }
  }, [audioFormats, selectedId, setSelectedId]);

  const { height: screenH } = useScreenSize();
  const insets = useSafeAreaInsets();
  const kb = useSharedValue(0);
  const fieldBottom = useSharedValue(0);

  useGenericKeyboardHandler(
    {
      onMove: (e) => {
        'worklet';
        kb.value = e.height;
      },
      onEnd: (e) => {
        'worklet';
        kb.value = e.height;
      },
    },
    []
  );

  const lift = useDerivedValue(
    () => computeLift(fieldBottom.value, kb.value, screenH, insets.bottom),
    [screenH, insets.bottom]
  );
  const onFocusField = (windowBottom: number) => {
    fieldBottom.value = windowBottom - lift.value;
  };
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }],
  }));

  const handleGet = () => {
    if (!selected) return;
    onDownload(selected, {
      title: title.trim() || info.title,
      author: author.trim() || info.uploader,
    });
  };

  const editOpacity = useSharedValue(1);
  const editTx = useSharedValue(0);
  const transitioning = useRef(false);

  const editAnimStyle = useAnimatedStyle(() => ({
    opacity: editOpacity.value,
    transform: [{ translateX: editTx.value }],
  }));

  const startEditTransition = (next: boolean, onSwap?: () => void) => {
    if (transitioning.current || editing === next) return;
    transitioning.current = true;
    const dist = next ? 20 : -20;
    editOpacity.value = withTiming(0, {
      duration: 160,
      easing: Easing.in(Easing.quad),
    });
    editTx.value = withTiming(dist, {
      duration: 160,
      easing: Easing.in(Easing.quad),
    });
    setTimeout(() => {
      onSwap?.();
      setEditing(next);
      editTx.value = dist;
      editOpacity.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      editTx.value = withTiming(0, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      setTimeout(() => {
        transitioning.current = false;
      }, 220);
    }, 160);
  };

  return (
    <AnimatedPressable
      onPress={() => setDropdownOpen(false)}
      style={[
        tw`w-full max-w-lg overflow-hidden rounded-3xl border border-primary/30 bg-gray-900`,
        { maxHeight: '90%' },
        glowShadow,
        liftStyle,
      ]}
    >
      <VinylPlayer
        info={info}
        title={title}
        author={author}
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        audioProgress={audioProgress}
      />

      <TouchableOpacity
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={tw`absolute right-3 top-3 z-50 h-9 w-9 items-center justify-center rounded-full bg-black/40`}
      >
        <X size={18} color="rgba(255,255,255,0.75)" />
      </TouchableOpacity>

      <View style={tw`px-5 pb-5 pt-5`}>
        <Animated.View style={editAnimStyle}>
          {editing ? (
            <EditForm
              title={title}
              author={author}
              setTitle={setTitle}
              setAuthor={setAuthor}
              onCancel={() =>
                startEditTransition(false, () => {
                  setTitle(info.title);
                  setAuthor(info.uploader);
                })
              }
              onSave={() => startEditTransition(false)}
              onFocusField={onFocusField}
            />
          ) : (
            <View>
              <View style={tw`flex-row items-center`}>
                <Music size={13} color="#22d3ee" />
                <Text style={tw`ml-1.5 font-mono text-[10px] text-slate-500`}>
                  Format:{' '}
                  <Text style={tw`font-mono-bold text-slate-300`}>
                    {selected?.extension?.toUpperCase() ?? 'MP3'}
                  </Text>
                </Text>
                <TouchableOpacity
                  onPress={() => startEditTransition(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit title and author"
                  style={tw`ml-2 rounded-md border border-primary/60 bg-white/5 p-1`}
                >
                  <SquarePen size={16} color="#22d3ee" />
                </TouchableOpacity>
              </View>

              {selected ? (
                <View style={tw`mt-4`}>
                  <Text
                    style={tw`ml-1 font-mono-bold text-[10px] uppercase tracking-wider text-primary/80`}
                  >
                    Select Output Quality
                  </Text>
                  <View style={tw`mt-2 flex-row items-stretch`}>
                    <View style={tw`relative mr-2.5 flex-1`}>
                      {dropdownOpen ? (
                        <View
                          style={[
                            tw`absolute overflow-hidden rounded-3xl border border-primary/20 bg-slate-950`,
                            {
                              left: 0,
                              right: 0,
                              bottom: '100%',
                              marginBottom: 12,
                              zIndex: 50,
                            },
                            panelShadow,
                          ]}
                        >
                          <View
                            style={tw`border-b border-white/5 bg-white/5 px-4 py-3`}
                          >
                            <Text
                              style={tw`font-mono-bold text-[9px] uppercase tracking-[2px] text-primary`}
                            >
                              Available Streams
                            </Text>
                          </View>
                          <ScrollView
                            style={{ maxHeight: 176 }}
                            nestedScrollEnabled
                            contentContainerStyle={tw`py-1`}
                            keyboardShouldPersistTaps="handled"
                          >
                            {audioFormats.map((format) => (
                              <QualityOption
                                key={format.formatId}
                                format={format}
                                selected={format.formatId === selected.formatId}
                                onSelect={() => {
                                  setSelectedId(format.formatId);
                                  setDropdownOpen(false);
                                }}
                              />
                            ))}
                          </ScrollView>
                        </View>
                      ) : null}

                      <TouchableOpacity
                        onPress={() => setDropdownOpen((v) => !v)}
                        accessibilityRole="button"
                        accessibilityLabel="Select quality"
                        style={tw.style(
                          'flex-row items-center justify-between rounded-2xl border bg-white/5 px-4 py-3',
                          dropdownOpen ? 'border-primary/50' : 'border-white/10'
                        )}
                      >
                        <View style={tw`flex-1`}>
                          <View style={tw`flex-row items-center`}>
                            <Text
                              style={tw`font-mono-bold text-[15px] text-white`}
                              numberOfLines={1}
                            >
                              {titleFor(selected)}
                            </Text>
                            {selectedBadge ? (
                              <Badge
                                label={selectedBadge.label}
                                tone={selectedBadge.tone}
                              />
                            ) : null}
                          </View>
                          <Text
                            style={tw`mt-0.5 font-mono text-[11px] text-primary/60`}
                          >
                            {subtitleFor(selected)}
                          </Text>
                        </View>
                        <View
                          style={tw.style('ml-2', dropdownOpen && 'rotate-180')}
                        >
                          <ChevronDown
                            size={20}
                            color={dropdownOpen ? '#22d3ee' : '#94a3b8'}
                          />
                        </View>
                      </TouchableOpacity>
                    </View>

                    <GetFileButton state={state} onPress={handleGet} />
                  </View>
                </View>
              ) : info.isPartial ? (
                <View style={tw`mt-4`}>
                  <Text
                    style={tw`ml-1 font-mono-bold text-[10px] uppercase tracking-wider text-primary/80`}
                  >
                    Select Output Quality
                  </Text>
                  <View style={tw`mt-2 flex-row items-stretch`}>
                    <View
                      style={tw`mr-2.5 flex-1 flex-row items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3`}
                    >
                      <View style={tw`flex-1`}>
                        <SkeletonBar
                          style={tw`h-3.5 w-3/5 rounded-md bg-white/10`}
                        />
                        <SkeletonBar
                          style={tw`mt-1.5 h-2.5 w-2/5 rounded-md bg-white/5`}
                        />
                      </View>
                      <ChevronDown size={20} color="#475569" />
                    </View>
                    <View
                      style={tw`items-center justify-center rounded-2xl bg-primary/40 px-5`}
                    >
                      <Download size={20} color="#0a3540" strokeWidth={2.5} />
                    </View>
                  </View>
                  <Text
                    style={tw`mt-3 text-center font-mono text-[10px] italic text-primary/50`}
                  >
                    Identifying available streams…
                  </Text>
                </View>
              ) : (
                <View
                  style={tw`mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-5`}
                >
                  <Text
                    style={tw`text-center font-mono text-[12px] italic text-slate-500`}
                  >
                    No audio available for this one.
                  </Text>
                </View>
              )}
            </View>
          )}
        </Animated.View>
      </View>

      {selected ? (
        <PickerFooter
          selected={selected}
          editing={editing}
          state={state}
          vpnWarning={vpnWarning}
        />
      ) : null}
    </AnimatedPressable>
  );
}

export default function SpotifyPickerModal({
  info,
  visible,
  downloads,
  vpnWarning = false,
  onClose,
  onDownload,
}: Props) {
  const [shownInfo, setShownInfo] = useState(info);
  if (info && info !== shownInfo) setShownInfo(info);

  const [mounted, setMounted] = useState(Boolean(info) && visible);
  const dim = useSharedValue(0);
  const fade = useSharedValue(0);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [title, setTitle] = useState(info?.title ?? '');
  const [author, setAuthor] = useState(info?.uploader ?? '');
  const lastInfoId = useRef<string | null>(null);
  const audioRef = useRef<PreviewAudioHandle | null>(null);
  const previewUrl = info?.previewUrl;

  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- resets picker ui on new track while open
    if (visible && info && info.id !== lastInfoId.current) {
      lastInfoId.current = info.id;
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-derived-state -- title user-editable; reset on track switch
      setTitle(info.title);
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-derived-state -- author user-editable; reset on track switch
      setAuthor(info.uploader);
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- reset picker ui for new track
      setEditing(false);
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- reset picker ui for new track
      setDropdownOpen(false);
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- reset picker ui for new track
      setIsPlaying(false);
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- reset picker ui for new track
      setAudioProgress(0);
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- reset picker ui for new track
      setSelectedId('');
    }
  }, [visible, info]);

  useEffect(() => {
    if (visible && previewUrl) {
      audioRef.current?.load(previewUrl);
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- pauses webview audio when hidden
    } else if (!visible) {
      audioRef.current?.pause();
      audioRef.current?.seek(0);
      // eslint-disable-next-line react-hooks/set-state-in-effect, react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- syncs playback state with webview visibility
      setIsPlaying(false);
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- syncs playback state with webview visibility
      setAudioProgress(0);
    }
  }, [visible, previewUrl]);

  const handleTogglePlay = useCallback(() => {
    if (!previewUrl) return;
    if (isPlaying) audioRef.current?.pause();
    else audioRef.current?.play();
  }, [previewUrl, isPlaying]);

  const handleAudioMessage = useCallback((msg: PreviewAudioMessage) => {
    if (msg.type === 'progress') {
      if (msg.duration > 0) {
        setAudioProgress((msg.currentTime / msg.duration) * 100);
      }
    } else if (msg.type === 'ended') {
      setIsPlaying(false);
      setAudioProgress(0);
      audioRef.current?.seek(0);
    } else if (msg.type === 'playing') {
      setIsPlaying(true);
    } else if (msg.type === 'paused') {
      setIsPlaying(false);
    } else if (msg.type === 'error') {
      setIsPlaying(false);
    }
  }, []);

  useEffect(() => {
    if (info && visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect, react-you-might-not-need-an-effect/no-derived-state -- keep content mounted during fade-out
      setMounted(true);
      dim.value = withTiming(1, {
        duration: 120,
        easing: Easing.out(Easing.quad),
      });
      fade.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      dim.value = withTiming(0, {
        duration: 200,
        easing: Easing.in(Easing.cubic),
      });
      fade.value = withTiming(
        0,
        { duration: 200, easing: Easing.in(Easing.cubic) },
        (done) => {
          if (done) runOnJS(setMounted)(false);
        }
      );
    }
  }, [info, visible, dim, fade]);

  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [
      { translateY: (1 - fade.value) * 12 },
      { scale: 0.95 + 0.05 * fade.value },
    ],
  }));

  const closeAll = () => {
    setDropdownOpen(false);
    onClose();
  };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={closeAll}
    >
      <Animated.View style={[tw`flex-1 bg-black/70`, dimStyle]}>
        <Pressable style={tw`flex-1`} onPress={() => setDropdownOpen(false)}>
          <Animated.View
            style={[tw`flex-1 items-center justify-center px-4`, cardStyle]}
          >
            {shownInfo ? (
              <PickerContent
                key={`${shownInfo.id}:${shownInfo.formats.length > 0 ? 'full' : 'partial'}`}
                info={shownInfo}
                downloads={downloads}
                title={title}
                author={author}
                setTitle={setTitle}
                setAuthor={setAuthor}
                editing={editing}
                setEditing={setEditing}
                dropdownOpen={dropdownOpen}
                setDropdownOpen={setDropdownOpen}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                isPlaying={isPlaying}
                audioProgress={audioProgress}
                onTogglePlay={handleTogglePlay}
                vpnWarning={vpnWarning}
                onClose={closeAll}
                onDownload={onDownload}
              />
            ) : null}
          </Animated.View>
        </Pressable>
      </Animated.View>
      <PreviewAudioWebView ref={audioRef} onMessage={handleAudioMessage} />
    </Modal>
  );
}
