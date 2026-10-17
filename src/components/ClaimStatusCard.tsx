import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import type { ClaimState } from '../types';
import {
  claimStateLabelKey,
  decisionReasonKeys,
  formatClaimDate,
  overlapWarningMessage,
  verificationResultModel,
  type VerificationResultModel,
} from '../utils/claimFlow';
import { Badge, cn, type Tone } from './ui';
import type { VerificationDecision } from '../types';

// Semantic tones for the ten frozen claim states (ADR-019 / claimState.service.js). Colour is never
// the only signal: every badge also carries an icon and the translated state name.
const STATE_TONE: Record<string, Tone> = {
  draft: 'quiet',
  withdrawn: 'quiet',
  submitted: 'info',
  processing: 'info',
  verified: 'success',
  partially_verified: 'success',
  more_evidence_required: 'warning',
  rejected: 'danger',
  out_of_limit: 'danger',
  duplicate_area: 'danger',
};

export const claimStateTone = (state: string): Tone => STATE_TONE[state] ?? 'quiet';

export interface ClaimStateBadgeProps {
  state: ClaimState;
  className?: string;
}

export const ClaimStateBadge = ({ state, className }: ClaimStateBadgeProps) => {
  const { t } = useTranslation();
  return (
    <Badge
      tone={claimStateTone(state)}
      icon={state === 'processing' ? Loader2 : state === 'verified' ? CheckCircle2 : state === 'rejected' ? XCircle : undefined}
      className={className}
    >
      {t(claimStateLabelKey(state))}
    </Badge>
  );
};

// ── Verification result panel ──────────────────────────────────────────────────────────
// Renders ONLY backend-declared decision fields. The outcome chip uses the shared claim-state
// vocabulary (the verification outcome IS a claim state value). Rule checks are backend engine
// reports shown as an explainable pass/fail list — never a client opinion. Supporting-only rules
// (weather) are listed without a verdict.
//
// The backend's `reason` and overlap `message` are English free text (an override's reason is the
// reviewer's own note), so neither is ever shown: the reasons are rebuilt from the failing rules
// (decisionReasonKeys) and the warnings from their stable codes (overlapWarningMessage).

export interface VerificationResultCardProps {
  verification: VerificationDecision;
  language: string;
  compact?: boolean;
}

export const VerificationResultCard = ({
  verification,
  language,
  compact = false,
}: VerificationResultCardProps) => {
  const { t } = useTranslation();
  const model: VerificationResultModel = verificationResultModel(verification);
  const outcome = verification.outcome;
  const reasonKeys = decisionReasonKeys(model.rules, outcome, model.decidedBy);

  return (
    <div className={cn('rounded-card border border-surface-border bg-white p-4 shadow-card', compact && 'mt-3')}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">{t('verificationResultTitle')}</h3>
        {model.outcomeLabelKey && outcome && (
          <Badge tone={claimStateTone(outcome)} data-testid="decision-outcome">
            {t(model.outcomeLabelKey)}
          </Badge>
        )}
      </div>

      {/* Why: translated from the engine's rule report, never the backend's English reason. */}
      <div className="mb-3 rounded-control border border-surface-border bg-surface-muted px-3 py-2 text-sm text-ink" data-testid="decision-reasons">
        <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('decisionReasonsTitle')}</p>
        <ul className="space-y-0.5">
          {reasonKeys.map((key) => (
            <li key={key}>{t([key, 'decisionReason_outcome_unknown'])}</li>
          ))}
        </ul>
      </div>

      {/* Deterministic engine rule checks */}
      {model.ruleRows.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            {t('rulesLabel')}
          </div>
          <ul className="space-y-1">
            {model.ruleRows.map((row) => (
              <li key={row.name} className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">{t([row.labelKey, 'claimRule_unknown'])}</span>
                {row.supportingOnly ? (
                  // Supporting evidence (weather) never passes or fails a claim on its own.
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted">
                    <Info aria-hidden="true" className="h-3.5 w-3.5" />
                    {t('ruleSupportingOnly')}
                  </span>
                ) : (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-xs font-semibold',
                      row.passed ? 'text-success-fg' : 'text-danger-fg'
                    )}
                  >
                    {row.passed ? (
                      <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                    {row.passed ? t('rulePassed') : t('ruleFailed')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Backend area numbers — never client math. Every <dt> has its <dd>. */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        {model.approvedAreaAcres !== null && (
          <div>
            <dt className="text-xs text-ink-subtle">{t('approvedAreaTitle')}</dt>
            <dd className="font-semibold text-ink">
              {model.approvedAreaAcres} {t('acre')}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-ink-subtle">{t('claimedAreaResultLabel')}</dt>
          <dd className="font-semibold text-ink">
            {model.claimedAreaAcres !== null ? `${model.claimedAreaAcres} ${t('acre')}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-subtle">{t('parcelAreaResultLabel')}</dt>
          <dd className="font-semibold text-ink">
            {model.parcelAreaAcres !== null ? `${model.parcelAreaAcres} ${t('acre')}` : '—'}
          </dd>
        </div>
        {/* Phase 9 (E9-S9) — remaining eligible & overlap budget */}
        {model.remainingEligible !== null && (
          <div>
            <dt className="text-xs text-ink-subtle">{t('remainingEligibleLabel')}</dt>
            <dd className="font-semibold text-ink">{model.remainingEligible} {t('acre')}</dd>
          </div>
        )}
        {model.previouslyVerifiedAcres !== null && model.previouslyVerifiedAcres > 0 && (
          <div>
            <dt className="text-xs text-ink-subtle">{t('previouslyVerifiedLabel')}</dt>
            <dd className="font-semibold text-ink">{model.previouslyVerifiedAcres} {t('acre')}</dd>
          </div>
        )}
        {model.inFlightAreaAcres !== null && model.inFlightAreaAcres > 0 && (
          <div>
            <dt className="text-xs text-ink-subtle">{t('inFlightLabel')}</dt>
            <dd className="font-semibold text-ink">{model.inFlightAreaAcres} {t('acre')}</dd>
          </div>
        )}
        {model.verifiedAreaAcres !== null && (
          <div>
            <dt className="text-xs text-ink-subtle">{t('verifiedAreaLabel')}</dt>
            <dd className="font-semibold text-ink">{model.verifiedAreaAcres} {t('acre')}</dd>
          </div>
        )}
      </dl>

      {/* Phase 9 (E9-S9) — Overlap warnings, from their codes */}
      {model.overlapWarnings.length > 0 && (
        <div className="mt-3 rounded-control border border-warning-border bg-warning-bg p-3 text-sm" data-testid="overlap-warnings">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning-fg">
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
            {t('overlapWarningsTitle')}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-warning-fg">
            {model.overlapWarnings.map((warning, idx) => {
              const message = overlapWarningMessage(warning);
              return <li key={`${warning.code}:${idx}`}>{t(message.key, message.params)}</li>;
            })}
          </ul>
        </div>
      )}

      {/* Phase 9 (E9-S9) — Outcome-specific detail messages */}
      {(model.outcomeLabelKey === 'claimState_duplicate_area' || model.outcomeLabelKey === 'claimState_partially_verified' || model.outcomeLabelKey === 'claimState_out_of_limit') && (
        <div className="mt-3 rounded-control border border-surface-border bg-surface-muted p-3 text-sm text-ink">
          {model.outcomeLabelKey === 'claimState_duplicate_area' && t('duplicateAreaDetail')}
          {model.outcomeLabelKey === 'claimState_partially_verified' &&
            model.verifiedAreaAcres !== null && t('partiallyVerifiedDetail', { acres: model.verifiedAreaAcres })}
          {model.outcomeLabelKey === 'claimState_out_of_limit' &&
            model.remainingEligible !== null && model.claimedAreaAcres !== null &&
            t('outOfLimitDetail', { remaining: model.remainingEligible, claimed: model.claimedAreaAcres })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-surface-border pt-2 text-xs text-ink-subtle">
        {model.decidedAt && <span>{t('decidedAtLabel')}: {formatClaimDate(model.decidedAt, language)}</span>}
        {model.decidedBy && (
          <span>
            {t('decidedByLabel')}: {model.decidedBy === 'engine' ? t('engineLabel') : t('decidedByReviewer')}
          </span>
        )}
        {model.evidenceVersion && <span>{t('evidenceVersionLabel')}: {model.evidenceVersion}</span>}
        {model.engineVersion && <span>{t('engineVersionLabel')}: {model.engineVersion}</span>}
      </div>
    </div>
  );
};
