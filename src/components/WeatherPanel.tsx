import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError, friendlyMessageKey } from '../api/client';
import { getWeather } from '../api';
import type { FarmProfile, WeatherResponse } from '../types';
import { useLocation } from '../context/LocationContext';
import { MapPin, AlertTriangle, Loader2, Leaf, CloudSun } from 'lucide-react';

interface WeatherPanelProps {
  profile: FarmProfile | null;
}

// Location-first weather dashboard. The weather district comes from the DETECTED device
// location (session-level), NOT from the farm profile. A farm-profile district is used only
// when the user explicitly opts in after location is denied/unavailable/unsupported or the
// device is outside Tamil Nadu — never silently.
export const WeatherPanel = ({ profile }: WeatherPanelProps) => {
  const { t, i18n } = useTranslation();
  const {
    status: locStatus,
    district: detectedDistrict,
    details,
    requestLocation,
  } = useLocation();

  const placeName = details?.displayName ?? null;

  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [useFarmDistrict, setUseFarmDistrict] = useState(false);
  const requestId = useRef(0);

  // The district actually queried + who it came from (for honest labelling).
  const queryDistrict =
    locStatus === 'granted' && detectedDistrict
      ? detectedDistrict
      : useFarmDistrict && profile?.district
        ? profile.district
        : null;

  useEffect(() => {
    if (!queryDistrict) {
      setWeather(null);
      setErrorKey(null);
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    // Drop previous data immediately so a stale forecast never renders under a new district.
    setWeather(null);
    setLoading(true);
    setErrorKey(null);

    getWeather(queryDistrict)
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
  }, [queryDistrict, retryKey]);

  const formatDate = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(
      i18n.language === 'ta' ? 'ta-IN' : 'en-IN',
      { weekday: 'short', day: 'numeric', month: 'short' }
    );

  const today = weather?.forecast?.[0];
  const hasCurrent = Boolean(weather?.current);
  const rainToday = today && today.precipitation > 0.5 ? Math.round(today.precipitation) : null;

  // Compute the location state block (requesting / denied / unavailable / unsupported /
  // outside-TN / farm fallback) — each is a compact, useful, honest state.
  const renderLocationState = () => {
    const isGranted = locStatus === 'granted' && detectedDistrict;

    if (isGranted) {
      const title =
        details && details.lat !== undefined && details.lon !== undefined
          ? `${t('detectedLocation')}: ${placeName ?? detectedDistrict} · ${t('coordsTitle', {
              lat: details.lat.toFixed(4),
              lon: details.lon.toFixed(4),
            })}`
          : `${t('detectedLocation')}: ${placeName ?? detectedDistrict}`;
      return (
        <div
          title={title}
          className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-emerald-800"
        >
          <MapPin className="h-4 w-4 shrink-0 text-emerald-700" />
          <span className="shrink-0">{t('detectedLocation')}:</span>
          <span className="min-w-0 break-words">{placeName ?? detectedDistrict}</span>
        </div>
      );
    }

    if (useFarmDistrict && profile?.district) {
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-emerald-700" />
          <span className="font-semibold text-emerald-800">
            {t('farmDistrictLabel')}: {profile.district}
          </span>
          <button
            onClick={() => setUseFarmDistrict(false)}
            className="rounded-full border border-gray-300 px-2.5 py-0.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            {t('detectLocation')}
          </button>
        </div>
      );
    }

    if (locStatus === 'requesting') {
      return (
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('locationRequesting')}
        </div>
      );
    }

    // Location is denied/unavailable/unsupported/outside-TN.
    const message =
      locStatus === 'denied'
        ? t('locationDeniedMessage')
        : locStatus === 'unsupported'
          ? t('locationUnsupportedMessage')
          : locStatus === 'outside-tn'
            ? t('outsideTamilNaduMessage')
            : t('locationUnavailableMessage');

    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          {locStatus === 'denied'
            ? t('locationDenied')
            : locStatus === 'unsupported'
              ? t('locationUnsupported')
              : locStatus === 'outside-tn'
                ? t('outsideTamilNadu')
                : t('locationUnavailable')}
        </span>
        <span className="basis-full text-xs text-gray-500 sm:basis-auto sm:ml-1">{message}</span>
        <button
          onClick={() => void requestLocation()}
          className="rounded-full border border-emerald-600 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          {t('retry')}
        </button>
        {profile?.district && !useFarmDistrict && (
          <button
            onClick={() => setUseFarmDistrict(true)}
            className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('useFarmDistrict', { district: profile.district })}
          </button>
        )}
      </div>
    );
  };

  const renderWeatherBody = () => {
    if (loading) {
      return (
        <div className="flex flex-wrap items-center gap-4 sm:gap-8">
          <div className="h-10 w-28 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
          <div className="ml-auto hidden h-16 w-48 animate-pulse rounded-xl bg-gray-200 sm:block" />
        </div>
      );
    }

    if (errorKey) {
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p
            role="alert"
            className="text-sm text-red-700"
          >
            {t(errorKey)}
          </p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="rounded-full border border-emerald-600 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            {t('retry')}
          </button>
        </div>
      );
    }

    if (weather && hasCurrent) {
      return (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold text-emerald-900 sm:text-4xl">
                {Math.round(weather.current!.temperature)}°C
              </div>
              <div className="text-sm text-gray-600">
                <div className="font-medium">{weather.current!.summary}</div>
                <div className="text-xs text-gray-500">
                  {t('wind')}: {Math.round(weather.current!.windspeed)} km/h
                  {rainToday !== null && (
                    <span className="ml-2">· ☔ {rainToday}mm</span>
                  )}
                </div>
              </div>
            </div>

            {weather.forecast.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {weather.forecast.map((day) => (
                  <div
                    key={day.date}
                    className="min-w-[88px] rounded-xl border border-emerald-100 bg-white px-2.5 py-2 text-center shadow-sm"
                  >
                    <div className="text-[11px] font-semibold text-gray-600">
                      {formatDate(day.date)}
                    </div>
                    <div className="text-[11px] text-gray-500">{day.summary}</div>
                    <div className="text-xs font-bold text-emerald-900">
                      {Math.round(day.temperatureMax)}° / {Math.round(day.temperatureMin)}°
                    </div>
                    <div className="text-[11px] text-gray-500">
                      ☔ {day.precipitation}mm
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Farming insight derived ONLY from the backend weather numbers */}
          {rainToday !== null || weather.forecast[0] ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-800">
              <Leaf className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="font-semibold">{t('farmingInsight')}:</span>
              <span>
                {rainToday !== null
                  ? t('insightRainToday', { mm: rainToday }) + ' · '
                  : ''}
                {t('insightTempRange', {
                  min: Math.round(weather.forecast[0].temperatureMin),
                  max: Math.round(weather.forecast[0].temperatureMax),
                })}
              </span>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-800">
              <CloudSun className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="font-semibold">{t('farmingInsight')}:</span>
              <span>{t('insightConditions', { condition: weather.current!.summary })}</span>
            </div>
          )}
        </>
      );
    }

    if (weather) {
      // Backend returned status:"unknown" — degrade compactly with Retry (no fabrication).
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-500">{t('weatherUnavailable')}</p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="rounded-full border border-emerald-600 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            {t('retry')}
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="shrink-0 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-green-50">
      <div className="mx-auto max-w-6xl px-3 py-2.5 sm:px-4 sm:py-3">
        {renderLocationState()}

        {queryDistrict && (
          <div className="mt-1.5 flex flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-6">
            {renderWeatherBody()}
          </div>
        )}
      </div>
    </div>
  );
};