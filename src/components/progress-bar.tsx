import { View } from 'react-native';

import { useTheme } from '@/theme/use-theme';

export interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
}

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const { colors, radii } = useTheme();
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      style={{ height: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
      <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: colors.primary }} />
    </View>
  );
}
