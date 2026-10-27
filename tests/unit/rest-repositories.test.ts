import { ApiClient } from '@/data/remote/api-client';
import { RestAccountRepository } from '@/data/remote/rest-account-repository';
import { RestSubmissionRepository } from '@/data/remote/rest-submission-repository';
import { RestSurveyRepository } from '@/data/remote/rest-survey-repository';
import { LEARNING_EXPERIENCE_SURVEY as survey } from '@/data/mock/seed-surveys';
import { toSurveySummary } from '@/features/surveys/models';

import { makeSubmission } from '../helpers/fixtures';
import { createMockFetch, jsonResponse } from '../helpers/http';

type Responders = Parameters<typeof createMockFetch>;

function setup(...responders: Responders) {
  const { fetchFn, requests } = createMockFetch(...responders);
  const client = new ApiClient({ baseUrl: 'https://api.test', timeoutMs: 1000, fetchFn });
  return { client, requests, fetchFn };
}

describe('RestSurveyRepository', () => {
  it('lists surveys and fetches one by encoded id', async () => {
    const { client, requests } = setup(
      () => jsonResponse(200, { data: [toSurveySummary(survey)] }),
      () => jsonResponse(200, { data: survey }),
    );
    const repo = new RestSurveyRepository(client);
    await expect(repo.listSurveys()).resolves.toEqual([toSurveySummary(survey)]);
    await expect(repo.getSurvey('a/b')).resolves.toEqual(survey);
    expect(requests[1].url).toBe('https://api.test/surveys/a%2Fb');
  });

  it('rejects malformed surveys from the server', async () => {
    const { client } = setup(() => jsonResponse(200, { data: { ...survey, questions: [] } }));
    await expect(new RestSurveyRepository(client).getSurvey(survey.id)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});

describe('RestSubmissionRepository', () => {
  const submission = makeSubmission();

  it('posts the submission with an idempotency key', async () => {
    const { client, requests } = setup(() => jsonResponse(201, { data: submission }));
    await expect(new RestSubmissionRepository(client).create(submission)).resolves.toEqual(submission);
    expect(requests[0]).toEqual({
      url: `https://api.test/surveys/${submission.surveyId}/submissions`,
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Idempotency-Key': submission.id,
      },
      body: {
        id: submission.id,
        surveyVersion: submission.surveyVersion,
        respondentId: submission.respondentId,
        answers: submission.answers,
        createdAt: submission.createdAt,
      },
    });
  });

  it('propagates server rejections instead of falling back to local success', async () => {
    const { client } = setup(() =>
      jsonResponse(422, { error: { code: 'invalid', message: 'x', details: { q1: 'Bad' } } }),
    );
    await expect(new RestSubmissionRepository(client).create(submission)).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { q1: 'Bad' },
    });
  });

  it('propagates network failures', async () => {
    const { client } = setup(() => {
      throw new TypeError('Network request failed');
    });
    await expect(new RestSubmissionRepository(client).create(submission)).rejects.toMatchObject({
      code: 'network',
    });
  });

  it('rejects a response describing a different submission', async () => {
    const { client } = setup(() => jsonResponse(201, { data: { ...submission, id: 'other' } }));
    await expect(new RestSubmissionRepository(client).create(submission)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('returns null for a missing submission and newest-first lists', async () => {
    const older = makeSubmission({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeSubmission({ id: 'b', createdAt: '2026-01-02T00:00:00.000Z' });
    const { client, requests } = setup(
      () => jsonResponse(404, { error: { code: 'not_found', message: 'x' } }),
      () => jsonResponse(200, { data: [older, newer] }),
    );
    const repo = new RestSubmissionRepository(client);
    await expect(repo.getById('nope')).resolves.toBeNull();
    expect(requests[0].url).toBe('https://api.test/submissions/nope');
    expect((await repo.listBySurvey(submission.surveyId)).map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('does not swallow non-404 errors when fetching by id', async () => {
    const { client } = setup(() => jsonResponse(500));
    await expect(new RestSubmissionRepository(client).getById('x')).rejects.toMatchObject({
      code: 'server',
    });
  });
});

describe('RestAccountRepository', () => {
  it('loads /api/accountInfo with the session token and maps missing fields', async () => {
    const { fetchFn, requests } = createMockFetch(() =>
      jsonResponse(200, {
        username: 'asha01',
        name: 'Asha',
        email: 'asha@example.com',
        tokenExpiry: null,
        attributes: null,
        roles: ['student'],
        authorities: ['VIEW_COURSES', 'TAKE_TESTS'],
        isActive: true,
      }),
    );
    const client = new ApiClient({
      baseUrl: 'https://api.test',
      timeoutMs: 1000,
      fetchFn,
      getAccessToken: () => 'session-1',
    });

    await expect(new RestAccountRepository(client).getAccountInfo()).resolves.toEqual({
      username: 'asha01',
      name: 'Asha',
      email: 'asha@example.com',
      roles: ['student'],
      authorities: ['VIEW_COURSES', 'TAKE_TESTS'],
      isActive: true,
    });
    expect(requests[0].url).toBe('https://api.test/api/accountInfo');
    expect(requests[0].headers['X-Auth-Token']).toBe('session-1');
  });

  it('defaults absent fields instead of failing', async () => {
    const { client } = setup(() => jsonResponse(200, { email: 'asha@example.com' }));
    await expect(new RestAccountRepository(client).getAccountInfo()).resolves.toEqual({
      username: null,
      name: null,
      email: 'asha@example.com',
      roles: [],
      authorities: [],
      isActive: null,
    });
  });
});
