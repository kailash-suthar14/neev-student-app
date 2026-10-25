import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { BrandMark } from './brand-mark';
import { Button } from './button';
import { Screen } from './screen';

export interface BrandedSplashProps {
  appName: string;
  /** Shown instead of the spinner when initialisation failed. */
  error?: { title: string; message: string };
  onRetry?: () => void;
  onContinue?: () => void;
  /** Fires once the splash has laid out, so the native splash can hide without a blank frame. */
  onReady?: () => void;
}

export function BrandedSplash({ appName, error, onRetry, onContinue, onReady }: BrandedSplashProps) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flex: 1 }} onLayout={onReady} testID="branded-splash">
      <Screen scroll={false} centered edges={['top', 'bottom', 'left', 'right']}>
        <View style={{ alignItems: 'center', gap: spacing.lg }}>
          <BrandMark appName={appName} size={88} />
          <AppText variant="title" style={{ textAlign: 'center' }}>
            {appName}
          </AppText>
          {error ? null : (
            <ActivityIndicator color={colors.primary} accessibilityLabel="Starting up" />
          )}
        </View>
        {error ? (
          <View style={{ gap: spacing.md }} accessibilityRole="alert">
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              {error.title}
            </AppText>
            <AppText tone="muted" style={{ textAlign: 'center' }}>
              {error.message}
            </AppText>
            {onRetry ? <Button label="Try again" onPress={onRetry} /> : null}
            {onContinue ? <Button variant="ghost" label="Continue to sign in" onPress={onContinue} /> : null}
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
