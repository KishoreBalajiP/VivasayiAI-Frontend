// Phase 10 (E9-S10) — Pure admin review queue + dashboard + investigation helpers. This file
// tests the REAL exported vocabulary of utils/adminQueue.ts, kept in lock-step with the FROZEN
// backend contracts (services/adminQueue.service.js, adminOverrideRules.service.js,
// adminDashboard.service.js, adminInvestigation.service.js). The client only shapes honest UI
// affordances from backend-declared data — it never re-derives review authority.
//
// NOTE: These are pure/view-model tests only. API-level coverage (fetch stubs + envelope
// unwrap + 401/403 mapping + idempotent override replay) lives in src/api/admin.test.ts, which
// mirrors the backend admin.* endpoints described in 08_API_Documentation §10.9–10.12.

import { describe, expect, it } from 'vitest';
import {
  DECISION_STATES,
  OVERRIDEABLE_STATES,
  QUEUE_STATES,
  APPEALABLE_DECISION_STATES,
  APPEALABLE_DECISION_STATE_SET,
  DECISION_STATE_SET,
  OVERRIDEABLE_STATE_SET,
  QUEUE_STATE_SET,
  isDecisionState,
  canAppealState,
  canOverrideFrom,
  inDefaultQueue,
  APPEAL_REASON_MIN_LENGTH,
  APPEAL_REASON_MAX_LENGTH,
  OVERRIDE_REASON_MIN_LENGTH,
  OVERRIDE_REASON_MAX_LENGTH,
  OVERRIDE_NOTE_MAX_LENGTH,
  validateAppealReason,
  validateOverride,
  approverEqualsActor,
  buildAdminQueryString,
  queueEntryViewModel,
  adminDashboardCards,
  formatDuration,
  formatPercent,
  appealViewModel,
  investigationCards,
  investigationFlagTextKey,
  canShowOverride,
  hasActiveAppeal,
  farmerMayAppeal,
  adminModelHasSensitiveField,
  claimAppealSummary,
} from './adminQueue';
import type {
  AdminQueueEntry,
  DashboardMetrics,
  InvestigationSummary,
  AdminClaimDetail,
} from '../types';

// ── Frozen admin state vocabulary (mirrors the backend engine + admin services) ─────────

describe('Frozen admin state vocabulary (kept in lock-step with the backend)', () => {
  it('exports the four engine decision states and their set', () => {
    expect(DECISION_STATES).toEqual([
      'verified',
      'partially_verified',
      'rejected',
      'out_of_limit',
      'duplicate_area',
      'more_evidence_required',
    ]);
    expect(DECISION_STATE_SET.has('verified')).toBe(true);
    expect(DECISION_STATE_SET.has('more_evidence_required')).toBe(true);
    expect(DECISION_STATE_SET.has('processing')).toBe(false);
  });

  it('exports the overrideable source states (processing + decisions) and their set', () => {
    expect(OVERRIDEABLE_STATES).toEqual([
      'processing',
      'more_evidence_required',
      'rejected',
      'out_of_limit',
      'duplicate_area',
      'verified',
      'partially_verified',
    ]);
    expect(OVERRIDEABLE_STATE_SET.has('processing')).toBe(true);
    expect(OVERRIDEABLE_STATE_SET.has('verified')).toBe(true);
    expect(OVERRIDEABLE_STATE_SET.has('withdrawn')).toBe(false);
  });

  it('exports the default admin queue states (only exceptions, never verified)', () => {
    expect(QUEUE_STATES).toEqual([
      'rejected',
      'out_of_limit',
      'duplicate_area',
      'more_evidence_required',
    ]);
    // Verified / partially_verified move through the farmer list, never the exception queue.
    expect(QUEUE_STATE_SET.has('verified')).toBe(false);
    expect(QUEUE_STATE_SET.has('partially_verified')).toBe(false);
    expect(QUEUE_STATE_SET.has('rejected')).toBe(true);
  });

  it('exports the appealable-from decision states (the four negative engine decisions)', () => {
    expect(APPEALABLE_DECISION_STATES).toEqual([
      'rejected',
      'out_of_limit',
      'duplicate_area',
      'more_evidence_required',
    ]);
    // Positive decisions (verified / partially_verified) are NOT appealable.
    expect(APPEALABLE_DECISION_STATE_SET.has('rejected')).toBe(true);
    expect(APPEALABLE_DECISION_STATE_SET.has('verified')).toBe(false);
    expect(APPEALABLE_DECISION_STATE_SET.size).toBe(4);
  });
});

// ── Pure state guards (mirror backend decision/queue/override/appeal gates) ─────────────

describe('isDecisionState — non-empty decision vocabulary only', () => {
  it('accepts every canonical decision state', () => {
    for (const state of DECISION_STATES) {
      expect(isDecisionState(state)).toBe(true);
    }
  });

  it('rejects engine workflow states and unknown strings', () => {
    expect(isDecisionState('processing')).toBe(false);
    expect(isDecisionState('withdrawn')).toBe(false);
    expect(isDecisionState('mirrored')).toBe(false);
    expect(isDecisionState('')).toBe(false);
  });
});

describe('canAppealState — backend appeal eligibility gate', () => {
  it('reflects exactly the four negative engine decisions', () => {
    expect(canAppealState('rejected')).toBe(true);
    expect(canAppealState('out_of_limit')).toBe(true);
    expect(canAppealState('duplicate_area')).toBe(true);
    expect(canAppealState('more_evidence_required')).toBe(true);
  });

  it('rejects positive decisions, engine workflow states and unknowns', () => {
    expect(canAppealState('verified')).toBe(false);
    expect(canAppealState('partially_verified')).toBe(false);
    expect(canAppealState('processing')).toBe(false);
    expect(canAppealState('withdrawn')).toBe(false);
    expect(canAppealState('mirrored')).toBe(false);
  });
});

describe('canOverrideFrom — admin override FROM gate (backend OVERRIDEABLE_STATES)', () => {
  it('accepts every overrideable source state', () => {
    for (const state of OVERRIDEABLE_STATES) {
      expect(canOverrideFrom(state)).toBe(true);
    }
  });

  it('rejects withdrawn and unknown states', () => {
    expect(canOverrideFrom('withdrawn')).toBe(false);
    expect(canOverrideFrom('submitted')).toBe(false);
    expect(canOverrideFrom('mirrored')).toBe(false);
  });
});

describe('inDefaultQueue — admin queue membership gate', () => {
  it('accepts every default queue state', () => {
    for (const state of QUEUE_STATES) {
      expect(inDefaultQueue(state)).toBe(true);
    }
  });

  it('rejects verified / partially_verified and unknowns', () => {
    expect(inDefaultQueue('verified')).toBe(false);
    expect(inDefaultQueue('partially_verified')).toBe(false);
    expect(inDefaultQueue('processing')).toBe(false);
    expect(inDefaultQueue('mirrored')).toBe(false);
  });
});

// ── Frozen validation bounds (mirror backend appealBody / overrideBody rules) ────────────

describe('validateAppealReason — mirrors backend appealBody validation bounds', () => {
  it('rejects empty reasons as required', () => {
    expect(validateAppealReason('')).toEqual({ ok: false, reason: 'required' });
    expect(validateAppealReason('   ')).toEqual({ ok: false, reason: 'required' });
    expect(validateAppealReason(null)).toEqual({ ok: false, reason: 'required' });
    expect(validateAppealReason(undefined)).toEqual({ ok: false, reason: 'required' });
  });

  it('rejects reasons below the min length', () => {
    const tooShort = validateAppealReason('x'.repeat(APPEAL_REASON_MIN_LENGTH - 1));
    expect(tooShort).toEqual({ ok: false, reason: 'tooShort' });
  });

  it('rejects reasons over the max length', () => {
    const tooLong = validateAppealReason('x'.repeat(APPEAL_REASON_MAX_LENGTH + 1));
    expect(tooLong).toEqual({ ok: false, reason: 'tooLong' });
  });

  it('accepts a trimmed reason within bounds', () => {
    expect(validateAppealReason('x'.repeat(APPEAL_REASON_MIN_LENGTH))).toEqual({ ok: true });
  });
});

// ── Override form validation (pure; backend adminOverrideRules.service.js authoritative) ─

const overrideForm = (overrides: Partial<Record<'toState' | 'reason' | 'adminNote' | 'overrideKey' | 'currentState', string>> = {}) => ({
  toState: overrides.toState ?? 'verified',
  reason: overrides.reason ?? 'Farmer recorded the parcel twice on the same date.',
  adminNote: overrides.adminNote ?? '',
  overrideKey: overrides.overrideKey ?? 'ovr_key_test_1234',
  currentState: overrides.currentState ?? 'rejected',
});

describe('validateOverride — mirrors adminOverrideRules.validation bounds', () => {
  it('requires a target decision state', () => {
    const empty = validateOverride(overrideForm({ toState: '' }));
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.reason).toBe('noState');
  });

  it('rejects non-state target labels', () => {
    const invalid = validateOverride(overrideForm({ toState: 'mirrored' }));
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.reason).toBe('notDecision');
  });

  it('rejects overrides to the same state', () => {
    const same = validateOverride(overrideForm({ toState: 'rejected', currentState: 'rejected' }));
    expect(same.ok).toBe(false);
    if (same.ok) return;
    expect(same.reason).toBe('sameState');
  });

  it('rejects overrides from a non-overrideable state', () => {
    const blocked = validateOverride(overrideForm({ currentState: 'withdrawn' }));
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe('notOverrideable');
  });

  it('requires a non-empty reason within bounds', () => {
    const emptyReason = validateOverride(overrideForm({ reason: '   ' }));
    expect(emptyReason.ok).toBe(false);
    if (emptyReason.ok) return;
    expect(emptyReason.reason).toBe('reasonRequired');

    const tooShort = validateOverride(overrideForm({ reason: 'x'.repeat(OVERRIDE_REASON_MIN_LENGTH - 1) }));
    expect(tooShort.ok).toBe(false);
    if (tooShort.ok) return;
    expect(tooShort.reason).toBe('reasonTooShort');

    const tooLong = validateOverride(overrideForm({ reason: 'x'.repeat(OVERRIDE_REASON_MAX_LENGTH + 1) }));
    expect(tooLong.ok).toBe(false);
    if (tooLong.ok) return;
    expect(tooLong.reason).toBe('reasonTooLong');
  });

  it('rejects an over-long admin note', () => {
    const noteTooLong = validateOverride(overrideForm({ adminNote: 'x'.repeat(OVERRIDE_NOTE_MAX_LENGTH + 1) }));
    expect(noteTooLong.ok).toBe(false);
    if (noteTooLong.ok) return;
    expect(noteTooLong.reason).toBe('noteTooLong');
  });

  it('requires the override approval key (idempotency token)', () => {
    const noKey = validateOverride(overrideForm({ overrideKey: '' }));
    expect(noKey.ok).toBe(false);
    if (noKey.ok) return;
    expect(noKey.reason).toBe('noKey');
  });

  it('accepts a well-formed override', () => {
    expect(validateOverride(overrideForm())).toEqual({ ok: true });
  });
});

// ── Approver / actor reconciliation (please-separate identity) ───────────────────────────

describe('approverEqualsActor — rejects self-approval', () => {
  it('returns true only when approver sub matches the signed-in actor', () => {
    expect(approverEqualsActor('sub_abc', 'sub_abc')).toBe(true);
    expect(approverEqualsActor('sub_abc', 'sub_xyz')).toBe(false);
    expect(approverEqualsActor('sub_abc', null)).toBe(false);
    expect(approverEqualsActor(null, 'sub_abc')).toBe(false);
    expect(approverEqualsActor(undefined, undefined)).toBe(false);
  });
});

// ── Admin query string builder (mirrors backend normalizeAdminFilters + paging) ─────────

describe('buildAdminQueryString — only non-empty, valid filters become query params', () => {
  it('builds a complete filter query', () => {
    const qs = buildAdminQueryString({
      status: 'rejected',
      eventType: 'flood',
      withAppeal: 'true',
      aiFailed: 'false',
      search: '  North Field  ',
      page: 2,
      limit: 25,
    });
    expect(qs).toContain('status=rejected');
    expect(qs).toContain('eventType=flood');
    expect(qs).toContain('withAppeal=true');
    expect(qs).toContain('aiFailed=false');
    expect(qs).toContain('search=North%20Field');
    expect(qs).toContain('page=2');
    expect(qs).toContain('limit=25');
  });

  it('returns an empty string when there are no valid filters', () => {
    expect(buildAdminQueryString({})).toBe('');
    expect(buildAdminQueryString({ search: '   ' })).toBe('');
    expect(buildAdminQueryString({ status: '' })).toBe('');
  });
});

// ── Queue view model (identity-free, mirrors backend-serialized admin queue) ─────────────

const queueEntry = (overrides: Partial<AdminQueueEntry> = {}): AdminQueueEntry => ({
  id: 'entry_1',
  parcelId: 'parcel_1',
  parcelName: 'North Field',
  crop: 'Rice',
  eventType: 'flood',
  eventDate: '2026-09-02',
  claimedAreaAcres: 2.5,
  state: 'rejected',
  decidedAt: '2026-09-03T10:00:00.000Z',
  createdAt: '2026-09-02T08:00:00.000Z',
  hasAppeal: false,
  appealReason: null,
  aiFailed: false,
  decisionReason: 'Out of the claimable area limit for this parcel.',
  ...overrides,
});

describe('queueEntryViewModel — shapes honest farmer-entry cards for admins', () => {
  it('maps a queue entry to a display card without admin-only secrets', () => {
    const vm = queueEntryViewModel(queueEntry());
    expect(vm.parcelName).toBe('North Field');
    expect(vm.state).toBe('rejected');
    expect(vm.hasAppeal).toBe(false);
    // Identity/secret slots must never reach the view model.
    expect('cognitoSub' in vm).toBe(false);
    expect('userEmail' in vm).toBe(false);
    expect('s3Key' in vm).toBe(false);
    expect('adminNote' in vm).toBe(false);
  });

  it('reflects an attached appeal', () => {
    const vm = queueEntryViewModel(
      queueEntry({ hasAppeal: true, appealReason: 'Farmer disputes the computed area.' })
    );
    expect(vm.hasAppeal).toBe(true);
    expect(vm.appealReason).toBe('Farmer disputes the computed area.');
  });
});

// ── Admin dashboard cards (pure metrics → display cards) ─────────────────────────────────

const dashboardMetrics = (overrides: Partial<DashboardMetrics> = {}): DashboardMetrics => ({
  total: 120,
  verified: 40,
  partiallyVerified: 20,
  rejected: 25,
  outOfLimit: 15,
  duplicate: 8,
  moreEvidence: 7,
  pendingHumanReview: 3,
  appealCount: 2,
  aiUncertaintyRate: 0.12,
  averageVerificationTimeMs: 4800,
  ...overrides,
});

describe('adminDashboardCards — server metrics become labeled display cards', () => {
  it('produces a labeled card per frozen metric slot', () => {
    const cards = adminDashboardCards(dashboardMetrics());
    expect(cards.length).toBe(9);
    expect(cards.map((c) => c.id)).toEqual([
      'total',
      'verified',
      'partiallyVerified',
      'rejected',
      'outOfLimit',
      'duplicate',
      'moreEvidence',
      'pendingHumanReview',
      'appealCount',
    ]);
    expect(cards[0].value).toBe('120');
    expect(cards[3].tone).toBe('danger');
    expect(cards[8].labelKey.startsWith('adminMetric_')).toBe(true);
  });
});

describe('formatDuration — human duration string', () => {
  it('renders ms, seconds and minutes', () => {
    expect(formatDuration(800)).toBe('800 ms');
    expect(formatDuration(2500)).toBe('3 s');
    expect(formatDuration(120000)).toBe('2 min');
    expect(formatDuration(null)).toBe('—');
  });
});

describe('formatPercent — display-ready rate', () => {
  it('rounds and marks fractions', () => {
    expect(formatPercent(0.124)).toBe('12%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(null)).toBe('—');
  });
});

// ── Appeal view model (farmer-facing + admin display, no identity) ──────────────────────

describe('appealViewModel — status label keys and add-evidence affordance', () => {
  it('builds a view model from backend appeal data', () => {
    const vm = appealViewModel({
      id: 'appeal_1',
      status: 'submitted',
      reason: 'Area computed above the claimable limit.',
      statement: 'The parcel has two separate plantings.',
      createdAt: '2026-09-04T09:00:00.000Z',
      resolvedAt: null,
    });
    expect(vm.statusLabelKey).toBe('appealStatus_submitted');
    expect(vm.canAddEvidence).toBe(true); // submitted is still evidence-mutable
    expect('cognitoSub' in vm).toBe(false);
    expect(vm.decisionToState).toBe(null);
  });

  it('disables evidence once resolved', () => {
    const vm = appealViewModel({
      id: 'appeal_1',
      status: 'resolved',
      reason: 'Area computed above the claimable limit.',
      statement: null,
      createdAt: '2026-09-04T09:00:00.000Z',
      resolvedAt: '2026-09-05T09:00:00.000Z',
      decision: { kind: 'granted', toState: 'partially_verified' },
    });
    expect(vm.canAddEvidence).toBe(false);
    expect(vm.decisionToState).toBe('partially_verified');
  });
});

// ── Investigation cards (engine flags → an admin attention summary) ─────────────────────

describe('investigationCards — engine rule flags become an attention summary', () => {
  const summary: InvestigationSummary = {
    totalEntries: 12,
    high: 3,
    medium: 4,
    low: 3,
    totalFlags: 10,
  };

  it('renders total, priority tiers and flags', () => {
    const cards = investigationCards(summary);
    expect(cards.reduce((sum, c) => sum + (c.id === 'total' ? 1 : 0), 0)).toBe(1);
    const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
    expect(byId.high.value).toBe('3');
    expect(byId.medium.tone).toBe('warning');
    expect(byId.flags.value).toBe('10');
  });

  it('builds stable i18n flag keys', () => {
    expect(investigationFlagTextKey('time_window_mismatch')).toBe('adminInvest_flag_time_window_mismatch');
  });
});

// ── Admin detail affordances (can show override / appeal availability) ──────────────────

const adminDetail = (overrides: Partial<AdminClaimDetail> = {}): AdminClaimDetail => {
  const base: AdminClaimDetail = {
    id: 'claim_1',
    parcelId: 'parcel_1',
    parcelName: 'North Field',
    crop: 'Rice',
    eventType: 'flood',
    eventDate: '2026-09-02',
    claimedAreaAcres: 2.5,
    state: 'rejected',
    decidedAt: '2026-09-03T10:00:00.000Z',
    createdAt: '2026-09-02T08:00:00.000Z',
    district: 'Palpa',
    aiFailed: false,
    farmer: { cognitoSub: 'sub_farmer', email: null, name: null },
    parcel: null,
    evidenceUrls: [],
    appeals: [],
    adminActions: [],
    decisionReason: null,
    meta: { requestedBy: 'sub_admin', requestedAt: '2026-09-03T10:00:00.000Z' },
    ...overrides,
  };
  return base;
};

describe('admin detail affordances — the UI only "may do" what backend rules allow', () => {
  it('may show the override form for an overrideable source state', () => {
    expect(canShowOverride(adminDetail({ state: 'rejected' }))).toBe(true);
    expect(canShowOverride(adminDetail({ state: 'withdrawn' }))).toBe(false);
  });

  it('reports active appeals from the appeal list', () => {
    expect(hasActiveAppeal(adminDetail())).toBe(false);

    const active = adminDetail({
      appeals: [
        { id: 'appeal_1', claimId: 'claim_1', status: 'submitted', reason: 'Area disputed.', statement: null, createdAt: '2026-09-04T09:00:00.000Z', resolvedAt: null },
      ],
    });
    expect(hasActiveAppeal(active)).toBe(true);
    expect(claimAppealSummary(active).activeCount).toBe(1);
    expect(claimAppealSummary(active).count).toBe(1);
  });

  it('offers the farmer an appeal affordance only from appealable states', () => {
    expect(farmerMayAppeal({ state: 'rejected' })).toBe(true);
    expect(farmerMayAppeal({ state: 'verified' })).toBe(false);
    expect(farmerMayAppeal(null)).toBe(false);
  });

  it('flags any model carrying identity/secret slots on the admin claim detail', () => {
    const leaked = adminModelHasSensitiveField(
      adminDetail({ farmer: { cognitoSub: 'sub_farmer', email: 'f@example.com', name: null } })
    );
    expect(leaked).toBe(true);
    // A model carrying an approver key must be flagged.
    expect(adminModelHasSensitiveField({ state: 'rejected', secret: 'ovr_secret' })).toBe(true);
    expect(adminModelHasSensitiveField({ state: 'rejected', overrideKey: 'ovr_secret_key' })).toBe(false);
  });
});
