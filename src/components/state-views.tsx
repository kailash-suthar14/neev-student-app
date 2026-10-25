import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}
      accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} accessibilityLabel={message} />
      <AppText tone="muted">{message}</AppText>
    </View>
  );
}

export interface MessageStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ErrorState({ title, message, actionLabel = 'Try again', onAction }: MessageStateProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }} accessibilityRole="alert">
      <AppText variant="heading">{title}</AppText>
      <AppText tone="muted">{message}</AppText>
      {onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export function EmptyState({ title, message, actionLabel, onAction }: MessageStateProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
      <AppText variant="heading">{title}</AppText>
      <AppText tone="muted">{message}</AppText>
      {onAction && actionLabel ? <Button variant="secondary" label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}
