import { z } from 'zod';

import { AppError } from '@/core/errors';
import { systemClock, type Clock } from '@/core/runtime';

import type { KeyValueStorage } from './key-value-storage';
import { quarantineKey, STORED_SCHEMA_VERSION } from './storage-keys';

export type CorruptionReason = 'malformed_json' | 'unsupported_version' | 'invalid_shape';

export type StoredRead<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'missing' }
  | { kind: 'corrupt'; reason: CorruptionReason };

/** Reports storage anomalies without exposing stored values. */
export type DataIssueReporter = (issue: { key: string; reason: CorruptionReason }) => void;

const envelopeSchema = z.object({
  schemaVersion: z.number().int().positive(),
  data: z.unknown(),
});

/**
 * Stores one JSON document under one key, wrapped in a
 * `{ schemaVersion, data }` envelope. Every read is validated with the
 * supplied schema; nothing unvalidated reaches callers.
 */
export class VersionedJsonStore<T> {
  constructor(
    private readonly storage: KeyValueStorage,
    readonly key: string,
    private readonly schema: z.ZodType<T>,
    private readonly clock: Clock = systemClock,
  ) {}

  async read(): Promise<StoredRead<T>> {
    const raw = await this.storage.getItem(this.key);
    if (raw === null) return { kind: 'missing' };

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return { kind: 'corrupt', reason: 'malformed_json' };
    }

    const envelope = envelopeSchema.safeParse(json);
    if (!envelope.success) return { kind: 'corrupt', reason: 'invalid_shape' };
    if (envelope.data.schemaVersion !== STORED_SCHEMA_VERSION) {
      return { kind: 'corrupt', reason: 'unsupported_version' };
    }

    const data = this.schema.safeParse(envelope.data.data);
    if (!data.success) return { kind: 'corrupt', reason: 'invalid_shape' };
    return { kind: 'ok', value: data.data };
  }

  async write(value: T): Promise<void> {
    const checked = this.schema.safeParse(value);
    if (!checked.success) {
      throw new AppError('validation', `Refusing to store invalid data under "${this.key}".`, {
        cause: checked.error,
      });
    }
    const payload = JSON.stringify({ schemaVersion: STORED_SCHEMA_VERSION, data: checked.data });
    await this.storage.setItem(this.key, payload);
  }

  async remove(): Promise<void> {
    await this.storage.removeItem(this.key);
  }

  /**
   * Moves the current raw value to a timestamped quarantine key and clears the
   * main key. Data written by a newer app version, or damaged data, is kept
   * for recovery rather than silently overwritten.
   */
  async quarantine(): Promise<string | null> {
    const raw = await this.storage.getItem(this.key);
    if (raw === null) return null;
    const base = quarantineKey(this.key, this.clock.now().getTime());
    let target = base;
    // Never overwrite an earlier quarantined copy from the same millisecond.
    for (let n = 1; (await this.storage.getItem(target)) !== null; n += 1) target = `${base}-${n}`;
    await this.storage.setItem(target, raw);
    await this.storage.removeItem(this.key);
    return target;
  }
}
