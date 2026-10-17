import { useCallback, useState } from 'react';

// Which district the weather strip shows (plan B6):
//   farm    the farm district from the profile — the DEFAULT, and what the header always shows
//   device  the device location, only after the farmer chose "Use my current location"
// The choice is remembered across visits on this browser (localStorage). It is a display
// preference only: nothing about claims ever reads it.
export type WeatherSource = 'farm' | 'device';

export const WEATHER_SOURCE_KEY = 'vivasayi.weatherSource.v1';
export const DEFAULT_WEATHER_SOURCE: WeatherSource = 'farm';

export const readWeatherSource = (): WeatherSource => {
  try {
    const stored = localStorage.getItem(WEATHER_SOURCE_KEY);
    return stored === 'device' || stored === 'farm' ? stored : DEFAULT_WEATHER_SOURCE;
  } catch {
    return DEFAULT_WEATHER_SOURCE;
  }
};

export const writeWeatherSource = (source: WeatherSource): void => {
  try {
    localStorage.setItem(WEATHER_SOURCE_KEY, source);
  } catch {
    // storage unavailable — the choice lasts for this page only
  }
};

export const useWeatherSource = (): [WeatherSource, (next: WeatherSource) => void] => {
  const [source, setSourceState] = useState<WeatherSource>(readWeatherSource);
  const setSource = useCallback((next: WeatherSource) => {
    setSourceState(next);
    writeWeatherSource(next);
  }, []);
  return [source, setSource];
};
