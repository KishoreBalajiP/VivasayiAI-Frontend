import { describe, expect, it } from 'vitest';
import {
  CLAIM_EVENT_TYPES,
  CLAIM_EVENT_TYPE_SET,
  CLAIM_WINDOW_DAYS,
  EVIDENCE_MUTABLE_STATES,
  TERMINAL_CLAIM_STATES,
  addStagedEvidence,
  buildReviewSummary,
  canMutateEvidence,
  canRequestVerification,
  canResubmitClaim,
  canStageEvidence,
  canWithdrawClaim,
  claimCardViewModel,
  claimDetailViewModel,
  claimEventLabelKey,
  claimStateLabelKey,
  createEmptyDraft,
  evidenceStatusLabelKey,
  formatClaimDate,
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
  validateClaimDate,
  verificationResultModel,
  verificationRulesKey,
  viewModelHasSensitiveField,
  wizardReducer,
} from './claimFlow';
import type {
  ClaimAssessment,
  ClaimEvidenceEntry,
  GeoJsonPolygon,
  LossClaim,
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
    expect(draft.step).toBe('event');
    draft = wizardReducer(draft, { type: 'back' });
    expect(draft.step).toBe('parcel');
    draft = wizardReducer(draft, { type: 'back' });
    expect(draft.step).toBe('parcel'); // cannot go before the first step
  });
  it('does not advance beyond the final step', () => {
    let draft = createEmptyDraft();
    // Advance through all six steps repeatedly; the last dispatch keeps the wizard pinned on review.
    for (let _advanceCount = 0; _advanceCount < 6; _advanceCount += 1) {
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
});

describe('stepCanAdvance', () => {
  it('gates each step on its honest prerequisite', () => {
    expect(stepCanAdvance(createEmptyDraft())).toBe(false); // no parcel yet

    let d = createEmptyDraft();
    d = wizardReducer(d, { type: 'select.parcel', parcelId: 'par_123', geometry: POLYGON });
    d = wizardReducer(d, { type: 'next' });
    expect(stepCanAdvance(d)).toBe(false); // event not chosen
    d = wizardReducer(d, { type: 'select.event', eventType: 'drought' });
    expect(stepCanAdvance(d)).toBe(true);
    d = wizardReducer(d, { type: 'next' });
    expect(stepCanAdvance(d)).toBe(false); // date not chosen
    d = wizardReducer(d, { type: 'select.date', eventDate: new Date().toISOString().slice(0, 10) });
    expect(stepCanAdvance(d)).toBe(true);
    d = wizardReducer(d, { type: 'next' });
    // The area step carries the selected parcel's REAL geometry forward (whole-parcel claim) —
    // it is never empty once a parcel is chosen, so it is advanceable by design (ADR-019 P8).
    d = wizardReducer(d, { type: 'select.area', geometry: POLYGON });
    expect(stepCanAdvance(d)).toBe(true);
  });
  it('evidence step is always advanceable (optional before submit)', () => {
    let d = createEmptyDraft();
    d = wizardReducer(d, { type: 'select.parcel', parcelId: 'par_123', geometry: POLYGON });
    for (let i = 0; i < 4; i++) d = wizardReducer(d, { type: 'next' });
    expect(d.step).toBe('evidence');
    expect(stepCanAdvance(d)).toBe(true);
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
    expect(model.canVerify).toBe(false);
    expect(viewModelHasSensitiveField(model)).toBe(false);
  });
  it('exposes affordances from backend state only', () => {
    const submitted = claimDetailViewModel(claimFor('submitted'), null);
    expect(submitted.canWithdraw).toBe(true);
    expect(submitted.canResubmit).toBe(false);
    expect(submitted.canVerify).toBe(true);
    expect(submitted.canEditEvidence).toBe(true);

    const mer = claimDetailViewModel(claimFor('more_evidence_required'), null);
    expect(mer.canResubmit).toBe(true);
    expect(mer.canWithdraw).toBe(false);
    expect(mer.canEditEvidence).toBe(true);

    const terminal = claimDetailViewModel(claimFor('rejected'), null);
    expect(terminal.canWithdraw).toBe(false);
    expect(terminal.canResubmit).toBe(false);
    expect(terminal.canVerify).toBe(false);
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