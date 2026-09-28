// Phase 10 (E9-S10) — Pure admin review queue + dashboard + investigation logic. No React, no
// network, no identity. Mirrors the FROZEN backend contracts (08_API_Documentation §10.9–10.12,
// services/adminOverrideRules.service.js + adminQueue.service.js + adminDashboard.service.js +
// adminInvestigation.service.js). The client never re-derives authority: it only shapes honest
// UI affordances from backend-declared data, builds the query string the backend validates, and
// turns backend metrics into display cards. Tests keep these mirrors in lock-step with the
// backend vocabulary.

import type {
  AdminClaimDetail,
  AdminQueueEntry,
  AdminQueueFilters,
  DashboardMetrics,
  InvestigationSummary,
  LossClaim,
} from '../types';

// ── Frozen vocabulary mirrors (kept in sync with the backend by tests) ─────────────────

// Engine decision states (adminOverrideRules.service.js DECISION_STATES).
export const DECISION_STATES = [
  'verified',
  'partially_verified',
  'rejected',
  'out_of_limit',
  'duplicate_area',
  'more_evidence_required',
];

// Source states from which an admin may override (OVERRIDEABLE_STATES).
export const OVERRIDEABLE_STATES = [
  'processing',
  'more_evidence_required',
  'rejected',
  'out_of_limit',
  'duplicate_area',
  'verified',
  'partially_verified',
];

// Engine-review states that fill the DEFAULT admin queue (adminQueue.service.js
// QUEUE_STATES). VERIFIED and PARTIALLY_VERIFIED are never in the queue by default — a
// verified claim moves through the farmer list, not the exception-workflow queue.
export const QUEUE_STATES = [
  'rejected',
  'out_of_limit',
  'duplicate_area',
  'more_evidence_required',
];

// The allowed FROM states for a farmer appeal: the four negative engine decisions. Positive
// decisions (verified / partially_verified) and withdrawn are NOT appealable.
export const APPEALABLE_DECISION_STATES = [
  'rejected',
  'out_of_limit',
  'duplicate_area',
  'more_evidence_required',
];

export const APPEALABLE_DECISION_STATE_SET: ReadonlySet<string> = new Set(APPEALABLE_DECISION_STATES);

export const DECISION_STATE_SET: ReadonlySet<string> = new Set(DECISION_STATES);
export const OVERRIDEABLE_STATE_SET: ReadonlySet<string> = new Set(OVERRIDEABLE_STATES);
export const QUEUE_STATE_SET: ReadonlySet<string> = new Set(QUEUE_STATES);

export const isDecisionState = (state: string): boolean => DECISION_STATE_SET.has(state);

export const canAppealState = (state: string): boolean => APPEALABLE_DECISION_STATE_SET.has(state);

export const canOverrideFrom = (state: string): boolean => OVERRIDEABLE_STATE_SET.has(state);

export const inDefaultQueue = (state: string): boolean => QUEUE_STATE_SET.has(state);

// Appeal text bounds (backend appealBody validation).
export const APPEAL_REASON_MIN_LENGTH = 10;
export const APPEAL_REASON_MAX_LENGTH = 400;

// Override bounds (backend overrideBody validation).
export const OVERRIDE_REASON_MIN_LENGTH = 10;
export const OVERRIDE_REASON_MAX_LENGTH = 400;
export const OVERRIDE_NOTE_MAX_LENGTH = 400;
export const APPROVER_SUB_MAX_LENGTH = 64;

// ── Query string builder (mirrors backend validation; only non-empty filters are sent) ──

// Admin list inputs additionally cover paging, which the backend clamps (page 1..10000,
// limit 1..100). The queue-filter object itself never carries page/limit — they travel as
// independent query params (mirrors adminQueue.service.js normalizeQueueFilters).
export type AdminQueryInput = Partial<AdminQueueFilters & { page?: number; limit?: number }>;

export const buildAdminQueryString = (
  filters: AdminQueryInput = {}
): string => {
  const params: string[] = [];
  if (typeof filters.page === 'number' && Number.isFinite(filters.page) && filters.page > 0) {
    params.push(`page=${filters.page}`);
  }
  if (typeof filters.limit === 'number' && Number.isFinite(filters.limit) && filters.limit > 0) {
    params.push(`limit=${filters.limit}`);
  }
  if (filters.status && typeof filters.status === 'string') params.push(`status=${encodeURIComponent(filters.status)}`);
  if (filters.eventType && typeof filters.eventType === 'string') params.push(`eventType=${encodeURIComponent(filters.eventType)}`);
  if (filters.withAppeal === 'true' || filters.withAppeal === 'false') params.push(`withAppeal=${filters.withAppeal}`);
  if (filters.aiFailed === 'true' || filters.aiFailed === 'false') params.push(`aiFailed=${filters.aiFailed}`);
  if (typeof filters.search === 'string' && filters.search.trim()) {
    params.push(`search=${encodeURIComponent(filters.search.trim())}`);
  }
  return params.length > 0 ? `?${params.join('&')}` : '';
};

// ── Client-side form validation (backend remains authoritative) ─────────────────────────

export type AppealValidation =
  | { ok: true }
  | { ok: false; reason: 'required' | 'tooShort' | 'tooLong' };

export const validateAppealReason = (reason: string | null | undefined): AppealValidation => {
  const text = (reason ?? '').trim();
  if (text.length === 0) return { ok: false, reason: 'required' };
  if (text.length < APPEAL_REASON_MIN_LENGTH) return { ok: false, reason: 'tooShort' };
  if (text.length > APPEAL_REASON_MAX_LENGTH) return { ok: false, reason: 'tooLong' };
  return { ok: true };
};

export type OverrideValidation =
  | { ok: true }
  | { ok: false; reason: 'noState' | 'sameState' | 'notDecision' | 'notOverrideable' | 'reasonRequired' | 'reasonTooShort' | 'reasonTooLong' | 'noteTooLong' | 'noKey' | 'approverSelf' };

export interface OverrideFormState {
  toState: string;
  reason: string;
  adminNote?: string;
  approverSub?: string;
  overrideKey: string;
  currentState: string;
}

export const validateOverride = (
  form: Pick<OverrideFormState, 'toState' | 'reason' | 'adminNote' | 'overrideKey' | 'currentState'>
): OverrideValidation => {
  const { toState, reason, adminNote, overrideKey, currentState } = form;
  if (!toState) return { ok: false, reason: 'noState' };
  if (!isDecisionState(toState)) return { ok: false, reason: 'notDecision' };
  if (toState === currentState) return { ok: false, reason: 'sameState' };
  if (!canOverrideFrom(currentState)) return { ok: false, reason: 'notOverrideable' };
  const trimmedReason = (reason ?? '').trim();
  if (!trimmedReason) return { ok: false, reason: 'reasonRequired' };
  if (trimmedReason.length < OVERRIDE_REASON_MIN_LENGTH) return { ok: false, reason: 'reasonTooShort' };
  if (trimmedReason.length > OVERRIDE_REASON_MAX_LENGTH) return { ok: false, reason: 'reasonTooLong' };
  if ((adminNote ?? '').length > OVERRIDE_NOTE_MAX_LENGTH) return { ok: false, reason: 'noteTooLong' };
  if (!overrideKey || overrideKey.trim().length < 8) return { ok: false, reason: 'noKey' };
  return { ok: true };
};

// place-helper: the UI passes the signed-in admin's cognitoSub to reject self-approval.
export const approverEqualsActor = (actorSub: string | null | undefined, approverSub: string | null | undefined): boolean =>
  Boolean(
    approverSub &&
    approverSub.trim().length > 0 &&
    actorSub &&
    approverSub.trim() === actorSub
  );

// ── Review queue view model (only backend-serialized fields, identity-free) ─────────────

export interface QueueViewModel {
  id: string;
  parcelName: string | null;
  crop: string | null;
  eventTypeLabelKey: string;
  eventDate: string;
  claimedAreaAcres: number;
  state: string;
  stateLabelKey: string;
  hasAppeal: boolean;
  aiFailed: boolean;
  decidedAt: string | null;
  decisionReason: string | null;
  appealReason: string | null;
}

export const queueEntryViewModel = (entry: AdminQueueEntry): QueueViewModel => ({
  id: entry.id,
  parcelName: entry.parcelName,
  crop: entry.crop,
  eventTypeLabelKey: `claimEvent_${entry.eventType}`,
  eventDate: entry.eventDate,
  claimedAreaAcres: entry.claimedAreaAcres,
  state: entry.state,
  stateLabelKey: `claimState_${entry.state}`,
  hasAppeal: Boolean(entry.hasAppeal),
  aiFailed: Boolean(entry.aiFailed),
  decidedAt: entry.decidedAt,
  decisionReason: entry.decisionReason,
  appealReason: entry.appealReason,
});

// ── Dashboard cards (pure, server metrics → display cards) ─────────────────────────────

export interface DashboardCard {
  id: string;
  labelKey: string;
  value: string;
  tone: 'plain' | 'positive' | 'warning' | 'danger' | 'neutral';
}

export const adminDashboardCards = (metrics: DashboardMetrics): DashboardCard[] => {
  const cards: DashboardCard[] = [
    { id: 'total', labelKey: 'adminMetric_total', value: String(metrics.total), tone: 'plain' },
    { id: 'verified', labelKey: 'adminMetric_verified', value: String(metrics.verified), tone: 'positive' },
    { id: 'partiallyVerified', labelKey: 'adminMetric_partiallyVerified', value: String(metrics.partiallyVerified), tone: 'positive' },
    { id: 'rejected', labelKey: 'adminMetric_rejected', value: String(metrics.rejected), tone: 'danger' },
    { id: 'outOfLimit', labelKey: 'adminMetric_outOfLimit', value: String(metrics.outOfLimit), tone: 'warning' },
    { id: 'duplicate', labelKey: 'adminMetric_duplicate', value: String(metrics.duplicate), tone: 'neutral' },
    { id: 'moreEvidence', labelKey: 'adminMetric_moreEvidence', value: String(metrics.moreEvidence), tone: 'neutral' },
    { id: 'pendingHumanReview', labelKey: 'adminMetric_pendingHumanReview', value: String(metrics.pendingHumanReview), tone: 'warning' },
    { id: 'appealCount', labelKey: 'adminMetric_appealCount', value: String(metrics.appealCount), tone: 'neutral' },
  ];
  return cards;
};

export const formatDuration = (ms: number | null): string => {
  if (ms === null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
};

export const formatPercent = (rate: number | null): string => {
  if (rate === null || !Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
};

// ── Appeal view model (farmer-facing + admin display) ──────────────────────────────────

export interface AppealViewModel {
  id: string;
  statusLabelKey: string;
  reason: string;
  statement: string | null;
  createdAt: string;
  resolvedAt: string | null;
  decisionKind: string | null;
  decisionToState: string | null;
  canAddEvidence: boolean;
}

export const appealViewModel = (appeal: {
  id: string;
  status: string;
  reason: string;
  statement: string | null;
  createdAt: string;
  resolvedAt: string | null;
  decision?: { kind?: string; toState?: string } | null;
  statusLabel?: string;
}): AppealViewModel => ({
  id: appeal.id,
  statusLabelKey: `appealStatus_${appeal.status}`,
  reason: appeal.reason,
  statement: appeal.statement ?? null,
  createdAt: appeal.createdAt,
  resolvedAt: appeal.resolvedAt ?? null,
  decisionKind: appeal.decision?.kind ?? null,
  decisionToState: appeal.decision?.toState ?? null,
  canAddEvidence: appeal.status === 'submitted' || appeal.status === 'under_review',
});

// ── Investigation summary → cards ──────────────────────────────────────────────────────

export interface InvestigationCard {
  id: string;
  labelKey: string;
  value: string;
  tone: 'danger' | 'warning' | 'neutral' | 'plain';
}

export const investigationCards = (summary: InvestigationSummary): InvestigationCard[] => [
  { id: 'total', labelKey: 'adminInvest_total', value: String(summary.totalEntries), tone: 'plain' },
  { id: 'high', labelKey: 'adminInvest_high', value: String(summary.high), tone: 'danger' },
  { id: 'medium', labelKey: 'adminInvest_medium', value: String(summary.medium), tone: 'warning' },
  { id: 'low', labelKey: 'adminInvest_low', value: String(summary.low), tone: 'neutral' },
  { id: 'flags', labelKey: 'adminInvest_flags', value: String(summary.totalFlags), tone: 'neutral' },
];

export const investigationFlagTextKey = (code: string): string => `adminInvest_flag_${code}`;

// ── Admin detail helpers ───────────────────────────────────────────────────────────────

export const canShowOverride = (detail: AdminClaimDetail | null): boolean =>
  Boolean(detail && canOverrideFrom(detail.state));

export const claimAppealSummary = (detail: AdminClaimDetail | null): {
  count: number;
  activeCount: number;
} => {
  const appeals = detail?.appeals ?? [];
  const active = appeals.filter((a) => a.status === 'submitted' || a.status === 'under_review');
  return { count: appeals.length, activeCount: active.length };
};

export const hasActiveAppeal = (detail: AdminClaimDetail | null): boolean =>
  claimAppealSummary(detail).activeCount > 0;

// SECURITY guard: admin view models must never expose identity/secret slots. Reuses the same
// forbidden-property matcher as the farmer view models (claimFlow.ts).
const FORBIDDEN_ADMIN_PROPERTY =
  /^(cognitoSub|userEmail|s3Key|s3key|bucket|secret|accessKey|signature|presignedUrl|adminNote.*|.*\.key)$/i;

export const adminModelHasSensitiveField = (model: unknown): boolean => {
  if (model === null || typeof model !== 'object') return false;
  return Object.entries(model).some(([key, value]) => {
    if (FORBIDDEN_ADMIN_PROPERTY.test(key)) return true;
    if (value !== null && typeof value === 'object') {
      return adminModelHasSensitiveField(value);
    }
    return false;
  });
};

// Resonant helper: the UI asks "may this farmer appeal this claim?" purely from the backend
// claim state, matching backend appeal.service.js's eligibility gate.
export const farmerMayAppeal = (claim: Pick<LossClaim, 'state'> | null): boolean =>
  Boolean(claim && canAppealState(claim.state));