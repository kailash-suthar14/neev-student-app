import { AppError } from '@/core/errors';
import { delay } from '@/core/runtime';
import type { SurveyRepository } from '@/data/repositories';
import {
  surveySchema,
  toSurveySummary,
  type Survey,
  type SurveySummary,
} from '@/features/surveys/models';

import { SEED_SURVEYS } from './seed-surveys';

/** Serves seed surveys from memory. Seed data is schema-checked so typos fail loudly. */
export class MockSurveyRepository implements SurveyRepository {
  private readonly surveys: Survey[];

  constructor(
    surveys: readonly Survey[] = SEED_SURVEYS,
    private readonly latencyMs = 0,
  ) {
    this.surveys = surveys.map((s) => surveySchema.parse(s));
  }

  async listSurveys(): Promise<SurveySummary[]> {
    await delay(this.latencyMs);
    return this.surveys.map(toSurveySummary);
  }

  async getSurvey(surveyId: string): Promise<Survey> {
    await delay(this.latencyMs);
    const survey = this.surveys.find((s) => s.id === surveyId);
    if (!survey) throw new AppError('not_found', `Survey "${surveyId}" not found.`);
    // Parsing returns a fresh copy, so callers cannot mutate the seed data.
    return surveySchema.parse(survey);
  }
}
