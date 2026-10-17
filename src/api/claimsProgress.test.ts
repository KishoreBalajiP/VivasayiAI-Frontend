import { afterEach, describe, expect, it, vi } from 'vitest';

// GET /claims/:id/progress through the real envelope client (plan B4): the response is parsed at
// the edge, and a 429 / 503 carries the server's Retry-After and request id for the poller.
vi.mock('../config', () => ({
  config: {
    apiUrl: 'https://api.test.local',
    cognito: { domain: '', clientId: '', redirectUri: 'https://app.test.local' },
    auth: { storageKeyPrefix: 'vivasayi.auth.test' },
  },
}));

import { getClaimProgress, getClaimVerification } from './claims';
import { ApiClientError, parseRetryAfterMs } from './client';
import { PROGRESS_RESPONSE, rawProgress } from '../test/progressFixtures';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getClaimProgress', () => {
  it('CT-1: reads GET /claims/:id/progress and returns the parsed progress-v1 object', async () => {
    const fetchMock = vi.fn(async () => json(PROGRESS_RESPONSE));
    vi.stubGlobal('fetch', fetchMock);
    const progress = await getClaimProgress('6710c0ffee0000000000abcd');
    expect(fetchMock).toHaveBeenCalledWith('https://api.test.local/claims/6710c0ffee0000000000abcd/progress', expect.objectContaining({ method: 'GET' }));
    expect(progress?.overallStatus).toBe('in_progress');
    expect(progress?.stages.map((stage) => stage.id)).toEqual(['received', 'photos', 'land_documents', 'weather', 'area_checks', 'decision']);
  });

  it('CT-2: a response with another contract version resolves to null (never guessed)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ statusCode: 200, data: { progress: rawProgress('checks_running', { contractVersion: 'progress-v9' }) } })));
    await expect(getClaimProgress('c_1')).resolves.toBeNull();
  });

  it('CT-2: a 429 carries Retry-After (seconds or HTTP date) and the request id; a 404 stays a 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ statusCode: 429, message: 'Too many requests' }, 429, { 'retry-after': '120', 'x-request-id': 'req_abcdef12' }))
    );
    const error = await getClaimProgress('c_1').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 429, retryAfterMs: 120_000, requestId: 'req_abcdef12', message: 'rateLimited' });

    vi.stubGlobal('fetch', vi.fn(async () => json({ statusCode: 429 }, 429, { 'ratelimit-reset': '45', 'x-request-id': 'bad id!' })));
    expect(await getClaimProgress('c_1').catch((err: unknown) => err)).toMatchObject({ retryAfterMs: 45_000, requestId: null });

    vi.stubGlobal('fetch', vi.fn(async () => json({ statusCode: 404, message: 'Claim not found' }, 404)));
    expect(await getClaimProgress('c_1').catch((err: unknown) => err)).toMatchObject({ status: 404, retryAfterMs: null, requestId: null });

    const now = Date.parse('2026-10-16T09:00:00.000Z');
    expect(parseRetryAfterMs('Fri, 16 Oct 2026 09:01:30 GMT', now)).toBe(90_000);
    expect(parseRetryAfterMs('soon')).toBeNull();
    expect(parseRetryAfterMs('-5')).toBeNull();
    expect(parseRetryAfterMs('999999999')).toBeNull();
  });

  it('CT-2: an aborted read rejects (the poller tells an abort from a failure by its own signal)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
      )
    );
    const controller = new AbortController();
    const pending = getClaimProgress('c_1', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(ApiClientError);
  });

  it('the legacy verification read passes the abort signal through and exposes progress', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return json({ statusCode: 200, data: { verification: {}, claim: { id: 'c_1' }, progress: { contractVersion: 'progress-v1' } } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const status = await getClaimVerification('c_1', { signal: new AbortController().signal });
    expect(status.progress).toEqual({ contractVersion: 'progress-v1' });
  });
});
