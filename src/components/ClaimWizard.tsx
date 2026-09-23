import { useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Loader2, Plus, X, Check, MapPinned } from 'lucide-react';
import { toast } from 'sonner';
import { ApiClientError, friendlyMessageKey } from '../api/client';
import { validateImageFile } from '../utils/imageValidation';
import { useClaimsViewport } from '../utils/claimResponsive';
import {
  CLAIM_EVENT_TYPES,
  CLAIM_WIZARD_STEPS,
  buildReviewSummary,
  canStageEvidence,
  claimEventLabelKey,
  createEmptyDraft,
  formatClaimDate,
  generateIdempotencyKey,
  isValidIdempotencyKey,
  stepCanAdvance,
  validateClaimDate,
  wizardReducer,
  type ClaimDraft,
  type ClaimWizardStep,
  type StagedEvidence,
} from '../utils/claimFlow';
import type { ClaimCreateInput, LossClaim, ParcelRecord } from '../types';

export interface ClaimWizardProps {
  parcels: ParcelRecord[];
  parcelsStatus: 'loading' | 'ready' | 'error';
  onRetryParcels: () => void;
  onCreateClaim: (input: ClaimCreateInput) => Promise<LossClaim>;
  onUploadEvidence: (claimId: string, file: File) => Promise<void>;
  onDone: (claim: LossClaim) => void;
  onCancel: () => void;
}

export const ClaimWizard = ({
  parcels,
  parcelsStatus,
  onRetryParcels,
  onCreateClaim,
  onUploadEvidence,
  onDone,
  onCancel,
}: ClaimWizardProps) => {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'ta' ? 'ta' : 'en';
  const viewport = useClaimsViewport();

  const [draft, dispatch] = useReducer(wizardReducer, undefined, createEmptyDraft);
  const fileMapRef = useRef<Record<string, File>>({});
  const [fileInputKey, setFileInputKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const stepIndex = CLAIM_WIZARD_STEPS.indexOf(draft.step);
  const canAdvance = stepCanAdvance(draft);
  const selectedParcel = parcels.find((p) => p.parcelId === draft.parcelId) ?? null;

  const handleEvidenceSelect = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!canStageEvidence(draft)) {
        toast.error(t('cropLimit') || t('photoUploadFailed'), { duration: 4000 });
        break;
      }
      try {
        const { type } = await validateImageFile(file);
        const key = `ev_${String(Math.random()).slice(2)}_${fileMapRef.current.length ?? 0}`;
        fileMapRef.current[key] = file;
        dispatch({ type: 'evidence.add', entry: { name: file.name, size: file.size, detectedType: type } });
      } catch (err) {
        const errorKey = (err as { key?: string })?.key;
        toast.error(errorKey ? t(errorKey) : t('unsupportedImage'), { duration: 4000 });
      }
    }
    setFileInputKey((k) => k + 1);
  };

  const removeEvidence = (key: string) => {
    delete fileMapRef.current[key];
    dispatch({ type: 'evidence.remove', key });
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const summary = buildReviewSummary(draft, parcels);
    if (!summary.ok) {
      setSubmitError(summary.reason ? `reviewReason_${summary.reason}` : 'saveFailed');
      return;
    }
    const parcel = parcels.find((p) => p.parcelId === draft.parcelId);
    if (!parcel || !draft.eventType || !draft.eventDate) return;

    const input: ClaimCreateInput = {
      parcelId: parcel.parcelId,
      eventType: draft.eventType,
      eventDate: draft.eventDate,
      geometry: draft.geometry ?? parcel.geometry,
      idempotencyKey:
        draft.idempotencyKey && isValidIdempotencyKey(draft.idempotencyKey)
          ? draft.idempotencyKey
          : generateIdempotencyKey(),
    };

    setSubmitting(true);
    setSubmitError(null);

    let claim: LossClaim;
    try {
      claim = await onCreateClaim(input);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return; // auth layer owns redirect
      setSubmitError(err instanceof ApiClientError ? friendlyMessageKey(err.status) : 'saveFailed');
      setSubmitting(false);
      return;
    }

    // Evidence uploads run AFTER the draft exists (evidence is claim-scoped). A failed photo
    // never blocks the claim: it surfaces in the detail view where the farmer can retry.
    for (const entry of draft.evidence) {
      const file = fileMapRef.current[entry.key];
      if (!file) continue;
      dispatch({ type: 'evidence.uploading', key: entry.key });
      try {
        await onUploadEvidence(claim.id, file);
        dispatch({ type: 'evidence.uploaded', key: entry.key, uploadId: entry.uploadId ?? 'staged' });
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 401) return;
        const errorKey =
          err instanceof ApiClientError ? friendlyMessageKey(err.status) : 'imageUploadFailed';
        dispatch({ type: 'evidence.failed', key: entry.key, errorKey });
      }
    }

    setSubmitting(false);
    toast.success(t('claimSubmittedToast'), { duration: 3000 });
    onDone(claim);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-3 pb-8 sm:px-4">
      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={onCancel}
          aria-label={t('backToClaims')}
          className="rounded-xl border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-gray-900 sm:text-xl">{t('claimWizardTitle')}</h2>
          <p className="text-xs text-gray-500">
            {viewport.stepIndicator === 'count'
              ? t('stepXOfY', { current: stepIndex + 1, total: CLAIM_WIZARD_STEPS.length })
              : t(`step${stepTitleKey(draft.step)}`)}
          </p>
        </div>
      </div>

      {/* Step rail (only when it fits — compact screens get the counter above) */}
      {viewport.stepIndicator === 'rail' && (
        <ol className="mb-4 flex items-center gap-1 overflow-x-auto pb-1">
          {CLAIM_WIZARD_STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-1">
              <span
                className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                  index < stepIndex
                    ? 'bg-emerald-100 text-emerald-800'
                    : index === stepIndex
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-500'
                }`}
              >
                {t(stepLabelKey(step))}
              </span>
              {index < CLAIM_WIZARD_STEPS.length - 1 && <span className="h-px w-3 bg-gray-300" />}
            </li>
          ))}
        </ol>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        {draft.step === 'parcel' && <ParcelStep parcels={parcels} parcelsStatus={parcelsStatus} onRetry={onRetryParcels} selectedParcelId={draft.parcelId} onSelect={(p) => dispatch({ type: 'select.parcel', parcelId: p.parcelId, geometry: p.geometry })} />}
        {draft.step === 'event' && <EventStep selected={draft.eventType} onSelect={(eventType) => dispatch({ type: 'select.event', eventType })} />}
        {draft.step === 'date' && <DateStep value={draft.eventDate} onChange={(eventDate) => dispatch({ type: 'select.date', eventDate })} />}
        {draft.step === 'area' && <AreaStep parcel={selectedParcel} geometry={draft.geometry} onSelect={(geometry) => dispatch({ type: 'select.area', geometry })} />}
        {draft.step === 'evidence' && (
          <EvidenceStep
            evidence={draft.evidence}
            fileInputKey={fileInputKey}
            onSelectFiles={(files) => void handleEvidenceSelect(files)}
            onRemove={removeEvidence}
          />
        )}
        {draft.step === 'review' && <ReviewStep draft={draft} parcels={parcels} language={language} />}
      </div>

      {submitError && (
        <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(submitError)}
        </div>
      )}

      {/* Footer navigation */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          onClick={() => dispatch({ type: 'back' })}
          disabled={stepIndex === 0 || submitting}
          className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t('backStep')}
        </button>
        {draft.step === 'review' ? (
          <button
            onClick={() => void handleSubmit()}
            disabled={!canAdvance || submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-emerald-700 hover:to-green-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {submitting ? t('submittingClaim') : t('submitClaim')}
          </button>
        ) : (
          <button
            onClick={() => dispatch({ type: 'next' })}
            disabled={!canAdvance}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-emerald-700 hover:to-green-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('continueStep')}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

function stepTitleKey(step: ClaimWizardStep): string {
  switch (step) {
    case 'parcel':
      return 'Parcel';
    case 'event':
      return 'Event';
    case 'date':
      return 'Date';
    case 'area':
      return 'Area';
    case 'evidence':
      return 'Evidence';
    case 'review':
      return 'Review';
    default:
      return 'Parcel';
  }
}

function stepLabelKey(step: ClaimWizardStep): string {
  switch (step) {
    case 'parcel':
      return 'stepParcel';
    case 'event':
      return 'stepEvent';
    case 'date':
      return 'stepDate';
    case 'area':
      return 'stepArea';
    case 'evidence':
      return 'stepEvidence';
    case 'review':
      return 'stepReview';
    default:
      return 'stepParcel';
  }
}

// ── Step: Parcel ────────────────────────────────────────────────────────────────────────

const ParcelStep = ({
  parcels,
  parcelsStatus,
  onRetry,
  selectedParcelId,
  onSelect,
}: {
  parcels: ParcelRecord[];
  parcelsStatus: 'loading' | 'ready' | 'error';
  onRetry: () => void;
  selectedParcelId: string | null;
  onSelect: (parcel: ParcelRecord) => void;
}) => {
  const { t } = useTranslation();
  if (parcelsStatus === 'loading') {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="text-sm">{t('loading')}</p>
      </div>
    );
  }
  if (parcelsStatus === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-red-700">{t('claimsLoadFailed')}</p>
        <button onClick={onRetry} className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          {t('retry')}
        </button>
      </div>
    );
  }
  if (parcels.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <MapPinned className="h-10 w-10 text-emerald-600" />
        <h3 className="text-base font-bold text-gray-900">{t('noParcelsTitle')}</h3>
        <p className="max-w-sm text-sm text-gray-600">{t('noParcelsBody')}</p>
      </div>
    );
  }
  return (
    <StepShell title={t('selectParcel')}>
      <ul className="space-y-2">
        {parcels.map((parcel) => {
          const active = parcel.parcelId === selectedParcelId;
          return (
            <li key={parcel.parcelId}>
              <button
                onClick={() => onSelect(parcel)}
                aria-pressed={active}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  active
                    ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100'
                    : 'border-gray-200 bg-white hover:border-emerald-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-gray-900">
                    {parcel.name || t('parcelNameLabel')}
                  </span>
                  <span className="whitespace-nowrap text-xs text-gray-500">
                    {t('parcelAreaAcresLabel', { acres: parcel.calculatedAreaAcres })}
                  </span>
                </div>
                {parcel.crop && <div className="mt-0.5 text-xs text-gray-500">{parcel.crop}</div>}
              </button>
            </li>
          );
        })}
      </ul>
    </StepShell>
  );
};

// ── Step: Event ─────────────────────────────────────────────────────────────────────────

const EventStep = ({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (eventType: LossEventType) => void;
}) => {
  const { t } = useTranslation();
  return (
    <StepShell title={t('selectEvent')}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CLAIM_EVENT_TYPES.map((eventType) => {
          const active = selected === eventType;
          return (
            <button
              key={eventType}
              onClick={() => onSelect(eventType)}
              aria-pressed={active}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                active
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-100'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300'
              }`}
            >
              {t(claimEventLabelKey(eventType))}
            </button>
          );
        })}
      </div>
    </StepShell>
  );
};

// ── Step: Date ──────────────────────────────────────────────────────────────────────────

const DateStep = ({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string) => void;
}) => {
  const { t } = useTranslation();
  const maxDate = new Date().toISOString().slice(0, 10);
  const check = validateClaimDate(value);
  return (
    <StepShell title={t('selectDate')}>
      <input
        type="date"
        value={value ?? ''}
        max={maxDate}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 p-3 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
      />
      <p className="mt-2 text-xs text-gray-500">{t('dateHint')}</p>
      {value && !check.ok && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {check.reason === 'future' ? t('dateInvalidFuture') : t('dateInvalidWindow')}
        </p>
      )}
    </StepShell>
  );
};

// ── Step: Affected area (honest boundary — map drawing is deferred, ADR-019 P8) ────────

const AreaStep = ({
  parcel,
  geometry,
  onSelect,
}: {
  parcel: ParcelRecord | null;
  geometry: unknown;
  onSelect: (geometry: ParcelRecord['geometry']) => void;
}) => {
  const { t } = useTranslation();
  if (!parcel) {
    return <StepShell title={t('selectArea')}><p className="text-sm text-gray-600">{t('reviewReason_no_parcel')}</p></StepShell>;
  }
  const selected = geometry != null;
  return (
    <StepShell title={t('selectArea')}>
      <button
        onClick={() => onSelect(parcel.geometry)}
        aria-pressed={selected}
        className={`w-full rounded-xl border p-4 text-left transition ${
          selected ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100' : 'border-gray-200 bg-white hover:border-emerald-300'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-gray-900">
            {t('areaEntireParcel', { acres: parcel.calculatedAreaAcres })}
          </span>
          {selected && <Check className="h-5 w-5 text-emerald-600" />}
        </div>
        <p className="mt-1 text-xs text-gray-500">{t('areaEntireParcelDesc')}</p>
      </button>
      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {t('areaDeferredNote')}
      </p>
    </StepShell>
  );
};

// ── Step: Evidence (staged client-side; uploaded after the claim is created) ────────────

const EvidenceStep = ({
  evidence,
  fileInputKey,
  onSelectFiles,
  onRemove,
}: {
  evidence: StagedEvidence[];
  fileInputKey: number;
  onSelectFiles: (files: FileList | null) => void;
  onRemove: (key: string) => void;
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <StepShell title={t('selectEvidence')}>
      <p className="mb-3 text-xs text-gray-500">{t('evidenceStepHint', { max: 10 })}</p>
      <input
        key={fileInputKey}
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => onSelectFiles(event.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-emerald-400 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
      >
        <Plus className="h-4 w-4" />
        {t('addPhoto')}
      </button>
      {evidence.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">{t('noEvidenceText')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {evidence.map((entry) => (
            <li key={entry.key} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-800">{t('photoAdded', { name: entry.name })}</div>
                <div className="text-xs text-gray-500">
                  {entry.status === 'uploaded'
                    ? t('evidenceStatus_stored')
                    : entry.status === 'failed'
                      ? entry.errorKey
                        ? t(entry.errorKey)
                        : t('photoUploadFailed')
                      : entry.status === 'uploading'
                        ? t('photoUploading')
                        : entry.detectedType ? `${entry.detectedType.toUpperCase()} · ${formatSize(entry.size)}` : formatSize(entry.size)}
                </div>
              </div>
              {entry.status === 'uploading' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
              ) : (
                <button onClick={() => onRemove(entry.key)} aria-label={t('removeImage')} className="shrink-0 rounded-full p-1 text-gray-500 hover:bg-gray-100">
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </StepShell>
  );
};

const formatSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

// ── Step: Review ────────────────────────────────────────────────────────────────────────

const ReviewStep = ({
  draft,
  parcels,
  language,
}: {
  draft: ClaimDraft;
  parcels: ParcelRecord[];
  language: string;
}) => {
  const { t } = useTranslation();
  const summary = buildReviewSummary(draft, parcels);
  const stateKey = summary.ok ? 'ready' : `reviewReason_${summary.reason}`;
  return (
    <StepShell title={t('reviewTitle')}>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">{t('reviewParcel')}</dt>
          <dd className="text-right font-semibold text-gray-900">{summary.parcelName ?? t('parcelNameLabel')}</dd>
        </div>
        {summary.crop && (
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{t('parcelCropLabel')}</dt>
            <dd className="text-right font-semibold text-gray-900">{summary.crop}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">{t('reviewArea')}</dt>
          <dd className="text-right font-semibold text-gray-900">
            {summary.parcelAreaAcres !== null ? t('parcelAreaAcresLabel', { acres: summary.parcelAreaAcres }) : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">{t('reviewEvent')}</dt>
          <dd className="text-right font-semibold text-gray-900">
            {summary.eventType ? t(claimEventLabelKey(summary.eventType)) : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">{t('reviewDate')}</dt>
          <dd className="text-right font-semibold text-gray-900">
            {summary.eventDate ? formatClaimDate(summary.eventDate, language) : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">{t('reviewEvidence')}</dt>
          <dd className="text-right font-semibold text-gray-900">{summary.stagedEvidenceCount}</dd>
        </div>
      </dl>
      <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
        <span className={`text-sm font-medium ${summary.ok ? 'text-emerald-700' : 'text-red-600'}`}>
          {summary.ok ? t('reviewReady') : t(stateKey)}
        </span>
      </div>
    </StepShell>
  );
};

// ── Shared shell ────────────────────────────────────────────────────────────────────────

const StepShell = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
    {children}
  </div>
);

export default ClaimWizard;