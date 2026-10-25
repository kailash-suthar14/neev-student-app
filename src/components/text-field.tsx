import { useId, type Ref } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';

import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  hint?: string;
  /** Hide the visible label when an outer element (e.g. a question prompt) already labels the field. */
  hideLabel?: boolean;
  ref?: Ref<TextInputInstance>;
}

export function TextField({ label, error, hint, hideLabel, multiline, ref, ...rest }: TextFieldProps) {
  const { colors, radii, spacing, typography } = useTheme();
  const nativeId = useId();
  const describedBy = error ?? hint;

  return (
    <View style={{ gap: spacing.xs }}>
      {hideLabel ? null : (
        <AppText variant="label" nativeID={nativeId}>
          {label}
        </AppText>
      )}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityLabelledBy={hideLabel ? undefined : nativeId}
        accessibilityHint={describedBy}
        accessibilityState={{ disabled: rest.editable === false }}
        aria-invalid={!!error}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          typography.body,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          },
          multiline && styles.multiline,
        ]}
        {...rest}
      />
      {error ? (
        <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: MIN_TOUCH_TARGET, borderWidth: 1 },
  multiline: { minHeight: 120 },
});
