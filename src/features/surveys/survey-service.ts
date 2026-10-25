import { AppError } from '@/core/errors';
import { createId, systemClock, type Clock, type IdGenerator } from '@/core/runtime';
import type { DraftRepository, SubmissionRepository, SurveyRepository } from '@/data/repositories';

import type { FormValues, Survey, SurveySubmission } from './models';
import { validateAnswers } from './validation';

/**
 * Identity of one submission attempt. Retrying an unchanged form must reuse
 * the same attempt so the request is byte-identical and the backend (or the
 * local store) can de-duplicate it via the idempotency key.
 */
export interface SubmissionAttempt {
  id: string;
  createdAt: string;
}

export interface SubmitSurveyInput {
  survey: Survey;
  values: FormValues;
  respondentId: string | null;
  /** Reuse across retries of an unchanged form; a fresh attempt is created when omitted. */
  attempt?: SubmissionAttempt;
}

export interface SurveyServiceDeps {
  surveys: SurveyRepository;
  submissions: SubmissionRepository;
  drafts: DraftRepository;
  clock?: Clock;
  createId?: IdGenerator;
}

export class SurveyService {
  private readonly clock: Clock;
  private readonly createId: IdGenerator;
  /** One in-flight submission per survey; concurrent calls share its result. */
  private readonly inFlight = new Map<string, Promise<SurveySubmission>>();

  constructor(private readonly deps: SurveyServiceDeps) {
    this.clock = deps.clock ?? systemClock;
    this.createId = deps.createId ?? createId;
  }

  /** Starts a new submission attempt using the injected clock and ID generator. */
  beginAttempt(): SubmissionAttempt {
    return { id: this.createId('sub'), createdAt: this.clock.now().toISOString() };
  }

  /** The survey shown on the landing screen, or null when none are available. */
  async getFeaturedSurvey(): Promise<Survey | null> {
    const summaries = await this.deps.surveys.listSurveys();
    const first = summaries[0];
    return first ? this.deps.surveys.getSurvey(first.id) : null;
  }

  getSurvey(surveyId: string): Promise<Survey> {
    return this.deps.surveys.getSurvey(surveyId);
  }

  /** Newest first. Pass a respondent to see only that user's submissions on a shared device. */
  async listSubmissions(surveyId: string, respondentId?: string | null): Promise<SurveySubmission[]> {
    const all = await this.deps.submissions.listBySurvey(surveyId);
    return respondentId === undefined ? all : all.filter((s) => s.respondentId === respondentId);
  }

  getSubmission(submissionId: string): Promise<SurveySubmission | null> {
    return this.deps.submissions.getById(submissionId);
  }

  /** Restores this user's draft answers if they match the current survey version. */
  async loadDraft(survey: Survey, respondentId: string | null): Promise<FormValues | null> {
    const draft = await this.deps.drafts.get(survey.id, respondentId);
    if (!draft) return null;
    if (draft.surveyVersion !== survey.version) {
      await this.deps.drafts.remove(survey.id, respondentId);
      return null;
    }
    return draft.values;
  }

  async saveDraft(survey: Survey, respondentId: string | null, values: FormValues): Promise<void> {
    const clean: Record<string, string | string[] | number> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) clean[key] = value;
    }
    await this.deps.drafts.save({
      surveyId: survey.id,
      surveyVersion: survey.version,
      respondentId,
      values: clean,
      updatedAt: this.clock.now().toISOString(),
    });
  }

  /**
   * Validates, persists and returns the submission. Resolves only after the
   * repository confirms persistence; rejects with a `validation` AppError
   * (with per-question `fieldErrors`) or the repository's error otherwise.
   */
  submit(input: SubmitSurveyInput): Promise<SurveySubmission> {
    const pending = this.inFlight.get(input.survey.id);
    if (pending) return pending;

    const run = this.performSubmit(input).finally(() => {
      this.inFlight.delete(input.survey.id);
    });
    this.inFlight.set(input.survey.id, run);
    return run;
  }

  private async performSubmit(input: SubmitSurveyInput): Promise<SurveySubmission> {
    const result = validateAnswers(input.survey, input.values);
    if (!result.valid) {
      throw new AppError('validation', 'Survey answers are invalid.', { fieldErrors: result.errors });
    }

    const attempt = input.attempt ?? this.beginAttempt();
    const saved = await this.deps.submissions.create({
      id: attempt.id,
      surveyId: input.survey.id,
      surveyVersion: input.survey.version,
      respondentId: input.respondentId,
      answers: result.answers,
      status: 'submitted',
      createdAt: attempt.createdAt,
      updatedAt: attempt.createdAt,
    });

    // The submission is already durable; a failure to clear the draft must not
    // turn a successful submission into an error.
    try {
      await this.deps.drafts.remove(input.survey.id, input.respondentId);
    } catch {
      // Stale draft is harmless; it will be overwritten on the next edit.
    }
    return saved;
  }
}
