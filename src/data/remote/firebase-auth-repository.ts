import { AppError, isAppError } from '@/core/errors';
import { systemClock, type Clock } from '@/core/runtime';
import type { SessionStore } from '@/data/local/session-store';
import type { AuthRepository } from '@/data/repositories';
import {
  isSessionExpired,
  userSchema,
  type AuthSession,
  type LoginCredentials,
  type User,
} from '@/features/auth/models';

import { AUTH_TOKEN_HEADER, type ApiClient } from './api-client';
import { accountInfoDtoSchema, firebaseAuthTokenResponseDtoSchema, noContentSchema } from './api-types';
import type { AuthCredentialStore } from './credential-store';
import type { FirebaseAuthGateway, FirebaseUserInfo } from './firebase-auth-gateway';

/** The backend user type this app accepts (`application.role` of glsstudentapi). */
export const STUDENT_ROLE = 'student';

/** Matches the backend's session timeout; Firebase itself keeps the user signed in. */
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface FirebaseAuthRepositoryOptions {
  client: ApiClient;
  firebase: FirebaseAuthGateway;
  credentials: AuthCredentialStore;
  sessionStore: SessionStore;
  clock?: Clock;
}

/**
 * Firebase sign-in exchanged for a backend session, ported from the mentor app:
 *
 * 1. Sign in with Firebase (email/password or Google).
 * 2. Exchange a fresh Firebase ID token at `POST /api/firebase-auth-token`
 *    (with this install's device id) for an `X-Auth-Token`, kept in secure storage.
 * 3. Load `GET /api/accountInfo` and require the `student` role.
 *
 * Interactive sign-in takes over from any other device (`forceTakeover=true`).
 * Session restore and silent re-authentication after a 401 do not
 * (`forceTakeover=false`); if another device has taken over, this device
 * signs out and reports it once through `consumeForcedSignOut`.
 */
export class FirebaseAuthRepository implements AuthRepository {
  private readonly clock: Clock;

  constructor(private readonly options: FirebaseAuthRepositoryOptions) {
    this.clock = options.clock ?? systemClock;
  }

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    const user = await this.options.firebase.signInWithEmail(credentials.email, credentials.password);
    return this.completeSignIn(user);
  }

  async loginWithGoogle(): Promise<AuthSession | null> {
    const user = await this.options.firebase.signInWithGoogle();
    return user ? this.completeSignIn(user) : null;
  }

  /**
   * Restores a persisted Firebase sign-in. If the backend cannot be reached,
   * the last stored session is kept so the user is not bounced to the login
   * screen while offline.
   */
  async getCurrentSession(): Promise<AuthSession | null> {
    const user = await this.options.firebase.getCurrentUser();
    if (!user) {
      await this.options.credentials.clearToken();
      await this.options.sessionStore.clear();
      return null;
    }

    try {
      await this.exchangeToken(false);
      return await this.loadSession(user);
    } catch (error) {
      if (isAppError(error) && error.code === 'device_conflict') {
        await this.options.credentials.setForcedSignOut();
        await this.discardLocalAuth();
        return null;
      }
      if (isAppError(error) && (error.code === 'wrong_role' || error.code === 'not_registered')) {
        await this.discardLocalAuth();
        return null;
      }
      const stored = await this.options.sessionStore.get();
      if (
        stored &&
        stored.mode === 'rest' &&
        stored.user.id === user.uid &&
        !isSessionExpired(stored, this.clock.now())
      ) {
        return stored;
      }
      throw error;
    }
  }

  /**
   * Tells the backend first, while the session token is still valid, so the
   * account's device slot is freed. That call is best effort; local sign-out
   * always completes.
   */
  async logout(): Promise<void> {
    try {
      if (await this.options.credentials.getToken()) {
        await this.options.client.request({
          method: 'GET',
          path: '/api/logout',
          schema: noContentSchema,
          // Re-authenticating just to sign out could take the session back from another device.
          reauthenticate: false,
        });
      }
    } catch {
      // Intentionally ignored; see method docs.
    }
    await this.options.credentials.clearToken();
    await this.options.sessionStore.clear();
    await this.options.firebase.signOutGoogle();
    await this.options.firebase.signOut();
  }

  consumeForcedSignOut(): Promise<boolean> {
    return this.options.credentials.consumeForcedSignOut();
  }

  /**
   * Silent re-authentication for `ApiClient` after a 401: refresh the Firebase
   * token and exchange it again without taking over from another device.
   */
  async reauthenticate(): Promise<string> {
    try {
      return await this.exchangeToken(false);
    } catch (error) {
      await this.options.credentials.clearToken().catch(() => undefined);
      if (isAppError(error) && error.code === 'device_conflict') {
        await this.options.credentials.setForcedSignOut().catch(() => undefined);
        await this.options.firebase.signOut().catch(() => undefined);
      }
      throw error;
    }
  }

  /** On any failure, drops the Firebase sign-in too, so a rejected account is not restored next launch. */
  private async completeSignIn(user: FirebaseUserInfo): Promise<AuthSession> {
    try {
      await this.exchangeToken(true);
      return await this.loadSession(user);
    } catch (error) {
      await this.discardLocalAuth();
      throw error;
    }
  }

  private async exchangeToken(forceTakeover: boolean): Promise<string> {
    const idToken = await this.options.firebase.getIdToken(true);
    const deviceId = await this.options.credentials.getOrCreateDeviceId();
    const query = new URLSearchParams({
      firebaseAuthToken: idToken,
      deviceId,
      forceTakeover: String(forceTakeover),
    });

    let headers: Headers;
    try {
      ({ headers } = await this.options.client.send({
        method: 'POST',
        path: `/api/firebase-auth-token?${query.toString()}`,
        schema: firebaseAuthTokenResponseDtoSchema,
        authenticated: false,
      }));
    } catch (error) {
      throw mapExchangeError(error);
    }

    const token = headers.get(AUTH_TOKEN_HEADER);
    if (!token) {
      throw new AppError('invalid_response', `Sign-in response did not include ${AUTH_TOKEN_HEADER}.`);
    }
    await this.options.credentials.setToken(token);
    return token;
  }

  private async loadSession(firebaseUser: FirebaseUserInfo): Promise<AuthSession> {
    const info = await this.options.client.request({
      method: 'GET',
      path: '/api/accountInfo',
      schema: accountInfoDtoSchema,
    });
    if (!info.roles?.includes(STUDENT_ROLE)) {
      throw new AppError('wrong_role', 'The signed-in account is not a student.');
    }

    const email = info.email || firebaseUser.email;
    const candidate: User = {
      id: firebaseUser.uid,
      email: email ?? '',
      displayName: info.name || firebaseUser.displayName || email?.split('@')[0] || 'Student',
    };
    const parsed = userSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new AppError('invalid_response', 'Account info has no usable email address.', {
        cause: parsed.error,
      });
    }

    const now = this.clock.now();
    const session: AuthSession = {
      user: parsed.data,
      mode: 'rest',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    };
    await this.options.sessionStore.save(session);
    return session;
  }

  /** Best effort: never masks the error that caused the sign-out. */
  private async discardLocalAuth(): Promise<void> {
    await this.options.credentials.clearToken().catch(() => undefined);
    await this.options.sessionStore.clear().catch(() => undefined);
    await this.options.firebase.signOutGoogle().catch(() => undefined);
    await this.options.firebase.signOut().catch(() => undefined);
  }
}

/**
 * `/api/firebase-auth-token` statuses:
 * 401 = the account belongs to another role (the body names that role's portal);
 * 403 = no backend user for this Firebase account;
 * 409 = another device holds the session and takeover was not requested.
 */
function mapExchangeError(error: unknown): unknown {
  if (!isAppError(error)) return error;
  if (error.code === 'unauthorized') {
    return new AppError('wrong_role', 'The backend rejected this account for the student app.', {
      status: error.status,
      cause: error,
    });
  }
  if (error.code === 'forbidden') {
    return new AppError('not_registered', 'No backend user for this Firebase account.', {
      status: error.status,
      cause: error,
    });
  }
  if (error.code === 'conflict') {
    return new AppError('device_conflict', 'The account is active on another device.', {
      status: error.status,
      cause: error,
    });
  }
  return error;
}
