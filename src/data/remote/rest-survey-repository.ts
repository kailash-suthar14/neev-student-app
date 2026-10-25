import type { SurveyRepository } from '@/data/repositories';
import type { Survey, SurveySummary } from '@/features/surveys/models';

import type { ApiClient } from './api-client';
import { surveyListResponseDtoSchema, surveyResponseDtoSchema } from './api-types';

/** PLACEHOLDER REST survey repository for `GET /surveys` and `GET /surveys/:surveyId`. */
export class RestSurveyRepository implements SurveyRepository {
  constructor(private readonly client: ApiClient) {}

  async listSurveys(): Promise<SurveySummary[]> {
    const { data } = await this.client.request({
      method: 'GET',
      path: '/surveys',
      schema: surveyListResponseDtoSchema,
    });
    return data;
  }

  async getSurvey(surveyId: string): Promise<Survey> {
    const { data } = await this.client.request({
      method: 'GET',
      path: `/surveys/${encodeURIComponent(surveyId)}`,
      schema: surveyResponseDtoSchema,
    });
    return data;
  }
}
