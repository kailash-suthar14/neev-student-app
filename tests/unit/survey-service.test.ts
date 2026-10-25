import { AppError } from '@/core/errors';
import { InMemoryStorage } from '@/data/local/key-value-storage';
import { LocalDraftRepository } from '@/data/local/local-draft-repository';
import { LocalSubmissionStore } from '@/data/local/local-submission-store';
import { MockSubmissionRepository } from '@/data/mock/mock-submission-repository';
import { MockSurveyRepository } from '@/data/mock/mock-survey-repository';
import { LEARNING_EXPERIENCE_SURVEY as survey } from '@/data/mock/seed-surveys';
import type { SubmissionRepository } from '@/data/repositories';
import { SurveyService } from '@/features/surveys/survey-service';

import { FailingStorage, fixedClock, sequentialIds, VALID_SEED_VALUES } from '../helpers/fixtures';

function setup(options: { storage?: InMemoryStorage | FailingStorage; submissions?: SubmissionRepository } = {}) {
  const storage = options.storage ?? new InMemoryStorage();
  const submissions =
    options.submissions ?? new MockSubmissionRepository(new LocalSubmissionStore(storage));
  const drafts = new LocalDraftRepository(storage);
  const service = new SurveyService({
    surveys: new MockSurveyRepository(),
    submissions,
    drafts,
    clock: fixedClock(),
    createId: sequentialIds(),
  });
  return { service, storage, submissions, drafts };
}

describe('SurveyService', () => {
  it('loads the featured survey', async () => {
    const { service } = setup();
    const loaded = await service.getFeaturedSurvey();
    expect(loaded?.id).toBe(survey.id);
    expect(loaded?.questions).toHaveLength(7);
  });

  it('returns null when there are no surveys', async () => {
    const service = new SurveyService({
      surveys: new MockSurveyRepository([]),
      submissions: setup().submissions,
      drafts: new LocalDraftRepository(new InMemoryStorage()),
    });
    await expect(service.getFeaturedSurvey()).resolves.toBeNull();
  });

  it('rejects unknown surveys with not_found', async () => {
    await expect(setup().service.getSurvey('nope')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects invalid answers with per-question errors and saves nothing', async () => {
    const { service } = setup();
    const error = await service
      .submit({ survey, values: { q_course_level: 'advanced' }, respondentId: 'user_demo' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('validation');
    expect((error as AppError).fieldErrors).toHaveProperty('q_study_hours');
    expect(await service.listSubmissions(survey.id)).toEqual([]);
  });

  it('persists a valid submission and returns it only after it is stored', async () => {
    const { service } = setup();
    const saved = await service.submit({ survey, values: VALID_SEED_VALUES, respondentId: 'user_demo' });
    expect(saved).toMatchObject({
      id: 'sub_1',
      surveyId: survey.id,
      surveyVersion: 1,
      respondentId: 'user_demo',
      status: 'submitted',
      createdAt: '2026-01-15T10:00:00.000Z',
    });
    expect(await service.getSubmission('sub_1')).toEqual(saved);
  });

  it('collapses concurrent submits for the same survey into one submission', async () => {
    const { service } = setup();
    const input = { survey, values: VALID_SEED_VALUES, respondentId: 'user_demo' };
    const [a, b, c] = await Promise.all([service.submit(input), service.submit(input), service.submit(input)]);
    expect(a.id).toBe(b.id);
    expect(b.id).toBe(c.id);
    expect(await service.listSubmissions(survey.id)).toHaveLength(1);
  });

  it('allows a new submission once the previous one has finished', async () => {
    const { service } = setup();
    const input = { survey, values: VALID_SEED_VALUES, respondentId: null };
    await service.submit(input);
    await service.submit(input);
    expect(await service.listSubmissions(survey.id)).toHaveLength(2);
  });

  it('propagates storage failures and keeps the draft for retry', async () => {
    const storage = new FailingStorage();
    const { service } = setup({ storage });
    await service.saveDraft(survey, 'user_demo', VALID_SEED_VALUES);
    storage.failWrites = true;
    await expect(
      service.submit({ survey, values: VALID_SEED_VALUES, respondentId: null }),
    ).rejects.toThrow();
    storage.failWrites = false;
    expect(await service.listSubmissions(survey.id)).toEqual([]);
    expect(await service.loadDraft(survey, 'user_demo')).toEqual(VALID_SEED_VALUES);
  });

  it('clears the draft after a successful submission', async () => {
    const { service } = setup();
    await service.saveDraft(survey, 'user_demo', VALID_SEED_VALUES);
    await service.submit({ survey, values: VALID_SEED_VALUES, respondentId: 'user_demo' });
    expect(await service.loadDraft(survey, 'user_demo')).toBeNull();
  });

  it('still reports success if clearing the draft fails after the submission is stored', async () => {
    const { service, drafts } = setup();
    jest.spyOn(drafts, 'remove').mockRejectedValueOnce(new Error('boom'));
    await expect(
      service.submit({ survey, values: VALID_SEED_VALUES, respondentId: null }),
    ).resolves.toMatchObject({ status: 'submitted' });
  });

  it('discards drafts saved for a different survey version', async () => {
    const { service, drafts } = setup();
    await drafts.save({
      surveyId: survey.id,
      surveyVersion: 99,
      respondentId: 'user_demo',
      values: { q_course_level: 'advanced' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await expect(service.loadDraft(survey, 'user_demo')).resolves.toBeNull();
  });

  it("does not restore another user's draft", async () => {
    const { service } = setup();
    await service.saveDraft(survey, 'user_a', VALID_SEED_VALUES);
    await expect(service.loadDraft(survey, 'user_b')).resolves.toBeNull();
  });

  it('filters submissions by respondent when asked', async () => {
    const { service } = setup();
    await service.submit({ survey, values: VALID_SEED_VALUES, respondentId: 'user_a' });
    await service.submit({ survey, values: VALID_SEED_VALUES, respondentId: 'user_b' });
    expect(await service.listSubmissions(survey.id)).toHaveLength(2);
    expect((await service.listSubmissions(survey.id, 'user_a')).map((s) => s.respondentId)).toEqual(['user_a']);
  });

  it('makes a retry of the same attempt identical, so it de-duplicates even as time passes', async () => {
    const clock = fixedClock();
    const storage = new InMemoryStorage();
    const store = new LocalSubmissionStore(storage);
    const service = new SurveyService({
      surveys: new MockSurveyRepository(),
      submissions: new MockSubmissionRepository(store),
      drafts: new LocalDraftRepository(storage),
      clock,
      createId: sequentialIds(),
    });
    const attempt = service.beginAttempt();
    const input = { survey, values: VALID_SEED_VALUES, respondentId: 'user_demo', attempt };

    const first = await service.submit(input);
    clock.advance(60_000);
    // e.g. the first response was lost (timeout) and the user taps Submit again.
    const retry = await service.submit(input);

    expect(retry).toEqual(first);
    expect(first).toMatchObject({ id: attempt.id, createdAt: attempt.createdAt, updatedAt: attempt.createdAt });
    expect(await service.listSubmissions(survey.id)).toHaveLength(1);
  });

  it("does not delete another user's draft when a different user loads the survey", async () => {
    const { service } = setup();
    await service.saveDraft(survey, 'user_a', VALID_SEED_VALUES);
    await expect(service.loadDraft(survey, 'user_b')).resolves.toBeNull();
    await expect(service.loadDraft(survey, 'user_a')).resolves.toEqual(VALID_SEED_VALUES);
  });
});
