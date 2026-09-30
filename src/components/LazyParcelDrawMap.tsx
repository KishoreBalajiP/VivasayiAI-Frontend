import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { ParcelDrawMapProps } from './ParcelDrawMap';

// MapLibre GL plus the draw control is roughly half a megabyte of minified JS. Both call sites
// (Manage Parcels modal, ClaimWizard area step) render the map only inside a modal/step, so it is
// code-split here and fetched on demand instead of blocking first paint for every farmer — this
// matters most on the low-end Android devices the UI targets.
const ParcelDrawMap = lazy(() => import('./ParcelDrawMap'));

/**
 * Drop-in replacement for {@link ParcelDrawMap} that defers loading the map engine. Props and
 * behaviour are identical; only the loading state differs.
 */
export const LazyParcelDrawMap = (props: ParcelDrawMapProps) => {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-live="polite"
          className="flex h-72 flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-600 sm:h-96"
        >
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          <p className="text-sm">{t('mapLoading')}</p>
        </div>
      }
    >
      <ParcelDrawMap {...props} />
    </Suspense>
  );
};

export default LazyParcelDrawMap;
