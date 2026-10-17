import { describe, expect, it, vi } from 'vitest';
import {
  TN_SCREEN_BOX,
  canonicalTnDistrict,
  classifyDeviceLocation,
  isInTnScreenBox,
  stateVerdict,
} from './tnClassifier';
import type { ReverseGeocodeResult } from './reverseGeocode';
import { tamilNaduDistricts } from '../config/tamilnaduDistricts';

// plan B6: is the DEVICE in Tamil Nadu? (weather-only; the header and claims never use it)

const place = (overrides: Partial<ReverseGeocodeResult>): ReverseGeocodeResult => ({
  locality: null,
  village: null,
  townCity: null,
  subDistrict: null,
  district: null,
  state: null,
  stateCode: null,
  country: 'India',
  ...overrides,
});

const geocoder = (result: ReverseGeocodeResult | null) => vi.fn().mockResolvedValue(result);

// The rectangle the old code used (locationService.ts at 56f26eb), kept here only to document
// the regressions these tests pin down.
const OLD_BOX = (lat: number, lon: number) => lat >= 8.0 && lat <= 13.5 && lon >= 76.0 && lon <= 80.5;

describe('tnClassifier', () => {
  it('LOC-1: outside the widened box is outside, decided without a geocoder call', async () => {
    const reverse = geocoder(place({ state: 'Tamil Nadu', stateCode: 'IN-TN' }));
    for (const [lat, lon] of [
      [17.385, 78.4867], // Hyderabad
      [13.75, 79.5], // just north of the box
      [12.0, 75.9], // just west of the box
      [Number.NaN, 79],
    ]) {
      const result = await classifyDeviceLocation(lat, lon, reverse);
      expect(result).toMatchObject({ inTamilNadu: false, district: null, precision: 'box' });
    }
    expect(reverse).not.toHaveBeenCalled();
    expect(TN_SCREEN_BOX).toEqual({ south: 7.9, north: 13.7, west: 76.0, east: 80.5 });
    expect(isInTnScreenBox(7.9, 77.5)).toBe(true);
    expect(isInTnScreenBox(13.7, 80.0)).toBe(true);
  });

  it('LOC-2: a Tamil Nadu state (by ISO code or by name) is inside, with the canonical district', async () => {
    const byCode = await classifyDeviceLocation(
      10.787,
      79.137,
      geocoder(place({ state: null, stateCode: 'IN-TN', district: 'Thanjavur' }))
    );
    expect(byCode).toMatchObject({ inTamilNadu: true, district: 'Thanjavur', precision: 'geocoded' });

    const byName = await classifyDeviceLocation(
      10.8,
      78.69,
      geocoder(place({ state: 'Tamil Nadu', district: 'Tiruchirappalli' }))
    );
    expect(byName).toMatchObject({ inTamilNadu: true, district: 'Trichy', stateName: 'Tamil Nadu' });

    // A TN answer with no usable district falls back to the nearest centroid, never null.
    const noDistrict = await classifyDeviceLocation(11.0168, 76.9558, geocoder(place({ state: 'Tamil Nadu' })));
    expect(noDistrict.district).toBe('Coimbatore');
  });

  it('LOC-3: Andhra Pradesh inside the box is OUTSIDE (Chittoor, Tirupati, Sri City)', async () => {
    for (const [lat, lon, district] of [
      [13.2172, 79.1003, 'Chittoor'],
      [13.6288, 79.4192, 'Tirupati'],
      [13.5525, 80.0236, 'Tirupati'],
    ] as const) {
      const result = await classifyDeviceLocation(
        lat,
        lon,
        geocoder(place({ state: 'Andhra Pradesh', stateCode: 'IN-AP', district }))
      );
      expect(result).toMatchObject({ inTamilNadu: false, district: null, stateName: 'Andhra Pradesh', precision: 'geocoded' });
    }
  });

  it('LOC-4: a geocoder failure is "approximate" INSIDE with the nearest district, never outside', async () => {
    const failed = await classifyDeviceLocation(13.1, 79.95, geocoder(null));
    expect(failed).toMatchObject({ inTamilNadu: 'approximate', district: 'Tiruvallur', precision: 'approximate' });

    const threw = await classifyDeviceLocation(9.93, 78.12, vi.fn().mockRejectedValue(new Error('network')));
    expect(threw).toMatchObject({ inTamilNadu: 'approximate', district: 'Madurai' });

    // An Indian answer without any state is inconclusive, so it is approximate too.
    const noState = await classifyDeviceLocation(10.78, 79.83, geocoder(place({ country: 'India' })));
    expect(noState.inTamilNadu).toBe('approximate');
    expect(noState.inTamilNadu).not.toBe(false);
  });

  it('LOC-5: Pulicat (13.55°N, northern Tiruvallur) with a Tamil Nadu state is INSIDE', async () => {
    const lat = 13.55;
    const lon = 80.2;
    expect(OLD_BOX(lat, lon)).toBe(false); // the old 13.5°N edge called this "outside"
    const result = await classifyDeviceLocation(
      lat,
      lon,
      geocoder(place({ state: 'Tamil Nadu', stateCode: 'IN-TN', district: 'Tiruvallur', village: 'Pulicat' }))
    );
    expect(result).toMatchObject({ inTamilNadu: true, district: 'Tiruvallur', precision: 'geocoded' });
  });

  it('LOC-6: Bengaluru with a Karnataka state is OUTSIDE (the old box called it Tamil Nadu)', async () => {
    const lat = 12.9716;
    const lon = 77.5946;
    expect(OLD_BOX(lat, lon)).toBe(true);
    const result = await classifyDeviceLocation(
      lat,
      lon,
      geocoder(place({ state: 'Karnataka', stateCode: 'IN-KA', district: 'Bangalore Urban', townCity: 'Bengaluru' }))
    );
    expect(result).toMatchObject({ inTamilNadu: false, district: null, stateName: 'Karnataka' });
  });

  it('LOC-7: Puducherry, Kerala and Sri Lanka inside the box are outside', async () => {
    const cases: [number, number, Partial<ReverseGeocodeResult>, string][] = [
      [11.9416, 79.8083, { state: 'Puducherry', stateCode: 'IN-PY' }, 'Puducherry'],
      [8.5241, 76.9366, { state: 'Kerala', stateCode: 'IN-KL' }, 'Kerala'],
      [9.6615, 80.0255, { state: 'Northern Province', stateCode: 'LK-4', country: 'Sri Lanka' }, 'Northern Province'],
      [9.6615, 80.0255, { state: null, stateCode: null, country: 'Sri Lanka' }, 'Sri Lanka'],
    ];
    for (const [lat, lon, answer, stateName] of cases) {
      const result = await classifyDeviceLocation(lat, lon, geocoder(place(answer)));
      expect(result).toMatchObject({ inTamilNadu: false, district: null, stateName });
    }
  });

  it('LOC-8: district aliases map geocoder spellings to the canonical district list', () => {
    expect(canonicalTnDistrict('Tiruchirappalli')).toBe('Trichy');
    expect(canonicalTnDistrict('Kanniyakumari')).toBe('Kanyakumari');
    expect(canonicalTnDistrict('The Nilgiris')).toBe('Nilgiris');
    expect(canonicalTnDistrict('Thoothukkudi')).toBe('Thoothukudi');
    expect(canonicalTnDistrict('Viluppuram')).toBe('Villupuram');
    expect(canonicalTnDistrict('Kanchipuram District')).toBe('Kancheepuram');
    expect(canonicalTnDistrict('chennai')).toBe('Chennai');
    expect(canonicalTnDistrict('Bangalore Urban')).toBeNull();
    expect(canonicalTnDistrict('')).toBeNull();
    // Every canonical name maps to itself.
    for (const { name } of tamilNaduDistricts) expect(canonicalTnDistrict(name)).toBe(name);
  });

  it('LOC-8: an unknown TN district name falls back to the nearest centroid', async () => {
    const result = await classifyDeviceLocation(
      10.77,
      79.64,
      geocoder(place({ state: 'Tamil Nadu', district: 'Some New District' }))
    );
    expect(tamilNaduDistricts.map((d) => d.name)).toContain(result.district);
  });

  // DATA GAP, pinned on purpose: Tamil Nadu has 38 districts but the shared list (this file's
  // source, mirrored by the backend's config/districts.js) has 37 — Tiruvarur is missing from both.
  // When it is added to BOTH lists, update this test and the TnClassification.district comment.
  it('LOC-15: the district list has 37 unique names; Tiruvarur (the missing 38th) falls back to a listed centroid', async () => {
    const names = tamilNaduDistricts.map((d) => d.name);
    expect(names).toHaveLength(37);
    expect(new Set(names).size).toBe(37);
    expect(names).toContain('Mayiladuthurai');
    expect(canonicalTnDistrict('Tiruvarur')).toBeNull();
    expect(canonicalTnDistrict('Thiruvarur')).toBeNull();

    // Tiruvarur town, geocoded as Tamil Nadu: inside, with a district the backend knows.
    const result = await classifyDeviceLocation(
      10.7725,
      79.6368,
      geocoder(place({ stateCode: 'IN-TN', state: 'Tamil Nadu', district: 'Tiruvarur' }))
    );
    expect(result.inTamilNadu).toBe(true);
    expect(names).toContain(result.district);
  });

  it('LOC-2: stateVerdict prefers the ISO code and treats a named other state as outside', () => {
    expect(stateVerdict(place({ stateCode: 'in-tn' }))).toBe('inside');
    expect(stateVerdict(place({ state: 'Tamilnadu' }))).toBe('inside');
    expect(stateVerdict(place({ state: 'Telangana' }))).toBe('outside');
    expect(stateVerdict(place({}))).toBe('unknown');
  });
});
