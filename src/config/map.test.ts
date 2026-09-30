// Tests for the MapLibre map configuration (tile template resolution, initial view, bounds).
//
// The tile template rules matter for more than tidiness: if `resolveMapTileUrl` returns something
// MapLibre cannot load, the map renders a blank canvas with no explanation, and the farmer has no
// way to know whether they broke something or the app did. These tests pin the three outcomes the
// UI distinguishes — usable template, operator-disabled tiles, and invalid template — so the map
// component can keep showing a real message instead of a blank map.

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_GEOCODER_URL,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_TILE_URL,
  DEFAULT_MAP_ZOOM,
  DEFAULT_PLACE_ZOOM,
  GEOCODER_MIN_INTERVAL_MS,
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
  MIN_SEARCH_QUERY_LENGTH,
  OSM_ATTRIBUTION,
  SEARCH_DEBOUNCE_MS,
  firstPosition,
  isUsableTileTemplate,
  resolveGeocoderUrl,
  resolveMapTileUrl,
  zoomForBoundingBox,
} from './map';

// `import.meta.env` is declared readonly by Vite's ambient types, so the override below goes
// through a loosely-typed alias. Nothing else in this file mutates the environment.
const env = import.meta.env as unknown as Record<string, string | undefined>;

const original = env.VITE_MAP_TILE_URL;

afterEach(() => {
  if (original === undefined) delete env.VITE_MAP_TILE_URL;
  else env.VITE_MAP_TILE_URL = original;
});

describe('resolveMapTileUrl', () => {
  it('falls back to the free OpenStreetMap template when unset', () => {
    delete env.VITE_MAP_TILE_URL;
    expect(resolveMapTileUrl()).toBe(DEFAULT_MAP_TILE_URL);
  });

  it('uses an explicitly configured template', () => {
    expect(resolveMapTileUrl('https://tiles.example.org/{z}/{x}/{y}.png')).toBe(
      'https://tiles.example.org/{z}/{x}/{y}.png',
    );
  });

  it('trims surrounding whitespace so a stray newline cannot break the source', () => {
    expect(resolveMapTileUrl('  https://tiles.example.org/{z}/{x}/{y}.png \n')).toBe(
      'https://tiles.example.org/{z}/{x}/{y}.png',
    );
  });

  it('treats an empty value as "tiles intentionally disabled" rather than a blank map', () => {
    expect(resolveMapTileUrl('')).toBeNull();
    expect(resolveMapTileUrl('   ')).toBeNull();
  });
});

describe('isUsableTileTemplate', () => {
  it('accepts a full {z}/{x}/{y} template', () => {
    expect(isUsableTileTemplate(DEFAULT_MAP_TILE_URL)).toBe(true);
    expect(isUsableTileTemplate('https://tiles.example.org/{z}/{x}/{y}@2x.png')).toBe(true);
  });

  it('rejects templates missing any required placeholder', () => {
    expect(isUsableTileTemplate('https://tiles.example.org/{z}/{x}.png')).toBe(false);
    expect(isUsableTileTemplate('https://tiles.example.org/tiles.png')).toBe(false);
  });

  it('rejects a disabled (null) configuration', () => {
    expect(isUsableTileTemplate(null)).toBe(false);
  });
});

describe('map view defaults', () => {
  it('opens on the Tamil Nadu centroid', () => {
    // Coordinates are [longitude, latitude] — a swapped pair here would put the map in the ocean.
    expect(DEFAULT_MAP_CENTER[0]).toBeGreaterThan(70);
    expect(DEFAULT_MAP_CENTER[0]).toBeLessThan(85);
    expect(DEFAULT_MAP_CENTER[1]).toBeGreaterThan(6);
    expect(DEFAULT_MAP_CENTER[1]).toBeLessThan(14);
  });

  it('uses a farm-scale default zoom with sane bounds', () => {
    expect(DEFAULT_MAP_ZOOM).toBeGreaterThanOrEqual(MIN_MAP_ZOOM);
    expect(DEFAULT_MAP_ZOOM).toBeLessThanOrEqual(MAX_MAP_ZOOM);
    // Zooming out to the whole world is never useful for a single-parcel task.
    expect(MIN_MAP_ZOOM).toBeGreaterThan(0);
  });

  it('carries the mandatory OpenStreetMap attribution', () => {
    expect(OSM_ATTRIBUTION).toContain('OpenStreetMap');
    expect(OSM_ATTRIBUTION).toContain('openstreetmap.org/copyright');
  });
});

describe('firstPosition', () => {
  // Only the coordinates are read, so fixtures stay minimal.
  type Ringish = { coordinates: number[][][] };

  const square: Ringish = {
    coordinates: [[[79.1, 10.2], [79.2, 10.2], [79.2, 10.3], [79.1, 10.2]]],
  };

  it('returns the first vertex as [lon, lat] for recentering', () => {
    expect(firstPosition(square)).toEqual([79.1, 10.2]);
  });

  it('returns null when there is nothing to fly to', () => {
    expect(firstPosition(null)).toBeNull();
    expect(firstPosition(undefined)).toBeNull();
    expect(firstPosition({ coordinates: [] })).toBeNull();
    // An empty ring has no first vertex.
    expect(firstPosition({ coordinates: [[]] })).toBeNull();
    // A lone vertex still has usable coordinates, so recentring falls back to it rather than
    // stranding the farmer at the default centre.
    expect(firstPosition({ coordinates: [[[79.1, 10.2]]] })).toEqual([79.1, 10.2]);
  });

  it('returns null for non-finite coordinates instead of flying to NaN', () => {
    expect(firstPosition({ coordinates: [[[Number.NaN, 10.2], [79.2, 10.3]]] })).toBeNull();
  });

  it('coerces string coordinates delivered by a JSON round-trip', () => {
    const stringly = { coordinates: [[['79.5' as unknown as number, '10.5' as unknown as number]]] };
    expect(firstPosition(stringly)).toEqual([79.5, 10.5]);
  });
});

// ---------------------------------------------------------------------------
// Forward-geocoding (location search) configuration.
//
// Selecting a search result must move the map somewhere sensible. `zoomForBoundingBox` is what
// turns a geocoder response into that view, and its failure modes are user-visible: inventing a
// zoom for a region-wide match slams the camera to street level over an empty landscape.
// ---------------------------------------------------------------------------

describe('resolveGeocoderUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the keyless public Nominatim endpoint', () => {
    expect(resolveGeocoderUrl()).toBe(DEFAULT_GEOCODER_URL);
  });

  it('uses a configured self-hosted or proxied endpoint when provided', () => {
    expect(resolveGeocoderUrl('https://geocode.internal.example/search')).toBe(
      'https://geocode.internal.example/search',
    );
  });

  it('falls back to the default for blank values rather than disabling search', () => {
    // Unlike tiles, there is no useful "off" state: without geocoding the farmer loses location
    // search entirely, so a blank env var must not silently turn the feature off.
    expect(resolveGeocoderUrl('')).toBe(DEFAULT_GEOCODER_URL);
    expect(resolveGeocoderUrl('   ')).toBe(DEFAULT_GEOCODER_URL);
  });

  it('reads VITE_GEOCODER_URL from the environment by default', () => {
    vi.stubEnv('VITE_GEOCODER_URL', 'https://geo.example.test/search');
    expect(resolveGeocoderUrl()).toBe('https://geo.example.test/search');
  });
});

describe('geocoder pacing constants', () => {
  it('caps the shared public instance at roughly one request per second', () => {
    // Nominatim's public usage policy allows about one request per second.
    expect(GEOCODER_MIN_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
  });

  it('coalesces typing before any request is sent', () => {
    expect(SEARCH_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(SEARCH_DEBOUNCE_MS).toBeLessThan(GEOCODER_MIN_INTERVAL_MS);
  });

  it('requires a usable minimum query length', () => {
    expect(MIN_SEARCH_QUERY_LENGTH).toBeGreaterThanOrEqual(3);
  });
});

describe('zoomForBoundingBox', () => {
  it('returns null rather than inventing a zoom for unusable input', () => {
    expect(zoomForBoundingBox(null)).toBeNull();
    expect(zoomForBoundingBox(undefined)).toBeNull();
    expect(zoomForBoundingBox([] as unknown as [string, string, string, string])).toBeNull();
    expect(
      zoomForBoundingBox(['a', 'b', 'c', 'd'] as unknown as [string, string, string, string]),
    ).toBeNull();
  });

  it('returns null for a zero-span box rather than dividing by zero', () => {
    expect(zoomForBoundingBox(['10.0', '10.0', '79.0', '79.0'])).toBeNull();
  });

  it('zooms all the way in for a point-like result such as a single shrine', () => {
    expect(zoomForBoundingBox(['10.0', '10.0001', '79.0', '79.0001'])).toBe(MAX_MAP_ZOOM);
  });

  it('zooms OUT for a region-wide match instead of clamping to the default place zoom', () => {
    // Regression guard: flooring every zoom at DEFAULT_PLACE_ZOOM meant searching "India" flew the
    // camera to zoom 14 on a subcontinent.
    expect(zoomForBoundingBox(['6.0', '36.0', '68.0', '97.5'])).toBe(MIN_MAP_ZOOM);
  });

  it('scales with the size of the match', () => {
    const locality = zoomForBoundingBox(['10.70', '10.80', '79.70', '79.80']) as number;
    const region = zoomForBoundingBox(['10.0', '14.0', '78.0', '81.0']) as number;
    expect(locality).toBeGreaterThan(region);
  });

  it('always stays inside the map zoom bounds', () => {
    const boxes: Array<[string, string, string, string]> = [
      ['10.0000', '10.0001', '79.0000', '79.0001'],
      ['10.70', '10.80', '79.70', '79.80'],
      ['8.0', '13.5', '76.0', '80.5'],
      ['6.0', '36.0', '68.0', '97.5'],
    ];
    for (const box of boxes) {
      const zoom = zoomForBoundingBox(box) as number;
      expect(zoom).toBeGreaterThanOrEqual(MIN_MAP_ZOOM);
      expect(zoom).toBeLessThanOrEqual(MAX_MAP_ZOOM);
    }
  });

  it('uses the default place zoom only as a fallback, not as a floor', () => {
    // A ~0.2 degree box is wider than a single field, so it must zoom out below DEFAULT_PLACE_ZOOM.
    expect(zoomForBoundingBox(['10.68', '10.88', '79.70', '79.90'])).toBeLessThan(DEFAULT_PLACE_ZOOM);
  });

  it('accepts numeric boxes from a proxy that coerced the values', () => {
    expect(zoomForBoundingBox([10.7, 10.8, 79.7, 79.8] as unknown as [string, string, string, string]))
      .not.toBeNull();
  });
});
