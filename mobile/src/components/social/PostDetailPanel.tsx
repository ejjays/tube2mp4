import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useBackHandler } from '../../lib/back';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import tw from '../../lib/tw';
import CommentsPanel from './CommentsPanel';
import ReactionBar from './ReactionBar';
import PostMarkdown from '../PostMarkdown';
import ImageFocusOverlay, { type FocusOrigin } from '../ImageFocusOverlay';
import {
  relativeTime,
  type Update,
  type ReactionTally,
  type UpdateCategory,
} from '../../lib/social/updates';

const SCREEN_BG = '#080d1a';
const CYAN = '#22d3ee';
const CATEGORY_LABEL: Record<UpdateCategory, string> = {
  feature: 'New feature',
  optimization: 'Optimization',
  fix: 'Fix',
};
const EASE = Easing.out(Easing.cubic);

function PostHeader({
  update,
  tallies,
  onReact,
}: {
  update: Update;
  tallies: ReactionTally[];
  onReact: (emoji: string) => void;
}) {
  const [focusOrigin, setFocusOrigin] = useState<FocusOrigin | null>(null);
  const [imgAspect, setImgAspect] = useState(4 / 3);
  const imgRef = useRef<View>(null);

  const openFocus = () => {
    imgRef.current?.measureInWindow((x, y, boxW, boxH) => {
      setFocusOrigin({ x, y, width: boxW, height: boxH });
    });
  };

  return (
    <View style={tw`pt-1`}>
      <Text style={tw`font-sans-bold text-[24px] leading-8 text-white`}>
        {update.title}
      </Text>
      <PostMarkdown text={update.body} selectable={false} style={tw`mt-3`} />
      {update.imageUrl ? (
        <Pressable ref={imgRef} onPress={openFocus} style={tw`mt-4`}>
          {/* no transition: expo-image replays crossfade on Android relayout &
          flickers black while description height animates below/above it */}
          <Image
            source={{ uri: update.imageUrl }}
            style={[tw`w-full rounded-3xl`, { aspectRatio: 4 / 3 }]}
            contentFit="cover"
            onLoad={(event) => {
              const imgW = event.source?.width;
              const imgH = event.source?.height;
              if (imgW && imgH) setImgAspect(imgW / imgH);
            }}
          />
        </Pressable>
      ) : null}
      <View style={tw`mb-1 mt-5`}>
        <ReactionBar tallies={tallies} onReact={onReact} />
      </View>
      <ImageFocusOverlay
        uri={update.imageUrl ?? null}
        origin={focusOrigin}
        aspect={imgAspect}
        onClose={() => setFocusOrigin(null)}
      />
    </View>
  );
}

export default function PostDetailPanel({
  update,
  tallies,
  myName,
  myAvatar,
  ensureIdentity,
  onReact,
  onClose,
  focusCommentId,
}: {
  update: Update;
  tallies: ReactionTally[];
  myName: string | null;
  myAvatar: string | null;
  ensureIdentity: (mode?: 'google' | 'guest' | 'auto') => Promise<boolean>;
  onReact: (emoji: string) => void;
  onClose: () => void;
  focusCommentId?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const fade = useSharedValue(0);
  const closing = useSharedValue(0);

  const dismiss = useCallback(() => {
    closing.value = 1;
    fade.value = withTiming(0, { duration: 180, easing: EASE }, (done) => {
      if (done) runOnJS(onClose)();
    });
  }, [fade, closing, onClose]);

  useEffect(() => {
    fade.value = withTiming(1, { duration: 280, easing: EASE });
  }, [fade]);

  useBackHandler(() => {
    dismiss();
    return true;
  }, 10);

  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [
      { scale: closing.value ? 1 : interpolate(fade.value, [0, 1], [0.92, 1]) },
    ],
  }));

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: SCREEN_BG, paddingTop: insets.top },
        surfaceStyle,
      ]}
    >
      <CommentsPanel
        updateId={update.id}
        visible
        myName={myName}
        myAvatar={myAvatar}
        ensureIdentity={ensureIdentity}
        onBack={dismiss}
        focusCommentId={focusCommentId}
        barCategory={CATEGORY_LABEL[update.category]}
        barTimestamp={relativeTime(update.publishedAt)}
        barTitle={update.title}
        barVersion={update.version ?? undefined}
        header={
          <PostHeader update={update} tallies={tallies} onReact={onReact} />
        }
      />
    </Animated.View>
  );
}
