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