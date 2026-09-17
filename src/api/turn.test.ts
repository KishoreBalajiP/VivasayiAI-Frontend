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

import { runImageTurn, uploadImage } from '../api';
import { ApiClientError } from '../api/client';
import type { UploadResult } from '../types';

const API = 'https://api.test.local';
const PRESIGN_URL = `${API}/upload/presign`;
const PUT_URL = 'https://s3.bucket.local/put-key';
const COMPLETE_URL = `${API}/upload/up_x/complete`;
const CHAT_URL = `${API}/chat`;

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const HEIC_BYTES = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
const JUNK_BYTES = new TextEncoder().encode('definitely not an image bytes');

const imageFile = (bytes: Uint8Array, name: string, type: string): File =>
  new File([bytes as BlobPart], name, { type });

const ok = <T>(data: T) => ({ statusCode: 200, message: 'OK', data });
const err = (status: number, message = 'failure') => ({ statusCode: status, message, data: null });

const UPLOAD_RESULT: UploadResult = {
  uploadId: 'up_x',
  mediaType: 'image/jpeg',
  extension: 'jpg',
  size: 10,
  status: 'stored',
  processed: { mediaType: 'image/jpeg', size: 10, width: 8, height: 8 },
};

const CHAT_RESULT = {
  chatId: 'chat_9',
  messages: [{ sender: 'ai' as const, text: 'ok', timestamp: new Date(0).toISOString() }],
  response: 'ok',
};

const json = (envelope: unknown, status = 200): Response =>
  new Response(JSON.stringify(envelope), {
    status,
    headers: { 'content-type': 'application/json' },
  });

interface Routes {
  presign: Response;
  put: Response;
  complete: Response;
  chat: Response;
}

const defaultRoutes = (): Routes => ({
  presign: json(ok({ uploadId: 'up_x', uploadUrl: PUT_URL, expiresIn: 300000 })),
  put: new Response('', { status: 200 }),
  complete: json(ok(UPLOAD_RESULT)),
  chat: json(ok(CHAT_RESULT)),
});

interface RequestLog {
  url: string;
  method: string;
  body: unknown;
}

let log: RequestLog[] = [];

const installFetch = (handler: (url: string) => Response): void => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let body: unknown;
    try {
      body = JSON.parse(String(init?.body ?? 'null'));
    } catch {
      body = init?.body;
    }
    log.push({ url, method: init?.method ?? 'GET', body });
    return handler(url);
  });
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
  vi.unstubAllGlobals();
});

describe('runImageTurn — E3 upload→chat sequencing', () => {
  it('successfully uploads and sends /chat exactly once, carrying the completed uploadId', async () => {
    const onUploaded = vi.fn();
    installFetch(makeHandler());

    const turn = await runImageTurn({
      file: imageFile(JPEG_BYTES, 'leaf.jpg', 'image/jpeg'),
      message: 'what is wrong with my crop?',
      language: 'en',
      onUploaded,
    });

    expect(turn).toEqual({ ok: true, data: expect.objectContaining({ chatId: 'chat_9' }) });
    expect(onUploaded).toHaveBeenCalledTimes(1);

    const chat = chatCalls();
    expect(chat).toHaveLength(1);
    expect(chat[0].body).toMatchObject({
      uploadId: 'up_x',
      message: 'what is wrong with my crop?',
      language: 'en',
    });

    // presign was declared with the sniffed canonical MIME + real byte size
    const presign = log.find((l) => l.url === PRESIGN_URL);
    expect(presign?.body).toMatchObject({ contentType: 'image/jpeg', size: JPEG_BYTES.byteLength });
  });

  it('uploads a valid JPEG with an EMPTY browser MIME using the sniffed canonical type', async () => {
    installFetch(makeHandler());
    const turn = await runImageTurn({
      file: imageFile(JPEG_BYTES, 'leaf.jpg', ''),
      message: 'hi',
      language: 'ta',
    });
    expect(turn.ok).toBe(true);
    expect(log.find((l) => l.url === PRESIGN_URL)?.body).toMatchObject({ contentType: 'image/jpeg' });
  });

  it('declares an unsupported camera MIME (image/heic) and surfaces the backend 400 WITHOUT calling /chat', async () => {
    installFetch(makeHandler({ presign: json(err(400, 'Unsupported image type'), 400) }));

    const turn = await runImageTurn({
      file: imageFile(HEIC_BYTES, 'camera.heic', 'image/heic'),
      message: 'x',
      language: 'en',
    });

    expect(turn).toEqual({ ok: false, failure: { phase: 'upload', status: 400 } });
    expect(log.find((l) => l.url === PRESIGN_URL)?.body).toMatchObject({ contentType: 'image/heic' });
    expect(chatCalls()).toHaveLength(0);
  });

  it('does NOT call /chat when the direct S3 PUT is rejected (403)', async () => {
    installFetch(makeHandler({ put: new Response('', { status: 403 }) }));

    const turn = await runImageTurn({
      file: imageFile(JPEG_BYTES, 'leaf.jpg', 'image/jpeg'),
      message: 'x',
      language: 'en',
    });

    expect(turn).toEqual({ ok: false, failure: { phase: 'upload', status: 403 } });
    expect(chatCalls()).toHaveLength(0);
  });

  it('does NOT call /chat when complete re-validation rejects the bytes (400)', async () => {
    installFetch(makeHandler({ complete: json(err(400, 'Image content mismatch'), 400) }));

    const turn = await runImageTurn({
      file: imageFile(JUNK_BYTES, 'broken.jpg', 'image/png'),
      message: 'x',
      language: 'en',
    });

    expect(turn).toEqual({ ok: false, failure: { phase: 'upload', status: 400 } });
    expect(chatCalls()).toHaveLength(0);
  });

  it('reports a /chat failure as phase = chat while still having sent a completed uploadId', async () => {
    const onUploaded = vi.fn();
    installFetch(makeHandler({ chat: json(err(500, 'vision model down'), 500) }));

    const turn = await runImageTurn({
      file: imageFile(JPEG_BYTES, 'leaf.jpg', 'image/jpeg'),
      message: 'x',
      language: 'en',
      onUploaded,
    });

    expect(turn).toEqual({ ok: false, failure: { phase: 'chat', status: 500 } });
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(chatCalls()[0].body).toMatchObject({ uploadId: 'up_x' });
  });

  it('maps a network failure during presign to phase=upload status=0', async () => {
    installFetch(() => {
      throw new TypeError('net::ERR_FAILED');
    });

    const turn = await runImageTurn({
      file: imageFile(JPEG_BYTES, 'leaf.jpg', 'image/jpeg'),
      message: 'x',
      language: 'en',
    });

    expect(turn).toEqual({ ok: false, failure: { phase: 'upload', status: 0 } });
  });

  it('refuses a non-image before any network call (status 400, zero fetches)', async () => {
    installFetch(makeHandler());

    const turn = await runImageTurn({
      file: imageFile(JUNK_BYTES, 'notes.txt', 'text/plain'),
      message: 'x',
      language: 'en',
    });

    expect(turn).toEqual({ ok: false, failure: { phase: 'upload', status: 400 } });
    expect(log).toHaveLength(0);
  });
});

describe('uploadImage — contentType resolution', () => {
  it('throws a 400 ApiClientError for non-image files without touching the network', async () => {
    installFetch(makeHandler());

    const failed = await uploadImage(imageFile(JUNK_BYTES, 'notes.txt', 'text/plain')).then(
      () => null,
      (e: unknown) => e
    );

    expect(failed).toBeInstanceOf(ApiClientError);
    expect((failed as ApiClientError).status).toBe(400);
    expect(log).toHaveLength(0);
  });
});