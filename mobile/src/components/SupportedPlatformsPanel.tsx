import { useState, type ComponentType } from 'react';
import {
  View,
  Text,
  Pressable,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Check, X, Minus, Info } from 'lucide-react-native';
import tw from '../lib/tw';
import { tapSelection } from '../lib/haptics';
import { VideoPlayerIcon, MusicNoteIcon, GalleryIcon } from './icons';
import { PlatformLogo, type PlatformName } from './logos';
import CardBackdrop from './CardBackdrop';

type Cap = 'yes' | 'no' | 'na';

// same matrix as root README, minus web/mobile columns — mobile-only app
const ROWS: readonly {
  name: string;
  logo?: PlatformName;
  video: Cap;
  audio: Cap;
  image: Cap;
}[] = [
  { name: 'YouTube', logo: 'youtube', video: 'yes', audio: 'yes', image: 'na' },
  { name: 'Spotify', logo: 'spotify', video: 'yes', audio: 'yes', image: 'na' },
  {
    name: 'SoundCloud',
    logo: 'soundcloud',
    video: 'na',
    audio: 'yes',
    image: 'na',
  },
  {
    name: 'Bilibili',
    logo: 'bilibili',
    video: 'yes',
    audio: 'yes',
    image: 'na',
  },
  { name: 'TikTok', logo: 'tiktok', video: 'yes', audio: 'yes', image: 'yes' },
  {
    name: 'Instagram',
    logo: 'instagram',
    video: 'yes',
    audio: 'yes',
    image: 'yes',
  },
  {
    name: 'Facebook',
    logo: 'facebook',
    video: 'yes',
    audio: 'yes',
    image: 'yes',
  },
  {
    name: 'Threads',
    logo: 'threads',
    video: 'yes',
    audio: 'yes',
    image: 'yes',
  },
  { name: '/ Twitter', logo: 'x', video: 'yes', audio: 'yes', image: 'na' },
  { name: 'Bluesky', logo: 'bluesky', video: 'yes', audio: 'no', image: 'na' },
  { name: 'Vimeo', logo: 'vimeo', video: 'yes', audio: 'no', image: 'na' },
  {
    name: 'Dailymotion',
    logo: 'dailymotion',
    video: 'yes',
    audio: 'no',
    image: 'na',
  },
  { name: 'Reddit', logo: 'reddit', video: 'yes', audio: 'yes', image: 'na' },
  {
    name: 'Pinterest',
    logo: 'pinterest',
    video: 'yes',
    audio: 'yes',
    image: 'yes',
  },
  { name: 'Twitch', logo: 'twitch', video: 'yes', audio: 'no', image: 'na' },
  {
    name: 'Snapchat',
    logo: 'snapchat',
    video: 'yes',
    audio: 'yes',
    image: 'na',
  },
];

const MIN_COL_W = 46;

const CAP_STATS = [
  {
    label: 'Video',
    icon: VideoPlayerIcon,
    count: ROWS.filter((row) => row.video === 'yes').length,
  },
  {
    label: 'Audio',
    icon: MusicNoteIcon,
    count: ROWS.filter((row) => row.audio === 'yes').length,
  },
  {
    label: 'Images',
    icon: GalleryIcon,
    count: ROWS.filter((row) => row.image === 'yes').length,
  },
];

const CAP_COLORS = {
  yes: { fg: '#4ade80' },
  no: { fg: '#f87171' },
  na: { fg: '#64748b' },
} as const;

function StatCard({
  icon: Icon,
  label,
  count,
  spaced,
}: {
  icon: ComponentType<{ size?: number; color?: string }>;
  label: string;
  count: number;
  spaced: boolean;
}) {
  const content = (
    <>
      <Icon size={26} color="#22d3ee" />
      <Text style={tw`mt-2 font-sans-bold text-[19px] leading-6 text-white`}>
        {count}
      </Text>
      <Text
        style={tw`mt-0.5 font-sans-semibold text-[9.5px] uppercase tracking-wide text-slate-400`}
      >
        {label}
      </Text>
    </>
  );
  const gap = spaced ? tw`mr-2.5` : null;
  return (
    <View
      style={[
        tw`flex-1 overflow-hidden rounded-3xl border border-white/15`,
        gap,
      ]}
    >
      <CardBackdrop>
        <View style={tw`items-center py-3.5`}>{content}</View>
      </CardBackdrop>
    </View>
  );
}

function CapChip({ cap, width }: { cap: Cap; width: number }) {
  const colors = CAP_COLORS[cap];
  const icon =
    cap === 'yes' ? (
      <Check size={14} color={colors.fg} strokeWidth={3} />
    ) : cap === 'no' ? (
      <X size={14} color={colors.fg} strokeWidth={3} />
    ) : (
      <Minus size={14} color={colors.fg} strokeWidth={3} />
    );
  return (
    <View style={[tw`items-center justify-center`, { width }]}>{icon}</View>
  );
}

function LegendPill({ cap, label }: { cap: Cap; label: string }) {
  const colors = CAP_COLORS[cap];
  const icon =
    cap === 'yes' ? (
      <Check size={10} color={colors.fg} strokeWidth={3} />
    ) : cap === 'no' ? (
      <X size={10} color={colors.fg} strokeWidth={3} />
    ) : (
      <Minus size={10} color={colors.fg} strokeWidth={3} />
    );
  return (
    <View style={tw`overflow-hidden rounded-full border border-white/15`}>
      <CardBackdrop stars={false}>
        <View style={tw`flex-row items-center px-3 py-1.5`}>
          {icon}
          <Text style={tw`ml-1.5 font-sans text-[11px] text-slate-400`}>
            {label}
          </Text>
        </View>
      </CardBackdrop>
    </View>
  );
}

export default function SupportedPlatformsPanel({
  onBack,
}: {
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();
  // header scales with device; capped so "Images" fits its column slot on any width
  const headerFont = Math.max(10, Math.min(10.5, (windowW / 390) * 11.5));
  // col widths measured from header text so nothing wraps at any font scale
  const [colWs, setColWs] = useState<readonly [number, number, number]>([
    MIN_COL_W,
    MIN_COL_W,
    MIN_COL_W,
  ]);

  const measureCol = (i: number) => (e: LayoutChangeEvent) => {
    const width = Math.max(MIN_COL_W, Math.ceil(e.nativeEvent.layout.width));
    setColWs((prev) => {
      if (prev[i] === width) return prev;
      const next = [...prev] as [number, number, number];
      next[i] = width;
      return next;
    });
  };

  return (
    <View style={tw`flex-1`}>
      <View
        style={[
          tw`flex-row items-center px-5 pb-2`,
          { paddingTop: insets.top + 12 },
        ]}
      >
        <Pressable
          onPress={() => {
            tapSelection();
            onBack();
          }}
          hitSlop={8}
          style={tw`h-10 w-10 items-center justify-center rounded-full bg-white/10`}
        >
          <ChevronLeft size={22} color="#e2e8f0" strokeWidth={2.2} />
        </Pressable>
        <Text
          style={tw`flex-1 text-center font-sans-semibold text-[18px] text-white`}
        >
          Supported platforms
        </Text>
        <View style={tw`h-10 w-10`} />
      </View>

      <ScrollView
        contentContainerStyle={[
          tw`px-5 pt-2`,
          { paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[tw`w-full self-center`, { maxWidth: 600 }]}>
          <View style={tw`flex-row`}>
            {CAP_STATS.map((stat, i) => (
              <StatCard
                key={stat.label}
                icon={stat.icon}
                label={stat.label}
                count={stat.count}
                spaced={i < CAP_STATS.length - 1}
              />
            ))}
          </View>

          <View style={tw`mt-6 flex-row items-center px-4 pb-2`}>
            <Text
              numberOfLines={1}
              style={[
                tw`flex-1 font-sans-semibold uppercase text-slate-400`,
                { fontSize: headerFont },
              ]}
            >
              <Text style={tw`text-primary`}>{ROWS.length}</Text> PLATFORMS
            </Text>
            {(['Video', 'Audio', 'Images'] as const).map((label, i) => (
              <Text
                key={label}
                numberOfLines={1}
                onLayout={measureCol(i)}
                style={[
                  tw`text-center font-sans-semibold uppercase text-slate-400`,
                  { width: colWs[i], fontSize: headerFont },
                ]}
              >
                {label}
              </Text>
            ))}
          </View>

          <View
            style={tw`overflow-hidden rounded-3xl border border-white/10 bg-white/5`}
          >
            {ROWS.map((row, i) => (
              <Pressable
                key={row.name}
                android_ripple={{ color: 'rgba(255,255,255,0.03)' }}
                style={[
                  tw`flex-row items-center px-4 py-3`,
                  i < ROWS.length - 1 && tw`border-b border-white/5`,
                ]}
              >
                <View style={tw`flex-1 flex-row items-center pr-2`}>
                  {row.logo ? (
                    <View style={tw`mr-2`}>
                      <PlatformLogo name={row.logo} size={18} />
                    </View>
                  ) : null}
                  <Text
                    numberOfLines={1}
                    style={tw`font-sans-semibold text-[14px] text-white`}
                  >
                    {row.name}
                  </Text>
                </View>
                <CapChip cap={row.video} width={colWs[0]} />
                <CapChip cap={row.audio} width={colWs[1]} />
                <CapChip cap={row.image} width={colWs[2]} />
              </Pressable>
            ))}
          </View>

          <View style={tw`mt-4 flex-row items-center justify-center`}>
            <LegendPill cap="yes" label="Yes" />
            <View style={tw`w-2`} />
            <LegendPill cap="na" label="N/A" />
            <View style={tw`w-2`} />
            <LegendPill cap="no" label="No" />
          </View>

          <View style={tw`mt-6 flex-row items-start justify-center px-3`}>
            <Info size={14} color="#64748b" style={tw`mt-0.5`} />
            <Text
              style={tw`ml-1 flex-1 text-center font-sans text-[12px] leading-4 text-slate-500`}
            >
              Always working to add more platforms soon — thanks for your
              patience
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
