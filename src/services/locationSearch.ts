import {
  DEFAULT_PLACE_ZOOM,
  MIN_SEARCH_QUERY_LENGTH,
  SEARCH_RESULT_LIMIT,
  resolveGeocoderUrl,
  zoomForBoundingBox,
} from '../config/map';
import {
  claimGeocoderSlot,
  resetGeocoderPacing,
} from './geocoderRateLimit';

// Forward geocoding (location search) for the parcel-boundary and claim affected-area maps.
//
// This is the sibling of src/services/reverseGeocode.ts and deliberately uses the SAME provider
// family — the free, keyless OpenStreetMap Nominatim public service — so the app has one geocoding
// dependency, one attribution, and one set of policy constraints. There is no backend
// forward-geocoding contract to reuse (the backend only resolves district NAMES for /weather), so
// the request is made from the browser exactly as reverse geocoding already is.
//
// What a result is and is not:
//   IS  — a place name and the coordinates of that place, used ONLY to move the map.
//   IS NOT — parcel geometry. Nothing here is ever turned into a boundary; the farmer must still
//   draw it explicitly on the map. `LocationSearchResult` deliberately has no geometry field, so a
//   search result cannot be mistaken for a drawn boundary anywhere downstream.
//
// Robustness: geocoder data is untrusted input. Every result must pass validation (finite
// in-range coordinates and a non-empty label) or it is dropped. Nothing is ever invented to fill a
// gap — a malformed response yields a failure, never a fabricated position.
//
// Honest state reporting: "this place does not exist" and "the request failed" are DIFFERENT
// answers and the UI must be able to tell them apart, so this module returns a discriminated
// `LocationSearchOutcome` instead of collapsing every problem into an empty array. An empty array
// now means exactly one thing: the geocoder successfully reported zero matches.
//
// Nominatim public-instance policy (see src/config/map.ts): ~1 request/second, no heavy use,
// results are ODbL. Debouncing lives in the search box; the per-second cap is enforced here so no
// caller can bypass it. A production deployment should point VITE_GEOCODER_URL at a self-hosted
// instance.

export interface LocationSearchResult {
  /** Stable key for React lists. Derived from label + rounded coordinates + position. */
  id: string;
  /** Primary place name, e.g. "Kadapa". */
  label: string;
  /** Context line, e.g. "Kadapa, Andhra Pradesh, India". Null when unavailable. */
  secondary: string | null;
  lat: number;
  lon: number;
  /** Zoom derived from the returned bounding box, clamped to the map's bounds. */
  zoom: number;
  /** Nominatim result type (village, town, city, ...) when supplied. */
  kind: string | null;
}

/**
 * Why a search could not produce a list.
 *
 * `aborted` is deliberately distinguished from the others: it means a newer query superseded this
 * one, so the caller must render nothing at all rather than an error.
 */
export type LocationSearchFailure = 'aborted' | 'offline' | 'timeout' | 'server' | 'malformed';

export type LocationSearchOutcome =
  | { status: 'ok'; results: LocationSearchResult[] }
  | { status: 'failed'; reason: LocationSearchFailure };

/** Nominatim's own timeout budget. Long enough for a slow link, short enough not to hang the UI. */
const REQUEST_TIMEOUT_MS = 8000;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Nominatim strings are "12.3456" but a proxy or mirror may hand back numbers already. Coerce
 * only when the coercion is lossless and finite; otherwise reject.
 */
const toCoordinate = (value: unknown): number | null => {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

/** Latitude must be within [-90, 90] and longitude within [-180, 180]. */
const isValidLatLon = (lat: number, lon: number): boolean =>
  lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

/**
 * Nominatim reports type in a few shapes depending on version. Normalise to a string, or null.
 */
const readKind = (raw: Record<string, unknown>): string | null => {
  const type = raw.type;
  if (typeof type === 'string' && type.trim()) return type.trim();
  const category = raw.category;
  if (typeof category === 'string' && category.trim()) return category.trim();
  return null;
};

/**
 * Split Nominatim's `display_name` ("Kadapa, Kadapa district, Andhra Pradesh, India") into a
 * short primary label and a secondary context line. This is presentation only — it never becomes
 * geometry — and it degrades gracefully when the provider omits display_name.
 */
const splitDisplayName = (
  displayName: unknown,
  fallbackLabel: unknown,
): { label: string; secondary: string | null } => {
  if (typeof displayName === 'string' && displayName.trim()) {
    const parts = displayName
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return {
        label: parts[0],
        secondary: parts.length > 1 ? parts.slice(1).join(', ') : null,
      };
    }
  }
  if (typeof fallbackLabel === 'string' && fallbackLabel.trim()) {
    return { label: fallbackLabel.trim(), secondary: null };
  }
  return { label: '', secondary: null };
};

/**
 * Convert one raw Nominatim entry into a validated result, or null when it is unusable.
 * Exported for direct unit testing of the malformed-response cases.
 */
export const toSearchResult = (raw: unknown, index: number): LocationSearchResult | null => {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;

  const lat = toCoordinate(entry.lat);
  const lon = toCoordinate(entry.lon);
  if (lat === null || lon === null) return null;
  if (!isValidLatLon(lat, lon)) return null;

  const { label, secondary } = splitDisplayName(entry.display_name, entry.name);
  // A result with no usable name cannot be presented to the farmer.
  if (!label) return null;

  // Nominatim returns bbox as [south, north, west, east] as strings.
  const bboxRaw = entry.boundingbox;
  const bbox =
    Array.isArray(bboxRaw) && bboxRaw.length >= 4
      ? ([bboxRaw[0], bboxRaw[1], bboxRaw[2], bboxRaw[3]] as [string, string, string, string])
      : null;

  return {
    id: `${label}-${lat.toFixed(4)}-${lon.toFixed(4)}-${index}`,
    label,
    secondary,
    lat,
    lon,
    zoom: zoomForBoundingBox(bbox) ?? DEFAULT_PLACE_ZOOM,
    kind: readKind(entry),
  };
};

/** Reset the pacing state. Re-exported for tests; the limiter itself is shared. */
export const __resetGeocoderPacing = resetGeocoderPacing;

export interface LocationSearchOptions {
  /** Caller-owned abort signal; aborting abandons the request and reports 'aborted'. */
  signal?: AbortSignal;
  /** Maximum results to keep. */
  limit?: number;
  /**
   * Override the minimum gap between requests. Defaults to GEOCODER_MIN_INTERVAL_MS against the
   * public instance and 0 against a self-hosted endpoint.
   */
  minIntervalMs?: number;
}

/**
 * Search for places matching `query`.
 *
 * Never throws — every outcome, including a network failure, is reported through the returned
 * union so the caller can render an honest state without a try/catch.
 *
 * Note there is deliberately NO `featuretype` filter: farmers legitimately search for a landmark,
 * a temple, a canal, a named village cluster or a specific survey number, and Nominatim ranks
 * relevance better than a hard-coded category filter. Forcing `settlement` would have hidden
 * exactly the results that identify a real field location.
 *
 * @returns `{status:'ok'}` with a possibly empty list for a successful response, or
 *          `{status:'failed'}` with a reason the UI can present honestly.
 */
export const searchLocations = async (
  query: string,
  options: LocationSearchOptions = {},
): Promise<LocationSearchOutcome> => {
  const trimmed = query.trim();
  // Too short to search: not an error, just nothing to do, and no network call is made.
  if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) return { status: 'ok', results: [] };

  const limit = options.limit ?? SEARCH_RESULT_LIMIT;
  const url = resolveGeocoderUrl();
  const params = new URLSearchParams({
    q: trimmed,
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(limit),
  });

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  // Chain the caller's signal onto ours so either can stop the request.
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort);

  try {
    // Pace against the shared public instance; a self-hosted endpoint is the operator's own
    // capacity decision, so it is not throttled here.
    await claimGeocoderSlot(url, controller.signal, options.minIntervalMs);

    // Do not issue a request we already know is doomed (aborted while queued or immediately after).
    if (controller.signal.aborted) {
      return timedOut
        ? { status: 'failed', reason: 'timeout' }
        : { status: 'failed', reason: 'aborted' };
    }

    const response = await fetch(`${url}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return { status: 'failed', reason: 'server' };

    // Parse separately from the request so a bad body (HTML error page, truncated JSON, an HTML
    // login wall) is reported as a malformed response rather than masquerading as a network fault.
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { status: 'failed', reason: 'malformed' };
    }
    // Nominatim returns a bare array for search and an object for reverse; anything else is
    // malformed.
    if (!Array.isArray(payload)) return { status: 'failed', reason: 'malformed' };

    const results: LocationSearchResult[] = [];
    payload.slice(0, limit).forEach((entry, index) => {
      const result = toSearchResult(entry, index);
      if (result) results.push(result);
    });
    return { status: 'ok', results };
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      // A timeout and a superseding query both surface as an abort; only the former is a problem
      // worth telling the farmer about.
      return timedOut
        ? { status: 'failed', reason: 'timeout' }
        : { status: 'failed', reason: 'aborted' };
    }
    // fetch() rejects with a TypeError for DNS/offline/CORS failures.
    return { status: 'failed', reason: 'offline' };
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException ? error.name === 'AbortError' : false;
