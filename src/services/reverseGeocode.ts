import type { LocationDetails } from './locationService';
import { buildDisplayName } from './locationService';

// Reverse geocoding (PREMIUM LOCATION PASS): resolve device coordinates into the finest
// place hierarchy the geocoder can provide (village/locality/town/city → taluk/sub-district
// → district → state → country). Uses the free, keyless OpenStreetMap Nominatim public
// service — the smallest browser-safe, frontend-compatible source available (the backend
// only geocodes DISTRICT NAMES for weather, never raw coordinates, so there is no existing
// backend reverse-geocoding contract to reuse).
//
// Privacy & policy constraints honored here:
//   - This runs ONLY after the user grants device-location permission explicitly.
//   - One call per resolved location; the result is cached in sessionStorage by
//     LocationContext so it is never re-fetched on every render/mount.
//   - Nominatim attribution is surfaced in the UI (tiny © OpenStreetMap line).
//   - Never throws: on any failure the caller keeps its (honest) district-level fallback.
//   - No API key, no secret in frontend source.

interface NominatimAddress {
  village?: string;
  hamlet?: string;
  town?: string;
  city?: string;
  suburb?: string;
  neighbourhood?: string;
  municipality?: string;
  county?: string;
  state_district?: string;
  district?: string;
  state?: string;
  country?: string;
}

export interface ReverseGeocodeResult {
  locality: string | null;
  village: string | null;
  townCity: string | null;
  subDistrict: string | null;
  district: string | null;
  state: string | null;
  country: string | null;
}

const clean = (value: string | undefined | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

// Strip a trailing " district"/" District" marker some providers append (the canonical
// Tamil Nadu district list is authoritative for the weather contract regardless).
const normalizeDistrict = (value: string | null): string | null => {
  if (!value) return null;
  return value.replace(/\s+district$/i, '').trim() || null;
};

const REQUEST_TIMEOUT_MS = 8000;

export const reverseGeocode = async (
  lat: number,
  lon: number
): Promise<ReverseGeocodeResult | null> => {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '18',
    'accept-language': 'en',
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      { headers: { Accept: 'application/json' }, signal: controller.signal }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      address?: NominatimAddress;
    };
    const address = data.address;
    if (!address) return null;

    const locality = clean(address.suburb) || clean(address.neighbourhood) || clean(address.municipality);
    const village = clean(address.village) || clean(address.hamlet);
    const townCity = clean(address.city) || clean(address.town) || village;
    const subDistrict = clean(address.county) || clean(address.state_district) || null;
    const district = normalizeDistrict(clean(address.district) || clean(address.state_district));

    return { locality, village, townCity, subDistrict, district, state: clean(address.state), country: clean(address.country) };
  } catch {
    // Timeout / network failure / abort — caller keeps its district-level fallback.
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

// Merge the geocoder's finer fields with the canonical Tamil Nadu district (when the device
// is inside TN, the authoritative district always wins for the /weather contract) and build
// the display label. `details` fields are null unless actually provided.
export const applyReverseGeocode = (
  result: ReverseGeocodeResult,
  canonicalDistrict: string | null,
  lat: number,
  lon: number
): LocationDetails => {
  const district = canonicalDistrict ?? result.district;
  const merged = {
    locality: result.locality,
    village: result.village,
    townCity: result.townCity,
    subDistrict: result.subDistrict ?? null,
    district,
    state: result.state,
    country: result.country,
    displayName: buildDisplayName({ ...result, district }),
    source: 'nominatim' as const,
    lat,
    lon,
  };
  return merged;
};