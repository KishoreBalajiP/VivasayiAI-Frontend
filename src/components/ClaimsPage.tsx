import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Loader2, Plus, RefreshCw } from 'lucide-react';
import { ApiClientError } from '../api/client';
import { uploadImage } from '../api';
import {
  attachOwnershipEvidence,
  createClaim,
  deleteEvidenceUpload,
  listClaims,
  listParcels,
  submitClaimTracked,
  uploadClaimEvidence,
} from '../api/claims';
import { formatRoute } from '../routing/hashRoute';
import { useHashRoute } from '../routing/useHashRoute';
import { formatClaimDate, resolveClaimsListState } from '../utils/claimFlow';
import { useClaimsViewport } from '../utils/claimResponsive';
import { ClaimWizard } from './ClaimWizard';
import { ClaimStateBadge } from './ClaimStatusCard';
import { ClaimTracker } from './claims/ClaimTracker';
import { FarmProfileEditor } from './FarmProfileEditor';
import { ManageParcels } from './ManageParcels';
import { Alert, Button, EmptyState } from './ui';
import type { FarmProfile, LossClaim, ParcelRecord } from '../types';

// Overlays opened from the claims screens. They are not routes: each remembers the route it was
// opened on and disappears as soon as the route changes (Back, a nav click, a deep link).
type ClaimsOverlay =
  | { name: 'manageParcels'; autoOpenAdd?: boolean; returnToWizard?: boolean }
  | { name: 'farmProfile'; existingProfile?: FarmProfile | null };

type ClaimsSubview =
  | { name: 'list' }
  | { name: 'new' }
  | { name: 'detail'; claimId: string }
  | ClaimsOverlay;

export const ClaimsPage = ({ profile }: { profile: FarmProfile | null }) => {
  // profile is used via subview.existingProfile in farmProfile subview
  void profile;
  const { i18n } = useTranslation();
  const language = i18n.language === 'ta' ? 'ta' : 'en';
  // list / new / detail come from the URL hash (#/claims, #/claims/new, #/claims/:id), so browser
  // Back/Forward, a reload and a shared link all land on the same screen.
  const { route, navigate } = useHashRoute();
  const routeKey = formatRoute(route);
  const routeView: ClaimsSubview =
    route.section !== 'claims'
      ? { name: 'list' }
      : route.view === 'detail'
        ? { name: 'detail', claimId: route.claimId }
        : { name: route.view };
  const [overlay, setOverlay] = useState<(ClaimsOverlay & { openedOn: string }) | null>(null);
  const subview: ClaimsSubview = overlay && overlay.openedOn === routeKey ? overlay : routeView;
  const openOverlay = (next: ClaimsOverlay) => setOverlay({ ...next, openedOn: routeKey });

  const showList = (options: { replace?: boolean } = {}) =>
    navigate({ section: 'claims', view: 'list' }, options);
  const showClaim = (claimId: string, options: { replace?: boolean } = {}) =>
    navigate({ section: 'claims', view: 'detail', claimId }, options);

  const [parcels, setParcels] = useState<ParcelRecord[]>([]);
  const [parcelsStatus, setParcelsStatus] = useState<'loading' | 'ready' | 'error'>('ready');
  const [parcelRetryKey, setParcelRetryKey] = useState(0);

  useEffect(() => {
    if (subview.name !== 'new' && subview.name !== 'manageParcels') return;
    let active = true;
    setParcelsStatus('loading');
    listParcels()
      .then((fetched) => {
        if (!active) return;
        setParcels(fetched);
        setParcelsStatus('ready');
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 401) return;
        setParcelsStatus('error');
      });
    return () => {
      active = false;
    };
  }, [subview.name, parcelRetryKey]);

  const handleParcelsChange = useCallback(() => {
    setParcelRetryKey(k => k + 1);
  }, []);

  // Returning from the parcel manager into the claim wizard after a parcel was created:
  // refresh the list so the wizard auto-selects the new (single) parcel and advances to step 2.
  const handleManageParcelsCreated = useCallback(() => {
    setParcelRetryKey(k => k + 1);
    setOverlay(null);
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      {subview.name === 'list' && (
        <ClaimsList
          language={language}
          onOpenNew={() => navigate({ section: 'claims', view: 'new' })}
          onOpenClaim={(claimId) => showClaim(claimId)}
        />
      )}
      {subview.name === 'new' && (
        <ClaimWizard
          parcels={parcels}
          parcelsStatus={parcelsStatus}
          onRetryParcels={() => setParcelRetryKey((k) => k + 1)}
          onCreateClaim={createClaim}
          onUploadEvidence={uploadClaimEvidence}
          onSubmitClaim={submitClaimTracked}
          onUploadDocumentFile={uploadImage}
          onAttachDocument={attachOwnershipEvidence}
          onDeleteEvidence={deleteEvidenceUpload}
          // Replace, not push: Back from the claim page goes to the list, not into a finished wizard.
          onDone={(claim) => showClaim(claim.id, { replace: true })}
          onOpenClaim={(claimId) => showClaim(claimId, { replace: true })}
          onCancel={() => showList({ replace: true })}
          onManageFarm={() => openOverlay({ name: 'manageParcels' })}
          onAddFirstParcel={() => openOverlay({ name: 'manageParcels', autoOpenAdd: true, returnToWizard: true })}
        />
      )}
      {subview.name === 'detail' && (
        // The claim tracker (plan B4). Keyed by claim so a new id starts a fresh polling session.
        <ClaimTracker
          key={subview.claimId}
          claimId={subview.claimId}
          language={language}
          onBack={() => showList({ replace: true })}
        />
      )}
      {subview.name === 'manageParcels' && (
        <ManageParcels
          autoOpenAdd={subview.autoOpenAdd}
          onParcelCreated={subview.returnToWizard ? handleManageParcelsCreated : undefined}
          onClose={() => {
            const backToWizard = subview.returnToWizard;
            setOverlay(null);
            if (!backToWizard) showList({ replace: true });
          }}
          onParcelsChange={handleParcelsChange}
        />
      )}
      {subview.name === 'farmProfile' && (
        <FarmProfileEditor
          existingProfile={subview.existingProfile ?? null}
          onComplete={() => {
            setOverlay(null);
            showList({ replace: true });
          }}
          onCancel={() => {
            setOverlay(null);
            showList({ replace: true });
          }}
        />
      )}
    </div>
  );
};

// ── My Claims (list) ────────────────────────────────────────────────────────────────────

interface ClaimsListProps {
  language: string;
  onOpenNew: () => void;
  onOpenClaim: (claimId: string) => void;
}

const ClaimsList = ({ language, onOpenNew, onOpenClaim }: ClaimsListProps) => {
  const { t } = useTranslation();
  const [claims, setClaims] = useState<LossClaim[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const requestIdRef = useRef(0);
  const viewport = useClaimsViewport();

  const loadClaims = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setHasError(false);
    setClaims(null);
    try {
      const fetched = await listClaims();
      if (requestIdRef.current !== requestId) return;
      setClaims(fetched);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      if (err instanceof ApiClientError && err.status === 401) return; // auth layer
      setHasError(true);
    }
  }, []);

  useEffect(() => {
    void loadClaims();
  }, [loadClaims, retryKey]);

  const listState = resolveClaimsListState(claims === null, hasError, claims ?? [], retryKey);

  if (listState.kind === 'loading') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-muted" aria-busy="true">
        <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-brand-700" />
        <p className="text-sm">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pb-8 pt-1 sm:px-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink sm:text-xl">{t('myClaims')}</h2>
        <Button onClick={onOpenNew} className="shrink-0" leadingIcon={<Plus className="h-4 w-4" />}>
          <span className="hidden sm:inline">{t('newClaimButton')}</span>
          <span className="sm:hidden">{t('newClaim')}</span>
        </Button>
      </div>

      {listState.kind === 'error' && (
        <Alert
          tone="warning"
          title={t('claimsLoadFailed')}
          actions={
            <Button size="sm" variant="secondary" onClick={() => setRetryKey((k) => k + 1)} leadingIcon={<RefreshCw className="h-3.5 w-3.5" />}>
              {t('retry')}
            </Button>
          }
        />
      )}

      {listState.kind === 'empty' && (
        <EmptyState
          icon={FileText}
          title={t('claimsEmptyTitle')}
          body={t('claimsEmptyBody')}
          action={<Button onClick={onOpenNew}>{t('newClaimButton')}</Button>}
        />
      )}

      {listState.kind === 'ready' && (
        <ul
          className={`grid gap-3 ${viewport.columns === 1 ? 'sm:grid-cols-2' : viewport.columns === 2 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-3'}`}
        >
          {listState.models.map((model) => (
            <li key={model.id}>
              <button
                onClick={() => onOpenClaim(model.id)}
                className="w-full rounded-card border border-surface-border bg-white p-4 text-left shadow-card transition hover:border-brand-300 hover:shadow"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="truncate font-semibold text-ink">
                    {t(model.eventTypeLabelKey)}
                  </span>
                  <ClaimStateBadge state={model.state} />
                </div>
                <div className="mb-1 text-sm text-ink-muted">{t('claimDatesOn', { date: formatClaimDate(model.eventDate, language) })}</div>
                <div className="mb-1 text-sm text-ink-muted">
                  {t('claimedAreaLabel')}: {model.claimedAreaAcres} {t('acre')}
                </div>
                {!viewport.compact && (
                  <div className="mb-1 truncate text-xs text-ink-subtle">
                    {model.parcelName ?? t('parcelNameLabel')}
                    {model.crop ? ` · ${model.crop}` : ''}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-ink-subtle">
                  <span>{t('claimFiledOn', { date: formatClaimDate(model.createdAt, language) })}</span>
                  <span>{t('evidenceCountLabel', { count: model.evidenceCount })}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ClaimsPage;

