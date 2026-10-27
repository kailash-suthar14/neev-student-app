import type { AccountRepository } from '@/data/repositories';
import { accountInfoSchema, type AccountInfo } from '@/features/account/models';

import type { ApiClient } from './api-client';
import { accountInfoDtoSchema } from './api-types';

/** glsstudentapi `GET /api/accountInfo`, authenticated with the session's `X-Auth-Token`. */
export class RestAccountRepository implements AccountRepository {
  constructor(private readonly client: ApiClient) {}

  async getAccountInfo(): Promise<AccountInfo> {
    const dto = await this.client.request({
      method: 'GET',
      path: '/api/accountInfo',
      schema: accountInfoDtoSchema,
    });
    return accountInfoSchema.parse({
      username: dto.username ?? null,
      name: dto.name ?? null,
      email: dto.email ?? null,
      roles: dto.roles ?? [],
      authorities: dto.authorities ?? [],
      isActive: dto.isActive ?? null,
    });
  }
}
