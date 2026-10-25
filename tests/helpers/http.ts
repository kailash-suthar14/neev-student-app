import type { FetchFn } from '@/data/remote/api-client';

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Responder = (req: RecordedRequest) => Response | Promise<Response>;

export function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A fetch double that records requests and answers from a queue of responders. */
export function createMockFetch(...responders: Responder[]) {
  const requests: RecordedRequest[] = [];
  const fetchFn: FetchFn = jest.fn(async (input: string, init?: RequestInit) => {
    const req: RecordedRequest = {
      url: input,
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers as Record<string, string>) },
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    requests.push(req);
    const responder = responders.shift();
    if (!responder) throw new Error(`Unexpected request ${req.method} ${req.url}`);
    return responder(req);
  });
  return { fetchFn, requests };
}
