import {
  useState,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
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
import { useScreenSize } from '../hooks/useScreenSize';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  Easing,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import { useGenericKeyboardHandler } from 'react-native-keyboard-controller';
import {
  X,
  Music,
  ChevronDown,
  Download,
  SquarePen,
  FilePlay,
} from 'lucide-react-native';
import tw from '../lib/tw';
import { VideoInfo, Format } from '@phantom/extractors';
import VideoPreviewModal from './VideoPreviewModal';
import {
  DownloadState,
  DownloadMeta,
  previewableFormat,
  buildAudioOptions,
  extLabel,
  titleFor,
  subtitleFor,
  badgeFor,
} from '../lib/format';
import EditForm from './PickerEditForm';
import { computeLift } from '../lib/keyboardLift';
import {
  SkeletonBar,
  Badge,
  QualityOption,
  GetFileButton,
  ThumbOverlay,
} from './picker/PickerParts';
import { PickerFooter } from './picker/PickerFooter';

type Props = {
  info: VideoInfo | null;
  downloads: Record<string, DownloadState>;
  preferAudio?: boolean;
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

type ContentProps = {
  info: VideoInfo;
  downloads: Record<string, DownloadState>;
  preferAudio: boolean;
  vpnWarning: boolean;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  zoomed: boolean;
  setZoomed: Dispatch<SetStateAction<boolean>>;
  onClose: () => void;
  onDownload: (format: Format, meta?: DownloadMeta) => void;
  onPreview: (url: string, aspectRatio: number) => void;
};

const EDIT_MIN_HEIGHT = 210;

function PickerContent({
  info,
  downloads,
  preferAudio,
  vpnWarning,
  open,
  setOpen,
  zoomed,
  setZoomed,
  onClose,
  onDownload,
  onPreview,
}: ContentProps) {
  const displayFormats = useMemo(
    () => (preferAudio ? buildAudioOptions(info) : info.formats),
    [preferAudio, info]
  );
  const [selectedId, setSelectedId] = useState(
    () => displayFormats[0]?.formatId ?? ''
  );
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(info.title);
  const [author, setAuthor] = useState(info.uploader);
  const { height: screenH } = useScreenSize();
  const insets = useSafeAreaInsets();

  const kb = useSharedValue(0);
  const fieldBottom = useSharedValue(0);

  useGenericKeyboardHandler(
    {
      onMove: (event) => {
        'worklet';
        kb.value = event.height;
      },
      onEnd: (event) => {
        'worklet';
        kb.value = event.height;
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

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(zoomed ? 1.1 : 1, { duration: 700 }) }],
  }));

  const editOpacity = useSharedValue(1);
  const editTx = useSharedValue(0);
  const transitioning = useRef(false);
  const [swapMinH, setSwapMinH] = useState(EDIT_MIN_HEIGHT);

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

  const selected =
    displayFormats.find((format) => format.formatId === selectedId) ??
    displayFormats[0] ??
    null;
  const selectedBadge = selected ? badgeFor(selected) : null;
  const state = selected ? downloads[selected.formatId] : undefined;
  const isAudio = selected ? selected.isAudio && !selected.isVideo : false;

  const pressed = useSharedValue(0);

  const handlePressIn = () => {
    pressed.value = withTiming(1, { duration: 80 });
  };

  const handlePressOut = () => {
    pressed.value = withTiming(0, { duration: 120 });
  };

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.97]) }],
  }));

  const handleGet = () => {
    if (!selected) return;
    onDownload(selected, {
      title: title.trim() || info.title,
      author: author.trim() || info.uploader,
    });
  };

  const previewFormat = previewableFormat(
    info.formats,
    selected,
    isAudio,
    info.extractorKey
  );
  const canPreview = previewFormat !== null;
  const handlePreview = () => {
    if (!previewFormat) return;
    const ratio =
      previewFormat.width && previewFormat.height
        ? previewFormat.width / previewFormat.height
        : 16 / 9;
    onPreview(previewFormat.url, ratio);
  };

  return (
    <AnimatedPressable
      onPress={() => {
        setOpen(false);
        setZoomed(false);
      }}
      style={[
        tw`w-full max-w-lg overflow-hidden rounded-3xl border border-primary/30 bg-[#0f172a]`,
        { maxHeight: '90%' },
        glowShadow,
        liftStyle,
      ]}
    >
      <Pressable
        onPress={() => {
          if (canPreview) handlePreview();
          else setZoomed(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={canPreview ? 'Preview video' : 'Zoom thumbnail'}
        style={[
          tw`relative w-full overflow-hidden bg-black`,
          { aspectRatio: 16 / 9 },
        ]}
      >
        {info.thumbnail ? (
          <Animated.View style={[tw`h-full w-full`, zoomStyle]}>
            <Image
              source={{ uri: info.thumbnail }}
              style={tw`h-full w-full`}
              contentFit="cover"
              transition={220}
            />
          </Animated.View>
        ) : null}
        <LinearGradient
          colors={
            [
              'rgba(15,23,42,0)',
              'rgba(15,23,42,0)',
              '#0f172a',
              '#0f172a',
            ] as const
          }
          locations={[0, 0.6, 0.96, 1] as const}
          style={tw`absolute inset-0`}
          pointerEvents="none"
        />
        <ThumbOverlay isAudio={isAudio} />
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={tw`absolute right-3 top-3 h-8 w-8 items-center justify-center rounded-full bg-black/50`}
        >
          <X size={18} color="#fff" />
        </TouchableOpacity>
      </Pressable>

      <View style={tw`px-5 pb-5 pt-0.5`}>
        <Animated.View style={editAnimStyle}>
          {editing ? (
            <View
              onLayout={(e) => {
                const height = e.nativeEvent.layout.height;
                setSwapMinH((prev) => Math.max(prev, height));
              }}
              style={[
                tw`justify-center`,
                swapMinH ? { minHeight: swapMinH } : null,
              ]}
            >
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
            </View>
          ) : (
            <View
              onLayout={(event) => {
                const height = event.nativeEvent.layout.height;
                setSwapMinH((prev) => Math.max(prev, height));
              }}
              style={[
                tw`justify-center`,
                swapMinH ? { minHeight: swapMinH } : null,
              ]}
            >
              <View>
                <Text
                  style={tw`font-mono-bold text-lg text-white`}
                  numberOfLines={2}
                >
                  {title}
                </Text>
                <Text
                  style={tw`mt-1 font-mono-medium text-xs text-slate-400`}
                  numberOfLines={1}
                >
                  {author || 'Unknown Author'}
                </Text>
                <View style={tw`mt-2 flex-row items-center`}>
                  <View style={tw`flex-row items-center`}>
                    {isAudio ? (
                      <Music size={13} color="#22d3ee" />
                    ) : (
                      <FilePlay size={13} color="#94a3b8" />
                    )}
                    <Text
                      style={tw`ml-1.5 font-mono text-[10px] text-slate-500`}
                    >
                      Format:{' '}
                      <Text style={tw`font-mono-bold text-slate-300`}>
                        {selected ? extLabel(selected) : 'MP4'}
                      </Text>
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => startEditTransition(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Edit title and author"
                    style={tw`ml-1 p-1`}
                  >
                    <SquarePen size={18} color="#22d3ee" />
                  </TouchableOpacity>
                </View>
              </View>

              {preferAudio && displayFormats.length === 0 && !info.isPartial ? (
                <View style={tw`mt-6 items-center px-4`}>
                  <Music size={22} color="#475569" />
                  <Text
                    style={tw`mt-2 text-center font-mono text-[12px] text-slate-500`}
                  >
                    No audio available for this one.
                  </Text>
                </View>
              ) : null}

              {selected ? (
                <View style={tw`mt-5`}>
                  <Text
                    style={tw`ml-1 font-mono-bold text-[10px] uppercase tracking-wider text-primary/80`}
                  >
                    Select Output Quality
                  </Text>
                  <View style={tw`mt-2 flex-row items-stretch`}>
                    <View style={tw`relative mr-2.5 flex-1`}>
                      {open ? (
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
                            {displayFormats.map((format, index) => (
                              <QualityOption
                                key={format.formatId}
                                format={format}
                                selected={format.formatId === selected.formatId}
                                testID={`quality-option-${index}`}
                                onSelect={() => {
                                  setSelectedId(format.formatId);
                                  setOpen(false);
                                }}
                              />
                            ))}
                          </ScrollView>
                        </View>
                      ) : null}

                      <AnimatedPressable
                        onPress={() => setOpen((value) => !value)}
                        onPressIn={handlePressIn}
                        onPressOut={handlePressOut}
                        accessibilityRole="button"
                        accessibilityLabel="Select quality"
                        style={[
                          tw.style(
                            'flex-row items-center justify-between rounded-2xl border bg-white/5 px-4 py-3',
                            open ? 'border-primary/50' : 'border-white/10'
                          ),
                          scaleStyle,
                        ]}
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
                        <View style={tw.style('ml-2', open && 'rotate-180')}>
                          <ChevronDown
                            size={20}
                            color={open ? '#22d3ee' : '#94a3b8'}
                          />
                        </View>
                      </AnimatedPressable>
                    </View>

                    <GetFileButton state={state} onPress={handleGet} />
                  </View>
                </View>
              ) : info.isPartial ? (
                <View style={tw`mt-5`}>
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
                  style={tw`mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-5`}
                >
                  <Text
                    style={tw`text-center font-mono text-[12px] italic text-slate-500`}
                  >
                    No formats found.
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

export default function PickerModal({
  info,
  downloads,
  preferAudio = false,
  vpnWarning = false,
  onClose,
  onDownload,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [preview, setPreview] = useState<{
    url: string;
    aspectRatio: number;
  } | null>(null);

  const [shownInfo, setShownInfo] = useState(info);
  if (info && info !== shownInfo) setShownInfo(info);

  const [mounted, setMounted] = useState(Boolean(info));
  const dim = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (info) {
      // eslint-disable-next-line react-hooks/set-state-in-effect, react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- keep content mounted during fade-out
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
  }, [info, dim, fade]);

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
    setZoomed(false);
    setPreview(null);
    onClose();
  };

  return (
    <>
      <Modal
        visible={mounted}
        transparent
        animationType="none"
        onRequestClose={closeAll}
      >
        <Animated.View style={[tw`flex-1 bg-black/70`, dimStyle]}>
          <Pressable
            style={tw`flex-1`}
            onPress={() => {
              setDropdownOpen(false);
              setZoomed(false);
            }}
          >
            <Animated.View
              style={[tw`flex-1 items-center justify-center px-4`, cardStyle]}
            >
              {shownInfo ? (
                <PickerContent
                  key={`${shownInfo.id}:${shownInfo.formats.length > 0 ? 'full' : 'partial'}`}
                  info={shownInfo}
                  downloads={downloads}
                  preferAudio={preferAudio}
                  vpnWarning={vpnWarning}
                  open={dropdownOpen}
                  setOpen={setDropdownOpen}
                  zoomed={zoomed}
                  setZoomed={setZoomed}
                  onClose={closeAll}
                  onDownload={onDownload}
                  onPreview={(url, aspectRatio) =>
                    setPreview({ url, aspectRatio })
                  }
                />
              ) : null}
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Modal>
      <VideoPreviewModal
        visible={Boolean(preview)}
        url={preview?.url ?? null}
        aspectRatio={preview?.aspectRatio ?? 16 / 9}
        poster={info?.thumbnail}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
