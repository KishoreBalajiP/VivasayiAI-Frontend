// @vitest-environment node
// api/client.ts reads/writes sessionStorage through the auth token helper.
import { afterEach, describe, expect, it, vi } from 'vitest';

// Deterministic backend mock for the E3 image-turn flow. The real ../config (and its
// import-time window.location.origin read) is replaced entirely — nothing from the real
// environment leaks into these tests.
vi.mock('../config', () => ({
  config: {
    apiUrl: 'https://api.test.local',
    cognito: { domain: '', clientId: '', redirectUri: 'https://app.test.local' },
    auth: { storageKeyPrefix: 'vivasayi.auth.test' },
  },
}));

import { runImageTurn } from '../api';
import type { UploadResult } from '../types';

const API = 'https://api.test.local';
const PRESIGN_URL = `${API}/upload/presign`;
const PUT_URL = 'https://s3.bucket.local/put-key';
const COMPLETE_URL = `${API}/upload/up_x/complete`;
const CHAT_URL = `${API}/chat`;

// Real 1x1 PNG magic bytes — required so the client-side magic-byte sniff in
// src/utils/imageValidation accepts the file before presign is called. The backend
// re-validates the actual bytes anyway. Written as a plain byte array (not Buffer) so this
// file needs no @types/node include in the browser tsconfig.
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

const imageFile = (): File => new File([PNG_BYTES as BlobPart], 'leaf.png', { type: 'image/png' });

const ok = <T>(data: T) => ({ statusCode: 200, message: 'OK', data });
const err = (status: number, message = 'failure') => ({ statusCode: status, message, data: null });

const UPLOAD_RESULT: UploadResult = {
  uploadId: 'up_x',
  mediaType: 'image/png',
  extension: 'png',
  size: PNG_BYTES.length,
  status: 'stored',
  processed: { mediaType: 'image/png', size: PNG_BYTES.length, width: 1, height: 1 },
};

const CHAT_OK = {
  chatId: 'chat_9',
  messages: [{ sender: 'ai' as const, text: 'ok', timestamp: new Date(0).toISOString() }],
  response: 'ok',
  uploadId: 'up_x',
};

const json = (envelope: unknown, status = 200): Response =>
  new Response(JSON.stringify(envelope), { status, headers: { 'content-type': 'application/json' } });

interface Routes {
  presign: Response;
  put: Response;
  complete: Response;
  chat: Response;
}

const defaultRoutes = (): Routes => ({
  presign: json(ok({ uploadId: 'up_x', uploadUrl: PUT_URL, expiresIn: 300000 })),
  put: new Response('', { status: 200, headers: { etag: '"x"' } }),
  complete: json(ok(UPLOAD_RESULT)),
  chat: json(ok(CHAT_OK)),
});

interface RequestLog {
  url: string;
  method: string;
  body: unknown;
}

let log: RequestLog[] = [];

// The spy is module-scoped (mirroring turn.test.ts) so it can be installed per test, but the
// route table it delegates to is swapped through this ref rather than rebuilding the spy.
const handlerRef: { current: ((url: string) => Response) | null } = { current: null };

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  let body: unknown;
  try {
    body = JSON.parse(String(init?.body ?? 'null'));
  } catch {
    body = init?.body;
  }
  log.push({ url, method: init?.method ?? 'GET', body });
  return handlerRef.current!(url);
});

const installFetch = (handler: (url: string) => Response): void => {
  handlerRef.current = handler;
  vi.stubGlobal('fetch', fetchMock);
};

const makeHandler = (overrides: Partial<Routes> = {}) => {
  const routes = { ...defaultRoutes(), ...overrides };
  return (url: string): Response => {
    if (url === PRESIGN_URL) return routes.presign;
    if (url === PUT_URL) return routes.put;
    if (url === COMPLETE_URL) return routes.complete;
    if (url === CHAT_URL) return routes.chat;
    return json(err(404));
  };
};

const chatCalls = (): RequestLog[] => log.filter((l) => l.url.endsWith('/chat'));

afterEach(() => {
  log = [];
  // The spy is module-scoped (mirroring turn.test.ts) so it survives vi.unstubAllGlobals();
  // its call history must be cleared explicitly or counts accumulate across tests.
  fetchMock.mockClear();
  handlerRef.current = null;
  vi.unstubAllGlobals();
});

describe('AI-503 frontend regression: chat image flow', () => {
  it('AI-503-FE1: a successful chat image turn issues exactly one presign, one PUT, one complete, and one /chat request', async () => {
    installFetch(makeHandler());

    const turn = await runImageTurn({
      file: imageFile(),
      message: 'diagnose this crop',
      language: 'en',
    });

    expect(turn.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(String(urls[0])).toContain('/upload/presign');
    expect(String(urls[1])).toBe(PUT_URL);
    expect(String(urls[2])).toContain('/upload/up_x/complete');
    expect(String(urls[3])).toBe(CHAT_URL);
  });

  it('AI-503-FE2: an AI provider 5xx during /chat issues exactly one /chat request and never retries', async () => {
    installFetch(
      makeHandler({
        chat: json(err(500, 'AI service did not respond in time'), 500),
      }),
    );

    const turn = await runImageTurn({
      file: imageFile(),
      message: 'diagnose this crop',
      language: 'en',
    });

    expect(turn).toEqual({ ok: false, failure: { phase: 'chat', status: 500 } });
    // 4 total: presign + PUT + complete + ONE /chat (no auto-retry).
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(chatCalls()).toHaveLength(1);
  });

  it('AI-503-FE3: an image-upload rejection issues only the presign (no /chat, no retries)', async () => {
    installFetch(
      makeHandler({
        presign: json(err(413, 'Image exceeds the maximum allowed size'), 413),
      }),
    );

    const turn = await runImageTurn({
      file: imageFile(),
      message: 'diagnose this crop',
      language: 'en',
    });

    expect(turn).toEqual({ ok: false, failure: { phase: 'upload', status: 413 } });
    // ONE presign — no PUT, no complete, no /chat.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/upload/presign');
    expect(chatCalls()).toHaveLength(0);
  });

  it('AI-503-FE4: one user action never produces a duplicate /chat request, even when the provider is slow', async () => {
    installFetch(makeHandler());

    await runImageTurn({ file: imageFile(), message: 'go', language: 'en' });
    expect(chatCalls()).toHaveLength(1);
  });
});
