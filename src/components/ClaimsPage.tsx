import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import { ApiClientError, friendlyMessageKey } from '../api/client';
import {
  createClaim,
  getClaim,
  listClaims,
  listParcels,
  resubmitClaim,
  uploadClaimEvidence,
  verifyClaimRequest,
  withdrawClaim,
} from '../api/claims';
import {
  claimDetailViewModel,
  formatClaimDate,
  resolveClaimsListState,
} from '../utils/claimFlow';
import { useClaimsViewport } from '../utils/claimResponsive';
import { ClaimWizard } from './ClaimWizard';
import { ClaimStateBadge, VerificationResultCard } from './ClaimStatusCard';
import ClaimEvidenceGallery from './ClaimEvidenceGallery';
import type { LossClaim, ParcelRecord, VerificationDecision } from '../types';

type ClaimsSubview =
  | { name: 'list' }
  | { name: 'new' }
  | { name: 'detail'; claimId: string };

export const ClaimsPage = () => {
  const { i18n } = useTranslation();
  const language = i18n.language === 'ta' ? 'ta' : 'en';
  const [subview, setSubview] = useState<ClaimsSubview>({ name: 'list' });
  const [parcels, setParcels] = useState<ParcelRecord[]>([]);
  const [parcelsStatus, setParcelsStatus] = useState<'loading' | 'ready' | 'error'>('ready');
  const [parcelRetryKey, setParcelRetryKey] = useState(0);

  useEffect(() => {
    if (subview.name !== 'new') return;
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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      {subview.name === 'list' && (
        <ClaimsList
          language={language}
          onOpenNew={() => setSubview({ name: 'new' })}
          onOpenClaim={(claimId) => setSubview({ name: 'detail', claimId })}
        />
      )}
      {subview.name === 'new' && (
        <ClaimWizard
          parcels={parcels}
          parcelsStatus={parcelsStatus}
          onRetryParcels={() => setParcelRetryKey((k) => k + 1)}
          onCreateClaim={async (input) => createClaim(input)}
          onUploadEvidence={async (claimId, file) => void uploadClaimEvidence(claimId, file)}
          onDone={(claim) => setSubview({ name: 'detail', claimId: claim.id })}
          onCancel={() => setSubview({ name: 'list' })}
        />
      )}
      {subview.name === 'detail' && (
        <ClaimDetail
          claimId={subview.claimId}
          language={language}
          onBack={() => setSubview({ name: 'list' })}
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
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="text-sm">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pb-8 pt-1 sm:px-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900 sm:text-xl">{t('myClaims')}</h2>
        <button
          onClick={onOpenNew}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:from-emerald-700 hover:to-green-800"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('newClaimButton')}</span>
          <span className="sm:hidden">{t('newClaim')}</span>
        </button>
      </div>

      {listState.kind === 'error' && (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{t('claimsLoadFailed')}</span>
          <button onClick={() => setRetryKey((k) => k + 1)} className="inline-flex items-center gap-1 rounded-full border border-amber-400 px-3 py-0.5 font-semibold hover:bg-amber-100">
            <RefreshCw className="h-3.5 w-3.5" />
            {t('retry')}
          </button>
        </div>
      )}

      {listState.kind === 'empty' && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-700">
            <FileText className="h-8 w-8 text-white" />
          </div>
          <h3 className="text-base font-bold text-gray-900">{t('claimsEmptyTitle')}</h3>
          <p className="max-w-md text-sm text-gray-600">{t('claimsEmptyBody')}</p>
          <button
            onClick={onOpenNew}
            className="mt-1 rounded-xl bg-gradient-to-r from-emerald-600 to-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-emerald-700 hover:to-green-800"
          >
            {t('newClaimButton')}
          </button>
        </div>
      )}

      {listState.kind === 'ready' && (
        <ul
          className={`grid gap-3 ${viewport.columns === 1 ? 'sm:grid-cols-2' : viewport.columns === 2 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-3'}`}
        >
          {listState.models.map((model) => (
            <li key={model.id}>
              <button
                onClick={() => onOpenClaim(model.id)}
                className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="truncate font-semibold text-gray-900">
                    {t(model.eventTypeLabelKey)}
                  </span>
                  <ClaimStateBadge state={model.state} />
                </div>
                <div className="mb-1 text-sm text-gray-600">{t('claimDatesOn', { date: formatClaimDate(model.eventDate, language) })}</div>
                <div className="mb-1 text-sm text-gray-600">
                  {t('claimedAreaLabel')}: {model.claimedAreaAcres} {t('acre')}
                </div>
                {!viewport.compact && (
                  <div className="mb-1 truncate text-xs text-gray-500">
                    {model.parcelName ?? t('parcelNameLabel')}
                    {model.crop ? ` · ${model.crop}` : ''}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-gray-400">
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

// ── Claim detail + status + actions ────────────────────────────────────────────────────

interface ClaimDetailProps {
  claimId: string;
  language: string;
  onBack: () => void;
}

const MAX_RESULT_POLLS = 20;

const ClaimDetail = ({ claimId, language, onBack }: ClaimDetailProps) => {
  const { t } = useTranslation();
  const [claim, setClaim] = useState<LossClaim | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [verification, setVerification] = useState<VerificationDecision | null>(null);
  const [busy, setBusy] = useState<'verify' | 'withdraw' | 'resubmit' | null>(null);
  const [resultPolling, setResultPolling] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const fetched = await getClaim(claimId);
      setClaim(fetched);
      setNotFound(false);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return; // auth layer
      if (err instanceof ApiClientError && err.status === 404) setNotFound(true);
      else toast.error(t('claimsLoadFailed'), { duration: 4000 });
    } finally {
      setLoading(false);
    }
  }, [claimId, t]);

  useEffect(() => {
    void loadDetail();
    return () => clearPolling();
  }, [loadDetail]);

  const clearPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollCountRef.current = 0;
    setResultPolling(false);
  };

  // The verification may run asynchronously (inProgress). Poll the claim detail until a
  // decision lands or the poll budget is exhausted — always reading the backend authority.
  useEffect(() => {
    if (!resultPolling) return undefined;
    pollTimerRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      try {
        const refreshed = await getClaim(claimId);
        if (refreshed.assessment?.state || ['verified', 'partially_verified', 'rejected', 'out_of_limit', 'duplicate_area', 'more_evidence_required'].includes(refreshed.state)) {
          clearPolling();
          setClaim(refreshed);
          return;
        }
      } catch {
        // transient — continue polling
      }
      if (pollCountRef.current >= MAX_RESULT_POLLS) clearPolling();
    }, 3000);
    return () => clearPolling();
  }, [resultPolling, claimId]);

  const runVerification = async () => {
    if (busy) return;
    setBusy('verify');
    try {
      const decision = await verifyClaimRequest(claimId);
      setVerification(decision);
      if (decision.inProgress || decision.outcome === null) {
        // Backend is still processing the decision — poll for it.
        clearPolling();
        pollCountRef.current = 0;
        setResultPolling(true);
        toast.info(t('verificationRunning'), { duration: 3000 });
      } else {
        toast.success(t('verificationDone'), { duration: 3000 });
      }
      void loadDetail();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return;
      toast.error(t(friendlyMessageKey(err instanceof ApiClientError ? err.status : 0)), { duration: 4000 });
    } finally {
      setBusy(null);
    }
  };

  const runWithdraw = async () => {
    if (busy) return;
    if (!window.confirm(t('withdrawConfirmBody'))) return;
    setBusy('withdraw');
    try {
      await withdrawClaim(claimId);
      toast.success(t('withdrawToast'), { duration: 3000 });
      void loadDetail();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return;
      toast.error(t(friendlyMessageKey(err instanceof ApiClientError ? err.status : 0)), { duration: 4000 });
    } finally {
      setBusy(null);
    }
  };

  const runResubmit = async () => {
    if (busy) return;
    if (!window.confirm(t('resubmitConfirmBody'))) return;
    setBusy('resubmit');
    try {
      await resubmitClaim(claimId);
      toast.success(t('resubmitToast'), { duration: 3000 });
      void loadDetail();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return;
      toast.error(t(friendlyMessageKey(err instanceof ApiClientError ? err.status : 0)), { duration: 4000 });
    } finally {
      setBusy(null);
    }
  };

  const model = claimDetailViewModel(claim, verification);

  return (
    <div className="mx-auto w-full max-w-2xl px-3 pb-8 pt-1 sm:px-4">
      <div className="mb-3 flex items-center gap-3">
        <button onClick={onBack} aria-label={t('backToClaims')} className="rounded-xl border border-gray-300 p-2 text-gray-700 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="truncate text-lg font-bold text-gray-900 sm:text-xl">{t('claimDetailsTitle')}</h2>
      </div>

      {loading && (
        <div className="flex flex-col items-center gap-2 py-12 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm">{t('loading')}</p>
        </div>
      )}

      {!loading && notFound && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-red-700">{t('claimNotFound')}</p>
          <button onClick={onBack} className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            {t('backToClaims')}
          </button>
        </div>
      )}

      {!loading && !notFound && claim && (
        <div className="space-y-3">
          {/* Status card */}
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <ClaimStateBadge state={model.state} />
              <span className="text-xs text-gray-400">{t('claimReference')}: {model.id.slice(-8).toUpperCase()}</span>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label={t('reviewParcel')} value={model.parcelName ?? t('parcelNameLabel')} />
              {model.crop && <Row label={t('parcelCropLabel')} value={model.crop} />}
              <Row label={t('parcelAreaLabel')} value={`${model.parcelAreaAcres} ${t('acre')}`} />
              <Row label={t('reviewEvent')} value={t(model.eventTypeLabelKey)} />
              <Row label={t('reviewDate')} value={formatClaimDate(model.eventDate, language)} />
              <Row label={t('claimedAreaLabel')} value={`${model.claimedAreaAcres} ${t('acre')}`} />
              <Row label={t('claimFiledOnLabel')} value={formatClaimDate(model.createdAt, language)} />
            </dl>
            {model.state === 'draft' && <p className="mt-3 text-xs text-gray-500">{t('draftHint')}</p>}
            {model.state === 'more_evidence_required' && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t('moreEvidenceHint')}
              </p>
            )}
          </div>

          {/* Verification result (only backend-decided outcomes) */}
          {model.report.kind === 'none' && model.hasResult && claim.assessment && (
            <VerificationResultInline assessment={claim.assessment} />
          )}
          {model.report.kind === 'decision' && (
            <VerificationResultCard verification={model.report.verification} language={language} />
          )}
          {model.report.kind === 'processing' && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('processingResultNote')}
              </div>
            </div>
          )}
          {model.report.kind === 'none' && !model.hasResult && (model.state === 'submitted' || model.state === 'more_evidence_required') && (
            <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-500 shadow-sm">
              {t('noDecisionYet')}
            </div>
          )}

          {/* Evidence gallery */}
          <ClaimEvidenceGallery
            claimId={claimId}
            evidence={model.evidence}
            canEdit={model.canEditEvidence}
            onChanged={() => void loadDetail()}
          />
          {!model.canEditEvidence && (
            <p className="px-1 text-xs text-gray-500">{t('evidenceBlockedHint')}</p>
          )}

          {/* Farmer actions (backend-authoritative affordances) */}
          <div className="flex flex-wrap gap-2">
            {model.canVerify && (
              <button
                onClick={() => void runVerification()}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:from-emerald-700 hover:to-green-800 disabled:opacity-60"
              >
                {busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {t('verifyClaim')}
              </button>
            )}
            {model.canResubmit && (
              <button
                onClick={() => void runResubmit()}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
              >
                {busy === 'resubmit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                {t('resubmitClaim')}
              </button>
            )}
            {model.canWithdraw && (
              <button
                onClick={() => void runWithdraw()}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {busy === 'withdraw' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('withdrawClaim')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-gray-500">{label}</dt>
    <dd className="text-right font-semibold text-gray-900">{value}</dd>
  </div>
);

// Renders a persisted assessment directly from GET /claims/:id (the list never carries one).
const VerificationResultInline = ({ assessment }: { assessment: LossClaim['assessment'] }) => {
  const { i18n } = useTranslation();
  if (!assessment || !assessment.state) return null;
  const decision: VerificationDecision = {
    claimId: '',
    idempotent: true,
    inProgress: false,
    claimState: (assessment.state as LossClaim['state']) ?? null,
    outcome: assessment.state,
    reason: assessment.reason,
    rules: assessment.rules,
    approvedGeometry: assessment.approvedGeometry,
    approvedAreaAcres: assessment.approvedAreaAcres,
    weatherCorrelation: assessment.weatherCorrelation,
    decidedAt: assessment.decidedAt,
    decidedBy: assessment.decidedBy,
    claimedAreaAcres: 0,
    parcelAreaAcres: 0,
    evidenceVersion: null,
    engineVersion: null,
  };
  return <VerificationResultCard verification={decision} language={i18n.language === 'ta' ? 'ta' : 'en'} />;
};

export default ClaimsPage;