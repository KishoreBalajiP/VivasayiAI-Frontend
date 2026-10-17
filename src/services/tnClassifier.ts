import { tamilNaduDistricts } from '../config/tamilnaduDistricts';
import { findClosestDistrict } from './locationService';
import type { ReverseGeocodeResult } from './reverseGeocode';

// Is the DEVICE inside Tamil Nadu? (plan B6). Used only for the optional "weather near you"
// mode; the header and claims never read the device location.
//
// The old rule was a bare rectangle (8.0–13.5°N, 76.0–80.5°E) on raw coordinates. That was wrong
// both ways: it cut off northern Tiruvallur (Pulicat, ~13.55°N) and it called Bengaluru,
// Chittoor, Kerala and Puducherry "Tamil Nadu" because they sit inside the rectangle.
//
// Now:
//   1. Pre-filter with a WIDENED box (7.9–13.7°N, 76.0–80.5°E). Outside it → outside, and no
//      geocoder call is made.
//   2. Inside the box the reverse-geocoded state decides: ISO3166-2-lvl4 `IN-TN` or a state name
//      matching "Tamil Nadu" → inside; any other state/country (Andhra Pradesh, Karnataka,
//      Kerala, Puducherry, Sri Lanka) → outside.
//   3. Geocoder failure (or an answer with no state) → "approximate" INSIDE with the nearest
//      district centroid. A network problem must never label a farmer as outside Tamil Nadu.
//   4. The geocoder's district name is normalised through an alias table to the canonical
//      district list used by the /weather contract; unknown names fall back to the centroid.

export const TN_SCREEN_BOX = { south: 7.9, north: 13.7, west: 76.0, east: 80.5 } as const;

export const isInTnScreenBox = (lat: number, lon: number): boolean =>
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  lat >= TN_SCREEN_BOX.south &&
  lat <= TN_SCREEN_BOX.north &&
  lon >= TN_SCREEN_BOX.west &&
  lon <= TN_SCREEN_BOX.east;

export const TN_STATE_CODE = 'IN-TN';

/**
 * - `geocoded`    the reverse geocoder confirmed the state
 * - `approximate` geocoding failed or was inconclusive; treated as inside, nearest district
 * - `box`         outside the pre-filter box; decided without a geocoder call
 */
export type TnPrecision = 'geocoded' | 'approximate' | 'box';

export interface TnClassification {
  inTamilNadu: true | false | 'approximate';
  /**
   * Canonical TN district when inside/approximate; else null. Always one of the 37 names in
   * config/tamilnaduDistricts.ts, which mirrors the backend's config/districts.js (the /weather
   * contract). Tamil Nadu has 38 districts: Tiruvarur is missing from BOTH lists (a data gap,
   * not a choice), so a point in Tiruvarur gets its nearest listed centroid. Add it to both
   * lists together, never to the frontend alone: the backend seeds its districts reference
   * collection (which /weather looks up first) from its own copy.
   */
  district: string | null;
  /** The geocoder's state name when it reported one (e.g. "Andhra Pradesh"); else null. */
  stateName: string | null;
  precision: TnPrecision;
}

export type ReverseGeocoder = (lat: number, lon: number) => Promise<ReverseGeocodeResult | null>;

// Spelling variants returned by OpenStreetMap/Nominatim and in common use → canonical name in
// config/tamilnaduDistricts.ts. Keys are compared after lower-casing and removing everything
// that is not a letter, so "The Nilgiris", "the-nilgiris" and "THENILGIRIS" all match.
const DISTRICT_ALIASES: Record<string, string> = {
  tiruchirappalli: 'Trichy',
  tiruchirapalli: 'Trichy',
  thiruchirappalli: 'Trichy',
  trichirappalli: 'Trichy',
  tiruchi: 'Trichy',
  kanniyakumari: 'Kanyakumari',
  kanyakumari: 'Kanyakumari',
  thenilgiris: 'Nilgiris',
  nilgiri: 'Nilgiris',
  thoothukkudi: 'Thoothukudi',
  tuticorin: 'Thoothukudi',
  viluppuram: 'Villupuram',
  vizhuppuram: 'Villupuram',
  kanchipuram: 'Kancheepuram',
  kancheepuram: 'Kancheepuram',
  thiruvallur: 'Tiruvallur',
  thiruvannamalai: 'Tiruvannamalai',
  tirupur: 'Tiruppur',
  thiruppur: 'Tiruppur',
  tirupattur: 'Tirupathur',
  thirupathur: 'Tirupathur',
  sivagangai: 'Sivaganga',
  pudukottai: 'Pudukkottai',
  nagappattinam: 'Nagapattinam',
  virudunagar: 'Virudhunagar',
  kallakkurichi: 'Kallakurichi',
  chengalpet: 'Chengalpattu',
  chengalpattu: 'Chengalpattu',
  chennaidistrict: 'Chennai',
  madras: 'Chennai',
  kovai: 'Coimbatore',
  tanjore: 'Thanjavur',
  ramnad: 'Ramanathapuram',
};

const letterKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+district$/i, '')
    .replace(/[^a-z]/g, '');

const CANONICAL_BY_KEY: Record<string, string> = Object.fromEntries(
  tamilNaduDistricts.map((d) => [letterKey(d.name), d.name])
);

/** Map a geocoder district name to the canonical TN district, or null when it is not one. */
export const canonicalTnDistrict = (name: string | null | undefined): string | null => {
  if (!name) return null;
  const key = letterKey(name.trim());
  if (!key) return null;
  return CANONICAL_BY_KEY[key] ?? DISTRICT_ALIASES[key] ?? null;
};

/** Decide from a reverse-geocode answer alone: 'inside' | 'outside' | 'unknown'. */
export const stateVerdict = (place: ReverseGeocodeResult): 'inside' | 'outside' | 'unknown' => {
  const code = place.stateCode?.trim().toUpperCase() ?? null;
  const state = place.state?.trim() ?? null;
  if (code === TN_STATE_CODE || (state && /tamil\s*nadu/i.test(state))) return 'inside';
  // Any other subdivision code or named state is a confirmed "elsewhere".
  if (code || state) return 'outside';
  // No state at all: only a non-Indian country is conclusive (e.g. a point in Sri Lanka).
  const country = place.country?.trim() ?? null;
  if (country && !/^(india|bharat|भारत|இந்தியா)$/i.test(country)) return 'outside';
  return 'unknown';
};

export const classifyDeviceLocation = async (
  lat: number,
  lon: number,
  reverse: ReverseGeocoder
): Promise<TnClassification & { place: ReverseGeocodeResult | null }> => {
  if (!isInTnScreenBox(lat, lon)) {
    return { inTamilNadu: false, district: null, stateName: null, precision: 'box', place: null };
  }

  let place: ReverseGeocodeResult | null = null;
  try {
    place = await reverse(lat, lon);
  } catch {
    place = null; // reverseGeocode never throws today; a future one must not flip the verdict
  }

  const nearest = findClosestDistrict(lat, lon).name;

  if (!place) {
    return { inTamilNadu: 'approximate', district: nearest, stateName: null, precision: 'approximate', place: null };
  }

  const verdict = stateVerdict(place);
  if (verdict === 'outside') {
    return { inTamilNadu: false, district: null, stateName: place.state ?? place.country ?? null, precision: 'geocoded', place };
  }
  if (verdict === 'unknown') {
    return { inTamilNadu: 'approximate', district: nearest, stateName: null, precision: 'approximate', place };
  }
  return {
    inTamilNadu: true,
    district: canonicalTnDistrict(place.district) ?? nearest,
    stateName: place.state ?? 'Tamil Nadu',
    precision: 'geocoded',
    place,
  };
};
