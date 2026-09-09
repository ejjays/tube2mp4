import { Pressable, Text, View } from 'react-native';
import LottieView from 'lottie-react-native';
import tw from '../../lib/tw';
import VisualSheet from './VisualSheet';
import CyanButton from '../CyanButton';
import notification from '../../../assets/notification.json';
import { tapImpact, tapSelection } from '../../lib/haptics';

type Props = {
  visible: boolean;
  onAllow: () => void;
  onDismiss: () => void;
};

export default function NotificationPermissionSheet({
  visible,
  onAllow,
  onDismiss,
}: Props) {
  return (
    <VisualSheet
      visible={visible}
      onClose={onDismiss}
      overlayContent={false}
      imageScale={0.45}
      stars
      visual={
        <LottieView
          source={notification}
          style={{ width: '100%', height: '100%' }}
          autoPlay
          loop
        />
      }
    >
      <Text
        style={tw`text-center text-[28px] leading-9 font-sans-bold text-white`}
      >
        Allow Phantom to notify you about downloads!
      </Text>
      <Text
        style={tw`mt-3 text-center text-[15px] leading-6 font-sans text-slate-300`}
      >
        Stay updated on your downloads and tap any alert to open it instantly
      </Text>

      <View style={tw`mt-5 w-full`}>
        <CyanButton
          label="Allow"
          accessibilityLabel="Allow notifications"
          onPress={() => {
            tapImpact();
            onAllow();
          }}
        />
      </View>

      <Pressable
        onPress={() => {
          tapSelection();
          onDismiss();
        }}
        accessibilityRole="button"
        accessibilityLabel="Not now"
        style={({ pressed }) => [
          tw`mt-1 w-full items-center justify-center py-4`,
          pressed && tw`opacity-60`,
        ]}
      >
        <Text style={tw`text-[16px] font-sans-medium text-white/70`}>
          Not now
        </Text>
      </Pressable>
    </VisualSheet>
  );
}
