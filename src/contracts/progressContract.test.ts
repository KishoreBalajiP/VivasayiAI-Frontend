import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import contract from './progress-contract-v1.json';
import {
  EXPLANATION_KEY_SET,
  flattenKey,
  overallLabelKey,
  overallBodyKey,
  satelliteStatusLabelKey,
  stageLabelKey,
  stageStatusLabelKey,
} from '../utils/claimProgress';
import { DECISION_OUTCOMES, DECISION_RULE_ORDER, decisionReasonKeys, overlapWarningMessage } from '../utils/claimFlow';

// I18N-P1..3: every value the progress-v1 contract can carry has an English AND a Tamil string, and
// the Tamil one is really translated. The test iterates the contract FILE (a copy of the backend's
// generated docs/architecture/progress-contract-v1.json, kept in sync by `npm run contract:check`),
// so a backend vocabulary change fails here until its copy is written in both languages.

const en = i18n.getResourceBundle('en', 'translation') as Record<string, string>;
const ta = i18n.getResourceBundle('ta', 'translation') as Record<string, string>;

// Keys whose Tamil may legitimately equal the English (brand names, codes). Empty today; add a key
// here only with a reason.
const IDENTICAL_ALLOWED: ReadonlySet<string> = new Set<string>([]);

const problems = (keys: string[]) =>
  keys.flatMap((key) => {
    const english = en[key];
    const tamil = ta[key];
    if (typeof english !== 'string' || english.trim() === '') return [`${key}: no English`];
    if (typeof tamil !== 'string' || tamil.trim() === '') return [`${key}: no Tamil`];
    if (tamil.trim() === english.trim() && !IDENTICAL_ALLOWED.has(key)) return [`${key}: Tamil equals English`];
    if (!/[஀-௿]/.test(tamil)) return [`${key}: Tamil has no Tamil script`];
    return [];
  });

const stageEntries = Object.entries(contract.stages).flatMap(([stage, entries]) => entries.map((entry) => ({ stage, ...entry })));

describe('I18N-P: the progress contract is fully translated', () => {
  it('I18N-P1: every stage, stage status, overall status, decision value and explanation key has en and ta strings', () => {
    expect(contract.contractVersion).toBe('progress-v1');
    const keys = [
      ...contract.stageIds.map((id) => stageLabelKey(id as never)),
      ...contract.stageStatuses.map((status) => stageStatusLabelKey(status as never)),
      ...contract.stageStatuses.map((status) => `progressStatusExplain_${status}`),
      ...contract.overallStatuses.flatMap((status) => [overallLabelKey(status as never), overallBodyKey(status as never)]),
      ...contract.decisionValues.map((decision) => `claimState_${decision}`),
      ...stageEntries.map((entry) => flattenKey(entry.explanationKey)),
    ];
    expect(keys.length).toBeGreaterThan(60);
    expect(problems(keys)).toEqual([]);
    // Each explanation key belongs to its own stage and status in the contract.
    for (const entry of stageEntries) {
      expect(entry.explanationKey.startsWith(`progress.${entry.stage}.`), entry.explanationKey).toBe(true);
      expect(contract.stageStatuses).toContain(entry.status);
    }
  });

  it('I18N-P2: every action code, satellite status, satellite reason code, note code and document category has en and ta strings', () => {
    const keys = [
      ...contract.actions.flatMap((action) => [flattenKey(action.explanationKey), `action_${action.code}`, `actionBody_${action.code}`]),
      ...contract.satellite.statuses.flatMap((status) => [satelliteStatusLabelKey(status as never), `satelliteStatusExplain_${status}`]),
      ...contract.satellite.reasonCodes.map((entry) => `satelliteReason_${entry.reasonCode}`),
      ...contract.satellite.noteCodes.map((code) => `satelliteNote_${code}`),
      ...contract.documentCategories.map((category) => `ownershipCategory_${category}`),
    ];
    expect(problems(keys)).toEqual([]);
    // Satellite copy never claims verification or proof, in any status (owner decision D1).
    for (const key of keys.filter((k) => k.startsWith('satellite'))) {
      expect(en[key], key).not.toMatch(/\bverified\b|\bproof\b|\bproves?\b/i);
    }
    expect(contract.satellite.supportingOnly).toBe(true);
  });

  it('I18N-P3: generic fallbacks, decision reasons and overlap warnings are translated; the parser registry is exactly the contract', () => {
    const generic = [
      'progressOverall_unknown',
      'progressOverallBody_unknown',
      'progressStage_unknown',
      'progressStatus_unknown',
      'progressStatusExplain_unknown',
      'satelliteStatus_unknown',
      'satelliteStatusExplain_unknown',
      'action_unknown',
      'actionBody_unknown',
      'claimRule_unknown',
      'satelliteSupportingNote',
    ];
    const reasons = new Set<string>(['decisionReason_reviewer', 'decisionReason_outcome_unknown', 'decisionReason_aiCheck_unknown']);
    for (const outcome of DECISION_OUTCOMES) {
      for (const rule of DECISION_RULE_ORDER) {
        for (const key of decisionReasonKeys({ [rule]: { passed: false } }, outcome)) reasons.add(key);
      }
      for (const key of decisionReasonKeys({}, outcome)) reasons.add(key);
    }
    const overlap = ['outside_parcel', 'overlaps_in_flight', 'overlaps_verified', 'unknown_code'].map((code) => overlapWarningMessage({ code }).key);
    overlap.push(overlapWarningMessage({ code: 'overlaps_verified', overlapAreaAcres: 1 }).key);
    const rules = DECISION_RULE_ORDER.map((rule) => `claimRule_${rule}`);
    expect(problems([...generic, ...reasons, ...overlap, ...rules])).toEqual([]);

    const contractKeys = new Set([...stageEntries.map((entry) => entry.explanationKey), ...contract.actions.map((action) => action.explanationKey)]);
    expect(EXPLANATION_KEY_SET).toEqual(contractKeys);
  });
});
