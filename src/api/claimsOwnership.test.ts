import { afterEach, describe, expect, it, vi } from 'vitest';

// Frontend contract 2026-10: verification status read, land-ownership documents and the farmer
// appeal calls. fetch is stubbed; no backend or S3 is ever contacted. The routes and response
// shapes mirror the backend exactly (routes/claims.js, ownership.controller.js,
// ownershipEvidence.service.js serializeOwnershipRow, uploadPresign.service.js, appeal.controller.js).
vi.mock('../config', () => ({
  config: {
    apiUrl: 'https://api.test.local',
    cognito: { domain: '', clientId: '', redirectUri: 'https://app.test.local' },
    auth: { storageKeyPrefix: 'vivasayi.auth.test' },
  },
}));

import {
  attachOwnershipEvidence,
  getAppeal,
  getClaimVerification,
  getOwnershipDocumentUrl,
  listOwnershipEvidence,
  OWNERSHIP_DOCUMENT_ACCEPT,
  submitAppeal,
  uploadOwnershipDocument,
} from './claims';
import { clearAuthState, setAccessToken } from './client';

const API = 'https://api.test.local';
const PUT_URL = 'https://s3.bucket.local/owndoc-put';
const UPLOAD_ID = 'img_0b0b0b0b-1111-2222-3333-444444444444';

const ok = <T>(data: T) => ({ statusCode: 200, message: 'OK', data });
const json = (envelope: unknown, status = 200): Response =>
  new Response(JSON.stringify(envelope), { status, headers: { 'content-type': 'application/json' } });

const OWNERSHIP_ROW = {
  id: '65f0c0ffee0000000000abcd',
  claimId: 'c_1',
  source: 'OWNERSHIP',
  status: 'PENDING',
  reference: UPLOAD_ID,
  metadata: { parcelId: 'par_1', documentCategory: 'lease_agreement', mediaType: 'image/jpeg', size: 10 },
  result: null,
  provider: null,
  providerVersion: null,
  evidenceVersion: 'fp',
  evaluationVersion: '1',
  observedAt: null,
  operative: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

interface RequestLog {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}
let log: RequestLog[] = [];

const installFetch = (handler: (url: string, method: string) => Response): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers: Record<string, string> = {};
      Object.entries(init?.headers ?? {}).forEach(([k, v]) => {
        if (typeof v === 'string') headers[k] = v;
      });
      let body: unknown;
      try {
        body = JSON.parse(String(init?.body ?? 'null'));
      } catch {
        body = init?.body;
      }
      const method = init?.method ?? 'GET';
      log.push({ url, method, headers, body });
      return handler(url, method);
    })
  );
};

const ownershipHandler = (url: string, method: string): Response => {
  if (url === `${API}/upload/presign` && method === 'POST') {
    return json(ok({ uploadId: UPLOAD_ID, uploadUrl: PUT_URL, expiresIn: 300000 }));
  }
  if (url === PUT_URL && method === 'PUT') return new Response('', { status: 200 });
  if (url === `${API}/upload/${UPLOAD_ID}/complete` && method === 'POST') {
    return json(
      ok({
        uploadId: UPLOAD_ID,
        mediaType: 'image/jpeg',
        extension: 'jpg',
        size: 10,
        status: 'stored',
        processed: { mediaType: 'image/jpeg', size: 10, width: 8, height: 8 },
      })
    );
  }
  if (url === `${API}/claims/c_1/ownership` && method === 'POST') {
    return json(ok({ evidence: OWNERSHIP_ROW }));
  }
  if (url === `${API}/claims/c_1/ownership` && method === 'GET') {
    return json(
      ok({
        claimId: 'c_1',
        foundationVersion: '1',
        evidence: [OWNERSHIP_ROW],
        summary: {
          total: 1,
          pending: 1,
          reviewed: 0,
          statusCounts: { PENDING: 1 },
          authoritative: false,
          verificationAvailable: false,
        },
      })
    );
  }
  if (url === `${API}/claims/c_1/ownership/${OWNERSHIP_ROW.id}/url`) {
    return json(
      ok({ uploadId: UPLOAD_ID, mediaType: 'image/jpeg', signedUrl: 'https://s3.bucket.local/read', expiresIn: 300000 })
    );
  }
  return json({ statusCode: 404, message: 'not found', data: null }, 404);
};

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n%');

afterEach(() => {
  log = [];
  vi.unstubAllGlobals();
  clearAuthState();
});

describe('GET /claims/:id/verification', () => {
  it('reads the farmer status endpoint and returns { verification, claim }', async () => {
    setAccessToken('tok-1');
    installFetch((url) =>
      url === `${API}/claims/c_1/verification`
        ? json(ok({ verification: { claimId: 'c_1', persisted: [] }, claim: { id: 'c_1', state: 'submitted' } }))
        : json({ statusCode: 404, message: 'x', data: null }, 404)
    );
    const status = await getClaimVerification('c_1');
    expect(status.claim.state).toBe('submitted');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ method: 'GET', url: `${API}/claims/c_1/verification` });
    expect(log[0].headers.Authorization).toBe('Bearer tok-1');
  });
});

describe('land ownership documents', () => {
  it('upload → attach: presign (generic /upload) → S3 PUT → complete → POST ownership', async () => {
    setAccessToken('tok-1');
    installFetch(ownershipHandler);
    const file = new File([JPEG_BYTES as BlobPart], 'lease.jpg', { type: 'image/jpeg' });

    const evidence = await uploadOwnershipDocument('c_1', file, 'lease_agreement');

    expect(evidence).toMatchObject({ id: OWNERSHIP_ROW.id, status: 'PENDING' });
    expect(log.map((l) => `${l.method} ${l.url}`)).toEqual([
      `POST ${API}/upload/presign`,
      `PUT ${PUT_URL}`,
      `POST ${API}/upload/${UPLOAD_ID}/complete`,
      `POST ${API}/claims/c_1/ownership`,
    ]);
    expect(log[0].body).toEqual({ contentType: 'image/jpeg', size: JPEG_BYTES.length, filename: 'lease.jpg' });
    // The presigned URL is the credential: never the Bearer token.
    expect(log[1].headers.Authorization).toBeUndefined();
    expect(log[1].headers['Content-Type']).toBe('image/jpeg');
    // Attach sends only the stored uploadId and the category — no identity, no state.
    expect(log[3].body).toEqual({ uploadId: UPLOAD_ID, documentCategory: 'lease_agreement' });
  });

  it('omits documentCategory when none is chosen (backend defaults to "other")', async () => {
    installFetch(ownershipHandler);
    await attachOwnershipEvidence('c_1', { uploadId: UPLOAD_ID });
    expect(log[0].body).toEqual({ uploadId: UPLOAD_ID });
  });

  it('refuses a PDF before any network call (the upload pipeline accepts images only)', async () => {
    installFetch(ownershipHandler);
    const pdf = new File([PDF_BYTES as BlobPart], 'patta.pdf', { type: 'application/pdf' });
    await expect(uploadOwnershipDocument('c_1', pdf, 'land_record')).rejects.toMatchObject({ status: 400 });
    expect(log).toHaveLength(0);
    expect(OWNERSHIP_DOCUMENT_ACCEPT).toBe('image/jpeg,image/png,image/webp');
  });

  it('does not attach anything when the upload itself fails', async () => {
    installFetch((url, method) =>
      url === `${API}/upload/presign`
        ? json({ statusCode: 413, message: 'too big', data: null }, 413)
        : ownershipHandler(url, method)
    );
    const file = new File([JPEG_BYTES as BlobPart], 'deed.jpg', { type: 'image/jpeg' });
    await expect(uploadOwnershipDocument('c_1', file)).rejects.toMatchObject({ status: 413 });
    expect(log.some((l) => l.url.endsWith('/claims/c_1/ownership'))).toBe(false);
  });

  it('lists the attached documents with the non-authoritative summary', async () => {
    installFetch(ownershipHandler);
    const list = await listOwnershipEvidence('c_1');
    expect(list.evidence).toHaveLength(1);
    expect(list.evidence[0].metadata.documentCategory).toBe('lease_agreement');
    expect(list.summary.authoritative).toBe(false);
  });

  it('mints a short-lived signed url for one document', async () => {
    installFetch(ownershipHandler);
    const signed = await getOwnershipDocumentUrl('c_1', OWNERSHIP_ROW.id);
    expect(signed.signedUrl).toBe('https://s3.bucket.local/read');
    expect(signed.expiresIn).toBeGreaterThan(0);
  });
});

describe('farmer appeal', () => {
  it('getAppeal returns null when the backend answers { appeal: null }', async () => {
    installFetch(() => json(ok({ appeal: null })));
    await expect(getAppeal('c_1')).resolves.toBeNull();
    expect(log[0]).toMatchObject({ method: 'GET', url: `${API}/claims/c_1/appeal` });
  });

  it('submitAppeal POSTs { reason } and returns data.appeal', async () => {
    installFetch(() =>
      json(
        ok({
          appeal: {
            id: 'a1',
            status: 'submitted',
            reason: 'The whole field was flooded.',
            statement: null,
            evidence: [],
            decision: null,
            createdAt: '2026-10-02T00:00:00.000Z',
            resolvedAt: null,
          },
        })
      )
    );
    const appeal = await submitAppeal('c_1', { reason: 'The whole field was flooded.' });
    expect(appeal.status).toBe('submitted');
    expect(log[0]).toMatchObject({ method: 'POST', url: `${API}/claims/c_1/appeal` });
    expect(log[0].body).toEqual({ reason: 'The whole field was flooded.' });
  });
});
