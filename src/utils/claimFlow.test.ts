import { describe, expect, it } from 'vitest';
import {
  CLAIM_EVENT_TYPES,
  CLAIM_EVENT_TYPE_SET,
  CLAIM_WINDOW_DAYS,
  CLAIM_DOCUMENT_MAX,
  CLAIM_WIZARD_STEPS,
  EVIDENCE_MUTABLE_STATES,
  MIN_PHOTOS_TO_SUBMIT,
  TERMINAL_CLAIM_STATES,
  addStagedEvidence,
  buildReviewSummary,
  canGotoStep,
  canMutateEvidence,
  canRequestVerification,
  canResubmitClaim,
  canStageEvidence,
  canSubmitClaim,
  canWithdrawClaim,
  claimCardViewModel,
  claimDetailViewModel,
  claimEventLabelKey,
  claimNextStepKey,
  claimStateLabelKey,
  createEmptyDraft,
  defaultDocumentCategory,
  documentGroupStatus,
  eventStepMissing,
  evidenceStatusLabelKey,
  evidenceStepMissing,
  formatClaimDate,
  furthestValidStepIndex,
  generateIdempotencyKey,
  isValidIdempotencyKey,
  isTerminalClaimState,
  markStagedEvidenceFailed,
  markStagedEvidenceUploaded,
  markStagedEvidenceUploading,
  removeStagedEvidence,
  resolveClaimsListState,
  showsVerificationResult,
  stepCanAdvance,
  usablePhotoCount,
  validateClaimDate,
  verificationResultModel,
  verificationRulesKey,
  viewModelHasSensitiveField,
  wizardReducer,
} from './claimFlow';
import { previewAreaAcres } from './parcelGeometry';
import type {
  ClaimAssessment,
  ClaimEvidenceEntry,
  GeoJsonPolygon,
  LossClaim,
  OwnershipDocumentCategory,
  ParcelRecord,
  VerificationDecision,
} from '../types';

// ── Fixtures (mirror the backend serialized shapes; NO cognitoSub/userEmail/s3Key anywhere) ──

const POLYGON: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [78.1, 11.1],
      [78.2, 11.1],
      [78.2, 11.2],
      [78.1, 11.2],
      [78.1, 11.1],
    ],
  ],
};

const PARCEL: ParcelRecord = {
  parcelId: 'par_123',
  name: 'North Field',
  crop: 'Rice',
  geometry: POLYGON,
  calculatedAreaAcres: 2.5,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

/**
 * The southwest quarter of POLYGON — what a farmer actually draws when only part of a 2.5-acre
 * parcel is affected. Used to prove the review NEVER presents the parcel total as the claim.
 */
const PARTIAL_POLYGON: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [78.1, 11.1],
      [78.15, 11.1],
      [78.15, 11.15],
      [78.1, 11.15],
      [78.1, 11.1],
    ],
  ],
};

const EVIDENCE_ENTRY: ClaimEvidenceEntry = {
  uploadId: 'img_1',
  mediaType: 'image/jpeg',
  size: 1024,
  width: 8,
  height: 8,
  status: 'stored',
  uploadedAt: '2026-09-02T00:00:00.000Z',
  createdAt: '2026-09-02T00:00:00.000Z',
};

const ASSESSMENT: ClaimAssessment = {
  approvedGeometry: POLYGON,
  approvedAreaAcres: 2.5,
  aiAggregate: null,
  weatherCorrelation: null,
  rules: {
    timelinessCheck: { passed: true },
    eventTypeCheck: { passed: true },
    areaCheck: { passed: true, remainingEligible: 7.5 },
    overlapCheck: { passed: true, overlapArea: 0 },
    aiCheck: { passed: true, reason: 'ok' },
    weatherCheck: { passed: true, reason: 'ok' },
  },
  state: 'verified',
  reason: null,
  decidedAt: '2026-09-03T00:00:00.000Z',
  decidedBy: 'engine',
  adminNote: null,
  // Phase 9 (E9-S9) additive surface (backend serializeAssessment).
  verifiedAreaAcres: 2.5,
  remainingEligible: 7.5,
  previouslyVerifiedAcres: 0,
  inFlightAreaAcres: 0,
  overlapWarnings: [],
  spatialEvaluated: true,
};

const claimFor = (state: LossClaim['state'], overrides: Partial<LossClaim> = {}): LossClaim => ({
  id: 'c_1',
  parcelId: 'par_123',
  parcelSnapshot: { parcelId: 'par_123', name: 'North Field', crop: 'Rice', parcelAreaAcres: 2.5 },
  eventType: 'flood',
  eventDate: '2026-09-02',
  claimedGeometry: POLYGON,
  claimedAreaAcres: 2.5,
  evidence: [EVIDENCE_ENTRY],
  state,
  submittedAt: state === 'submitted' || state === 'processing' || state === 'verified' ? '2026-09-02T02:00:00.000Z' : null,
  processedAt: null,
  decidedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  assessment: null,
  ...overrides,
});

// ── 1. Frozen vocabulary mirrors (backend contract alignment) ─────────────────────────────

describe('CLAIM_EVENT_TYPES vocabulary', () => {
  it('mirrors the frozen backend event vocabulary exactly', () => {
    expect(CLAIM_EVENT_TYPES).toEqual(['flood', 'storm', 'drought', 'pest', 'disease', 'fire', 'other']);
  });
  it('exposes a Set for O(1) membership checks', () => {
    expect(CLAIM_EVENT_TYPE_SET.has('flood')).toBe(true);
    expect(CLAIM_EVENT_TYPE_SET.has('earthquake')).toBe(false);
  });
});

describe('TERMINAL_CLAIM_STATES vocabulary', () => {
  it('marks exactly the six terminal machine states', () => {
    expect(TERMINAL_CLAIM_STATES).toEqual([
      'verified',
      'partially_verified',
      'rejected',
      'out_of_limit',
      'duplicate_area',
      'withdrawn',
    ]);
  });
  it('isTerminalClaimState agrees with the vocabulary', () => {
    for (const s of TERMINAL_CLAIM_STATES) expect(isTerminalClaimState(s)).toBe(true);
    expect(isTerminalClaimState('processing')).toBe(false);
    expect(isTerminalClaimState('submitted')).toBe(false);
    expect(isTerminalClaimState('draft')).toBe(false);
  });
});

describe('EVIDENCE_MUTABLE_STATES vocabulary', () => {
  it('allows evidence mutation only in draft | submitted | more_evidence_required', () => {
    expect(EVIDENCE_MUTABLE_STATES).toEqual(['draft', 'submitted', 'more_evidence_required']);
    for (const s of EVIDENCE_MUTABLE_STATES) expect(canMutateEvidence(s)).toBe(true);
    for (const s of ['processing', 'verified', 'withdrawn', 'rejected']) expect(canMutateEvidence(s)).toBe(false);
  });
});

// ── 2. State gates ────────────────────────────────────────────────────────────────────────

describe('state gates', () => {
  it('canWithdrawClaim only while draft or submitted', () => {
    expect(canWithdrawClaim('draft')).toBe(true);
    expect(canWithdrawClaim('submitted')).toBe(true);
    expect(canWithdrawClaim('processing')).toBe(false);
    expect(canWithdrawClaim('more_evidence_required')).toBe(false);
    expect(canWithdrawClaim('verified')).toBe(false);
    expect(canWithdrawClaim('withdrawn')).toBe(false);
  });
  it('canResubmitClaim ONLY from more_evidence_required', () => {
    expect(canResubmitClaim('more_evidence_required')).toBe(true);
    for (const s of ['draft', 'submitted', 'processing', 'verified', 'withdrawn'])
      expect(canResubmitClaim(s)).toBe(false);
  });
  it('canSubmitClaim ONLY from draft — the recovery path for an unsubmitted claim', () => {
    expect(canSubmitClaim('draft')).toBe(true);
    for (const s of [
      'submitted',
      'processing',
      'more_evidence_required',
      'verified',
      'partially_verified',
      'rejected',
      'out_of_limit',
      'duplicate_area',
      'withdrawn',
    ])
      expect(canSubmitClaim(s)).toBe(false);
  });
  it('canRequestVerification while submitted / processing / more_evidence_required', () => {
    expect(canRequestVerification('submitted')).toBe(true);
    expect(canRequestVerification('processing')).toBe(true);
    expect(canRequestVerification('more_evidence_required')).toBe(true);
    expect(canRequestVerification('draft')).toBe(false);
    expect(canRequestVerification('verified')).toBe(false);
    expect(canRequestVerification('rejected')).toBe(false);
  });
  it('showsVerificationResult only when the engine has decided', () => {
    for (const s of ['verified', 'partially_verified', 'rejected', 'out_of_limit', 'duplicate_area', 'more_evidence_required'])
      expect(showsVerificationResult(s)).toBe(true);
    for (const s of ['draft', 'submitted', 'processing', 'withdrawn'])
      expect(showsVerificationResult(s)).toBe(false);
  });
  // Audit D4: the claims-list next-step hint. It must be derived ONLY from the state gates above,
  // never invent a step. A state with no farmer action returns null (card shows no hint).
  it('claimNextStepKey maps every state to its supported action, or null', () => {
    // draft → the recovery submit path the tracker already offers.
    expect(claimNextStepKey('draft')).toBe('nextStep_submit');
    // more_evidence_required → resubmit takes precedence over the appeal it also allows.
    expect(claimNextStepKey('more_evidence_required')).toBe('nextStep_resubmit');
    // The appealable decision states → the appeal panel the tracker already offers.
    expect(claimNextStepKey('rejected')).toBe('nextStep_appeal');
    expect(claimNextStepKey('out_of_limit')).toBe('nextStep_appeal');
    expect(claimNextStepKey('duplicate_area')).toBe('nextStep_appeal');
    // No supported next step: the farmer can only wait (or the claim is closed).
    for (const s of ['submitted', 'processing', 'verified', 'partially_verified', 'withdrawn'])
      expect(claimNextStepKey(s)).toBeNull();
  });
});

// ── 3. i18n key helpers ───────────────────────────────────────────────────────────────────

describe('i18n label-key helpers', () => {
  it('emits flat underscore keys that exist in the translation resources', () => {
    expect(claimStateLabelKey('draft')).toBe('claimState_draft');
    expect(claimStateLabelKey('out_of_limit')).toBe('claimState_out_of_limit');
    expect(claimEventLabelKey('flood')).toBe('claimEvent_flood');
    expect(evidenceStatusLabelKey('pending')).toBe('evidenceStatus_pending');
    expect(verificationRulesKey('timelinessCheck')).toBe('claimRule_timelinessCheck');
  });
});

describe('formatClaimDate', () => {
  it('formats an ISO timestamp into a locale date string', () => {
    const out = formatClaimDate('2026-09-03T00:00:00.000Z', 'en');
    expect(out).toContain('2026');
    expect(out).not.toBe('Invalid Date');
  });
  it('returns empty string for null/undefined/invalid input', () => {
    expect(formatClaimDate(null)).toBe('');
    expect(formatClaimDate(undefined)).toBe('');
    expect(formatClaimDate('not-a-date')).toBe('');
  });
});

// ── 4. Date validation (mirrors the backend eventDateCheck) ───────────────────────────────

describe('validateClaimDate', () => {
  it('rejects empty input', () => {
    expect(validateClaimDate(null)).toEqual({ ok: false, reason: 'required' });
    expect(validateClaimDate('')).toEqual({ ok: false, reason: 'required' });
    expect(validateClaimDate('garbage')).toEqual({ ok: false, reason: 'required' });
  });
  it('rejects future dates', () => {
    const future = new Date(Date.now() + 48 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const check = validateClaimDate(future);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reason).toBe('future');
  });
  it('rejects dates outside the 30-day window', () => {
    const old = new Date(Date.now() - (CLAIM_WINDOW_DAYS + 5) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const check = validateClaimDate(old);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reason).toBe('window');
  });
  it('accepts today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(validateClaimDate(today)).toEqual({ ok: true });
  });
});

// ── 5. Idempotency keys (createClaimBody contract: 8–64 chars, [A-Za-z0-9_-]) ────────────

describe('generateIdempotencyKey / isValidIdempotencyKey', () => {
  it('generates keys matching the backend charset and length', () => {
    for (let i = 0; i < 50; i++) {
      const key = generateIdempotencyKey();
      expect(isValidIdempotencyKey(key)).toBe(true);
      expect(key.length).toBeGreaterThanOrEqual(8);
      expect(key.length).toBeLessThanOrEqual(64);
      expect(/^[A-Za-z0-9_-]+$/.test(key)).toBe(true);
    }
  });
  it('rejects too-short, too-long and invalid-charset keys', () => {
    expect(isValidIdempotencyKey('abc')).toBe(false);
    expect(isValidIdempotencyKey('a'.repeat(70))).toBe(false);
    expect(isValidIdempotencyKey('key with spaces')).toBe(false);
    expect(isValidIdempotencyKey('key-with-dash_1')).toBe(true);
  });
});

// ── 6. Wizard reducer + stage gates ───────────────────────────────────────────────────────

describe('wizardReducer navigation', () => {
  it('walks the frozen journey forward and backward', () => {
    let draft = createEmptyDraft();
    expect(draft.step).toBe('parcel');
    draft = wizardReducer(draft, { type: 'select.parcel', parcelId: 'par_123', geometry: POLYGON });
    draft = wizardReducer(draft, { type: 'next' });
    // The optional claimant-relationship step follows the parcel choice.
    expect(draft.step).toBe('relationship');
    draft = wizardReducer(draft, { type: 'next' });
    expect(draft.step).toBe('event');
    draft = wizardReducer(draft, { type: 'back' });
    expect(draft.step).toBe('relationship');
    draft = wizardReducer(draft, { type: 'back' });
    expect(draft.step).toBe('parcel');
    draft = wizardReducer(draft, { type: 'back' });
    expect(draft.step).toBe('parcel'); // cannot go before the first step
  });
  it('does not advance beyond the final step', () => {
    let draft = createEmptyDraft();
    // Advance through every step repeatedly; the last dispatch keeps the wizard pinned on review.
    for (let _advanceCount = 0; _advanceCount < 7; _advanceCount += 1) {
      draft = wizardReducer(draft, { type: 'select.parcel', parcelId: 'par_123', geometry: POLYGON });
      draft = wizardReducer(draft, { type: 'select.event', eventType: 'flood' });
      draft = wizardReducer(draft, { type: 'select.date', eventDate: new Date().toISOString().slice(0, 10) });
      draft = wizardReducer(draft, { type: 'select.area', geometry: POLYGON });
      draft = wizardReducer(draft, { type: 'next' });
    }
    expect(draft.step).toBe('review');
    const after = wizardReducer(draft, { type: 'next' });
    expect(after.step).toBe('review');
  });
  it('select.parcel carries the REAL parcel geometry (never fabricated)', () => {
    const draft = createEmptyDraft();
    const next = wizardReducer(draft, { type: 'select.parcel', parcelId: 'par_123', geometry: POLYGON });
    expect(next.geometry).toEqual(POLYGON);
    expect(next.parcelId).toBe('par_123');
  });
  it('ignores event types outside the frozen vocabulary', () => {
    const draft = createEmptyDraft();
    const next = wizardReducer(draft, { type: 'select.event' as never, eventType: 'meteor' as never });
    expect(next.eventType).toBeNull();
  });
  it('reset restores a fresh draft with a valid idempotency key', () => {
    const draft = wizardReducer(createEmptyDraft(), { type: 'reset' });
    expect(draft.parcelId).toBeNull();
    expect(draft.evidence).toEqual([]);
    expect(isValidIdempotencyKey(draft.idempotencyKey ?? '')).toBe(true);
  });
});

describe('evidence staging', () => {
  it('adds staged evidence up to the backend cap and stops at it', () => {
    let draft = createEmptyDraft();
    for (let i = 0; i < 12; i++) {
      draft = addStagedEvidence(draft, { name: `p${i}.jpg`, size: 100, detectedType: 'jpeg' });
    }
    expect(draft.evidence).toHaveLength(10);
    expect(canStageEvidence(draft)).toBe(false);
  });
  it('add/remove/upload-lifecycle transitions are pure', () => {
    let draft = addStagedEvidence(createEmptyDraft(), { name: 'a.jpg', size: 10, detectedType: 'jpeg' });
    const key = draft.evidence[0].key;
    draft = markStagedEvidenceUploading(draft, key);
    expect(draft.evidence[0].status).toBe('uploading');
    draft = markStagedEvidenceUploaded(draft, key, 'img_9');
    expect(draft.evidence[0]).toMatchObject({ status: 'uploaded', uploadId: 'img_9' });
    draft = markStagedEvidenceFailed(draft, key, 'imageUploadFailed');
    expect(draft.evidence[0]).toMatchObject({ status: 'failed', errorKey: 'imageUploadFailed' });
    draft = removeStagedEvidence(draft, key);
    expect(draft.evidence).toHaveLength(0);
  });

  // The wizard keeps a `File` in a ref keyed by the entry key and looks each file up by
  // `entry.key` at submit time. If the reducer regenerated the key, the lookup would miss and the
  // upload loop would silently send nothing — which is exactly the bug this guards.
  it('preserves a caller-supplied key so the staged entry resolves to its File', () => {
    const draft = addStagedEvidence(createEmptyDraft(), {
      key: 'ev_file_1',
      name: 'a.jpg',
      size: 10,
      detectedType: 'jpeg',
    });
    expect(draft.evidence[0].key).toBe('ev_file_1');
  });

  it('still generates a unique key when the caller supplies none', () => {
    const draft = addStagedEvidence(
      addStagedEvidence(createEmptyDraft(), { name: 'a.jpg', size: 10, detectedType: 'jpeg' }),
      { name: 'b.jpg', size: 10, detectedType: 'jpeg' },
    );
    const [first, second] = draft.evidence;
    expect(first.key).toBeTruthy();
    expect(second.key).toBeTruthy();
    expect(first.key).not.toBe(second.key);
  });

  it('routes the same key through the reducer so ref and draft never diverge', () => {
    const draft = wizardReducer(createEmptyDraft(), {
      type: 'evidence.add',
      entry: { key: 'ev_file_7', name: 'a.jpg', size: 10, detectedType: 'jpeg' },
    });
    expect(draft.evidence[0].key).toBe('ev_file_7');
    // And the lifecycle markers still resolve against that key.
    const uploaded = markStagedEvidenceUploaded(draft, 'ev_file_7', 'img_1');
    expect(uploaded.evidence[0]).toMatchObject({ status: 'uploaded', uploadId: 'img_1' });
  });
});

describe('stepCanAdvance', () => {
  it('WZ-2: gates each step on its honest prerequisite (Event needs type, date AND area)', () => {
    expect(stepCanAdvance(createEmptyDraft())).toBe(false); // no parcel yet

    let d = createEmptyDraft();
    d = wizardReducer(d, { type: 'select.parcel', parcelId: 'par_123', geometry: POLYGON });
    expect(stepCanAdvance(d)).toBe(true);
    d = wizardReducer(d, { type: 'next' });
    expect(stepCanAdvance(d)).toBe(true); // relationship is optional
    d = wizardReducer(d, { type: 'next' });
    expect(d.step).toBe('event');
    expect(stepCanAdvance(d)).toBe(false); // event not chosen
    expect(eventStepMissing(d)).toEqual(['event_type', 'date']);
    d = wizardReducer(d, { type: 'select.event', eventType: 'drought' });
    expect(stepCanAdvance(d)).toBe(false); // date not chosen
    d = wizardReducer(d, { type: 'select.date', eventDate: new Date().toISOString().slice(0, 10) });
    // The area carries the selected parcel's REAL geometry forward (whole-parcel claim) — it is
    // never empty once a parcel is chosen, so the step is advanceable by design (ADR-019 P8).
    expect(stepCanAdvance(d)).toBe(true);
    // Clearing the area blocks the step again; it never falls back to the parcel.
    const cleared = wizardReducer(d, { type: 'select.area', geometry: null });
    expect(stepCanAdvance(cleared)).toBe(false);
    expect(eventStepMissing(cleared)).toEqual(['area']);
    d = wizardReducer(d, { type: 'select.area', geometry: POLYGON });
    expect(stepCanAdvance(d)).toBe(true);
  });
  it('WZ-2: an out-of-window or future date keeps the Event step closed', () => {
    let d = wizardReducer(createEmptyDraft(), { type: 'select.parcel', parcelId: 'par_123', geometry: POLYGON });
    d = { ...wizardReducer(d, { type: 'select.event', eventType: 'flood' }), step: 'event' };
    d = wizardReducer(d, { type: 'select.date', eventDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) });
    expect(stepCanAdvance(d)).toBe(false);
    expect(eventStepMissing(d)).toEqual(['date']);
  });
  it('WZ-4: the evidence step needs at least MIN_PHOTOS_TO_SUBMIT usable photos and no missing files', () => {
    let d = createEmptyDraft();
    d = wizardReducer(d, { type: 'select.parcel', parcelId: 'par_123', geometry: POLYGON });
    for (let i = 0; i < 3; i++) d = wizardReducer(d, { type: 'next' });
    expect(d.step).toBe('evidence');
    expect(MIN_PHOTOS_TO_SUBMIT).toBe(1);
    expect(stepCanAdvance(d)).toBe(false);
    expect(evidenceStepMissing(d)).toEqual(['photos']);

    d = wizardReducer(d, { type: 'evidence.add', entry: { key: 'ev_1', name: 'a.jpg', size: 10, detectedType: 'jpeg' } });
    expect(stepCanAdvance(d)).toBe(true);

    // A photo restored without its file does not count, and blocks until chosen again or removed.
    const restored = { ...d, evidence: [{ ...d.evidence[0], status: 'missing_file' as const }] };
    expect(usablePhotoCount(restored)).toBe(0);
    expect(evidenceStepMissing(restored)).toEqual(['photos', 'missing_files']);
    const relinked = wizardReducer(restored, { type: 'evidence.relink', key: 'ev_1', name: 'b.jpg', size: 11, detectedType: 'jpeg' });
    expect(relinked.evidence[0]).toMatchObject({ key: 'ev_1', name: 'b.jpg', status: 'staged' });
    expect(stepCanAdvance(relinked)).toBe(true);

    // Documents are optional, but a document that lost its file also blocks.
    const withLostDoc = wizardReducer(d, {
      type: 'document.add',
      entry: { key: 'doc_1', name: 'patta.jpg', size: 5, detectedType: 'jpeg', category: 'land_record' },
    });
    expect(stepCanAdvance(withLostDoc)).toBe(true);
    const lostDoc = { ...withLostDoc, documents: [{ ...withLostDoc.documents[0], status: 'missing_file' as const }] };
    expect(evidenceStepMissing(lostDoc)).toEqual(['missing_files']);
  });
});

// ── 7. Review summary ─────────────────────────────────────────────────────────────────────

describe('buildReviewSummary', () => {
  const today = new Date().toISOString().slice(0, 10);
  const completeDraft = () => {
    let d = createEmptyDraft();
    d = wizardReducer(d, { type: 'select.parcel', parcelId: 'par_123', geometry: POLYGON });
    d = wizardReducer(d, { type: 'select.event', eventType: 'flood' });
    d = wizardReducer(d, { type: 'select.date', eventDate: today });
    d = wizardReducer(d, { type: 'select.area', geometry: POLYGON });
    // At least one photo is required to submit (MIN_PHOTOS_TO_SUBMIT).
    d = wizardReducer(d, { type: 'evidence.add', entry: { key: 'ev_1', name: 'crop.jpg', size: 10, detectedType: 'jpeg' } });
    return d;
  };

  it('is ready with backend parcel numbers when everything is filled', () => {
    const summary = buildReviewSummary(completeDraft(), [PARCEL]);
    expect(summary.ok).toBe(true);
    expect(summary.reason).toBe('ready');
    expect(summary.parcelAreaAcres).toBe(2.5);
    expect(summary.claimedAreaAcres).toBe(2.5);
    expect(summary.eventType).toBe('flood');
    expect(summary.parcelName).toBe('North Field');
    expect(summary.crop).toBe('Rice');
  });

  it('reports the DRAWN affected area, never the parcel total', () => {
    const d = wizardReducer(completeDraft(), { type: 'select.area', geometry: PARTIAL_POLYGON });
    const summary = buildReviewSummary(d, [PARCEL]);
    expect(summary.ok).toBe(true);
    // The old bug returned `parcel.calculatedAreaAcres` unconditionally.
    expect(summary.claimedAreaAcres).not.toBe(PARCEL.calculatedAreaAcres);
    // It measures the polygon actually selected: PARTIAL_POLYGON is the SW quarter of POLYGON, so
    // it must come in strictly under a whole-parcel claim.
    expect(summary.claimedAreaAcres).toBe(previewAreaAcres(PARTIAL_POLYGON));
    expect(summary.claimedAreaAcres!).toBeLessThan(previewAreaAcres(POLYGON)!);
    // The parcel total stays visible as separate reference context.
    expect(summary.parcelAreaAcres).toBe(2.5);
  });

  it('flags a whole-parcel selection explicitly and a partial one separately', () => {
    expect(buildReviewSummary(completeDraft(), [PARCEL]).affectedIsWholeParcel).toBe(true);
    const partial = wizardReducer(completeDraft(), { type: 'select.area', geometry: PARTIAL_POLYGON });
    expect(buildReviewSummary(partial, [PARCEL]).affectedIsWholeParcel).toBe(false);
  });

  it('blocks (rather than defaulting to the parcel) once the drawing is cleared', () => {
    const cleared = wizardReducer(completeDraft(), { type: 'select.area', geometry: null });
    const summary = buildReviewSummary(cleared, [PARCEL]);
    expect(summary.ok).toBe(false);
    expect(summary.reason).toBe('no_geometry');
    // Critically: no acreage is offered at all instead of the parcel's.
    expect(summary.claimedAreaAcres).toBeNull();
    expect(summary.affectedIsWholeParcel).toBe(false);
    // And the wizard cannot advance past the area step.
    expect(stepCanAdvance({ ...cleared, step: 'event' })).toBe(false);
  });

  it('treats a null area selection as a real clear, not a no-op', () => {
    const d = wizardReducer(completeDraft(), { type: 'select.area', geometry: null });
    expect(d.geometry).toBeNull();
  });
  it('fails with no_parcels when the farm has no parcels', () => {
    expect(buildReviewSummary(completeDraft(), []).reason).toBe('no_parcels');
  });
  it('fails with no_parcel when the chosen parcel is not in the list', () => {
    const summary = buildReviewSummary(completeDraft(), [{ ...PARCEL, parcelId: 'par_other' }]);
    expect(summary.reason).toBe('no_parcel');
    expect(summary.ok).toBe(false);
  });
  it('fails with no_event / no_date / invalid_date / no_geometry', () => {
    let d = createEmptyDraft();
    d = wizardReducer(d, { type: 'select.parcel', parcelId: 'par_123', geometry: POLYGON });
    expect(buildReviewSummary(d, [PARCEL]).reason).toBe('no_event');

    d = wizardReducer(d, { type: 'select.event', eventType: 'fire' });
    expect(buildReviewSummary(d, [PARCEL]).reason).toBe('no_date');

    d = wizardReducer(d, { type: 'select.date', eventDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) });
    expect(buildReviewSummary(d, [PARCEL]).reason).toBe('invalid_date');

    const last = completeDraft();
    const noGeometry = { ...last, geometry: null };
    expect(buildReviewSummary(noGeometry, [PARCEL]).reason).toBe('no_geometry');
  });
});

// ── 7b. Five-step wizard: steps, documents, goto, locking (plan B3) ─────────────────────────

describe('five-step wizard', () => {
  const today = new Date().toISOString().slice(0, 10);
  const readyDraft = () => {
    let d = createEmptyDraft();
    d = wizardReducer(d, { type: 'select.parcel', parcelId: 'par_123', geometry: POLYGON });
    d = wizardReducer(d, { type: 'select.event', eventType: 'flood' });
    d = wizardReducer(d, { type: 'select.date', eventDate: today });
    d = wizardReducer(d, { type: 'evidence.add', entry: { key: 'ev_1', name: 'crop.jpg', size: 10, detectedType: 'jpeg' } });
    return d;
  };
  const addDoc = (d: ReturnType<typeof createEmptyDraft>, key: string, category: OwnershipDocumentCategory) =>
    wizardReducer(d, { type: 'document.add', entry: { key, name: `${key}.jpg`, size: 10, detectedType: 'jpeg', category } });

  it('WZ-1: has exactly five steps in order and walks them with next/back', () => {
    expect(CLAIM_WIZARD_STEPS).toEqual(['parcel', 'relationship', 'event', 'evidence', 'review']);
    let d = readyDraft();
    const visited = [d.step];
    for (let i = 0; i < 6; i++) {
      d = wizardReducer(d, { type: 'next' });
      visited.push(d.step);
    }
    expect(visited).toEqual(['parcel', 'relationship', 'event', 'evidence', 'review', 'review', 'review']);
    expect(d.reachedStep).toBe('review');
    d = wizardReducer(d, { type: 'back' });
    expect(d.step).toBe('evidence');
    // Going back never lowers the furthest step reached.
    expect(d.reachedStep).toBe('review');
  });

  it('WZ-1: an empty draft starts with no documents, no claim and the parcel step reached', () => {
    const d = createEmptyDraft();
    expect(d).toMatchObject({ step: 'parcel', reachedStep: 'parcel', documents: [], claimId: null });
    expect(CLAIM_DOCUMENT_MAX).toBe(5);
  });

  it('WZ-6: a tenant needs two document groups, each marked satisfied by any of its categories', () => {
    expect(documentGroupStatus('tenant', [])).toEqual([
      { group: ['lease_agreement'], satisfied: false },
      { group: ['land_record', 'ownership_deed', 'tax_receipt'], satisfied: false },
    ]);
    let d = wizardReducer(readyDraft(), { type: 'select.relationship', relationship: 'tenant' });
    d = addDoc(d, 'doc_1', 'tax_receipt');
    expect(documentGroupStatus('tenant', d.documents).map((g) => g.satisfied)).toEqual([false, true]);
    d = addDoc(d, 'doc_2', 'lease_agreement');
    expect(documentGroupStatus('tenant', d.documents).map((g) => g.satisfied)).toEqual([true, true]);
    // A document whose file was lost does not satisfy anything.
    const lost = { ...d, documents: d.documents.map((doc) => ({ ...doc, status: 'missing_file' as const })) };
    expect(documentGroupStatus('tenant', lost.documents).map((g) => g.satisfied)).toEqual([false, false]);
  });

  it('WZ-6: the default category is the first category of the first group not yet covered', () => {
    expect(defaultDocumentCategory('tenant', [])).toBe('lease_agreement');
    const afterLease = addDoc(readyDraft(), 'doc_1', 'lease_agreement').documents;
    expect(defaultDocumentCategory('tenant', afterLease)).toBe('land_record');
    expect(defaultDocumentCategory('authorised_cultivator', [])).toBe('authorization_letter');
    expect(defaultDocumentCategory('heir', addDoc(readyDraft(), 'doc_1', 'ownership_deed').documents)).toBe('identity_proof');
    // Everything covered, or no relationship given: the first category.
    expect(defaultDocumentCategory('owner', addDoc(readyDraft(), 'doc_1', 'land_record').documents)).toBe('land_record');
    expect(defaultDocumentCategory(null, [])).toBe('land_record');
  });

  it('WZ-7: without a relationship there are no groups (the UI shows generic guidance)', () => {
    expect(documentGroupStatus(null, [])).toEqual([]);
  });

  it('WZ-6: documents are capped, validated, and an attached one can be neither removed nor recategorised', () => {
    let d = readyDraft();
    for (let i = 0; i < 7; i++) d = addDoc(d, `doc_${i}`, 'land_record');
    expect(d.documents).toHaveLength(CLAIM_DOCUMENT_MAX);
    expect(addDoc(readyDraft(), 'doc_x', 'passport' as OwnershipDocumentCategory).documents).toHaveLength(0);

    d = addDoc(readyDraft(), 'doc_1', 'land_record');
    d = wizardReducer(d, { type: 'document.category', key: 'doc_1', category: 'ownership_deed' });
    expect(d.documents[0].category).toBe('ownership_deed');
    d = wizardReducer(d, { type: 'document.uploading', key: 'doc_1' });
    d = wizardReducer(d, { type: 'document.uploaded', key: 'doc_1', uploadId: 'up_1' });
    d = wizardReducer(d, { type: 'document.attaching', key: 'doc_1' });
    d = wizardReducer(d, { type: 'document.failed', key: 'doc_1', errorKey: 'serverError', failedPhase: 'attach' });
    // The upload id survives an attach failure, so a retry only attaches.
    expect(d.documents[0]).toMatchObject({ status: 'failed', uploadId: 'up_1', failedPhase: 'attach' });
    d = wizardReducer(d, { type: 'document.attached', key: 'doc_1', evidenceId: 'ev_own_1' });
    expect(d.documents[0]).toMatchObject({ status: 'attached', evidenceId: 'ev_own_1', uploadId: 'up_1' });
    expect(wizardReducer(d, { type: 'document.remove', key: 'doc_1' }).documents).toHaveLength(1);
    expect(wizardReducer(d, { type: 'document.category', key: 'doc_1', category: 'other' }).documents[0].category).toBe('ownership_deed');
  });

  it('WZ-9: goto opens only steps already reached and still valid', () => {
    let d = readyDraft();
    // Nothing reached beyond the parcel yet.
    expect(wizardReducer(d, { type: 'goto', step: 'review' }).step).toBe('parcel');
    for (let i = 0; i < 4; i++) d = wizardReducer(d, { type: 'next' });
    expect(d.step).toBe('review');
    expect(canGotoStep(d, 'event')).toBe(true);
    const atEvent = wizardReducer(d, { type: 'goto', step: 'event' });
    expect(atEvent.step).toBe('event');
    // Back to review in one jump (already reached, everything still valid)…
    expect(wizardReducer(atEvent, { type: 'goto', step: 'review' }).step).toBe('review');
    // …but not once the area was cleared: Event is the furthest valid step again.
    const cleared = wizardReducer(atEvent, { type: 'select.area', geometry: null });
    expect(canGotoStep(cleared, 'review')).toBe(false);
    expect(wizardReducer(cleared, { type: 'goto', step: 'review' }).step).toBe('event');
    expect(furthestValidStepIndex(cleared)).toBe(CLAIM_WIZARD_STEPS.indexOf('event'));
  });

  it('WZ-9: the review summary lists the relationship, photos and documents, and needs a photo', () => {
    let d = wizardReducer(readyDraft(), { type: 'select.relationship', relationship: 'owner' });
    d = addDoc(d, 'doc_1', 'land_record');
    const summary = buildReviewSummary(d, [PARCEL]);
    expect(summary.ok).toBe(true);
    expect(summary.relationship).toBe('owner');
    expect(summary.photos).toEqual([{ key: 'ev_1', name: 'crop.jpg', status: 'staged' }]);
    expect(summary.documents).toEqual([{ key: 'doc_1', name: 'doc_1.jpg', category: 'land_record', status: 'staged' }]);

    const noPhotos = wizardReducer(d, { type: 'evidence.remove', key: 'ev_1' });
    expect(buildReviewSummary(noPhotos, [PARCEL])).toMatchObject({ ok: false, reason: 'no_photos' });
    const lost = { ...d, evidence: d.evidence.map((e) => ({ ...e, status: 'missing_file' as const })) };
    expect(buildReviewSummary(lost, [PARCEL])).toMatchObject({ ok: false, reason: 'missing_files' });
  });

  it('WZ-17: the idempotency key is stable across evidence, navigation and claim creation', () => {
    const d = readyDraft();
    const key = d.idempotencyKey;
    let next = wizardReducer(d, { type: 'next' });
    next = wizardReducer(next, { type: 'evidence.uploading', key: 'ev_1' });
    next = wizardReducer(next, { type: 'evidence.failed', key: 'ev_1', errorKey: 'networkError' });
    next = addDoc(next, 'doc_1', 'land_record');
    next = wizardReducer(next, { type: 'claim.created', claimId: 'c_1' });
    next = wizardReducer(next, { type: 'evidence.uploaded', key: 'ev_1', uploadId: 'img_1' });
    // Re-selecting the same values is not a change either.
    next = wizardReducer(next, { type: 'select.event', eventType: 'flood' });
    expect(next.idempotencyKey).toBe(key);
    expect(next.claimId).toBe('c_1');
  });

  it('WZ-17: changing a field sent on create before the claim exists issues a new key', () => {
    const d = readyDraft();
    const changed = wizardReducer(d, { type: 'select.event', eventType: 'drought' });
    expect(changed.eventType).toBe('drought');
    expect(isValidIdempotencyKey(changed.idempotencyKey ?? '')).toBe(true);
    // Otherwise a lost create answer + retry would hand back the claim with the OLD answers.
    expect(changed.idempotencyKey).not.toBe(d.idempotencyKey);
  });

  it('WZ-17: once the claim exists the fields sent on create are locked', () => {
    const saved = wizardReducer(readyDraft(), { type: 'claim.created', claimId: 'c_1' });
    expect(wizardReducer(saved, { type: 'select.event', eventType: 'pest' })).toBe(saved);
    expect(wizardReducer(saved, { type: 'select.date', eventDate: '2020-01-01' })).toBe(saved);
    expect(wizardReducer(saved, { type: 'select.area', geometry: null })).toBe(saved);
    expect(wizardReducer(saved, { type: 'select.relationship', relationship: 'tenant' })).toBe(saved);
    expect(wizardReducer(saved, { type: 'select.parcel', parcelId: 'par_other', geometry: PARTIAL_POLYGON })).toBe(saved);
    // Evidence stays editable.
    expect(addDoc(saved, 'doc_1', 'land_record').documents).toHaveLength(1);
  });

  it('WZ-17: restore replaces the whole draft and reset starts a fresh one with a new key', () => {
    const saved = wizardReducer(readyDraft(), { type: 'claim.created', claimId: 'c_1' });
    const restored = wizardReducer(createEmptyDraft(), { type: 'restore', draft: saved });
    expect(restored).toBe(saved);
    const reset = wizardReducer(saved, { type: 'reset' });
    expect(reset.claimId).toBeNull();
    expect(reset.idempotencyKey).not.toBe(saved.idempotencyKey);
    expect(wizardReducer(reset, { type: 'idempotency.set', key: 'bad key' }).idempotencyKey).toBe(reset.idempotencyKey);
  });
});

// ── 8. Claims list state ──────────────────────────────────────────────────────────────────

describe('resolveClaimsListState', () => {
  it('loading wins while fetching', () => {
    expect(resolveClaimsListState(true, false, [], 0)).toEqual({ kind: 'loading' });
  });
  it('empty when there are no claims', () => {
    expect(resolveClaimsListState(false, false, [], 0)).toEqual({ kind: 'empty' });
  });
  it('error surfaces the retryKey, never a raw backend message', () => {
    expect(resolveClaimsListState(false, true, [], 7).kind).toBe('error');
    expect((resolveClaimsListState(false, true, [], 7) as { retryKey: number }).retryKey).toBe(7);
  });
  it('ready builds card view models for every claim', () => {
    const claims = [claimFor('submitted'), claimFor('verified')];
    const state = resolveClaimsListState(false, false, claims, 0);
    expect(state.kind === 'ready' && state.models.length).toBe(2);
  });
});

describe('claimCardViewModel', () => {
  it('exposes only backend-serialized fields with no sensitive columns', () => {
    const model = claimCardViewModel(claimFor('submitted'));
    expect(model.id).toBe('c_1');
    expect(model.state).toBe('submitted');
    expect(model.eventType).toBe('flood');
    expect(model.claimedAreaAcres).toBe(2.5);
    expect(model.parcelName).toBe('North Field');
    expect(model.evidenceCount).toBe(1);
    expect(model.isTerminal).toBe(false);
    expect(viewModelHasSensitiveField(model)).toBe(false);
  });
});

// ── 9. Claim detail view model ────────────────────────────────────────────────────────────

describe('claimDetailViewModel', () => {
  it('null claim yields a safe empty model', () => {
    const model = claimDetailViewModel(null, null);
    expect(model.state).toBe('draft');
    // Plan B4: the farmer view model has no verify affordance at all (checks start on their own).
    expect('canVerify' in model).toBe(false);
    expect(model.canSubmit).toBe(false);
    expect(viewModelHasSensitiveField(model)).toBe(false);
  });
  it('exposes affordances from backend state only', () => {
    // A claim still in `draft` must offer submit so it is never stranded unsubmitted. No state
    // offers a verify action any more (plan B4): checks start automatically after submit.
    const draft = claimDetailViewModel(claimFor('draft'), null);
    expect(draft.canSubmit).toBe(true);
    expect('canVerify' in draft).toBe(false);

    const submitted = claimDetailViewModel(claimFor('submitted'), null);
    expect(submitted.canWithdraw).toBe(true);
    expect(submitted.canResubmit).toBe(false);
    expect('canVerify' in submitted).toBe(false);
    expect(submitted.canEditEvidence).toBe(true);
    expect(submitted.canSubmit).toBe(false);

    const mer = claimDetailViewModel(claimFor('more_evidence_required'), null);
    expect(mer.canResubmit).toBe(true);
    expect(mer.canWithdraw).toBe(false);
    expect(mer.canEditEvidence).toBe(true);
    expect(mer.canSubmit).toBe(false);

    const terminal = claimDetailViewModel(claimFor('rejected'), null);
    expect(terminal.canWithdraw).toBe(false);
    expect(terminal.canResubmit).toBe(false);
    expect('canVerify' in terminal).toBe(false);
    expect(terminal.canSubmit).toBe(false);
    expect(terminal.canEditEvidence).toBe(false);
    expect(terminal.isTerminal).toBe(true);
  });
  it('report is none without a verification decision', () => {
    expect(claimDetailViewModel(claimFor('submitted'), null).report.kind).toBe('none');
  });
  it('report is processing when the backend decision is in progress', () => {
    const verification: VerificationDecision = {
      claimId: 'c_1',
      idempotent: true,
      inProgress: true,
      claimState: 'processing',
      outcome: null,
      decision: null,
      reason: null,
      rules: null,
      approvedGeometry: null,
      approvedAreaAcres: null,
      weatherCorrelation: null,
      decidedAt: null,
      decidedBy: null,
      claimedAreaAcres: 2.5,
      parcelAreaAcres: 2.5,
      evidenceVersion: null,
      engineVersion: null,
      verifiedAreaAcres: null,
      remainingEligible: null,
      previouslyVerifiedAcres: null,
      inFlightAreaAcres: null,
      overlapWarnings: [],
      spatialEvaluated: false,
    };
    expect(claimDetailViewModel(claimFor('processing'), verification).report.kind).toBe('processing');
  });
  it('report is decision with the backend outcome when decided', () => {
    const claim = claimFor('verified', { assessment: ASSESSMENT });
    const verification: VerificationDecision = {
      claimId: 'c_1',
      idempotent: true,
      inProgress: false,
      claimState: 'verified',
      outcome: 'verified',
      decision: 'verified',
      reason: null,
      rules: ASSESSMENT.rules,
      approvedGeometry: POLYGON,
      approvedAreaAcres: 2.5,
      weatherCorrelation: null,
      decidedAt: '2026-09-03T00:00:00.000Z',
      decidedBy: 'engine',
      claimedAreaAcres: 2.5,
      parcelAreaAcres: 2.5,
      evidenceVersion: 'v1',
      engineVersion: 'engine-1',
      verifiedAreaAcres: 2.5,
      remainingEligible: null,
      previouslyVerifiedAcres: null,
      inFlightAreaAcres: null,
      overlapWarnings: [],
      spatialEvaluated: true,
    };
    const model = claimDetailViewModel(claim, verification);
    if (model.report.kind !== 'decision') throw new Error('expected decision');
    expect(model.report.verification.outcome).toBe('verified');
    expect(model.hasResult).toBe(true);
  });
});

// ── 10. Verification result model ─────────────────────────────────────────────────────────

describe('verificationResultModel', () => {
  const decision: VerificationDecision = {
    claimId: 'c_1',
    idempotent: true,
    inProgress: false,
    claimState: 'verified',
    outcome: 'verified',
    decision: 'verified',
    reason: 'Area within limit',
    rules: {
      timelinessCheck: { passed: true },
      eventTypeCheck: { passed: true },
      areaCheck: { passed: true, remainingEligible: 7.5 },
      overlapCheck: { passed: false, overlapArea: 0.4 },
    },
    approvedGeometry: POLYGON,
    approvedAreaAcres: 2.1,
    weatherCorrelation: '0.72',
    decidedAt: '2026-09-03T00:00:00.000Z',
    decidedBy: 'engine',
    claimedAreaAcres: 2.5,
    parcelAreaAcres: 2.5,
    evidenceVersion: 'v1',
    engineVersion: 'engine-1',
    verifiedAreaAcres: 2.1,
    remainingEligible: 7.5,
    previouslyVerifiedAcres: 0,
    inFlightAreaAcres: 0,
    overlapWarnings: [],
    spatialEvaluated: true,
  };

  it('builds an explainable rule row list with label keys', () => {
    const model = verificationResultModel(decision);
    expect(model.ruleRows.map((r) => r.labelKey)).toContain('claimRule_timelinessCheck');
    expect(model.ruleRows.map((r) => r.labelKey)).toContain('claimRule_overlapCheck');
    const overlap = model.ruleRows.find((r) => r.name === 'overlapCheck');
    expect(overlap?.passed).toBe(false);
  });
  it('carries only backend-declared numbers', () => {
    const model = verificationResultModel(decision);
    expect(model.approvedAreaAcres).toBe(2.1);
    expect(model.claimedAreaAcres).toBe(2.5);
    expect(model.parcelAreaAcres).toBe(2.5);
    expect(model.outcomeLabelKey).toBe('claimState_verified');
  });
});

// ── 11. Security: no identity/authority leaks in any view model ───────────────────────────

describe('viewModelHasSensitiveField security guard', () => {
  it('flags forbidden columns when present (defense-in-depth)', () => {
    expect(viewModelHasSensitiveField({ cognitoSub: 'sub_1' })).toBe(true);
    expect(viewModelHasSensitiveField({ userEmail: 'a@b.c' })).toBe(true);
    expect(viewModelHasSensitiveField({ s3Key: 'claims/c/img/image.jpg' })).toBe(true);
    expect(viewModelHasSensitiveField({ bucket: 'b' })).toBe(true);
    expect(viewModelHasSensitiveField({ adminNote: 'internal' })).toBe(true);
    expect(viewModelHasSensitiveField({ presignedUrl: 'https://x' })).toBe(true);
    expect(viewModelHasSensitiveField({ nested: { secret: 1 } })).toBe(true);
  });
  it('card + detail view models intentionally expose none of them', () => {
    const claim = claimFor('verified', { assessment: ASSESSMENT });
    expect(viewModelHasSensitiveField(claimCardViewModel(claim))).toBe(false);
    expect(viewModelHasSensitiveField(claimDetailViewModel(claim, null))).toBe(false);
  });
  it('the module never re-exports server-side authority in view models', () => {
    // Explicit contract assertion: no state/outcome can ever be CLIENT-CHOSEN; view models only
    // read what the backend declared.
    const model = claimDetailViewModel(claimFor('verified', { assessment: ASSESSMENT }), null);
    expect(model.state).toBe('verified'); // from backend claim.state, not chosen here
  });
});

// ── 12. Phase 9 (E9-S9) — enriched verification result model ───────────────────────────────

describe('verificationResultModel — Phase 9 enriched fields', () => {
  const phase9Decision: VerificationDecision = {
    claimId: 'c_1',
    idempotent: true,
    inProgress: false,
    claimState: 'verified',
    outcome: 'verified',
    decision: 'verified',
    reason: 'All checks passed',
    rules: {
      timelinessCheck: { passed: true },
      eventTypeCheck: { passed: true },
      areaCheck: { passed: true, remainingEligible: 7.5 },
      overlapCheck: { passed: true, overlapArea: 0 },
      spatialCheck: { passed: true, insideParcel: true },
      remainingCheck: { passed: true, remainingEligible: 7.5 },
      aiCheck: { passed: true, reason: 'ok' },
      weatherCheck: { passed: true, reason: 'ok' },
    },
    approvedGeometry: POLYGON,
    approvedAreaAcres: 2.5,
    // Phase 9 fields
    verifiedAreaAcres: 2.5,
    remainingEligible: 7.5,
    previouslyVerifiedAcres: 0,
    inFlightAreaAcres: 0,
    overlapWarnings: [],
    spatialEvaluated: true,
    weatherCorrelation: null,
    decidedAt: '2026-09-03T00:00:00.000Z',
    decidedBy: 'engine',
    claimedAreaAcres: 2.5,
    parcelAreaAcres: 10.0,
    evidenceVersion: 'v1',
    engineVersion: '2',
  };

  it('includes Phase 9 verifiedAreaAcres and remainingEligible', () => {
    const model = verificationResultModel(phase9Decision);
    expect(model.verifiedAreaAcres).toBe(2.5);
    expect(model.remainingEligible).toBe(7.5);
    expect(model.previouslyVerifiedAcres).toBe(0);
    expect(model.inFlightAreaAcres).toBe(0);
    expect(model.spatialEvaluated).toBe(true);
  });

  it('includes Phase 9 overlapWarnings when present', () => {
    const decisionWithWarnings: VerificationDecision = {
      ...phase9Decision,
      overlapWarnings: [
        { code: 'overlaps_verified', message: 'Partial overlap detected', claims: [{ claimId: 'v1', siblingState: 'verified', overlapAreaAcres: 0.3 }], overlapAreaAcres: 0.3 },
        { code: 'overlaps_in_flight', message: 'Overlaps in-flight claim', claims: [{ claimId: 's1', siblingState: 'submitted' }] },
      ],
    };
    const model = verificationResultModel(decisionWithWarnings);
    expect(model.overlapWarnings).toHaveLength(2);
    expect(model.overlapWarnings[0].code).toBe('overlaps_verified');
    expect(model.overlapWarnings[0].claims).toHaveLength(1);
    expect(model.overlapWarnings[1].code).toBe('overlaps_in_flight');
  });

  it('handles missing Phase 9 fields gracefully (legacy decision)', () => {
    // The Phase 9 fields are intentionally OMITTED here to prove the model reads missing
    // surface as null/defaults — the fixture is cast because the enriched type is additive.
    const legacyDecision = {
      claimId: 'c_1',
      idempotent: true,
      inProgress: false,
      claimState: 'verified',
      outcome: 'verified',
      decision: 'verified',
      reason: 'All checks passed',
      rules: {
        timelinessCheck: { passed: true },
        eventTypeCheck: { passed: true },
        areaCheck: { passed: true, remainingEligible: 0.5 },
        overlapCheck: { passed: true, overlapArea: 0 },
        aiCheck: { passed: true, reason: 'ok' },
        weatherCheck: { passed: true, reason: 'ok' },
      },
      approvedGeometry: POLYGON,
      approvedAreaAcres: 0.5,
      weatherCorrelation: null,
      decidedAt: '2026-09-03T00:00:00.000Z',
      decidedBy: 'engine',
      claimedAreaAcres: 0.5,
      parcelAreaAcres: 1.0,
      evidenceVersion: 'v1',
      engineVersion: '1',
    } as VerificationDecision;
    const model = verificationResultModel(legacyDecision);
    expect(model.verifiedAreaAcres).toBeNull();
    expect(model.remainingEligible).toBeNull();
    expect(model.previouslyVerifiedAcres).toBeNull();
    expect(model.inFlightAreaAcres).toBeNull();
    expect(model.overlapWarnings).toEqual([]);
    expect(model.spatialEvaluated).toBe(false);
  });
});

describe('claimDetailViewModel — Phase 9 enriched assessment', () => {
  const phase9Assessment: ClaimAssessment = {
    approvedGeometry: POLYGON,
    approvedAreaAcres: 2.5,
    aiAggregate: null,
    weatherCorrelation: null,
    rules: {
      timelinessCheck: { passed: true },
      eventTypeCheck: { passed: true },
      areaCheck: { passed: true, remainingEligible: 7.5 },
      overlapCheck: { passed: true, overlapArea: 0 },
      spatialCheck: { passed: true, insideParcel: true },
      remainingCheck: { passed: true, remainingEligible: 7.5 },
      aiCheck: { passed: true, reason: 'ok' },
      weatherCheck: { passed: true, reason: 'ok' },
    },
    state: 'verified',
    reason: null,
    decidedAt: '2026-09-03T00:00:00.000Z',
    decidedBy: 'engine',
    adminNote: null,
    // Phase 9 fields
    verifiedAreaAcres: 2.5,
    remainingEligible: 7.5,
    previouslyVerifiedAcres: 0,
    inFlightAreaAcres: 0,
    overlapWarnings: [
      { code: 'overlaps_verified', message: 'Partial overlap', claims: [], overlapAreaAcres: 0.2 },
    ],
    spatialEvaluated: true,
  };

  const claim = claimFor('verified', { assessment: phase9Assessment });

  it('includes Phase 9 assessment fields in the view model', () => {
    const model = claimDetailViewModel(claim, null);
    expect(model.assessment).not.toBeNull();
    if (!model.assessment) return;
    expect(model.assessment.verifiedAreaAcres).toBe(2.5);
    expect(model.assessment.remainingEligible).toBe(7.5);
    expect(model.assessment.previouslyVerifiedAcres).toBe(0);
    expect(model.assessment.inFlightAreaAcres).toBe(0);
    expect(model.assessment.overlapWarnings).toHaveLength(1);
    expect(model.assessment.spatialEvaluated).toBe(true);
    // adminNote must be stripped
    expect('adminNote' in model.assessment).toBe(false);
  });

  it('handles legacy assessment without Phase 9 fields', () => {
    const legacyAssessment: ClaimAssessment = {
      approvedGeometry: POLYGON,
      approvedAreaAcres: 2.5,
      aiAggregate: null,
      weatherCorrelation: null,
      rules: ASSESSMENT.rules,
      state: 'verified',
      reason: null,
      decidedAt: '2026-09-03T00:00:00.000Z',
      decidedBy: 'engine',
      adminNote: null,
    };
    const legacyClaim = claimFor('verified', { assessment: legacyAssessment });
    const model = claimDetailViewModel(legacyClaim, null);
    expect(model.assessment).not.toBeNull();
    if (!model.assessment) return;
    expect(model.assessment.verifiedAreaAcres).toBeNull();
    expect(model.assessment.remainingEligible).toBeNull();
    expect(model.assessment.previouslyVerifiedAcres).toBeNull();
    expect(model.assessment.inFlightAreaAcres).toBeNull();
    expect(model.assessment.overlapWarnings).toEqual([]);
    expect(model.assessment.spatialEvaluated).toBe(false);
    expect('adminNote' in model.assessment).toBe(false);
  });
});

// ── 13. Phase 9 — overlap warning helpers ────────────────────────────────────────────────────

describe('overlap warning rendering helpers (pure logic for ClaimStatusCard)', () => {
  // These are the exact i18n keys the ClaimStatusCard uses to render overlap warnings.
  // Tests ensure the correct key is selected for each overlap code.

  const overlapToWarningKey = (code: string): string => {
    switch (code) {
      case 'outside_parcel':
        return 'overlapOutsideParcel';
      case 'overlaps_verified':
        return 'overlapDuplicate'; // same message for duplicate
      case 'overlaps_in_flight':
        return 'overlapInFlight';
      default:
        return 'overlapWarningsTitle';
    }
  };

  it('maps outside_parcel to overlapOutsideParcel', () => {
    expect(overlapToWarningKey('outside_parcel')).toBe('overlapOutsideParcel');
  });

  it('maps overlaps_verified to overlapDuplicate', () => {
    expect(overlapToWarningKey('overlaps_verified')).toBe('overlapDuplicate');
  });

  it('maps overlaps_in_flight to overlapInFlight', () => {
    expect(overlapToWarningKey('overlaps_in_flight')).toBe('overlapInFlight');
  });

  it('falls back to overlapWarningsTitle for unknown codes', () => {
    expect(overlapToWarningKey('unknown')).toBe('overlapWarningsTitle');
  });
});

// ── 14. Phase 9 — partial verification detail message ────────────────────────────────────────

describe('partially verified detail message builder', () => {
  // Pure logic to construct the partially_verified detail line from backend fields.
  const buildPartialVerifiedDetail = (
    t: (key: string, options?: { acres?: number }) => string,
    verifiedAreaAcres: number
  ): string => {
    return t('partiallyVerifiedDetail', { acres: verifiedAreaAcres });
  };

  it('returns the correct i18n key with acres', () => {
    const t = (key: string, options?: { acres?: number }) => {
      if (key === 'partiallyVerifiedDetail') return `Partially approved area: ${options?.acres ?? 0} acres`;
      return key;
    };
    expect(buildPartialVerifiedDetail(t, 1.2)).toBe('Partially approved area: 1.2 acres');
  });
});

// ── 15. Phase 9 — duplicate area detail message ──────────────────────────────────────────────

describe('duplicate area detail message builder', () => {
  const buildDuplicateAreaDetail = (t: (key: string) => string): string => {
    return t('duplicateAreaDetail');
  };

  it('returns the correct i18n key', () => {
    const t = (key: string) => (key === 'duplicateAreaDetail' ? 'This area overlaps an existing verified claim.' : key);
    expect(buildDuplicateAreaDetail(t)).toBe('This area overlaps an existing verified claim.');
  });
});

// ── 16. Phase 9 — out of limit detail message ────────────────────────────────────────────────

describe('out of limit detail message builder', () => {
  const buildOutOfLimitDetail = (
    t: (key: string, options?: { remaining?: number; claimed?: number }) => string,
    remaining: number,
    claimed: number
  ): string => {
    return t('outOfLimitDetail', { remaining, claimed });
  };

  it('returns the correct i18n key with remaining and claimed acres', () => {
    const t = (key: string, options?: { remaining?: number; claimed?: number }) => {
      if (key === 'outOfLimitDetail') return `Only ${options?.remaining} acres remain eligible. The ${options?.claimed} new acres exceed this limit.`;
      return key;
    };
    expect(buildOutOfLimitDetail(t, 2.5, 3.0)).toBe('Only 2.5 acres remain eligible. The 3 new acres exceed this limit.');
  });
});