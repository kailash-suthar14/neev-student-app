import { z } from 'zod';

import { AppError } from '@/core/errors';

import type { LoginCredentials } from './models';

export const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Password is required.'),
});

export type LoginFieldErrors = Partial<Record<keyof LoginCredentials, string>>;

/** Validates and normalises login input, throwing a `validation` AppError with per-field messages. */
export function parseLoginCredentials(input: LoginCredentials): LoginCredentials {
  const result = loginFormSchema.safeParse(input);
  if (result.success) {
    return { email: result.data.email.toLowerCase(), password: result.data.password };
  }
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    fieldErrors[key] ??= issue.message;
  }
  throw new AppError('validation', 'Login form is invalid.', { fieldErrors });
}
