// Pure claim-flow logic (Phase 7 — Farmer Claims Frontend). No React, no network, no identity.
//
// Every function here is deterministic and unit-testable in isolation. It mirrors the FROZEN
// backend contracts (08_API_Documentation item 10, ADR-019, claimState.service.js) — the
// client must NEVER re-derive authority: it only decides which honest UI affordances to show
// from the backend-declared claim state, and which client-side inputs make a submission valid
// enough to send. The claim wizard, status cards and detail view all consume this module.
//
//   - State gates reflect the backend state machine exactly (canWithdraw only draft|submitted,
//     resubmit only more_evidence_required, evidence mutation only draft|submitted|MER, etc.).
//   - The affected-area step NEVER fabricates geometry or acreage: it carries the farmer's real
//     selection forward — either the whole parcel boundary (explicitly chosen) or the polygon
//     they drew (ADR-019 P8). It NEVER silently substitutes the parcel for a missing/cleared
//     draw. The backend recomputes the authoritative area from whatever is stored.
//   - Claimed-area numbers shown BEFORE the claim exists are PREVIEW values (utils/
//     parcelGeometry.ts, the same advisory-only convention the draw map already uses) and are
//     labelled as such. Once a claim exists, every area number is the backend-returned value
//     (parcelSnapshot.parcelAreaAcres / claim.claimedAreaAcres), never client math.

import { previewAreaAcres } from './parcelGeometry';

import type {
  ClaimAssessment,
  ClaimEvidenceEntry,
  ClaimState,
  EvidencePresign,
  GeoJsonPolygon,
  LossClaim,
  LossEventType,
  ParcelRecord,
  VerificationDecision,
  VerificationRuleCheck,
  VerificationRules,
} from '../types';

// ── Frozen vocabulary mirrors (kept in sync with the backend by tests) ─────────────────

export const CLAIM_EVENT_TYPES: LossEventType[] = [
  'flood',
  'storm',
  'drought',
  'pest',
  'disease',
  'fire',
  'other',
];

export const CLAIM_EVENT_TYPE_SET: ReadonlySet<string> = new Set(CLAIM_EVENT_TYPES);

export const TERMINAL_CLAIM_STATES: ClaimState[] = [
  'verified',
  'partially_verified',
  'rejected',
  'out_of_limit',
  'duplicate_area',
  'withdrawn',
];

export const TERMINAL_CLAIM_STATE_SET: ReadonlySet<string> = new Set(TERMINAL_CLAIM_STATES);

// Client mirrors the backend env default (config/env.js: CLAIM_WINDOW_DAYS || 30) purely so
// the wizard can pre-reject clearly-out-of-window dates with a friendly note BEFORE submit;
// the backend remains the final authority and re-validates every request.
export const CLAIM_WINDOW_DAYS = 30;

// Claim evidence mutation states (services/claimEvidence.service.js EVIDENCE_MUTABLE_STATES).
export const EVIDENCE_MUTABLE_STATES: ClaimState[] = [
  'draft',
  'submitted',
  'more_evidence_required',
];

// idempotencyKey required length by createClaimBody (8–64 chars, [A-Za-z0-9_-]).
export const IDEMPOTENCY_MIN_LENGTH = 8;
export const IDEMPOTENCY_MAX_LENGTH = 64;

// ── State gates (must always match backend/claimState.service.js) ───────────────────────

export const isTerminalClaimState = (state: string): boolean =>
  TERMINAL_CLAIM_STATE_SET.has(state);

export const canMutateEvidence = (state: string): boolean => EVIDENCE_MUTABLE_STATES.includes(state as ClaimState);

// Withdraw is legal from draft and submitted only (state machine edge draft|submitted → withdrawn).
export const canWithdrawClaim = (state: string): boolean =>
  state === 'draft' || state === 'submitted';

// Resubmit is ONLY ever legal from more_evidence_required (machine edge MER → submitted).
export const canResubmitClaim = (state: string): boolean => state === 'more_evidence_required';

// Submit is ONLY ever legal from draft (machine edge draft → submitted). Exposed as a claim
// affordance so a claim that was created but never submitted (interrupted wizard, offline
// retry, evidence-upload failure) is recoverable from the detail view instead of being stranded
// in `draft` forever. The backend remains the authority and re-runs every submit-time check.
export const canSubmitClaim = (state: string): boolean => state === 'draft';

// The farmer may request backend verification while submitted, processing (running), or for a
// claim awaiting more evidence. Terminal states never re-run (backend idempotency).
export const canRequestVerification = (state: string): boolean =>
  state === 'submitted' || state === 'processing' || state === 'more_evidence_required';

// A verification RESULT is visible for every decided engine state (not for plain submitted
// claims that the farmer never verified).
export const showsVerificationResult = (state: string): boolean =>
  state !== 'draft' &&
  state !== 'submitted' &&
  state !== 'processing' &&
  state !== 'withdrawn';

// ── i18n key helpers (labels live in the translation layer, never hard-coded here) ──────

export const claimStateLabelKey = (state: string): string => `claimState_${state}`;

export const claimEventLabelKey = (eventType: string): string => `claimEvent_${eventType}`;

export const evidenceStatusLabelKey = (status: string): string => `evidenceStatus_${status}`;

// Renders a backend ISO timestamp in the current UI language (empty string when invalid).
export const formatClaimDate = (isoDate: string | null | undefined, language = 'en'): string => {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString(language === 'ta' ? 'ta-IN' : 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return date.toLocaleDateString();
  }
};

// ── Client-side validation helpers ──────────────────────────────────────────────────────

export type ClaimDateCheck =
  | { ok: true }
  | { ok: false; reason: 'required' | 'future' | 'window' };

// Mirrors the backend eventDateCheck (claim.service.js): not future + within CLAIM_WINDOW_DAYS.
// The backend is authoritative; this only gives the wizard honest early feedback.
export const validateClaimDate = (value: string | null | undefined): ClaimDateCheck => {
  if (!value) return { ok: false, reason: 'required' };
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return { ok: false, reason: 'required' };
  const now = Date.now();
  if (time > now) return { ok: false, reason: 'future' };
  const windowMs = CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (time < now - windowMs) return { ok: false, reason: 'window' };
  return { ok: true };
};

// Generates an owner-scoped idempotency key conforming to createClaimBody's charset/length so a
// dropped create response can never duplicate a claim. Persisted with the draft.
export const generateIdempotencyKey = (): string => {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
      ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')
      : Math.random().toString(16).slice(2, 14);
  return `clm_${Date.now().toString(36)}_${rand}`;
};

export const isValidIdempotencyKey = (key: string): boolean =>
  key.length >= IDEMPOTENCY_MIN_LENGTH &&
  key.length <= IDEMPOTENCY_MAX_LENGTH &&
  /^[A-Za-z0-9_-]+$/.test(key);

// ── Claim wizard (frozen journey: Parcel → Event → Date → Affected Area → Evidence → Review) ──
//
// The AI Verification and Result steps belong to the claim status view (ClaimStatusCard), not
// to the draft wizard: verification needs a real claim + stored evidence on the backend.

export type ClaimWizardStep =
  | 'parcel'
  | 'event'
  | 'date'
  | 'area'
  | 'evidence'
  | 'review';

export const CLAIM_WIZARD_STEPS: ClaimWizardStep[] = [
  'parcel',
  'event',
  'date',
  'area',
  'evidence',
  'review',
];

// Staged evidence: plain metadata for pure logic. The File object is carried by the UI
// alongside the key; uploads happen against the real claim after creation.
export interface StagedEvidence {
  key: string;
  name: string;
  size: number;
  detectedType: 'jpeg' | 'png' | 'webp' | null;
  status: 'staged' | 'uploading' | 'uploaded' | 'failed';
  uploadId?: string;
  errorKey?: string;
}

export interface ClaimDraft {
  step: ClaimWizardStep;
  parcelId: string | null;
  eventType: LossEventType | null;
  eventDate: string | null;
  geometry: GeoJsonPolygon | null;
  idempotencyKey: string | null;
  evidence: StagedEvidence[];
}

export const createEmptyDraft = (): ClaimDraft => ({
  step: 'parcel',
  parcelId: null,
  eventType: null,
  eventDate: null,
  geometry: null,
  idempotencyKey: generateIdempotencyKey(),
  evidence: [],
});

export const CLAIM_EVIDENCE_MAX = 10; // mirrors backend env default CLAIM_EVIDENCE_MAX_IMAGES

export const canStageEvidence = (draft: ClaimDraft): boolean =>
  draft.evidence.length < CLAIM_EVIDENCE_MAX;

export type StagedEvidenceEntry = Omit<StagedEvidence, 'status' | 'key'> & { key?: string };

export const addStagedEvidence = (
  draft: ClaimDraft,
  entry: StagedEvidenceEntry
): ClaimDraft => {
  if (!canStageEvidence(draft)) return draft;
  return {
    ...draft,
    evidence: [
      ...draft.evidence,
      // A caller-supplied key MUST be preserved: the wizard keys its `File` map by the same
      // value, and a regenerated key would leave the staged entry pointing at no file — the
      // upload loop would then silently skip it and no evidence would ever be sent.
      { ...entry, key: entry.key ?? cryptoRandomKey(), status: 'staged' },
    ],
  };
};

export const removeStagedEvidence = (draft: ClaimDraft, key: string): ClaimDraft => ({
  ...draft,
  evidence: draft.evidence.filter((e) => e.key !== key),
});

export const markStagedEvidenceUploaded = (
  draft: ClaimDraft,
  key: string,
  uploadId: string
): ClaimDraft => ({
  ...draft,
  evidence: draft.evidence.map((e) =>
    e.key === key ? { ...e, status: 'uploaded', uploadId } : e
  ),
});

export const markStagedEvidenceUploading = (draft: ClaimDraft, key: string): ClaimDraft => ({
  ...draft,
  evidence: draft.evidence.map((e) =>
    e.key === key ? { ...e, status: 'uploading' } : e
  ),
});

export const markStagedEvidenceFailed = (
  draft: ClaimDraft,
  key: string,
  errorKey: string
): ClaimDraft => ({
  ...draft,
  evidence: draft.evidence.map((e) =>
    e.key === key ? { ...e, status: 'failed', errorKey } : e
  ),
});

const cryptoRandomKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return `ev_${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return `ev_${Math.random().toString(16).slice(2, 14)}`;
};

// ── Wizard navigation (pure reducer) ────────────────────────────────────────────────────

export type WizardNavigation =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'select.parcel'; parcelId: string; geometry: GeoJsonPolygon }
  | { type: 'select.event'; eventType: LossEventType }
  | { type: 'select.date'; eventDate: string }
  // `null` means "no affected area selected". Clearing the drawing must clear the claim geometry,
  // never fall back to the parcel boundary.
  | { type: 'select.area'; geometry: GeoJsonPolygon | null }
  | { type: 'evidence.add'; entry: StagedEvidenceEntry }
  | { type: 'evidence.remove'; key: string }
  | { type: 'evidence.uploading'; key: string }
  | { type: 'evidence.uploaded'; key: string; uploadId: string }
  | { type: 'evidence.failed'; key: string; errorKey: string }
  | { type: 'reset' };

export const wizardReducer = (draft: ClaimDraft, action: WizardNavigation): ClaimDraft => {
  switch (action.type) {
    case 'reset':
      return createEmptyDraft();
    case 'select.parcel':
      return {
        ...draft,
        parcelId: action.parcelId,
        geometry: action.geometry,
      };
    case 'select.event':
      return {
        ...draft,
        eventType: CLAIM_EVENT_TYPE_SET.has(action.eventType) ? action.eventType : draft.eventType,
      };
    case 'select.date':
      return { ...draft, eventDate: action.eventDate };
    case 'select.area':
      return { ...draft, geometry: action.geometry };
    case 'evidence.add':
      return addStagedEvidence(draft, action.entry);
    case 'evidence.remove':
      return removeStagedEvidence(draft, action.key);
    case 'evidence.uploading':
      return markStagedEvidenceUploading(draft, action.key);
    case 'evidence.uploaded':
      return markStagedEvidenceUploaded(draft, action.key, action.uploadId);
    case 'evidence.failed':
      return markStagedEvidenceFailed(draft, action.key, action.errorKey);
    case 'next': {
      const index = CLAIM_WIZARD_STEPS.indexOf(draft.step);
      if (index === -1 || index >= CLAIM_WIZARD_STEPS.length - 1) return draft;
      return { ...draft, step: CLAIM_WIZARD_STEPS[index + 1] };
    }
    case 'back': {
      const index = CLAIM_WIZARD_STEPS.indexOf(draft.step);
      if (index <= 0) return draft;
      return { ...draft, step: CLAIM_WIZARD_STEPS[index - 1] };
    }
    default:
      return draft;
  }
};

// Latest step the farmer may continue to given the previous selections (gates the Continue
// button so unfinished steps cannot be skipped). Returns the step itself when requirements are
// met (undefined for 'parcel', which has no prerequisites).
export const stepCanAdvance = (draft: ClaimDraft): boolean => {
  switch (draft.step) {
    case 'parcel':
      return Boolean(draft.parcelId && draft.geometry);
    case 'event':
      return draft.eventType !== null;
    case 'date':
      return validateClaimDate(draft.eventDate).ok;
    case 'area':
      return draft.geometry !== null;
    case 'evidence':
      return true; // evidence is optional on submit; the review step re-checks everything
    case 'review':
      return true;
    default:
      return false;
  }
};

// ── Review summary (what the farmer confirms before submit) ─────────────────────────────

export interface ClaimReviewSummary {
  ok: boolean;
  reason:
    | 'no_parcels'
    | 'no_parcel'
    | 'no_event'
    | 'no_date'
    | 'invalid_date'
    | 'no_geometry'
    | 'ready';
  parcelName: string | null;
  crop: string | null;
  parcelAreaAcres: number | null;
  eventType: LossEventType | null;
  eventDate: string | null;
  claimedAreaAcres: number | null;
  // True when the farmer picked "entire parcel", false when they drew a partial affected area.
  // Drives the review copy so a partial claim is never presented as the whole parcel.
  affectedIsWholeParcel: boolean;
  stagedEvidenceCount: number;
}

export const buildReviewSummary = (
  draft: ClaimDraft,
  parcels: ParcelRecord[]
): ClaimReviewSummary => {
  if (parcels.length === 0) {
    return {
      ok: false,
      reason: 'no_parcels',
      parcelName: null,
      crop: null,
      parcelAreaAcres: null,
      eventType: null,
      eventDate: null,
      claimedAreaAcres: null,
      affectedIsWholeParcel: false,
      stagedEvidenceCount: draft.evidence.length,
    };
  }
  const parcel = parcels.find((p) => p.parcelId === draft.parcelId) ?? null;
  if (!parcel) {
    return {
      ok: false,
      reason: 'no_parcel',
      parcelName: null,
      crop: null,
      parcelAreaAcres: null,
      eventType: null,
      eventDate: null,
      claimedAreaAcres: null,
      affectedIsWholeParcel: false,
      stagedEvidenceCount: draft.evidence.length,
    };
  }
  if (!draft.eventType) {
    return {
      ok: false,
      reason: 'no_event',
      parcelName: parcel.name,
      crop: parcel.crop,
      parcelAreaAcres: parcel.calculatedAreaAcres,
      eventType: null,
      eventDate: draft.eventDate,
      claimedAreaAcres: null,
      affectedIsWholeParcel: false,
      stagedEvidenceCount: draft.evidence.length,
    };
  }
  const dateCheck = validateClaimDate(draft.eventDate);
  if (!dateCheck.ok) {
    return {
      ok: false,
      reason: dateCheck.reason === 'required' ? 'no_date' : 'invalid_date',
      parcelName: parcel.name,
      crop: parcel.crop,
      parcelAreaAcres: parcel.calculatedAreaAcres,
      eventType: draft.eventType,
      eventDate: draft.eventDate,
      claimedAreaAcres: null,
      affectedIsWholeParcel: false,
      stagedEvidenceCount: draft.evidence.length,
    };
  }
  // No affected-area selection at all. This MUST stay a hard block: the parcel boundary is a
  // legal claim only when the farmer explicitly chose it on the area step, never as a silent
  // fallback for a cleared/never-drawn polygon.
  if (!draft.geometry) {
    return {
      ok: false,
      reason: 'no_geometry',
      parcelName: parcel.name,
      crop: parcel.crop,
      parcelAreaAcres: parcel.calculatedAreaAcres,
      eventType: draft.eventType,
      eventDate: draft.eventDate,
      claimedAreaAcres: null,
      affectedIsWholeParcel: false,
      stagedEvidenceCount: draft.evidence.length,
    };
  }
  // The claimed area is a PREVIEW of the polygon the farmer actually selected — it must never be
  // the parcel total, or a 1.4-acre partial claim would be reviewed (and then submitted) as the
  // whole parcel. The backend recomputes the stored value from the same geometry.
  const sameGeometry =
    JSON.stringify(draft.geometry) === JSON.stringify(parcel.geometry);
  return {
    ok: true,
    reason: 'ready',
    parcelName: parcel.name,
    crop: parcel.crop,
    parcelAreaAcres: parcel.calculatedAreaAcres,
    eventType: draft.eventType,
    eventDate: draft.eventDate,
    claimedAreaAcres: sameGeometry ? parcel.calculatedAreaAcres : previewAreaAcres(draft.geometry),
    affectedIsWholeParcel: sameGeometry,
    stagedEvidenceCount: draft.evidence.length,
  };
};

// ── Claims list (My Claims) ─────────────────────────────────────────────────────────────

export type ClaimsListState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; retryKey: number }
  | { kind: 'ready'; models: ClaimCardViewModel[] };

// Pure transition used by every consumer: given the loading flag/error/claims/retryKey, decide
// what the list view should render. The user never sees raw backend errors.
export const resolveClaimsListState = (
  loading: boolean,
  hasError: boolean,
  claims: LossClaim[],
  retryKey: number
): ClaimsListState => {
  if (loading) return { kind: 'loading' };
  if (hasError) return { kind: 'error', retryKey };
  if (claims.length === 0) return { kind: 'empty' };
  return { kind: 'ready', models: claims.map(claimCardViewModel) };
};

// View model for one claim card. Only backend-serialized fields are exposed; identity columns
// (cognitoSub/userEmail), internal ids, s3Key/bucket and any client-derived area are absent.
export interface ClaimCardViewModel {
  id: string;
  eventType: LossEventType;
  eventTypeLabelKey: string;
  eventDate: string;
  claimedAreaAcres: number;
  state: ClaimState;
  stateLabelKey: string;
  isTerminal: boolean;
  parcelName: string | null;
  crop: string | null;
  createdAt: string;
  evidenceCount: number;
  hasAssessment: boolean;
}

export const claimCardViewModel = (claim: LossClaim): ClaimCardViewModel => ({
  id: claim.id,
  eventType: claim.eventType,
  eventTypeLabelKey: claimEventLabelKey(claim.eventType),
  eventDate: claim.eventDate,
  claimedAreaAcres: claim.claimedAreaAcres,
  state: claim.state,
  stateLabelKey: claimStateLabelKey(claim.state),
  isTerminal: isTerminalClaimState(claim.state),
  parcelName: claim.parcelSnapshot?.name ?? null,
  crop: claim.parcelSnapshot?.crop ?? null,
  createdAt: claim.createdAt,
  evidenceCount: Array.isArray(claim.evidence) ? claim.evidence.length : 0,
  hasAssessment: claim.assessment != null,
});

// ── Claim detail view model ──────────────────────────────────────────────────────────────
// Phase 9 (E9-S9): includes enriched assessment fields (verifiedAreaAcres, remainingEligible, etc.)

export interface ClaimDetailAssessment {
  approvedGeometry: GeoJsonPolygon | null;
  approvedAreaAcres: number | null;
  aiAggregate: unknown;
  weatherCorrelation: unknown;
  rules: VerificationRules | null;
  state: string | null;
  reason: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  // E9-S9 additive fields (server-derived, never client-trusted):
  verifiedAreaAcres: number | null;
  remainingEligible: number | null;
  previouslyVerifiedAcres: number | null;
  inFlightAreaAcres: number | null;
  overlapWarnings: Array<{ code: string; message: string; claims?: Array<{ claimId: string; siblingState: string; overlapAreaAcres?: number }>; overlapAreaAcres?: number }>;
  spatialEvaluated: boolean;
}

export interface ClaimDetailViewModel {
  id: string;
  parcelId: string;
  parcelName: string | null;
  crop: string | null;
  parcelAreaAcres: number;
  eventType: LossEventType;
  eventTypeLabelKey: string;
  eventDate: string;
  claimedAreaAcres: number;
  state: ClaimState;
  stateLabelKey: string;
  evidence: ClaimEvidenceEntry[];
  assessment: ClaimDetailAssessment | null;
  createdAt: string;
  submittedAt: string | null;
  processedAt: string | null;
  decidedAt: string | null;
  isTerminal: boolean;
  canSubmit: boolean;
  canWithdraw: boolean;
  canResubmit: boolean;
  canVerify: boolean;
  canEditEvidence: boolean;
  hasResult: boolean;
  latestEvidence: EvidencePresign | null;
  report:
    | { kind: 'none' }
    | { kind: 'processing'; claimState: ClaimState }
    | { kind: 'decision'; verification: VerificationDecision };
}

// Admin notes are internal-only (backend assessment field); they must NEVER reach the UI.
const stripAdminNote = (assessment: ClaimAssessment): ClaimDetailAssessment => {
  const { adminNote: _discarded, ...rest } = assessment;
  void _discarded;
  return {
    ...rest,
    verifiedAreaAcres: assessment.verifiedAreaAcres ?? null,
    remainingEligible: assessment.remainingEligible ?? null,
    previouslyVerifiedAcres: assessment.previouslyVerifiedAcres ?? null,
    inFlightAreaAcres: assessment.inFlightAreaAcres ?? null,
    overlapWarnings: assessment.overlapWarnings ?? [],
    spatialEvaluated: Boolean(assessment.spatialEvaluated),
  };
};

export const claimDetailViewModel = (
  claim: LossClaim | null,
  verification: VerificationDecision | null
): ClaimDetailViewModel => {
  if (!claim) {
    return emptyDetailViewModel();
  }
  const assessment = claim.assessment
    ? stripAdminNote(claim.assessment)
    : null;
  const report =
    verification && verification.inProgress
      ? {
          kind: 'processing' as const,
          claimState: (verification.claimState ?? claim.state) as ClaimState,
        }
      : verification && verification.outcome !== null
        ? { kind: 'decision' as const, verification }
        : { kind: 'none' as const };
  return {
    id: claim.id,
    parcelId: claim.parcelId,
    parcelName: claim.parcelSnapshot?.name ?? null,
    crop: claim.parcelSnapshot?.crop ?? null,
    parcelAreaAcres: claim.parcelSnapshot?.parcelAreaAcres ?? 0,
    eventType: claim.eventType,
    eventTypeLabelKey: claimEventLabelKey(claim.eventType),
    eventDate: claim.eventDate,
    claimedAreaAcres: claim.claimedAreaAcres,
    state: claim.state,
    stateLabelKey: claimStateLabelKey(claim.state),
    evidence: Array.isArray(claim.evidence) ? claim.evidence : [],
    assessment,
    createdAt: claim.createdAt,
    submittedAt: claim.submittedAt,
    processedAt: claim.processedAt,
    decidedAt: claim.decidedAt,
    isTerminal: isTerminalClaimState(claim.state),
    canSubmit: canSubmitClaim(claim.state),
    canWithdraw: canWithdrawClaim(claim.state),
    canResubmit: canResubmitClaim(claim.state),
    canVerify: canRequestVerification(claim.state),
    canEditEvidence: canMutateEvidence(claim.state),
    hasResult: assessment?.state != null,
    latestEvidence: null,
    report,
  };
};

const emptyDetailViewModel = (): ClaimDetailViewModel => ({
  id: '',
  parcelId: '',
  parcelName: null,
  crop: null,
  parcelAreaAcres: 0,
  eventType: 'other',
  eventTypeLabelKey: claimEventLabelKey('other'),
  eventDate: '',
  claimedAreaAcres: 0,
  state: 'draft',
  stateLabelKey: claimStateLabelKey('draft'),
  evidence: [],
  assessment: null,
  createdAt: '',
  submittedAt: null,
  processedAt: null,
  decidedAt: null,
  isTerminal: false,
  canSubmit: false,
  canWithdraw: false,
  canResubmit: false,
  canVerify: false,
  canEditEvidence: false,
  hasResult: false,
  latestEvidence: null,
  report: { kind: 'none' },
});

// The verification result panel model — displays ONLY backend decision fields. Outcome labels
// come from the same claimState_* keys (the verification outcome IS a claim state value).
// Phase 9 (E9-S9): enriched with real overclaim-prevention surface (remainingEligible, overlapWarnings, etc.).
export interface VerificationResultModel {
  outcomeLabelKey: string | null;
  reason: string | null;
  rules: VerificationRules | null;
  ruleRows: { name: string; labelKey: string; passed: boolean }[];
  approvedAreaAcres: number | null;
  claimedAreaAcres: number | null;
  parcelAreaAcres: number | null;
  // E9-S9 additive fields (server-derived, never client-trusted):
  verifiedAreaAcres: number | null;
  remainingEligible: number | null;
  previouslyVerifiedAcres: number | null;
  inFlightAreaAcres: number | null;
  overlapWarnings: Array<{ code: string; message: string; claims?: Array<{ claimId: string; siblingState: string; overlapAreaAcres?: number }>; overlapAreaAcres?: number }>;
  spatialEvaluated: boolean;
  weatherCorrelation: unknown;
  decidedAt: string | null;
  decidedBy: string | null;
  evidenceVersion: string | null;
  engineVersion: string | null;
  claimId: string;
}

export const verificationRulesKey = (name: string): string => `claimRule_${name}`;

export const verificationResultModel = (
  verification: VerificationDecision
): VerificationResultModel => {
  const ruleRows = Object.entries(verification.rules ?? {}).map(([name, check]) => {
    const passed = Boolean((check as VerificationRuleCheck | undefined)?.passed);
    return { name, labelKey: verificationRulesKey(name), passed };
  });
  return {
    outcomeLabelKey: verification.outcome ? claimStateLabelKey(verification.outcome) : null,
    reason: verification.reason ?? null,
    rules: verification.rules ?? null,
    ruleRows,
    approvedAreaAcres: verification.approvedAreaAcres,
    claimedAreaAcres: verification.claimedAreaAcres,
    parcelAreaAcres: verification.parcelAreaAcres,
    // E9-S9 additive fields (server-derived, never client-trusted):
    verifiedAreaAcres: verification.verifiedAreaAcres ?? null,
    remainingEligible: verification.remainingEligible ?? null,
    previouslyVerifiedAcres: verification.previouslyVerifiedAcres ?? null,
    inFlightAreaAcres: verification.inFlightAreaAcres ?? null,
    overlapWarnings: verification.overlapWarnings ?? [],
    spatialEvaluated: Boolean(verification.spatialEvaluated),
    weatherCorrelation: verification.weatherCorrelation ?? null,
    decidedAt: verification.decidedAt ?? null,
    decidedBy: verification.decidedBy ?? null,
    evidenceVersion: verification.evidenceVersion ?? null,
    engineVersion: verification.engineVersion ?? null,
    claimId: verification.claimId,
  };
};

// SECURITY: assert a view model exposes no secret/identity/authority slots. Used by tests to
// prove the security scenarios (no cognitoSub, no userEmail, no s3Key/bucket/credentials).
const FORBIDDEN_VIEW_PROPERTY = /^(cognitoSub|userEmail|s3Key|s3key|bucket|secret|accessKey|signature|presignedUrl|adminNote.*|.*\.key)$/i;

export const viewModelHasSensitiveField = (model: unknown): boolean => {
  if (model === null || typeof model !== 'object') return false;
  return Object.entries(model).some(([key, value]) => {
    if (FORBIDDEN_VIEW_PROPERTY.test(key)) return true;
    if (value !== null && typeof value === 'object') {
      return viewModelHasSensitiveField(value);
    }
    return false;
  });
};