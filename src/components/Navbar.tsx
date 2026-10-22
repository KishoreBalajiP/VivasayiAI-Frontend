import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { MapPin, LogOut, User, Sprout, MessageSquareText, FileText, ShieldCheck, Map } from 'lucide-react';
import type { Language } from '../types';
import type { AppSection } from '../routing/hashRoute';
import { cn } from './ui';

// Phase 10 (E9-S10): 'admin' unlocks the review workflow section (render-gated by isAdmin).
// The section type now lives with the hash router; re-exported for existing imports.
export type { AppSection };

interface NavbarProps {
  hasProfile: boolean;
  /** Farm district from the PROFILE (never the device location). Null when not set yet. */
  farmDistrict?: string | null;
  /** Profile not known yet (loading, or the load failed): hide the chip rather than flash
   *  "Set farm district" at a farmer who already has one. */
  profileUnknown?: boolean;
  onOpenProfile: () => void;
  onOpenManageParcels: () => void;
  section: AppSection;
  onSelectSection: (section: AppSection) => void;
}

const LANGUAGES: { code: Language; label: string; short: string }[] = [
  { code: 'ta', label: 'தமிழ்', short: 'த' },
  { code: 'en', label: 'English', short: 'EN' },
];

const NAV_ITEMS: { section: AppSection; labelKey: string; icon: typeof MessageSquareText; adminOnly?: boolean }[] = [
  { section: 'chat', labelKey: 'navChat', icon: MessageSquareText },
  { section: 'claims', labelKey: 'navClaims', icon: FileText },
  { section: 'admin', labelKey: 'navAdmin', icon: ShieldCheck, adminOnly: true },
];

export const Navbar = ({
  hasProfile,
  farmDistrict = null,
  profileUnknown = false,
  onOpenProfile,
  onOpenManageParcels,
  section,
  onSelectSection,
}: NavbarProps) => {
  const { t } = useTranslation();
  const { user, language, setLanguage, logout, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const name = user?.name?.trim() || user?.email?.split('@')[0] || '';
  const initials = (name || 'U').slice(0, 1).toUpperCase();

  return (
    // data-surface="dark": the global keyboard ring (brand-700) is only ~1.8:1 on this brand-900
    // header and ~1.4:1 on the brand-800 pills, so index.css turns it white inside (9.7:1 and
    // 7.7:1, above the 3:1 WCAG 1.4.11 minimum). Scoped by surface, not per control, so a control
    // added here later gets the right ring without remembering a class. The white user menu below
    // is marked data-surface="light" and keeps the brand-700 ring.
    <header data-surface="dark" className="relative z-30 shrink-0 bg-brand-900 text-white shadow-md">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        {/* BRAND */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-700 shadow-inner">
            <Sprout aria-hidden="true" className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="sr-only font-bold sm:not-sr-only sm:truncate sm:text-base">Vivasayi AI</div>
            <div className="hidden truncate text-2xs text-brand-200 lg:block">
              {t('appTitle')}
            </div>
          </div>
        </div>

        {/* FARM CHIP — the farm district from the profile. The header NEVER shows the device
            location or an "Outside Tamil Nadu" verdict (that free-text device place was how
            "…, Andhra Pradesh" ended up next to a Chennai farm). Tapping opens the profile. */}
        {!profileUnknown && (
          <button
            type="button"
            data-testid="header-farm-chip"
            onClick={onOpenProfile}
            title={farmDistrict ? t('headerFarmDistrictTitle') : t('headerSetFarmDistrictTitle')}
            className={cn(
              'ml-1 flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors sm:text-sm',
              farmDistrict
                ? 'bg-brand-800 text-brand-100 hover:bg-brand-700'
                : 'border border-brand-600 text-brand-100 hover:bg-brand-800'
            )}
          >
            <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="sr-only sm:not-sr-only sm:truncate">
              {farmDistrict ? t('headerFarmDistrict', { district: farmDistrict }) : t('headerSetFarmDistrict')}
            </span>
          </button>
        )}

        <div className="flex-1" />

        {/* SECTION TOGGLE (Assistant / Claims / Admin). Below 640px only the icon shows, but the
            label stays in the accessibility tree (sr-only), so every button keeps its name. */}
        <nav aria-label={t('mainNavigation')} className="flex items-center rounded-full border border-brand-700 bg-brand-800 p-0.5 text-sm">
          {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map(({ section: target, labelKey, icon: Icon }) => (
            <button
              key={target}
              type="button"
              onClick={() => onSelectSection(target)}
              aria-current={section === target ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold transition-colors sm:px-3',
                section === target ? 'bg-white text-brand-900 shadow' : 'text-brand-100 hover:text-white'
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">{t(labelKey)}</span>
            </button>
          ))}
        </nav>

        {/* LANGUAGE PILL (always visible, two-option segmented control) */}
        <div
          role="group"
          aria-label={t('changeLanguage')}
          className="flex items-center rounded-full border border-brand-700 bg-brand-800 p-0.5 text-xs sm:text-sm"
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => setLanguage(lang.code)}
              aria-pressed={language === lang.code}
              aria-label={lang.label}
              lang={lang.code}
              className={cn(
                'rounded-full px-2 py-1 font-semibold transition-colors sm:px-3',
                language === lang.code ? 'bg-white text-brand-900 shadow' : 'text-brand-100 hover:text-white'
              )}
            >
              <span aria-hidden="true" className="sm:hidden">{lang.short}</span>
              <span aria-hidden="true" className="hidden sm:inline">{lang.label}</span>
            </button>
          ))}
        </div>

        {/* USER MENU */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={user?.email ?? t('account')}
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white ring-2 ring-brand-500/50 transition hover:bg-brand-600"
          >
            {initials}
          </button>

          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default"
                aria-label={t('closeMenu')}
                onClick={() => setMenuOpen(false)}
              />
              <div
                data-surface="light"
                className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-control border border-gray-100 bg-white text-ink shadow-xl"
              >
                <div className="border-b border-gray-100 px-3 py-2.5">
                  <div className="truncate text-sm font-semibold">
                    {user?.name || name || 'Vivasayi AI'}
                  </div>
                  {user?.email && (
                    <div className="truncate text-xs text-ink-subtle">{user.email}</div>
                  )}
                </div>

                {hasProfile ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenProfile();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm focus-visible:outline-offset-[-2px] hover:bg-brand-50"
                    >
                      <User aria-hidden="true" className="h-4 w-4 text-brand-700" />
                      {t('farmProfile')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenManageParcels();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm focus-visible:outline-offset-[-2px] hover:bg-brand-50"
                    >
                      <Map aria-hidden="true" className="h-4 w-4 text-brand-700" />
                      {t('manageParcels')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenProfile();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm focus-visible:outline-offset-[-2px] hover:bg-brand-50"
                  >
                    <User aria-hidden="true" className="h-4 w-4 text-brand-700" />
                    {t('setupProfile')}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm focus-visible:outline-offset-[-2px] text-danger-fg hover:bg-danger-bg"
                >
                  <LogOut aria-hidden="true" className="h-4 w-4" />
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
