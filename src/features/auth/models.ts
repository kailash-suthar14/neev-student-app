import { z } from 'zod';

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  displayName: z.string().min(1),
});
export type User = z.infer<typeof userSchema>;

/**
 * A non-sensitive session record. It intentionally carries no password and no
 * access token, so it is safe to persist in AsyncStorage. REST access tokens
 * are held separately in memory (see TokenStore).
 */
export const authSessionSchema = z.object({
  user: userSchema,
  mode: z.enum(['mock', 'rest']),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

export interface LoginCredentials {
  email: string;
  password: string;
}

export function isSessionExpired(session: AuthSession, now: Date): boolean {
  return Date.parse(session.expiresAt) <= now.getTime();
}
