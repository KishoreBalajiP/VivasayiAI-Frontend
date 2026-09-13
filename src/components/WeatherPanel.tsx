import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError, friendlyMessageKey } from '../api/client';
import { getWeather } from '../api';
import type { WeatherResponse } from '../types';

interface WeatherPanelProps {
  district: string | undefined;
}

// Authenticated weather bar rendered above the chat area. The district always comes from
// the loaded FarmProfile — never from geolocation. The backend is cache-first and degrades
// to `status: "unknown"` (current: null, forecast: []) when the district is not resolvable
// or the provider is unavailable; that renders as a friendly "unavailable" message rather
// than a hard error.
export const WeatherPanel = ({ district }: WeatherPanelProps) => {
  const { t, i18n } = useTranslation();
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!district) {
      setWeather(null);
      setErrorKey(null);
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    setErrorKey(null);

    getWeather(district)
      .then((data) => {
        if (requestId.current === id) setWeather(data);
      })
      .catch((error: unknown) => {
        if (requestId.current !== id) return;
        const status = error instanceof ApiClientError ? error.status : 0;
        setErrorKey(friendlyMessageKey(status));
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
  }, [district]);

  if (!district) return null;

  const formatDate = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(i18n.language === 'ta' ? 'ta-IN' : 'en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

  const hasCurrent = Boolean(weather?.current);

  return (
    <div className="bg-gradient-to-r from-blue-50 to-green-50 border-b border-green-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base sm:text-lg font-bold text-gray-800">{t('weatherToday')}</h3>
          {!loading && weather && (
            <span className="text-xs sm:text-sm font-medium text-gray-500">{district}</span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm sm:text-base">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
            {t('weatherLoading')}
          </div>
        ) : errorKey ? (
          <p
            role="alert"
            className="inline-block text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          >
            {t(errorKey)}
          </p>
        ) : weather && hasCurrent ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-800">
                  {weather.current!.temperature}°C
                </div>
                <div className="text-xs sm:text-sm text-gray-600">{weather.current!.summary}</div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:text-sm">
                <div>
                  <div className="text-gray-500">💨 {t('wind')}</div>
                  <div className="font-semibold text-gray-800">
                    {weather.current!.windspeed} km/h
                  </div>
                </div>
                {weather.forecast.length > 0 && (
                  <div>
                    <div className="text-gray-500">💧 {t('rain')}</div>
                    <div className="font-semibold text-gray-800">
                      {weather.forecast[0].precipitation}mm
                    </div>
                  </div>
                )}
              </div>
            </div>
            {weather.forecast.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {weather.forecast.map((day) => (
                  <div
                    key={day.date}
                    className="bg-white rounded-lg px-3 py-2 text-center border border-green-200 min-w-[96px]"
                  >
                    <div className="text-xs font-semibold text-gray-700">{formatDate(day.date)}</div>
                    <div className="text-gray-500 text-xs">{day.summary}</div>
                    <div className="text-xs text-gray-800 font-semibold">
                      {day.temperatureMax}° / {day.temperatureMin}°
                    </div>
                    <div className="text-xs text-gray-600">💧 {day.precipitation}mm</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : weather ? (
          <p className="text-sm sm:text-base text-gray-500">{t('weatherUnavailable')}</p>
        ) : null}
      </div>
    </div>
  );
};