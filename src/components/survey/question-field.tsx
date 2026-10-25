import { Pressable, StyleSheet, View } from 'react-native';

import type { AnswerInput, SurveyQuestion } from '@/features/surveys/models';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { AppText } from '../app-text';
import { Card } from '../card';
import { TextField } from '../text-field';
import { OptionRow } from './option-row';

export interface QuestionFieldProps {
  question: SurveyQuestion;
  index: number;
  value: AnswerInput | undefined;
  error?: string;
  disabled?: boolean;
  onChange: (value: AnswerInput | undefined) => void;
}

/** Renders the right input for a question type. Purely presentational. */
export function QuestionField({ question, index, value, error, disabled, onChange }: QuestionFieldProps) {
  const { colors, spacing } = useTheme();
  const requiredText = question.required ? 'Required' : 'Optional';

  return (
    <Card
      testID={`question-${question.id}`}
      style={error ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" tone="muted">
          Question {index + 1} · {requiredText}
        </AppText>
        <AppText variant="subheading" accessibilityRole="header">
          {question.prompt}
          {/* Decorative: "Required" is already announced in the caption above. */}
          {question.required ? <AppText tone="danger"> *</AppText> : null}
        </AppText>
        {question.description ? <AppText tone="muted">{question.description}</AppText> : null}
      </View>

      <QuestionInput
        question={question}
        value={value}
        disabled={disabled}
        onChange={onChange}
        error={error}
      />

      {error && !isTextInput(question) ? (
        <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </Card>
  );
}

function isTextInput(q: SurveyQuestion): boolean {
  return q.type === 'short_text' || q.type === 'long_text' || q.type === 'number';
}

function QuestionInput({ question, value, disabled, onChange, error }: Omit<QuestionFieldProps, 'index'>) {
  const { spacing } = useTheme();

  switch (question.type) {
    case 'single_select':
      return (
        <View accessibilityRole="radiogroup" accessibilityLabel={question.prompt} style={{ gap: spacing.sm }}>
          {question.options.map((option) => (
            <OptionRow
              key={option.id}
              kind="radio"
              label={option.label}
              selected={value === option.id}
              disabled={disabled}
              onPress={() => onChange(option.id)}
            />
          ))}
        </View>
      );

    case 'multi_select': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <View style={{ gap: spacing.sm }}>
          {question.options.map((option) => {
            const isSelected = selected.includes(option.id);
            return (
              <OptionRow
                key={option.id}
                kind="checkbox"
                label={option.label}
                selected={isSelected}
                disabled={disabled}
                onPress={() =>
                  onChange(
                    isSelected ? selected.filter((id) => id !== option.id) : [...selected, option.id],
                  )
                }
              />
            );
          })}
        </View>
      );
    }

    case 'short_text':
    case 'long_text': {
      const isLong = question.type === 'long_text';
      const text = typeof value === 'string' ? value : '';
      const counter =
        question.maxLength !== undefined ? `${text.length}/${question.maxLength} characters` : undefined;
      return (
        <TextField
          label={question.prompt}
          hideLabel
          value={text}
          onChangeText={onChange}
          placeholder={question.placeholder}
          multiline={isLong}
          maxLength={question.maxLength}
          editable={!disabled}
          error={error}
          hint={counter}
          autoCapitalize="sentences"
          returnKeyType={isLong ? 'default' : 'done'}
        />
      );
    }

    case 'number':
      return (
        <TextField
          label={question.prompt}
          hideLabel
          value={typeof value === 'string' ? value : value === undefined ? '' : String(value)}
          onChangeText={onChange}
          placeholder={question.placeholder}
          keyboardType={question.integer ? 'number-pad' : 'decimal-pad'}
          inputMode={question.integer ? 'numeric' : 'decimal'}
          editable={!disabled}
          error={error}
          hint={describeRange(question.min, question.max, question.unit)}
          returnKeyType="done"
        />
      );

    case 'rating':
      return (
        <RatingInput
          prompt={question.prompt}
          value={typeof value === 'number' ? value : undefined}
          minLabel={question.minLabel}
          maxLabel={question.maxLabel}
          disabled={disabled}
          onChange={onChange}
        />
      );
  }
}

function describeRange(min?: number, max?: number, unit?: string): string | undefined {
  const suffix = unit ? ` ${unit}` : '';
  if (min !== undefined && max !== undefined) return `Between ${min} and ${max}${suffix}`;
  if (min !== undefined) return `At least ${min}${suffix}`;
  if (max !== undefined) return `At most ${max}${suffix}`;
  return undefined;
}

interface RatingInputProps {
  prompt: string;
  value: number | undefined;
  minLabel?: string;
  maxLabel?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function RatingInput({ prompt, value, minLabel, maxLabel, disabled, onChange }: RatingInputProps) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <View accessibilityRole="radiogroup" accessibilityLabel={prompt} style={[styles.ratingRow, { gap: spacing.sm }]}>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          const label = n === 1 && minLabel ? `${n}, ${minLabel}` : n === 5 && maxLabel ? `${n}, ${maxLabel}` : String(n);
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`Rating ${label}`}
              accessibilityState={{ checked: selected, disabled: !!disabled }}
              disabled={disabled}
              onPress={() => onChange(n)}
              style={({ pressed }) => [
                styles.ratingButton,
                {
                  borderRadius: radii.md,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : pressed ? colors.surfaceMuted : colors.surface,
                },
              ]}>
              <AppText variant="label" style={{ color: selected ? colors.onPrimary : colors.text }}>
                {n}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {minLabel || maxLabel ? (
        <View style={styles.ratingLabels} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <AppText variant="caption" tone="muted">{minLabel}</AppText>
          <AppText variant="caption" tone="muted">{maxLabel}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ratingRow: { flexDirection: 'row' },
  ratingButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingLabels: { flexDirection: 'row', justifyContent: 'space-between' },
});
