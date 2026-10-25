import { Text, type TextProps } from 'react-native';

import type { typography } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export type TextVariant = keyof typeof typography;
type Tone = 'default' | 'muted' | 'primary' | 'danger' | 'success' | 'onPrimary';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: Tone;
}

export function AppText({ variant = 'body', tone = 'default', style, ...rest }: AppTextProps) {
  const { colors, typography } = useTheme();
  const color = {
    default: colors.text,
    muted: colors.textMuted,
    primary: colors.primary,
    danger: colors.danger,
    success: colors.success,
    onPrimary: colors.onPrimary,
  }[tone];
  const isHeading = variant === 'title' || variant === 'heading';
  return (
    <Text
      accessibilityRole={isHeading ? 'header' : undefined}
      maxFontSizeMultiplier={1.6}
      style={[typography[variant], { color }, style]}
      {...rest}
    />
  );
}
