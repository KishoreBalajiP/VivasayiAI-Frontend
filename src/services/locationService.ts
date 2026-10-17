import { tamilNaduDistricts } from '../config/tamilnaduDistricts';

// Device-location helpers (adapted from the pre-backend `farmerWeatherService.ts`,
// d74ac23/4092d54): geolocation and the closest-district lookup. It NO LONGER talks to
// Open-Meteo directly and NEVER fabricates a location: weather goes through the backend
// /weather contract, and the farm district from the profile is the default everywhere.

interface District {
  name: string;
  lat: number;
  lon: number;
  type: string;
}

// The Tamil Nadu in/out decision used to live here as a bare 8.0–13.5°N rectangle on raw device
// coordinates (`isInTamilNadu` / `resolveDistrict`). It mislabelled northern Tiruvallur as outside
// and Bengaluru/Chittoor/Kerala as inside, so it was removed: services/tnClassifier.ts now
// pre-filters with a widened box and lets the reverse-geocoded state decide.

export const findClosestDistrict = (lat: number, lon: number): District => {
  let closestDistrict = tamilNaduDistricts[0];
  let minDistance = Number.MAX_VALUE;

  tamilNaduDistricts.forEach((district) => {
    const distance =
      Math.pow(district.lat - lat, 2) + Math.pow(district.lon - lon, 2);
    if (distance < minDistance) {
      minDistance = distance;
      closestDistrict = district;
    }
  });

  return closestDistrict;
};

// getCurrentPosition wrapped in a Promise with explicit failure categories. Never throws —
// a typed error key is returned instead so callers render honest states.
export type LocationErrorKey =
  | 'permission'
  | 'unavailable'
  | 'timeout'
  | 'unsupported';

export interface PositionResult {
  lat: number;
  lon: number;
}

// ── Richer location model (PREMIUM LOCATION PASS) ────────────────────────────────────────
// The device coordinates are kept as the source of truth. District resolution is preserved
// for the existing backend /weather contract and the authoritative district list (37 entries,
// shared with the backend; Tiruvarur is a known gap in both, see tnClassifier.ts), while a
// SEPARATE set of nullable fields carries the finest reverse-geocoded details the public
// geocoder actually returns (village/locality/town/taluk). Nothing is fabricated: a field is
// null when the provider did not return it, and `district` is set ONLY inside Tamil Nadu.

export interface LocationDetails {
  // Best human-readable representation (built by buildDisplayName from actual fields).
  displayName: string | null;
  // neighbourhood / suburb / quarter
  locality: string | null;
  // village / hamlet
  village: string | null;
  // town / city
  townCity: string | null;
  // taluk / sub-district / county where the geocoder provides one
  subDistrict: string | null;
  // Canonical TN-district for the weather contract when inside TN; otherwise the geocoder's
  // district or null. NEVER a fabricated TN district for out-of-TN coordinates.
  district: string | null;
  state: string | null;
  country: string | null;
  // Which provider supplied the finer fields: 'nominatim' | 'districts' | null.
  source: 'nominatim' | 'districts' | null;
  lat: number;
  lon: number;
}

// Build the most useful human-readable place label from ACTUAL returned fields, using the
// precedence the product spec defines: village → locality → town/city → district → state.
export const buildDisplayName = (
  fields: Pick<
    LocationDetails,
    'locality' | 'village' | 'townCity' | 'district' | 'state' | 'country'
  >
): string | null => {
  const primary = fields.village || fields.locality || fields.townCity;
  const parts: string[] = [];
  if (primary) parts.push(primary);
  if (fields.district) {
    parts.push(fields.district);
  } else {
    if (fields.state) parts.push(fields.state);
    if (fields.country && parts.length === 0) parts.push(fields.country);
  }
  return parts.length > 0 ? parts.join(', ') : null;
};

export const getBrowserPosition = (): Promise<
  | { ok: true; position: PositionResult }
  | { ok: false; error: LocationErrorKey }
> =>
  new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ ok: false, error: 'unsupported' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          position: {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          },
        });
      },
      (err) => {
        const error: LocationErrorKey =
          err && err.code === err.PERMISSION_DENIED
            ? 'permission'
            : err && err.code === err.TIMEOUT
              ? 'timeout'
              : 'unavailable';
        resolve({ ok: false, error });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  });