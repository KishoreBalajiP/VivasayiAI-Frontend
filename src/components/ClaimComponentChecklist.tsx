import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Hourglass, Info } from 'lucide-react';
import {
  ownershipCategoryLabelKey,
  type ComponentChecklistRow,
  type ComponentNeed,
} from '../utils/claimFlow';

// ADR-020 held-claim checklist. Shown INSTEAD of a decision while the backend reports `held`:
// there is no decision, the claim is still `submitted`, and the farmer can still withdraw.
// Every sentence comes from the contract §1.3 wording; `unavailable` and `inconclusive` are never
// worded as failures, and nothing here is labelled "official" (components are not authoritative).

// Row tones map onto the semantic design tokens (success / info / warning / quiet / danger).
const TONE_CLASS: Record<ComponentChecklistRow['tone'], string> = {
  ok: 'text-success-fg',
  waiting: 'text-info-fg',
  action: 'text-warning-fg',
  neutral: 'text-quiet-fg',
  mismatch: 'text-danger-fg',
};

const ToneIcon = ({ tone }: { tone: ComponentChecklistRow['tone'] }) => {
  const className = `mt-0.5 h-4 w-4 shrink-0 ${TONE_CLASS[tone]}`;
  switch (tone) {
    case 'ok':
      return <CheckCircle2 className={className} aria-hidden />;
    case 'waiting':
      return <Clock className={className} aria-hidden />;
    case 'action':
      return <Hourglass className={className} aria-hidden />;
    case 'mismatch':
      return <AlertTriangle className={className} aria-hidden />;
    default:
      return <CircleDashed className={className} aria-hidden />;
  }
};

export const ClaimComponentChecklist = ({ rows }: { rows: ComponentChecklistRow[] }) => {
  const { t } = useTranslation();

  const needText = (need: ComponentNeed): string =>
    need.kind === 'documents'
      ? t('verifyNeedDocuments', {
          docs: need.categories.map((c) => t(ownershipCategoryLabelKey(c))).join(t('listOrJoiner')),
        })
      : t(need.key);

  const statusText = (row: ComponentChecklistRow): string => {
    if (row.outcome === 'unverified' && row.farmerAction) {
      const what = row.needs.map(needText).join('; ') || t('verifyReason_generic');
      return t('componentStatus_unverified_farmer', { what });
    }
    if (row.outcome === 'failed') {
      const what = row.needs.map(needText).join('; ') || t('verifyReason_generic');
      return t('componentStatus_failed', { what });
    }
    return t(row.statusKey);
  };

  return (
    <div
      className="rounded-card border border-info-border bg-info-bg p-4 text-sm shadow-card"
      data-testid="held-checklist"
      data-tone="info"
    >
      <h3 className="mb-1 text-sm font-bold text-info-fg">{t('verificationHeldTitle')}</h3>
      <p className="mb-3 text-info-fg">{t('verificationHeldBody')}</p>
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.name}
              className="flex items-start gap-2 rounded-control border border-white/60 bg-white px-3 py-2"
              data-outcome={row.outcome}
            >
              <ToneIcon tone={row.tone} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-semibold text-ink">{t(row.labelKey)}</span>
                  {row.blocking && (
                    <span className="rounded-full bg-warning-bg px-2 py-0.5 text-2xs font-semibold text-warning-fg">
                      {t('componentBlockingBadge')}
                    </span>
                  )}
                  {row.supportingOnly && (
                    <span className="rounded-full bg-quiet-bg px-2 py-0.5 text-2xs font-semibold text-quiet-fg">
                      {t('componentSupportingBadge')}
                    </span>
                  )}
                </div>
                <p className={`text-xs ${TONE_CLASS[row.tone]}`}>{statusText(row)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-xs text-info-fg">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {t('componentsNotOfficial')}
      </p>
    </div>
  );
};

export default ClaimComponentChecklist;
