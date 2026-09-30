// Tests for the MapLibre map configuration (tile template resolution, initial view, bounds).
//
// The tile template rules matter for more than tidiness: if `resolveMapTileUrl` returns something
// MapLibre cannot load, the map renders a blank canvas with no explanation, and the farmer has no
// way to know whether they broke something or the app did. These tests pin the three outcomes the
// UI distinguishes — usable template, operator-disabled tiles, and invalid template — so the map
// component can keep showing a real message instead of a blank map.

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_TILE_URL,
  DEFAULT_MAP_ZOOM,
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
  OSM_ATTRIBUTION,
  firstPosition,
  isUsableTileTemplate,
  resolveMapTileUrl,
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
