import { router, useLocalSearchParams } from 'expo-router';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/state-views';
import { StatusBadge } from '@/components/status-badge';
import { AnswerSummary } from '@/components/survey/answer-summary';
import { useAuth, useSession } from '@/features/auth/auth-context';
import { formatDateTime } from '@/features/surveys/format';
import { useSubmissionDetail } from '@/features/surveys/use-submission-detail';

export default function SubmissionDetailScreen() {
  const { submissionId } = useLocalSearchParams<{ submissionId: string }>();
  const session = useSession();
  const { expireSession } = useAuth();
  const { state, reload } = useSubmissionDetail(submissionId, session.user.id, expireSession);

  if (state.status === 'loading') {
    return (
      <Screen scroll={false}>
        <LoadingState message="Loading submission…" />
      </Screen>
    );
  }
  if (state.status === 'error') {
    return (
      <Screen scroll={false}>
        <ErrorState title="Could not load submission" message={state.message} onAction={reload} />
      </Screen>
    );
  }
  if (state.status === 'not_found') {
    return (
      <Screen scroll={false}>
        <EmptyState
          title="Submission not found"
          message="This submission is not saved on this device."
          actionLabel="Back to survey"
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </Screen>
    );
  }

  const { survey, submission } = state;
  return (
    <Screen>
      <Card>
        <StatusBadge status="submitted" />
        <AppText variant="heading">{survey.title}</AppText>
        <AppText tone="muted">Submitted {formatDateTime(submission.createdAt)}</AppText>
        <AppText variant="caption" tone="muted" selectable>
          Reference: {submission.id}
        </AppText>
      </Card>
      <Card>
        <AnswerSummary survey={survey} submission={submission} />
      </Card>
    </Screen>
  );
}
