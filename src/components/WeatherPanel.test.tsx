import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../i18n';
import i18n from '../i18n';
import { LocationContext, type LocationContextValue } from '../context/LocationContext';
import { createMemoryStorage } from '../test/memoryStorage';
import { WEATHER_EXPANDED_KEY, WEATHER_SOURCE_KEY } from '../hooks/useWeatherSource';
import type { FarmProfile, WeatherResponse } from '../types';

const getWeather = vi.fn();
vi.mock('../api', () => ({ getWeather: (district: string) => getWeather(district) }));

import { WeatherPanel } from './WeatherPanel';

const weatherFor = (district: string): WeatherResponse => ({
  district,
  current: { temperature: 31.4, windspeed: 12, weatherCode: 61, isDay: 1, summary: 'Light rain' },
  forecast: [
    { date: '2026-10-16', temperatureMax: 32, temperatureMin: 25, weatherCode: 61, precipitation: 12, summary: 'Rain' },
    { date: '2026-10-17', temperatureMax: 33, temperatureMin: 26, weatherCode: 1, precipitation: 0, summary: 'Clear' },
  ],
  source: 'test',
  cached: false,
  ageSeconds: 0,
});

const profile: FarmProfile = { district: 'Chennai', crops: ['paddy'], acres: 2 };

const locationValue = (overrides: Partial<LocationContextValue> = {}): LocationContextValue => ({
  status: 'idle',
  district: null,
  coords: null,
  details: null,
  errorKey: null,
  precision: null,
  stateName: null,
  requestLocation: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const renderPanel = (location: LocationContextValue, farm: FarmProfile | null = profile) =>
  render(
    <LocationContext.Provider value={location}>
      <WeatherPanel profile={farm} onOpenProfile={vi.fn()} />
    </LocationContext.Provider>
  );

beforeEach(async () => {
  vi.stubGlobal('localStorage', createMemoryStorage());
  getWeather.mockReset();
  getWeather.mockImplementation(async (district: string) => weatherFor(district));
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WeatherPanel', () => {
  it('UI-11: rain uses an Umbrella icon plus a hidden "Rain" word — no emoji, no 10/11px text', async () => {
    const { container } = renderPanel(locationValue());
    await screen.findByText('31°C');
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(screen.getAllByText('Rain', { selector: '.sr-only' }).length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toMatch(/text-\[1[01]px\]/);
    expect(container.querySelector('.text-2xs')).not.toBeNull();
  });

  it('LOC-12: by default the strip shows the FARM district weather and never asks for the device location', async () => {
    const location = locationValue();
    renderPanel(location);
    expect(await screen.findByText('Weather for your farm district: Chennai')).toBeInTheDocument();
    await waitFor(() => expect(getWeather).toHaveBeenCalledWith('Chennai'));
    expect(location.requestLocation).not.toHaveBeenCalled();
    expect(screen.getByTestId('weather-panel')).toHaveAttribute('data-weather-source', 'farm');
  });

  it('LOC-12: "Use my current location" switches to the device, asks once, and is remembered', async () => {
    const user = userEvent.setup();
    const location = locationValue();
    renderPanel(location);
    await user.click(await screen.findByRole('button', { name: 'Use my current location' }));
    expect(location.requestLocation).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(WEATHER_SOURCE_KEY)).toBe('device');
  });

  it('LOC-12: device inside Tamil Nadu shows "Weather near you" and marks approximate fixes', async () => {
    localStorage.setItem(WEATHER_SOURCE_KEY, 'device');
    renderPanel(locationValue({ status: 'granted', district: 'Tiruvallur', precision: 'approximate' }));
    expect(await screen.findByText('Weather near you: Tiruvallur')).toBeInTheDocument();
    expect(screen.getByText('(approximate)')).toBeInTheDocument();
    await waitFor(() => expect(getWeather).toHaveBeenCalledWith('Tiruvallur'));
    expect(screen.getByTestId('weather-panel')).toHaveAttribute('data-weather-source', 'device');
  });

  it('LOC-12: device outside Tamil Nadu gets a weather-only message and the farm weather — never claims', async () => {
    localStorage.setItem(WEATHER_SOURCE_KEY, 'device');
    renderPanel(locationValue({ status: 'outside-tn', stateName: 'Andhra Pradesh', coords: { lat: 13.6, lon: 79.9 } }));
    const note = await screen.findByTestId('weather-device-note');
    expect(note).toHaveTextContent('Your device appears to be in Andhra Pradesh, outside Tamil Nadu.');
    expect(note).not.toHaveTextContent(/claim/i);
    await waitFor(() => expect(getWeather).toHaveBeenCalledWith('Chennai'));
    expect(getWeather).not.toHaveBeenCalledWith(expect.stringMatching(/Andhra/));
    // UX-08: the note itself names the active farm district — no second, duplicated location line.
    expect(note).toHaveTextContent('Weather is currently shown for your farm district, Chennai.');
    expect(screen.queryByText('Weather for your farm district: Chennai')).not.toBeInTheDocument();
  });

  it('UX-08: the device-failure note is one line naming both the situation and the farm district', async () => {
    localStorage.setItem(WEATHER_SOURCE_KEY, 'device');
    renderPanel(locationValue({ status: 'outside-tn', stateName: 'Andhra Pradesh', coords: { lat: 13.6, lon: 79.9 } }));
    const note = await screen.findByTestId('weather-device-note');
    expect(note).toHaveTextContent('Your device appears to be in Andhra Pradesh, outside Tamil Nadu.');
    expect(note).toHaveTextContent('Weather is currently shown for your farm district, Chennai.');
    expect(screen.queryByText(/^Weather for your farm district:/)).not.toBeInTheDocument();
    // The controls stay reachable, and the copy never implies the device is the farm.
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use farm location (Chennai)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use my current location' })).not.toBeInTheDocument();
  });

  it('UX-08: denied and unavailable notes also name the active farm district', async () => {
    localStorage.setItem(WEATHER_SOURCE_KEY, 'device');
    const { unmount } = renderPanel(locationValue({ status: 'denied', errorKey: 'permission' }));
    expect(await screen.findByTestId('weather-device-note')).toHaveTextContent(
      'Location permission was not given. Weather is currently shown for your farm district, Chennai.'
    );
    unmount();

    renderPanel(locationValue({ status: 'unavailable' }));
    expect(await screen.findByTestId('weather-device-note')).toHaveTextContent(
      'Your device location is not available right now. Weather is currently shown for your farm district, Chennai.'
    );
  });

  it('LOC-12: no device message mentions claims, in English or Tamil', async () => {
    const keys = [
      'weatherDeviceOutsideTn',
      'weatherDeviceOutsideTnNoState',
      'weatherDeviceOutsideTnNoFarm',
      'weatherDeviceDeniedFarm',
      'weatherDeviceDeniedNoFarm',
      'weatherDeviceUnavailableFarm',
      'weatherDeviceUnavailableNoFarm',
      'weatherSetFarmPrompt',
    ];
    for (const key of keys) {
      expect(i18n.getFixedT('en')(key, { state: 'X' })).not.toMatch(/claim/i);
      expect(i18n.getFixedT('ta')(key, { state: 'X' })).not.toMatch(/கோரிக்கை/);
    }
  });

  it('LOC-12: denied permission with no farm district explains and offers to set it; nothing is fetched', async () => {
    localStorage.setItem(WEATHER_SOURCE_KEY, 'device');
    renderPanel(locationValue({ status: 'denied', errorKey: 'permission' }), null);
    expect(
      await screen.findByText('Location permission was not given. Set your farm district to see local weather.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set farm district' })).toBeInTheDocument();
    expect(getWeather).not.toHaveBeenCalled();
  });

  it('UX-03: the strip folds away and remembers the choice; the detail rows are hidden, not removed', async () => {
    const user = userEvent.setup();
    renderPanel(locationValue());
    const toggle = await screen.findByTestId('weather-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'weather-details');
    expect(toggle).toHaveAccessibleName('Hide weather details');
    expect(screen.getByTestId('weather-panel')).toHaveAttribute('data-weather-expanded', 'true');
    expect(await screen.findByText('31°C')).toBeInTheDocument();
    expect(document.getElementById('weather-details')).not.toHaveAttribute('hidden');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAccessibleName('Show weather details');
    expect(screen.getByTestId('weather-panel')).toHaveAttribute('data-weather-expanded', 'false');
    expect(document.getElementById('weather-details')).toHaveAttribute('hidden');
    expect(screen.getByText('31°C')).toBeInTheDocument();
    expect(localStorage.getItem(WEATHER_EXPANDED_KEY)).toBe('collapsed');

    await user.click(toggle);
    expect(localStorage.getItem(WEATHER_EXPANDED_KEY)).toBe('expanded');
    expect(document.getElementById('weather-details')).not.toHaveAttribute('hidden');
  });

  it('UX-03: a collapsed strip stays collapsed next visit and still shows the source and its controls', async () => {
    localStorage.setItem(WEATHER_EXPANDED_KEY, 'collapsed');
    renderPanel(locationValue());
    expect(await screen.findByText('Weather for your farm district: Chennai')).toBeInTheDocument();
    expect(screen.getByTestId('weather-panel')).toHaveAttribute('data-weather-expanded', 'false');
    expect(document.getElementById('weather-details')).toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: 'Use my current location' })).toBeInTheDocument();
  });
});
