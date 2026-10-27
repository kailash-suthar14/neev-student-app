import type { z } from 'zod';

import { AppError, isAppError, type AppErrorCode } from '@/core/errors';

import { apiErrorBodySchema } from './api-types';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** The backend identifies the session with this header (Spring Session). */
export const AUTH_TOKEN_HEADER = 'X-Auth-Token';

export interface ApiClientConfig {
  baseUrl: string;
  timeoutMs: number;
  fetchFn: FetchFn;
  getAccessToken?: () => string | null | Promise<string | null>;
  /**
   * Obtains a fresh session token after a 401. The failed request is retried
   * once with it. Concurrent 401s share a single call.
   */
  reauthenticate?: () => Promise<string>;
  /** Called on a 401 that could not be recovered, so the app can clear credentials. */
  onUnauthorized?: () => void;
}

export interface ApiResult<T> {
  data: T;
  headers: Headers;
}

export interface ApiRequest<T> {
  method: HttpMethod;
  /** Path relative to the base URL, starting with `/`. Encode path params before passing. */
  path: string;
  schema: z.ZodType<T>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Attach the session token when available. Defaults to true. */
  authenticated?: boolean;
  /** Try `reauthenticate` once on a 401. Defaults to true for authenticated requests. */
  reauthenticate?: boolean;
}

function codeForStatus(status: number): AppErrorCode {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status >= 500) return 'server';
  return 'http';
}

function isUnauthorized(error: unknown): error is AppError {
  return isAppError(error) && error.code === 'unauthorized';
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Thin, typed fetch wrapper. Responsibilities: JSON encoding, headers,
 * timeout/cancellation, HTTP status validation, response schema validation
 * and mapping every failure to an AppError.
 *
 * It never logs request or response bodies, so passwords, tokens and
 * survey answers do not end up in device logs. Error messages include only
 * method, path and status.
 */
export class ApiClient {
  private reauthInFlight: Promise<string> | null = null;

  constructor(private readonly config: ApiClientConfig) {}

  async request<T>(req: ApiRequest<T>): Promise<T> {
    return (await this.send(req)).data;
  }

  /** Like `request`, but also returns the response headers. */
  async send<T>(req: ApiRequest<T>): Promise<ApiResult<T>> {
    const authenticated = req.authenticated !== false;
    const pending = authenticated ? this.config.getAccessToken?.() : null;
    // Await only a real promise, so a synchronous token keeps the request (and its timeout) in this tick.
    const token = pending instanceof Promise ? await pending : pending;
    try {
      return await this.execute(req, token ?? null);
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
      const canRetry = authenticated && req.reauthenticate !== false && !!this.config.reauthenticate;
      if (!canRetry) {
        this.config.onUnauthorized?.();
        throw error;
      }
      let freshToken: string;
      try {
        freshToken = await this.reauthenticateOnce();
      } catch {
        this.config.onUnauthorized?.();
        throw error;
      }
      try {
        return await this.execute(req, freshToken);
      } catch (retryError) {
        if (isUnauthorized(retryError)) this.config.onUnauthorized?.();
        throw retryError;
      }
    }
  }

  private reauthenticateOnce(): Promise<string> {
    this.reauthInFlight ??= this.config.reauthenticate!().finally(() => {
      this.reauthInFlight = null;
    });
    return this.reauthInFlight;
  }

  private async execute<T>(req: ApiRequest<T>, token: string | null): Promise<ApiResult<T>> {
    // The query string can carry credentials (the Firebase ID token), so keep it out of messages.
    const label = `${req.method} ${req.path.split('?')[0]}`;
    const headers: Record<string, string> = { Accept: 'application/json', ...req.headers };
    if (req.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers[AUTH_TOKEN_HEADER] = token;

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.timeoutMs);
    const forwardAbort = () => controller.abort();
    req.signal?.addEventListener('abort', forwardAbort);

    const transportError = (cause: unknown, fallback: AppError): AppError => {
      if (timedOut) return new AppError('timeout', `${label} timed out.`, { cause });
      if (controller.signal.aborted) return new AppError('cancelled', `${label} was cancelled.`, { cause });
      return fallback;
    };

    let response: Response;
    let text: string;
    try {
      if (req.signal?.aborted) controller.abort();
      try {
        response = await this.config.fetchFn(joinUrl(this.config.baseUrl, req.path), {
          method: req.method,
          headers,
          body: req.body === undefined ? undefined : JSON.stringify(req.body),
          signal: controller.signal,
        });
      } catch (cause) {
        throw transportError(
          cause,
          new AppError('network', `${label} failed: network unavailable.`, { cause }),
        );
      }
      // The timeout also covers reading the body.
      try {
        text = await response.text();
      } catch (cause) {
        throw transportError(
          cause,
          new AppError('network', `${label} response could not be read.`, { cause }),
        );
      }
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener('abort', forwardAbort);
    }

    let json: unknown;
    if (text.trim() !== '') {
      try {
        json = JSON.parse(text);
      } catch (cause) {
        if (!response.ok) throw this.httpError(response.status, label, undefined);
        throw new AppError('invalid_response', `${label} returned malformed JSON.`, { cause });
      }
    }

    if (!response.ok) throw this.httpError(response.status, label, json);

    const parsed = req.schema.safeParse(json);
    if (!parsed.success) {
      throw new AppError('invalid_response', `${label} returned an unexpected response shape.`, {
        status: response.status,
        cause: parsed.error,
      });
    }
    return { data: parsed.data, headers: response.headers };
  }

  private httpError(status: number, label: string, body: unknown): AppError {
    const parsed = apiErrorBodySchema.safeParse(body);
    return new AppError(codeForStatus(status), `${label} failed with HTTP ${status}.`, {
      status,
      fieldErrors: parsed.success ? parsed.data.error.details : undefined,
    });
  }
}
