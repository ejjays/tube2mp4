import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import {
  Play,
  ListMusic,
  Check,
  Download,
  RotateCcw,
} from 'lucide-react-native';
import tw from '../../lib/tw';
import { Format } from '@phantom/extractors';
import {
  type DownloadState,
  titleFor,
  subtitleFor,
  badgeFor,
} from '../../lib/format';

export function SkeletonBar({ style }: { style: StyleProp<ViewStyle> }) {
  const [barWidth, setBarWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.linear }),
      -1,
      false
    );
  }, [progress]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], [-barWidth, barWidth]),
      },
    ],
  }));

  return (
    <View
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      style={[style, { overflow: 'hidden' }]}
    >
      {barWidth > 0 ? (
        <Animated.View
          style={[
            { position: 'absolute', top: 0, bottom: 0, width: barWidth },
            shimmerStyle,
          ]}
        >
          <LinearGradient
            colors={
              ['transparent', 'rgba(255,255,255,0.16)', 'transparent'] as const
            }
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={tw`flex-1`}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

export const Badge = ({
  label,
  tone = 'cyan',
}: {
  label: string;
  tone?: 'cyan' | 'amber';
}) => (
  <View
    style={tw.style(
      'ml-2.5 rounded-md px-1.5 py-0.5',
      tone === 'amber' ? 'bg-amber-500/20' : 'bg-primary/20'
    )}
  >
    <Text
      style={tw.style(
        'font-mono-bold text-[9px] uppercase tracking-tight',
        tone === 'amber' ? 'text-amber-300' : 'text-primary'
      )}
    >
      {label}
    </Text>
  </View>
);

type QualityOptionProps = {
  format: Format;
  selected: boolean;
  onSelect: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const QualityOption = ({
  format,
  selected,
  onSelect,
  testID,
}: QualityOptionProps & { testID?: string }) => {
  const badge = badgeFor(format);
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

  return (
    <AnimatedPressable
      onPress={onSelect}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${titleFor(format)} ${subtitleFor(format)}`}
      style={[
        tw.style(
          'flex-row items-center justify-between border-l-2 px-4 py-3',
          selected ? 'border-primary bg-primary/10' : 'border-transparent'
        ),
        scaleStyle,
      ]}
    >
      <View style={tw`flex-1`}>
        <View style={tw`flex-row items-center`}>
          <Text
            style={tw.style(
              'font-mono-bold text-sm',
              selected ? 'text-primary' : 'text-slate-200'
            )}
          >
            {titleFor(format)}
          </Text>
          {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
        </View>
        <Text
          style={tw.style(
            'mt-0.5 font-mono text-[10px]',
            selected ? 'text-primary/70' : 'text-primary/40'
          )}
        >
          {subtitleFor(format)}
        </Text>
      </View>
      {selected ? (
        <View style={tw`rounded-full bg-primary/20 p-1`}>
          <Check size={12} color="#22d3ee" strokeWidth={4} />
        </View>
      ) : null}
    </AnimatedPressable>
  );
};

type GetFileButtonProps = {
  state?: DownloadState;
  onPress: () => void;
};

export const GetFileButton = ({ state, onPress }: GetFileButtonProps) => {
  const status = state?.status;
  const active =
    status === 'downloading' || status === 'muxing' || status === 'saving';
  const errored = status === 'error';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={active}
      activeOpacity={0.85}
      testID="get-file-btn"
      accessibilityRole="button"
      accessibilityLabel={errored ? 'Retry download' : 'Download'}
      style={tw.style(
        'w-16 items-center justify-center rounded-2xl',
        errored ? 'bg-amber-500' : 'bg-primary',
        active ? 'opacity-40' : ''
      )}
    >
      {errored ? (
        <RotateCcw size={22} color="#231400" strokeWidth={2.5} />
      ) : (
        <Download size={22} color="#ffffff" strokeWidth={2.5} />
      )}
    </TouchableOpacity>
  );
};

export const ThumbOverlay = ({ isAudio }: { isAudio: boolean }) => (
  <View
    style={tw`absolute inset-0 items-center justify-center`}
    pointerEvents="none"
  >
    <View
      style={tw`h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-primary/20`}
    >
      {isAudio ? (
        <ListMusic size={28} color="#22d3ee" />
      ) : (
        <Play size={30} color="#22d3ee" />
      )}
    </View>
  </View>
);
