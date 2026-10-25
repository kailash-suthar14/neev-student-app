import { z } from 'zod';

import { AppError } from '@/core/errors';
import { systemClock, type Clock } from '@/core/runtime';
import { createSerialQueue } from '@/core/serial-queue';
import { surveySubmissionSchema, type SurveySubmission } from '@/features/surveys/models';

import type { KeyValueStorage } from './key-value-storage';
import { StorageKeys } from './storage-keys';
import { VersionedJsonStore, type DataIssueReporter } from './versioned-json-store';

function newestFirst(a: SurveySubmission, b: SurveySubmission): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Durable submission collection stored as one JSON array. All mutations are
 * serialised and resolve only after the storage write succeeds.
 *
 * Unreadable data is quarantined (never overwritten). Individually invalid
 * records are dropped from the working set but preserved in the quarantine copy.
 */
export class LocalSubmissionStore {
  private readonly store: VersionedJsonStore<unknown[]>;
  private readonly enqueue = createSerialQueue();
  private readonly clock: Clock;
  private readonly onDataIssue?: DataIssueReporter;

  constructor(
    storage: KeyValueStorage,
    options: { clock?: Clock; onDataIssue?: DataIssueReporter } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.onDataIssue = options.onDataIssue;
    this.store = new VersionedJsonStore(storage, StorageKeys.submissions, z.array(z.unknown()), this.clock);
  }

  private async load(): Promise<SurveySubmission[]> {
    const result = await this.store.read();
    if (result.kind === 'missing') return [];
    if (result.kind === 'corrupt') {
      this.onDataIssue?.({ key: this.store.key, reason: result.reason });
      await this.store.quarantine();
      return [];
    }

    const valid: SurveySubmission[] = [];
    for (const item of result.value) {
      const parsed = surveySubmissionSchema.safeParse(item);
      if (parsed.success) valid.push(parsed.data);
    }
    if (valid.length !== result.value.length) {
      this.onDataIssue?.({ key: this.store.key, reason: 'invalid_shape' });
      await this.store.quarantine();
      await this.store.write(valid);
    }
    return valid;
  }

  list(): Promise<SurveySubmission[]> {
    return this.enqueue(async () => (await this.load()).sort(newestFirst));
  }

  async listBySurvey(surveyId: string): Promise<SurveySubmission[]> {
    return (await this.list()).filter((s) => s.surveyId === surveyId);
  }

  getById(id: string): Promise<SurveySubmission | null> {
    return this.enqueue(async () => (await this.load()).find((s) => s.id === id) ?? null);
  }

  /**
   * Inserts a submission. Re-saving an identical record is a no-op (idempotent
   * retry); saving a different record under an existing ID is a conflict.
   */
  save(submission: SurveySubmission): Promise<SurveySubmission> {
    return this.enqueue(async () => {
      const record = surveySubmissionSchema.parse(submission);
      const all = await this.load();
      const existing = all.find((s) => s.id === record.id);
      if (existing) {
        if (sameJson(existing, record)) return existing;
        throw new AppError('conflict', `Submission "${record.id}" already exists.`);
      }
      await this.store.write([...all, record]);
      return record;
    });
  }

  update(submission: SurveySubmission): Promise<SurveySubmission> {
    return this.enqueue(async () => {
      const all = await this.load();
      const index = all.findIndex((s) => s.id === submission.id);
      if (index === -1) throw new AppError('not_found', `Submission "${submission.id}" not found.`);
      const record = surveySubmissionSchema.parse({
        ...submission,
        createdAt: all[index].createdAt,
        updatedAt: this.clock.now().toISOString(),
      });
      const next = [...all];
      next[index] = record;
      await this.store.write(next);
      return record;
    });
  }

  delete(id: string): Promise<boolean> {
    return this.enqueue(async () => {
      const all = await this.load();
      const next = all.filter((s) => s.id !== id);
      if (next.length === all.length) return false;
      await this.store.write(next);
      return true;
    });
  }
}
