import { AppError } from '@/core/errors';
import type { FirebaseAuthGateway, FirebaseUserInfo } from '@/data/remote/firebase-auth-gateway';

import { jsonResponse } from './http';

export const STUDENT_USER: FirebaseUserInfo = {
  uid: 'firebase-uid-1',
  email: 'student@example.com',
  displayName: null,
};

/** An in-memory Firebase stand-in. `user` is the currently signed-in Firebase user. */
export class FakeFirebaseAuth implements FirebaseAuthGateway {
  user: FirebaseUserInfo | null = null;
  password = 'Secret123!';
  googleUser: FirebaseUserInfo | null = STUDENT_USER;
  idTokens = 0;
  signOutCalls = 0;
  googleSignOutCalls = 0;

  constructor(private readonly account: FirebaseUserInfo = STUDENT_USER) {}

  async signInWithEmail(email: string, password: string): Promise<FirebaseUserInfo> {
    if (email !== this.account.email || password !== this.password) {
      throw new AppError('invalid_credentials', 'Firebase rejected the credentials.');
    }
    this.user = this.account;
    return this.account;
  }

  async signInWithGoogle(): Promise<FirebaseUserInfo | null> {
    this.user = this.googleUser;
    return this.googleUser;
  }

  async getCurrentUser(): Promise<FirebaseUserInfo | null> {
    return this.user;
  }

  async getIdToken(): Promise<string> {
    if (!this.user) throw new AppError('unauthorized', 'No authenticated Firebase user.');
    this.idTokens += 1;
    return `id-token-${this.idTokens}`;
  }

  async signOut(): Promise<void> {
    this.signOutCalls += 1;
    this.user = null;
  }

  async signOutGoogle(): Promise<void> {
    this.googleSignOutCalls += 1;
  }
}

/** `POST /api/firebase-auth-token` success: the session id arrives in the X-Auth-Token header. */
export function exchangeOk(token: string, body: Record<string, string> = { status: 'true' }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
  });
}

export function accountInfo(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse(200, {
    username: 'student@example.com',
    name: 'Asha',
    email: 'student@example.com',
    roles: ['student'],
    authorities: [],
    isActive: true,
    ...overrides,
  });
}
