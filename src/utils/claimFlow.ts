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
//   - The affected-area step NEVER fabricates geometry or acreage: it carries the selected
//     parcel's real geometry forward (the backend recomputes the authoritative area from it).
//     Partial-area map drawing is an explicitly deferred boundary (ADR-019 P8 — no map yet).
//   - Area numbers displayed are always the backend-returned values (parcel.calculatedAreaAcres
//     or claim.claimedAreaAcres), never client math.

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

export const addStagedEvidence = (
  draft: ClaimDraft,
  entry: Omit<StagedEvidence, 'key' | 'status'>
): ClaimDraft => {
  if (!canStageEvidence(draft)) return draft;
  return {
    ...draft,
    evidence: [
      ...draft.evidence,
      { ...entry, key: cryptoRandomKey(), status: 'staged' },
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
  | { type: 'select.area'; geometry: GeoJsonPolygon }
  | { type: 'evidence.add'; entry: Omit<StagedEvidence, 'key' | 'status'> }
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
      stagedEvidenceCount: draft.evidence.length,
    };
  }
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
      stagedEvidenceCount: draft.evidence.length,
    };
  }
  return {
    ok: true,
    reason: 'ready',
    parcelName: parcel.name,
    crop: parcel.crop,
    parcelAreaAcres: parcel.calculatedAreaAcres,
    eventType: draft.eventType,
    eventDate: draft.eventDate,
    claimedAreaAcres: parcel.calculatedAreaAcres,
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
  assessment: Omit<ClaimAssessment, 'adminNote'> | null;
  createdAt: string;
  submittedAt: string | null;
  processedAt: string | null;
  decidedAt: string | null;
  isTerminal: boolean;
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
const stripAdminNote = (assessment: ClaimAssessment): Omit<ClaimAssessment, 'adminNote'> => {
  const { adminNote: _discarded, ...rest } = assessment;
  void _discarded;
  return rest;
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
export interface VerificationResultModel {
  outcomeLabelKey: string | null;
  reason: string | null;
  rules: VerificationRules | null;
  ruleRows: { name: string; labelKey: string; passed: boolean }[];
  approvedAreaAcres: number | null;
  claimedAreaAcres: number | null;
  parcelAreaAcres: number | null;
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