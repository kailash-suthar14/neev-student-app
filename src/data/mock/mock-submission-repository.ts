import { delay } from '@/core/runtime';
import type { LocalSubmissionStore } from '@/data/local/local-submission-store';
import type { SubmissionRepository } from '@/data/repositories';
import type { SurveySubmission } from '@/features/surveys/models';

/** Offline submission repository backed entirely by device storage. */
export class MockSubmissionRepository implements SubmissionRepository {
  constructor(
    private readonly store: LocalSubmissionStore,
    private readonly latencyMs = 0,
  ) {}

  async create(submission: SurveySubmission): Promise<SurveySubmission> {
    await delay(this.latencyMs);
    return this.store.save(submission);
  }

  getById(submissionId: string): Promise<SurveySubmission | null> {
    return this.store.getById(submissionId);
  }

  listBySurvey(surveyId: string): Promise<SurveySubmission[]> {
    return this.store.listBySurvey(surveyId);
  }
}
