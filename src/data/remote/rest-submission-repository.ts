import { AppError, isAppError } from '@/core/errors';
import type { SubmissionRepository } from '@/data/repositories';
import type { SurveySubmission } from '@/features/surveys/models';

import type { ApiClient } from './api-client';
import {
  submissionListResponseDtoSchema,
  submissionResponseDtoSchema,
  type CreateSubmissionRequestDto,
} from './api-types';

/**
 * PLACEHOLDER REST submission repository.
 *
 * `create` resolves only when the server returns 2xx with the stored
 * submission. Any rejection propagates; there is no silent local fallback.
 * The submission ID is sent as the `Idempotency-Key` header so retries of
 * the same attempt cannot create duplicates server-side.
 */
export class RestSubmissionRepository implements SubmissionRepository {
  constructor(private readonly client: ApiClient) {}

  async create(submission: SurveySubmission): Promise<SurveySubmission> {
    const body: CreateSubmissionRequestDto = {
      id: submission.id,
      surveyVersion: submission.surveyVersion,
      respondentId: submission.respondentId,
      answers: submission.answers,
      createdAt: submission.createdAt,
    };
    const { data } = await this.client.request({
      method: 'POST',
      path: `/surveys/${encodeURIComponent(submission.surveyId)}/submissions`,
      body,
      headers: { 'Idempotency-Key': submission.id },
      schema: submissionResponseDtoSchema,
    });
    if (data.id !== submission.id || data.surveyId !== submission.surveyId) {
      throw new AppError('invalid_response', 'Server returned a different submission than was sent.');
    }
    return data;
  }

  async getById(submissionId: string): Promise<SurveySubmission | null> {
    try {
      const { data } = await this.client.request({
        method: 'GET',
        path: `/submissions/${encodeURIComponent(submissionId)}`,
        schema: submissionResponseDtoSchema,
      });
      return data;
    } catch (error) {
      if (isAppError(error) && error.code === 'not_found') return null;
      throw error;
    }
  }

  async listBySurvey(surveyId: string): Promise<SurveySubmission[]> {
    const { data } = await this.client.request({
      method: 'GET',
      path: `/surveys/${encodeURIComponent(surveyId)}/submissions`,
      schema: submissionListResponseDtoSchema,
    });
    return [...data].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
}
