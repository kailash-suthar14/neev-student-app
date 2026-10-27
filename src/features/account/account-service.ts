import type { AccountRepository } from '@/data/repositories';

import type { AccountInfo } from './models';

export class AccountService {
  constructor(private readonly repository: AccountRepository) {}

  getAccountInfo(): Promise<AccountInfo> {
    return this.repository.getAccountInfo();
  }
}
