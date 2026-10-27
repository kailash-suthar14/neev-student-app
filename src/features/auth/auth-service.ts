import { AppError } from '@/core/errors';
import type { AuthRepository } from '@/data/repositories';

import type { AuthSession, LoginCredentials } from './models';
import { parseLoginCredentials } from './validation';

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  /** Validates input locally before calling the repository. */
  async login(input: LoginCredentials): Promise<AuthSession> {
    return this.repository.login(parseLoginCredentials(input));
  }

  get supportsGoogleSignIn(): boolean {
    return typeof this.repository.loginWithGoogle === 'function';
  }

  /** Resolves null when the user cancels the Google account picker. */
  async loginWithGoogle(): Promise<AuthSession | null> {
    if (!this.repository.loginWithGoogle) {
      throw new AppError('config', 'Google Sign-In is not available in this data mode.');
    }
    return this.repository.loginWithGoogle();
  }

  logout(): Promise<void> {
    return this.repository.logout();
  }

  restoreSession(): Promise<AuthSession | null> {
    return this.repository.getCurrentSession();
  }

  /** Whether the last sign-out happened because the account signed in on another device. Read once. */
  async consumeForcedSignOut(): Promise<boolean> {
    return (await this.repository.consumeForcedSignOut?.()) ?? false;
  }
}
