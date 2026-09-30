// MapLibre configuration for the farmer parcel-boundary map (ADR-019 P8).
//
// Tile source is a plain Raster OSM-compatible template so the app never depends on a
// provider-specific, paid, or credentialed mapping API. `VITE_MAP_TILE_URL` overrides the
// default; when it is absent we fall back to the free OpenStreetMap standard tile server.
// Attribution is mandatory OSM credit and is rendered by the map component.

/** Free, no-credential OpenStreetMap standard tile template (raster, {z}/{x}/{y}). */
export const DEFAULT_MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Resolve the raster tile template.
 * Returns `null` when an operator has explicitly configured the variable to an empty or
 * whitespace value, which is treated as "tiles intentionally disabled" so the UI can show a
 * real explanation instead of a blank map. When the variable is undefined we use the free
 * OSM default.
 */
export function resolveMapTileUrl(raw: string | undefined = import.meta.env?.VITE_MAP_TILE_URL): string | null {
  if (raw === undefined || raw === null) return DEFAULT_MAP_TILE_URL;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  return trimmed;
}

// Tamil Nadu centroid (Thanjavur district), used as the map's initial view because every
// parcel this app manages is inside TN. Coordinates are [longitude, latitude].
export const DEFAULT_MAP_CENTER: [number, number] = [79.1378, 10.787];
export const DEFAULT_MAP_ZOOM = 12;

/** Zoom bound that keeps the farmer inside a farm-scale view (no whole-world zoom-out). */
export const MIN_MAP_ZOOM = 5;
export const MAX_MAP_ZOOM = 18;

/**
 * Reject tile templates that MapLibre would render as a broken map. A raster source needs
 * {z}/{x}/{y} placeholders (optionally {s} for subdomains and {r} for @2x retina).
 */
export function isUsableTileTemplate(template: string | null): boolean {
  if (!template) return false;
  return template.includes('{z}') && template.includes('{x}') && template.includes('{y}');
}

/** First of the allowed positions, used to fly the map to a freshly drawn polygon. */
export function firstPosition(
  geometry: { coordinates: number[][][] } | null | undefined,
): [number, number] | null {
  const ring = geometry?.coordinates?.[0]?.[0];
  if (!ring || ring.length < 2) return null;
  const lon = Number(ring[0]);
  const lat = Number(ring[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

// ── Location search (forward geocoding) ──────────────────────────────────────────────────
//
// Same provider family as the existing reverse geocoding in src/services/reverseGeocode.ts: the
// free, keyless OpenStreetMap Nominatim public service. No Google Maps, no API key, no secret.
//
// Nominatim's public instance is a SHARED, donation-funded resource with a hard usage policy
// (max ~1 request/second, no heavy use, a working Referer/User-Agent required, results are ODbL).
// That is acceptable for development and low volume but must NOT be treated as guaranteed
// production capacity — set VITE_GEOCODER_URL to a self-hosted Nominatim (or any compatible
// endpoint) for a real deployment. The client debounces keystrokes, and the geocoding service
// additionally paces requests to at most one per GEOCODER_MIN_INTERVAL_MS whenever the PUBLIC
// instance is in use; see src/services/locationSearch.ts.

/** Free, no-credential Nominatim search endpoint used when VITE_GEOCODER_URL is not set. */
export const DEFAULT_GEOCODER_URL = 'https://nominatim.openstreetmap.org/search';

/**
 * Resolve the forward-geocoding endpoint.
 *
 * Unlike tiles there is no useful "disabled" state: without geocoding the farmer loses location
 * search entirely, so an empty value falls back to the public default rather than disabling the
 * feature. Set VITE_GEOCODER_URL to a self-hosted or proxied Nominatim for production.
 */
export function resolveGeocoderUrl(raw: string | undefined = import.meta.env?.VITE_GEOCODER_URL): string {
  if (raw === undefined || raw === null) return DEFAULT_GEOCODER_URL;
  const trimmed = String(raw).trim();
  return trimmed === '' ? DEFAULT_GEOCODER_URL : trimmed;
}

/**
 * Minimum query length before a search is issued. Nominatim asks clients not to send very short
 * or very generic queries, and one or two letters produce unusable result lists.
 */
export const MIN_SEARCH_QUERY_LENGTH = 3;

/** Debounce for the search box. Long enough to coalesce typing, short enough to feel instant. */
export const SEARCH_DEBOUNCE_MS = 400;

/**
 * Minimum gap between forward-geocoding requests against the PUBLIC Nominatim instance, which its
 * usage policy caps at roughly one request per second.
 *
 * Debouncing alone does NOT satisfy this: a farmer who types "Kad", waits for the dropdown, then
 * types "apa" produces two requests a few hundred milliseconds apart. Pacing therefore lives in
 * src/services/locationSearch.ts, which enforces it centrally so no caller can exceed it. It is
 * skipped entirely for a self-hosted/proxied endpoint supplied via VITE_GEOCODER_URL.
 */
export const GEOCODER_MIN_INTERVAL_MS = 1000;

/** Upper bound on results rendered in the dropdown. */
export const SEARCH_RESULT_LIMIT = 6;

/**
 * Zoom used for a geocoder result when it carries no usable bounding box. A village/locality
 * result is the scale a farmer actually draws at, so this is the default.
 */
export const DEFAULT_PLACE_ZOOM = 14;

/** Below this span a bounding box is treated as a single point rather than a region. */
export const MIN_BBOX_SPAN = 0.0005;

/**
 * Derive a sensible zoom from the bounding box the geocoder actually returned.
 *
 * Zoom 0 spans ~360 degrees of longitude, so zoom = log2(360 / span) approximates the zoom at
 * which the result fills the viewport, then clamped to the map's zoom bounds. `null` in, `null`
 * out — a result without a usable bounding box must never be given an invented span (callers fall
 * back to DEFAULT_PLACE_ZOOM instead).
 *
 * Note the result is deliberately NOT floored at DEFAULT_PLACE_ZOOM. A region-wide match such as
 * "India" must zoom OUT to show the whole country; flooring would slam the camera to zoom 14 on an
 * administrative boundary spanning hundreds of kilometres. The point-like case is handled
 * separately below, and DEFAULT_PLACE_ZOOM is used only when there is no box to reason about.
 */
export function zoomForBoundingBox(
  bbox: [string, string, string, string] | null | undefined,
): number | null {
  if (!Array.isArray(bbox) || bbox.length < 4) return null;
  const south = Number(bbox[0]);
  const north = Number(bbox[1]);
  const west = Number(bbox[2]);
  const east = Number(bbox[3]);
  if (![south, north, west, east].every((v) => Number.isFinite(v))) return null;

  const latSpan = Math.abs(north - south);
  const lonSpan = Math.abs(east - west);
  const span = Math.max(latSpan, lonSpan);
  if (span <= 0) return null;
  // A single building or shrine: zoom right in, rather than treating it as a region.
  if (span < MIN_BBOX_SPAN) return MAX_MAP_ZOOM;

  const zoom = Math.log2(360 / span);
  return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, Math.round(zoom)));
}