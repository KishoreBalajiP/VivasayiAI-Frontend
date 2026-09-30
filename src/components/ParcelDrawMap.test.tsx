// Direct tests for the real ParcelDrawMap component with MapLibre and MapboxDraw mocked out.
//
// The other map tests replace this component with a stand-in, which leaves the riskiest
// interaction untested: that a location SEARCH moves the camera and nothing else. That is the
// property this file exists to protect, because the money in this app depends on the boundary the
// farmer actually draws.
//
// A search result supplies a place name and coordinates. If picking one ever reached the draw
// control, a farmer could save a parcel boundary that they never drew — at someone else's field,
// at a village centroid, or in the sea. So the assertions below check the DRAW side of the
// component stayed completely untouched, not merely that onChange was not called (onChange would
// legitimately fire later, from a real drawing).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '../i18n';
import type { GeoJsonPolygon } from '../types';

const flyTo = vi.fn();
const mapResize = vi.fn();
const addControl = vi.fn();
const setFeatureProperty = vi.fn();
const drawGetAll = vi.fn();
const drawChangeMode = vi.fn();
const drawDeleteAll = vi.fn();
const drawAdd = vi.fn();
let currentCentre: [number, number] = [78.4, 9.5];

vi.mock('maplibre-gl', () => {
  class MockMap {
    // Fire `load` as soon as it is registered: a real MapLibre instance reaches this state, and
    // without it the component never becomes ready and never seeds the draw control.
    on = vi.fn((event: string, handler: () => void) => {
      if (event === 'load') queueMicrotask(() => handler());
    });
    off = vi.fn();
    addControl = addControl;
    removeControl = vi.fn();
    flyTo = flyTo;
    resize = mapResize;
    loaded = () => true;
    isStyleLoaded = () => true;
    getCenter = () => currentCentre;
    getZoom = () => 11;
    easeTo = vi.fn();
    fitBounds = vi.fn();
    addSource = vi.fn();
    addLayer = vi.fn();
    getSource = vi.fn();
    remove = vi.fn();
  }

  return {
    default: { Map: MockMap },
    Map: MockMap,
    NavigationControl: class {},
  };
});

vi.mock('maplibre-gl-draw', () => {
  class MockDraw {
    getAll = drawGetAll;
    changeMode = drawChangeMode;
    deleteAll = drawDeleteAll;
    add = drawAdd;
    setFeatureProperty = setFeatureProperty;
  }
  return { default: MockDraw };
});

// Geocoding is exercised thoroughly in locationSearch.test.ts and ParcelLocationSearch.test.tsx.
// Here it is stubbed so the tests can drive the map integration deterministically.
const searchLocations = vi.fn();
vi.mock('../services/locationSearch', async () => {
  const actual = await vi.importActual<typeof import('../services/locationSearch')>(
    '../services/locationSearch',
  );
  return { ...actual, searchLocations: (...args: unknown[]) => searchLocations(...args) };
});

import { ParcelDrawMap } from './ParcelDrawMap';
import { LocationContext } from '../context/LocationContext';
import type { LocationContextValue } from '../context/LocationContext';

const polygon = (): GeoJsonPolygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [79.8, 10.7],
      [79.9, 10.7],
      [79.9, 10.8],
      [79.8, 10.8],
      [79.8, 10.7],
    ],
  ],
});

const featureCollection = () => ({ type: 'FeatureCollection', features: [] } as never);

const runSearch = async (user: ReturnType<typeof userEvent.setup>, query: string) => {
  await user.type(screen.getByRole('combobox'), query);
  await waitFor(() => expect(searchLocations).toHaveBeenCalled());
};

beforeEach(() => {
  vi.clearAllMocks();
  currentCentre = [78.4, 9.5];
  drawGetAll.mockReturnValue(featureCollection());
  searchLocations.mockResolvedValue({
    status: 'ok',
    results: [
      {
        id: 'kadapa',
        label: 'Kadapa',
        secondary: 'Kadapa district, Andhra Pradesh, India',
        lat: 10.787,
        lon: 79.837,
        zoom: 11,
        kind: 'town',
      },
    ],
  });
});

describe('search navigates the map', () => {
  it('flies to the chosen place using lon/lat in the correct order', async () => {
    render(<ParcelDrawMap value={null} label="Parcel map" />);
    const user = userEvent.setup();

    await runSearch(user, 'Kadapa');
    await user.click(await screen.findByText('Kadapa'));

    // MapLibre wants [longitude, latitude]. Swapping these drops the farmer in the ocean.
    expect(flyTo).toHaveBeenCalledWith({ center: [79.837, 10.787], zoom: 11 });
  });

  it('never touches the draw control, the boundary, or onChange', async () => {
    const onChange = vi.fn();
    render(<ParcelDrawMap value={null} onChange={onChange} label="Parcel map" />);
    const user = userEvent.setup();

    await runSearch(user, 'Kadapa');
    await user.click(await screen.findByText('Kadapa'));

    // A search result must not become a boundary by any route.
    expect(drawAdd).not.toHaveBeenCalled();
    expect(drawChangeMode).not.toHaveBeenCalled();
    expect(drawDeleteAll).not.toHaveBeenCalled();
    expect(setFeatureProperty).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves an existing boundary intact and never re-seeds it', async () => {
    const onChange = vi.fn();
    render(<ParcelDrawMap value={polygon()} onChange={onChange} label="Parcel map" />);
    const user = userEvent.setup();

    // Let seeding finish: seeding legitimately calls draw.add/deleteAll, so the draw spies are
    // only meaningful once the initial polygon is in place.
    await waitFor(() => expect(addControl).toHaveBeenCalled());
    await waitFor(() => expect(drawAdd).toHaveBeenCalled());
    drawAdd.mockClear();
    drawDeleteAll.mockClear();
    drawChangeMode.mockClear();
    setFeatureProperty.mockClear();

    await runSearch(user, 'Kadapa');
    await user.click(await screen.findByText('Kadapa'));
    expect(flyTo).toHaveBeenCalled();

    // After seeding, moving the camera must not touch geometry by any route: not the draw control,
    // not a re-seed, and not the parent's value.
    expect(drawAdd).not.toHaveBeenCalled();
    expect(drawDeleteAll).not.toHaveBeenCalled();
    expect(drawChangeMode).not.toHaveBeenCalled();
    expect(setFeatureProperty).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    // The map is still describing the same boundary, so the editing controls remain available.
    expect(screen.getByRole('button', { name: /Clear/i })).toBeEnabled();
  });

  it('surfaces a localized confirmation of where the map went', async () => {
    render(<ParcelDrawMap value={null} label="Parcel map" />);
    const user = userEvent.setup();

    await runSearch(user, 'Kadapa');
    await user.click(await screen.findByText('Kadapa'));

    expect(await screen.findByText(/Showing Kadapa/)).toBeInTheDocument();
  });

  it('keeps the search box above the map rather than inside its clipping container', () => {
    render(<ParcelDrawMap value={null} label="Parcel map" />);

    // The map's own wrapper clips its canvas. The search box must sit OUTSIDE that wrapper, so its
    // dropdown can overlay the map instead of being cut off (or being clipped by a scrollable
    // modal).
    const input = screen.getByRole('combobox');
    const mapWrapper = screen.getByRole('application').closest('.overflow-hidden');
    expect(mapWrapper).not.toBeNull();
    expect(mapWrapper?.className).toContain('overflow-hidden');
    expect(mapWrapper?.contains(input)).toBe(false);
  });
});

describe('existing map controls still work after searching', () => {
  it('keeps Centre and Clear available and does not let search disable them', async () => {
    render(<ParcelDrawMap value={null} onChange={vi.fn()} label="Parcel map" />);
    const user = userEvent.setup();

    await runSearch(user, 'Kadapa');
    await user.click(await screen.findByText('Kadapa'));

    // Centre must survive the new search feature.
    const centre = screen.getByRole('button', { name: /Centre/i });
    expect(centre).toBeEnabled();
    await user.click(centre);

    // Redraw and Clear are still offered in edit mode.
    expect(screen.getByRole('button', { name: /Redraw/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Clear/i })).toBeEnabled();
  });

  it('does not expose editing controls in read-only mode', () => {
    render(<ParcelDrawMap value={polygon()} onChange={vi.fn()} readOnly label="Parcel map" />);

    expect(screen.queryByRole('button', { name: /Redraw/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear/i })).not.toBeInTheDocument();
    // Search is a view-only tool, so it stays available to help a farmer orient themselves.
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});

describe('device location', () => {
  const contextValue = (overrides: Partial<LocationContextValue>): LocationContextValue => ({
    status: 'idle',
    district: null,
    coords: null,
    errorKey: null,
    details: null,
    requestLocation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  it('is offered as a separate control from Centre, so Centre keeps its geometry role', () => {
    const value = contextValue({ status: 'granted', coords: { lat: 10.5, lon: 79.5 } });
    render(
      <LocationContext.Provider value={value}>
        <ParcelDrawMap value={null} label="Parcel map" />
      </LocationContext.Provider>,
    );

    // Centre recentres on the parcel being drawn; "My location" centres on the farmer.
    expect(screen.getByRole('button', { name: /Centre/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /My location/i })).toBeInTheDocument();
  });

  it('explains a denied permission in plain language and leaves the map usable', () => {
    const value = contextValue({ status: 'denied', errorKey: 'permission' });
    render(
      <LocationContext.Provider value={value}>
        <ParcelDrawMap value={null} label="Parcel map" />
      </LocationContext.Provider>,
    );

    expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
    // Search is the documented fallback.
    expect(screen.getByRole('combobox')).toBeEnabled();
  });

  it('reuses the cached device fix instead of prompting again', async () => {
    const requestLocation = vi.fn().mockResolvedValue(undefined);
    const value = contextValue({
      status: 'granted',
      coords: { lat: 10.5, lon: 79.5 },
      details: { displayName: 'Kadapa' } as LocationContextValue['details'],
      requestLocation,
    });
    render(
      <LocationContext.Provider value={value}>
        <ParcelDrawMap value={null} label="Parcel map" />
      </LocationContext.Provider>,
    );

    // A known position centres the map immediately, with no second permission prompt.
    await waitFor(() => expect(flyTo).toHaveBeenCalledWith({ center: [79.5, 10.5], zoom: 14 }));
    expect(requestLocation).not.toHaveBeenCalled();
  });

  it('works with no LocationProvider at all, degrading to search-only', () => {
    // The map must not crash in contexts that mount it without a provider.
    expect(() => render(<ParcelDrawMap value={null} label="Parcel map" />)).not.toThrow();
    // With no provider there is no device fix to offer, but search still works.
    expect(screen.queryByRole('button', { name: /My location/i })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeEnabled();
  });
});
