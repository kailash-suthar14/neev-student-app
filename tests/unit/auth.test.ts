import { AppError } from '@/core/errors';
import { InMemoryStorage, type KeyValueStorage } from '@/data/local/key-value-storage';
import { SessionStore } from '@/data/local/session-store';
import { StorageKeys } from '@/data/local/storage-keys';
import { MockAuthRepository } from '@/data/mock/mock-auth-repository';
import { AuthService } from '@/features/auth/auth-service';

import { fixedClock, FailingStorage } from '../helpers/fixtures';

const DEMO = { email: 'demo@example.com', password: 'Demo123!' };

function setup(storage: KeyValueStorage = new InMemoryStorage(), clock = fixedClock()) {
  const repo = new MockAuthRepository({
    demoEmail: DEMO.email,
    demoPassword: DEMO.password,
    sessionStore: new SessionStore(storage),
    clock,
  });
  return { service: new AuthService(repo), storage, clock };
}

describe('AuthService with MockAuthRepository', () => {
  it('signs in with the demo credentials (email is case-insensitive and trimmed)', async () => {
    const { service } = setup();
    const session = await service.login({ email: '  Demo@Example.com ', password: DEMO.password });
    expect(session.user.email).toBe('demo@example.com');
    expect(session.mode).toBe('mock');
  });

  it('rejects a wrong password without creating a session', async () => {
    const { service } = setup();
    await expect(service.login({ ...DEMO, password: 'wrong' })).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    await expect(service.restoreSession()).resolves.toBeNull();
  });

  it('rejects an unknown email', async () => {
    const { service } = setup();
    await expect(service.login({ ...DEMO, email: 'other@example.com' })).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
  });

  it('returns field errors for malformed input before calling the repository', async () => {
    const { service } = setup();
    const error: unknown = await service.login({ email: 'not-an-email', password: '' }).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('validation');
    expect((error as AppError).fieldErrors).toEqual({
      email: 'Enter a valid email address.',
      password: 'Password is required.',
    });
  });

  it('never persists the password', async () => {
    const { service, storage } = setup();
    await service.login(DEMO);
    const stored = (await storage.getItem(StorageKeys.session)) ?? '';
    expect(stored).not.toContain(DEMO.password);
    expect(stored).not.toMatch(/password|token/i);
  });

  it('restores a persisted session in a new app instance', async () => {
    const storage = new InMemoryStorage();
    await setup(storage).service.login(DEMO);
    const restored = await setup(storage).service.restoreSession();
    expect(restored?.user.email).toBe(DEMO.email);
  });

  it('discards an expired session', async () => {
    const storage = new InMemoryStorage();
    const clock = fixedClock();
    await setup(storage, clock).service.login(DEMO);
    clock.advance(8 * 24 * 60 * 60 * 1000);
    await expect(setup(storage, clock).service.restoreSession()).resolves.toBeNull();
    expect(await storage.getItem(StorageKeys.session)).toBeNull();
  });

  it('discards a malformed stored session instead of crashing', async () => {
    const storage = new InMemoryStorage({ [StorageKeys.session]: '{not json' });
    await expect(setup(storage).service.restoreSession()).resolves.toBeNull();
    expect(await storage.getItem(StorageKeys.session)).toBeNull();
  });

  it('logs out by clearing the session', async () => {
    const { service } = setup();
    await service.login(DEMO);
    await service.logout();
    await expect(service.restoreSession()).resolves.toBeNull();
  });

  it('fails login when the session cannot be persisted', async () => {
    const storage = new FailingStorage();
    storage.failWrites = true;
    await expect(setup(storage).service.login(DEMO)).rejects.toThrow();
  });
});
