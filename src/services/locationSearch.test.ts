// Unit tests for forward geocoding (the parcel/claim map location search).
//
// The geocoder is an untrusted external service AND a shared, rate-limited public resource, so
// these cases cover three things:
//   1. refusing bad data — malformed data must never yield an invented coordinate;
//   2. honest states — "no such place" and "the request failed" must stay distinguishable;
//   3. public-instance etiquette — requests must be paced, not merely debounced.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GEOCODER_URL,
  DEFAULT_PLACE_ZOOM,
  GEOCODER_MIN_INTERVAL_MS,
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
} from '../config/map';
import { __resetGeocoderPacing, searchLocations, toSearchResult } from './locationSearch';

const rawResult = (overrides: Record<string, unknown> = {}) => ({
  place_id: 1,
  lat: '10.7870',
  lon: '79.8370',
  display_name: 'Kadapa, Kadapa district, Andhra Pradesh, India',
  class: 'place',
  type: 'town',
  boundingbox: ['10.68', '10.88', '79.7', '79.9'],
  ...overrides,
});

const jsonResponse = (payload: unknown, ok = true) => ({ ok, json: async () => payload });

const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

const lastUrl = () => {
  const calls = fetchMock().mock.calls;
  return calls[calls.length - 1][0] as string;
};

/** Pacing is module state; keep tests independent of wall-clock ordering. */
beforeEach(() => {
  __resetGeocoderPacing();
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('query guards', () => {
  it('does not call the network for an empty or whitespace query', async () => {
    await expect(searchLocations('')).resolves.toEqual({ status: 'ok', results: [] });
    await expect(searchLocations('   ')).resolves.toEqual({ status: 'ok', results: [] });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not call the network below the minimum query length', async () => {
    await expect(searchLocations('Ka')).resolves.toEqual({ status: 'ok', results: [] });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('issues one request for a full query against the public endpoint', async () => {
    fetchMock().mockResolvedValue(jsonResponse([rawResult()]));

    await searchLocations('Kadapa', { minIntervalMs: 0 });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const url = new URL(lastUrl());
    expect(url.origin + url.pathname).toBe(DEFAULT_GEOCODER_URL);
    expect(url.searchParams.get('q')).toBe('Kadapa');
    expect(url.searchParams.get('format')).toBe('jsonv2');
  });

  it('does not restrict results to settlements, so landmarks stay findable', async () => {
    fetchMock().mockResolvedValue(jsonResponse([rawResult()]));
    await searchLocations('Kadapa temple', { minIntervalMs: 0 });
    // A hard featuretype filter would hide temples, canals and named landmarks that farmers
    // legitimately use to identify a field.
    expect(new URL(lastUrl()).searchParams.get('featuretype')).toBeNull();
  });
});

describe('successful search', () => {
  beforeEach(() => {
    fetchMock().mockResolvedValue(jsonResponse([rawResult()]));
  });

  it('returns a validated, navigable result', async () => {
    const outcome = await searchLocations('Kadapa', { minIntervalMs: 0 });
    expect(outcome.status).toBe('ok');
    const [result] = outcome.status === 'ok' ? outcome.results : [];

    expect(result.label).toBe('Kadapa');
    expect(result.secondary).toBe('Kadapa district, Andhra Pradesh, India');
    expect(result.lat).toBeCloseTo(10.787, 4);
    expect(result.lon).toBeCloseTo(79.837, 4);
    expect(result.kind).toBe('town');
    // The returned box spans ~0.2 degrees, which zooms to a district-level view rather than
    // slamming the camera to street level.
    expect(result.zoom).toBeGreaterThanOrEqual(MIN_MAP_ZOOM);
    expect(result.zoom).toBeLessThan(MAX_MAP_ZOOM);
  });

  it('never exposes a geometry field on a result', async () => {
    const outcome = await searchLocations('Kadapa', { minIntervalMs: 0 });
    const [result] = outcome.status === 'ok' ? outcome.results : [];
    // A search result supplies a map centre only. It must be impossible for downstream code to
    // mistake one for a drawn parcel boundary.
    expect(result).not.toHaveProperty('geometry');
    expect(result).not.toHaveProperty('coordinates');
  });

  it('accepts numeric coordinates as well as strings', async () => {
    fetchMock().mockResolvedValue(jsonResponse([rawResult({ lat: 10.787, lon: 79.837 })]));
    const outcome = await searchLocations('Kadapa', { minIntervalMs: 0 });
    const [result] = outcome.status === 'ok' ? outcome.results : [];
    expect(result.lat).toBeCloseTo(10.787, 4);
    expect(result.lon).toBeCloseTo(79.837, 4);
  });

  it('returns several results for a multi-result response', async () => {
    fetchMock().mockResolvedValue(
      jsonResponse([
        rawResult({ display_name: 'Chennai, Tamil Nadu, India', lat: '13.0827', lon: '80.2707' }),
        rawResult({ display_name: 'Chennai, Karnataka, India', lat: '12.9490', lon: '75.3700' }),
        rawResult({ display_name: 'Kadapa, Andhra Pradesh, India' }),
      ]),
    );
    const outcome = await searchLocations('Chennai', { minIntervalMs: 0 });
    const results = outcome.status === 'ok' ? outcome.results : [];

    expect(results.map((r) => r.label)).toEqual(['Chennai', 'Chennai', 'Kadapa']);
    // Ids must be unique or React lists collide on keys.
    expect(new Set(results.map((r) => r.id)).size).toBe(3);
  });

  it('respects the result limit', async () => {
    fetchMock().mockResolvedValue(
      jsonResponse(Array.from({ length: 20 }, (_, i) => rawResult({ lat: String(10 + i) }))),
    );
    const outcome = await searchLocations('place', { minIntervalMs: 0, limit: 3 });
    expect(outcome.status === 'ok' && outcome.results.length).toBe(3);
  });
});

describe('no results versus failure must stay distinguishable', () => {
  it('reports a zero-match response as a success with no results', async () => {
    fetchMock().mockResolvedValue(jsonResponse([]));
    // A success: this tells the UI "no such place", not "something went wrong".
    await expect(searchLocations('Kadapa', { minIntervalMs: 0 })).resolves.toEqual({
      status: 'ok',
      results: [],
    });
  });

  it('reports a non-OK response as a server failure, not as zero results', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ error: 'Too Many Requests' }, false));
    await expect(searchLocations('Kadapa', { minIntervalMs: 0 })).resolves.toEqual({
      status: 'failed',
      reason: 'server',
    });
  });

  it('reports an offline/network failure distinctly', async () => {
    fetchMock().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(searchLocations('Kadapa', { minIntervalMs: 0 })).resolves.toEqual({
      status: 'failed',
      reason: 'offline',
    });
  });

  it('reports invalid JSON as malformed rather than as zero results', async () => {
    fetchMock().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });
    await expect(searchLocations('Kadapa', { minIntervalMs: 0 })).resolves.toEqual({
      status: 'failed',
      reason: 'malformed',
    });
  });

  it('reports a non-array payload as malformed', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ error: 'Unable to geocode' }));
    await expect(searchLocations('Kadapa', { minIntervalMs: 0 })).resolves.toEqual({
      status: 'failed',
      reason: 'malformed',
    });
  });

  it('drops malformed entries but keeps the good ones', async () => {
    fetchMock().mockResolvedValue(
      jsonResponse([
        rawResult(),
        null,
        'not an object',
        rawResult({ lat: 'not-a-number' }),
        rawResult({ lon: null }),
      ]),
    );
    const outcome = await searchLocations('Kadapa', { minIntervalMs: 0 });
    const results = outcome.status === 'ok' ? outcome.results : [];
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe('Kadapa');
  });

  it('reports a superseded request as aborted so the UI shows nothing', async () => {
    const controller = new AbortController();
    fetchMock().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          // Real fetch rejects straight away when handed an already-aborted signal; the double
          // must do the same, otherwise it hangs where the browser would not.
          if (init.signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    const pending = searchLocations('Kadapa', { signal: controller.signal, minIntervalMs: 0 });
    controller.abort();

    // 'aborted' is deliberately not an error state: a newer query won the race.
    await expect(pending).resolves.toEqual({ status: 'failed', reason: 'aborted' });
  });

  it('never throws, whatever the transport does', async () => {
    fetchMock().mockImplementation(() => {
      throw new RangeError('exploded synchronously');
    });
    await expect(searchLocations('Kadapa', { minIntervalMs: 0 })).resolves.toBeDefined();
  });
});

describe('public-instance request pacing', () => {
  it('does not delay the very first request', async () => {
    vi.useFakeTimers();
    try {
      fetchMock().mockResolvedValue(jsonResponse([rawResult()]));
      const started = Date.now();
      await searchLocations('Kadapa');
      expect(Date.now() - started).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('spaces back-to-back requests to at least the policy interval', async () => {
    fetchMock().mockResolvedValue(jsonResponse([rawResult()]));
    const startedAt: number[] = [];

    // Three searches in a row, as a farmer correcting a typo would produce. Debouncing alone would
    // let these fire milliseconds apart and breach the shared instance's ~1 req/second cap.
    const first = searchLocations('Kad').then(() => startedAt.push(Date.now()));
    const second = searchLocations('Kada').then(() => startedAt.push(Date.now()));
    const third = searchLocations('Kadap').then(() => startedAt.push(Date.now()));
    await Promise.all([first, second, third]);

    expect(fetchMock()).toHaveBeenCalledTimes(3);
    expect(startedAt[1] - startedAt[0]).toBeGreaterThanOrEqual(GEOCODER_MIN_INTERVAL_MS - 1);
    expect(startedAt[2] - startedAt[1]).toBeGreaterThanOrEqual(GEOCODER_MIN_INTERVAL_MS - 1);
  });

  it('does not pace a self-hosted endpoint', async () => {
    vi.stubEnv('VITE_GEOCODER_URL', 'https://geocode.internal.example/search');
    try {
      __resetGeocoderPacing();
      fetchMock().mockResolvedValue(jsonResponse([rawResult()]));
      const startedAt: number[] = [];
      await searchLocations('Kad');
      startedAt.push(Date.now());
      await searchLocations('Kada');
      startedAt.push(Date.now());

      expect(lastUrl()).toContain('geocode.internal.example');
      // The operator's own capacity, so no shared-resource throttle applies.
      expect(startedAt[1] - startedAt[0]).toBeLessThan(GEOCODER_MIN_INTERVAL_MS);
    } finally {
      vi.unstubAllEnvs();
      __resetGeocoderPacing();
    }
  });

  it('lets an aborted queued request be abandoned without sending it', async () => {
    fetchMock().mockResolvedValue(jsonResponse([rawResult()]));
    const controller = new AbortController();

    const first = searchLocations('Kad');
    // The second request is queued behind the rate limiter; abandon it while it waits.
    const second = searchLocations('Kada', { signal: controller.signal });
    controller.abort();

    await expect(second).resolves.toEqual({ status: 'failed', reason: 'aborted' });
    await first;
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('does not let queued requests bunch up when they all arrive together', async () => {
    // Regression guard: with a bare "wait until lastStart + interval" check, every request that
    // arrived during the first one's wait read the same stale timestamp and all fired at once —
    // the exact burst the shared instance's rate cap exists to prevent.
    const startTimes: number[] = [];
    fetchMock().mockImplementation(async () => {
      startTimes.push(Date.now());
      return jsonResponse([rawResult()]);
    });

    await Promise.all([
      searchLocations('Kad'),
      searchLocations('Kada'),
      searchLocations('Kadap'),
      searchLocations('Kadapa'),
    ]);

    expect(startTimes).toHaveLength(4);
    for (let i = 1; i < startTimes.length; i += 1) {
      expect(startTimes[i] - startTimes[i - 1]).toBeGreaterThanOrEqual(GEOCODER_MIN_INTERVAL_MS - 1);
    }
  });
});

describe('toSearchResult rejects untrusted coordinates', () => {
  it('rejects an entry with no lat at all', () => {
    const entry = rawResult();
    delete (entry as Record<string, unknown>).lat;
    expect(toSearchResult(entry, 0)).toBeNull();
  });

  it('rejects an entry with no lon at all', () => {
    const entry = rawResult();
    delete (entry as Record<string, unknown>).lon;
    expect(toSearchResult(entry, 0)).toBeNull();
  });

  it.each([
    ['NaN lat', { lat: Number.NaN }],
    ['Infinity lon', { lon: Number.POSITIVE_INFINITY }],
    ['lat out of range', { lat: '95' }],
    ['lon out of range', { lon: '200' }],
    ['non-numeric strings', { lat: 'abc', lon: 'def' }],
    ['empty strings', { lat: '', lon: '' }],
    ['null lat', { lat: null }],
  ])('rejects %s', (_label, overrides) => {
    expect(toSearchResult(rawResult(overrides), 0)).toBeNull();
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['a number', 42],
  ])('rejects %s as a whole entry', (_label, entry) => {
    expect(toSearchResult(entry, 0)).toBeNull();
  });

  it('rejects an entry with no usable name', () => {
    expect(toSearchResult(rawResult({ display_name: '', name: '' }), 0)).toBeNull();
    expect(toSearchResult(rawResult({ display_name: undefined, name: undefined }), 0)).toBeNull();
  });

  it('falls back to name when display_name is missing', () => {
    const result = toSearchResult(rawResult({ display_name: undefined, name: 'Kadapa Fort' }), 0);
    expect(result?.label).toBe('Kadapa Fort');
    expect(result?.secondary).toBeNull();
  });

  it('falls back to a default zoom when the bounding box is unusable', () => {
    const result = toSearchResult(rawResult({ boundingbox: ['x', 'y', 'z', 'w'] }), 0);
    expect(result?.zoom).toBe(DEFAULT_PLACE_ZOOM);
  });
});
