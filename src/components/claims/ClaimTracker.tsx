import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { ApiClientError, friendlyMessageKey } from '../../api/client';
import {
  getClaim,
  getClaimProgress,
  getClaimVerification,
  resubmitClaim,
  submitClaim,
  withdrawClaim,
} from '../../api/claims';
import { useClaimProgress, type ProgressFetcher } from '../../hooks/useClaimProgress';
import { decisionTone, legacyProgressFromClaim, parseClaimProgress } from '../../utils/claimProgress';
import {
  canAppealClaim,
  claimDetailViewModel,
  claimStateLabelKey,
  claimantRelationshipLabelKey,
  decisionReasonKeys,
  formatClaimDate,
  verificationFromClaim,
} from '../../utils/claimFlow';
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, EmptyState, SkeletonText, StatusPill } from '../ui';
import { VerificationResultCard } from '../ClaimStatusCard';
import ClaimEvidenceGallery from '../ClaimEvidenceGallery';
import { ClaimComponentChecklist } from '../ClaimComponentChecklist';
import { ClaimOwnershipDocuments } from '../ClaimOwnershipDocuments';
import { ClaimAppealPanel } from '../ClaimAppealPanel';
import { TrackerHeader } from './TrackerHeader';
import { ProgressStages } from './ProgressStages';
import { SatelliteCard } from './SatelliteCard';
import { ActionRequiredCallouts } from './ActionRequiredCallouts';
import { EvidenceSummary } from './EvidenceSummary';
import type { LossClaim } from '../../types';

// The claim tracker (plan B4, design §7): the farmer's page for one claim at #/claims/:id.
//
// Checks start on their own after submit, so this page only READS: it polls the progress contract
// (useClaimProgress) and shows exactly what the backend reports. There is no "Run AI verification"
// button and nothing here calls POST /claims/:id/verify. No percentages, no progress bar, nothing
// estimated. Withdraw and resubmit go through confirmation dialogs.
//
// Legacy fallback: if GET /claims/:id/progress answers 404, GET /claims/:id/verification decides
// between "an older backend" (it answers: use its `progress`, or a minimal view built from the
// claim) and "not this farmer's claim" (it also answers 404: not found).
//
// e2e selector contract (values are the API strings): `claim-tracker` [data-claim-id,
// data-overall-status], `tracker-stage` [data-stage-id, data-stage-status], `tracker-satellite`
// [data-satellite-status], `tracker-last-updated`, `tracker-refresh-error`, `decision-card`
// [data-decision], `claim-action` [data-action-code].

export interface ClaimTrackerProps {
  claimId: string;
  language: string;
  onBack: () => void;
}

type ClaimLoad = 'loading' | 'ready' | 'notFound' | 'error';

const focusSection = (element: HTMLElement | null) => {
  if (!element) return;
  element.scrollIntoView?.({ block: 'start' });
  element.focus({ preventScroll: true });
};

const errorStatus = (err: unknown): number => (err instanceof ApiClientError ? err.status : 0);

export const ClaimTracker = ({ claimId, language, onBack }: ClaimTrackerProps) => {
  const { t } = useTranslation();
  const [claim, setClaim] = useState<LossClaim | null>(null);
  const [claimLoad, setClaimLoad] = useState<ClaimLoad>('loading');
  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [dialog, setDialog] = useState<'withdraw' | 'resubmit' | null>(null);
  const [busy, setBusy] = useState<'submit' | 'withdraw' | 'resubmit' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const documentsRef = useRef<HTMLDivElement>(null);
  const appealRef = useRef<HTMLDivElement>(null);

  // ── Progress (polled) ────────────────────────────────────────────────────────────────────
  const legacyRef = useRef(false);
  const fetchProgress = useCallback<ProgressFetcher>(async (id, { signal }) => {
    if (!legacyRef.current) {
      try {
        return await getClaimProgress(id, { signal });
      } catch (err) {
        if (errorStatus(err) !== 404) throw err;
        // 404: an older backend without /progress, or a claim that is not this farmer's. The
        // verification read is owner-scoped too, so it tells the two apart.
      }
    }
    const status = await getClaimVerification(id, { signal });
    legacyRef.current = true;
    return parseClaimProgress(status.progress) ?? legacyProgressFromClaim(status.claim);
  }, []);
  const tracker = useClaimProgress(claimId, { fetchProgress });
  const { refresh } = tracker;

  // ── The claim itself (facts, evidence, assessment) ───────────────────────────────────────
  const loadClaim = useCallback(
    async (options: { quiet?: boolean } = {}) => {
      if (!options.quiet) setClaimLoad('loading');
      try {
        setClaim(await getClaim(claimId));
        setClaimLoad('ready');
      } catch (err) {
        const status = errorStatus(err);
        if (status === 401) return; // the auth layer takes over
        if (status === 404) setClaimLoad('notFound');
        else if (!options.quiet) setClaimLoad('error');
      }
    },
    [claimId]
  );

  useEffect(() => {
    void loadClaim();
  }, [loadClaim]);

  // The claim is read again when the backend reports a new state or decision, so the decision
  // card renders the persisted result. At most once per reported state/decision (no loops).
  const reloadedForRef = useRef<string | null>(null);
  useEffect(() => {
    const progress = tracker.progress;
    if (!progress || !claim) return;
    const key = `${progress.claimState}|${progress.decision ?? ''}`;
    const inStep = claim.state === progress.claimState && (!progress.decision || claim.assessment?.state === progress.decision);
    if (inStep || reloadedForRef.current === key) {
      reloadedForRef.current = key;
      return;
    }
    reloadedForRef.current = key;
    void loadClaim({ quiet: true });
  }, [tracker.progress, claim, loadClaim]);

  // Evidence or documents changed: the claim and the checks both move.
  const handleEvidenceChanged = useCallback(() => {
    void loadClaim({ quiet: true });
    void refresh();
  }, [loadClaim, refresh]);

  // ── Farmer actions ───────────────────────────────────────────────────────────────────────
  const runSubmit = async () => {
    if (busy) return;
    setBusy('submit');
    setSubmitError(null);
    try {
      const submitted = await submitClaim(claimId);
      // Success is only ever claimed from the state the backend returned.
      if (submitted.state === 'submitted') {
        toast.success(t('claimSubmittedToast'), { duration: 3000 });
      } else {
        setSubmitError(t('claimsLoadFailed'));
        toast.error(t('claimsLoadFailed'), { duration: 4000 });
      }
      void loadClaim({ quiet: true });
      void refresh();
    } catch (err) {
      const status = errorStatus(err);
      if (status === 401) return;
      setSubmitError(t(friendlyMessageKey(status)));
      toast.error(t(friendlyMessageKey(status)), { duration: 4000 });
    } finally {
      setBusy(null);
    }
  };

  const runConfirmed = async () => {
    const which = dialog;
    if (!which || busy) return;
    setBusy(which);
    try {
      if (which === 'withdraw') {
        await withdrawClaim(claimId);
        toast.success(t('withdrawToast'), { duration: 3000 });
      } else {
        await resubmitClaim(claimId);
        toast.success(t('resubmitToast'), { duration: 3000 });
      }
      setDialog(null);
      void loadClaim({ quiet: true });
      // Withdrawn stops polling; a resubmitted claim is checked again, so polling resumes.
      void refresh();
    } catch (err) {
      const status = errorStatus(err);
      setDialog(null);
      if (status === 401) return;
      toast.error(t(friendlyMessageKey(status)), { duration: 4000 });
    } finally {
      setBusy(null);
    }
  };

  // ── View ─────────────────────────────────────────────────────────────────────────────────
  // A progress object this client cannot read is replaced by the minimal view of the claim.
  const view = tracker.progress ?? (tracker.status === 'unsupported' && claim ? legacyProgressFromClaim(claim) : null);
  const model = useMemo(() => claimDetailViewModel(claim, null), [claim]);
  const verification = useMemo(() => verificationFromClaim(claim), [claim]);
  const notFound = claimLoad === 'notFound' || tracker.status === 'notFound';
  const loading = !view && (tracker.status === 'loading' || claimLoad === 'loading');

  return (
    <div
      className="mx-auto w-full max-w-5xl px-3 pb-8 pt-1 sm:px-4"
      data-testid="claim-tracker"
      data-claim-id={claimId}
      data-overall-status={view?.overallStatus}
      data-stale={tracker.stale ? 'true' : undefined}
    >
      <div className="mb-3 flex items-center gap-3">
        <Button variant="secondary" size="icon" onClick={onBack} aria-label={t('backToClaims')}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        </Button>
        <h2 className="truncate text-lg font-bold text-ink sm:text-xl">{t('claimDetailsTitle')}</h2>
      </div>

      {notFound ? (
        <EmptyState
          title={t('claimNotFound')}
          action={
            <Button variant="secondary" onClick={onBack}>
              {t('backToClaims')}
            </Button>
          }
        />
      ) : (
        <>
          <TrackerHeader
            claimId={claimId}
            claim={claim}
            progress={view}
            language={language}
            fetchedAt={tracker.fetchedAt}
            stale={tracker.stale}
            refreshing={tracker.refreshing}
            offline={tracker.offline}
            error={tracker.error}
            onRefresh={() => void refresh()}
          />

          {!view && tracker.status === 'error' && (
            <Alert
              tone="danger"
              className="mb-3"
              data-testid="tracker-refresh-error"
              title={t('trackerLoadFailedTitle')}
              actions={
                <Button size="sm" variant="secondary" onClick={tracker.restart} leadingIcon={<RefreshCw className="h-3.5 w-3.5" />}>
                  {t('retry')}
                </Button>
              }
            >
              {t('trackerLoadFailedBody')}
            </Alert>
          )}

          {view?.legacy && (
            <Alert tone="info" className="mb-3">
              {tracker.status === 'unsupported' ? t('trackerUnsupportedNote') : t('trackerLegacyNote')}
            </Alert>
          )}

          {loading && (
            <div aria-busy="true" className="mb-3 rounded-card border border-surface-border bg-white p-4">
              <span className="sr-only">{t('loading')}</span>
              <SkeletonText lines={4} />
            </div>
          )}

          {view && (
            <ActionRequiredCallouts
              actions={view.actionRequired}
              onSubmit={() => void runSubmit()}
              submitting={busy === 'submit'}
              submitError={submitError}
              onAddPhotos={() => focusSection(galleryRef.current)}
              onAddDocuments={() => focusSection(documentsRef.current)}
              onResubmit={() => setDialog('resubmit')}
              resubmitting={busy === 'resubmit'}
            />
          )}

          {view?.decision && (
            <DecisionCard decision={view.decision} claimCaughtUp={claim?.state === view.decision}>
              {verification && verification.outcome === view.decision ? (
                <VerificationResultCard verification={verification} language={language} />
              ) : null}
            </DecisionCard>
          )}

          <div className="grid gap-3 lg:grid-cols-5">
            <div className="space-y-3 lg:col-span-3">
              {view && <ProgressStages stages={view.stages} language={language} />}
              {claim && <ClaimFacts claim={claim} language={language} />}
            </div>
            <div className="space-y-3 lg:col-span-2">
              {view?.satellite && <SatelliteCard satellite={view.satellite} language={language} />}
              {claim && (
                <EvidenceSummary
                  photoCount={model.evidence.length}
                  documentCount={documentCount}
                  onPhotos={() => focusSection(galleryRef.current)}
                  onDocuments={() => focusSection(documentsRef.current)}
                  onAppeal={canAppealClaim(model.state) ? () => focusSection(appealRef.current) : undefined}
                  onWithdraw={model.canWithdraw ? () => setDialog('withdraw') : undefined}
                  withdrawing={busy === 'withdraw'}
                />
              )}
            </div>
          </div>

          {model.report.kind === 'held' && (
            <details className="mt-3 rounded-card border border-surface-border bg-white" data-testid="tracker-held-details">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">{t('trackerHeldDetails')}</summary>
              <div className="px-4 pb-4">
                <ClaimComponentChecklist rows={model.report.checklist} />
              </div>
            </details>
          )}

          {claim && (
            <div className="mt-3 space-y-3">
              <div ref={galleryRef} tabIndex={-1} className="rounded-card outline-none focus-visible:ring-2 focus-visible:ring-brand-700">
                <ClaimEvidenceGallery
                  claimId={claimId}
                  evidence={model.evidence}
                  canEdit={model.canEditEvidence}
                  onChanged={handleEvidenceChanged}
                />
                {!model.canEditEvidence && <p className="mt-1 px-1 text-xs text-ink-muted">{t('evidenceBlockedHint')}</p>}
              </div>

              {/* Land ownership documents (a reviewer looks at them; never an official verification) */}
              <div ref={documentsRef} tabIndex={-1} className="rounded-card outline-none focus-visible:ring-2 focus-visible:ring-brand-700">
                <ClaimOwnershipDocuments
                  claimId={claimId}
                  relationship={claim.claimantRelationship ?? null}
                  canAttach={model.state !== 'withdrawn'}
                  language={language}
                  onChanged={handleEvidenceChanged}
                  onLoaded={(documents) => setDocumentCount(documents.length)}
                />
              </div>

              {/* Farmer appeal: only for decisions the backend allows to be appealed */}
              {canAppealClaim(model.state) && (
                <div ref={appealRef} tabIndex={-1} className="rounded-card outline-none focus-visible:ring-2 focus-visible:ring-brand-700">
                  <ClaimAppealPanel claimId={claimId} language={language} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={dialog === 'withdraw'}
        tone="danger"
        title={t('withdrawConfirmTitle')}
        body={t('withdrawConfirmBody')}
        confirmLabel={t('withdrawClaim')}
        busy={busy === 'withdraw'}
        onConfirm={() => void runConfirmed()}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'resubmit'}
        title={t('resubmitConfirmTitle')}
        body={t('resubmitConfirmBody')}
        confirmLabel={t('resubmitClaim')}
        busy={busy === 'resubmit'}
        onConfirm={() => void runConfirmed()}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
};

// The decision as the progress contract reports it (`data-decision` is the API value). The full
// persisted result is rendered inside once the claim read has caught up with that decision. A claim
// that has caught up but carries no stored result (decided before results were stored) shows the
// outcome with its generic reason instead of loading forever.
const DecisionCard = ({
  decision,
  claimCaughtUp,
  children,
}: {
  decision: string;
  claimCaughtUp: boolean;
  children: ReactNode;
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} data-testid="decision-card" data-decision={decision} className="mb-3">
      <h3 id={titleId} className="sr-only">
        {t('trackerDecisionTitle')}
      </h3>
      {children ?? (
        <Card>
          <CardHeader>
            <CardTitle id={`${titleId}-summary`}>{t('verificationResultTitle')}</CardTitle>
            <StatusPill tone={decisionTone(decision)}>{t(claimStateLabelKey(decision))}</StatusPill>
          </CardHeader>
          {claimCaughtUp ? (
            <CardBody>
              <p className="text-sm text-ink">{t(decisionReasonKeys(null, decision))}</p>
            </CardBody>
          ) : (
            <CardBody aria-busy="true">
              <p className="mb-2 text-sm text-ink-muted">{t('trackerDecisionLoading')}</p>
              <SkeletonText lines={2} />
            </CardBody>
          )}
        </Card>
      )}
    </section>
  );
};

// What the farmer filed, as the backend stored it (server-measured areas, never client math).
const ClaimFacts = ({ claim, language }: { claim: LossClaim; language: string }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const parcelArea = claim.parcelSnapshot?.parcelAreaAcres ?? 0;
  return (
    <Card titleId={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>{t('trackerFactsTitle')}</CardTitle>
      </CardHeader>
      <CardBody>
        <dl className="space-y-2 text-sm">
          <FactRow label={t('reviewParcel')} value={claim.parcelSnapshot?.name ?? t('parcelNameLabel')} />
          {claim.parcelSnapshot?.crop && <FactRow label={t('parcelCropLabel')} value={claim.parcelSnapshot.crop} />}
          <FactRow label={t('parcelAreaLabel')} value={`${parcelArea} ${t('acre')}`} />
          <FactRow label={t('claimedAreaLabel')} value={`${claim.claimedAreaAcres} ${t('acre')}`} />
          {claim.claimantRelationship && (
            <FactRow label={t('claimantRelationshipLabel')} value={t(claimantRelationshipLabelKey(claim.claimantRelationship))} />
          )}
          <FactRow label={t('claimFiledOnLabel')} value={formatClaimDate(claim.createdAt, language)} />
        </dl>
      </CardBody>
    </Card>
  );
};

const FactRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-ink-muted">{label}</dt>
    <dd className="text-right font-semibold text-ink">{value}</dd>
  </div>
);

export default ClaimTracker;
