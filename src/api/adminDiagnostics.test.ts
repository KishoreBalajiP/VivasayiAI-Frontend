import { afterEach, describe, expect, it, vi } from 'vitest';

// ADM-3 (API): the reviewer diagnostics read and the re-queue call (ADR-022, D9) through the real
// envelope client, plus the queue's ?held filter on the wire.
vi.mock('../config', () => ({
  config: {
    apiUrl: 'https://api.admin.test',
    cognito: { domain: '', clientId: '', redirectUri: 'https://app.admin.test' },
    auth: { storageKeyPrefix: 'vivasayi.admin.test' },
  },
}));

import { getVerificationDiagnostics, listAdminQueue, requeueClaimJobs } from './admin';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin verification API', () => {
  it('ADM-3: GET /admin/claims/:id/verification-diagnostics unwraps data', async () => {
    const fetchMock = vi.fn(async () =>
      json({ statusCode: 200, message: 'Verification diagnostics fetched', data: { claimId: 'c_1', jobs: [], reviewCases: [] } })
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await getVerificationDiagnostics('c_1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.admin.test/admin/claims/c_1/verification-diagnostics',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual({ claimId: 'c_1', jobs: [], reviewCases: [] });
  });

  it('ADM-3: POST /admin/claims/:id/jobs/requeue sends only reason and steps', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({ reason: 'Quota raised by the owner today.', steps: ['ai_assessment'] });
      return json({ statusCode: 200, data: { requeued: 1, engineQueued: 1, jobs: [], idempotent: false, adminAction: null } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await requeueClaimJobs('c_1', { reason: 'Quota raised by the owner today.', steps: ['ai_assessment'] });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.admin.test/admin/claims/c_1/jobs/requeue');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(result.requeued).toBe(1);
  });

  it('ADM-2: the queue request carries ?held=true', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
      json({ statusCode: 200, data: { items: [], total: 0, page: 1, limit: 20, filters: {} } })
    );
    vi.stubGlobal('fetch', fetchMock);
    await listAdminQueue({ held: 'true', page: 1, limit: 20 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.admin.test/admin/claims?page=1&limit=20&held=true');
  });
});
