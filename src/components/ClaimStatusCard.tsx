import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { ClaimState } from '../types';
import {
  claimStateLabelKey,
  formatClaimDate,
  verificationResultModel,
  type VerificationResultModel,
} from '../utils/claimFlow';
import type { VerificationDecision } from '../types';

// FROZEN display tones for the ten claim states (ADR-019 / claimState.service.js).
const STATE_TONE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-800',
  processing: 'bg-amber-100 text-amber-800',
  verified: 'bg-emerald-100 text-emerald-800',
  partially_verified: 'bg-teal-100 text-teal-800',
  more_evidence_required: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-700',
  out_of_limit: 'bg-orange-100 text-orange-800',
  duplicate_area: 'bg-purple-100 text-purple-800',
  withdrawn: 'bg-gray-200 text-gray-600',
};

export const claimStateTone = (state: string): string => STATE_TONE[state] ?? 'bg-gray-100 text-gray-700';

export interface ClaimStateBadgeProps {
  state: ClaimState;
  className?: string;
}

export const ClaimStateBadge = ({ state, className = '' }: ClaimStateBadgeProps) => {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${claimStateTone(state)} ${className}`}
    >
      {state === 'processing' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {state === 'verified' && <CheckCircle2 className="mr-1 h-3 w-3" />}
      {state === 'rejected' && <XCircle className="mr-1 h-3 w-3" />}
      {t(claimStateLabelKey(state))}
    </span>
  );
};

// ── Verification result panel ──────────────────────────────────────────────────────────
// Renders ONLY backend-declared decision fields. The outcome chip uses the shared claim-state
// vocabulary (the verification outcome IS a claim state value). Rule checks are backend engine
// reports shown as an explainable pass/fail list — never a client opinion.

export interface VerificationResultCardProps {
  verification: VerificationDecision;
  language: string;
  compact?: boolean;
}

const RULE_LABEL_KEY_PREFIX = 'claimRule_';

export const VerificationResultCard = ({
  verification,
  language,
  compact = false,
}: VerificationResultCardProps) => {
  const { t } = useTranslation();
  const model: VerificationResultModel = verificationResultModel(verification);

  const approvedTone =
    model.outcomeLabelKey === 'claimState_verified'
      ? 'bg-emerald-50 border-emerald-200'
      : model.outcomeLabelKey === 'claimState_rejected' || model.outcomeLabelKey === 'claimState_out_of_limit'
        ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-200';

  return (
    <div className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ${compact ? 'mt-3' : ''}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-800">{t('verificationResultTitle')}</h3>
        {model.outcomeLabelKey && (
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${approvedTone}`}>
            {t(model.outcomeLabelKey)}
          </span>
        )}
      </div>

      {model.reason && (
        <div className="mb-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {model.reason}
        </div>
      )}

      {/* Deterministic engine rule checks */}
      {model.ruleRows.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('rulesLabel')}
          </div>
          <ul className="space-y-1">
            {model.ruleRows.map((row) => (
              <li key={row.name} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {t(hasRuleLabel(row.labelKey) ? row.labelKey : row.name)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    row.passed ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {row.passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {row.passed ? t('rulePassed') : t('ruleFailed')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Backend area numbers — never client math */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        {model.approvedAreaAcres !== null && (
          <div>
            <dt className="text-xs text-gray-500">{t('approvedAreaLabel', { acres: model.approvedAreaAcres })}</dt>
          </div>
        )}
        <div>
          <dt className="text-xs text-gray-500">{t('claimedAreaResultLabel')}</dt>
          <dd className="font-semibold text-gray-800">
            {model.claimedAreaAcres !== null ? `${model.claimedAreaAcres} ${t('acre')}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">{t('parcelAreaResultLabel')}</dt>
          <dd className="font-semibold text-gray-800">
            {model.parcelAreaAcres !== null ? `${model.parcelAreaAcres} ${t('acre')}` : '—'}
          </dd>
        </div>
        {model.weatherCorrelation !== null && typeof model.weatherCorrelation === 'string' && (
          <div>
            <dt className="text-xs text-gray-500">{t('weatherCorrelationLabel')}</dt>
            <dd className="font-semibold text-gray-800">{model.weatherCorrelation}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-2 text-xs text-gray-500">
        {model.decidedAt && <span>{t('decidedAtLabel')}: {formatClaimDate(model.decidedAt, language)}</span>}
        {model.decidedBy && (
          <span>
            {t('decidedByLabel')}: {model.decidedBy === 'engine' ? t('engineLabel') : model.decidedBy}
          </span>
        )}
        {model.evidenceVersion && <span>{t('evidenceVersionLabel')}: {model.evidenceVersion}</span>}
        {model.engineVersion && <span>{t('engineVersionLabel')}: {model.engineVersion}</span>}
      </div>
    </div>
  );
};

function hasRuleLabel(key: string): boolean {
  // i18next returns the key unchanged when a key is missing — that is the honest fallback.
  return key.startsWith(RULE_LABEL_KEY_PREFIX);
}