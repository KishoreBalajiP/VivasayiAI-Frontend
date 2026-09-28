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
  Appeal,
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

const QUEUE_ENTRY: AdminQueueEntry = {
  id: 'q_1',
  claimId: 'c_1',
  parcelName: 'North Field',
  crop: 'Rice',
  eventType: 'flood',
  eventDate: '2026-09-02',
  claimedAreaAcres: 2.5,
  state: 'rejected',
  decidedAt: '2026-09-03T00:00:00.000Z',
  createdAt: '2026-09-02T00:00:00.000Z',
};

const CLAIM_DETAIL: AdminClaimDetail = {
  id: 'c_1',
  parcelId: 'par_123',
  parcelName: 'North Field',
  crop: 'Rice',
  eventType: 'flood',
  eventDate: '2026-09-02',
  claimedAreaAcres: 2.5,
  state: 'rejected',
  decidedAt: '2026-09-03T00:00:00.000Z',
  decisionReason: 'Claimed area exceeds the parcel limit.',
};

const OVERRIDE_RESULT: OverrideResult = {
  claimId: 'c_1',
  fromState: 'rejected',
  toState: 'verified',
  overrideKey: 'ovr_1',
  decidedAt: '2026-09-03T11:00:00.000Z',
  applied: true,
};

const APPEAL_RESULT: Appeal = {
  id: 'ap_1',
  claimId: 'c_1',
  reason: 'Area was surveyed by hand.',
  state: 'submitted',
  createdAt: '2026-09-04T09:00:00.000Z',
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

const defaultRoutes = (): RouteOverrides => ({
  list: json(ok({ claims: [QUEUE_ENTRY] })),
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
  it('lists the review queue and unwraps data.claims', async () => {
    installFetch();
    const res = await listAdminQueue({});
    expect(res.claims[0].id).toBe('q_1');
    expect(log[0].method).toBe('GET');
  });

  it('fetches a single claim detail and unwraps data.claim', async () => {
    installFetch();
    const res = await getAdminClaim('c_1');
    expect(res.state).toBe('rejected');
  });

  it('applies an override and unwraps data.override', async () => {
    installFetch();
    const res = await overrideClaim('c_1', { toState: 'verified', adminNote: 'Field visit on record.' });
    expect(res.toState).toBe('verified');
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
