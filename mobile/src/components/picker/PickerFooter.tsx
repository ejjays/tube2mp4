import { useState, useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import type { DimensionValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import tw from '../../lib/tw';
import { Format } from '@phantom/extractors';
import { type DownloadState, formatSize, extLabel } from '../../lib/format';

const SHIMMER_BAND = 64;

function FooterProgress({ state }: { state: DownloadState }) {
  const muxing = state.status === 'muxing';
  const saving = state.status === 'saving';
  const fill = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const lastT = useRef(Date.now());
  const [trackW, setTrackW] = useState(0);

  useEffect(() => {
    const now = Date.now();
    const dt = Math.min(Math.max(now - lastT.current, 180), 1200);
    lastT.current = now;
    fill.value = withTiming(muxing ? 1 : state.progress / 100, {
      duration: dt,
      easing: Easing.linear,
    });
  }, [state.progress, muxing, fill]);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, [shimmer]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%` as DimensionValue,
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          shimmer.value,
          [0, 1],
          [-SHIMMER_BAND, trackW + SHIMMER_BAND]
        ),
      },
    ],
  }));

  return (
    <View style={tw`w-full`}>
      <View style={tw`mb-2 flex-row items-center justify-between`}>
        <Text
          style={tw`font-mono text-[10px] uppercase tracking-[2px] text-primary`}
        >
          {muxing ? 'Finishing up…' : saving ? 'Saving…' : 'Downloading'}
        </Text>
        {muxing ? null : (
          <Text style={tw`font-mono-bold text-[11px] text-white`}>
            {state.progress} <Text style={tw`text-primary`}>%</Text>
          </Text>
        )}
      </View>
      <View
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        style={tw`h-2 overflow-hidden rounded-full bg-white/10`}
      >
        <Animated.View
          style={[tw`h-full overflow-hidden rounded-full`, fillStyle]}
        >
          <LinearGradient
            colors={['#22d3ee', '#6366f1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={tw`h-full w-full`}
          />
          {trackW > 0 ? (
            <Animated.View
              style={[
                tw`absolute inset-y-0`,
                { width: SHIMMER_BAND },
                shimmerStyle,
              ]}
            >
              <LinearGradient
                colors={[
                  'rgba(255,255,255,0)',
                  'rgba(255,255,255,0.35)',
                  'rgba(255,255,255,0)',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={tw`h-full w-full`}
              />
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

export function PickerFooter({
  selected,
  editing,
  state,
  vpnWarning = false,
}: {
  selected: Format;
  editing: boolean;
  state?: DownloadState;
  vpnWarning?: boolean;
}) {
  const status = state?.status;
  const downloading =
    status === 'downloading' || status === 'muxing' || status === 'saving';

  return (
    <View style={tw`border-t border-white/5 bg-black/20 px-4 py-3`}>
      {vpnWarning ? (
        <Text style={tw`text-center font-mono text-[10px] leading-tight text-amber-300/90`}>
          VPN detected — downloads may fail, sites can block VPN IPs.
        </Text>
      ) : downloading && state ? (
        <Animated.View
          key="progress"
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(140)}
        >
          <FooterProgress state={state} />
        </Animated.View>
      ) : (
        <Animated.View
          key="meta"
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(140)}
        >
          <Text
            style={tw.style(
              'text-center font-mono text-[10px] leading-tight',
              status === 'error' ? 'text-red-400' : 'text-slate-500'
            )}
          >
            {status === 'error'
              ? 'Download failed — tap retry'
              : editing
                ? 'Changes will update file info when you download.'
                : `${formatSize(selected.filesize)} · ${extLabel(selected)}${
                    selected.isMuxed ? ' · video + audio in one file' : ''
                  }`}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}
