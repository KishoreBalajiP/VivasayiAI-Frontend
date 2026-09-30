// Phase 10 (E10-S10) ‒ deterministic backend mock for the admin review + appeal API module. The
// whole ../config is replaced (it reads window.location.origin at import time) so nothing leaks
// from this env; every call resolves against a frozen API host this test owns. Follows the Phase
// 7/9 harness in claims.test.ts verbatim (installFetch -> captured calls; envelope unwrapped
// exactly as src/api/admin.ts unwraps it: data / data.claim, data.metrics, data.summary,
// data.appeal / data.appealed exactly), so admin.ts and claims.ts agree on the fetch contract.

vi.mock('../config', () => ({
  config: {
    apiUrl: 'https://api.admin.test',
    cognito: { domain: '', clientId: '', redirectUri: 'https://app.admin.test' },
    auth: { storageKeyPrefix: 'vivasayi.admin.test' },
  },
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAdminClaim,
  getAdminDashboard,
  getAppeal,
  getInvestigation,
  listAdminQueue,
  overrideClaim,
  submitAppeal,
} from './admin';
import type {
  AdminClaimDetail,
  AdminQueueEntry,
  AdminQueueResponse,
  Appeal,
  LossClaim,
  OverrideResult,
} from '../types';

const API = 'https://api.admin.test';
const QUEUE = `${API}/admin/claims`;
const DETAIL = `${QUEUE}/c_1`;
const OVERRIDE = `${DETAIL}/override`;
const DASHBOARD = `${API}/admin/dashboard?rangeDays=90`;
const INVESTIGATION = `${API}/admin/investigation?rangeDays=90`;
const APPEAL = `${API}/claims/c_1/appeal`;

const ok = <T>(data: T) => ({ statusCode: 200, message: 'OK', data });
const err = (status: number, message = 'failure') => ({ statusCode: status, message, data: null });
const json = (envelope: unknown, status = 200): Response =>
  new Response(JSON.stringify(envelope), { status, headers: { 'content-type': 'application/json' } });

// Shared claim fixture. Every admin payload derives from this so the fixtures stay consistent
// with the real API contract in `types.ts` rather than drifting into a shape of their own.
const LOSS_CLAIM: LossClaim = {
  id: 'c_1',
  parcelId: 'par_123',
  parcelSnapshot: {
    parcelId: 'par_123',
    name: 'North Field',
    crop: 'Rice',
    parcelAreaAcres: 2.5,
  },
  eventType: 'flood',
  eventDate: '2026-09-02',
  claimedGeometry: {
    type: 'Polygon',
    coordinates: [[[78.9, 10.7], [78.91, 10.7], [78.91, 10.71], [78.9, 10.7]]],
  },
  claimedAreaAcres: 2.5,
  evidence: [],
  state: 'rejected',
  submittedAt: null,
  processedAt: '2026-09-03T00:00:00.000Z',
  decidedAt: '2026-09-03T00:00:00.000Z',
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
  assessment: null,
};

const QUEUE_ENTRY: AdminQueueEntry = {
  id: 'c_1',
  parcelId: 'par_123',
  parcelName: 'North Field',
  crop: 'Rice',
  eventType: 'flood',
  eventDate: '2026-09-02',
  claimedAreaAcres: 2.5,
  state: 'rejected',
  decidedAt: '2026-09-03T00:00:00.000Z',
  createdAt: '2026-09-02T00:00:00.000Z',
  hasAppeal: false,
  appealReason: null,
  appealStatus: null,
  aiFailed: false,
  decisionReason: 'Claimed area exceeds the parcel limit.',
};

const CLAIM_DETAIL: AdminClaimDetail = {
  ...LOSS_CLAIM,
  farmer: { cognitoSub: 'sub_1', email: 'farmer@example.com', name: 'Test Farmer' },
  parcel: {
    parcelId: 'par_123',
    name: 'North Field',
    crop: 'Rice',
    calculatedAreaAcres: 2.5,
    geometry: null,
  },
  evidenceUrls: [],
  appeals: [],
  audit: [],
  adminActions: [],
  meta: { requestedBy: 'sub_admin', requestedAt: '2026-09-05T00:00:00.000Z' },
};

const OVERRIDE_RESULT: OverrideResult = {
  claim: { ...LOSS_CLAIM, state: 'verified', decidedAt: '2026-09-03T11:00:00.000Z' },
  adminAction: {
    id: 'aa_1',
    claimId: 'c_1',
    action: 'override',
    actorSub: 'sub_admin',
    actorEmail: 'admin@example.com',
    priorState: 'rejected',
    targetState: 'verified',
    reason: 'Manual review confirmed the area.',
    adminNote: null,
    approverSub: null,
    appealId: null,
    idempotencyKey: 'ovr_1',
    metadata: {},
    requestId: 'req_1',
    createdAt: '2026-09-03T11:00:00.000Z',
  },
  resolvedAppeals: [],
  idempotent: false,
};

const APPEAL_RESULT: Appeal = {
  id: 'ap_1',
  status: 'submitted',
  reason: 'Area was surveyed by hand.',
  statement: null,
  evidence: [],
  decision: null,
  createdAt: '2026-09-04T09:00:00.000Z',
  resolvedAt: null,
};

interface RouteOverrides {
  list: Response;
  get: Response;
  override: Response;
  dashboard: Response;
  investigation: Response;
  appeal: Response;
  appealGet: Response;
}

const QUEUE_RESPONSE: AdminQueueResponse = {
  items: [QUEUE_ENTRY],
  total: 1,
  page: 1,
  limit: 20,
  filters: { status: '', eventType: '', search: '', withAppeal: '', aiFailed: '' },
};

const defaultRoutes = (): RouteOverrides => ({
  list: json(ok(QUEUE_RESPONSE)),
  get: json(ok(CLAIM_DETAIL)),
  override: json(ok(OVERRIDE_RESULT), 202),
  dashboard: json(ok({ metrics: { total: 80, verified: 20, rejected: 31, appealCount: 7 } })),
  investigation: json(ok({ summary: { totalFlags: 11, high: 2, medium: 4, low: 5 } })),
  appeal: json(ok({ appeal: APPEAL_RESULT }), 201),
  appealGet: json(ok({ appeal: APPEAL_RESULT })),
});

const installFetch = (routes: RouteOverrides = defaultRoutes()): void => {
  const handler = (url: string, method: string): Response => {
    if (url === DETAIL && method === 'GET') return routes.get;
    if (url === OVERRIDE && method === 'POST') return routes.override;
    if (url === APPEAL && method === 'POST') return routes.appeal;
    if (url === APPEAL && method === 'GET') return routes.appealGet;
    if (url.startsWith(QUEUE) && method === 'GET') return routes.list;
    if (url.startsWith(DASHBOARD)) return routes.dashboard;
    if (url.startsWith(INVESTIGATION)) return routes.investigation;
    return json(err(404, 'unmatched'), 404);
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    Object.entries(init?.headers ?? {}).forEach(([k, v]) => {
      if (typeof v === 'string') headers[k.toLowerCase()] = v;
    });
    let body: unknown = null;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      body = init?.body;
    }
    log.push({ url, method: init?.method ?? 'GET', headers, body });
    return handler(url, init?.method ?? 'GET');
  });
  vi.stubGlobal('fetch', fetchMock);
};

let log: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];

beforeEach(() => {
  log = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin review API — deterministic backend mock', () => {
  it('lists the review queue and unwraps data.items', async () => {
    installFetch();
    const res = await listAdminQueue({});
    expect(res.items[0].id).toBe('c_1');
    expect(log[0].method).toBe('GET');
  });

  it('fetches a single claim detail and unwraps data.claim', async () => {
    installFetch();
    const res = await getAdminClaim('c_1');
    expect(res.state).toBe('rejected');
  });

  it('applies an override and returns the updated claim', async () => {
    installFetch();
    const res = await overrideClaim('c_1', {
      toState: 'verified',
      reason: 'Field visit on record.',
      overrideKey: 'ovr_1',
    });
    expect(res.claim.state).toBe('verified');
    expect(log[0].method).toBe('POST');
  });

  it('returns the dashboard metrics from data.metrics', async () => {
    installFetch();
    const res = await getAdminDashboard(90);
    expect(res.metrics.total).toBe(80);
  });

  it('returns the investigation summary from data.summary', async () => {
    installFetch();
    const res = await getInvestigation(90);
    expect(res.summary.totalFlags).toBe(11);
  });

  it('submits an appeal and unwraps data.appeal', async () => {
    installFetch();
    const res = await submitAppeal('c_1', { reason: 'Area was surveyed by hand.' });
    expect(res.id).toBe('ap_1');
    expect(log[0].method).toBe('POST');
  });

  it('fetches an existing appeal from data.appeal (null when none)', async () => {
    installFetch();
    const res = await getAppeal('c_1');
    expect(res?.id).toBe('ap_1');
  });
});
