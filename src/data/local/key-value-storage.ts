import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppError } from '@/core/errors';

/**
 * Minimal string key/value contract. AsyncStorage is the production
 * implementation; tests use the in-memory one. AsyncStorage is NOT encrypted:
 * never store passwords, access tokens or sensitive personal data through it.
 */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

async function guard<T>(operation: string, key: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    throw new AppError('storage', `Storage ${operation} failed for "${key}".`, { cause });
  }
}

export function createAsyncStorageAdapter(): KeyValueStorage {
  return {
    getItem: (key) => guard('read', key, () => AsyncStorage.getItem(key)),
    setItem: (key, value) => guard('write', key, () => AsyncStorage.setItem(key, value)),
    removeItem: (key) => guard('remove', key, () => AsyncStorage.removeItem(key)),
  };
}

export class InMemoryStorage implements KeyValueStorage {
  private readonly items = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.items.set(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    return this.items.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.items.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.items.delete(key);
  }

  keys(): string[] {
    return [...this.items.keys()];
  }
}
