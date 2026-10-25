import { AppError, isAppError } from '@/core/errors';
import { systemClock, type Clock } from '@/core/runtime';
import type { AuthRepository } from '@/data/repositories';
import { isSessionExpired, type AuthSession, type LoginCredentials } from '@/features/auth/models';

import type { ApiClient } from './api-client';
import { loginResponseDtoSchema, noContentSchema, type LoginRequestDto } from './api-types';
import type { TokenStore } from './token-store';

/**
 * PLACEHOLDER REST authentication against the proposed `/auth/*` contract.
 *
 * The session lives in memory with the token, so the user signs in again
 * after an app restart. Persistent REST sign-in needs a secure TokenStore
 * (expo-secure-store); see docs/architecture.md.
 */
export class RestAuthRepository implements AuthRepository {
  private session: AuthSession | null = null;

  constructor(
    private readonly client: ApiClient,
    private readonly tokens: TokenStore,
    private readonly clock: Clock = systemClock,
  ) {}

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    const body: LoginRequestDto = { email: credentials.email, password: credentials.password };
    try {
      const { data } = await this.client.request({
        method: 'POST',
        path: '/auth/login',
        body,
        schema: loginResponseDtoSchema,
        authenticated: false,
      });
      this.tokens.set(data.accessToken);
      this.session = {
        user: data.user,
        mode: 'rest',
        createdAt: this.clock.now().toISOString(),
        expiresAt: data.expiresAt,
      };
      return this.session;
    } catch (error) {
      // A 401 from the login endpoint means bad credentials, not an expired session.
      if (isAppError(error) && error.code === 'unauthorized') {
        throw new AppError('invalid_credentials', 'Invalid email or password.', { status: 401 });
      }
      throw error;
    }
  }

  /**
   * Always clears local credentials. Server-side revocation is best effort:
   * a network failure must not leave the user unable to sign out.
   */
  async logout(): Promise<void> {
    try {
      if (this.tokens.get()) {
        await this.client.request({ method: 'POST', path: '/auth/logout', schema: noContentSchema });
      }
    } catch {
      // Intentionally ignored; see method docs.
    } finally {
      this.tokens.clear();
      this.session = null;
    }
  }

  async getCurrentSession(): Promise<AuthSession | null> {
    if (!this.session || !this.tokens.get() || isSessionExpired(this.session, this.clock.now())) {
      this.tokens.clear();
      this.session = null;
      return null;
    }
    return this.session;
  }
}
