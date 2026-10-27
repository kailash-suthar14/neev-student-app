import { createId as defaultCreateId, type IdGenerator } from '@/core/runtime';
import type { KeyValueStorage } from '@/data/local/key-value-storage';
import { SecureStorageKeys } from '@/data/local/storage-keys';

/**
 * Backend credentials for Firebase sign-in, kept in secure storage:
 * - the `X-Auth-Token` session id issued by `/api/firebase-auth-token`;
 * - a per-install device id sent with every token exchange;
 * - a one-shot flag recording that another device took over the account.
 */
export class AuthCredentialStore {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly createId: IdGenerator = defaultCreateId,
  ) {}

  getToken(): Promise<string | null> {
    return this.storage.getItem(SecureStorageKeys.xAuthToken);
  }

  setToken(token: string): Promise<void> {
    return this.storage.setItem(SecureStorageKeys.xAuthToken, token);
  }

  clearToken(): Promise<void> {
    return this.storage.removeItem(SecureStorageKeys.xAuthToken);
  }

  /**
   * Generated once and reused for the lifetime of the install (survives
   * sign-out, not reinstall). It only needs to be stable and distinct per
   * device; the backend enforces single-device login by session, not by
   * treating this id as a secret.
   */
  async getOrCreateDeviceId(): Promise<string> {
    const existing = await this.storage.getItem(SecureStorageKeys.deviceId);
    if (existing) return existing;
    const deviceId = this.createId('device');
    await this.storage.setItem(SecureStorageKeys.deviceId, deviceId);
    return deviceId;
  }

  /** Set right before this device signs itself out because the account signed in elsewhere. */
  setForcedSignOut(): Promise<void> {
    return this.storage.setItem(SecureStorageKeys.forcedSignOut, '1');
  }

  /** Reads and clears the flag, so the explanation is shown only once. */
  async consumeForcedSignOut(): Promise<boolean> {
    const flag = await this.storage.getItem(SecureStorageKeys.forcedSignOut);
    if (flag) await this.storage.removeItem(SecureStorageKeys.forcedSignOut);
    return !!flag;
  }
}
