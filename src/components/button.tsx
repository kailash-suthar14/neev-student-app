import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  /** Announced and shown while loading, e.g. "Submitting…". */
  loadingLabel?: string;
  fullWidth?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  loadingLabel,
  disabled,
  fullWidth = true,
  accessibilityHint,
  ...rest
}: ButtonProps) {
  const { colors, radii, spacing } = useTheme();
  const inactive = disabled || loading;
  const text = loading && loadingLabel ? loadingLabel : label;
  const fg = variant === 'primary' ? colors.onPrimary : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      hitSlop={4}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: radii.md,
          paddingHorizontal: spacing.xl,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        variant === 'primary' && {
          backgroundColor: pressed ? colors.primaryPressed : colors.primary,
        },
        variant === 'secondary' && {
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        variant === 'ghost' && { backgroundColor: pressed ? colors.surfaceMuted : 'transparent' },
        inactive && styles.inactive,
      ]}
      {...rest}>
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={fg} accessibilityElementsHidden /> : null}
        <AppText variant="label" style={{ color: fg }}>
          {text}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  inactive: { opacity: 0.6 },
});
