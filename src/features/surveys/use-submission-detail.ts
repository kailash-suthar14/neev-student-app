import { useCallback, useEffect, useState } from 'react';

import { useAppServices } from '@/config/app-services';
import { getUserMessage, toAppError } from '@/core/errors';

import type { Survey, SurveySubmission } from './models';

export type SubmissionDetailState =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; survey: Survey; submission: SurveySubmission };

export function useSubmissionDetail(
  submissionId: string | undefined,
  respondentId: string | null,
  onUnauthorized?: () => void,
) {
  const { surveys } = useAppServices();
  const [state, setState] = useState<SubmissionDetailState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const submission = submissionId ? await surveys.getSubmission(submissionId) : null;
        // Do not reveal another user's submission on a shared device.
        if (!submission || submission.respondentId !== respondentId) {
          if (active) setState({ status: 'not_found' });
          return;
        }
        const survey = await surveys.getSurvey(submission.surveyId);
        if (active) setState({ status: 'ready', survey, submission });
      } catch (raw) {
        if (!active) return;
        const error = toAppError(raw);
        if (error.code === 'unauthorized') onUnauthorized?.();
        setState({ status: 'error', message: getUserMessage(error) });
      }
    })();
    return () => {
      active = false;
    };
  }, [surveys, submissionId, respondentId, reloadKey, onUnauthorized]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((n) => n + 1);
  }, []);
  return { state, reload };
}
