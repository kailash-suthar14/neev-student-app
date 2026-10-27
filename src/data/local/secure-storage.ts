import * as SecureStore from 'expo-secure-store';

import { AppError } from '@/core/errors';

import type { KeyValueStorage } from './key-value-storage';

async function guard<T>(operation: string, key: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    throw new AppError('storage', `Secure storage ${operation} failed for "${key}".`, { cause });
  }
}

/**
 * Encrypted key/value storage (iOS Keychain, Android Keystore). The only
 * place auth tokens may be persisted. Keys must match `SecureStorageKeys`.
 */
export function createSecureStoreAdapter(): KeyValueStorage {
  return {
    getItem: (key) => guard('read', key, () => SecureStore.getItemAsync(key)),
    setItem: (key, value) => guard('write', key, () => SecureStore.setItemAsync(key, value)),
    removeItem: (key) => guard('remove', key, () => SecureStore.deleteItemAsync(key)),
  };
}
