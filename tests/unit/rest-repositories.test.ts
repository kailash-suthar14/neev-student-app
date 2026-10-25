import { ApiClient } from '@/data/remote/api-client';
import { RestAuthRepository } from '@/data/remote/rest-auth-repository';
import { RestSubmissionRepository } from '@/data/remote/rest-submission-repository';
import { RestSurveyRepository } from '@/data/remote/rest-survey-repository';
import { InMemoryTokenStore } from '@/data/remote/token-store';
import { LEARNING_EXPERIENCE_SURVEY as survey } from '@/data/mock/seed-surveys';
import { toSurveySummary } from '@/features/surveys/models';

import { fixedClock, makeSubmission } from '../helpers/fixtures';
import { createMockFetch, jsonResponse } from '../helpers/http';

type Responders = Parameters<typeof createMockFetch>;

function setup(...responders: Responders) {
  const { fetchFn, requests } = createMockFetch(...responders);
  const tokens = new InMemoryTokenStore();
  const client = new ApiClient({
    baseUrl: 'https://api.test',
    timeoutMs: 1000,
    fetchFn,
    getAccessToken: () => tokens.get(),
    onUnauthorized: () => tokens.clear(),
  });
  return { client, tokens, requests, fetchFn };
}

const loginOk = () =>
  jsonResponse(200, {
    data: {
      user: { id: 'u1', email: 'a@b.com', displayName: 'A' },
      accessToken: 'tok_123',
      expiresAt: '2026-02-01T00:00:00.000Z',
    },
  });

describe('RestAuthRepository', () => {
  it('logs in, keeps the token in memory and returns a session', async () => {
    const { client, tokens, requests } = setup(loginOk);
    const repo = new RestAuthRepository(client, tokens, fixedClock());

    const session = await repo.login({ email: 'a@b.com', password: 'pw' });

    expect(requests[0]).toMatchObject({ url: 'https://api.test/auth/login', method: 'POST' });
    expect(requests[0].headers.Authorization).toBeUndefined();
    expect(session).toMatchObject({ mode: 'rest', user: { id: 'u1' } });
    expect(tokens.get()).toBe('tok_123');
    await expect(repo.getCurrentSession()).resolves.toEqual(session);
  });

  it('maps a 401 from login to invalid_credentials', async () => {
    const { client, tokens } = setup(() => jsonResponse(401));
    await expect(
      new RestAuthRepository(client, tokens).login({ email: 'a@b.com', password: 'x' }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('clears local credentials on logout even if the server call fails', async () => {
    const { client, tokens } = setup(loginOk, () => {
      throw new TypeError('offline');
    });
    const repo = new RestAuthRepository(client, tokens, fixedClock());
    await repo.login({ email: 'a@b.com', password: 'pw' });
    await expect(repo.logout()).resolves.toBeUndefined();
    expect(tokens.get()).toBeNull();
    await expect(repo.getCurrentSession()).resolves.toBeNull();
  });

  it('sends the bearer token on logout', async () => {
    const { client, tokens, requests } = setup(loginOk, () => new Response(null, { status: 204 }));
    const repo = new RestAuthRepository(client, tokens, fixedClock());
    await repo.login({ email: 'a@b.com', password: 'pw' });
    await repo.logout();
    expect(requests[1]).toMatchObject({
      url: 'https://api.test/auth/logout',
      headers: { Authorization: 'Bearer tok_123' },
    });
  });
});

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
