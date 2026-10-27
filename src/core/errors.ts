/**
 * Application-wide error type. Every layer (storage, network, services)
 * converts unknown failures into an AppError so the UI can render a
 * consistent, non-sensitive message.
 */
export type AppErrorCode =
  | 'validation'
  | 'invalid_credentials'
  | 'rate_limited'
  | 'sign_in_failed'
  | 'not_registered'
  | 'wrong_role'
  | 'device_conflict'
  | 'google_config'
  | 'play_services'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'storage'
  | 'corrupt_data'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'http'
  | 'server'
  | 'invalid_response'
  | 'config'
  | 'unknown';

export type FieldErrors = Readonly<Record<string, string>>;

export interface AppErrorOptions {
  status?: number;
  fieldErrors?: FieldErrors;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status?: number;
  readonly fieldErrors?: FieldErrors;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = options.status;
    this.fieldErrors = options.fieldErrors;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function toAppError(value: unknown, fallbackMessage = 'Something went wrong.'): AppError {
  if (isAppError(value)) return value;
  return new AppError('unknown', fallbackMessage, { cause: value });
}

const USER_MESSAGES: Record<AppErrorCode, string> = {
  validation: 'Please check the highlighted fields.',
  invalid_credentials: 'The email or password is incorrect.',
  rate_limited: 'Too many failed attempts. Please try again later.',
  sign_in_failed: 'Sign in failed. Please try again.',
  not_registered: 'You are not a registered user.',
  wrong_role: 'This app is for students only. Please sign in with a student account.',
  device_conflict:
    'You’ve been signed out because your account was signed in on another device. Please sign in again to continue.',
  google_config:
    'Google Sign-In configuration error. Ensure the app SHA-1 is registered in Firebase Console.',
  play_services: 'Google Play Services is not available on this device.',
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have permission to do that.',
  not_found: 'The requested item could not be found.',
  conflict: 'This conflicts with newer data. Please reload and try again.',
  storage: 'Your device storage could not be accessed. Please try again.',
  corrupt_data: 'Some saved data could not be read.',
  network: 'You appear to be offline. Check your connection and try again.',
  timeout: 'The server took too long to respond. Please try again.',
  cancelled: 'The request was cancelled.',
  http: 'The server could not complete the request.',
  server: 'The server encountered an error. Please try again later.',
  invalid_response: 'The server sent an unexpected response.',
  config: 'The app is not configured correctly.',
  unknown: 'Something went wrong. Please try again.',
};

/** A safe, human-readable message for display. Never includes raw server payloads. */
export function getUserMessage(error: unknown): string {
  return USER_MESSAGES[toAppError(error).code];
}
