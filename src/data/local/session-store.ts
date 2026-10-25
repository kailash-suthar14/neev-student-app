import { authSessionSchema, type AuthSession } from '@/features/auth/models';

import type { KeyValueStorage } from './key-value-storage';
import { StorageKeys } from './storage-keys';
import { VersionedJsonStore, type DataIssueReporter } from './versioned-json-store';

/**
 * Persists the non-sensitive session record only. The schema has no
 * password or token fields, so they cannot be written here by accident.
 */
export class SessionStore {
  private readonly store: VersionedJsonStore<AuthSession>;

  constructor(
    storage: KeyValueStorage,
    private readonly onDataIssue?: DataIssueReporter,
  ) {
    this.store = new VersionedJsonStore(storage, StorageKeys.session, authSessionSchema);
  }

  /** An unreadable session is discarded: the user simply signs in again. */
  async get(): Promise<AuthSession | null> {
    const result = await this.store.read();
    if (result.kind === 'ok') return result.value;
    if (result.kind === 'corrupt') {
      this.onDataIssue?.({ key: this.store.key, reason: result.reason });
      await this.store.remove();
    }
    return null;
  }

  save(session: AuthSession): Promise<void> {
    return this.store.write(session);
  }

  clear(): Promise<void> {
    return this.store.remove();
  }
}
