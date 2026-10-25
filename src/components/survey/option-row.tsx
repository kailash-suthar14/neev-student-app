import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { AppText } from '../app-text';

export interface OptionRowProps {
  kind: 'radio' | 'checkbox';
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export function OptionRow({ kind, label, selected, disabled, onPress }: OptionRowProps) {
  const { colors, radii, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole={kind}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          gap: spacing.md,
          paddingHorizontal: spacing.md,
          borderRadius: radii.md,
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.primarySoft : pressed ? colors.surfaceMuted : colors.surface,
        },
      ]}>
      <View
        style={[
          styles.indicator,
          {
            borderRadius: kind === 'radio' ? 11 : 4,
            borderColor: selected ? colors.primary : colors.textMuted,
            backgroundColor: selected ? colors.primary : 'transparent',
          },
        ]}>
        {selected ? (
          <AppText variant="caption" tone="onPrimary" style={styles.tick}>
            {kind === 'radio' ? '●' : '✓'}
          </AppText>
        ) : null}
      </View>
      <AppText style={styles.label}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: MIN_TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  indicator: { width: 22, height: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tick: { fontSize: 12, lineHeight: 14, fontWeight: '700' },
  label: { flex: 1, paddingVertical: 10 },
});
