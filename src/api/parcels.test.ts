// Contract tests for the farm-parcel API client against a deterministic backend mock.
//
// Two properties are pinned here because the parcel map depends on them:
//   1. The client NEVER sends an acreage. Area is always derived server-side from geometry
//      (`services/parcelGeometry.service.js`), so a client-sent area would be a trust violation.
//   2. Ownership and geometry validity are enforced by the backend, so the client only has to
//      send geometry and surface the server's answer — including the authoritative acreage that
//      the UI displays after a save.
//
// Mirrors the installFetch harness in claims.test.ts / admin.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({
  config: {
    apiUrl: 'https://api.parcels.test',
    cognito: { domain: '', clientId: '', redirectUri: 'https://app.parcels.test' },
    auth: { storageKeyPrefix: 'vivasayi.parcels.test' },
  },
}));

import {
  createParcel,
  deleteParcel,
  getParcel,
  listParcels,
  recalculateParcelArea,
  updateParcel,
} from '../api';
import type { GeoJsonPolygon } from '../types';

const API = 'https://api.parcels.test';

const SQUARE: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [79.1378, 10.787],
      [79.1478, 10.787],
      [79.1478, 10.796],
      [79.1378, 10.796],
      [79.1378, 10.787],
    ],
  ],
};

const PARCEL = {
  parcelId: 'par_123',
  name: 'North Field',
  crop: 'Rice',
  geometry: SQUARE,
  // Authoritative, computed by the backend from SQUARE.
  calculatedAreaAcres: 2.5,
};

const ok = <T>(data: T) => ({ statusCode: 200, message: 'OK', data });
const json = (envelope: unknown, status = 200): Response =>
  new Response(JSON.stringify(envelope), { status, headers: { 'content-type': 'application/json' } });

let log: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
let handler: (url: string, method: string) => Response;

const installFetch = () => {
  log = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    let body: Record<string, unknown> | null = null;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      body = init?.body as Record<string, unknown> | null;
    }
    log.push({ url, method: init?.method ?? 'GET', body });
    return handler(url, init?.method ?? 'GET');
  });
};

beforeEach(() => {
  handler = () => json(ok(null));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listParcels', () => {
  it('unwraps data.parcels', async () => {
    handler = () => json(ok({ parcels: [PARCEL] }));
    installFetch();
    const parcels = await listParcels();
    expect(parcels).toHaveLength(1);
    expect(parcels[0].parcelId).toBe('par_123');
    expect(log[0].method).toBe('GET');
    expect(log[0].url).toBe(`${API}/profile/parcels`);
  });

  it('returns an empty array instead of throwing when the envelope has no parcels key', async () => {
    handler = () => json(ok({}));
    installFetch();
    await expect(listParcels()).resolves.toEqual([]);
  });
});

describe('getParcel', () => {
  it('unwraps data.parcel', async () => {
    handler = () => json(ok({ parcel: PARCEL }));
    installFetch();
    const parcel = await getParcel('par_123');
    expect(parcel.calculatedAreaAcres).toBe(2.5);
    expect(log[0].url).toBe(`${API}/profile/parcels/par_123`);
  });

  it('URL-encodes the parcel id so an odd id cannot break out of the path', async () => {
    handler = () => json(ok({ parcel: PARCEL }));
    installFetch();
    await getParcel('par 1/../admin');
    expect(log[0].url).toBe(`${API}/profile/parcels/par%201%2F..%2Fadmin`);
  });
});

describe('createParcel', () => {
  it('POSTs name, crop and geometry — and never an area', async () => {
    handler = () => json(ok({ parcel: PARCEL }), 201);
    installFetch();
    const created = await createParcel({ name: 'North Field', crop: 'Rice', geometry: SQUARE });

    expect(log[0].method).toBe('POST');
    expect(log[0].url).toBe(`${API}/profile/parcels`);
    expect(log[0].body).toEqual({ name: 'North Field', crop: 'Rice', geometry: SQUARE });
    expect(log[0].body).not.toHaveProperty('calculatedAreaAcres');
    expect(log[0].body).not.toHaveProperty('parcelId');
    // The displayed acreage always comes back from the server.
    expect(created.calculatedAreaAcres).toBe(2.5);
  });
});

describe('updateParcel', () => {
  it('PATCHes the changed fields and returns the server-recomputed acreage', async () => {
    handler = () => json(ok({ parcel: { ...PARCEL, calculatedAreaAcres: 3.1 } }));
    installFetch();
    const updated = await updateParcel('par_123', {
      name: 'North Field',
      crop: 'Wheat',
      geometry: SQUARE,
    });

    expect(log[0].method).toBe('PATCH');
    expect(log[0].url).toBe(`${API}/profile/parcels/par_123`);
    expect(log[0].body).not.toHaveProperty('calculatedAreaAcres');
    expect(updated.calculatedAreaAcres).toBe(3.1);
  });

  it('allows a metadata-only update that leaves geometry untouched', async () => {
    handler = () => json(ok({ parcel: PARCEL }));
    installFetch();
    await updateParcel('par_123', { crop: 'Wheat' });
    expect(log[0].body).toEqual({ crop: 'Wheat' });
  });
});

describe('deleteParcel', () => {
  it('DELETEs the parcel', async () => {
    // The backend answers DELETE with 200 + a standard envelope (ApiResponse.success), matching
    // every other mutation, so the shared client's envelope-unwrapping contract is preserved.
    handler = () => json(ok(null));
    installFetch();
    await expect(deleteParcel('par_123')).resolves.toBeUndefined();
    expect(log[0].method).toBe('DELETE');
    expect(log[0].url).toBe(`${API}/profile/parcels/par_123`);
  });

  it('surfaces the backend error when the delete is refused', async () => {
    handler = () => json({ statusCode: 404, message: 'Parcel not found', data: null }, 404);
    installFetch();
    await expect(deleteParcel('par_missing')).rejects.toThrow();
  });
});

describe('recalculateParcelArea', () => {
  it('asks the backend to recompute and returns the refreshed authoritative acreage', async () => {
    handler = () => json(ok({ parcel: { ...PARCEL, calculatedAreaAcres: 2.5001 } }));
    installFetch();
    const parcel = await recalculateParcelArea('par_123');

    expect(log[0].method).toBe('POST');
    expect(log[0].url).toBe(`${API}/profile/parcels/par_123/area`);
    expect(parcel.calculatedAreaAcres).toBe(2.5001);
  });
});

describe('parcel ownership errors', () => {
  it('propagates a 404 when the parcel is not owned by the caller', async () => {
    handler = () => json({ statusCode: 404, message: 'not found', data: null }, 404);
    installFetch();
    await expect(getParcel('par_other')).rejects.toThrow();
  });
});
