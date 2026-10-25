import type { PropsWithChildren, Ref } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
  /** Vertically centre content (splash, login, state screens). */
  centered?: boolean;
  edges?: Edge[];
  scrollRef?: Ref<ScrollViewInstance>;
  testID?: string;
}

/** Safe-area, keyboard-aware, width-constrained screen container. */
export function Screen({
  children,
  scroll = true,
  centered = false,
  edges = ['bottom', 'left', 'right'],
  scrollRef,
  testID,
}: ScreenProps) {
  const { colors, spacing } = useTheme();
  const content = (
    <View style={[styles.content, { padding: spacing.lg, gap: spacing.lg }, centered && styles.centered]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: colors.background }]} testID={testID}>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.grow}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          // iOS: inset content by the keyboard height, including under a header.
          // Android relies on the default adjustResize window mode.
          automaticallyAdjustKeyboardInsets>
          {content}
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {content}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  centered: { justifyContent: 'center' },
});
