import type { AuthRepository } from '@/data/repositories';

import type { AuthSession, LoginCredentials } from './models';
import { parseLoginCredentials } from './validation';

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  /** Validates input locally before calling the repository. */
  async login(input: LoginCredentials): Promise<AuthSession> {
    return this.repository.login(parseLoginCredentials(input));
  }

  logout(): Promise<void> {
    return this.repository.logout();
  }

  restoreSession(): Promise<AuthSession | null> {
    return this.repository.getCurrentSession();
  }
}
