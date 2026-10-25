/**
 * Namespaced, versioned storage keys. Bump the key version (v1 -> v2) only
 * together with a migration; bump STORED_SCHEMA_VERSION for envelope changes
 * that old builds must refuse to read.
 */
export const STORAGE_NAMESPACE = 'survey-app';
export const STORAGE_KEY_VERSION = 'v1';
export const STORED_SCHEMA_VERSION = 1;

const key = (name: string) => `${STORAGE_NAMESPACE}:${STORAGE_KEY_VERSION}:${name}`;

export const StorageKeys = {
  session: key('session'),
  submissions: key('submissions'),
  drafts: key('drafts'),
} as const;

/** Unreadable data is moved here instead of being overwritten, so it can be recovered. */
export function quarantineKey(baseKey: string, timestamp: number): string {
  return `${baseKey}:quarantine:${timestamp}`;
}
