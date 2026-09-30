// Tests for the shared Nominatim request limiter.
//
// The public Nominatim instance allows roughly one request per second for the WHOLE app. Forward
// search and reverse geocoding both hit that instance, so a per-service counter would look correct
// in isolation yet still breach the cap in practice: a farmer who searches for a village and then
// taps "My location" would issue two requests a few hundred milliseconds apart.
//
// These tests pin the shared, serialised behaviour.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GEOCODER_MIN_INTERVAL_MS } from '../config/map';
import { claimGeocoderSlot, isPublicGeocoderUrl, resetGeocoderPacing } from './geocoderRateLimit';

const PUBLIC = 'https://nominatim.openstreetmap.org/search';
const PUBLIC_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const SELF_HOSTED = 'https://geocode.internal.example/search';

beforeEach(() => {
  resetGeocoderPacing();
});

describe('isPublicGeocoderUrl', () => {
  it('recognises every path on the shared public host', () => {
    // Forward and reverse must be judged by host, not by exact URL, or reverse geocoding would
    // slip past the limiter entirely.
    expect(isPublicGeocoderUrl(PUBLIC)).toBe(true);
    expect(isPublicGeocoderUrl(PUBLIC_REVERSE)).toBe(true);
  });

  it('is case-insensitive about the host', () => {
    expect(isPublicGeocoderUrl('https://Nominatim.OpenStreetMap.org/search')).toBe(true);
  });

  it('does not treat a lookalike or self-hosted endpoint as public', () => {
    expect(isPublicGeocoderUrl(SELF_HOSTED)).toBe(false);
    expect(isPublicGeocoderUrl('https://nominatim.openstreetmap.org.evil.test/search')).toBe(
      false,
    );
  });

  it('returns false for an unparseable endpoint rather than throwing', () => {
    expect(isPublicGeocoderUrl('not a url')).toBe(false);
  });
});

describe('claimGeocoderSlot', () => {
  it('does not delay the first request', async () => {
    const started = Date.now();
    await claimGeocoderSlot(PUBLIC, new AbortController().signal);
    expect(Date.now() - started).toBe(0);
  });

  it('spaces requests from DIFFERENT endpoints on the same public host', async () => {
    // This is the regression that matters: search then reverse must not fire back to back.
    const times: number[] = [];
    await claimGeocoderSlot(PUBLIC, new AbortController().signal);
    times.push(Date.now());
    await claimGeocoderSlot(PUBLIC_REVERSE, new AbortController().signal);
    times.push(Date.now());

    expect(times[1] - times[0]).toBeGreaterThanOrEqual(GEOCODER_MIN_INTERVAL_MS - 1);
  });

  it('serialises queued participants so they cannot bunch up', async () => {
    // Regression guard: without the serialising chain, all three would read the same stale
    // timestamp and fire together, which is the burst the cap exists to prevent.
    const times: number[] = [];
    const signal = () => new AbortController().signal;
    await Promise.all([
      claimGeocoderSlot(PUBLIC, signal()).then(() => times.push(Date.now())),
      claimGeocoderSlot(PUBLIC, signal()).then(() => times.push(Date.now())),
      claimGeocoderSlot(PUBLIC, signal()).then(() => times.push(Date.now())),
    ]);

    expect(times).toHaveLength(3);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(GEOCODER_MIN_INTERVAL_MS - 1);
    }
  });

  it('leaves a self-hosted endpoint completely unthrottled', async () => {
    const start = Date.now();
    await claimGeocoderSlot(SELF_HOSTED, new AbortController().signal);
    await claimGeocoderSlot(SELF_HOSTED, new AbortController().signal);
    await claimGeocoderSlot(SELF_HOSTED, new AbortController().signal);
    // The operator's own capacity decision, not a shared resource.
    expect(Date.now() - start).toBeLessThan(GEOCODER_MIN_INTERVAL_MS);
  });

  it('honours an explicit interval override', async () => {
    const start = Date.now();
    await claimGeocoderSlot(PUBLIC, new AbortController().signal, 0);
    await claimGeocoderSlot(PUBLIC, new AbortController().signal, 0);
    expect(Date.now() - start).toBeLessThan(GEOCODER_MIN_INTERVAL_MS);
  });

  it('rejects when the caller aborts while queued', async () => {
    const controller = new AbortController();
    // Occupy the limiter so the next participant has to wait.
    await claimGeocoderSlot(PUBLIC, new AbortController().signal);

    const queued = claimGeocoderSlot(PUBLIC, controller.signal);
    controller.abort();

    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not stamp the clock for an abandoned request, so the next one is not penalised', async () => {
    const controller = new AbortController();
    await claimGeocoderSlot(PUBLIC, new AbortController().signal);

    const queued = claimGeocoderSlot(PUBLIC, controller.signal);
    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });

    // No request was actually sent for the aborted one, so the following request is paced from
    // the previous REAL request rather than from a phantom slot.
    const start = Date.now();
    await claimGeocoderSlot(PUBLIC, new AbortController().signal);
    expect(Date.now() - start).toBeGreaterThanOrEqual(GEOCODER_MIN_INTERVAL_MS - 1);
  });

  it('keeps working for later callers after one participant rejects', async () => {
    const controller = new AbortController();
    await claimGeocoderSlot(PUBLIC, new AbortController().signal);
    const queued = claimGeocoderSlot(PUBLIC, controller.signal);
    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });

    // A poisoned chain here would hang every subsequent geocoding request for the session.
    await expect(
      claimGeocoderSlot(PUBLIC, new AbortController().signal, 0),
    ).resolves.toBeUndefined();
  });

  it('resets cleanly for test isolation', async () => {
    await claimGeocoderSlot(PUBLIC, new AbortController().signal);
    resetGeocoderPacing();
    const start = Date.now();
    await claimGeocoderSlot(PUBLIC, new AbortController().signal);
    expect(Date.now() - start).toBe(0);
  });
});

describe('real usage through reverseGeocode', () => {
  it('is paced by the same limiter as forward search', async () => {
    // Guard against someone later removing the shared limiter from reverseGeocode.
    const { reverseGeocode } = await import('./reverseGeocode');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ address: { village: 'Kadapa', country: 'India' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const start = Date.now();
      await reverseGeocode(10.787, 79.837);
      await reverseGeocode(11.5, 79.9);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(Date.now() - start).toBeGreaterThanOrEqual(GEOCODER_MIN_INTERVAL_MS - 1);
    } finally {
      vi.unstubAllGlobals();
      resetGeocoderPacing();
    }
  });
});
