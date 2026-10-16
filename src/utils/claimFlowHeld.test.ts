import { describe, expect, it, vi } from 'vitest';
import {
  CLAIMANT_RELATIONSHIPS,
  VERIFICATION_POLL_INTERVAL_MS,
  canAppealClaim,
  claimDetailViewModel,
  componentChecklist,
  componentNeeds,
  createEmptyDraft,
  ownershipStatusLabelKey,
  pollVerificationUntilSettled,
  verificationPollStatus,
  verificationResultModel,
  wizardReducer,
} from './claimFlow';
import type {
  ClaimAssessment,
  ClaimState,
  LossClaim,
  VerificationComponents,
  VerificationDecision,
} from '../types';

// Frontend contract 2026-10 (ADR-020): held decisions, the component checklist wording rules,
// status polling, the claimant-relationship wizard field and supporting-only weather.

const claim = (state: ClaimState, assessment: Partial<ClaimAssessment> | null = null): LossClaim =>
  ({
    id: 'c_1',
    parcelId: 'par_1',
    parcelSnapshot: { parcelId: 'par_1', name: 'North', crop: 'Rice', parcelAreaAcres: 2 },
    eventType: 'flood',
    eventDate: '2026-10-01',
    claimedGeometry: { type: 'Polygon', coordinates: [] },
    claimedAreaAcres: 1.5,
    claimantRelationship: null,
    evidence: [],
    state,
    submittedAt: null,
    processedAt: null,
    decidedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    assessment: assessment
      ? ({
          approvedGeometry: null,
          approvedAreaAcres: null,
          aiAggregate: null,
          weatherCorrelation: null,
          rules: null,
          state: null,
          reason: null,
          decidedAt: null,
          decidedBy: null,
          adminNote: null,
          ...assessment,
        } as ClaimAssessment)
      : null,
  }) as LossClaim;

const decision = (overrides: Partial<VerificationDecision> = {}): VerificationDecision =>
  ({
    claimId: 'c_1',
    idempotent: false,
    inProgress: false,
    claimState: 'submitted',
    outcome: null,
    decision: null,
    reason: null,
    rules: null,
    approvedGeometry: null,
    approvedAreaAcres: null,
    verifiedAreaAcres: null,
    remainingEligible: null,
    previouslyVerifiedAcres: null,
    inFlightAreaAcres: null,
    overlapWarnings: [],
    spatialEvaluated: false,
    weatherCorrelation: null,
    decidedAt: null,
    decidedBy: null,
    claimedAreaAcres: 1.5,
    parcelAreaAcres: 2,
    evidenceVersion: null,
    engineVersion: null,
    ...overrides,
  }) as VerificationDecision;

const COMPONENTS: VerificationComponents = {
  parcel_identity: { outcome: 'verified', required: true, authoritative: false, actionableBy: null, reasonCodes: [] },
  claimant_rights: {
    outcome: 'unverified',
    required: true,
    authoritative: false,
    actionableBy: 'farmer',
    reasonCodes: ['missing_document_category:land_record|ownership_deed|tax_receipt', 'relationship_tenant'],
  },
  satellite: { outcome: 'unavailable', required: false, authoritative: false, actionableBy: 'system', reasonCodes: [] },
  weather: { outcome: 'failed', required: false, authoritative: false, actionableBy: 'system', reasonCodes: [] },
  crop: { outcome: 'unverified', required: false, authoritative: false, actionableBy: 'system', reasonCodes: ['crop_not_comparable'] },
  manual_review: { outcome: 'requires_review', required: true, authoritative: false, actionableBy: 'reviewer', reasonCodes: ['review_case_open'] },
  geometry: { outcome: 'failed', required: true, authoritative: false, actionableBy: 'farmer', reasonCodes: ['outside_registered_parcel'] },
};

describe('claimDetailViewModel — held', () => {
  it('reports held from a live /verify response, never processing or a decision', () => {
    const live = decision({
      held: true,
      inProgress: false,
      outcome: null,
      components: COMPONENTS,
      pendingComponents: [{ component: 'claimant_rights', outcome: 'unverified', action: 'more_evidence_required' }],
    });
    const model = claimDetailViewModel(claim('submitted'), live);
    expect(model.report.kind).toBe('held');
    if (model.report.kind !== 'held') return;
    expect(model.report.pendingComponents).toHaveLength(1);
    expect(model.report.checklist.find((row) => row.name === 'claimant_rights')?.blocking).toBe(true);
    // Held is not a decision, and the farmer may still withdraw.
    expect(model.hasResult).toBe(false);
    expect(model.canWithdraw).toBe(true);
  });

  it('reports held from the persisted assessment when there is no live response', () => {
    const model = claimDetailViewModel(
      claim('submitted', { held: true, components: COMPONENTS, pendingComponents: [] }),
      null
    );
    expect(model.report.kind).toBe('held');
  });

  it('a hold beats inProgress (no spinner for a claim that is waiting on a person)', () => {
    const model = claimDetailViewModel(claim('submitted'), decision({ held: true, inProgress: true }));
    expect(model.report.kind).toBe('held');
  });

  it('ignores a stale hold once the claim left `submitted`', () => {
    const model = claimDetailViewModel(claim('withdrawn'), decision({ held: true }));
    expect(model.report.kind).toBe('none');
  });

  it('keeps legacy behaviour when the new fields are absent', () => {
    expect(claimDetailViewModel(claim('submitted'), decision({ inProgress: true })).report.kind).toBe('processing');
    expect(claimDetailViewModel(claim('rejected'), decision({ outcome: 'rejected' })).report.kind).toBe('decision');
    expect(claimDetailViewModel(claim('submitted'), null).report.kind).toBe('none');
  });
});

describe('componentChecklist — contract §1.3 wording', () => {
  const rows = componentChecklist(COMPONENTS, [
    { component: 'claimant_rights', outcome: 'unverified', action: 'more_evidence_required' },
  ]);
  const row = (name: string) => rows.find((r) => r.name === name);

  it('orders rows deterministically and hides optional checks that have not run', () => {
    expect(rows.map((r) => r.name)).toEqual([
      'parcel_identity',
      'claimant_rights',
      'geometry',
      'satellite',
      'weather',
      'manual_review',
    ]);
    expect(row('crop')).toBeUndefined();
  });

  it('asks the farmer for exactly the missing document categories', () => {
    expect(row('claimant_rights')).toMatchObject({
      outcome: 'unverified',
      farmerAction: true,
      statusKey: 'componentStatus_unverified_farmer',
      tone: 'action',
    });
    expect(row('claimant_rights')?.needs).toEqual([
      { kind: 'documents', categories: ['land_record', 'ownership_deed', 'tax_receipt'] },
    ]);
  });

  it('never words unavailable / inconclusive as failure, and supporting evidence never fails', () => {
    expect(row('satellite')).toMatchObject({ statusKey: 'componentStatus_unavailable', tone: 'neutral', supportingOnly: true });
    // A (contract-violating) failed weather outcome is still shown as inconclusive.
    expect(row('weather')).toMatchObject({ outcome: 'inconclusive', statusKey: 'componentStatus_inconclusive', tone: 'neutral' });
    for (const r of rows) {
      if (r.outcome === 'unavailable' || r.outcome === 'inconclusive') expect(r.tone).not.toBe('mismatch');
    }
  });

  it('words a real contradiction as "does not match" with the reason', () => {
    expect(row('geometry')).toMatchObject({ statusKey: 'componentStatus_failed', tone: 'mismatch' });
    expect(row('geometry')?.needs).toEqual([{ kind: 'reason', key: 'verifyReason_outside_registered_parcel' }]);
  });

  it('waits on reviewers without asking the farmer for anything', () => {
    expect(row('manual_review')).toMatchObject({ statusKey: 'componentStatus_requires_review', farmerAction: false, needs: [] });
  });

  it('adds a row for a blocking component the snapshot does not describe', () => {
    const extra = componentChecklist({}, [{ component: 'photos', outcome: 'unverified', action: 'more_evidence_required' }]);
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({ name: 'photos', blocking: true, farmerAction: true });
  });

  it('handles legacy decisions with components: null', () => {
    expect(componentChecklist(null, [])).toEqual([]);
  });
});

describe('componentNeeds', () => {
  it('ignores the relationship echo and falls back to a generic need for unknown codes', () => {
    expect(componentNeeds(['relationship_owner'])).toEqual([]);
    expect(componentNeeds(['something_new'])).toEqual([{ kind: 'reason', key: 'verifyReason_generic' }]);
    expect(componentNeeds(['missing_document_category:not_a_category'])).toEqual([
      { kind: 'reason', key: 'verifyReason_generic' },
    ]);
  });
});

describe('verification polling', () => {
  it('classifies a claim for the poll loop', () => {
    expect(verificationPollStatus(claim('submitted'))).toBe('continue');
    expect(verificationPollStatus(claim('processing'))).toBe('continue');
    expect(verificationPollStatus(claim('rejected'))).toBe('decided');
    expect(verificationPollStatus(claim('submitted', { state: 'verified' }))).toBe('decided');
    expect(verificationPollStatus(claim('submitted', { held: true }))).toBe('held');
  });

  it('waits at least 10 s before each read and stops on a decision', async () => {
    const waits: number[] = [];
    const load = vi
      .fn<() => Promise<LossClaim>>()
      .mockResolvedValueOnce(claim('processing'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(claim('verified'));
    const onClaim = vi.fn();
    const result = await pollVerificationUntilSettled({
      load,
      onClaim,
      intervalMs: 1_000, // below the floor: must be raised to 10 s
      wait: async (ms) => {
        waits.push(ms);
      },
    });
    expect(result).toMatchObject({ status: 'decided', polls: 3 });
    expect(waits).toEqual([VERIFICATION_POLL_INTERVAL_MS, VERIFICATION_POLL_INTERVAL_MS, VERIFICATION_POLL_INTERVAL_MS]);
    expect(onClaim).toHaveBeenCalledTimes(2); // the failed read is skipped, not surfaced
  });

  it('stops on a hold (polling cannot resolve it)', async () => {
    const load = vi.fn(async () => claim('submitted', { held: true }));
    const result = await pollVerificationUntilSettled({ load, wait: async () => {} });
    expect(result.status).toBe('held');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('is bounded', async () => {
    const load = vi.fn(async () => claim('processing'));
    const result = await pollVerificationUntilSettled({ load, wait: async () => {}, maxPolls: 4 });
    expect(result).toMatchObject({ status: 'exhausted', polls: 4 });
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('stops without reading once cancelled', async () => {
    let cancelled = false;
    const load = vi.fn(async () => claim('processing'));
    const result = await pollVerificationUntilSettled({
      load,
      isCancelled: () => cancelled,
      wait: async () => {
        cancelled = true;
      },
    });
    expect(result.status).toBe('cancelled');
    expect(load).not.toHaveBeenCalled();
  });
});

describe('claimant relationship in the wizard draft', () => {
  it('starts unanswered and accepts only the backend vocabulary', () => {
    let draft = createEmptyDraft();
    expect(draft.claimantRelationship).toBeNull();
    for (const relationship of CLAIMANT_RELATIONSHIPS) {
      draft = wizardReducer(draft, { type: 'select.relationship', relationship });
      expect(draft.claimantRelationship).toBe(relationship);
    }
    draft = wizardReducer(draft, { type: 'select.relationship', relationship: 'landlord' as never });
    expect(draft.claimantRelationship).toBe('heir'); // unchanged
    draft = wizardReducer(draft, { type: 'select.relationship', relationship: null });
    expect(draft.claimantRelationship).toBeNull();
  });

  it('mirrors CLAIMANT_RELATIONSHIPS exactly', () => {
    expect(CLAIMANT_RELATIONSHIPS).toEqual(['owner', 'joint_owner', 'tenant', 'authorised_cultivator', 'heir']);
  });
});

describe('supporting-only rules and other helpers', () => {
  it('marks the weather rule as supporting-only (no pass/fail verdict)', () => {
    const model = verificationResultModel(
      decision({ outcome: 'rejected', rules: { weatherCheck: { passed: false }, areaCheck: { passed: true } } })
    );
    expect(model.ruleRows.find((r) => r.name === 'weatherCheck')?.supportingOnly).toBe(true);
    expect(model.ruleRows.find((r) => r.name === 'areaCheck')?.supportingOnly).toBe(false);
  });

  it('appeals only the backend-eligible decision states', () => {
    expect(['rejected', 'out_of_limit', 'duplicate_area', 'more_evidence_required'].every(canAppealClaim)).toBe(true);
    expect(['draft', 'submitted', 'verified', 'partially_verified', 'withdrawn'].some(canAppealClaim)).toBe(false);
  });

  it('never words a document review as official', () => {
    expect(ownershipStatusLabelKey('VERIFIED')).toBe('ownershipStatus_accepted');
    expect(ownershipStatusLabelKey('AVAILABLE')).toBe('ownershipStatus_accepted');
    expect(ownershipStatusLabelKey('PENDING')).toBe('ownershipStatus_pending');
  });
});
