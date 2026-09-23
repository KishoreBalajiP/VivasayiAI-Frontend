import { afterEach, describe, expect, it, vi } from 'vitest';

// Deterministic mock config (turn.test pattern) — nothing from the real environment leaks in.
vi.mock('../config', () => ({
  config: {
    apiUrl: 'https://api.test.local',
    cognito: { domain: '', clientId: '', redirectUri: 'https://app.test.local' },
    auth: { storageKeyPrefix: 'vivasayi.auth.test' },
  },
}));

import { getChatImageUrl } from '../api';
import { ApiClientError, setAccessToken } from '../api/client';
import type { ChatImageView } from '../api';

const API = 'https://api.test.local';
const VIEW_URL = `${API}/upload/img_up_9/view`;

const json = (envelope: unknown, status = 200): Response =>
  new Response(JSON.stringify(envelope), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const ok = <T>(data: T) => ({ statusCode: 200, message: 'OK', data });
const err = (status: number, message = 'failure') => ({ statusCode: status, message, data: null });

const VIEW_RESULT: ChatImageView = {
  uploadId: 'img_up_9',
  mediaType: 'image/jpeg',
  signedUrl: 'https://mock-bucket.local/uploads/sub/img_up_9/image.jpg?X-Amz-Mock=1&Expires=300',
  expiresIn: 300000,
};

interface ViewLog {
  url: string;
  method: string;
  headers: Record<string, string>;
}

let log: ViewLog[] = [];

const installFetch = (handler: (url: string) => Response): void => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    if (init?.headers) Object.assign(headers, init.headers);
    log.push({ url, method: init?.method ?? 'GET', headers });
    return handler(url);
  });
  vi.stubGlobal('fetch', fetchMock);
};

afterEach(() => {
  log = [];
  setAccessToken(null);
  vi.unstubAllGlobals();
});

describe('getChatImageUrl — authorized persisted-chat image retrieval', () => {
  it('requests GET /upload/:uploadId/view and unwraps the signed-URL capability', async () => {
    installFetch(() => json(ok(VIEW_RESULT)));

    const view = await getChatImageUrl('img_up_9');

    expect(log).toHaveLength(1);
    expect(log[0].method).toBe('GET');
    expect(log[0].url).toBe(VIEW_URL);
    expect(view).toEqual(VIEW_RESULT);
    expect(view.signedUrl).toContain('X-Amz-Mock=1');
  });

  it('attaches the Bearer access token so ownership is derived server-side', async () => {
    installFetch(() => json(ok(VIEW_RESULT)));
    setAccessToken('tok-view-1');

    await getChatImageUrl('img_up_9');

    expect(log[0].headers.Authorization).toBe('Bearer tok-view-1');
  });

  it('encodes the uploadId path segment', async () => {
    installFetch(() => json(ok(VIEW_RESULT)));
    await getChatImageUrl('img_up_9/../evil');
    expect(log[0].url).toBe(`${API}/upload/img_up_9%2F..%2Fevil/view`);
  });

  it('maps a 404 (unowned / deleted / object-missing) to a typed ApiClientError(404)', async () => {
    installFetch(() => json(err(404, 'Image upload not found'), 404));

    const failed = await getChatImageUrl('img_up_9').then(
      () => null,
      (e: unknown) => e
    );

    expect(failed).toBeInstanceOf(ApiClientError);
    expect((failed as ApiClientError).status).toBe(404);
  });

  it('maps a 401 to a typed ApiClientError(401) (auth layer routes to login)', async () => {
    installFetch(() => json(err(401, 'Authentication required'), 401));

    const failed = await getChatImageUrl('img_up_9').then(
      () => null,
      (e: unknown) => e
    );

    expect(failed).toBeInstanceOf(ApiClientError);
    expect((failed as ApiClientError).status).toBe(401);
  });

  it('maps a network failure to status 0 without a raw message', async () => {
    installFetch(() => {
      throw new TypeError('net::ERR_FAILED');
    });

    const failed = await getChatImageUrl('img_up_9').then(
      () => null,
      (e: unknown) => e
    );

    expect(failed).toBeInstanceOf(ApiClientError);
    expect((failed as ApiClientError).status).toBe(0);
  });
});