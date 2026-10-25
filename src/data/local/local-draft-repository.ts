import { z } from 'zod';

import { createSerialQueue } from '@/core/serial-queue';
import { surveyDraftSchema, type SurveyDraft } from '@/features/surveys/models';
import type { DraftRepository } from '@/data/repositories';

import type { KeyValueStorage } from './key-value-storage';
import { StorageKeys } from './storage-keys';
import { VersionedJsonStore, type DataIssueReporter } from './versioned-json-store';

const draftMapSchema = z.record(z.string(), surveyDraftSchema);
type DraftMap = z.infer<typeof draftMapSchema>;

function draftKey(surveyId: string, respondentId: string | null): string {
  return `${respondentId ?? 'anonymous'}:${surveyId}`;
}

/**
 * Drafts are a convenience, so unreadable draft data is quarantined and the
 * user starts with an empty form rather than being blocked.
 */
export class LocalDraftRepository implements DraftRepository {
  private readonly store: VersionedJsonStore<DraftMap>;
  private readonly enqueue = createSerialQueue();

  constructor(
    storage: KeyValueStorage,
    private readonly onDataIssue?: DataIssueReporter,
  ) {
    this.store = new VersionedJsonStore(storage, StorageKeys.drafts, draftMapSchema);
  }

  private async load(): Promise<DraftMap> {
    const result = await this.store.read();
    if (result.kind === 'ok') return result.value;
    if (result.kind === 'corrupt') {
      this.onDataIssue?.({ key: this.store.key, reason: result.reason });
      await this.store.quarantine();
    }
    return {};
  }

  get(surveyId: string, respondentId: string | null): Promise<SurveyDraft | null> {
    return this.enqueue(async () => (await this.load())[draftKey(surveyId, respondentId)] ?? null);
  }

  save(draft: SurveyDraft): Promise<void> {
    return this.enqueue(async () => {
      const all = await this.load();
      await this.store.write({ ...all, [draftKey(draft.surveyId, draft.respondentId)]: draft });
    });
  }

  remove(surveyId: string, respondentId: string | null): Promise<void> {
    return this.enqueue(async () => {
      const all = await this.load();
      const key = draftKey(surveyId, respondentId);
      if (!(key in all)) return;
      const { [key]: _removed, ...rest } = all;
      await this.store.write(rest);
    });
  }
}
