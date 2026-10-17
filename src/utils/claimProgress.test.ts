import { describe, expect, it } from 'vitest';
import {
  EXPLANATION_KEYS,
  PROGRESS_CONTRACT,
  actionTitleKeys,
  currentStage,
  decisionTone,
  flattenKey,
  legacyProgressFromClaim,
  overallTone,
  parseClaimProgress,
  satelliteReasonKeys,
  satelliteTone,
  stageExplanationKeys,
} from './claimProgress';
import { decisionReasonKeys, overlapWarningMessage } from './claimFlow';
import { PROGRESS_EXAMPLES, PROGRESS_RESPONSE, rawProgress } from '../test/progressFixtures';
import type { LossClaim } from '../types';

// CT-1..3: the farmer progress contract parser (plan B4, design §5.3). The fixture is the backend
// builder's own output for 20 named scenarios, so every shape the backend emits is covered.

const FORBIDDEN_STRINGS = ['PROVIDER_', 'rv_', 'lastError', 'attempts'];

describe('CT-1: the backend example fixture parses', () => {
  it('CT-1: the GET /claims/:id/progress response and every scenario parse, keeping the API values exactly', () => {
    expect(Object.keys(PROGRESS_EXAMPLES).length).toBeGreaterThanOrEqual(20);
    const all = [PROGRESS_RESPONSE.data.progress, ...Object.values(PROGRESS_EXAMPLES).map((example) => example.progress)];
    for (const raw of all) {
      const parsed = parseClaimProgress(raw);
      expect(parsed, String(raw.claimId)).not.toBeNull();
      if (!parsed) continue;
      expect(parsed.contractVersion).toBe('progress-v1');
      expect(parsed.overallStatus).toBe(raw.overallStatus);
      expect(parsed.claimState).toBe(raw.claimState);
      expect(parsed.decision).toBe(raw.decision);
      const rawStages = raw.stages as Array<Record<string, unknown>>;
      // Backend order, nothing added or removed, every value from the contract kept as sent.
      expect(parsed.stages.map((stage) => [stage.id, stage.status, stage.explanationKey])).toEqual(
        rawStages.map((stage) => [stage.id, stage.status, stage.explanationKey])
      );
      const rawSatellite = raw.satellite as Record<string, unknown>;
      expect(parsed.satellite?.status).toBe(rawSatellite.status);
      expect(parsed.satellite?.reasonCode).toBe(rawSatellite.reasonCode);
      expect(parsed.satellite?.noteCode).toBe(rawSatellite.noteCode);
      expect(parsed.satellite?.supportingOnly).toBe(true);
      const rawActions = raw.actionRequired as Array<Record<string, unknown>>;
      expect(parsed.actionRequired.map((action) => [action.code, action.required, action.explanationKey])).toEqual(
        rawActions.map((action) => [action.code, action.required, action.explanationKey])
      );
    }
  });

  it('CT-1: decision follows the claim state for every decision state, more_evidence_required included (A3)', () => {
    expect(parseClaimProgress(rawProgress('more_evidence_required'))).toMatchObject({
      overallStatus: 'action_required',
      decision: 'more_evidence_required',
    });
    expect(parseClaimProgress(rawProgress('decided_verified'))?.decision).toBe('verified');
    expect(parseClaimProgress(rawProgress('checks_running'))?.decision).toBeNull();
  });

  it('CT-1: document groups and the not-yet-open post-event window come through as the contract says (A4)', () => {
    const mer = parseClaimProgress(rawProgress('more_evidence_required'));
    const upload = mer?.actionRequired.find((action) => action.code === 'upload_land_documents');
    expect(upload?.params.categoryGroups).toEqual([['lease_agreement'], ['land_record', 'ownership_deed', 'tax_receipt']]);

    const pending = parseClaimProgress(PROGRESS_RESPONSE.data.progress);
    expect(pending?.satellite?.observedWindows?.postEvent).toEqual({
      start: '2026-10-17T00:00:00.000Z',
      end: null,
      open: false,
      complete: false,
    });
    expect(pending?.satellite?.nextCheckAt).toBe('2026-10-18T00:00:00.000Z');
  });
});

describe('CT-2: wrong version, broken shapes and unknown values', () => {
  it('CT-2: another contract version, or a shape that cannot be trusted, parses to null', () => {
    expect(parseClaimProgress(rawProgress('checks_running', { contractVersion: 'progress-v2' }))).toBeNull();
    expect(parseClaimProgress(rawProgress('checks_running', { contractVersion: undefined }))).toBeNull();
    expect(parseClaimProgress(rawProgress('checks_running', { claimId: '../../etc' }))).toBeNull();
    expect(parseClaimProgress(rawProgress('checks_running', { claimState: 'archived' }))).toBeNull();
    expect(parseClaimProgress(rawProgress('checks_running', { stages: 'none' }))).toBeNull();
    for (const value of [null, undefined, 'progress-v1', 42, []]) expect(parseClaimProgress(value)).toBeNull();
  });

  it('CT-2: unknown statuses become "unknown" (generic copy), unknown keys and codes are dropped', () => {
    const raw = rawProgress('checks_running', { overallStatus: 'paused', decision: 'approved' });
    const stages = raw.stages as Array<Record<string, unknown>>;
    stages[1] = { ...stages[1], status: 'frozen', explanationKey: 'progress.photos.made_up' };
    stages[2] = { ...stages[2], id: 'soil_test' };
    raw.satellite = { ...(raw.satellite as object), status: 'verified', reasonCode: 'ndvi_0.42', noteCode: 'something' };
    raw.actionRequired = [{ code: 'call_us', required: true, explanationKey: 'action.call_us', params: { categoryGroups: [['land_record', 'passport'], ['nope']] } }];

    const parsed = parseClaimProgress(raw);
    expect(parsed?.overallStatus).toBe('unknown');
    expect(parsed?.decision).toBeNull();
    expect(parsed?.stages[1]).toMatchObject({ id: 'photos', status: 'unknown', explanationKey: null });
    expect(parsed?.stages[2].id).toBe('unknown');
    expect(parsed?.satellite).toMatchObject({ status: 'unknown', reasonCode: null, noteCode: null, supportingOnly: true });
    expect(parsed?.actionRequired[0]).toMatchObject({ code: 'unknown', explanationKey: null, params: { categoryGroups: [['land_record']] } });

    // The translation fallbacks always end in a generic, always-translated key; no raw key leaks.
    expect(stageExplanationKeys(parsed!.stages[1])).toEqual(['progressStatusExplain_unknown', 'progressStatusExplain_unknown']);
    expect(satelliteReasonKeys(parsed!.satellite!)).toEqual(['satelliteStatusExplain_unknown', 'satelliteStatusExplain_unknown']);
    expect(actionTitleKeys(parsed!.actionRequired[0])).toEqual(['action_unknown', 'action_unknown']);
  });

  it('CT-2: explanation keys are looked up flat ("." → "_"), specific first, then generic by status', () => {
    expect(flattenKey('progress.photos.retrying_technical')).toBe('progress_photos_retrying_technical');
    expect(
      stageExplanationKeys({ explanationKey: 'progress.photos.retrying_technical', status: 'waiting' })
    ).toEqual(['progress_photos_retrying_technical', 'progressStatusExplain_waiting', 'progressStatusExplain_unknown']);
    expect(actionTitleKeys({ code: 'add_photos', explanationKey: 'action.add_photos' })).toEqual([
      'action_add_photos',
      'action_add_photos',
      'action_unknown',
    ]);
    // Every registry key is a contract key (the registry IS the contract file).
    expect(new Set(EXPLANATION_KEYS)).toEqual(
      new Set([
        ...Object.values(PROGRESS_CONTRACT.stages).flatMap((entries) => entries.map((entry) => entry.explanationKey)),
        ...PROGRESS_CONTRACT.actions.map((action) => action.explanationKey),
      ])
    );
  });

  it('CT-2: an older backend that sends an end date before the post-event window opens never shows it', () => {
    const raw = rawProgress('retrying_event_today');
    const satellite = raw.satellite as Record<string, unknown>;
    satellite.observedWindows = {
      preEvent: { start: '2026-09-06T00:00:00.000Z', end: '2026-10-11T00:00:00.000Z' },
      postEvent: { start: '2026-10-17T00:00:00.000Z', end: '2026-10-16T00:00:00.000Z', open: false, complete: false },
    };
    expect(parseClaimProgress(raw)?.satellite?.observedWindows?.postEvent?.end).toBeNull();
  });
});

describe('CT-3: nothing outside the contract reaches the view', () => {
  it('CT-3: forbidden farmer keys and internal identifiers are dropped wherever they are injected', () => {
    const raw = rawProgress('held_technical_reviewer', {
      jobId: 'job_1',
      attempts: 7,
      lastError: { code: 'PROVIDER_QUOTA', kind: 'quota' },
      reviewCases: [{ id: 'rv_123' }],
      policyHash: 'sha256:abc',
      provider: 'gemini',
      deltaNdvi: -0.21,
      cognitoSub: 'sub-123',
    });
    const stages = raw.stages as Array<Record<string, unknown>>;
    stages[1] = { ...stages[1], attempts: 3, maxAttempts: 7, lastError: { code: 'PROVIDER_TIMEOUT' }, errorCode: 'PROVIDER_TIMEOUT', jobId: 'rv_9' };
    raw.satellite = { ...(raw.satellite as object), deltaNdvi: -0.3, provider: 'cdse', reasonCode: 'PROVIDER_QUOTA', attemptLog: [{}] };
    raw.actionRequired = [
      { code: 'add_photos', stage: 'photos', required: true, explanationKey: 'action.add_photos', params: { reviewCaseId: 'rv_1', lastError: 'x' }, failedStep: 'photos' },
    ];

    const parsed = parseClaimProgress(raw);
    expect(parsed).not.toBeNull();
    const text = JSON.stringify(parsed);
    for (const needle of FORBIDDEN_STRINGS) expect(text, needle).not.toContain(needle);
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) {
          keys.add(key);
          walk(inner);
        }
      }
    };
    walk(parsed);
    for (const forbidden of PROGRESS_CONTRACT.forbiddenFarmerKeys) expect(keys.has(forbidden), forbidden).toBe(false);
  });
});

describe('progress display helpers', () => {
  it('satellite is never success- or danger-toned, whatever its status (D1)', () => {
    for (const status of [...PROGRESS_CONTRACT.satellite.statuses, 'unknown'] as const) {
      const tone = satelliteTone(status as never);
      expect(['info', 'quiet']).toContain(tone);
    }
    expect(satelliteTone('passed')).toBe('info');
    expect(satelliteTone('failed')).toBe('quiet');
  });

  it('overall tone: decided follows the decision; more evidence is a warning; waiting is info', () => {
    expect(overallTone({ overallStatus: 'decided', decision: 'verified' })).toBe('success');
    expect(overallTone({ overallStatus: 'decided', decision: 'rejected' })).toBe('danger');
    expect(overallTone({ overallStatus: 'action_required', decision: 'more_evidence_required' })).toBe('warning');
    expect(overallTone({ overallStatus: 'waiting_for_review', decision: null })).toBe('info');
    expect(overallTone({ overallStatus: 'withdrawn', decision: null })).toBe('quiet');
    expect(decisionTone('more_evidence_required')).toBe('warning');
  });

  it('current stage: the first needing attention or running, else the first pending, else the last', () => {
    const running = parseClaimProgress(rawProgress('checks_running'))!;
    expect(currentStage(running.stages)?.id).toBe('photos');
    const held = parseClaimProgress(rawProgress('held_ai_no_damage'))!;
    expect(currentStage(held.stages)?.id).toBe('decision');
    const fresh = parseClaimProgress(rawProgress('submitted_fresh'))!;
    expect(currentStage(fresh.stages)?.id).toBe('photos');
    const decided = parseClaimProgress(rawProgress('decided_verified'))!;
    expect(currentStage(decided.stages)?.id).toBe('decision');
    expect(currentStage([])).toBeNull();
  });

  it('legacy mode: only received and decision stages, no satellite, the state machine actions', () => {
    const base = {
      id: 'c_1',
      state: 'draft',
      submittedAt: null,
      decidedAt: null,
      updatedAt: '2026-10-16T08:00:00.000Z',
      assessment: null,
    } as unknown as LossClaim;
    const draft = legacyProgressFromClaim(base);
    expect(draft).toMatchObject({ overallStatus: 'draft', decision: null, satellite: null, legacy: true });
    expect(draft.stages.map((stage) => [stage.id, stage.status])).toEqual([
      ['received', 'pending'],
      ['decision', 'pending'],
    ]);
    expect(draft.actionRequired.map((action) => action.code)).toEqual(['submit_claim']);

    const mer = legacyProgressFromClaim({ ...base, state: 'more_evidence_required', submittedAt: '2026-10-15T00:00:00.000Z' } as LossClaim);
    expect(mer).toMatchObject({ overallStatus: 'action_required', decision: 'more_evidence_required' });
    expect(mer.actionRequired.map((action) => action.code)).toEqual(['resubmit_with_evidence']);

    const held = legacyProgressFromClaim({
      ...base,
      state: 'submitted',
      submittedAt: '2026-10-15T00:00:00.000Z',
      assessment: { state: null, held: true } as LossClaim['assessment'],
    } as LossClaim);
    expect(held.overallStatus).toBe('waiting_for_review');
    expect(held.stages[1]).toMatchObject({ status: 'waiting', explanationKey: 'progress.decision.waiting_for_reviewer' });

    const verified = legacyProgressFromClaim({ ...base, state: 'verified', submittedAt: '2026-10-15T00:00:00.000Z' } as LossClaim);
    expect(verified).toMatchObject({ overallStatus: 'decided', decision: 'verified' });
    // Every legacy key is a real contract key, so it is translated like any other.
    for (const stage of [...draft.stages, ...mer.stages, ...held.stages, ...verified.stages]) {
      expect(EXPLANATION_KEYS).toContain(stage.explanationKey);
    }
  });
});

describe('TRK-10 (pure): decision reasons and overlap warnings are translated from codes', () => {
  it('failing rules map to reasons in engine order; supporting-only weather never does; AI per outcome', () => {
    expect(
      decisionReasonKeys(
        {
          weatherCheck: { passed: false },
          aiCheck: { passed: false, reason: 'AI detected no crop damage in the submitted evidence' },
          timelinessCheck: { passed: false },
          areaCheck: { passed: true },
        },
        'rejected'
      )
    ).toEqual(['decisionReason_timelinessCheck', 'decisionReason_aiCheck_rejected']);
    expect(decisionReasonKeys({ areaCheck: { passed: true } }, 'verified')).toEqual(['decisionReason_outcome_verified']);
    expect(decisionReasonKeys(null, 'more_evidence_required')).toEqual(['decisionReason_outcome_more_evidence_required']);
    expect(decisionReasonKeys(null, 'bogus')).toEqual(['decisionReason_outcome_unknown']);
    // A reviewer's decision is explained as such, never with the stale engine rules.
    expect(decisionReasonKeys({ timelinessCheck: { passed: false } }, 'verified', 'admin')).toEqual(['decisionReason_reviewer']);
  });

  it('overlap warnings use their stable code, never the English message', () => {
    expect(overlapWarningMessage({ code: 'outside_parcel' })).toEqual({ key: 'overlapWarning_outside_parcel', params: {} });
    expect(overlapWarningMessage({ code: 'overlaps_verified', overlapAreaAcres: 0.4 })).toEqual({
      key: 'overlapWarning_overlaps_verified_area',
      params: { acres: 0.4 },
    });
    expect(overlapWarningMessage({ code: 'overlaps_verified' }).key).toBe('overlapWarning_overlaps_verified');
    expect(overlapWarningMessage({ code: 'something_new' }).key).toBe('overlapWarning_generic');
  });
});
