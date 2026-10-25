/**
 * Application-wide error type. Every layer (storage, network, services)
 * converts unknown failures into an AppError so the UI can render a
 * consistent, non-sensitive message.
 */
export type AppErrorCode =
  | 'validation'
  | 'invalid_credentials'
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
