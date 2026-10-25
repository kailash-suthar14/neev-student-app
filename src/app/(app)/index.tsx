import { router } from 'expo-router';
import { useRef } from 'react';
import { AccessibilityInfo, View, type ScrollViewInstance } from 'react-native';

import { AppText } from '@/components/app-text';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/state-views';
import { StatusBadge } from '@/components/status-badge';
import { AnswerSummary } from '@/components/survey/answer-summary';
import { QuestionField } from '@/components/survey/question-field';
import { useAuth, useSession } from '@/features/auth/auth-context';
import { formatDateTime } from '@/features/surveys/format';
import { sortQuestions } from '@/features/surveys/models';
import { useSurveyForm } from '@/features/surveys/use-survey-form';
import { useTheme } from '@/theme/use-theme';

function openSubmission(submissionId: string) {
  router.push({ pathname: '/submissions/[submissionId]', params: { submissionId } });
}

export default function SurveyLandingScreen() {
  const session = useSession();
  const { expireSession } = useAuth();
  const form = useSurveyForm({ respondentId: session.user.id, onUnauthorized: expireSession });
  const { spacing } = useTheme();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const questionOffsets = useRef<Record<string, number>>({});

  if (form.load.status === 'loading') {
    return (
      <Screen scroll={false}>
        <LoadingState message="Loading your survey…" />
      </Screen>
    );
  }
  if (form.load.status === 'error') {
    return (
      <Screen scroll={false}>
        <ErrorState title="Survey unavailable" message={form.load.message} onAction={form.reload} />
      </Screen>
    );
  }
  if (form.load.status === 'empty') {
    return (
      <Screen scroll={false}>
        <EmptyState
          title="No surveys right now"
          message="There are no surveys for you to complete. Check back later."
          actionLabel="Refresh"
          onAction={form.reload}
        />
      </Screen>
    );
  }

  const { survey } = form.load;
  const questions = sortQuestions(survey);

  if (form.justSubmitted) {
    const submission = form.justSubmitted;
    return (
      <Screen scrollRef={scrollRef}>
        <Banner
          tone="success"
          title="Thank you!"
          message="Your response has been saved."
          testID="submission-success"
        />
        <Card>
          <AppText variant="heading">{survey.title}</AppText>
          <AppText tone="muted">
            Submitted {formatDateTime(submission.createdAt)} · {submission.answers.length} of{' '}
            {questions.length} questions answered
          </AppText>
          <AnswerSummary survey={survey} submission={submission} />
        </Card>
        <Button label="View saved submission" onPress={() => openSubmission(submission.id)} />
        <Button variant="secondary" label="Submit another response" onPress={form.startNewResponse} />
      </Screen>
    );
  }

  const progress = form.progress ?? { answered: 0, total: questions.length, requiredRemaining: 0 };
  const errorCount = Object.keys(form.errors).length;

  const handleSubmit = async () => {
    const result = await form.submit();
    if (result.ok) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      AccessibilityInfo.announceForAccessibility('Survey submitted. Your response has been saved.');
      return;
    }
    if (result.firstInvalidQuestionId) {
      const y = questionOffsets.current[result.firstInvalidQuestionId];
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(y - spacing.lg, 0), animated: true });
      AccessibilityInfo.announceForAccessibility('Some questions need your attention.');
    }
  };

  return (
    <Screen scrollRef={scrollRef}>
      <Card>
        <AppText variant="caption" tone="muted">
          Welcome, {session.user.displayName}
        </AppText>
        <AppText variant="title">{survey.title}</AppText>
        <AppText tone="muted">{survey.description}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
          <StatusBadge status={form.status} />
          <AppText variant="caption" tone="muted">
            {questions.length} questions
            {survey.estimatedMinutes ? ` · about ${survey.estimatedMinutes} min` : ''}
          </AppText>
        </View>
        <ProgressBar
          value={progress.answered}
          max={progress.total}
          label={`${progress.answered} of ${progress.total} questions answered`}
        />
        <AppText variant="caption" tone="muted">
          {progress.answered} of {progress.total} answered
          {progress.requiredRemaining > 0 ? ` · ${progress.requiredRemaining} required remaining` : ''}
        </AppText>
      </Card>

      {form.latestSubmission ? (
        <Banner
          tone="info"
          title="Already submitted"
          message={`You submitted this survey on ${formatDateTime(form.latestSubmission.createdAt)}. You can review it or send another response.`}>
          <Button
            variant="secondary"
            label="View your submission"
            onPress={() => form.latestSubmission && openSubmission(form.latestSubmission.id)}
          />
        </Banner>
      ) : null}

      {form.draftWarning ? (
        <Banner tone="warning" message="Your answers could not be saved as a draft on this device." />
      ) : null}

      {questions.map((question, index) => (
        <View
          key={question.id}
          onLayout={(e) => {
            questionOffsets.current[question.id] = e.nativeEvent.layout.y;
          }}>
          <QuestionField
            question={question}
            index={index}
            value={form.values[question.id]}
            error={form.errors[question.id]}
            disabled={form.submitting}
            onChange={(value) => form.setAnswer(question.id, value)}
          />
        </View>
      ))}

      {/* Kept below the questions so it never shifts their scroll offsets. */}
      {errorCount > 0 ? (
        <Banner
          tone="error"
          title="Please review your answers"
          message={`${errorCount} ${errorCount === 1 ? 'question needs' : 'questions need'} attention.`}
          testID="validation-summary"
        />
      ) : null}

      {form.submitError ? (
        <Banner tone="error" title="Not submitted" message={form.submitError} testID="submit-error" />
      ) : null}

      <Button
        label="Submit survey"
        loadingLabel="Submitting…"
        loading={form.submitting}
        onPress={() => void handleSubmit()}
        accessibilityHint="Validates and saves your answers"
      />
    </Screen>
  );
}
