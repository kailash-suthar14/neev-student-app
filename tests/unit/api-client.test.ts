import { z } from 'zod';

import { ApiClient } from '@/data/remote/api-client';
import { apiResponseSchema, noContentSchema } from '@/data/remote/api-types';

import { createMockFetch, jsonResponse } from '../helpers/http';

const itemSchema = apiResponseSchema(z.object({ id: z.string() }));

function client(fetchFn: ReturnType<typeof createMockFetch>['fetchFn'], extra: Partial<ConstructorParameters<typeof ApiClient>[0]> = {}) {
  return new ApiClient({ baseUrl: 'https://api.test/v1/', timeoutMs: 1000, fetchFn, ...extra });
}

describe('ApiClient', () => {
  it('sends JSON with standard headers and returns validated data', async () => {
    const { fetchFn, requests } = createMockFetch(() => jsonResponse(201, { data: { id: 'x' } }));
    const api = client(fetchFn, { getAccessToken: () => 'secret-token' });

    const result = await api.request({ method: 'POST', path: '/items', body: { a: 1 }, schema: itemSchema });

    expect(result).toEqual({ data: { id: 'x' } });
    expect(requests[0]).toEqual({
      url: 'https://api.test/v1/items',
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-token',
      },
      body: { a: 1 },
    });
  });

  it('omits Content-Type without a body and Authorization for unauthenticated calls', async () => {
    const { fetchFn, requests } = createMockFetch(() => jsonResponse(200, { data: { id: 'x' } }));
    await client(fetchFn, { getAccessToken: () => 't' }).request({
      method: 'GET',
      path: '/items',
      schema: itemSchema,
      authenticated: false,
    });
    expect(requests[0].headers).toEqual({ Accept: 'application/json' });
  });

  it('accepts empty 204 responses', async () => {
    const { fetchFn } = createMockFetch(() => new Response(null, { status: 204 }));
    await expect(
      client(fetchFn).request({ method: 'POST', path: '/x', schema: noContentSchema }),
    ).resolves.toBeUndefined();
  });

  it.each([
    [400, 'validation'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'conflict'],
    [422, 'validation'],
    [429, 'http'],
    [500, 'server'],
    [503, 'server'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const { fetchFn } = createMockFetch(() => jsonResponse(status, { error: { code: 'x', message: 'y' } }));
    await expect(
      client(fetchFn).request({ method: 'GET', path: '/items', schema: itemSchema }),
    ).rejects.toMatchObject({ code, status });
  });

  it('exposes field details from the error envelope but not the server message', async () => {
    const { fetchFn } = createMockFetch(() =>
      jsonResponse(422, {
        error: { code: 'invalid', message: 'internal detail', details: { q1: 'Required' } },
      }),
    );
    const error = await client(fetchFn)
      .request({ method: 'POST', path: '/items', schema: itemSchema })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'validation', fieldErrors: { q1: 'Required' } });
    expect((error as Error).message).not.toContain('internal detail');
  });

  it('maps non-JSON error bodies by status', async () => {
    const { fetchFn } = createMockFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(
      client(fetchFn).request({ method: 'GET', path: '/items', schema: itemSchema }),
    ).rejects.toMatchObject({ code: 'server', status: 502 });
  });

  it('notifies on 401 so credentials can be cleared', async () => {
    const onUnauthorized = jest.fn();
    const { fetchFn } = createMockFetch(() => jsonResponse(401));
    await expect(
      client(fetchFn, { onUnauthorized }).request({ method: 'GET', path: '/x', schema: itemSchema }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('maps fetch rejections to network errors', async () => {
    const { fetchFn } = createMockFetch(() => {
      throw new TypeError('Network request failed');
    });
    await expect(
      client(fetchFn).request({ method: 'GET', path: '/items', schema: itemSchema }),
    ).rejects.toMatchObject({ code: 'network' });
  });

  it('rejects malformed JSON in a success response', async () => {
    const { fetchFn } = createMockFetch(() => new Response('{nope', { status: 200 }));
    await expect(
      client(fetchFn).request({ method: 'GET', path: '/items', schema: itemSchema }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('rejects success responses that do not match the schema', async () => {
    const { fetchFn } = createMockFetch(() => jsonResponse(200, { data: { id: 42 } }));
    await expect(
      client(fetchFn).request({ method: 'GET', path: '/items', schema: itemSchema }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  describe('timeouts and cancellation', () => {
    const hangingFetch = jest.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')));
        }),
    );

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('aborts and reports a timeout', async () => {
      const promise = client(hangingFetch).request({ method: 'GET', path: '/slow', schema: itemSchema });
      jest.advanceTimersByTime(1000);
      await expect(promise).rejects.toMatchObject({ code: 'timeout' });
    });

    it('reports caller cancellation separately from timeouts', async () => {
      const controller = new AbortController();
      const promise = client(hangingFetch).request({
        method: 'GET',
        path: '/slow',
        schema: itemSchema,
        signal: controller.signal,
      });
      controller.abort();
      await expect(promise).rejects.toMatchObject({ code: 'cancelled' });
    });
  });
});
