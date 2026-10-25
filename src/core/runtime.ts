/** Injectable time and identifier sources so services stay deterministic in tests. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export type IdGenerator = (prefix: string) => string;

function randomHex(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

/**
 * Generates `<prefix>_<uuid>` identifiers. Uses `crypto.randomUUID` when the
 * runtime provides it, otherwise a time-ordered random fallback. These IDs are
 * for uniqueness, not security.
 */
export const createId: IdGenerator = (prefix) => {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(16)}-${randomHex(8)}-${randomHex(12)}`;
  return `${prefix}_${uuid}`;
};

export function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
