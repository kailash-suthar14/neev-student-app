import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import { createAsyncStorageAdapter, InMemoryStorage } from '@/data/local/key-value-storage';
import { LocalDraftRepository } from '@/data/local/local-draft-repository';
import { LocalSubmissionStore } from '@/data/local/local-submission-store';
import { StorageKeys } from '@/data/local/storage-keys';
import { VersionedJsonStore } from '@/data/local/versioned-json-store';

import { FailingStorage, fixedClock, makeSubmission } from '../helpers/fixtures';

describe('createAsyncStorageAdapter', () => {
  beforeEach(() => AsyncStorage.clear());

  it('round-trips values through AsyncStorage', async () => {
    const storage = createAsyncStorageAdapter();
    await storage.setItem('k', 'v');
    expect(await storage.getItem('k')).toBe('v');
    await storage.removeItem('k');
    expect(await storage.getItem('k')).toBeNull();
  });

  it('wraps native failures in a storage AppError', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('quota'));
    await expect(createAsyncStorageAdapter().setItem('k', 'v')).rejects.toMatchObject({ code: 'storage' });
  });
});

describe('VersionedJsonStore', () => {
  const schema = z.object({ n: z.number() });

  it.each([
    ['missing', null, { kind: 'missing' }],
    ['malformed JSON', '{oops', { kind: 'corrupt', reason: 'malformed_json' }],
    ['no envelope', '{"n":1}', { kind: 'corrupt', reason: 'invalid_shape' }],
    ['future version', '{"schemaVersion":99,"data":{"n":1}}', { kind: 'corrupt', reason: 'unsupported_version' }],
    ['wrong data shape', '{"schemaVersion":1,"data":{"n":"x"}}', { kind: 'corrupt', reason: 'invalid_shape' }],
    ['valid', '{"schemaVersion":1,"data":{"n":1}}', { kind: 'ok', value: { n: 1 } }],
  ])('reads %s data safely', async (_label, raw, expected) => {
    const storage = new InMemoryStorage(raw === null ? {} : { key: raw });
    await expect(new VersionedJsonStore(storage, 'key', schema).read()).resolves.toEqual(expected);
  });

  it('never overwrites an earlier quarantined copy from the same instant', async () => {
    const storage = new InMemoryStorage({ key: 'first' });
    const store = new VersionedJsonStore(storage, 'key', schema, fixedClock());
    const firstKey = await store.quarantine();
    await storage.setItem('key', 'second');
    const secondKey = await store.quarantine();
    expect(secondKey).not.toBe(firstKey);
    expect(await storage.getItem(firstKey ?? '')).toBe('first');
    expect(await storage.getItem(secondKey ?? '')).toBe('second');
  });

  it('refuses to write data that fails its schema', async () => {
    const store = new VersionedJsonStore(new InMemoryStorage(), 'key', schema);
    await expect(store.write({ n: 'x' } as never)).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('LocalSubmissionStore', () => {
  it('saves, retrieves, lists newest-first, updates and deletes', async () => {
    const clock = fixedClock();
    const store = new LocalSubmissionStore(new InMemoryStorage(), { clock });
    const older = makeSubmission({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeSubmission({ id: 'b', createdAt: '2026-01-02T00:00:00.000Z' });

    await store.save(older);
    await store.save(newer);
    expect((await store.list()).map((s) => s.id)).toEqual(['b', 'a']);
    expect(await store.getById('a')).toEqual(older);
    expect(await store.getById('missing')).toBeNull();

    clock.advance(1000);
    const updated = await store.update({ ...older, answers: [] });
    expect(updated.answers).toEqual([]);
    expect(updated.createdAt).toBe(older.createdAt);
    expect(updated.updatedAt).toBe('2026-01-15T10:00:01.000Z');

    expect(await store.delete('a')).toBe(true);
    expect(await store.delete('a')).toBe(false);
    expect((await store.list()).map((s) => s.id)).toEqual(['b']);
  });

  it('survives an app restart (new instance, same storage)', async () => {
    const storage = new InMemoryStorage();
    await new LocalSubmissionStore(storage).save(makeSubmission());
    expect(await new LocalSubmissionStore(storage).getById('sub_1')).toEqual(makeSubmission());
  });

  it('stores versioned JSON under the namespaced key', async () => {
    const storage = new InMemoryStorage();
    await new LocalSubmissionStore(storage).save(makeSubmission());
    const raw = JSON.parse((await storage.getItem('survey-app:v1:submissions')) ?? 'null');
    expect(raw).toEqual({ schemaVersion: 1, data: [makeSubmission()] });
  });

  it('treats re-saving an identical record as idempotent and a different one as a conflict', async () => {
    const store = new LocalSubmissionStore(new InMemoryStorage());
    await store.save(makeSubmission());
    await expect(store.save(makeSubmission())).resolves.toEqual(makeSubmission());
    await expect(store.save(makeSubmission({ answers: [] }))).rejects.toMatchObject({ code: 'conflict' });
    expect(await store.list()).toHaveLength(1);
  });

  it('serialises concurrent saves so none are lost', async () => {
    const store = new LocalSubmissionStore(new InMemoryStorage());
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => store.save(makeSubmission({ id: `s${i}` }))),
    );
    expect(await store.list()).toHaveLength(5);
  });

  it('quarantines malformed JSON instead of overwriting it', async () => {
    const onDataIssue = jest.fn();
    const storage = new InMemoryStorage({ [StorageKeys.submissions]: '{broken' });
    const store = new LocalSubmissionStore(storage, { clock: fixedClock(), onDataIssue });

    expect(await store.list()).toEqual([]);
    expect(onDataIssue).toHaveBeenCalledWith({ key: StorageKeys.submissions, reason: 'malformed_json' });
    const backupKey = `${StorageKeys.submissions}:quarantine:${fixedClock().now().getTime()}`;
    expect(await storage.getItem(backupKey)).toBe('{broken');

    await store.save(makeSubmission());
    expect(await store.list()).toHaveLength(1);
  });

  it('quarantines data from an unsupported schema version', async () => {
    const raw = JSON.stringify({ schemaVersion: 2, data: [] });
    const storage = new InMemoryStorage({ [StorageKeys.submissions]: raw });
    expect(await new LocalSubmissionStore(storage).list()).toEqual([]);
    expect(storage.keys().some((k) => k.includes(':quarantine:'))).toBe(true);
  });

  it('keeps valid records and quarantines the original when some records are invalid', async () => {
    const raw = JSON.stringify({ schemaVersion: 1, data: [makeSubmission(), { id: 'junk' }] });
    const storage = new InMemoryStorage({ [StorageKeys.submissions]: raw });
    const store = new LocalSubmissionStore(storage);
    expect((await store.list()).map((s) => s.id)).toEqual(['sub_1']);
    const backup = storage.keys().find((k) => k.includes(':quarantine:'));
    expect(backup && (await storage.getItem(backup))).toBe(raw);
  });

  it('rejects (not resolves) when the write fails', async () => {
    const storage = new FailingStorage();
    const store = new LocalSubmissionStore(storage);
    storage.failWrites = true;
    await expect(store.save(makeSubmission())).rejects.toThrow('disk full');
    storage.failWrites = false;
    expect(await store.list()).toEqual([]);
  });

  it('rejects when storage cannot be read', async () => {
    const storage = new FailingStorage();
    storage.failReads = true;
    await expect(new LocalSubmissionStore(storage).list()).rejects.toThrow('disk read error');
  });
});

describe('LocalDraftRepository', () => {
  const draft = {
    surveyId: 'survey_x',
    surveyVersion: 1,
    respondentId: 'user_demo',
    values: { q1: 'a', q2: ['x'], q3: 4 },
    updatedAt: '2026-01-15T10:00:00.000Z',
  };

  it('saves, reads and removes drafts per survey', async () => {
    const repo = new LocalDraftRepository(new InMemoryStorage());
    await repo.save(draft);
    await repo.save({ ...draft, surveyId: 'survey_y' });
    expect(await repo.get('survey_x', 'user_demo')).toEqual(draft);
    await repo.remove('survey_x', 'user_demo');
    expect(await repo.get('survey_x', 'user_demo')).toBeNull();
    expect(await repo.get('survey_y', 'user_demo')).not.toBeNull();
  });

  it('keeps drafts of different users on the same device separate', async () => {
    const repo = new LocalDraftRepository(new InMemoryStorage());
    await repo.save(draft);
    await repo.save({ ...draft, respondentId: 'user_b', values: { q1: 'b' } });
    expect((await repo.get('survey_x', 'user_demo'))?.values).toEqual(draft.values);
    expect((await repo.get('survey_x', 'user_b'))?.values).toEqual({ q1: 'b' });
    await repo.remove('survey_x', 'user_b');
    expect(await repo.get('survey_x', 'user_demo')).toEqual(draft);
  });

  it('starts empty when drafts are unreadable', async () => {
    const storage = new InMemoryStorage({ [StorageKeys.drafts]: 'nope' });
    expect(await new LocalDraftRepository(storage).get('survey_x', 'user_demo')).toBeNull();
  });
});
