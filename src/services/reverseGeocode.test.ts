import { afterEach, describe, expect, it, vi } from 'vitest';

// The shared Nominatim limiter is exercised in geocoderRateLimit.test.ts; here it is a no-op so
// these tests run instantly. No real network: fetch is stubbed per test.
vi.mock('./geocoderRateLimit', () => ({
  claimGeocoderSlot: vi.fn().mockResolvedValue(undefined),
}));

import { reverseGeocode } from './reverseGeocode';

const answer = (address: Record<string, string>) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => ({ address }) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reverseGeocode', () => {
  it('LOC-9: surfaces the ISO3166-2-lvl4 state code next to the state name', async () => {
    vi.stubGlobal(
      'fetch',
      answer({
        village: 'Pulicat',
        state_district: 'Tiruvallur',
        state: 'Tamil Nadu',
        'ISO3166-2-lvl4': 'IN-TN',
        country: 'India',
      })
    );
    const result = await reverseGeocode(13.55, 80.2);
    expect(result).toMatchObject({
      village: 'Pulicat',
      district: 'Tiruvallur',
      state: 'Tamil Nadu',
      stateCode: 'IN-TN',
      country: 'India',
    });
  });

  it('LOC-9: stateCode is null when the geocoder omits it, and failures return null', async () => {
    vi.stubGlobal('fetch', answer({ town: 'Hosur', state: 'Tamil Nadu' }));
    expect((await reverseGeocode(12.74, 77.83))?.stateCode).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await reverseGeocode(12.74, 77.83)).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await reverseGeocode(12.74, 77.83)).toBeNull();
  });
});
