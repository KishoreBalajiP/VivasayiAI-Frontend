import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import maplibregl, { type IControl, type LngLatBoundsLike, type Map as MapLibreMap } from 'maplibre-gl';
import MapboxDraw from 'maplibre-gl-draw';
import type { FeatureCollection, Polygon } from 'geojson';
import { AlertTriangle, Eraser, Loader2, MapPin, RotateCcw } from 'lucide-react';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
  OSM_ATTRIBUTION,
  firstPosition,
  isUsableTileTemplate,
  resolveMapTileUrl,
} from '../config/map';
import {
  isGeometryInsideParcel,
  validateDrawnPolygon,
  type GeometryProblemKey,
} from '../utils/parcelGeometry';
import type { GeoJsonPolygon } from '../types';

import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gl-draw/dist/mapbox-gl-draw.css';

const CONTEXT_SOURCE_ID = 'context-footprint';

export interface ParcelDrawMapProps {
  /** Existing polygon to preload (edit flow). Pass null when creating a new polygon. */
  value: GeoJsonPolygon | null;
  /**
   * Emitted ONLY for a valid closed polygon. The backend re-validates and recomputes the
   * authoritative acreage on every write, so this carries geometry only — never an area.
   * Optional because `readOnly` maps never emit; every editable call site must pass it.
   */
  onChange?: (polygon: GeoJsonPolygon | null) => void;
  /** Accessible name for the map surface, e.g. the parcel name. */
  label: string;
  /** Rendered as a dashed outline beneath the drawn polygon (affected-area map). */
  contextPolygon?: GeoJsonPolygon | null;
  /** Advisory note rendered under the map. */
  footerNote?: string | null;
  /** True when the polygon must sit inside `contextPolygon` (claim affected area). */
  contextIsContainer?: boolean;
  /**
   * Display-only mode (View Map). The stored boundary is rendered, panning/zooming and recentring
   * still work, but every draw/edit/clear affordance is disabled and `onChange` is never emitted.
   * Implemented with MapboxDraw's `static` mode, which is the control's own non-interactive mode,
   * rather than by merely hiding the buttons — a mislabelled control would otherwise let a farmer
   * "edit" a boundary that is never saved.
   */
  readOnly?: boolean;
  compact?: boolean;
}

const polygonToCollection = (polygon: GeoJsonPolygon): FeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'edited-polygon',
      properties: {},
      geometry: { type: 'Polygon', coordinates: polygon.coordinates } as Polygon,
    },
  ],
});

const boundsOf = (polygon: GeoJsonPolygon): LngLatBoundsLike | null => {
  const ring = polygon.coordinates?.[0];
  if (!ring?.length) return null;
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
};

/**
 * Interactive MapLibre polygon editor, used for BOTH the farm parcel boundary (Manage Parcels)
 * and the claim affected area (ClaimWizard).
 *
 * The two geometries are never conflated: the parcel boundary is persisted on the
 * FarmProfile, while the affected area only ever lives on the claim draft and is submitted
 * as the claim's `geometry`. Acreage shown here is a PREVIEW; the backend computes the
 * authoritative value on every write.
 */
export const ParcelDrawMap = ({
  value,
  onChange,
  label,
  contextPolygon = null,
  footerNote = null,
  contextIsContainer = false,
  readOnly = false,
  compact = false,
}: ParcelDrawMapProps) => {
  const { t } = useTranslation();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;  /** Set while the control is being seeded programmatically so it never looks like a user edit. */
  const suppressRef = useRef(false);
  /**
   * Serialized polygon we most recently emitted upwards. When the parent echoes that exact
   * value back down we must NOT re-seed: doing so would re-add the feature and can interrupt a
   * multi-click draw sequence the farmer is still performing.
   */
  const lastEmittedRef = useRef<string | null>(null);

  const tileUrl = resolveMapTileUrl();
  const tileUsable = isUsableTileTemplate(tileUrl);

  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [problem, setProblem] = useState<GeometryProblemKey | null>(null);
  const [previewAcres, setPreviewAcres] = useState<number | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Identity of the currently seeded polygon, so we only re-seed on a genuine change.
  const seedKey = value ? JSON.stringify(value.coordinates) : null;

  // ── map lifecycle (create once, tear down on unmount) ────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !tileUsable || !tileUrl) return undefined;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: { type: 'raster', tiles: [tileUrl], tileSize: 256, attribution: OSM_ATTRIBUTION },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      minZoom: MIN_MAP_ZOOM,
      maxZoom: MAX_MAP_ZOOM,
      attributionControl: { compact: true },
    });

    const draw = new MapboxDraw(
      readOnly
        ? { displayControlsDefault: false, controls: {}, defaultMode: 'static' }
        : { displayControlsDefault: false, controls: { polygon: true, trash: true }, defaultMode: 'simple_select' }
    );

    // `maplibre-gl-draw` ships its own types that reference a forked MapLibre build
    // (`kt-maplibre-gl`), so structurally-identical `Map` classes are not assignable to
    // maplibre-gl's `IControl`. At runtime the control only needs `onAdd`/`onRemove`/
    // `getDefaultPosition`, which it does implement — hence the cast. No behaviour is
    // suppressed, and no `any` leaks into the surrounding code.
    const drawControl = draw as unknown as IControl;

    mapRef.current = map;
    drawRef.current = draw;

    const handleLoad = () => {
      map.addControl(drawControl, 'top-left');
      setMapError(false);
      setReady(true);
    };

    const handleError = () => {
      // Only a failure that happens before the style loads leaves an unusable blank map;
      // later tile hiccups must not tear the map down.
      if (!map.loaded() && !map.isStyleLoaded()) setMapError(true);
    };

    const handleDraw = () => {
      // `static` mode emits no draw events; this guard makes the read-only contract explicit and
      // keeps the component safe if the mode is ever changed.
      if (readOnly) return;
      if (suppressRef.current) return;
      const collection = draw.getAll();
      const validation = validateDrawnPolygon(collection);
      if (!validation.ok) {
        setProblem(validation.reason);
        setPreviewAcres(null);
        return;
      }
      setProblem(null);
      setPreviewAcres(validation.previewAcres);
      lastEmittedRef.current = JSON.stringify(validation.polygon.coordinates);
      onChangeRef.current?.(validation.polygon);
    };

    map.on('load', handleLoad);
    map.on('error', handleError);
    map.on('draw.create', handleDraw);
    map.on('draw.update', handleDraw);
    map.on('draw.delete', handleDraw);

    // Some mobile browsers report a stale size when a container animates in.
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.resize()) : null;
    resizeObserver?.observe(containerRef.current);

    return () => {
      resizeObserver?.disconnect();
      setReady(false);
      try {
        map.removeControl(drawControl);
      } catch {
        /* control was never added because the map never finished loading */
      }
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, [tileUsable, tileUrl, readOnly]);

  // ── seed an existing polygon into the draw control ────────────────────────────────────────
  useEffect(() => {
    const draw = drawRef.current;
    const map = mapRef.current;
    if (!draw || !map || !ready) return;
    if (seededFor === seedKey) return;
    // The parent echoed back exactly what we emitted — nothing to seed.
    if (lastEmittedRef.current === seedKey) {
      setSeededFor(seedKey);
      return;
    }

    suppressRef.current = true;
    draw.deleteAll();
    lastEmittedRef.current = null;

    if (value) {
      const collection = polygonToCollection(value);
      draw.add(collection);
      const validation = validateDrawnPolygon(collection);
      setProblem(validation.ok ? null : validation.reason);
      setPreviewAcres(validation.ok ? validation.previewAcres : null);

      const bounds = boundsOf(value);
      if (bounds) map.fitBounds(bounds, { padding: 56, maxZoom: 17, duration: 0 });
    } else {
      setProblem(null);
      setPreviewAcres(null);
    }

    suppressRef.current = false;
    setSeededFor(seedKey);
  }, [ready, seedKey, seededFor, value]);

  // ── context outline (affected-area map shows the parcel it sits inside) ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const data = contextPolygon
      ? polygonToCollection(contextPolygon)
      : ({ type: 'FeatureCollection', features: [] } as FeatureCollection);

    const existing = map.getSource(CONTEXT_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data as never);
      return;
    }
    map.addSource(CONTEXT_SOURCE_ID, { type: 'geojson', data: data as never });
    map.addLayer({
      id: `${CONTEXT_SOURCE_ID}-fill`,
      type: 'fill',
      source: CONTEXT_SOURCE_ID,
      paint: { 'fill-color': '#059669', 'fill-opacity': 0.08 },
    });
    map.addLayer({
      id: `${CONTEXT_SOURCE_ID}-line`,
      type: 'line',
      source: CONTEXT_SOURCE_ID,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#047857', 'line-width': 2, 'line-dasharray': [3, 2] },
    });
  }, [contextPolygon, ready]);

  const resetToEmpty = useCallback(() => {
    if (readOnly) return;
    const draw = drawRef.current;
    if (!draw) return;
    suppressRef.current = true;
    draw.deleteAll();
    suppressRef.current = false;
    setSeededFor(null);
    setProblem('geometryEmpty');
    setPreviewAcres(null);
    onChangeRef.current?.(null);
  }, [readOnly]);

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const anchor = firstPosition(value ?? contextPolygon);
    if (anchor) {
      map.flyTo({ center: anchor, zoom: Math.max(map.getZoom(), 16) });
      return;
    }
    map.flyTo({ center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM });
  }, [value, contextPolygon]);

  const handleRedraw = useCallback(() => {
    if (readOnly) return;
    resetToEmpty();
    drawRef.current?.changeMode('draw_polygon');
  }, [resetToEmpty, readOnly]);

  // ── missing / invalid tile configuration: explain, never show a blank map ─────────────────
  if (!tileUsable) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-center"
      >
        <AlertTriangle className="h-5 w-5 text-amber-700" />
        <p className="text-sm font-semibold text-amber-900">{t('mapTilesNotConfiguredTitle')}</p>
        <p className="text-xs text-amber-800">{t('mapTilesNotConfiguredBody')}</p>
      </div>
    );
  }

  const heightClass = compact ? 'h-60 sm:h-80' : 'h-72 sm:h-96';

  return (
    <div className="space-y-2">
      <div className={`relative w-full overflow-hidden rounded-xl border border-gray-200 ${heightClass}`}>
        <div ref={containerRef} className="absolute inset-0" role="application" aria-label={label} />

        {!ready && !mapError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/85 text-gray-600">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            <p className="text-sm">{t('mapLoading')}</p>
          </div>
        )}

        {mapError && (
          <div
            role="alert"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/95 p-4 text-center"
          >
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-sm font-semibold text-red-700">{t('mapLoadFailed')}</p>
            <p className="text-xs text-red-600">{t('mapLoadFailedHint')}</p>
          </div>
        )}

        {/* Controls kept bottom-right and wrapping so they never cover Save on 360px. */}
        <div className="absolute bottom-2 right-2 z-10 flex flex-wrap justify-end gap-1.5">
          <button
            type="button"
            onClick={handleRecenter}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white/95 px-2 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-white"
          >
            <MapPin className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('mapRecenter')}</span>
          </button>
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={handleRedraw}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white/95 px-2 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('mapRedraw')}</span>
              </button>
              <button
                type="button"
                onClick={resetToEmpty}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white/95 px-2 py-1.5 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50"
              >
                <Eraser className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('mapClear')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {readOnly ? t('mapViewOnlyHint') : t('mapDrawHint')}
      </p>

      {problem && problem !== 'geometryEmpty' && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {t(`geometryError_${problem}`)}
        </p>
      )}

      {/* In read-only mode the parent renders the BACKEND-computed acreage, so a client preview
          here would be both redundant and less authoritative. */}
      {previewAcres !== null && !readOnly && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {t('mapPreviewArea', { acres: previewAcres })}
        </p>
      )}

      {contextIsContainer && contextPolygon && value && !isGeometryInsideParcel(value, contextPolygon) && (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {t('areaOutsideParcelWarning')}
        </p>
      )}

      {footerNote && <p className="text-xs text-gray-500">{footerNote}</p>}
    </div>
  );
};

export default ParcelDrawMap;