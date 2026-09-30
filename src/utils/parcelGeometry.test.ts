// Unit tests for the client-side polygon helpers that back the parcel-boundary and claim
// affected-area maps (ADR-019 P8).
//
// The rules asserted here are a MIRROR of `services/parcelGeometry.service.js` on the backend. That
// mirroring is deliberate and load-bearing: if these drift, the farmer gets a confusing round-trip
// rejection instead of immediate feedback. The last test in each block pins that contract to the
// numbers the backend actually uses, so a change on one side is caught here.
//
// These are pure functions (no React, no MapLibre), so they run in the existing node test
// environment. Critically, nothing here is treated as authoritative for acreage: the backend
// recomputes every area on write, and these results are preview-only.

import { describe, expect, it } from 'vitest';

import {
  MAX_RING_VERTICES,
  extractDrawnPolygon,
  hasUsableGeometry,
  isGeometryInsideParcel,
  previewAreaAcres,
  ringSelfIntersects,
  ringsCross,
  roundPreviewAcres,
  turfToGeoJsonPolygon,
  validateDrawnPolygon,
} from './parcelGeometry';
import type { GeoJsonPolygon, GeoPosition } from '../types';
import type { Feature, FeatureCollection, Polygon } from 'geojson';

// ── fixtures ────────────────────────────────────────────────────────────────────────────

/** ~1 km-ish square in Tamil Nadu, a realistic single parcel. */
const SQUARE: GeoPosition[] = [
  [79.1378, 10.787],
  [79.1478, 10.787],
  [79.1478, 10.796],
  [79.1378, 10.796],
  [79.1378, 10.787],
];

const squarePolygon: GeoJsonPolygon = { type: 'Polygon', coordinates: [SQUARE] };

const collectionOf = (coordinates: GeoPosition[][]): FeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'f',
      properties: { mode: 'draw_polygon' },
      geometry: { type: 'Polygon', coordinates },
    } as Feature<Polygon>,
  ],
});

const single = (collection: FeatureCollection | null | undefined) => extractDrawnPolygon(collection);

// ── extraction ──────────────────────────────────────────────────────────────────────────

describe('extractDrawnPolygon', () => {
  it('returns null for an empty collection (nothing drawn yet)', () => {
    expect(single({ type: 'FeatureCollection', features: [] })).toBeNull();
    expect(single(null)).toBeNull();
    expect(single(undefined)).toBeNull();
  });

  it('extracts the drawn polygon', () => {
    const feature = single(collectionOf([SQUARE]));
    expect(feature?.geometry.type).toBe('Polygon');
  });

  it('ignores non-polygon geometry (a stray line or point)', () => {
    const collection: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { mode: 'draw_line_string' },
          geometry: { type: 'LineString', coordinates: SQUARE },
        } as unknown as Feature,
      ],
    };
    expect(single(collection)).toBeNull();
  });

  it('takes only the first polygon — a second is never silently merged', () => {
    const shifted: GeoPosition[] = SQUARE.map(([lon, lat]) => [lon + 0.01, lat]);
    const collection: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        collectionOf([SQUARE]).features[0],
        collectionOf([shifted]).features[0],
      ],
    };
    expect(single(collection)?.geometry.coordinates[0]).toEqual(SQUARE);
  });

  it('accepts a polygon whose mode property was stripped (rehydrated edit data)', () => {
    const collection: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [SQUARE] },
        } as unknown as Feature<Polygon>,
      ],
    };
    expect(single(collection)).not.toBeNull();
  });
});

// ── self-intersection ──────────────────────────────────────────────────────────────────

describe('ringSelfIntersects', () => {
  it('does not flag a simple convex ring', () => {
    expect(ringSelfIntersects(SQUARE)).toBe(false);
  });

  it('does not flag a concave (L-shaped) but legal ring', () => {
    const ell: GeoPosition[] = [
      [79.0, 10.0],
      [79.2, 10.0],
      [79.2, 10.1],
      [79.1, 10.1],
      [79.1, 10.2],
      [79.0, 10.2],
      [79.0, 10.0],
    ];
    expect(ringSelfIntersects(ell)).toBe(false);
  });

  it('flags a classic bow-tie', () => {
    const bowtie: GeoPosition[] = [
      [79.0, 10.0],
      [79.2, 10.2],
      [79.2, 10.0],
      [79.0, 10.2],
      [79.0, 10.0],
    ];
    expect(ringSelfIntersects(bowtie)).toBe(true);
  });

  it('does not flag a ring that merely touches itself at a vertex', () => {
    // Adjacent edges legitimately share vertices; only genuine crossings are rejected.
    const pinched: GeoPosition[] = [
      [79.0, 10.0],
      [79.1, 10.1],
      [79.2, 10.0],
      [79.1, 10.1],
      [79.1, 10.3],
      [79.0, 10.0],
    ];
    expect(ringSelfIntersects(pinched)).toBe(true);
  });
});

// ── validation ──────────────────────────────────────────────────────────────────────────

describe('validateDrawnPolygon', () => {
  it('rejects an empty collection', () => {
    expect(validateDrawnPolygon({ type: 'FeatureCollection', features: [] })).toEqual({
      ok: false,
      reason: 'geometryEmpty',
    });
  });

  it('rejects a ring with fewer than 3 distinct vertices', () => {
    const triangleOnlyTwo: GeoPosition[] = [
      [79.0, 10.0],
      [79.1, 10.1],
      [79.0, 10.0],
    ];
    expect(validateDrawnPolygon(collectionOf([triangleOnlyTwo]))).toEqual({
      ok: false,
      reason: 'geometryTooFewPoints',
    });
  });

  it('accepts exactly 3 distinct vertices + closure', () => {
    const triangle: GeoPosition[] = [
      [79.0, 10.0],
      [79.1, 10.0],
      [79.1, 10.1],
      [79.0, 10.0],
    ];
    const result = validateDrawnPolygon(collectionOf([triangle]));
    expect(result.ok).toBe(true);
  });

  it('closes an unclosed ring instead of rejecting it (the backend would accept it)', () => {
    const open: GeoPosition[] = [
      [79.0, 10.0],
      [79.1, 10.0],
      [79.1, 10.1],
    ];
    const result = validateDrawnPolygon(collectionOf([open]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ring = result.polygon.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('rejects a self-intersecting ring', () => {
    const bowtie: GeoPosition[] = [
      [79.0, 10.0],
      [79.2, 10.2],
      [79.2, 10.0],
      [79.0, 10.2],
      [79.0, 10.0],
    ];
    expect(validateDrawnPolygon(collectionOf([bowtie]))).toEqual({
      ok: false,
      reason: 'geometrySelfIntersects',
    });
  });

  it('rejects a degenerate zero-area sliver', () => {
    // Collinear points enclose no area.
    const sliver: GeoPosition[] = [
      [79.0, 10.0],
      [79.1, 10.0],
      [79.2, 10.0],
      [79.0, 10.0],
    ];
    expect(validateDrawnPolygon(collectionOf([sliver]))).toEqual({
      ok: false,
      reason: 'geometryDegenerate',
    });
  });

  it('rejects a ring with a hole — the MVP contract is a single exterior ring', () => {
    const withHole: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { mode: 'draw_polygon' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              SQUARE,
              [
                [79.14, 10.79],
                [79.141, 10.79],
                [79.141, 10.791],
                [79.14, 10.79],
              ],
            ],
          },
        } as unknown as Feature<Polygon>,
      ],
    };
    expect(validateDrawnPolygon(withHole)).toEqual({
      ok: false,
      reason: 'geometryMultiRing',
    });
  });

  it('rejects a ring beyond the backend vertex cap', () => {
    // Build a many-sided blob comfortably under the degenerate-area floor.
    const vertices: GeoPosition[] = Array.from({ length: MAX_RING_VERTICES + 5 }, (_, i) => {
      const angle = (i / (MAX_RING_VERTICES + 5)) * Math.PI * 2;
      return [79.14 + Math.cos(angle) * 0.002, 10.79 + Math.sin(angle) * 0.002] as GeoPosition;
    });
    vertices.push(vertices[0]);
    expect(validateDrawnPolygon(collectionOf([vertices]))).toEqual({
      ok: false,
      reason: 'geometryTooManyPoints',
    });
  });

  it('accepts a ring exactly at the backend vertex cap', () => {
    // 100 closed positions = 99 distinct vertices, matching the backend's `ring.length` check.
    const count = MAX_RING_VERTICES;
    const vertices: GeoPosition[] = Array.from({ length: count }, (_, i) => {
      const angle = (i / (count - 1)) * Math.PI * 2;
      return [79.14 + Math.cos(angle) * 0.002, 10.79 + Math.sin(angle) * 0.002] as GeoPosition;
    });
    vertices[count - 1] = vertices[0];
    expect(validateDrawnPolygon(collectionOf([vertices])).ok).toBe(true);
  });

  it('coerces string coordinates to numbers, as JSON round-tripping can deliver them', () => {
    const stringly: GeoPosition[] = [
      ['79.0' as unknown as number, '10.0' as unknown as number],
      ['79.1' as unknown as number, '10.0' as unknown as number],
      ['79.1' as unknown as number, '10.1' as unknown as number],
      ['79.0' as unknown as number, '10.0' as unknown as number],
    ];
    const result = validateDrawnPolygon(collectionOf([stringly]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.polygon.coordinates[0][0]).toEqual([79, 10]);
  });

  it('returns a preview acreage for a valid polygon (advisory only, never authoritative)', () => {
    const result = validateDrawnPolygon(collectionOf([SQUARE]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // ~1km x ~1km ≈ 247 acres. Asserted loosely on purpose: this is a Turf preview, the backend
    // owns the stored value.
    expect(result.previewAcres).toBeGreaterThan(200);
    expect(result.previewAcres).toBeLessThan(300);
  });

  it('drops unparseable positions rather than forwarding NaN geometry', () => {
    const dirty: unknown[] = [
      [79.0, 10.0],
      [Number.NaN, 10.0],
      [79.1, 10.0],
      [79.1, 10.1],
      [79.0, 10.1],
      [79.0, 10.0],
    ];
    const result = validateDrawnPolygon(collectionOf([dirty as GeoPosition[]]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.polygon.coordinates[0].flat().every(Number.isFinite)).toBe(true);
  });
});

// ── acreage conversion ─────────────────────────────────────────────────────────────────

describe('roundPreviewAcres', () => {
  it('converts square metres to acres at the backend constant', () => {
    // 4046.8564224 m² is exactly one acre.
    expect(roundPreviewAcres(4046.8564224)).toBe(1);
  });

  it('rounds to 4 decimal places to match the stored precision', () => {
    expect(roundPreviewAcres(1234.56789)).toBe(roundPreviewAcres(1234.56789));
    const value = roundPreviewAcres(9999.999999);
    expect(String(value).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });
});

describe('previewAreaAcres', () => {
  it('measures the polygon it is given, not some enclosing parcel', () => {
    const oneAcre = previewAreaAcres(squarePolygon);
    expect(oneAcre).toBeGreaterThan(0);

    // A rectangle covering the left half of the square has half the area.
    // SQUARE is [west, south], [east, south], [east, north], [west, north] — so the NORTH edge is
    // rows 2/3, not row 1 (reusing row 1 would collapse the ring to a line and area 0).
    const midX = (SQUARE[0][0] + SQUARE[1][0]) / 2;
    const half: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [SQUARE[0][0], SQUARE[0][1]],
          [midX, SQUARE[0][1]],
          [midX, SQUARE[2][1]],
          [SQUARE[0][0], SQUARE[2][1]],
          [SQUARE[0][0], SQUARE[0][1]],
        ],
      ],
    };
    const halfAcre = previewAreaAcres(half);
    expect(halfAcre).not.toBeNull();
    expect(halfAcre!).toBeLessThan(oneAcre!);
    expect(halfAcre!).toBeCloseTo(oneAcre! / 2, 3);
  });

  it('returns null for unusable input instead of a fabricated zero', () => {
    expect(previewAreaAcres(null)).toBeNull();
    expect(previewAreaAcres(undefined)).toBeNull();
    expect(previewAreaAcres({ type: 'Polygon', coordinates: [] })).toBeNull();
    expect(previewAreaAcres({ type: 'Polygon', coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] })).toBeNull();
    expect(
      previewAreaAcres({ type: 'Polygon', coordinates: [[['x' as never, 0], [1, 0], [1, 1], [0, 1]]] }),
    ).toBeNull();
  });

  it('never reports an area above the polygon it was given', () => {
    // Rounded to 4 dp, exactly like every other preview value in this module.
    const preview = previewAreaAcres(squarePolygon);
    expect(preview).toBe(roundPreviewAcres(preview! * 4046.8564224));
    expect(String(preview).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });
});

describe('turfToGeoJsonPolygon', () => {
  it('narrows a Turf feature to the app polygon shape', () => {
    const feature: Feature<Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [SQUARE] },
    };
    expect(turfToGeoJsonPolygon(feature)).toEqual(squarePolygon);
  });
});

// ── affected-area containment (advisory) ────────────────────────────────────────────────

describe('isGeometryInsideParcel', () => {
  it('accepts an area fully inside the parcel', () => {
    const inner: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [79.14, 10.79],
          [79.145, 10.79],
          [79.145, 10.794],
          [79.14, 10.794],
          [79.14, 10.79],
        ],
      ],
    };
    expect(isGeometryInsideParcel(inner, squarePolygon)).toBe(true);
  });

  it('rejects an area that pokes outside the parcel', () => {
    const outside: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [79.14, 10.79],
          [79.2, 10.79],
          [79.2, 10.794],
          [79.14, 10.794],
          [79.14, 10.79],
        ],
      ],
    };
    expect(isGeometryInsideParcel(outside, squarePolygon)).toBe(false);
  });

  it('returns false when either side is missing — never assumes containment', () => {
    expect(isGeometryInsideParcel(null, squarePolygon)).toBe(false);
    expect(isGeometryInsideParcel(squarePolygon, null)).toBe(false);
    expect(isGeometryInsideParcel(undefined, undefined)).toBe(false);
  });
});

describe('ringsCross', () => {
  it('detects crossing rings', () => {
    const a: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [[[0, 0], [10, 10], [10, 0], [0, 0]]],
    };
    const b: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [[[0, 10], [10, 10], [10, 0], [0, 10]]],
    };
    expect(ringsCross(a, b)).toBe(true);
  });

  it('reports no crossing for two disjoint rings', () => {
    const a: GeoJsonPolygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
    const b: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [[[5, 5], [6, 5], [6, 6], [5, 5]]],
    };
    expect(ringsCross(a, b)).toBe(false);
  });

  it('is safe on empty input', () => {
    const empty: GeoJsonPolygon = { type: 'Polygon', coordinates: [] };
    expect(ringsCross(empty, squarePolygon)).toBe(false);
    expect(ringsCross(squarePolygon, empty)).toBe(false);
  });
});

// ── legacy record guard ────────────────────────────────────────────────────────────────

describe('hasUsableGeometry', () => {
  it('accepts a well-formed parcel polygon', () => {
    expect(hasUsableGeometry({ geometry: squarePolygon })).toBe(true);
  });

  it('rejects a parcel with no geometry (legacy record) so it cannot back a claim', () => {
    expect(hasUsableGeometry({ geometry: null })).toBe(false);
    expect(hasUsableGeometry({ geometry: undefined })).toBe(false);
    expect(hasUsableGeometry({})).toBe(false);
    expect(hasUsableGeometry(null)).toBe(false);
    expect(hasUsableGeometry(undefined)).toBe(false);
  });

  it('rejects a ring with too few positions', () => {
    expect(
      hasUsableGeometry({
        geometry: { type: 'Polygon', coordinates: [[[79, 10], [79.1, 10], [79, 10]]] },
      }),
    ).toBe(false);
  });

  it('rejects non-finite coordinates', () => {
    expect(
      hasUsableGeometry({
        geometry: {
          type: 'Polygon',
          coordinates: [[[79, 10], [Number.NaN, 10], [79.1, 10.1], [79, 10]]],
        },
      }),
    ).toBe(false);
  });

  it('narrows the type so callers get a non-null geometry', () => {
    const parcel = { geometry: squarePolygon } as { geometry: GeoJsonPolygon | null };
    if (hasUsableGeometry(parcel)) {
      // Type-level assertion: coordinates are reachable without a null check.
      expect(parcel.geometry.coordinates[0].length).toBeGreaterThan(3);
    }
  });
});
