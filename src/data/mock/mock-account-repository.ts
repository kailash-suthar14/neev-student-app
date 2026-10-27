import { AppError } from '@/core/errors';
import { delay } from '@/core/runtime';
import type { SessionStore } from '@/data/local/session-store';
import type { AccountRepository } from '@/data/repositories';
import type { AccountInfo } from '@/features/account/models';

/** DEVELOPMENT-ONLY: describes the mock session's demo user as a student account. */
export class MockAccountRepository implements AccountRepository {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly latencyMs = 0,
  ) {}

  async getAccountInfo(): Promise<AccountInfo> {
    await delay(this.latencyMs);
    const session = await this.sessionStore.get();
    if (!session) throw new AppError('unauthorized', 'No mock session.');
    const { user } = session;
    return {
      username: user.email,
      name: user.displayName,
      email: user.email,
      roles: ['student'],
      authorities: [],
      isActive: true,
    };
  }
}
