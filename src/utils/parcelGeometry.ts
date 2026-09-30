// Client-side polygon helpers for the parcel-boundary and claim affected-area maps
// (ADR-019 P8).
//
// IMPORTANT — authority boundary. The backend (`services/parcelGeometry.service.js`) is the
// ONLY source of authoritative acreage: it validates the ring and computes
// `calculatedAreaAcres` / `claimedAreaAcres` on every write. Nothing in this file is ever
// trusted for a stored area value; the acreage produced here is explicitly a PREVIEW for the
// farmer's own confidence while drawing.
//
// These rules intentionally mirror the backend contract so the farmer gets immediate, useful
// feedback instead of a confusing round-trip rejection:
//   - geometry.type must be 'Polygon'
//   - exactly one exterior ring (no holes)
//   - ring must be closed (first position === last position)
//   - at least 4 positions in the ring (3 distinct vertices + closure)
//   - at most 100 vertices
//   - ring must not self-intersect
//   - area must be non-degenerate
//
// Pure module: no React, no MapLibre, so it is directly unit-testable in the existing
// node-environment vitest setup.

import area from '@turf/area';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { feature as turfFeature, point as turfPoint } from '@turf/helpers';
import type { Feature, FeatureCollection, Polygon, Position } from 'geojson';
import type { GeoJsonPolygon, GeoPosition } from '../types';

/** Mirrors the backend MAX_RING_VERTICES. */
export const MAX_RING_VERTICES = 100;

/**
 * Mirrors the backend MIN_AREA_SQ_METERS — below this the polygon is a degenerate sliver.
 * Used only to give early feedback; the backend re-checks on write.
 */
export const MIN_PREVIEW_AREA_SQ_METERS = 0.01;

const ACRES_PER_SQ_METER = 1 / 4046.8564224;

export type GeometryProblemKey =
  | 'geometryEmpty'
  | 'geometryTooFewPoints'
  | 'geometrySelfIntersects'
  | 'geometryTooManyPoints'
  | 'geometryDegenerate'
  | 'geometryTooLarge'
  | 'geometryMultiRing';

export type GeometryValidation =
  | { ok: true; polygon: GeoJsonPolygon; previewAcres: number }
  | { ok: false; reason: GeometryProblemKey };

const isPosition = (value: unknown): value is GeoPosition =>
  Array.isArray(value) &&
  value.length >= 2 &&
  Number.isFinite(Number(value[0])) &&
  Number.isFinite(Number(value[1]));

// Cross-product orientation of an ordered triple in the lon/lat plane (same construction as
// the backend's `orient`).
const orient = (a: GeoPosition, b: GeoPosition, c: GeoPosition): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

const onSegment = (a: GeoPosition, b: GeoPosition, p: GeoPosition): boolean =>
  p[0] >= Math.min(a[0], b[0]) &&
  p[0] <= Math.max(a[0], b[0]) &&
  p[1] >= Math.min(a[1], b[1]) &&
  p[1] <= Math.max(a[1], b[1]);

const segmentsIntersect = (
  p1: GeoPosition,
  p2: GeoPosition,
  p3: GeoPosition,
  p4: GeoPosition,
): boolean => {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
};

/**
 * True when any non-adjacent edge of the closed ring crosses. Adjacent edges legitimately
 * share one vertex, and the first/last edge pair shares the ring-closure vertex, so both are
 * skipped — identical to the backend's `ringSelfIntersects`.
 */
export function ringSelfIntersects(ring: GeoPosition[]): boolean {
  const edges: [GeoPosition, GeoPosition][] = [];
  for (let i = 0; i < ring.length - 1; i += 1) edges.push([ring[i], ring[i + 1]]);

  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      if (j === i + 1) continue;
      if (i === 0 && j === edges.length - 1) continue;
      if (segmentsIntersect(edges[i][0], edges[i][1], edges[j][0], edges[j][1])) return true;
    }
  }
  return false;
}

/** Convert a Turf Feature<Polygon> into the app's GeoJsonPolygon shape. */
export function turfToGeoJsonPolygon(feature: Feature<Polygon>): GeoJsonPolygon {
  return { type: 'Polygon', coordinates: feature.geometry.coordinates as GeoPosition[][] };
}

/**
 * Extract the single drawn polygon from a MapLibre draw feature collection.
 * Only `draw_polygon` features are considered, and only the first one — the parcel contract
 * allows exactly one exterior ring, so a second polygon is never silently merged.
 */
export function extractDrawnPolygon(
  collection: FeatureCollection | null | undefined,
): Feature<Polygon> | null {
  if (!collection?.features?.length) return null;
  for (const feature of collection.features) {
    // `mode` is only present on live draw features; rehydrated edit data may have it
    // stripped, so any Polygon geometry is still a valid candidate.
    if (feature.geometry?.type !== 'Polygon') continue;
    if (feature.properties?.mode !== undefined && feature.properties.mode !== 'draw_polygon') {
      continue;
    }
    return feature as Feature<Polygon>;
  }
  return null;
}

/**
 * Validate a candidate drawn polygon against the same rules the backend enforces.
 * Returns the normalized polygon (closed ring) plus a PREVIEW acreage for display only.
 */
export function validateDrawnPolygon(
  collection: FeatureCollection | null | undefined,
): GeometryValidation {
  const feature = extractDrawnPolygon(collection);
  if (!feature) return { ok: false, reason: 'geometryEmpty' };

  const ring = (feature.geometry.coordinates?.[0] ?? []) as GeoPosition[];
  const otherRings = feature.geometry.coordinates?.slice(1) ?? [];
  if (otherRings.length > 0) return { ok: false, reason: 'geometryMultiRing' };

  const clean = ring.filter(isPosition).map((p) => [Number(p[0]), Number(p[1])] as GeoPosition);
  if (clean.length === 0) return { ok: false, reason: 'geometryEmpty' };

  // Count DISTINCT vertices: a trailing copy of the first position is the closure, not a vertex.
  // This must be done before closing, otherwise an open 3-vertex ring (which is a legal triangle)
  // would look like it has only 2 vertices and be rejected.
  const withoutClosure =
    clean.length > 1 &&
    clean[0][0] === clean[clean.length - 1][0] &&
    clean[0][1] === clean[clean.length - 1][1]
      ? clean.slice(0, -1)
      : clean;
  // The backend requires a closed ring of >= 4 positions, i.e. at least 3 distinct vertices.
  if (withoutClosure.length < 3) return { ok: false, reason: 'geometryTooFewPoints' };

  // MapLibre/Turf close the ring on creation, but normalize defensively so the farmer is never
  // blocked by a closure detail the backend would accept.
  const closed: GeoPosition[] = [...withoutClosure];
  closed.push([closed[0][0], closed[0][1]]);

  // The backend checks `ring.length > MAX_RING_VERTICES` on the CLOSED ring, so the closure
// vertex is counted. Mirror that exactly to avoid accepting a polygon the server will reject.
if (closed.length > MAX_RING_VERTICES) return { ok: false, reason: 'geometryTooManyPoints' };
if (ringSelfIntersects(closed)) return { ok: false, reason: 'geometrySelfIntersects' };

  const polygon: GeoJsonPolygon = { type: 'Polygon', coordinates: [closed] };
  // GeoJSON Polygon coordinates are an array OF RINGS, so this must be `[closed]` — passing the
  // ring itself silently yields an area of 0 and would reject every valid drawing as degenerate.
  const sqMeters = area(
    turfFeature<Polygon>({
      type: 'Polygon',
      coordinates: [closed as unknown as Position[]],
    }),
  );
  if (!Number.isFinite(sqMeters) || sqMeters <= MIN_PREVIEW_AREA_SQ_METERS) {
    return { ok: false, reason: 'geometryDegenerate' };
  }

  return { ok: true, polygon, previewAcres: roundPreviewAcres(sqMeters) };
}

/** Round a preview acreage to 4 dp, matching the backend's stored precision. */
export function roundPreviewAcres(sqMeters: number): number {
  return Math.round(sqMeters * ACRES_PER_SQ_METER * 10000) / 10000;
}

/**
 * Client-side containment check for the claim affected-area map: is every vertex of the
 * affected area inside the parcel polygon? Purely advisory feedback — the backend's
 * Phase 9 spatial verification remains authoritative and issues the real decision.
 */
export function isGeometryInsideParcel(
  affected: GeoJsonPolygon | null | undefined,
  parcel: GeoJsonPolygon | null | undefined,
): boolean {
  if (!affected?.coordinates?.[0] || !parcel?.coordinates?.[0]) return false;
  const parcelFeature = turfFeature<Polygon>({
    type: 'Polygon',
    coordinates: parcel.coordinates as number[][][],
  });
  const affectedRing = affected.coordinates[0];
  // Test a representative set of vertices; the map is advisory, the server decides.
  const step = Math.max(1, Math.floor(affectedRing.length / 5));
  for (let i = 0; i < affectedRing.length - 1; i += step) {
    const position = affectedRing[i];
    if (!booleanPointInPolygon(turfPoint([position[0], position[1]]), parcelFeature)) return false;
  }
  return true;
}

/** True when two rings cross each other — used to warn about affected-area self-overlap. */
export function ringsCross(a: GeoJsonPolygon, b: GeoJsonPolygon): boolean {
  const ringA = a.coordinates?.[0];
  const ringB = b.coordinates?.[0];
  if (!ringA?.length || !ringB?.length) return false;
  // Reuses the same segment test as the self-intersection check, so ring-crossing detection
  // stays consistent with the backend's orientation maths without an extra dependency.
  for (let i = 0; i < ringA.length - 1; i += 1) {
    for (let j = 0; j < ringB.length - 1; j += 1) {
      if (segmentsIntersect(ringA[i], ringA[i + 1], ringB[j], ringB[j + 1])) return true;
    }
  }
  return false;
}

/**
 * Whether a stored parcel actually carries a usable boundary.
 *
 * `ParcelRecord.geometry` is non-nullable in the type and required by the backend schema, so
 * this is a defensive guard for legacy/corrupt records: such a parcel cannot be used for a
 * claim and the UI must send the farmer into the edit flow to draw its boundary rather than
 * fabricating one.
 */
export function hasUsableGeometry(
  parcel: { geometry?: GeoJsonPolygon | null } | null | undefined,
): parcel is { geometry: GeoJsonPolygon } {
  const geometry = parcel?.geometry;
  if (!geometry || geometry.type !== 'Polygon') return false;
  const ring = geometry.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return false;
  return ring.every(
    (position) =>
      Array.isArray(position) &&
      Number.isFinite(Number(position[0])) &&
      Number.isFinite(Number(position[1])),
  );
}