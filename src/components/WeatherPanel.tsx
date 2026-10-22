import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError, friendlyMessageKey } from '../api/client';
import { getWeather } from '../api';
import type { FarmProfile, WeatherResponse } from '../types';
import { useLocation } from '../context/LocationContext';
import { useWeatherExpanded, useWeatherSource } from '../hooks/useWeatherSource';
import { Button, Skeleton } from './ui';
import { MapPin, Loader2, Leaf, CloudSun, ChevronUp, Crosshair, Info, Umbrella } from 'lucide-react';

interface WeatherPanelProps {
  profile: FarmProfile | null;
  /** Profile not known yet (loading, or the load failed): do not prompt "Set farm district". */
  profileUnknown?: boolean;
  /** Opens the farm profile editor (for farmers with no farm district yet). */
  onOpenProfile?: () => void;
}

// Farm-first weather strip (plan B6). The default source is the FARM DISTRICT from the profile.
// The device location is used only after the farmer picks "Use my current location"; the choice
// is remembered (useWeatherSource). When the device is outside Tamil Nadu, denied or unavailable,
// the strip says so in weather-only terms and shows the farm district's weather instead.
// Weather copy never mentions claims: claim eligibility never depends on the device location.
export const WeatherPanel = ({ profile, profileUnknown = false, onOpenProfile }: WeatherPanelProps) => {
  const { t, i18n } = useTranslation();
  const {
    status: locStatus,
    district: deviceDistrict,
    precision,
    stateName,
    requestLocation,
  } = useLocation();
  const [source, setSource] = useWeatherSource();
  const [expanded, setExpanded] = useWeatherExpanded();

  const farmDistrict = profile?.district?.trim() || null;

  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const requestId = useRef(0);

  // A farmer who chose the device source on an earlier visit gets it back silently, but ONLY when
  // the browser already holds the permission (no prompt is ever shown without a tap).
  useEffect(() => {
    if (source !== 'device' || locStatus !== 'idle') return;
    const permissions = typeof navigator !== 'undefined' ? navigator.permissions : undefined;
    if (!permissions?.query) return;
    let cancelled = false;
    permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((state) => {
        if (!cancelled && state.state === 'granted') void requestLocation();
      })
      .catch(() => {
        // Permissions API unsupported for geolocation — wait for an explicit tap.
      });
    return () => {
      cancelled = true;
    };
  }, [source, locStatus, requestLocation]);

  const deviceReady = source === 'device' && locStatus === 'granted' && Boolean(deviceDistrict);
  // The district actually queried: the device district once chosen and resolved, else the farm.
  const queryDistrict = deviceReady ? deviceDistrict : farmDistrict;

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

  const chooseDevice = () => {
    setSource('device');
    if (locStatus !== 'granted') void requestLocation();
  };

  const chooseFarm = () => setSource('farm');

  const formatDate = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(
      i18n.language === 'ta' ? 'ta-IN' : 'en-IN',
      { weekday: 'short', day: 'numeric', month: 'short' }
    );

  const today = weather?.forecast?.[0];
  const hasCurrent = Boolean(weather?.current);
  const rainToday = today && today.precipitation > 0.5 ? Math.round(today.precipitation) : null;

  const deviceButton = (
    <Button variant="ghost" size="sm" leadingIcon={<Crosshair className="h-3.5 w-3.5" />} onClick={chooseDevice}>
      {t('weatherUseDevice')}
    </Button>
  );

  const farmButton = farmDistrict ? (
    <Button variant="ghost" size="sm" leadingIcon={<MapPin className="h-3.5 w-3.5" />} onClick={chooseFarm}>
      {t('weatherUseFarm', { district: farmDistrict })}
    </Button>
  ) : null;

  const sourceLine = (label: string, extra?: string) => (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-brand-800">
      <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-700" />
      <span className="min-w-0 break-words">{label}</span>
      {extra && <span className="font-normal text-ink-muted">{extra}</span>}
    </span>
  );

  // Which district the strip is about, and the honest note when the device could not be used.
  const renderSourceState = () => {
    if (deviceReady && deviceDistrict) {
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {sourceLine(
            t('weatherNearYou', { district: deviceDistrict }),
            precision === 'approximate' ? t('weatherApproximate') : undefined
          )}
          {farmButton}
        </div>
      );
    }

    if (source === 'device' && locStatus === 'requesting') {
      return (
        <div role="status" className="flex items-center gap-1.5 text-sm text-ink-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          {t('locationRequesting')}
        </div>
      );
    }

    if (source === 'device' && locStatus !== 'idle') {
      // outside-tn / denied / unavailable / unsupported — ONE weather-only line that names both the
      // device situation and the active farm district (no separate "Weather for your farm district"
      // line repeating it). The controls sit on their own row underneath.
      const message =
        locStatus === 'outside-tn'
          ? farmDistrict
            ? stateName
              ? t('weatherDeviceOutsideTn', { state: stateName, district: farmDistrict })
              : t('weatherDeviceOutsideTnNoState', { district: farmDistrict })
            : t('weatherDeviceOutsideTnNoFarm')
          : locStatus === 'denied'
            ? farmDistrict
              ? t('weatherDeviceDeniedFarm', { district: farmDistrict })
              : t('weatherDeviceDeniedNoFarm')
            : farmDistrict
              ? t('weatherDeviceUnavailableFarm', { district: farmDistrict })
              : t('weatherDeviceUnavailableNoFarm');
      return (
        <div className="flex flex-col gap-1.5">
          <p data-testid="weather-device-note" className="flex items-start gap-1.5 text-xs text-info-fg sm:text-sm">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-info-solid" />
            <span>{message}</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Button variant="ghost" size="sm" onClick={() => void requestLocation()}>
              {t('retry')}
            </Button>
            {farmButton}
            {!farmDistrict && onOpenProfile && (
              <Button variant="secondary" size="sm" onClick={onOpenProfile}>
                {t('weatherSetFarmCta')}
              </Button>
            )}
          </div>
        </div>
      );
    }

    if (farmDistrict) {
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {sourceLine(t('weatherForFarm', { district: farmDistrict }))}
          {deviceButton}
        </div>
      );
    }

    if (profileUnknown) {
      // Profile still loading (or it failed and App shows its own retry bar): the farm district
      // is not known, so offer only the device option rather than a misleading "Set farm district".
      return <div className="flex flex-wrap items-center gap-x-2 gap-y-1">{deviceButton}</div>;
    }

    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 text-ink-muted">
          <CloudSun aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-700" />
          {t('weatherSetFarmPrompt')}
        </span>
        {onOpenProfile && (
          <Button variant="secondary" size="sm" onClick={onOpenProfile}>
            {t('weatherSetFarmCta')}
          </Button>
        )}
        {deviceButton}
      </div>
    );
  };

  // Rain is an icon + hidden word, never an emoji (emoji glyphs vary by device and are read out
  // inconsistently by screen readers).
  const rainAmount = (mm: number) => (
    <span className="inline-flex items-center gap-0.5">
      <Umbrella aria-hidden="true" className="h-3 w-3 shrink-0" />
      <span className="sr-only">{t('weatherRainLabel')}</span>
      {mm}mm
    </span>
  );

  const renderWeatherBody = () => {
    if (loading) {
      return (
        <div aria-busy="true" className="flex flex-wrap items-center gap-4 sm:gap-8">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto hidden h-16 w-48 rounded-xl sm:block" />
        </div>
      );
    }

    if (errorKey) {
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-danger-fg">
            {t(errorKey)}
          </p>
          <Button variant="secondary" size="sm" onClick={() => setRetryKey((k) => k + 1)}>
            {t('retry')}
          </Button>
        </div>
      );
    }

    if (weather && hasCurrent) {
      return (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold text-brand-900 sm:text-4xl">
                {Math.round(weather.current!.temperature)}°C
              </div>
              <div className="text-sm text-ink-muted">
                <div className="font-medium">{weather.current!.summary}</div>
                <div className="text-xs text-ink-subtle">
                  {t('wind')}: {Math.round(weather.current!.windspeed)} km/h
                  {rainToday !== null && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <span aria-hidden="true">·</span>
                      {rainAmount(rainToday)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {weather.forecast.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {weather.forecast.map((day) => (
                  <div
                    key={day.date}
                    className="min-w-[88px] rounded-control border border-brand-100 bg-white px-2.5 py-2 text-center shadow-card"
                  >
                    <div className="text-2xs font-semibold text-ink-muted">
                      {formatDate(day.date)}
                    </div>
                    <div className="text-2xs text-ink-subtle">{day.summary}</div>
                    <div className="text-xs font-bold text-brand-900">
                      {Math.round(day.temperatureMax)}° / {Math.round(day.temperatureMin)}°
                    </div>
                    <div className="flex justify-center text-2xs text-ink-subtle">
                      {rainAmount(day.precipitation)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Farming insight derived ONLY from the backend weather numbers */}
          {rainToday !== null || weather.forecast[0] ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-brand-800">
              <Leaf aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-brand-600" />
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
            <div className="mt-2 flex items-center gap-1.5 text-xs text-brand-800">
              <CloudSun aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-brand-600" />
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
          <p className="text-sm text-ink-muted">{t('weatherUnavailable')}</p>
          <Button variant="secondary" size="sm" onClick={() => setRetryKey((k) => k + 1)}>
            {t('retry')}
          </Button>
        </div>
      );
    }

    return null;
  };

  return (
    <div
      data-testid="weather-panel"
      data-weather-source={deviceReady ? 'device' : farmDistrict ? 'farm' : 'none'}
      data-weather-expanded={expanded ? 'true' : 'false'}
      className="shrink-0 border-b border-brand-100 bg-gradient-to-r from-brand-50 via-white to-green-50"
    >
      <div className="px-3 py-2.5 sm:px-4 sm:py-3">
        {/* Source row + collapse control: folding the strip away is the farmer's choice and is
            remembered, so the whole panel can shrink to one line on a small screen. */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">{renderSourceState()}</div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-controls="weather-details"
            aria-label={expanded ? t('weatherHideDetails') : t('weatherShowDetails')}
            title={expanded ? t('weatherHideDetails') : t('weatherShowDetails')}
            data-testid="weather-toggle"
            className="shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <ChevronUp
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${expanded ? '' : 'rotate-180'}`}
            />
          </button>
        </div>

        <div id="weather-details" hidden={!expanded}>
          {queryDistrict && (
            <div className="mt-1.5 flex flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-6">
              {renderWeatherBody()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
