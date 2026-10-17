import { useCallback, useEffect, useReducer, useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, Loader2, Map as MapIcon, MapPinned, Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { validateImageFile } from '../utils/imageValidation';
import { useClaimsViewport } from '../utils/claimResponsive';
import { hasUsableGeometry } from '../utils/parcelGeometry';
import { Alert, Button, ConfirmDialog, Stepper, cn } from './ui';
import { EventStep } from './claims/wizard/EventStep';
import { EvidenceStep, type InlineMessage } from './claims/wizard/EvidenceStep';
import { ReviewStep } from './claims/wizard/ReviewStep';
import { StepShell } from './claims/wizard/StepShell';
import { SubmissionStatus } from './claims/wizard/SubmissionStatus';
import {
  CLAIMANT_RELATIONSHIPS,
  CLAIM_DOCUMENT_MAX,
  CLAIM_EVIDENCE_MAX,
  CLAIM_WIZARD_STEPS,
  buildReviewSummary,
  canGotoStep,
  claimantRelationshipLabelKey,
  createEmptyDraft,
  defaultDocumentCategory,
  eventStepMissing,
  evidenceStepMissing,
  newStagedKey,
  stepCanAdvance,
  wizardReducer,
  type ClaimWizardStep,
  type StagedDocument,
  type StagedImageType,
} from '../utils/claimFlow';
import {
  errorStatus,
  retrySubmissionItem,
  runClaimSubmission,
  type SubmissionDeps,
  type SubmissionFailure,
  type SubmissionPhase,
} from '../utils/claimSubmission';
import {
  CLAIM_DRAFT_SAVE_DEBOUNCE_MS,
  clearClaimDraft,
  isDraftWorthSaving,
  loadClaimDraft,
  readStoredDraftOwner,
  saveClaimDraft,
} from '../utils/claimDraftStorage';
import type {
  ClaimantRelationship,
  ClaimCreateInput,
  ClaimEvidenceEntry,
  LossClaim,
  OwnershipDocumentCategory,
  OwnershipEvidence,
  ParcelRecord,
  UploadResult,
} from '../types';

// Five-step claim wizard (plan B3): Parcel → Your land → Event → Evidence → Review.
//
// Submit runs the orchestrator in utils/claimSubmission.ts (create → photos → documents → submit).
// On success the draft is cleared and `onDone` opens the claim's page; on failure the wizard stays
// on screen with a focused alert, Retry (finished items are skipped) and, once the claim exists,
// "Open saved claim". It never navigates away on failure. The draft is kept per user in
// sessionStorage (utils/claimDraftStorage.ts) so a reload or a trip to the claims list loses only
// the files, which the farmer is asked to choose again.

export interface ClaimWizardProps {
  parcels: ParcelRecord[];
  parcelsStatus: 'loading' | 'ready' | 'error';
  onRetryParcels: () => void;
  onCreateClaim: (input: ClaimCreateInput) => Promise<LossClaim>;
  onUploadEvidence: (claimId: string, file: File) => Promise<ClaimEvidenceEntry>;
  // Moves the draft to `submitted`. Called only after create + evidence so the lifecycle ends in
  // a state the backend can actually verify. `requestId` is sent as x-request-id
  // (fe_<idempotencyKey>_s<attempt>) so a browser attempt can be matched to the backend's jobs.
  onSubmitClaim: (claimId: string, options?: { requestId?: string }) => Promise<LossClaim>;
  /** Land document bytes: /upload presign → PUT → complete (api.ts uploadImage). */
  onUploadDocumentFile?: (file: File) => Promise<UploadResult>;
  onAttachDocument?: (
    claimId: string,
    input: { uploadId: string; documentCategory?: OwnershipDocumentCategory }
  ) => Promise<OwnershipEvidence>;
  /** Deletes a photo already stored on the saved claim (DELETE /claims/:id/evidence/:evidenceId). */
  onDeleteEvidence?: (claimId: string, evidenceId: string) => Promise<unknown>;
  onDone: (claim: LossClaim) => void;
  /** Opens a claim that was saved but not submitted (offered after a failed submission). */
  onOpenClaim?: (claimId: string) => void;
  onCancel: () => void;
  onManageFarm?: () => void;
  onAddFirstParcel?: () => void;
  /** Draft owner (cognitoSub || email). Defaults to the signed-in user in the auth session. */
  draftOwner?: string | null;
}

type ShownFailure = SubmissionFailure & { seq: number };

type PendingConfirm = { kind: 'startOver' } | { kind: 'removeUploadedPhoto'; key: string } | null;

const createPreviewUrl = (file: File): string | undefined => {
  try {
    return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(file)
      : undefined;
  } catch {
    return undefined;
  }
};

const revokePreviewUrl = (url: string): void => {
  try {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
  } catch {
    // nothing to release
  }
};

export const ClaimWizard = ({
  parcels,
  parcelsStatus,
  onRetryParcels,
  onCreateClaim,
  onUploadEvidence,
  onSubmitClaim,
  onUploadDocumentFile,
  onAttachDocument,
  onDeleteEvidence,
  onDone,
  onOpenClaim,
  onCancel,
  onManageFarm,
  onAddFirstParcel,
  draftOwner,
}: ClaimWizardProps) => {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'ta' ? 'ta' : 'en';
  const viewport = useClaimsViewport();

  // ── Draft (restored once, on mount) ────────────────────────────────────────────────────
  const [owner] = useState<string | null>(() =>
    draftOwner !== undefined ? draftOwner : readStoredDraftOwner()
  );
  const [restored] = useState(() => loadClaimDraft(owner));
  const [draft, dispatch] = useReducer(wizardReducer, restored, (saved) => saved?.draft ?? createEmptyDraft());
  const [restoreNotice, setRestoreNotice] = useState(() =>
    restored ? { missingCount: restored.missingCount, dateInvalid: restored.dateInvalid } : null
  );
  // Latest draft for code that runs after an await (a render-time `draft` would be stale there).
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // ── Files and thumbnails (never part of the draft: a File cannot be stored) ─────────────
  const filesRef = useRef<Record<string, File>>({});
  const previewsRef = useRef<Record<string, string>>({});
  const [, setPreviewVersion] = useState(0);

  const releasePreview = useCallback((key: string) => {
    const url = previewsRef.current[key];
    if (url) {
      revokePreviewUrl(url);
      delete previewsRef.current[key];
    }
  }, []);

  const stageFile = (key: string, file: File, withPreview: boolean) => {
    filesRef.current[key] = file;
    if (withPreview) {
      releasePreview(key);
      const url = createPreviewUrl(file);
      if (url) previewsRef.current[key] = url;
      setPreviewVersion((v) => v + 1);
    }
  };

  const forgetFile = (key: string) => {
    delete filesRef.current[key];
    releasePreview(key);
  };

  const previewUrlFor = (key: string): string | undefined => previewsRef.current[key];

  useEffect(() => {
    const previews = previewsRef.current; // the same object for the wizard's lifetime
    return () => {
      Object.values(previews).forEach(revokePreviewUrl);
    };
  }, []);

  // ── Persistence: debounced save, flushed on unmount; never after success or discard ──────
  const closedRef = useRef(false);
  useEffect(() => {
    if (!owner || closedRef.current) return undefined;
    const timer = setTimeout(() => {
      if (closedRef.current) return;
      if (isDraftWorthSaving(draft)) saveClaimDraft(owner, draft);
      else clearClaimDraft(owner);
    }, CLAIM_DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, owner]);

  useEffect(() => {
    const latest = draftRef;
    const closed = closedRef;
    return () => {
      if (!owner || closed.current) return;
      if (isDraftWorthSaving(latest.current)) saveClaimDraft(owner, latest.current);
    };
  }, [owner]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Focus follows the step: move it to the new step's heading ───────────────────────────
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStepRef = useRef<ClaimWizardStep>(draft.step);
  useEffect(() => {
    if (shownStepRef.current === draft.step) return;
    shownStepRef.current = draft.step;
    headingRef.current?.focus();
  }, [draft.step]);

  // Auto-select single parcel and advance to the next step. Only a parcel that actually has a
  // usable boundary is auto-selected, so a lone legacy parcel routes the farmer to draw one
  // instead of silently claiming a missing geometry.
  useEffect(() => {
    if (parcelsStatus !== 'ready' || draft.step !== 'parcel' || draft.parcelId) return;
    const claimable = parcels.filter(hasUsableGeometry);
    if (claimable.length === 1) {
      const singleParcel = claimable[0];
      dispatch({ type: 'select.parcel', parcelId: singleParcel.parcelId, geometry: singleParcel.geometry });
      dispatch({ type: 'next' });
    }
  }, [parcels, parcelsStatus, draft.step, draft.parcelId]);

  // ── Submission state ─────────────────────────────────────────────────────────────────────
  // The lock is a ref, set synchronously before the first await: a double click (or Enter twice)
  // lands before React re-renders the disabled button, and must still start only ONE create.
  const submitLockRef = useRef(false);
  const submitAttemptsRef = useRef(0);
  const failureSeqRef = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const [itemBusy, setItemBusy] = useState(false);
  const [phase, setPhase] = useState<SubmissionPhase | null>(null);
  const [failure, setFailure] = useState<ShownFailure | null>(null);
  const [photoMessages, setPhotoMessages] = useState<InlineMessage[]>([]);
  const [documentMessages, setDocumentMessages] = useState<InlineMessage[]>([]);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const deps: SubmissionDeps = {
    createClaim: onCreateClaim,
    uploadPhoto: onUploadEvidence,
    uploadDocumentFile: onUploadDocumentFile,
    attachDocument: onAttachDocument,
    submitClaim: (claimId, options) => onSubmitClaim(claimId, options),
  };
  const getFile = (key: string): File | undefined => filesRef.current[key];

  // A photo/document failure that the farmer has since fixed (retried or removed) no longer needs
  // the banner; the next Submit re-checks everything anyway.
  useEffect(() => {
    if (!failure || submitting || (failure.phase !== 'photos' && failure.phase !== 'documents')) return;
    const stillFailing =
      draft.evidence.some((e) => e.status === 'failed') || draft.documents.some((d) => d.status === 'failed');
    if (!stillFailing) setFailure(null);
  }, [draft, failure, submitting]);

  const showFailure = (result: SubmissionFailure) => {
    failureSeqRef.current += 1;
    setFailure({ ...result, seq: failureSeqRef.current });
  };

  const handleSubmit = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    try {
      const snapshot = draftRef.current;
      if (!buildReviewSummary(snapshot, parcels).ok) return;
      setSubmitting(true);
      setFailure(null);
      const result = await runClaimSubmission({
        draft: snapshot,
        getFile,
        deps,
        dispatch,
        onPhase: (next) => {
          if (mountedRef.current) setPhase(next);
        },
        previousSubmitAttempts: submitAttemptsRef.current,
      });
      submitAttemptsRef.current += result.submitAttempts;
      if (result.ok) {
        closedRef.current = true;
        clearClaimDraft(owner);
        toast.success(t('claimSubmittedToast'), { duration: 3000 });
        // Left the wizard while it was submitting: the toast says it worked, but do not yank the
        // farmer back to the claim from wherever they went.
        if (mountedRef.current) onDone(result.claim);
        return;
      }
      if (mountedRef.current) showFailure(result);
    } catch {
      // runClaimSubmission reports failures as results; this only guards a programming error.
      if (mountedRef.current) {
        showFailure({
          ok: false,
          phase: 'submit',
          claimId: draftRef.current.claimId,
          status: -1,
          errorKey: 'submitError_generic',
          failedKeys: [],
          submitAttempts: 0,
        });
      }
    } finally {
      submitLockRef.current = false;
      if (mountedRef.current) {
        setSubmitting(false);
        setPhase(null);
      }
    }
  };

  // Per-item Retry on the Evidence step (only once the claim exists). Shares the submit lock.
  const handleRetryItem = async (kind: 'photo' | 'document', key: string) => {
    if (submitLockRef.current || !draftRef.current.claimId) return;
    submitLockRef.current = true;
    setItemBusy(true);
    try {
      await retrySubmissionItem({ draft: draftRef.current, getFile, deps, dispatch, kind, key });
    } finally {
      submitLockRef.current = false;
      if (mountedRef.current) setItemBusy(false);
    }
  };

  // ── Staging files ───────────────────────────────────────────────────────────────────────
  const validateFiles = async (files: File[]) => {
    const accepted: { file: File; type: StagedImageType }[] = [];
    const rejected: InlineMessage[] = [];
    for (const file of files) {
      try {
        const { type } = await validateImageFile(file);
        accepted.push({ file, type });
      } catch (err) {
        rejected.push({ key: 'wizardFileRejected', name: file.name, reasonKey: (err as { key?: string })?.key ?? 'unsupportedImage' });
      }
    }
    return { accepted, rejected };
  };

  const handleAddPhotos = async (files: File[]) => {
    if (files.length === 0) return;
    const { accepted, rejected } = await validateFiles(files);
    // Count against the CURRENT draft, read after the awaits. The old check used the render-time
    // draft, so a whole batch slipped past the limit.
    const slots = Math.max(0, CLAIM_EVIDENCE_MAX - draftRef.current.evidence.length);
    accepted.slice(0, slots).forEach(({ file, type }) => {
      const key = newStagedKey('photo');
      stageFile(key, file, true);
      dispatch({ type: 'evidence.add', entry: { key, name: file.name, size: file.size, detectedType: type } });
    });
    const messages = [...rejected];
    if (accepted.length > slots) messages.push({ key: 'wizardPhotoLimitSkipped', max: CLAIM_EVIDENCE_MAX });
    setPhotoMessages(messages);
  };

  const handleReplacePhoto = async (key: string, file: File) => {
    const { accepted, rejected } = await validateFiles([file]);
    setPhotoMessages(rejected);
    if (accepted.length === 0) return;
    stageFile(key, accepted[0].file, true);
    dispatch({ type: 'evidence.relink', key, name: file.name, size: file.size, detectedType: accepted[0].type });
  };

  const handleRemovePhoto = (key: string) => {
    const current = draftRef.current;
    const entry = current.evidence.find((e) => e.key === key);
    if (!entry) return;
    // Already stored on the saved claim: removing it is a real delete, so ask first.
    if (entry.status === 'uploaded' && current.claimId) {
      setConfirm({ kind: 'removeUploadedPhoto', key });
      return;
    }
    forgetFile(key);
    dispatch({ type: 'evidence.remove', key });
  };

  const removeUploadedPhoto = async (key: string) => {
    if (submitLockRef.current) return;
    const { claimId, evidence } = draftRef.current;
    const entry = evidence.find((e) => e.key === key);
    if (!claimId || !entry?.uploadId || !onDeleteEvidence) {
      setConfirm(null);
      setPhotoMessages([{ key: 'wizardRemoveFailed', name: entry?.name }]);
      return;
    }
    submitLockRef.current = true;
    setConfirmBusy(true);
    try {
      await onDeleteEvidence(claimId, entry.uploadId);
      forgetFile(key);
      dispatch({ type: 'evidence.remove', key });
      setPhotoMessages([]);
    } catch (err) {
      if (errorStatus(err) !== 401) setPhotoMessages([{ key: 'wizardRemoveFailed', name: entry.name }]);
    } finally {
      submitLockRef.current = false;
      if (mountedRef.current) {
        setConfirmBusy(false);
        setConfirm(null);
      }
    }
  };

  const handleAddDocuments = async (files: File[]) => {
    if (files.length === 0) return;
    const { accepted, rejected } = await validateFiles(files);
    // A PDF (or anything that is not an image) gets the documents-specific "images only" reason.
    const messages: InlineMessage[] = rejected.map((m) =>
      m.reasonKey === 'unsupportedImage' ? { ...m, reasonKey: 'ownershipImagesOnly' } : m
    );
    const current = draftRef.current;
    const slots = Math.max(0, CLAIM_DOCUMENT_MAX - current.documents.length);
    let staged: StagedDocument[] = current.documents;
    accepted.slice(0, slots).forEach(({ file, type }) => {
      const key = newStagedKey('document');
      // Each new document defaults to the first group the relationship still needs.
      const category = defaultDocumentCategory(current.claimantRelationship, staged);
      const entry = { key, name: file.name, size: file.size, detectedType: type, category };
      staged = [...staged, { ...entry, status: 'staged' }];
      stageFile(key, file, false);
      dispatch({ type: 'document.add', entry });
    });
    if (accepted.length > slots) messages.push({ key: 'wizardDocumentLimitSkipped', max: CLAIM_DOCUMENT_MAX });
    setDocumentMessages(messages);
  };

  const handleReplaceDocument = async (key: string, file: File) => {
    const { accepted, rejected } = await validateFiles([file]);
    setDocumentMessages(
      rejected.map((m) => (m.reasonKey === 'unsupportedImage' ? { ...m, reasonKey: 'ownershipImagesOnly' } : m))
    );
    if (accepted.length === 0) return;
    stageFile(key, accepted[0].file, false);
    dispatch({ type: 'document.relink', key, name: file.name, size: file.size, detectedType: accepted[0].type });
  };

  const handleRemoveDocument = (key: string) => {
    const doc = draftRef.current.documents.find((d) => d.key === key);
    if (!doc || doc.status === 'attached' || doc.status === 'attaching') return;
    forgetFile(key);
    dispatch({ type: 'document.remove', key });
  };

  // ── Leaving / starting over ─────────────────────────────────────────────────────────────
  const startOver = () => {
    clearClaimDraft(owner);
    Object.keys(filesRef.current).forEach(forgetFile);
    submitAttemptsRef.current = 0;
    dispatch({ type: 'reset' });
    setRestoreNotice(null);
    setFailure(null);
    setPhotoMessages([]);
    setDocumentMessages([]);
    setConfirm(null);
  };

  const openSavedClaim = () => {
    const { claimId } = draftRef.current;
    if (!claimId || !onOpenClaim) return;
    // The claim lives on the server now and its page offers Submit for a draft; files left here
    // could not survive the navigation anyway.
    closedRef.current = true;
    clearClaimDraft(owner);
    onOpenClaim(claimId);
  };

  // ── Render ──────────────────────────────────────────────────────────────────────────────
  const stepIndex = CLAIM_WIZARD_STEPS.indexOf(draft.step);
  const canAdvance = stepCanAdvance(draft);
  const selectedParcel = parcels.find((p) => p.parcelId === draft.parcelId) ?? null;
  const summary = buildReviewSummary(draft, parcels);
  const locked = draft.claimId !== null;
  const busy = submitting || itemBusy || confirmBusy;

  return (
    <div className="mx-auto w-full max-w-2xl px-3 sm:px-4" data-testid="claim-wizard" data-step={draft.step}>
      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <Button variant="secondary" size="icon" onClick={onCancel} aria-label={t('backToClaims')} disabled={submitting}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-ink sm:text-xl">{t('claimWizardTitle')}</h2>
          <p className="text-xs text-ink-muted">
            {t('stepXOfY', { current: stepIndex + 1, total: CLAIM_WIZARD_STEPS.length })}
            {viewport.stepIndicator === 'count' && ` · ${t(stepLabelKey(draft.step))}`}
          </p>
        </div>
      </div>

      {/* Step rail (only when it fits — compact screens get the counter above) */}
      {viewport.stepIndicator === 'rail' && (
        <Stepper
          orientation="horizontal"
          aria-label={t('wizardStepsLabel')}
          className="mb-4"
          items={CLAIM_WIZARD_STEPS.map((step, index) => ({
            id: step,
            label: t(stepLabelKey(step)),
            status: index < stepIndex ? 'complete' : index === stepIndex ? 'current' : 'upcoming',
          }))}
        />
      )}

      {restoreNotice && (
        <Alert
          tone="info"
          className="mb-3"
          data-testid="wizard-draft-restored"
          title={t('wizardDraftRestoredTitle')}
          actions={
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={() => setConfirm({ kind: 'startOver' })}
              disabled={busy}
            >
              {t('wizardStartOver')}
            </Button>
          }
        >
          <p>{t('wizardDraftRestoredBody')}</p>
          {restoreNotice.missingCount > 0 && <p className="mt-1">{t('wizardDraftRestoredMissing')}</p>}
          {restoreNotice.dateInvalid && <p className="mt-1">{t('wizardDraftRestoredDate')}</p>}
        </Alert>
      )}

      <div className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
        {draft.step === 'parcel' && (
          <ParcelStep
            parcels={parcels}
            parcelsStatus={parcelsStatus}
            onRetry={onRetryParcels}
            selectedParcelId={draft.parcelId}
            locked={locked}
            headingRef={headingRef}
            onSelect={(p) => dispatch({ type: 'select.parcel', parcelId: p.parcelId, geometry: p.geometry })}
            onManageFarm={onManageFarm}
            onAddFirstParcel={onAddFirstParcel}
          />
        )}
        {draft.step === 'relationship' && (
          <RelationshipStep
            selected={draft.claimantRelationship}
            locked={locked}
            headingRef={headingRef}
            onSelect={(relationship) => dispatch({ type: 'select.relationship', relationship })}
          />
        )}
        {draft.step === 'event' && (
          <EventStep
            parcel={selectedParcel}
            eventType={draft.eventType}
            eventDate={draft.eventDate}
            geometry={draft.geometry}
            missing={eventStepMissing(draft)}
            locked={locked}
            headingRef={headingRef}
            onSelectEvent={(eventType) => dispatch({ type: 'select.event', eventType })}
            onSelectDate={(eventDate) => dispatch({ type: 'select.date', eventDate })}
            onSelectArea={(geometry) => dispatch({ type: 'select.area', geometry })}
          />
        )}
        {draft.step === 'evidence' && (
          <EvidenceStep
            evidence={draft.evidence}
            documents={draft.documents}
            relationship={draft.claimantRelationship}
            claimSaved={locked}
            busy={busy}
            missing={evidenceStepMissing(draft)}
            photoMessages={photoMessages}
            documentMessages={documentMessages}
            previewUrlFor={previewUrlFor}
            headingRef={headingRef}
            onAddPhotos={(files) => void handleAddPhotos(files)}
            onRemovePhoto={handleRemovePhoto}
            onRetryPhoto={(key) => void handleRetryItem('photo', key)}
            onReplacePhoto={(key, file) => void handleReplacePhoto(key, file)}
            onAddDocuments={(files) => void handleAddDocuments(files)}
            onRemoveDocument={handleRemoveDocument}
            onRetryDocument={(key) => void handleRetryItem('document', key)}
            onReplaceDocument={(key, file) => void handleReplaceDocument(key, file)}
            onDocumentCategory={(key, category) => dispatch({ type: 'document.category', key, category })}
          />
        )}
        {draft.step === 'review' && (
          <ReviewStep
            summary={summary}
            language={language}
            locked={locked}
            canEdit={(step) => !busy && canGotoStep(draft, step)}
            onEdit={(step) => dispatch({ type: 'goto', step })}
            previewUrlFor={previewUrlFor}
            headingRef={headingRef}
          />
        )}
      </div>

      {submitting && phase && (
        <SubmissionStatus phase={phase} evidence={draft.evidence} documents={draft.documents} />
      )}

      {failure && !submitting && (
        <Alert
          key={failure.seq}
          tone="danger"
          focusOnMount
          className="mt-3"
          data-testid="wizard-submit-error"
          title={t(`submitErrorTitle_${failure.phase}`)}
          actions={
            <>
              <Button
                size="sm"
                leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => void handleSubmit()}
                disabled={busy || !summary.ok}
              >
                {t('retry')}
              </Button>
              {draft.claimId && onOpenClaim && (
                <Button size="sm" variant="secondary" onClick={openSavedClaim} disabled={busy}>
                  {t('wizardOpenSavedClaim')}
                </Button>
              )}
            </>
          }
        >
          {t(failure.errorKey)}
        </Alert>
      )}

      {/* Footer navigation: pinned to the bottom of the screen on phones, inline from sm up. */}
      <div
        data-testid="wizard-footer"
        className="sticky bottom-0 z-10 -mx-3 mt-4 flex items-center justify-between gap-3 border-t border-surface-border bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-8 sm:pt-0 sm:backdrop-blur-none"
      >
        <Button variant="secondary" onClick={() => dispatch({ type: 'back' })} disabled={stepIndex === 0 || busy}>
          {t('backStep')}
        </Button>
        {draft.step === 'review' ? (
          <Button
            onClick={() => void handleSubmit()}
            disabled={!summary.ok}
            loading={submitting}
            leadingIcon={<Check className="h-4 w-4" />}
          >
            {submitting ? t('submittingClaim') : t('submitClaim')}
          </Button>
        ) : (
          <Button onClick={() => dispatch({ type: 'next' })} disabled={!canAdvance || busy}>
            {t('continueStep')}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirm?.kind === 'startOver'}
        tone="danger"
        title={t('wizardStartOverTitle')}
        body={
          <>
            <p>{t('wizardStartOverBody')}</p>
            {draft.claimId && <p className="mt-1">{t('wizardStartOverSavedNote')}</p>}
          </>
        }
        confirmLabel={t('wizardStartOverConfirm')}
        onConfirm={startOver}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'removeUploadedPhoto'}
        tone="danger"
        busy={confirmBusy}
        title={t('wizardRemoveUploadedTitle')}
        body={t('wizardRemoveUploadedBody')}
        confirmLabel={t('evidenceDelete')}
        onConfirm={() => {
          if (confirm?.kind === 'removeUploadedPhoto') void removeUploadedPhoto(confirm.key);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

function stepLabelKey(step: ClaimWizardStep): string {
  switch (step) {
    case 'parcel':
      return 'stepParcel';
    case 'relationship':
      return 'stepRelationship';
    case 'event':
      return 'stepEvent';
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
  locked,
  headingRef,
  onSelect,
  onManageFarm,
  onAddFirstParcel,
}: {
  parcels: ParcelRecord[];
  parcelsStatus: 'loading' | 'ready' | 'error';
  onRetry: () => void;
  selectedParcelId: string | null;
  locked: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  onSelect: (parcel: ParcelRecord) => void;
  onManageFarm?: () => void;
  onAddFirstParcel?: () => void;
}) => {
  const { t } = useTranslation();
  // Only parcels with a real, well-formed boundary can back a claim.
  const claimableParcels = parcels.filter(hasUsableGeometry);
  if (parcelsStatus === 'loading') {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-ink-muted" aria-busy="true">
        <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-brand-700" />
        <p className="text-sm">{t('loading')}</p>
      </div>
    );
  }
  if (parcelsStatus === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-danger-fg">{t('claimsLoadFailed')}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('retry')}
        </Button>
      </div>
    );
  }
  if (parcels.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <MapPinned aria-hidden="true" className="h-12 w-12 text-brand-700" />
        <h3 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-ink outline-none">
          {t('noParcelsTitle')}
        </h3>
        <p className="max-w-sm text-sm text-ink-muted">{t('noParcelsBody')}</p>
        <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
          <Button variant="secondary" className="flex-1" leadingIcon={<MapIcon className="h-4 w-4" />} onClick={onManageFarm}>
            {t('manageFarmCta')}
          </Button>
          <Button className="flex-1" leadingIcon={<Plus className="h-4 w-4" />} onClick={onAddFirstParcel}>
            {t('addFirstParcelCta')}
          </Button>
        </div>
      </div>
    );
  }
  // Every parcel exists but none carries a usable boundary, so none can be claimed yet. Never
  // substitute a fabricated polygon — send the farmer to draw one.
  if (claimableParcels.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <MapPinned aria-hidden="true" className="h-12 w-12 text-warning-solid" />
        <h3 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-ink outline-none">
          {t('noClaimableParcelsTitle')}
        </h3>
        <p className="max-w-sm text-sm text-ink-muted">{t('noClaimableParcelsBody')}</p>
        <Button leadingIcon={<MapIcon className="h-4 w-4" />} onClick={onManageFarm}>
          {t('manageFarmCta')}
        </Button>
      </div>
    );
  }
  return (
    <StepShell title={t('selectParcel')} headingRef={headingRef}>
      {locked && (
        <Alert tone="info" className="mb-3">
          {t('wizardLockedNote')}
        </Alert>
      )}
      <ul className="space-y-2">
        {parcels.map((parcel) => {
          const active = parcel.parcelId === selectedParcelId;
          const usable = hasUsableGeometry(parcel);
          return (
            <li key={parcel.parcelId}>
              <button
                type="button"
                onClick={() => usable && onSelect(parcel)}
                disabled={!usable || locked}
                aria-pressed={active}
                aria-disabled={!usable || locked}
                className={cn(
                  'w-full rounded-control border p-3 text-left transition',
                  !usable
                    ? 'cursor-not-allowed border-warning-border bg-warning-bg opacity-80'
                    : active
                      ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100'
                      : 'border-surface-border bg-white hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-60'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-ink">
                    {parcel.name || t('parcelNameLabel')}
                  </span>
                  <span className="whitespace-nowrap text-xs text-ink-muted">
                    {t('parcelAreaAcresLabel', { acres: parcel.calculatedAreaAcres })}
                  </span>
                </div>
                {parcel.crop && <div className="mt-0.5 text-xs text-ink-muted">{parcel.crop}</div>}
                {!usable && (
                  <div className="mt-1 text-xs text-warning-fg">{t('parcelBoundaryMissingHint')}</div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </StepShell>
  );
};

// ── Step: Relationship to the land (optional) ───────────────────────────────────────────
// Sent as `claimantRelationship`; it decides which ownership documents the backend expects
// (a tenant needs a lease, not the owner's deed). Skipping is allowed — Continue stays enabled.

const RelationshipStep = ({
  selected,
  locked,
  headingRef,
  onSelect,
}: {
  selected: ClaimantRelationship | null;
  locked: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  onSelect: (relationship: ClaimantRelationship | null) => void;
}) => {
  const { t } = useTranslation();
  return (
    <StepShell title={t('selectRelationship')} headingRef={headingRef}>
      {locked && (
        <Alert tone="info" className="mb-3">
          {t('wizardLockedNote')}
        </Alert>
      )}
      <p className="mb-3 text-xs text-ink-muted">{t('relationshipStepHint')}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label={t('selectRelationship')}>
        {CLAIMANT_RELATIONSHIPS.map((relationship) => {
          const active = selected === relationship;
          return (
            <button
              key={relationship}
              type="button"
              // Tapping the selected answer again clears it (the question is optional).
              onClick={() => onSelect(active ? null : relationship)}
              aria-pressed={active}
              disabled={locked}
              className={cn(
                'min-h-11 rounded-control border px-3 py-2.5 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
                active
                  ? 'border-brand-600 bg-brand-50 text-brand-900 ring-2 ring-brand-100'
                  : 'border-surface-border bg-white text-ink-muted hover:border-brand-300'
              )}
            >
              {t(claimantRelationshipLabelKey(relationship))}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink-muted">{t('relationshipOptionalNote')}</p>
    </StepShell>
  );
};

export default ClaimWizard;
