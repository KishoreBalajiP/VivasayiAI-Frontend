import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/LocationContext';
import { MapPin, LogOut, User, Sprout, Loader2 } from 'lucide-react';
import type { Language } from '../types';

interface NavbarProps {
  hasProfile: boolean;
  onOpenProfile: () => void;
}

const LANGUAGES: { code: Language; label: string; short: string }[] = [
  { code: 'ta', label: 'தமிழ்', short: 'த' },
  { code: 'en', label: 'English', short: 'EN' },
];

export const Navbar = ({ hasProfile, onOpenProfile }: NavbarProps) => {
  const { t } = useTranslation();
  const { user, language, setLanguage, logout } = useAuth();
  const { status, district, details, requestLocation } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const name = user?.name?.trim() || user?.email?.split('@')[0] || '';
  const initials = (name || 'U').slice(0, 1).toUpperCase();

  const placeName = details?.displayName ?? null;
  const locationLabel =
    status === 'granted' && placeName
      ? placeName
      : status === 'requesting'
        ? t('locationRequesting')
        : status === 'outside-tn' && placeName
          ? placeName
          : status === 'outside-tn'
            ? t('outsideTamilNadu')
            : t('locationFailed');

  const locationTitle =
    status === 'granted' && details && details.lat !== undefined && details.lon !== undefined
      ? `${t('detectedLocation')}: ${placeName ?? district ?? ''} · ${t('coordsTitle', {
          lat: details.lat.toFixed(4),
          lon: details.lon.toFixed(4),
        })}`
      : `${t('detectedLocation')}: ${placeName ?? district ?? ''}`;

  return (
    <header className="relative z-30 shrink-0 bg-emerald-900 text-white shadow-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
        {/* BRAND */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-700 shadow-inner">
            <Sprout className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-bold sm:text-base">Vivasayi AI</div>
            <div className="hidden truncate text-[11px] text-emerald-200 md:block">
              {t('appTitle')}
            </div>
          </div>
        </div>

        {/* LOCATION CHIP */}
        <button
          onClick={() => {
            if (status === 'granted') return;
            void requestLocation();
          }}
          disabled={status === 'requesting'}
          title={
            status === 'granted' || status === 'outside-tn'
              ? locationTitle
              : t('detectLocation')
          }
          className={`ml-1 flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors sm:text-sm ${
            status === 'granted'
              ? 'bg-emerald-800 text-emerald-100'
              : 'bg-amber-500/90 text-emerald-950 hover:bg-amber-400'
          } disabled:cursor-wait`}
        >
          {status === 'requesting' ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <MapPin className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{locationLabel}</span>
        </button>

        <div className="flex-1" />

        {/* LANGUAGE PILL (always visible, two-option segmented control) */}
        <div
          role="group"
          aria-label={t('changeLanguage')}
          className="flex items-center rounded-full border border-emerald-700 bg-emerald-800 p-0.5 text-xs sm:text-sm"
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              aria-pressed={language === lang.code}
              className={`rounded-full px-2 py-1 font-semibold transition-colors sm:px-3 ${
                language === lang.code
                  ? 'bg-white text-emerald-900 shadow'
                  : 'text-emerald-100 hover:text-white'
              }`}
            >
              <span className="sm:hidden">{lang.short}</span>
              <span className="hidden sm:inline">{lang.label}</span>
            </button>
          ))}
        </div>

        {/* USER MENU */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={user?.email ?? 'Account'}
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white ring-2 ring-emerald-500/50 transition hover:bg-emerald-500"
          >
            {initials}
          </button>

          {menuOpen && (
            <>
              <button
                className="fixed inset-0 z-40 cursor-default"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-xl border border-gray-100 bg-white text-gray-800 shadow-xl">
                <div className="border-b border-gray-100 px-3 py-2.5">
                  <div className="truncate text-sm font-semibold">
                    {user?.name || name || 'Vivasayi AI'}
                  </div>
                  {user?.email && (
                    <div className="truncate text-xs text-gray-500">{user.email}</div>
                  )}
                </div>

                {!hasProfile && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenProfile();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-emerald-50"
                  >
                    <User className="h-4 w-4 text-emerald-700" />
                    {t('setupProfile')}
                  </button>
                )}

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  {t('logout')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};