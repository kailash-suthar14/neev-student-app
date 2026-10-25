import { AppError } from '@/core/errors';
import { delay, systemClock, type Clock } from '@/core/runtime';
import type { SessionStore } from '@/data/local/session-store';
import type { AuthRepository } from '@/data/repositories';
import { isSessionExpired, type AuthSession, type LoginCredentials } from '@/features/auth/models';

export interface MockAuthOptions {
  /** Development-only demo credentials; never ship real credentials here. */
  demoEmail: string;
  demoPassword: string;
  sessionStore: SessionStore;
  clock?: Clock;
  latencyMs?: number;
  sessionTtlMs?: number;
}

const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * DEVELOPMENT-ONLY mock authentication. Compares credentials against
 * configured demo values and persists a non-sensitive session record.
 * The password is never stored.
 */
export class MockAuthRepository implements AuthRepository {
  private readonly clock: Clock;

  constructor(private readonly options: MockAuthOptions) {
    this.clock = options.clock ?? systemClock;
  }

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    await delay(this.options.latencyMs ?? 0);
    const emailMatches =
      credentials.email.trim().toLowerCase() === this.options.demoEmail.trim().toLowerCase();
    if (!emailMatches || credentials.password !== this.options.demoPassword) {
      throw new AppError('invalid_credentials', 'Invalid email or password.');
    }

    const now = this.clock.now();
    const session: AuthSession = {
      user: {
        id: 'user_demo',
        email: this.options.demoEmail.toLowerCase(),
        displayName: 'Demo Student',
      },
      mode: 'mock',
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + (this.options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS),
      ).toISOString(),
    };
    await this.options.sessionStore.save(session);
    return session;
  }

  async logout(): Promise<void> {
    await this.options.sessionStore.clear();
  }

  async getCurrentSession(): Promise<AuthSession | null> {
    const session = await this.options.sessionStore.get();
    if (!session) return null;
    if (session.mode !== 'mock' || isSessionExpired(session, this.clock.now())) {
      await this.options.sessionStore.clear();
      return null;
    }
    return session;
  }
}
