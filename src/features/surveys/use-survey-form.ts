import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppServices } from '@/config/app-services';
import { getUserMessage, toAppError, type AppError } from '@/core/errors';

import type { AnswerInput, FormValues, Survey, SurveySubmission } from './models';
import type { SubmissionAttempt } from './survey-service';
import { getProgress, validateAnswers, type QuestionErrors } from './validation';

const DRAFT_SAVE_DELAY_MS = 600;

export type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; survey: Survey };

export type SubmitResult =
  | { ok: true; submission: SurveySubmission }
  | { ok: false; firstInvalidQuestionId?: string };

export interface UseSurveyFormOptions {
  respondentId: string | null;
  onUnauthorized?: () => void;
}

/**
 * State and actions for the survey landing screen. All persistence goes
 * through SurveyService; the screen only renders what this hook returns.
 */
export function useSurveyForm({ respondentId, onUnauthorized }: UseSurveyFormOptions) {
  const { surveys } = useAppServices();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<QuestionErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draftWarning, setDraftWarning] = useState(false);
  const [latestSubmission, setLatestSubmission] = useState<SurveySubmission | null>(null);
  const [justSubmitted, setJustSubmitted] = useState<SurveySubmission | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const inFlight = useRef(false);
  /** Reused for retries of an unchanged form (idempotency key + timestamp). */
  const attempt = useRef<SubmissionAttempt | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftWrite = useRef<Promise<void>>(Promise.resolve());
  /** The not-yet-written draft, so it can be flushed on unmount. */
  const pendingDraft = useRef<(() => Promise<void>) | null>(null);

  const handleError = useCallback(
    (error: AppError) => {
      if (error.code === 'unauthorized') onUnauthorized?.();
    },
    [onUnauthorized],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const survey = await surveys.getFeaturedSurvey();
        if (!active) return;
        if (!survey) {
          setLoad({ status: 'empty' });
          return;
        }
        const [submissions, draft] = await Promise.all([
          surveys.listSubmissions(survey.id, respondentId),
          // A draft is a convenience: if it cannot be read, start blank.
          surveys.loadDraft(survey, respondentId).catch(() => null),
        ]);
        if (!active) return;
        setLatestSubmission(submissions[0] ?? null);
        setValues(draft ?? {});
        setLoad({ status: 'ready', survey });
      } catch (raw) {
        if (!active) return;
        const error = toAppError(raw);
        handleError(error);
        setLoad({ status: 'error', message: getUserMessage(error) });
      }
    })();
    return () => {
      active = false;
    };
  }, [surveys, respondentId, reloadKey, handleError]);

  // On unmount (e.g. sign-out), write any debounced draft instead of dropping it.
  useEffect(
    () => () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      const pending = pendingDraft.current;
      pendingDraft.current = null;
      pending?.().catch(() => undefined);
    },
    [],
  );

  const survey = load.status === 'ready' ? load.survey : null;

  const scheduleDraftSave = useCallback(
    (next: FormValues) => {
      if (!survey) return;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      const write = () => surveys.saveDraft(survey, respondentId, next);
      pendingDraft.current = write;
      draftTimer.current = setTimeout(() => {
        draftTimer.current = null;
        pendingDraft.current = null;
        draftWrite.current = draftWrite.current.then(write).then(
          () => setDraftWarning(false),
          () => setDraftWarning(true),
        );
      }, DRAFT_SAVE_DELAY_MS);
    },
    [survey, surveys, respondentId],
  );

  const setAnswer = useCallback(
    (questionId: string, value: AnswerInput | undefined) => {
      if (inFlight.current) return;
      attempt.current = null;
      setSubmitError(null);
      setErrors((current) => {
        if (!(questionId in current)) return current;
        const { [questionId]: _cleared, ...rest } = current;
        return rest;
      });
      const next = { ...values, [questionId]: value };
      setValues(next);
      scheduleDraftSave(next);
    },
    [values, scheduleDraftSave],
  );

  const submit = useCallback(async (): Promise<SubmitResult> => {
    if (!survey || inFlight.current) return { ok: false };

    const local = validateAnswers(survey, values);
    if (!local.valid) {
      setErrors(local.errors);
      setSubmitError(null);
      return { ok: false, firstInvalidQuestionId: local.firstInvalidQuestionId };
    }

    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    attempt.current ??= surveys.beginAttempt();
    // Make sure no pending draft write lands after the submission clears it.
    const hadPendingDraft = pendingDraft.current !== null;
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
    pendingDraft.current = null;
    try {
      await draftWrite.current;

      const submission = await surveys.submit({
        survey,
        values,
        respondentId,
        attempt: attempt.current,
      });
      attempt.current = null;
      setLatestSubmission(submission);
      setJustSubmitted(submission);
      setValues({});
      setErrors({});
      setDraftWarning(false);
      return { ok: true, submission };
    } catch (raw) {
      const error = toAppError(raw);
      handleError(error);
      // The submission did not happen, so keep the latest answers as a draft.
      if (hadPendingDraft) scheduleDraftSave(values);
      if (error.code === 'validation' && error.fieldErrors) {
        setErrors(error.fieldErrors);
        const first = survey.questions.find((q) => error.fieldErrors?.[q.id]);
        setSubmitError('Some answers were not accepted. Please review the highlighted questions.');
        return { ok: false, firstInvalidQuestionId: first?.id };
      }
      // Answers stay in `values` so the user can retry.
      setSubmitError(getUserMessage(error));
      return { ok: false };
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [survey, values, surveys, respondentId, handleError, scheduleDraftSave]);

  const startNewResponse = useCallback(() => setJustSubmitted(null), []);
  const reload = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((n) => n + 1);
  }, []);

  const progress = survey ? getProgress(survey, values) : null;
  const hasDraft = progress !== null && progress.answered > 0;
  const status = latestSubmission ? 'submitted' : hasDraft ? 'in_progress' : 'not_started';

  return {
    load,
    values,
    errors,
    progress,
    status,
    submitting,
    submitError,
    draftWarning,
    latestSubmission,
    justSubmitted,
    setAnswer,
    submit,
    startNewResponse,
    reload,
  } as const;
}
