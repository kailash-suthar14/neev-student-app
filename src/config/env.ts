import { z } from 'zod';

import { AppError } from '@/core/errors';

export type DataMode = 'mock' | 'rest';

export interface AppConfig {
  appName: string;
  dataMode: DataMode;
  api: { baseUrl: string; timeoutMs: number } | null;
  mock: { latencyMs: number; demoEmail: string; demoPassword: string };
}

/** Treat unset and blank variables the same way. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema);

const envSchema = z
  .object({
    EXPO_PUBLIC_APP_NAME: optional(z.string().trim().min(1).default('Neev Survey')),
    EXPO_PUBLIC_DATA_MODE: optional(z.enum(['mock', 'rest']).default('mock')),
    EXPO_PUBLIC_API_BASE_URL: optional(z.url({ protocol: /^https?$/ }).optional()),
    EXPO_PUBLIC_API_TIMEOUT_MS: optional(z.coerce.number().int().min(1000).max(120000).default(15000)),
    EXPO_PUBLIC_MOCK_LATENCY_MS: optional(z.coerce.number().int().min(0).max(5000).default(400)),
    EXPO_PUBLIC_DEMO_EMAIL: optional(z.email().default('demo@example.com')),
    EXPO_PUBLIC_DEMO_PASSWORD: optional(z.string().min(1).default('Demo123!')),
  })
  .refine((env) => env.EXPO_PUBLIC_DATA_MODE !== 'rest' || env.EXPO_PUBLIC_API_BASE_URL, {
    message: 'EXPO_PUBLIC_API_BASE_URL is required when EXPO_PUBLIC_DATA_MODE=rest.',
    path: ['EXPO_PUBLIC_API_BASE_URL'],
  });

export type RawEnv = Partial<Record<keyof z.input<typeof envSchema>, string | undefined>>;

/**
 * Expo inlines `EXPO_PUBLIC_*` variables only when they are referenced as
 * literal `process.env.EXPO_PUBLIC_X` expressions, so each is listed here.
 * These values are embedded in the app bundle: never put secrets in them.
 */
export function readProcessEnv(): RawEnv {
  return {
    EXPO_PUBLIC_APP_NAME: process.env.EXPO_PUBLIC_APP_NAME,
    EXPO_PUBLIC_DATA_MODE: process.env.EXPO_PUBLIC_DATA_MODE,
    EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
    EXPO_PUBLIC_API_TIMEOUT_MS: process.env.EXPO_PUBLIC_API_TIMEOUT_MS,
    EXPO_PUBLIC_MOCK_LATENCY_MS: process.env.EXPO_PUBLIC_MOCK_LATENCY_MS,
    EXPO_PUBLIC_DEMO_EMAIL: process.env.EXPO_PUBLIC_DEMO_EMAIL,
    EXPO_PUBLIC_DEMO_PASSWORD: process.env.EXPO_PUBLIC_DEMO_PASSWORD,
  };
}

export interface ParseOptions {
  /** Development builds allow implicit mock mode and plain-http APIs. Defaults to `__DEV__`. */
  isDev?: boolean;
}

export function parseAppConfig(raw: RawEnv, { isDev = __DEV__ }: ParseOptions = {}): AppConfig {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new AppError('config', `Invalid environment configuration: ${problems}`);
  }
  const env = result.data;
  if (!isDev) {
    // A release build must never fall back to the mock login by accident.
    if (!raw.EXPO_PUBLIC_DATA_MODE?.trim()) {
      throw new AppError('config', 'EXPO_PUBLIC_DATA_MODE must be set explicitly in release builds.');
    }
    // Credentials must not travel over cleartext HTTP outside development.
    if (env.EXPO_PUBLIC_API_BASE_URL?.startsWith('http:')) {
      throw new AppError('config', 'EXPO_PUBLIC_API_BASE_URL must use https in release builds.');
    }
  }
  return {
    appName: env.EXPO_PUBLIC_APP_NAME,
    dataMode: env.EXPO_PUBLIC_DATA_MODE,
    api: env.EXPO_PUBLIC_API_BASE_URL
      ? { baseUrl: env.EXPO_PUBLIC_API_BASE_URL, timeoutMs: env.EXPO_PUBLIC_API_TIMEOUT_MS }
      : null,
    mock: {
      latencyMs: env.EXPO_PUBLIC_MOCK_LATENCY_MS,
      demoEmail: env.EXPO_PUBLIC_DEMO_EMAIL,
      demoPassword: env.EXPO_PUBLIC_DEMO_PASSWORD,
    },
  };
}
