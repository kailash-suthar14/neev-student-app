import type { Clock, IdGenerator } from '@/core/runtime';
import type { KeyValueStorage } from '@/data/local/key-value-storage';
import type { FormValues, SurveySubmission } from '@/features/surveys/models';

export const FIXED_NOW = new Date('2026-01-15T10:00:00.000Z');

export function fixedClock(start: Date = FIXED_NOW): Clock & { advance(ms: number): void } {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance: (ms) => {
      current += ms;
    },
  };
}

export function sequentialIds(): IdGenerator {
  let n = 0;
  return (prefix) => {
    n += 1;
    return `${prefix}_${n}`;
  };
}

export function makeSubmission(overrides: Partial<SurveySubmission> = {}): SurveySubmission {
  return {
    id: 'sub_1',
    surveyId: 'survey_learning_experience',
    surveyVersion: 1,
    respondentId: 'user_demo',
    answers: [{ questionId: 'q_overall_rating', type: 'rating', value: 4 }],
    status: 'submitted',
    createdAt: FIXED_NOW.toISOString(),
    updatedAt: FIXED_NOW.toISOString(),
    ...overrides,
  };
}

/** Storage whose operations can be made to fail on demand. */
export class FailingStorage implements KeyValueStorage {
  readonly items = new Map<string, string>();
  failReads = false;
  failWrites = false;

  async getItem(key: string) {
    if (this.failReads) throw new Error('disk read error');
    return this.items.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('disk full');
    this.items.set(key, value);
  }

  async removeItem(key: string) {
    if (this.failWrites) throw new Error('disk full');
    this.items.delete(key);
  }
}

/** A complete, valid set of form values for the seed survey. */
export const VALID_SEED_VALUES: FormValues = {
  q_course_level: 'intermediate',
  q_helpful_resources: ['practice_tests', 'live_classes'],
  q_study_hours: '12',
  q_overall_rating: 4,
  q_recommend: 'yes',
};
