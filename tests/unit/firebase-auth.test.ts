import { AppError } from '@/core/errors';
import { InMemoryStorage } from '@/data/local/key-value-storage';
import { SessionStore } from '@/data/local/session-store';
import { SecureStorageKeys, StorageKeys } from '@/data/local/storage-keys';
import { ApiClient } from '@/data/remote/api-client';
import { accountInfoDtoSchema } from '@/data/remote/api-types';
import { AuthCredentialStore } from '@/data/remote/credential-store';
import { mapFirebaseAuthError, mapGoogleSignInError } from '@/data/remote/firebase-auth-gateway';
import { FirebaseAuthRepository } from '@/data/remote/firebase-auth-repository';

import { fixedClock, sequentialIds } from '../helpers/fixtures';
import { accountInfo, exchangeOk, FakeFirebaseAuth } from '../helpers/firebase';
import { createMockFetch, jsonResponse, type RecordedRequest } from '../helpers/http';

const CREDENTIALS = { email: 'student@example.com', password: 'Secret123!' };

function setup(...responders: Parameters<typeof createMockFetch>) {
  const { fetchFn, requests } = createMockFetch(...responders);
  const secure = new InMemoryStorage();
  const storage = new InMemoryStorage();
  const firebase = new FakeFirebaseAuth();
  const credentials = new AuthCredentialStore(secure, sequentialIds());
  const sessionStore = new SessionStore(storage);
  const client: ApiClient = new ApiClient({
    baseUrl: 'https://api.test',
    timeoutMs: 1000,
    fetchFn,
    getAccessToken: () => credentials.getToken(),
    reauthenticate: () => repo.reauthenticate(),
  });
  const repo: FirebaseAuthRepository = new FirebaseAuthRepository({
    client,
    firebase,
    credentials,
    sessionStore,
    clock: fixedClock(),
  });
  return { repo, client, firebase, secure, storage, requests };
}

function query(req: RecordedRequest): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams);
}

describe('FirebaseAuthRepository.login', () => {
  it('signs in with Firebase, exchanges the ID token and loads the student account', async () => {
    const { repo, secure, storage, requests } = setup(() => exchangeOk('session-1'), () => accountInfo());

    const session = await repo.login(CREDENTIALS);

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url.split('?')[0]).toBe('https://api.test/api/firebase-auth-token');
    expect(query(requests[0])).toEqual({
      firebaseAuthToken: 'id-token-1',
      deviceId: 'device_1',
      forceTakeover: 'true',
    });
    expect(requests[0].headers['X-Auth-Token']).toBeUndefined();
    expect(requests[1]).toMatchObject({
      url: 'https://api.test/api/accountInfo',
      method: 'GET',
      headers: { 'X-Auth-Token': 'session-1' },
    });
    expect(session).toMatchObject({
      mode: 'rest',
      user: { id: 'firebase-uid-1', email: 'student@example.com', displayName: 'Asha' },
    });
    await expect(secure.getItem(SecureStorageKeys.xAuthToken)).resolves.toBe('session-1');
    // The session record is non-sensitive: no password or token in AsyncStorage.
    const stored = await storage.getItem(StorageKeys.session);
    expect(stored).not.toContain('Secret123!');
    expect(stored).not.toContain('session-1');
  });

  it('reuses the same device id across sign-ins', async () => {
    const { repo, requests } = setup(
      () => exchangeOk('s1'),
      () => accountInfo(),
      () => new Response(null, { status: 200 }),
      () => exchangeOk('s2'),
      () => accountInfo(),
    );
    await repo.login(CREDENTIALS);
    await repo.logout();
    await repo.login(CREDENTIALS);
    expect(query(requests[0]).deviceId).toBe('device_1');
    expect(query(requests[3]).deviceId).toBe('device_1');
  });

  it('rejects wrong Firebase credentials without calling the backend', async () => {
    const { repo, requests } = setup();
    await expect(repo.login({ ...CREDENTIALS, password: 'nope' })).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    expect(requests).toHaveLength(0);
  });

  it.each([
    [401, 'wrong_role'],
    [403, 'not_registered'],
  ])('maps HTTP %i from the token exchange to %s and drops the Firebase session', async (status, code) => {
    const { repo, firebase, secure } = setup(() =>
      jsonResponse(status, { status: 'false', url: 'http://localhost:4200' }),
    );
    await expect(repo.login(CREDENTIALS)).rejects.toMatchObject({ code });
    expect(firebase.user).toBeNull();
    expect(firebase.googleSignOutCalls).toBe(1);
    await expect(secure.getItem(SecureStorageKeys.xAuthToken)).resolves.toBeNull();
  });

  it('rejects an account whose role is not student', async () => {
    const { repo, firebase, secure, storage } = setup(
      () => exchangeOk('session-1'),
      () => accountInfo({ roles: ['mentor'] }),
    );
    await expect(repo.login(CREDENTIALS)).rejects.toMatchObject({ code: 'wrong_role' });
    expect(firebase.user).toBeNull();
    await expect(secure.getItem(SecureStorageKeys.xAuthToken)).resolves.toBeNull();
    await expect(storage.getItem(StorageKeys.session)).resolves.toBeNull();
  });

  it('rejects an exchange response without the X-Auth-Token header', async () => {
    const { repo } = setup(() => jsonResponse(200, { status: 'true' }));
    await expect(repo.login(CREDENTIALS)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('propagates network failures and leaves no partial sign-in', async () => {
    const { repo, firebase } = setup(() => {
      throw new TypeError('Network request failed');
    });
    await expect(repo.login(CREDENTIALS)).rejects.toMatchObject({ code: 'network' });
    expect(firebase.user).toBeNull();
  });

  it('falls back to the Firebase email when account info has no name', async () => {
    const { repo } = setup(() => exchangeOk('s'), () => accountInfo({ name: null }));
    await expect(repo.login(CREDENTIALS)).resolves.toMatchObject({ user: { displayName: 'student' } });
  });
});

describe('FirebaseAuthRepository.loginWithGoogle', () => {
  it('runs the same exchange for a Google account', async () => {
    const { repo, requests } = setup(() => exchangeOk('g1'), () => accountInfo());
    await expect(repo.loginWithGoogle()).resolves.toMatchObject({ user: { id: 'firebase-uid-1' } });
    expect(query(requests[0]).forceTakeover).toBe('true');
  });

  it('resolves null without calling the backend when the picker is dismissed', async () => {
    const { repo, firebase, requests } = setup();
    firebase.googleUser = null;
    await expect(repo.loginWithGoogle()).resolves.toBeNull();
    expect(requests).toHaveLength(0);
  });
});

describe('FirebaseAuthRepository.getCurrentSession', () => {
  it('returns null and clears leftovers when Firebase has no user', async () => {
    const { repo, secure } = setup();
    await secure.setItem(SecureStorageKeys.xAuthToken, 'old');
    await expect(repo.getCurrentSession()).resolves.toBeNull();
    await expect(secure.getItem(SecureStorageKeys.xAuthToken)).resolves.toBeNull();
  });

  it('restores a Firebase user with a non-takeover exchange', async () => {
    const { repo, firebase, requests } = setup(() => exchangeOk('r1'), () => accountInfo());
    firebase.user = { uid: 'firebase-uid-1', email: 'student@example.com', displayName: null };
    await expect(repo.getCurrentSession()).resolves.toMatchObject({ user: { id: 'firebase-uid-1' } });
    expect(query(requests[0]).forceTakeover).toBe('false');
  });

  it('keeps the stored session when the backend is unreachable', async () => {
    const { repo, firebase } = setup(
      () => exchangeOk('s1'),
      () => accountInfo(),
      () => {
        throw new TypeError('Network request failed');
      },
    );
    const session = await repo.login(CREDENTIALS);
    expect(firebase.user).not.toBeNull();
    await expect(repo.getCurrentSession()).resolves.toEqual(session);
  });

  it('fails the restore when offline with no stored session', async () => {
    const { repo, firebase } = setup(() => {
      throw new TypeError('Network request failed');
    });
    firebase.user = { uid: 'firebase-uid-1', email: 'student@example.com', displayName: null };
    await expect(repo.getCurrentSession()).rejects.toMatchObject({ code: 'network' });
  });

  it('signs out and flags it once when another device took over', async () => {
    const { repo, firebase } = setup(() => jsonResponse(409, { errorCode: 'DEVICE_CONFLICT' }));
    firebase.user = { uid: 'firebase-uid-1', email: 'student@example.com', displayName: null };

    await expect(repo.getCurrentSession()).resolves.toBeNull();
    expect(firebase.user).toBeNull();
    await expect(repo.consumeForcedSignOut()).resolves.toBe(true);
    await expect(repo.consumeForcedSignOut()).resolves.toBe(false);
  });

  it('signs out a restored account that is no longer a student', async () => {
    const { repo, firebase } = setup(() => jsonResponse(401, { status: 'false', url: 'x' }));
    firebase.user = { uid: 'firebase-uid-1', email: 'student@example.com', displayName: null };
    await expect(repo.getCurrentSession()).resolves.toBeNull();
    expect(firebase.user).toBeNull();
    await expect(repo.consumeForcedSignOut()).resolves.toBe(false);
  });
});

describe('FirebaseAuthRepository.logout', () => {
  it('calls /api/logout with the session token before clearing everything', async () => {
    const { repo, firebase, secure, storage, requests } = setup(
      () => exchangeOk('s1'),
      () => accountInfo(),
      () => new Response(null, { status: 200 }),
    );
    await repo.login(CREDENTIALS);
    await repo.logout();

    expect(requests[2]).toMatchObject({
      url: 'https://api.test/api/logout',
      method: 'GET',
      headers: { 'X-Auth-Token': 's1' },
    });
    await expect(secure.getItem(SecureStorageKeys.xAuthToken)).resolves.toBeNull();
    await expect(storage.getItem(StorageKeys.session)).resolves.toBeNull();
    expect(firebase.user).toBeNull();
    expect(firebase.googleSignOutCalls).toBe(1);
  });

  it('signs out locally even when /api/logout fails, without re-authenticating', async () => {
    const { repo, firebase, requests } = setup(
      () => exchangeOk('s1'),
      () => accountInfo(),
      () => jsonResponse(401),
    );
    await repo.login(CREDENTIALS);
    await expect(repo.logout()).resolves.toBeUndefined();
    expect(requests).toHaveLength(3);
    expect(firebase.user).toBeNull();
  });
});

describe('silent re-authentication', () => {
  it('re-exchanges without takeover after a 401 and retries the request', async () => {
    const { repo, client, secure, requests } = setup(
      () => exchangeOk('s1'),
      () => accountInfo(),
      () => jsonResponse(401),
      () => exchangeOk('s2'),
      () => accountInfo(),
    );
    await repo.login(CREDENTIALS);

    await client.request({ method: 'GET', path: '/api/accountInfo', schema: accountInfoDtoSchema });

    expect(query(requests[3]).forceTakeover).toBe('false');
    expect(requests[4].headers['X-Auth-Token']).toBe('s2');
    await expect(secure.getItem(SecureStorageKeys.xAuthToken)).resolves.toBe('s2');
  });

  it('clears the token, signs out and flags a takeover by another device', async () => {
    const { repo, firebase, secure } = setup(
      () => exchangeOk('s1'),
      () => accountInfo(),
      () => jsonResponse(409, { errorCode: 'DEVICE_CONFLICT' }),
    );
    await repo.login(CREDENTIALS);

    await expect(repo.reauthenticate()).rejects.toMatchObject({ code: 'device_conflict' });
    await expect(secure.getItem(SecureStorageKeys.xAuthToken)).resolves.toBeNull();
    expect(firebase.user).toBeNull();
    await expect(repo.consumeForcedSignOut()).resolves.toBe(true);
  });
});

describe('error mapping', () => {
  it.each([
    ['auth/invalid-credential', 'invalid_credentials'],
    ['auth/wrong-password', 'invalid_credentials'],
    ['auth/user-not-found', 'invalid_credentials'],
    ['auth/too-many-requests', 'rate_limited'],
    ['auth/network-request-failed', 'network'],
    ['auth/invalid-email', 'validation'],
    ['auth/something-else', 'sign_in_failed'],
  ])('maps Firebase %s to %s', (firebaseCode, code) => {
    expect(mapFirebaseAuthError(Object.assign(new Error('x'), { code: firebaseCode }))).toMatchObject({ code });
  });

  it('puts the invalid-email message on the email field', () => {
    expect(mapFirebaseAuthError({ code: 'auth/invalid-email' }).fieldErrors).toEqual({
      email: 'Please enter a valid email address.',
    });
  });

  it('treats a cancelled or in-progress Google sign-in as no error', () => {
    expect(mapGoogleSignInError(Object.assign(new Error('x'), { code: 'SIGN_IN_CANCELLED' }))).toBeNull();
    expect(mapGoogleSignInError(Object.assign(new Error('x'), { code: 'IN_PROGRESS' }))).toBeNull();
    // Android's native values for statusCodes.SIGN_IN_CANCELLED and IN_PROGRESS.
    expect(mapGoogleSignInError(Object.assign(new Error('x'), { code: '12501' }))).toBeNull();
    expect(mapGoogleSignInError(Object.assign(new Error('x'), { code: 'ASYNC_OP_IN_PROGRESS' }))).toBeNull();
  });

  it.each([
    ['DEVELOPER_ERROR', 'google_config'],
    ['PLAY_SERVICES_NOT_AVAILABLE', 'play_services'],
    ['API_NOT_CONNECTED', 'network'],
    ['INTERNAL_ERROR', 'sign_in_failed'],
  ])('maps Google %s to %s', (message, code) => {
    expect(mapGoogleSignInError(new Error(message))).toMatchObject({ code });
  });

  it('passes AppErrors through unchanged', () => {
    const error = new AppError('network', 'x');
    expect(mapFirebaseAuthError(error)).toBe(error);
    expect(mapGoogleSignInError(error)).toBe(error);
  });
});
