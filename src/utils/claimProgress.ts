// Farmer progress contract `progress-v1` (plan B4, ADR-022) — pure parsing and display helpers.
//
// The whole vocabulary comes from src/contracts/progress-contract-v1.json, a byte-for-byte copy of
// the backend's generated docs/architecture/progress-contract-v1.json (`npm run contract:check`
// compares the two). Nothing here hard-codes a stage, status, explanation key, action or satellite
// reason code, so a contract change is one file copy plus its translations (the I18N-P tests list
// every string that is missing).
//
// Rules this module enforces for the tracker:
//   - a response with another contractVersion, or a broken shape, parses to null (never guessed);
//   - any status outside the contract becomes 'unknown', which has its own generic copy;
//   - only known fields are copied, so forbidden farmer keys (job ids, attempts, error codes,
//     review cases, provider names, NDVI, policy hash…) can never reach the view;
//   - explanation keys are translated through flat i18n keys ('.' → '_') with fallbacks, so a raw
//     key such as `progress.photos.checking` is never rendered.

import contractJson from '../contracts/progress-contract-v1.json';
import type { Tone } from '../components/ui/tones';
import type {
  ClaimProgress,
  ClaimState,
  LossClaim,
  OwnershipDocumentCategory,
  ProgressAction,
  ProgressActionCode,
  ProgressDecision,
  ProgressOverallStatus,
  ProgressStage,
  ProgressStageId,
  ProgressStageStatus,
  SatelliteDisplayStatus,
  SatelliteObservedWindows,
  SatelliteProgress,
} from '../types';

// ── The contract ─────────────────────────────────────────────────────────────────────────

export interface ProgressContract {
  contractVersion: string;
  overallStatuses: string[];
  decisionValues: string[];
  stageIds: string[];
  stageStatuses: string[];
  stages: Record<string, Array<{ status: string; explanationKey: string }>>;
  actions: Array<{ code: string; stage: string; explanationKey: string; params: string[] }>;
  documentCategories: string[];
  satellite: {
    statuses: string[];
    reasonCodes: Array<{ status: string; reasonCode: string }>;
    noteCodes: string[];
    supportingOnly: boolean;
  };
  forbiddenFarmerKeys: string[];
}

export const PROGRESS_CONTRACT: ProgressContract = contractJson as ProgressContract;

export const PROGRESS_CONTRACT_VERSION = 'progress-v1' as const;

const setOf = (values: readonly string[]): ReadonlySet<string> => new Set(values);

export const OVERALL_STATUS_SET = setOf(PROGRESS_CONTRACT.overallStatuses);
export const DECISION_VALUE_SET = setOf(PROGRESS_CONTRACT.decisionValues);
export const STAGE_ID_SET = setOf(PROGRESS_CONTRACT.stageIds);
export const STAGE_STATUS_SET = setOf(PROGRESS_CONTRACT.stageStatuses);
export const ACTION_CODE_SET = setOf(PROGRESS_CONTRACT.actions.map((action) => action.code));
export const DOCUMENT_CATEGORY_SET = setOf(PROGRESS_CONTRACT.documentCategories);
export const SATELLITE_STATUS_SET = setOf(PROGRESS_CONTRACT.satellite.statuses);
export const SATELLITE_REASON_CODE_SET = setOf(PROGRESS_CONTRACT.satellite.reasonCodes.map((entry) => entry.reasonCode));
export const SATELLITE_NOTE_CODE_SET = setOf(PROGRESS_CONTRACT.satellite.noteCodes);

// Every explanation key the backend can send (stages and actions), as written in the contract.
export const EXPLANATION_KEYS: readonly string[] = [
  ...Object.values(PROGRESS_CONTRACT.stages).flatMap((entries) => entries.map((entry) => entry.explanationKey)),
  ...PROGRESS_CONTRACT.actions.map((action) => action.explanationKey),
];
export const EXPLANATION_KEY_SET = setOf(EXPLANATION_KEYS);

// The claim state machine is frozen (no new states; models/LossClaim.js CLAIM_STATES).
const CLAIM_STATES: readonly ClaimState[] = [
  'draft',
  'submitted',
  'processing',
  'verified',
  'partially_verified',
  'more_evidence_required',
  'rejected',
  'out_of_limit',
  'duplicate_area',
  'withdrawn',
];
const CLAIM_STATE_SET = setOf(CLAIM_STATES);

/** `progress.photos.retrying_technical` → `progress_photos_retrying_technical` (i18n keys are flat). */
export const flattenKey = (key: string): string => key.replace(/\./g, '_');

// ── Parsing (raw API value → ClaimProgress | null) ──────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const oneOf = <T extends string>(value: unknown, allowed: ReadonlySet<string>): T | null =>
  typeof value === 'string' && allowed.has(value) ? (value as T) : null;

// A timestamp is kept only when it really is one; anything else (including a stray message) is null.
const isoOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value))
    ? value
    : null;

const explanationKeyOrNull = (value: unknown): string | null =>
  typeof value === 'string' && EXPLANATION_KEY_SET.has(value) ? value : null;

const parseActionRef = (raw: unknown): ProgressStage['actionRequired'] => {
  if (!isRecord(raw)) return null;
  return {
    code: oneOf<ProgressActionCode>(raw.code, ACTION_CODE_SET) ?? 'unknown',
    required: raw.required === true,
  };
};

const parseStage = (raw: Record<string, unknown>): ProgressStage => ({
  id: oneOf<ProgressStageId>(raw.id, STAGE_ID_SET) ?? 'unknown',
  status: oneOf<ProgressStageStatus>(raw.status, STAGE_STATUS_SET) ?? 'unknown',
  blocking: raw.blocking === true,
  startedAt: isoOrNull(raw.startedAt),
  completedAt: isoOrNull(raw.completedAt),
  nextCheckAt: isoOrNull(raw.nextCheckAt),
  explanationKey: explanationKeyOrNull(raw.explanationKey),
  actionRequired: parseActionRef(raw.actionRequired),
});

const parseCategoryGroups = (raw: unknown): OwnershipDocumentCategory[][] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter(Array.isArray)
    .map((group) =>
      (group as unknown[]).filter(
        (category): category is OwnershipDocumentCategory => typeof category === 'string' && DOCUMENT_CATEGORY_SET.has(category)
      )
    )
    .filter((group) => group.length > 0);
};

const parseAction = (raw: Record<string, unknown>): ProgressAction => {
  const params = isRecord(raw.params) ? raw.params : {};
  const categoryGroups = parseCategoryGroups(params.categoryGroups);
  return {
    code: oneOf<ProgressActionCode>(raw.code, ACTION_CODE_SET) ?? 'unknown',
    stage: raw.stage == null ? null : (oneOf<ProgressStageId>(raw.stage, STAGE_ID_SET) ?? 'unknown'),
    required: raw.required === true,
    explanationKey: explanationKeyOrNull(raw.explanationKey),
    params: categoryGroups ? { categoryGroups } : {},
  };
};

const dateList = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.map(isoOrNull).filter((date): date is string => date !== null) : [];

const parseWindows = (raw: unknown): SatelliteObservedWindows | null => {
  if (!isRecord(raw)) return null;
  const pre = isRecord(raw.preEvent) ? raw.preEvent : null;
  const post = isRecord(raw.postEvent) ? raw.postEvent : null;
  const preStart = pre ? isoOrNull(pre.start) : null;
  const postStart = post ? isoOrNull(post.start) : null;
  const postOpen = Boolean(post && post.open === true);
  return {
    preEvent: pre && preStart ? { start: preStart, end: isoOrNull(pre.end) } : null,
    postEvent:
      post && postStart
        ? {
            start: postStart,
            // Contract: no end while the window is not open (an older backend sent one; never show it).
            end: postOpen ? isoOrNull(post.end) : null,
            open: postOpen,
            complete: post.complete === true,
          }
        : null,
  };
};

const parseSatellite = (raw: unknown): SatelliteProgress | null => {
  if (!isRecord(raw)) return null;
  const imagery = isRecord(raw.imageryDates) ? raw.imageryDates : null;
  return {
    status: oneOf<SatelliteDisplayStatus>(raw.status, SATELLITE_STATUS_SET) ?? 'unknown',
    reasonCode: oneOf<string>(raw.reasonCode, SATELLITE_REASON_CODE_SET),
    // Always true in the farmer view, whatever arrives: satellite never decides a claim (D1).
    supportingOnly: true,
    noteCode: oneOf<string>(raw.noteCode, SATELLITE_NOTE_CODE_SET),
    observedWindows: parseWindows(raw.observedWindows),
    imageryDates: imagery ? { preEvent: dateList(imagery.preEvent), postEvent: dateList(imagery.postEvent) } : null,
    nextCheckAt: isoOrNull(raw.nextCheckAt),
    updatedAt: isoOrNull(raw.updatedAt),
  };
};

const CLAIM_ID = /^[A-Za-z0-9_-]{1,64}$/;
const POLICY_ID = /^[A-Za-z0-9._-]{1,40}$/;

/**
 * Parse a raw progress-v1 object. Returns null for another contract version or a shape this
 * client cannot trust (no claim id, no stage list, an unknown claim state). Every field is copied
 * explicitly, so anything the contract does not define is dropped.
 */
export const parseClaimProgress = (raw: unknown): ClaimProgress | null => {
  if (!isRecord(raw)) return null;
  if (raw.contractVersion !== PROGRESS_CONTRACT_VERSION || PROGRESS_CONTRACT.contractVersion !== PROGRESS_CONTRACT_VERSION) {
    return null;
  }
  if (typeof raw.claimId !== 'string' || !CLAIM_ID.test(raw.claimId)) return null;
  const claimState = oneOf<ClaimState>(raw.claimState, CLAIM_STATE_SET);
  if (!claimState || !Array.isArray(raw.stages)) return null;
  return {
    contractVersion: PROGRESS_CONTRACT_VERSION,
    claimId: raw.claimId,
    claimState,
    overallStatus: oneOf<ProgressOverallStatus>(raw.overallStatus, OVERALL_STATUS_SET) ?? 'unknown',
    decision: oneOf<ProgressDecision>(raw.decision, DECISION_VALUE_SET),
    policyId: typeof raw.policyId === 'string' && POLICY_ID.test(raw.policyId) ? raw.policyId : null,
    submittedAt: isoOrNull(raw.submittedAt),
    lastUpdatedAt: isoOrNull(raw.lastUpdatedAt),
    nextCheckAt: isoOrNull(raw.nextCheckAt),
    stages: raw.stages.filter(isRecord).map(parseStage),
    satellite: parseSatellite(raw.satellite),
    actionRequired: Array.isArray(raw.actionRequired) ? raw.actionRequired.filter(isRecord).map(parseAction) : [],
  };
};

// ── Translation keys (never a raw API value on screen) ──────────────────────────────────────

export const overallLabelKey = (status: ClaimProgress['overallStatus']): string => `progressOverall_${status}`;
export const overallBodyKey = (status: ClaimProgress['overallStatus']): string => `progressOverallBody_${status}`;
export const stageLabelKey = (id: ProgressStage['id']): string => `progressStage_${id}`;
export const stageStatusLabelKey = (status: ProgressStage['status']): string => `progressStatus_${status}`;

/**
 * Keys for t() in order of preference: the stage's own explanation, then generic copy for its
 * status, then generic copy for an unknown status (always translated, so t() never falls through
 * to printing a key).
 */
export const stageExplanationKeys = (stage: Pick<ProgressStage, 'explanationKey' | 'status'>): string[] => [
  ...(stage.explanationKey ? [flattenKey(stage.explanationKey)] : []),
  `progressStatusExplain_${stage.status}`,
  'progressStatusExplain_unknown',
];

export const actionTitleKeys = (action: Pick<ProgressAction, 'code' | 'explanationKey'>): string[] => [
  ...(action.explanationKey ? [flattenKey(action.explanationKey)] : []),
  `action_${action.code}`,
  'action_unknown',
];
export const actionBodyKeys = (action: Pick<ProgressAction, 'code'>): string[] => [`actionBody_${action.code}`, 'actionBody_unknown'];

export const satelliteStatusLabelKey = (status: SatelliteProgress['status']): string => `satelliteStatus_${status}`;

export const satelliteReasonKeys = (satellite: Pick<SatelliteProgress, 'reasonCode' | 'status'>): string[] => [
  ...(satellite.reasonCode ? [`satelliteReason_${satellite.reasonCode}`] : []),
  `satelliteStatusExplain_${satellite.status}`,
  'satelliteStatusExplain_unknown',
];

export const satelliteNoteKey = (noteCode: string): string => `satelliteNote_${noteCode}`;

// ── Tones (colour is never the only signal; every pill also has an icon and text) ─────────

const POSITIVE_DECISIONS: ReadonlySet<string> = new Set(['verified', 'partially_verified']);
const NEGATIVE_DECISIONS: ReadonlySet<string> = new Set(['rejected', 'out_of_limit', 'duplicate_area']);

export const decisionTone = (decision: string | null): Tone =>
  decision && POSITIVE_DECISIONS.has(decision)
    ? 'success'
    : decision && NEGATIVE_DECISIONS.has(decision)
      ? 'danger'
      : decision === 'more_evidence_required'
        ? 'warning'
        : 'quiet';

export const overallTone = (progress: Pick<ClaimProgress, 'overallStatus' | 'decision'>): Tone => {
  switch (progress.overallStatus) {
    case 'in_progress':
    case 'waiting_for_review':
      return 'info';
    case 'action_required':
      return 'warning';
    case 'decided':
      return decisionTone(progress.decision);
    default:
      return 'quiet';
  }
};

// Satellite is supporting evidence only: never success (it proves nothing) and never danger (it
// can never count against the farmer). `passed` is info; everything else is quiet.
export const satelliteTone = (status: SatelliteProgress['status']): Extract<Tone, 'info' | 'quiet'> =>
  status === 'passed' || status === 'processing' ? 'info' : 'quiet';

// ── Stage focus ─────────────────────────────────────────────────────────────────────────────

const ATTENTION_STATUSES: ReadonlySet<string> = new Set(['blocked', 'failed_technical', 'waiting', 'active']);

/** The stage the farmer should look at: the first one needing attention or running, else the first pending one, else the last. */
export const currentStage = (stages: ProgressStage[]): ProgressStage | null => {
  if (stages.length === 0) return null;
  return (
    stages.find((stage) => ATTENTION_STATUSES.has(stage.status)) ??
    stages.find((stage) => stage.status === 'pending') ??
    stages[stages.length - 1]
  );
};

// ── Legacy mode (an older backend without /progress) ────────────────────────────────────────
// Built only from the claim the farmer can already read: the two stages the claim state alone
// can describe honestly (received and decision), no satellite card, and the actions the state
// machine allows. Nothing is estimated.

const isHeldClaim = (claim: LossClaim): boolean =>
  claim.state === 'submitted' && Boolean(claim.assessment?.held) && !claim.assessment?.state;

const legacyOverall = (claim: LossClaim): ProgressOverallStatus => {
  if (claim.state === 'draft') return 'draft';
  if (claim.state === 'withdrawn') return 'withdrawn';
  if (claim.state === 'more_evidence_required') return 'action_required';
  if (DECISION_VALUE_SET.has(claim.state)) return 'decided';
  if (isHeldClaim(claim)) return 'waiting_for_review';
  return 'in_progress';
};

const stageOf = (
  id: ProgressStageId,
  status: ProgressStageStatus,
  explanationKey: string,
  extra: Partial<ProgressStage> = {}
): ProgressStage => ({
  id,
  status,
  blocking: true,
  startedAt: null,
  completedAt: null,
  nextCheckAt: null,
  explanationKey: EXPLANATION_KEY_SET.has(explanationKey) ? explanationKey : null,
  actionRequired: null,
  ...extra,
});

export const legacyProgressFromClaim = (claim: LossClaim): ClaimProgress => {
  const overallStatus = legacyOverall(claim);
  const state = claim.state;
  const neverSubmitted = !claim.submittedAt;
  const received =
    state === 'draft'
      ? stageOf('received', 'pending', 'progress.received.waiting_for_submit', {
          actionRequired: { code: 'submit_claim', required: true },
        })
      : state === 'withdrawn' && neverSubmitted
        ? stageOf('received', 'not_applicable', 'progress.received.not_submitted')
        : stageOf('received', 'complete', 'progress.received.complete', { completedAt: claim.submittedAt });
  const decision =
    state === 'draft'
      ? stageOf('decision', 'pending', 'progress.decision.waiting_for_submit')
      : state === 'withdrawn'
        ? stageOf('decision', 'not_applicable', 'progress.decision.claim_withdrawn')
        : state === 'more_evidence_required'
          ? stageOf('decision', 'blocked', 'progress.decision.needs_more_evidence', {
              actionRequired: { code: 'resubmit_with_evidence', required: true },
            })
          : DECISION_VALUE_SET.has(state)
            ? stageOf('decision', 'complete', 'progress.decision.complete', { completedAt: claim.decidedAt })
            : isHeldClaim(claim)
              ? stageOf('decision', 'waiting', 'progress.decision.waiting_for_reviewer')
              : state === 'processing'
                ? stageOf('decision', 'active', 'progress.decision.deciding')
                : stageOf('decision', 'pending', 'progress.decision.waiting_for_checks');
  const actionRequired: ProgressAction[] = [];
  if (state === 'draft') {
    actionRequired.push({ code: 'submit_claim', stage: 'received', required: true, explanationKey: 'action.submit_claim', params: {} });
  }
  if (state === 'more_evidence_required') {
    actionRequired.push({
      code: 'resubmit_with_evidence',
      stage: 'decision',
      required: true,
      explanationKey: 'action.resubmit_with_evidence',
      params: {},
    });
  }
  return {
    contractVersion: PROGRESS_CONTRACT_VERSION,
    claimId: claim.id,
    claimState: state,
    overallStatus,
    decision: DECISION_VALUE_SET.has(state) ? (state as ProgressDecision) : null,
    policyId: null,
    submittedAt: isoOrNull(claim.submittedAt),
    lastUpdatedAt: isoOrNull(claim.updatedAt),
    nextCheckAt: null,
    stages: [received, decision],
    satellite: null,
    actionRequired: actionRequired.map((action) => ({
      ...action,
      explanationKey: explanationKeyOrNull(action.explanationKey),
    })),
    legacy: true,
  };
};

// ── Time formatting (the farmer's language; never a raw ISO string) ─────────────────────────

const locale = (language: string): string => (language === 'ta' ? 'ta-IN' : 'en-IN');

/** "2 minutes ago" / "2 நிமிடங்களுக்கு முன்"; empty for an invalid time. */
export const formatRelativeTime = (value: string | number | null | undefined, now: number, language: string): string => {
  const time = typeof value === 'number' ? value : value ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return '';
  const seconds = Math.round((time - now) / 1000);
  const abs = Math.abs(seconds);
  try {
    const rtf = new Intl.RelativeTimeFormat(locale(language), { numeric: 'auto' });
    if (abs < 45) return rtf.format(0, 'second');
    if (abs < 45 * 60) return rtf.format(Math.round(seconds / 60), 'minute');
    if (abs < 22 * 60 * 60) return rtf.format(Math.round(seconds / 3600), 'hour');
    return rtf.format(Math.round(seconds / 86_400), 'day');
  } catch {
    return formatDateTime(time, language);
  }
};

/** A moment in the farmer's local time, e.g. "16 Oct, 2:40 pm". */
export const formatDateTime = (value: string | number | null | undefined, language: string): string => {
  const time = typeof value === 'number' ? value : value ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return '';
  try {
    return new Date(time).toLocaleString(locale(language), {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return new Date(time).toISOString();
  }
};

/**
 * A calendar date the backend computed in UTC (satellite windows, imagery dates). Formatted in
 * UTC so a farmer west of Greenwich never sees the day before.
 */
export const formatUtcDate = (value: string | null | undefined, language: string): string => {
  const time = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return '';
  try {
    return new Date(time).toLocaleDateString(locale(language), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return new Date(time).toISOString().slice(0, 10);
  }
};
