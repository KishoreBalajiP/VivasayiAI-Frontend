import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/LocationContext';
import {
  Loader2,
  MapPin,
  Sprout,
  CloudSun,
  Leaf,
  Camera,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

// PUBLIC LANDING PAGE — a premium two-panel experience, never an empty green screen.
//
// DESKTOP: brand/headline → useful location/context/tips on the LEFT, login card on the
// RIGHT. MOBILE: intro → login card → context (login stays above the fold).
//
// The landing page is location-aware WITHOUT authentication: it reads the session-scale
// LocationProvider (hydrates a previously-granted location) but NEVER auto-prompts for
// permission — the user taps "Use my location". Weather itself requires the backend Bearer
// token (all app routes are behind requireAuth), so pre-login we show an honest note instead
// of calling the API (which would trip the global 401 handler).

const FEATURES = [
  { key: 'featureWeather', icon: CloudSun },
  { key: 'featureCrop', icon: Leaf },
  { key: 'featureDiagnosis', icon: Camera },
  { key: 'featurePersonalized', icon: ShieldCheck },
] as const;

// Existing, already-approved static farming prompts from i18n (no new agricultural claims).
const TIPS = ['pestControl', 'cropSuggestions', 'fertilizerQuestion', 'weather'] as const;

export const LoginScreen = () => {
  const { t } = useTranslation();
  const { login, isAuthenticating, authError } = useAuth();
  const { status, details, requestLocation } = useLocation();

  const grantedName = details?.displayName ?? null;

  const renderLocationBlock = () => {
    if (status === 'requesting') {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
          <span>{t('locationRequesting')}</span>
        </div>
      );
    }

    if (grantedName) {
      return (
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <MapPin className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="break-words text-base font-semibold text-gray-900">{grantedName}</p>
            {details?.lat !== undefined && details?.lon !== undefined && (
              <p className="mt-0.5 text-xs text-gray-500">
                {t('coordsTitle', { lat: details.lat.toFixed(3), lon: details.lon.toFixed(3) })}
              </p>
            )}
            <p className="mt-1 inline-block text-[10px] text-gray-400">{t('mapAttribution')}</p>
          </div>
        </div>
      );
    }

    if (status === 'idle') {
      return (
        <div>
          <p className="text-sm text-gray-600">{t('locationExplain')}</p>
          <button
            onClick={() => void requestLocation()}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <MapPin className="h-4 w-4" />
            {t('allowLocationCta')}
          </button>
        </div>
      );
    }

    // denied / unavailable / unsupported / outside-tn — honest state with a retry action.
    const message =
      status === 'denied'
        ? t('locationDeniedMessage')
        : status === 'unsupported'
          ? t('locationUnsupportedMessage')
          : status === 'outside-tn'
            ? t('outsideTamilNaduMessage')
            : t('locationUnavailableMessage');

    return (
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800">
            {status === 'denied'
              ? t('locationDenied')
              : status === 'unsupported'
                ? t('locationUnsupported')
                : status === 'outside-tn'
                  ? t('outsideTamilNadu')
                  : t('locationUnavailable')}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{message}</p>
          <button
            onClick={() => void requestLocation()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-600 px-3 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
          >
            <MapPin className="h-3.5 w-3.5" />
            {t('retry')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-dvh bg-emerald-50/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr),22rem] lg:items-center lg:gap-14 lg:py-10">
        {/* ── LEFT: BRAND + HEADLINE + CONTEXT + TIPS + FEATURES ─────────────────────── */}
        <section className="order-2 min-w-0 lg:order-none">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-700 shadow-md">
              <Sprout className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="text-lg font-bold text-emerald-950 sm:text-xl">Vivasayi AI</div>
              <div className="text-xs font-medium tracking-wide text-emerald-700 uppercase">
                {t('landingKicker')}
              </div>
            </div>
          </div>

          <h1 className="mt-6 max-w-xl text-3xl leading-tight font-bold text-emerald-950 sm:text-4xl lg:text-5xl">
            {t('heroHeadline')}
          </h1>
          <p className="mt-3 max-w-xl text-base text-gray-600 sm:text-lg">
            {t('heroSubline')}
          </p>

          {/* LOCAL CONTEXT — location is useful before login */}
          <div className="mt-7 max-w-xl rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <MapPin className="h-4 w-4 text-emerald-600" />
              {t('landingContextTitle')}
            </div>
            {renderLocationBlock()}

            <div className="my-3 border-t border-dashed border-gray-200" />

            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CloudSun className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{t('signInForWeather')}</span>
            </div>
          </div>

          {/* TIPS — existing approved static suggestions */}
          <div className="mt-6 max-w-xl">
            <p className="text-xs font-semibold tracking-wide text-emerald-800 uppercase">
              {t('tipHeading')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TIPS.map((key) => (
                <span
                  key={key}
                  className="rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm"
                >
                  {t(key)}
                </span>
              ))}
            </div>
          </div>

          {/* FEATURES */}
          <div className="mt-6 grid max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
            {FEATURES.map(({ key, icon: Icon }) => (
              <div
                key={key}
                className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-white px-3.5 py-3 shadow-sm"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium text-gray-800">{t(key)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── RIGHT: LOGIN CARD ──────────────────────────────────────────────────────── */}
        <aside className="order-first lg:order-none">
          <div className="w-full rounded-2xl border border-gray-200 bg-white p-5 shadow-md sm:p-6">
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('signInTitle')}</h2>
            <p className="mt-1 text-sm text-gray-500">{t('signInSubtitle')}</p>

            {authError && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {t(authError)}
              </p>
            )}

            <button
              onClick={login}
              disabled={isAuthenticating}
              className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-gray-200 bg-white py-3 px-4 text-base font-semibold text-gray-800 shadow-sm transition-all hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:border-gray-200 disabled:hover:bg-white"
            >
              {isAuthenticating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t('signingIn')}
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {t('loginWithGoogle')}
                </>
              )}
            </button>

            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('secureSignIn')}
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-gray-500">{t('landingFooterNote')}</p>
        </aside>
      </div>
    </div>
  );
};