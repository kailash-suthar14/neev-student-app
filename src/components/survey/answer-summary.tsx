import { View } from 'react-native';

import { formatAnswer } from '@/features/surveys/format';
import { sortQuestions, type Survey, type SurveySubmission } from '@/features/surveys/models';
import { useTheme } from '@/theme/use-theme';

import { AppText } from '../app-text';

/** Read-only list of question prompts and the submitted answers. */
export function AnswerSummary({ survey, submission }: { survey: Survey; submission: SurveySubmission }) {
  const { colors, spacing } = useTheme();
  const byQuestion = new Map(submission.answers.map((a) => [a.questionId, a]));

  return (
    <View style={{ gap: spacing.md }}>
      {sortQuestions(survey).map((q) => (
        <View
          key={q.id}
          accessible
          style={{ gap: spacing.xs, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <AppText variant="caption" tone="muted">
            {q.prompt}
          </AppText>
          <AppText variant="label">{formatAnswer(q, byQuestion.get(q.id))}</AppText>
        </View>
      ))}
    </View>
  );
}
