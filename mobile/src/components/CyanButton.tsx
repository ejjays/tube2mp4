import { ActivityIndicator, Pressable, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import tw from '../lib/tw';

// donate-button glow, dimmed cyan for dark theme
const DONATE_GLOW =
  '0px 0px 16px rgba(34, 168, 195, 0.35), 0px 4px 5px -1px rgba(19, 111, 134, 0.4)';

export default function CyanButton({
  label,
  onPress,
  disabled,
  loading,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
}) {
  const isDisabled = Boolean(disabled || loading);
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        tw`w-full rounded-full`,
        !isDisabled ? { boxShadow: DONATE_GLOW } : null,
        pressed && !isDisabled ? tw`opacity-90` : null,
      ]}
    >
      <LinearGradient
        colors={
          isDisabled
            ? ['#1e293b', '#1e293b']
            : ['#136f86', '#22a8c3', '#136f86']
        }
        locations={isDisabled ? undefined : [0, 0.55, 0.9]}
        start={{ x: 1, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={tw`w-full items-center justify-center overflow-hidden rounded-full py-4`}
      >
        {isDisabled ? null : (
          <LinearGradient
            colors={[
              'rgba(165, 243, 252, 0.3)',
              'rgba(165, 243, 252, 0)',
              'rgba(8, 60, 75, 0.3)',
            ]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            pointerEvents="none"
            style={tw`absolute inset-0 rounded-full`}
          />
        )}
        {loading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={tw`text-[17px] font-sans-medium text-white`}>
            {label}
          </Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}
