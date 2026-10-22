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
  AppealableDecisionState,
  ClaimAssessment,
  ClaimantRelationship,
  ClaimEvidenceEntry,
  ClaimState,
  EvidencePresign,
  GeoJsonPolygon,
  LossClaim,
  LossEventType,
  OwnershipDocumentCategory,
  OwnershipEvidenceStatus,
  ParcelRecord,
  PendingVerificationComponent,
  VerificationComponent,
  VerificationComponentName,
  VerificationComponentOutcome,
  VerificationComponents,
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
// Claimant relationship vocabulary (config/claimantEvidence.js CLAIMANT_RELATIONSHIPS).
export const CLAIMANT_RELATIONSHIPS: ClaimantRelationship[] = [
  'owner',
  'joint_owner',
  'tenant',
  'authorised_cultivator',
  'heir',
];

export const CLAIMANT_RELATIONSHIP_SET: ReadonlySet<string> = new Set(CLAIMANT_RELATIONSHIPS);

// Documents each relationship is expected to attach (config/claimantEvidence.js
// REQUIRED_CATEGORY_GROUPS; provisional backend policy, contract §1.1). A group is satisfied by
// ANY of its categories; the relationship needs EVERY group. Display guidance only — the backend
// decides what is missing and reports it through the claimant_rights component.
export const RELATIONSHIP_DOCUMENT_GROUPS: Record<ClaimantRelationship, OwnershipDocumentCategory[][]> = {
  owner: [['land_record', 'ownership_deed']],
  joint_owner: [['land_record', 'ownership_deed']],
  tenant: [['lease_agreement'], ['land_record', 'ownership_deed', 'tax_receipt']],
  authorised_cultivator: [['authorization_letter']],
  heir: [['land_record', 'ownership_deed'], ['identity_proof', 'other']],
};

// Ownership document categories (utils/ownershipEvidence.js OWNERSHIP_DOCUMENT_CATEGORIES).
export const OWNERSHIP_DOCUMENT_CATEGORIES: OwnershipDocumentCategory[] = [
  'land_record',
  'ownership_deed',
  'lease_agreement',
  'authorization_letter',
  'tax_receipt',
  'identity_proof',
  'other',
];

export const claimantRelationshipLabelKey = (relationship: string): string =>
  `claimantRelationship_${relationship}`;

export const ownershipCategoryLabelKey = (category: string): string => `ownershipCategory_${category}`;

// Farmer wording for a document's review status. VERIFIED is reserved for an authoritative
// provider that does not exist yet; it is still worded "Checked", never "official".
export const ownershipStatusLabelKey = (status: OwnershipEvidenceStatus | string): string => {
  switch (status) {
    case 'AVAILABLE':
    case 'VERIFIED':
      return 'ownershipStatus_accepted';
    case 'INSUFFICIENT':
      return 'ownershipStatus_insufficient';
    case 'INCONSISTENT':
      return 'ownershipStatus_inconsistent';
    case 'UNAVAILABLE':
      return 'ownershipStatus_unavailable';
    default:
      return 'ownershipStatus_pending';
  }
};

// Appeal eligibility (models/Appeal.js APPEAL_ELIGIBLE_STATES). Any other state → 409.
export const APPEALABLE_CLAIM_STATES: AppealableDecisionState[] = [
  'rejected',
  'out_of_limit',
  'duplicate_area',
  'more_evidence_required',
];

export const canAppealClaim = (state: string): boolean =>
  (APPEALABLE_CLAIM_STATES as string[]).includes(state);

export const APPEAL_REASON_MIN = 10;
export const APPEAL_REASON_MAX = 2000;

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

// The states in which the backend accepts POST /claims/:id/verify. Kept for reviewer tooling and its
// test only: the farmer UI no longer offers a verify action (plan B4); checks start on their own
// after submit and the tracker only reads progress.
export const canRequestVerification = (state: string): boolean =>
  state === 'submitted' || state === 'processing' || state === 'more_evidence_required';

// A verification RESULT is visible for every decided engine state (not for plain submitted
// claims that the farmer never verified).
export const showsVerificationResult = (state: string): boolean =>
  state !== 'draft' &&
  state !== 'submitted' &&
  state !== 'processing' &&
  state !== 'withdrawn';

// ── Claims-list next-step hint (audit D4) ───────────────────────────────────────────────
// One short, actionable line for the claims-list card, derived ONLY from state gates the
// existing workflow already enforces (each mirrors backend/claimState.service.js and is used by
// the tracker/wizard). Returns the i18n key of the hint, or null when the state has no
// farmer-actionable next step — in which case the card renders no hint at all. Nothing here
// decides or invents a status: the deep link always opens the claim detail where the real,
// permission-checked action lives. `appeal` precedes the others because canAppealClaim includes
// more_evidence_required, whose primary step is still the resubmit.
export const claimNextStepKey = (state: string): string | null => {
  if (canResubmitClaim(state)) return 'nextStep_resubmit';
  if (canSubmitClaim(state)) return 'nextStep_submit';
  if (canAppealClaim(state)) return 'nextStep_appeal';
  return null;
};

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
// dropped create response can never duplicate a claim. It travels with the wizard draft (also
// across a page reload, see claimDraftStorage.ts) and is replaced when a field sent on create
// changes before the claim exists (wizardReducer).
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

// ── Claim wizard (five steps: Parcel → Your land → Event → Evidence → Review) ───────────────
//
// Event holds the event type, the date and the affected area. Evidence holds the crop photos
// (at least MIN_PHOTOS_TO_SUBMIT are required) and the optional land documents. Following the
// claim after submit (checks, decision) belongs to the claim page, not to the wizard.

export type ClaimWizardStep = 'parcel' | 'relationship' | 'event' | 'evidence' | 'review';

export const CLAIM_WIZARD_STEPS: ClaimWizardStep[] = [
  'parcel',
  // Optional: how the farmer relates to the land. Sent as `claimantRelationship` on create; it
  // decides which ownership documents the backend expects.
  'relationship',
  'event',
  'evidence',
  'review',
];

export const CLAIM_EVIDENCE_MAX = 10; // mirrors backend env default CLAIM_EVIDENCE_MAX_IMAGES

// Land documents go through /upload (10 calls per MINUTE, 2 calls per document), so the wizard
// keeps the batch small enough to finish inside one window.
export const CLAIM_DOCUMENT_MAX = 5;

// Every verification policy answers `more_evidence_required` for a claim without photos, and the
// backend progress contract marks `add_photos` as required, so the wizard asks for one up front.
export const MIN_PHOTOS_TO_SUBMIT = 1;

export type StagedImageType = 'jpeg' | 'png' | 'webp' | null;

// Staged evidence: plain metadata for pure logic. The File object is carried by the UI
// alongside the key; uploads happen against the real claim after creation. `missing_file`
// marks an entry restored from a saved draft whose bytes are gone (File objects are never
// stored), so the farmer must choose it again or remove it.
export interface StagedEvidence {
  key: string;
  name: string;
  size: number;
  detectedType: StagedImageType;
  status: 'staged' | 'uploading' | 'uploaded' | 'failed' | 'missing_file';
  uploadId?: string;
  errorKey?: string;
}

export type StagedDocumentStatus =
  | 'staged'
  | 'uploading'
  | 'uploaded'
  | 'attaching'
  | 'attached'
  | 'failed'
  | 'missing_file';

// A land document: the image goes through /upload first (uploadId), then is attached to the
// claim (evidenceId). Keeping the uploadId means a failed attach is retried without uploading the
// same file again.
export interface StagedDocument {
  key: string;
  name: string;
  size: number;
  detectedType: StagedImageType;
  category: OwnershipDocumentCategory;
  status: StagedDocumentStatus;
  uploadId?: string;
  evidenceId?: string;
  errorKey?: string;
  failedPhase?: 'upload' | 'attach';
}

export interface ClaimDraft {
  step: ClaimWizardStep;
  // Furthest step the farmer has opened; `goto` (the review step's Edit links) never jumps past it.
  reachedStep: ClaimWizardStep;
  parcelId: string | null;
  // null = not declared (the field is optional on POST /claims).
  claimantRelationship: ClaimantRelationship | null;
  eventType: LossEventType | null;
  eventDate: string | null;
  geometry: GeoJsonPolygon | null;
  idempotencyKey: string | null;
  evidence: StagedEvidence[];
  documents: StagedDocument[];
  // Set once POST /claims succeeded. A retry then never creates again, and the fields that were
  // sent on create (parcel, relationship, event, date, area) are locked: there is no update call,
  // so an edit here would silently differ from the saved claim.
  claimId: string | null;
}

export const createEmptyDraft = (): ClaimDraft => ({
  step: 'parcel',
  reachedStep: 'parcel',
  parcelId: null,
  claimantRelationship: null,
  eventType: null,
  eventDate: null,
  geometry: null,
  idempotencyKey: generateIdempotencyKey(),
  evidence: [],
  documents: [],
  claimId: null,
});

export const canStageEvidence = (draft: ClaimDraft): boolean =>
  draft.evidence.length < CLAIM_EVIDENCE_MAX;

export const canStageDocument = (draft: ClaimDraft): boolean =>
  draft.documents.length < CLAIM_DOCUMENT_MAX;

export type StagedEvidenceEntry = Omit<StagedEvidence, 'status' | 'key'> & { key?: string };

export type StagedDocumentEntry = Omit<StagedDocument, 'status' | 'key' | 'uploadId' | 'evidenceId' | 'errorKey' | 'failedPhase'> & {
  key?: string;
};

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
    e.key === key ? { ...e, status: 'uploaded', uploadId, errorKey: undefined } : e
  ),
});

export const markStagedEvidenceUploading = (draft: ClaimDraft, key: string): ClaimDraft => ({
  ...draft,
  evidence: draft.evidence.map((e) =>
    e.key === key ? { ...e, status: 'uploading', errorKey: undefined } : e
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

const cryptoRandomKey = (prefix = 'ev'): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return `${prefix}_${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return `${prefix}_${Math.random().toString(16).slice(2, 14)}`;
};

/** A fresh key for a staged photo (`ev_…`) or land document (`doc_…`). */
export const newStagedKey = (kind: 'photo' | 'document'): string =>
  cryptoRandomKey(kind === 'photo' ? 'ev' : 'doc');

const updateDocument = (
  draft: ClaimDraft,
  key: string,
  update: (doc: StagedDocument) => StagedDocument
): ClaimDraft => ({
  ...draft,
  documents: draft.documents.map((d) => (d.key === key ? update(d) : d)),
});

// ── Wizard navigation (pure reducer) ────────────────────────────────────────────────────

export type WizardNavigation =
  | { type: 'next' }
  | { type: 'back' }
  // Jump to an earlier (or already reached) step, e.g. the review step's Edit links.
  | { type: 'goto'; step: ClaimWizardStep }
  | { type: 'select.parcel'; parcelId: string; geometry: GeoJsonPolygon }
  | { type: 'select.relationship'; relationship: ClaimantRelationship | null }
  | { type: 'select.event'; eventType: LossEventType }
  | { type: 'select.date'; eventDate: string }
  // `null` means "no affected area selected". Clearing the drawing must clear the claim geometry,
  // never fall back to the parcel boundary.
  | { type: 'select.area'; geometry: GeoJsonPolygon | null }
  | { type: 'evidence.add'; entry: StagedEvidenceEntry }
  | { type: 'evidence.remove'; key: string }
  // A restored `missing_file` (or failed) photo was chosen again: same key, new bytes.
  | { type: 'evidence.relink'; key: string; name: string; size: number; detectedType: StagedImageType }
  | { type: 'evidence.uploading'; key: string }
  | { type: 'evidence.uploaded'; key: string; uploadId: string }
  | { type: 'evidence.failed'; key: string; errorKey: string }
  | { type: 'document.add'; entry: StagedDocumentEntry }
  | { type: 'document.remove'; key: string }
  | { type: 'document.category'; key: string; category: OwnershipDocumentCategory }
  | { type: 'document.relink'; key: string; name: string; size: number; detectedType: StagedImageType }
  | { type: 'document.uploading'; key: string }
  | { type: 'document.uploaded'; key: string; uploadId: string }
  | { type: 'document.attaching'; key: string }
  | { type: 'document.attached'; key: string; evidenceId: string }
  | { type: 'document.failed'; key: string; errorKey: string; failedPhase: 'upload' | 'attach' }
  | { type: 'claim.created'; claimId: string }
  | { type: 'idempotency.set'; key: string }
  // Replace the whole draft (a draft restored from session storage).
  | { type: 'restore'; draft: ClaimDraft }
  | { type: 'reset' };

const stepIndexOf = (step: ClaimWizardStep): number => CLAIM_WIZARD_STEPS.indexOf(step);

const laterStep = (a: ClaimWizardStep, b: ClaimWizardStep): ClaimWizardStep =>
  stepIndexOf(a) >= stepIndexOf(b) ? a : b;

// Index of the furthest step the farmer could stand on: every step before it can be continued.
export const furthestValidStepIndex = (draft: ClaimDraft): number => {
  for (let index = 0; index < CLAIM_WIZARD_STEPS.length - 1; index += 1) {
    if (!stepCanAdvance({ ...draft, step: CLAIM_WIZARD_STEPS[index] })) return index;
  }
  return CLAIM_WIZARD_STEPS.length - 1;
};

/** Steps `goto` may open: already reached AND every earlier step is still complete. */
export const canGotoStep = (draft: ClaimDraft, step: ClaimWizardStep): boolean => {
  const target = stepIndexOf(step);
  if (target === -1) return false;
  return target <= stepIndexOf(draft.reachedStep) && target <= furthestValidStepIndex(draft);
};

// A change to a field that is sent on create. Before the claim exists the idempotency key is
// rotated: if an earlier create did reach the server but its answer was lost, re-sending the OLD
// key would hand back that claim with the OLD answers. After the claim exists the change is
// refused (see ClaimDraft.claimId).
const withCoreChange = (draft: ClaimDraft, next: ClaimDraft, changed: boolean): ClaimDraft => {
  if (draft.claimId) return draft;
  if (!changed) return draft;
  return { ...next, idempotencyKey: generateIdempotencyKey() };
};

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export const wizardReducer = (draft: ClaimDraft, action: WizardNavigation): ClaimDraft => {
  switch (action.type) {
    case 'reset':
      return createEmptyDraft();
    case 'restore':
      return action.draft;
    case 'select.parcel':
      return withCoreChange(
        draft,
        { ...draft, parcelId: action.parcelId, geometry: action.geometry },
        draft.parcelId !== action.parcelId || !sameJson(draft.geometry, action.geometry)
      );
    case 'select.relationship': {
      // Only the backend vocabulary is accepted; null clears the (optional) answer.
      const relationship =
        action.relationship === null || CLAIMANT_RELATIONSHIP_SET.has(action.relationship)
          ? action.relationship
          : draft.claimantRelationship;
      return withCoreChange(
        draft,
        { ...draft, claimantRelationship: relationship },
        relationship !== draft.claimantRelationship
      );
    }
    case 'select.event': {
      const eventType = CLAIM_EVENT_TYPE_SET.has(action.eventType) ? action.eventType : draft.eventType;
      return withCoreChange(draft, { ...draft, eventType }, eventType !== draft.eventType);
    }
    case 'select.date':
      return withCoreChange(
        draft,
        { ...draft, eventDate: action.eventDate },
        action.eventDate !== draft.eventDate
      );
    case 'select.area':
      return withCoreChange(
        draft,
        { ...draft, geometry: action.geometry },
        !sameJson(draft.geometry, action.geometry)
      );
    case 'evidence.add':
      return addStagedEvidence(draft, action.entry);
    case 'evidence.remove':
      return removeStagedEvidence(draft, action.key);
    case 'evidence.relink':
      return {
        ...draft,
        evidence: draft.evidence.map((e) =>
          e.key === action.key && e.status !== 'uploaded' && e.status !== 'uploading'
            ? {
                key: e.key,
                name: action.name,
                size: action.size,
                detectedType: action.detectedType,
                status: 'staged',
              }
            : e
        ),
      };
    case 'evidence.uploading':
      return markStagedEvidenceUploading(draft, action.key);
    case 'evidence.uploaded':
      return markStagedEvidenceUploaded(draft, action.key, action.uploadId);
    case 'evidence.failed':
      return markStagedEvidenceFailed(draft, action.key, action.errorKey);
    case 'document.add':
      if (!canStageDocument(draft)) return draft;
      if (!(OWNERSHIP_DOCUMENT_CATEGORIES as string[]).includes(action.entry.category)) return draft;
      return {
        ...draft,
        documents: [
          ...draft.documents,
          { ...action.entry, key: action.entry.key ?? newStagedKey('document'), status: 'staged' },
        ],
      };
    case 'document.remove':
      // An attached document cannot be removed: the backend has no delete call for it.
      return {
        ...draft,
        documents: draft.documents.filter((d) => d.key !== action.key || d.status === 'attached' || d.status === 'attaching'),
      };
    case 'document.category':
      if (!(OWNERSHIP_DOCUMENT_CATEGORIES as string[]).includes(action.category)) return draft;
      // The category is sent with the attach, so it is fixed once attaching starts.
      return updateDocument(draft, action.key, (d) =>
        d.status === 'attached' || d.status === 'attaching' ? d : { ...d, category: action.category }
      );
    case 'document.relink':
      return updateDocument(draft, action.key, (d) =>
        d.status === 'attached' || d.status === 'attaching' || d.status === 'uploading'
          ? d
          : {
              key: d.key,
              category: d.category,
              name: action.name,
              size: action.size,
              detectedType: action.detectedType,
              status: 'staged',
            }
      );
    case 'document.uploading':
      return updateDocument(draft, action.key, (d) => ({ ...d, status: 'uploading', errorKey: undefined, failedPhase: undefined }));
    case 'document.uploaded':
      return updateDocument(draft, action.key, (d) => ({ ...d, status: 'uploaded', uploadId: action.uploadId, errorKey: undefined, failedPhase: undefined }));
    case 'document.attaching':
      return updateDocument(draft, action.key, (d) => ({ ...d, status: 'attaching', errorKey: undefined, failedPhase: undefined }));
    case 'document.attached':
      return updateDocument(draft, action.key, (d) => ({ ...d, status: 'attached', evidenceId: action.evidenceId, errorKey: undefined, failedPhase: undefined }));
    case 'document.failed':
      return updateDocument(draft, action.key, (d) => ({ ...d, status: 'failed', errorKey: action.errorKey, failedPhase: action.failedPhase }));
    case 'claim.created':
      return { ...draft, claimId: action.claimId };
    case 'idempotency.set':
      return isValidIdempotencyKey(action.key) ? { ...draft, idempotencyKey: action.key } : draft;
    case 'goto':
      if (!canGotoStep(draft, action.step)) return draft;
      return { ...draft, step: action.step };
    case 'next': {
      const index = stepIndexOf(draft.step);
      if (index === -1 || index >= CLAIM_WIZARD_STEPS.length - 1) return draft;
      const step = CLAIM_WIZARD_STEPS[index + 1];
      return { ...draft, step, reachedStep: laterStep(draft.reachedStep, step) };
    }
    case 'back': {
      const index = stepIndexOf(draft.step);
      if (index <= 0) return draft;
      return { ...draft, step: CLAIM_WIZARD_STEPS[index - 1] };
    }
    default:
      return draft;
  }
};

// ── Step gates ──────────────────────────────────────────────────────────────────────────

/** Photos that can still be sent: everything except entries whose file was lost. */
export const usablePhotoCount = (draft: ClaimDraft): number =>
  draft.evidence.filter((e) => e.status !== 'missing_file').length;

/** True while a restored photo or document still needs its file chosen again. */
export const hasMissingFiles = (draft: ClaimDraft): boolean =>
  draft.evidence.some((e) => e.status === 'missing_file') ||
  draft.documents.some((d) => d.status === 'missing_file');

export type EventStepNeed = 'event_type' | 'date' | 'area';

/** What the Event step still needs before Continue is enabled (shown as an aria-live hint). */
export const eventStepMissing = (draft: ClaimDraft): EventStepNeed[] => {
  const missing: EventStepNeed[] = [];
  if (draft.eventType === null) missing.push('event_type');
  if (!validateClaimDate(draft.eventDate).ok) missing.push('date');
  if (draft.geometry === null) missing.push('area');
  return missing;
};

export type EvidenceStepNeed = 'photos' | 'missing_files';

export const evidenceStepMissing = (draft: ClaimDraft): EvidenceStepNeed[] => {
  const missing: EvidenceStepNeed[] = [];
  if (usablePhotoCount(draft) < MIN_PHOTOS_TO_SUBMIT) missing.push('photos');
  if (hasMissingFiles(draft)) missing.push('missing_files');
  return missing;
};

// Whether the farmer may continue from the current step (gates the Continue button so unfinished
// steps cannot be skipped). The review step re-checks everything through buildReviewSummary.
export const stepCanAdvance = (draft: ClaimDraft): boolean => {
  switch (draft.step) {
    case 'parcel':
      // select.parcel always sets the parcel AND its boundary as the starting area. The area is
      // then the Event step's business: clearing it there must not make the parcel step "undone".
      return Boolean(draft.parcelId);
    case 'relationship':
      return true; // optional: the farmer may skip it
    case 'event':
      return eventStepMissing(draft).length === 0;
    case 'evidence':
      return evidenceStepMissing(draft).length === 0;
    case 'review':
      return true;
    default:
      return false;
  }
};

// ── Land document guidance ───────────────────────────────────────────────────────────────

export interface DocumentGroupStatus {
  group: OwnershipDocumentCategory[];
  satisfied: boolean;
}

// The document groups the declared relationship is expected to cover, each marked satisfied when
// a staged or attached document has one of its categories. Guidance only: the backend decides what
// is missing. No relationship → no groups (the UI shows generic guidance).
export const documentGroupStatus = (
  relationship: ClaimantRelationship | null,
  documents: StagedDocument[]
): DocumentGroupStatus[] => {
  if (!relationship || !RELATIONSHIP_DOCUMENT_GROUPS[relationship]) return [];
  const present = new Set(
    documents.filter((d) => d.status !== 'missing_file').map((d) => d.category)
  );
  return RELATIONSHIP_DOCUMENT_GROUPS[relationship].map((group) => ({
    group,
    satisfied: group.some((category) => present.has(category)),
  }));
};

/** Category for the next document: the first category of the first group not yet covered. */
export const defaultDocumentCategory = (
  relationship: ClaimantRelationship | null,
  documents: StagedDocument[]
): OwnershipDocumentCategory => {
  const open = documentGroupStatus(relationship, documents).find((g) => !g.satisfied);
  return open?.group[0] ?? OWNERSHIP_DOCUMENT_CATEGORIES[0];
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
    | 'missing_files'
    | 'no_photos'
    | 'ready';
  parcelName: string | null;
  crop: string | null;
  parcelAreaAcres: number | null;
  relationship: ClaimantRelationship | null;
  eventType: LossEventType | null;
  eventDate: string | null;
  claimedAreaAcres: number | null;
  // True when the farmer picked "entire parcel", false when they drew a partial affected area.
  // Drives the review copy so a partial claim is never presented as the whole parcel.
  affectedIsWholeParcel: boolean;
  stagedEvidenceCount: number;
  photos: { key: string; name: string; status: StagedEvidence['status'] }[];
  documents: { key: string; name: string; category: OwnershipDocumentCategory; status: StagedDocumentStatus }[];
}

export const buildReviewSummary = (
  draft: ClaimDraft,
  parcels: ParcelRecord[]
): ClaimReviewSummary => {
  const parcel = parcels.find((p) => p.parcelId === draft.parcelId) ?? null;
  const base: ClaimReviewSummary = {
    ok: false,
    reason: 'no_parcels',
    parcelName: null,
    crop: null,
    parcelAreaAcres: null,
    relationship: draft.claimantRelationship,
    eventType: null,
    eventDate: null,
    claimedAreaAcres: null,
    affectedIsWholeParcel: false,
    stagedEvidenceCount: draft.evidence.length,
    photos: draft.evidence.map(({ key, name, status }) => ({ key, name, status })),
    documents: draft.documents.map(({ key, name, category, status }) => ({ key, name, category, status })),
  };
  if (parcels.length === 0) return base;
  if (!parcel) return { ...base, reason: 'no_parcel' };
  const withParcel: ClaimReviewSummary = {
    ...base,
    parcelName: parcel.name,
    crop: parcel.crop,
    parcelAreaAcres: parcel.calculatedAreaAcres,
  };
  if (!draft.eventType) return { ...withParcel, reason: 'no_event', eventDate: draft.eventDate };
  const dateCheck = validateClaimDate(draft.eventDate);
  if (!dateCheck.ok) {
    return {
      ...withParcel,
      reason: dateCheck.reason === 'required' ? 'no_date' : 'invalid_date',
      eventType: draft.eventType,
      eventDate: draft.eventDate,
    };
  }
  // No affected-area selection at all. This MUST stay a hard block: the parcel boundary is a
  // legal claim only when the farmer explicitly chose it on the area step, never as a silent
  // fallback for a cleared/never-drawn polygon.
  if (!draft.geometry) {
    return { ...withParcel, reason: 'no_geometry', eventType: draft.eventType, eventDate: draft.eventDate };
  }
  // The claimed area is a PREVIEW of the polygon the farmer actually selected — it must never be
  // the parcel total, or a 1.4-acre partial claim would be reviewed (and then submitted) as the
  // whole parcel. The backend recomputes the stored value from the same geometry.
  const sameGeometry = JSON.stringify(draft.geometry) === JSON.stringify(parcel.geometry);
  const complete: ClaimReviewSummary = {
    ...withParcel,
    eventType: draft.eventType,
    eventDate: draft.eventDate,
    claimedAreaAcres: sameGeometry ? parcel.calculatedAreaAcres : previewAreaAcres(draft.geometry),
    affectedIsWholeParcel: sameGeometry,
  };
  if (hasMissingFiles(draft)) return { ...complete, reason: 'missing_files' };
  if (usablePhotoCount(draft) < MIN_PHOTOS_TO_SUBMIT) return { ...complete, reason: 'no_photos' };
  return { ...complete, ok: true, reason: 'ready' };
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
  // ADR-020 additive surface (optional on legacy assessments).
  held?: boolean;
  pendingComponents?: PendingVerificationComponent[];
  components?: VerificationComponents | null;
  policyId?: string;
  policyHash?: string | null;
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
  canEditEvidence: boolean;
  hasResult: boolean;
  latestEvidence: EvidencePresign | null;
  report:
    | { kind: 'none' }
    | { kind: 'processing'; claimState: ClaimState }
    // No decision yet: a required component is unresolved and the claim stays `submitted`.
    | { kind: 'held'; checklist: ComponentChecklistRow[]; pendingComponents: PendingVerificationComponent[] }
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
  // `held` wins over everything else: it is the backend saying "no decision", so neither a
  // processing spinner nor a decision card may be shown. It comes from the live /verify
  // response when there is one, otherwise from the persisted assessment. A held claim is always
  // `submitted`; once the claim moved on (withdrawn, decided) a stale hold is ignored.
  const heldSource = claim.state !== 'submitted'
    ? null
    : verification
    ? verification.held
      ? { components: verification.components, pending: verification.pendingComponents }
      : null
    : claim.assessment?.held
      ? { components: claim.assessment.components, pending: claim.assessment.pendingComponents }
      : null;
  const report: ClaimDetailViewModel['report'] = heldSource
    ? {
        kind: 'held',
        checklist: componentChecklist(heldSource.components ?? null, heldSource.pending ?? []),
        pendingComponents: heldSource.pending ?? [],
      }
    : verification && verification.inProgress
      ? {
          kind: 'processing',
          claimState: (verification.claimState ?? claim.state) as ClaimState,
        }
      : verification && verification.outcome !== null
        ? { kind: 'decision', verification }
        : { kind: 'none' };
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
  // `supportingOnly` rules (weather) are supporting evidence: shown without a pass/fail verdict.
  ruleRows: { name: string; labelKey: string; passed: boolean; supportingOnly: boolean }[];
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

// Engine rules that are supporting evidence only (contract §1.3: weather never decides a claim
// on its own), so the UI never renders them as passed/failed.
export const SUPPORTING_ONLY_RULES: ReadonlySet<string> = new Set(['weatherCheck']);

export const verificationResultModel = (
  verification: VerificationDecision
): VerificationResultModel => {
  const ruleRows = Object.entries(verification.rules ?? {}).map(([name, check]) => {
    const passed = Boolean((check as VerificationRuleCheck | undefined)?.passed);
    return {
      name,
      labelKey: verificationRulesKey(name),
      passed,
      supportingOnly: SUPPORTING_ONLY_RULES.has(name),
    };
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

// ── Translated decision reasons (plan B4, design §7.4) ───────────────────────────────────────
// The backend's decision `reason` is English free text (and an admin override's reason is the
// reviewer's own note), so it is never shown to the farmer. The reasons are rebuilt from the
// engine's rule report instead: each failing rule, in the engine's precedence order, maps to a
// translated sentence. Supporting-only rules (weather) never count as a reason.

export const DECISION_RULE_ORDER = [
  'timelinessCheck',
  'eventTypeCheck',
  'areaCheck',
  'spatialCheck',
  'overlapCheck',
  'remainingCheck',
  'aiCheck',
] as const;

export const DECISION_OUTCOMES = [
  'verified',
  'partially_verified',
  'rejected',
  'out_of_limit',
  'duplicate_area',
  'more_evidence_required',
] as const;

const DECISION_OUTCOME_SET: ReadonlySet<string> = new Set(DECISION_OUTCOMES);

/**
 * i18n keys explaining a decision: `decisionReason_<rule>` for every failing rule (the AI rule
 * per outcome: `decisionReason_aiCheck_<outcome>`), else `decisionReason_outcome_<outcome>`. A
 * reviewer's decision (decidedBy other than the engine) is explained as such, because the stored
 * rule report belongs to the earlier engine run and may not match the reviewer's outcome.
 */
export const decisionReasonKeys = (
  rules: VerificationRules | null | undefined,
  outcome: string | null | undefined,
  decidedBy?: string | null
): string[] => {
  const known = outcome && DECISION_OUTCOME_SET.has(outcome) ? outcome : null;
  if (decidedBy && decidedBy !== 'engine') return ['decisionReason_reviewer'];
  const keys: string[] = [];
  for (const rule of DECISION_RULE_ORDER) {
    const check = rules?.[rule];
    if (!check || check.passed !== false || SUPPORTING_ONLY_RULES.has(rule)) continue;
    keys.push(rule === 'aiCheck' ? `decisionReason_aiCheck_${known ?? 'unknown'}` : `decisionReason_${rule}`);
  }
  if (keys.length > 0) return keys;
  return [known ? `decisionReason_outcome_${known}` : 'decisionReason_outcome_unknown'];
};

// Overlap warnings carry an English `message`; only the stable `code` is used
// (services/claimSpatial.service.js: outside_parcel, overlaps_in_flight, overlaps_verified).
const OVERLAP_WARNING_CODES: ReadonlySet<string> = new Set(['outside_parcel', 'overlaps_in_flight', 'overlaps_verified']);

export const overlapWarningMessage = (warning: {
  code?: string | null;
  overlapAreaAcres?: number | null;
}): { key: string; params: Record<string, number> } => {
  const code = warning.code && OVERLAP_WARNING_CODES.has(warning.code) ? warning.code : 'generic';
  if (code === 'overlaps_verified' && typeof warning.overlapAreaAcres === 'number' && warning.overlapAreaAcres > 0) {
    return { key: 'overlapWarning_overlaps_verified_area', params: { acres: warning.overlapAreaAcres } };
  }
  return { key: `overlapWarning_${code}`, params: {} };
};

/**
 * The persisted decision of a claim (GET /claims/:id carries the assessment) as the shape the
 * result card renders. Area numbers come from the claim itself (server-measured claimedAreaAcres
 * and the frozen parcel snapshot), never placeholders. null while there is no decision.
 */
export const verificationFromClaim = (claim: LossClaim | null): VerificationDecision | null => {
  const assessment = claim?.assessment;
  if (!claim || !assessment || !assessment.state) return null;
  return {
    claimId: claim.id,
    idempotent: true,
    inProgress: false,
    claimState: claim.state,
    outcome: assessment.state,
    decision: assessment.state,
    reason: assessment.reason,
    rules: assessment.rules,
    approvedGeometry: assessment.approvedGeometry,
    approvedAreaAcres: assessment.approvedAreaAcres,
    weatherCorrelation: assessment.weatherCorrelation,
    decidedAt: assessment.decidedAt,
    decidedBy: assessment.decidedBy,
    claimedAreaAcres: claim.claimedAreaAcres,
    parcelAreaAcres: claim.parcelSnapshot?.parcelAreaAcres ?? null,
    evidenceVersion: null,
    engineVersion: null,
    verifiedAreaAcres: assessment.verifiedAreaAcres ?? null,
    remainingEligible: assessment.remainingEligible ?? null,
    previouslyVerifiedAcres: assessment.previouslyVerifiedAcres ?? null,
    inFlightAreaAcres: assessment.inFlightAreaAcres ?? null,
    overlapWarnings: assessment.overlapWarnings ?? [],
    spatialEvaluated: assessment.spatialEvaluated ?? false,
    held: assessment.held ?? false,
    pendingComponents: assessment.pendingComponents ?? [],
    components: assessment.components ?? null,
    policyId: assessment.policyId,
    policyHash: assessment.policyHash ?? null,
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

// ── ADR-020 component checklist (held claims) ──────────────────────────────────────────────
// Turns the backend's per-component outcomes into farmer-facing rows using the contract §1.3
// wording. Nothing here decides anything: it only chooses honest words for what the backend
// reported. `unavailable` / `inconclusive` are never presented as failures, and satellite and
// weather (supporting evidence) are never presented as failed.

export const VERIFICATION_COMPONENT_ORDER: VerificationComponentName[] = [
  'parcel_identity',
  'claimant_rights',
  'land_documents',
  'geometry',
  'overlap',
  'photos',
  'crop',
  'satellite',
  'weather',
  'manual_review',
];

export const SUPPORTING_COMPONENTS: ReadonlySet<VerificationComponentName> = new Set([
  'satellite',
  'weather',
]);

// A specific thing the farmer is asked for (or that does not match), derived from reasonCodes.
export type ComponentNeed =
  | { kind: 'documents'; categories: OwnershipDocumentCategory[] }
  | { kind: 'reason'; key: string };

export interface ComponentChecklistRow {
  name: VerificationComponentName;
  labelKey: string;
  outcome: VerificationComponentOutcome;
  // i18n key for the status sentence (contract §1.3 wording).
  statusKey: string;
  tone: 'ok' | 'waiting' | 'action' | 'neutral' | 'mismatch';
  required: boolean;
  // The farmer can resolve this one (unverified/failed with actionableBy farmer).
  farmerAction: boolean;
  // Listed in pendingComponents: this is what is holding the claim.
  blocking: boolean;
  supportingOnly: boolean;
  needs: ComponentNeed[];
}

const KNOWN_REASON_CODES: ReadonlySet<string> = new Set([
  'no_registered_parcel',
  'outside_registered_parcel',
  'no_photographs',
  'photo_quality_too_poor',
  'ai_no_damage_detected',
  'no_land_document',
  'no_ownership_evidence',
  'document_reviewed_insufficient',
  'document_reviewed_inconsistent',
  'duplicates_verified_claim',
]);

const MISSING_CATEGORY_PREFIX = 'missing_document_category:';

// reasonCodes → what the farmer needs to provide / what does not match. Unknown codes are not
// shown verbatim (they are identifiers, not sentences); a generic need stands in for them.
export const componentNeeds = (reasonCodes: string[]): ComponentNeed[] => {
  const needs: ComponentNeed[] = [];
  let unknown = false;
  for (const code of reasonCodes) {
    if (code.startsWith(MISSING_CATEGORY_PREFIX)) {
      const categories = code
        .slice(MISSING_CATEGORY_PREFIX.length)
        .split('|')
        .filter((c): c is OwnershipDocumentCategory =>
          (OWNERSHIP_DOCUMENT_CATEGORIES as string[]).includes(c)
        );
      if (categories.length > 0) needs.push({ kind: 'documents', categories });
      else unknown = true;
    } else if (KNOWN_REASON_CODES.has(code)) {
      needs.push({ kind: 'reason', key: `verifyReason_${code}` });
    } else if (!code.startsWith('relationship_')) {
      // `relationship_<x>` only echoes the declared relationship; anything else unknown falls
      // back to the generic need below when nothing more specific was found.
      unknown = true;
    }
  }
  if (needs.length === 0 && unknown) needs.push({ kind: 'reason', key: 'verifyReason_generic' });
  return needs;
};

const rowStatus = (
  outcome: VerificationComponentOutcome,
  farmerAction: boolean
): { statusKey: string; tone: ComponentChecklistRow['tone'] } => {
  switch (outcome) {
    case 'verified':
      return { statusKey: 'componentStatus_verified', tone: 'ok' };
    case 'unverified':
      return farmerAction
        ? { statusKey: 'componentStatus_unverified_farmer', tone: 'action' }
        : { statusKey: 'componentStatus_unverified', tone: 'neutral' };
    case 'pending':
      return { statusKey: 'componentStatus_pending', tone: 'waiting' };
    case 'requires_review':
      return { statusKey: 'componentStatus_requires_review', tone: 'waiting' };
    case 'unavailable':
      return { statusKey: 'componentStatus_unavailable', tone: 'neutral' };
    case 'inconclusive':
      return { statusKey: 'componentStatus_inconclusive', tone: 'neutral' };
    case 'failed':
      return { statusKey: 'componentStatus_failed', tone: 'mismatch' };
    default:
      return { statusKey: 'componentStatus_pending', tone: 'waiting' };
  }
};

// Build the ordered checklist. Rows are shown when they matter to the farmer: required ones,
// the ones holding the claim, the ones the farmer can act on, and the outcome of every check
// that actually ran. Optional checks that simply have not run yet are left out (noise).
export const componentChecklist = (
  components: VerificationComponents | null | undefined,
  pendingComponents: PendingVerificationComponent[] = []
): ComponentChecklistRow[] => {
  const blockingNames = new Set(pendingComponents.map((p) => p.component));
  const merged: Partial<Record<VerificationComponentName, VerificationComponent>> = {
    ...(components ?? {}),
  };
  // A blocking component the snapshot does not describe still gets a row.
  for (const pending of pendingComponents) {
    if (!merged[pending.component]) {
      merged[pending.component] = {
        outcome: pending.outcome,
        required: true,
        authoritative: false,
        actionableBy: pending.action === 'more_evidence_required' ? 'farmer' : 'reviewer',
        reasonCodes: [],
      };
    }
  }
  const rows: ComponentChecklistRow[] = [];
  for (const name of VERIFICATION_COMPONENT_ORDER) {
    const component = merged[name];
    if (!component) continue;
    const supportingOnly = SUPPORTING_COMPONENTS.has(name);
    // Supporting evidence is never a failure, whatever arrives (defensive; the backend already
    // guarantees it).
    const outcome: VerificationComponentOutcome =
      supportingOnly && component.outcome === 'failed' ? 'inconclusive' : component.outcome;
    const farmerAction =
      component.actionableBy === 'farmer' && (outcome === 'unverified' || outcome === 'failed');
    const blocking = blockingNames.has(name);
    const notRunYet = outcome === 'unverified' && !farmerAction;
    if (notRunYet && !component.required && !blocking) continue;
    const { statusKey, tone } = rowStatus(outcome, farmerAction);
    rows.push({
      name,
      labelKey: `verifyComponent_${name}`,
      outcome,
      statusKey,
      tone,
      required: Boolean(component.required),
      farmerAction,
      blocking,
      supportingOnly,
      needs: farmerAction ? componentNeeds(component.reasonCodes ?? []) : [],
    });
  }
  return rows;
};

// ── Verification status polling (GET /claims/:claimId/verification) ──────────────────────
// Contract §3: poll every 10 s or slower while the claim is `submitted`. The read may advance
// one queued step server-side. Polling stops on a decision, on a hold (a hold only changes when
// a person acts or the farmer adds evidence, so polling cannot resolve it), or after the budget.

export const VERIFICATION_POLL_INTERVAL_MS = 10_000;
export const VERIFICATION_POLL_MAX = 18; // ~3 minutes at 10 s

const DECIDED_CLAIM_STATES: ReadonlySet<string> = new Set([
  'verified',
  'partially_verified',
  'more_evidence_required',
  'rejected',
  'out_of_limit',
  'duplicate_area',
  'withdrawn',
]);

export type VerificationPollStatus = 'decided' | 'held' | 'continue';

export const verificationPollStatus = (claim: LossClaim): VerificationPollStatus => {
  if (claim.assessment?.state || DECIDED_CLAIM_STATES.has(claim.state)) return 'decided';
  if (claim.assessment?.held) return 'held';
  return 'continue';
};

export interface PollVerificationOptions {
  load: () => Promise<LossClaim>;
  onClaim?: (claim: LossClaim) => void;
  isCancelled?: () => boolean;
  wait?: (ms: number) => Promise<void>;
  intervalMs?: number;
  maxPolls?: number;
}

export type PollVerificationResult =
  | { status: 'decided' | 'held'; claim: LossClaim; polls: number }
  | { status: 'exhausted' | 'cancelled'; claim: LossClaim | null; polls: number };

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Sequential poll loop: waits FIRST (the caller just got a fresh /verify answer), never overlaps
// requests, treats a failed read as transient, and enforces both a floor on the interval and a
// hard cap on the number of reads.
/**
 * @deprecated Since the claim tracker (plan B4/B5) the farmer UI no longer calls /verify, so nothing
 * starts this loop. Progress is polled by `useClaimProgress` (src/hooks/useClaimProgress.ts) with
 * the scheduler in src/utils/progressPolling.ts. Kept, with its tests, until a later clean-up.
 */
export const pollVerificationUntilSettled = async ({
  load,
  onClaim,
  isCancelled = () => false,
  wait = defaultWait,
  intervalMs = VERIFICATION_POLL_INTERVAL_MS,
  maxPolls = VERIFICATION_POLL_MAX,
}: PollVerificationOptions): Promise<PollVerificationResult> => {
  const interval = Math.max(VERIFICATION_POLL_INTERVAL_MS, intervalMs);
  let last: LossClaim | null = null;
  for (let polls = 1; polls <= maxPolls; polls += 1) {
    await wait(interval);
    if (isCancelled()) return { status: 'cancelled', claim: last, polls: polls - 1 };
    try {
      last = await load();
    } catch {
      continue; // transient — try again on the next tick
    }
    if (isCancelled()) return { status: 'cancelled', claim: last, polls };
    onClaim?.(last);
    const status = verificationPollStatus(last);
    if (status !== 'continue') return { status, claim: last, polls };
  }
  return { status: 'exhausted', claim: last, polls: maxPolls };
};
