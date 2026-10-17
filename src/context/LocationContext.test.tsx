import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

// The reverse geocoder is the only network edge; it is mocked so no request ever leaves the test.
const reverseGeocode = vi.fn();
vi.mock('../services/reverseGeocode', async () => {
  const actual = await vi.importActual<typeof import('../services/reverseGeocode')>('../services/reverseGeocode');
  return { ...actual, reverseGeocode: (lat: number, lon: number) => reverseGeocode(lat, lon) };
});

import { LocationProvider, useLocation } from './LocationContext';

const getCurrentPosition = vi.fn();

const Probe = () => {
  const loc = useLocation();
  return (
    <div>
      <span data-testid="status">{loc.status}</span>
      <span data-testid="district">{loc.district ?? 'none'}</span>
      <span data-testid="precision">{loc.precision ?? 'none'}</span>
      <span data-testid="state">{loc.stateName ?? 'none'}</span>
      <button type="button" onClick={() => void loc.requestLocation()}>
        locate
      </button>
    </div>
  );
};

const answerPosition = (lat: number, lon: number) => {
  getCurrentPosition.mockImplementation((success: PositionCallback) =>
    success({ coords: { latitude: lat, longitude: lon } } as GeolocationPosition)
  );
};

beforeEach(() => {
  sessionStorage.clear();
  getCurrentPosition.mockReset();
  reverseGeocode.mockReset();
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

describe('LocationProvider (farm-first, opt-in device location)', () => {
  it('LOC-10: never asks for geolocation on mount — by default and with autoRequest={false}', () => {
    const { unmount } = render(
      <LocationProvider>
        <Probe />
      </LocationProvider>
    );
    unmount();
    render(
      <LocationProvider autoRequest={false}>
        <Probe />
      </LocationProvider>
    );
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
  });

  it('LOC-10: a v1 cache entry (old bare-rectangle verdict) is ignored and removed', () => {
    sessionStorage.setItem(
      'vivasayi.location',
      JSON.stringify({ lat: 12.97, lon: 77.59, district: 'Krishnagiri', isInTamilNadu: true, displayName: 'Bengaluru, Krishnagiri' })
    );
    render(
      <LocationProvider>
        <Probe />
      </LocationProvider>
    );
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(screen.getByTestId('district')).toHaveTextContent('none');
    expect(sessionStorage.getItem('vivasayi.location')).toBeNull();
  });

  it('LOC-10: a v2 entry is hydrated without prompting, including approximate precision', () => {
    sessionStorage.setItem(
      'vivasayi.location.v2',
      JSON.stringify({
        v: 2,
        lat: 13.1,
        lon: 79.95,
        district: 'Tiruvallur',
        inTamilNadu: 'approximate',
        precision: 'approximate',
        stateName: null,
        displayName: 'Tiruvallur',
        locality: null,
        village: null,
        townCity: null,
        subDistrict: null,
        state: null,
        country: null,
        source: 'districts',
      })
    );
    render(
      <LocationProvider>
        <Probe />
      </LocationProvider>
    );
    expect(screen.getByTestId('status')).toHaveTextContent('granted');
    expect(screen.getByTestId('district')).toHaveTextContent('Tiruvallur');
    expect(screen.getByTestId('precision')).toHaveTextContent('approximate');
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('LOC-10: requesting from Bengaluru (Karnataka) resolves to outside-tn with no TN district', async () => {
    answerPosition(12.9716, 77.5946);
    reverseGeocode.mockResolvedValue({
      locality: null,
      village: null,
      townCity: 'Bengaluru',
      subDistrict: null,
      district: 'Bangalore Urban',
      state: 'Karnataka',
      stateCode: 'IN-KA',
      country: 'India',
    });
    render(
      <LocationProvider>
        <Probe />
      </LocationProvider>
    );
    await act(async () => {
      screen.getByRole('button', { name: 'locate' }).click();
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('outside-tn'));
    expect(screen.getByTestId('district')).toHaveTextContent('none');
    expect(screen.getByTestId('state')).toHaveTextContent('Karnataka');
    const stored = JSON.parse(sessionStorage.getItem('vivasayi.location.v2') ?? '{}');
    expect(stored).toMatchObject({ v: 2, inTamilNadu: false, district: null });
  });

  it('LOC-10: a geocoder failure inside the box resolves to granted + approximate, never outside', async () => {
    answerPosition(13.55, 80.2);
    reverseGeocode.mockResolvedValue(null);
    render(
      <LocationProvider>
        <Probe />
      </LocationProvider>
    );
    await act(async () => {
      screen.getByRole('button', { name: 'locate' }).click();
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('granted'));
    expect(screen.getByTestId('precision')).toHaveTextContent('approximate');
    // Without a geocoder answer the nearest district centroid is used (Chennai's is closest to
    // Pulicat); the point is that it is a Tamil Nadu district, not "outside".
    expect(screen.getByTestId('district')).toHaveTextContent('Chennai');
  });
});
