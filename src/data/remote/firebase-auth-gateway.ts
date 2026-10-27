import { AppError, isAppError } from '@/core/errors';

export interface FirebaseUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
}

/**
 * The Firebase and Google Sign-In calls the auth repository needs. Every
 * method rejects with an AppError. Tests inject a fake instead of the
 * native modules.
 */
export interface FirebaseAuthGateway {
  signInWithEmail(email: string, password: string): Promise<FirebaseUserInfo>;
  /** Resolves null when the user dismisses the account picker; that is not an error. */
  signInWithGoogle(): Promise<FirebaseUserInfo | null>;
  /** The persisted Firebase user, once Firebase has finished restoring it. */
  getCurrentUser(): Promise<FirebaseUserInfo | null>;
  getIdToken(forceRefresh: boolean): Promise<string>;
  signOut(): Promise<void>;
  /** Revokes the Google session so the picker offers account selection next time. */
  signOutGoogle(): Promise<void>;
}

function codeOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const { code } = error as { code: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** Firebase email/password error codes, as handled by the mentor app. */
export function mapFirebaseAuthError(error: unknown): AppError {
  if (isAppError(error)) return error;
  switch (codeOf(error)) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return new AppError('invalid_credentials', 'Firebase rejected the credentials.', { cause: error });
    case 'auth/too-many-requests':
      return new AppError('rate_limited', 'Firebase is throttling sign-in attempts.', { cause: error });
    case 'auth/network-request-failed':
      return new AppError('network', 'Firebase sign-in failed: network unavailable.', { cause: error });
    case 'auth/invalid-email':
      return new AppError('validation', 'Firebase rejected the email address.', {
        cause: error,
        fieldErrors: { email: 'Please enter a valid email address.' },
      });
    default:
      return new AppError('sign_in_failed', 'Firebase sign-in failed.', { cause: error });
  }
}

// google-signin reads its statusCodes from the native module, so they are
// matched by value here: Android reports a cancel as GoogleSignInStatusCodes
// 12501 and a concurrent call as ASYNC_OP_IN_PROGRESS.
const ANDROID_SIGN_IN_CANCELLED = '12501';

/**
 * Google Sign-In failures. Returns null for a dismissed picker or a sign-in
 * already in progress, which the caller treats as "nothing happened".
 */
export function mapGoogleSignInError(error: unknown): AppError | null {
  if (isAppError(error)) return error;
  const code = codeOf(error);
  const message = error instanceof Error ? error.message : String(error ?? '');
  const has = (text: string) => code === text || message.includes(text);

  if (code === ANDROID_SIGN_IN_CANCELLED || has('SIGN_IN_CANCELLED') || message.includes('cancelled')) {
    return null;
  }
  if (code?.endsWith('IN_PROGRESS') || has('IN_PROGRESS')) return null;
  if (has('DEVELOPER_ERROR') || code === '10') {
    return new AppError('google_config', 'Google Sign-In DEVELOPER_ERROR.', { cause: error });
  }
  if (has('API_NOT_CONNECTED')) {
    return new AppError('network', 'Google services not connected.', { cause: error });
  }
  if (has('PLAY_SERVICES_NOT_AVAILABLE') || message.includes('Play Services')) {
    return new AppError('play_services', 'Google Play Services unavailable.', { cause: error });
  }
  return new AppError('sign_in_failed', 'Google Sign-In failed.', { cause: error });
}

/**
 * Native implementation, loaded on demand: importing this module (and mock
 * mode) never touches the native Firebase modules. A binary without them
 * (Expo Go, or a dev build made before Firebase was added) then fails only in
 * REST mode, with a config error instead of a crash at startup.
 */
export function createFirebaseAuthGateway(googleWebClientId: string): FirebaseAuthGateway {
  let native: typeof import('./firebase-native-gateway');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    native = require('./firebase-native-gateway') as typeof import('./firebase-native-gateway');
  } catch (cause) {
    throw new AppError(
      'config',
      'Native Firebase modules are missing. Rebuild with `npx expo run:android`; Expo Go cannot run REST mode.',
      { cause },
    );
  }
  return native.createNativeFirebaseAuthGateway(googleWebClientId);
}
