import { afterEach, describe, expect, it, vi } from 'vitest';

// Deterministic backend mock for the Phase 7 claim API module. The real ../config is replaced
// entirely (it reads window.location.origin at import time) — nothing leaks from this env.
vi.mock('../config', () => ({
  config: {
    apiUrl: 'https://api.test.local',
    cognito: { domain: '', clientId: '', redirectUri: 'https://app.test.local' },
    auth: { storageKeyPrefix: 'vivasayi.auth.test' },
  },
}));

import {
  completeEvidenceUpload,
  createClaim,
  deleteEvidenceUpload,
  getClaim,
  getEvidenceUrl,
  listClaims,
  listParcels,
  presignEvidence,
  resubmitClaim,
  submitClaim,
  uploadClaimEvidence,
  verifyClaimRequest,
  withdrawClaim,
} from './claims';
import { clearAuthState, registerUnauthorizedHandler, setAccessToken } from './client';
import { ApiClientError } from './client';
import type { ClaimCreateInput, GeoJsonPolygon, LossClaim, VerificationDecision } from '../types';

const API = 'https://api.test.local';
const CLAIMS = `${API}/claims`;
const PARCELS = `${API}/profile/parcels`;
const PUT_URL = 'https://s3.bucket.local/put-key';

const POLYGON: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [78.1, 11.1],
      [78.2, 11.1],
      [78.2, 11.2],
      [78.1, 11.2],
      [78.1, 11.1],
    ],
  ],
};

const CLAIM: LossClaim = {
  id: 'c_1',
  parcelId: 'par_123',
  parcelSnapshot: { parcelId: 'par_123', name: 'North Field', crop: 'Rice', parcelAreaAcres: 2.5 },
  eventType: 'flood',
  eventDate: '2026-09-02',
  claimedGeometry: POLYGON,
  claimedAreaAcres: 2.5,
  evidence: [],
  state: 'submitted',
  submittedAt: '2026-09-02T02:00:00.000Z',
  processedAt: null,
  decidedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  assessment: null,
};

const DECISION: VerificationDecision = {
  claimId: 'c_1',
  idempotent: true,
  inProgress: false,
  claimState: 'verified',
  outcome: 'verified',
  reason: null,
  rules: { timelinessCheck: { passed: true } },
  approvedGeometry: POLYGON,
  approvedAreaAcres: 2.5,
  weatherCorrelation: null,
  decidedAt: '2026-09-03T00:00:00.000Z',
  decidedBy: 'engine',
  claimedAreaAcres: 2.5,
  parcelAreaAcres: 2.5,
  evidenceVersion: 'v1',
  engineVersion: 'engine-1',
};

const ok = <T>(data: T) => ({ statusCode: 200, message: 'OK', data });
const err = (status: number, message = 'failure') => ({ statusCode: status, message, data: null });

const json = (envelope: unknown, status = 200): Response =>
  new Response(JSON.stringify(envelope), { status, headers: { 'content-type': 'application/json' } });

interface RequestLog {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let log: RequestLog[] = [];

interface Routes {
  list: Response;
  create: Response;
  get: Response;
  parcels: Response;
  presign: Response;
  put: Response;
  complete: Response;
  url: Response;
  verify: Response;
  del: Response;
  submit: Response;
  withdraw: Response;
  resubmit: Response;
}

const defaultRoutes = (overrides: Partial<Routes> = {}): Routes => ({
  list: json(ok({ claims: [CLAIM] })),
  create: json(ok({ claim: CLAIM })),
  get: json(ok({ claim: CLAIM })),
  parcels: json(ok({ parcels: [{ ...CLAIM.parcelSnapshot, parcelId: 'par_123', geometry: POLYGON, calculatedAreaAcres: 2.5, createdAt: '', updatedAt: '' }] })),
  presign: json(ok({ uploadId: 'img_1', uploadUrl: PUT_URL, expiresIn: 300 }), 200),
  put: new Response('', { status: 200 }),
  complete: json(ok({ evidence: { uploadId: 'img_1', mediaType: 'image/jpeg', size: 100, width: 8, height: 8, status: 'stored', uploadedAt: '', createdAt: '' } })),
  url: json(ok({ url: `${API}/read-key`, expiresIn: 300 })),
  verify: json(ok({ verification: DECISION })),
  del: json(ok({ removed: true })),
  submit: json(ok({ claim: CLAIM })),
  withdraw: json(ok({ claim: CLAIM })),
  resubmit: json(ok({ claim: CLAIM })),
  ...overrides,
});

const makeHandler = (routes: Routes = defaultRoutes()) => {
  return (url: string, method: string): Response => {
    if (url === CLAIMS && method === 'GET') return routes.list;
    if (url === CLAIMS && method === 'POST') return routes.create;
    if (url === `${CLAIMS}/c_1`) return routes.get;
    if (url === `${CLAIMS}/c_1/submit`) return routes.submit;
    if (url === `${CLAIMS}/c_1/withdraw`) return routes.withdraw;
    if (url === `${CLAIMS}/c_1/resubmit`) return routes.resubmit;
    if (url === `${CLAIMS}/c_1/verify`) return routes.verify;
    if (url === PARCELS) return routes.parcels;
    if (url === `${CLAIMS}/c_1/evidence/presign`) return routes.presign;
    if (url === PUT_URL) return routes.put;
    if (url === `${CLAIMS}/c_1/evidence/img_1/complete`) return routes.complete;
    if (url === `${CLAIMS}/c_1/evidence/img_1/url`) return routes.url;
    if (url === `${CLAIMS}/c_1/evidence/img_1` && method === 'DELETE') return routes.del;
    return json(err(404));
  };
};

const installFetch = (routes: Routes = defaultRoutes()): void => {
  const handler = makeHandler(routes);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
  });
  vi.stubGlobal('fetch', fetchMock);
};

const imageFile = (bytes: Uint8Array, name: string, type: string): File =>
  new File([bytes as BlobPart], name, { type });

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

afterEach(() => {
  log = [];
  vi.unstubAllGlobals();
  clearAuthState();
});

// ── AUTH: authenticated transport — identity is NEVER part of the payload ────────────────

describe('claim API authentication', () => {
  it('attaches the backend access token but never identity fields', async () => {
    setAccessToken('tok-test-123');
    installFetch();
    await listClaims();
    const call = log.find((l) => l.url === CLAIMS);
    expect(call?.headers.Authorization).toBe('Bearer tok-test-123');
    // GET has no body — and critically, no identity/authority fields are ever sent.
    expect(call?.body).toBeNull();
  });

  it('rides the client unauthorized handler (AUTH flow) when the backend returns 401', async () => {
    const onUnauthorized = vi.fn();
    registerUnauthorizedHandler(onUnauthorized);
    setAccessToken('expired');
    installFetch(defaultRoutes({ list: json(err(401, 'Unauthorized'), 401) }));
    await expect(listClaims()).rejects.toThrow(ApiClientError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('never sends cognitoSub/userEmail/state on create', async () => {
    const input: ClaimCreateInput = {
      parcelId: 'par_123',
      eventType: 'flood',
      eventDate: '2026-09-02',
      geometry: POLYGON,
      idempotencyKey: 'abc-12345',
    };
    installFetch();
    await createClaim(input);
    const createCall = log.find((l) => l.url === CLAIMS && l.method === 'POST');
    const body = createCall?.body as Record<string, unknown>;
    expect(body).toEqual({
      parcelId: 'par_123',
      eventType: 'flood',
      eventDate: '2026-09-02',
      geometry: POLYGON,
      idempotencyKey: 'abc-12345',
    });
    expect(JSON.stringify(body)).not.toMatch(/cognitoSub|userEmail|sub_|state|outcome|result/i);
  });
});

// ── /claims lifecycle ─────────────────────────────────────────────────────────────────────

describe('claim lifecycle API', () => {
  it('lists the caller claims from data.claims', async () => {
    installFetch();
    const claims = await listClaims();
    expect(claims[0].id).toBe('c_1');
  });

  it('creates a draft claim and returns data.claim', async () => {
    installFetch();
    const claim = await createClaim({
      parcelId: 'par_123',
      eventType: 'drought',
      eventDate: '2026-09-02',
      geometry: POLYGON,
      idempotencyKey: 'abc-12345',
    });
    expect(claim.id).toBe('c_1');
    expect(claim.state).toBe('submitted');
  });

  it('fetches a single claim with its assessment from data.claim', async () => {
    installFetch(defaultRoutes({ get: json(ok({ claim: { ...CLAIM, assessment: { state: 'verified' } } })) }));
    const claim = await getClaim('c_1');
    expect(claim.assessment?.state).toBe('verified');
  });

  it('submit/withdraw/resubmit hit the exact machine endpoints with POST and no body', async () => {
    installFetch();
    await submitClaim('c_1');
    await withdrawClaim('c_1');
    await resubmitClaim('c_1');
    expect(log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: `${CLAIMS}/c_1/submit`, method: 'POST' }),
        expect.objectContaining({ url: `${CLAIMS}/c_1/withdraw`, method: 'POST' }),
        expect.objectContaining({ url: `${CLAIMS}/c_1/resubmit`, method: 'POST' }),
      ])
    );
    const refresh = log.find((l) => l.url === `${CLAIMS}/c_1/submit`);
    expect(refresh?.body).toBeNull();
  });

  it('verify posts WITH NO BODY and returns data.verification', async () => {
    installFetch(defaultRoutes({ verify: json(ok({ verification: DECISION })) }));
    const decision = await verifyClaimRequest('c_1');
    expect(decision.outcome).toBe('verified');
    const verifyCall = log.find((l) => l.url === `${CLAIMS}/c_1/verify`);
    expect(log.some((l) => l.url.endsWith('/verify'))).toBe(true);
    expect(verifyCall?.body).toBeNull();
  });
});

// ── Parcels (wizard source) ───────────────────────────────────────────────────────────────

describe('parcel API', () => {
  it('lists the caller parcels with authoritative area from data.parcels', async () => {
    installFetch();
    const parcels = await listParcels();
    expect(parcels[0].parcelId).toBe('par_123');
    expect(parcels[0].calculatedAreaAcres).toBe(2.5);
  });
});

// ── Claim evidence (presigned S3 transport) ───────────────────────────────────────────────

describe('claim evidence API', () => {
  it('presign → direct PUT (no Authorization header) → complete', async () => {
    setAccessToken('tok-1');
    installFetch(defaultRoutes());
    const entry = await uploadClaimEvidence('c_1', imageFile(JPEG_BYTES, 'crop.jpg', 'image/jpeg'));

    expect(entry.uploadId).toBe('img_1');
    const presign = log.find((l) => l.url.endsWith('/evidence/presign'));
    expect(presign?.method).toBe('POST');
    expect(presign?.headers.Authorization).toBe('Bearer tok-1');
    expect(presign?.body).toEqual({ contentType: 'image/jpeg', size: 10, filename: 'crop.jpg' });

    const put = log.find((l) => l.url === 'https://s3.bucket.local/put-key');
    expect(put?.method).toBe('PUT');
    expect(put?.headers.Authorization).toBeUndefined(); // URL is the credential
    expect(put?.headers['Content-Type']).toBe('image/jpeg');

    const complete = log.find((l) => l.url.endsWith('/evidence/img_1/complete'));
    expect(complete?.method).toBe('POST');
  });

  it('completeEvidenceUpload returns the stored metadata', async () => {
    installFetch();
    const entry = await completeEvidenceUpload('c_1', 'img_1');
    expect(entry.status).toBe('stored');
  });

  it('presignEvidence posts an explicit content-type/size/filename declaration', async () => {
    installFetch();
    await presignEvidence('c_1', { contentType: 'image/png', size: 50, filename: 'a.png' });
    const call = log.find((l) => l.url.endsWith('/evidence/presign'));
    expect(call?.body).toEqual({ contentType: 'image/png', size: 50, filename: 'a.png' });
  });

  it('deleteEvidenceUpload DELETEs the owned evidence', async () => {
    installFetch(defaultRoutes({ del: json(ok({ removed: true })) }));
    const result = await deleteEvidenceUpload('c_1', 'img_1');
    expect(result.removed).toBe(true);
    expect(log.some((l) => l.url.endsWith('/evidence/img_1') && l.method === 'DELETE')).toBe(true);
  });

  it('getEvidenceUrl returns a short-lived signed url (the only display path)', async () => {
    installFetch();
    const { url, expiresIn } = await getEvidenceUrl('c_1', 'img_1');
    expect(url).toContain('read-key');
    expect(expiresIn).toBeGreaterThan(0);
  });

  it('rejects files with no sniffed bytes and no image MIME', async () => {
    installFetch();
    const junk = new File([new TextEncoder().encode('not an image')], 'junk.txt', { type: 'text/plain' });
    await expect(uploadClaimEvidence('c_1', junk)).rejects.toMatchObject({ status: 400 });
    const presignCalls = log.filter((l) => l.url.endsWith('/evidence/presign'));
    expect(presignCalls).toHaveLength(0); // never even presigns a bad file
  });

  it('maps a backend processing failure to a friendly user-safe error', async () => {
    installFetch(
      defaultRoutes({
        presign: json(ok({ uploadId: 'img_1', uploadUrl: 'https://s3.bucket.local/put-key', expiresIn: 300 })),
        put: new Response('', { status: 200 }),
        complete: json(err(422, 'image processing failed'), 422),
      })
    );
    await expect(uploadClaimEvidence('c_1', imageFile(JPEG_BYTES, 'crop.jpg', 'image/jpeg'))).rejects.toThrow(
      ApiClientError
    );
  });
});