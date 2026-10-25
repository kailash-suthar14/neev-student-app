import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

export interface BannerProps {
  tone: 'info' | 'error' | 'success' | 'warning';
  title?: string;
  message: string;
  children?: ReactNode;
  testID?: string;
}

/** Inline status message. Errors and successes are announced to screen readers. */
export function Banner({ tone, title, message, children, testID }: BannerProps) {
  const { colors, radii, spacing } = useTheme();
  const palette = {
    info: { bg: colors.primarySoft, fg: colors.text, accent: colors.primary },
    error: { bg: colors.dangerSoft, fg: colors.text, accent: colors.danger },
    success: { bg: colors.successSoft, fg: colors.text, accent: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.text, accent: colors.warning },
  }[tone];

  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'error' || tone === 'success' ? 'polite' : 'none'}
      style={{
        backgroundColor: palette.bg,
        borderLeftColor: palette.accent,
        borderLeftWidth: 4,
        borderRadius: radii.md,
        padding: spacing.md,
        gap: spacing.xs,
      }}>
      {title ? (
        <AppText variant="label" style={{ color: palette.fg }}>
          {title}
        </AppText>
      ) : null}
      <AppText variant="body" style={{ color: palette.fg }}>
        {message}
      </AppText>
      {children}
    </View>
  );
}
