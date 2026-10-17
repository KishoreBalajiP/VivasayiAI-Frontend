import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MessageSquareWarning } from 'lucide-react';
import { Button, SkeletonText } from './ui';
import { ApiClientError, friendlyMessageKey } from '../api/client';
import { getAppeal, submitAppeal } from '../api/claims';
import { APPEAL_REASON_MAX, APPEAL_REASON_MIN, formatClaimDate } from '../utils/claimFlow';
import type { Appeal } from '../types';

// Farmer appeal on an eligible engine decision (POST/GET /claims/:claimId/appeal; eligible states
// are rejected, out_of_limit, duplicate_area and more_evidence_required — the caller only mounts
// this panel for those). The backend is idempotent: an active appeal is returned as-is, and the
// panel always shows the backend's appeal status rather than assuming one.

interface ClaimAppealPanelProps {
  claimId: string;
  language: string;
}

export const ClaimAppealPanel = ({ claimId, language }: ClaimAppealPanelProps) => {
  const { t } = useTranslation();
  const [appeal, setAppeal] = useState<Appeal | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setAppeal(await getAppeal(claimId));
      setStatus('ready');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return;
      setStatus('error');
    }
  }, [claimId]);

  useEffect(() => {
    void load();
  }, [load]);

  const trimmed = reason.trim();
  const reasonValid = trimmed.length >= APPEAL_REASON_MIN && trimmed.length <= APPEAL_REASON_MAX;

  const handleSubmit = async () => {
    if (!reasonValid || submitting) return;
    setSubmitting(true);
    try {
      const created = await submitAppeal(claimId, { reason: trimmed });
      setAppeal(created);
      setFormOpen(false);
      setReason('');
      toast.success(t('appealSubmittedToast'), { duration: 3000 });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return;
      const code = err instanceof ApiClientError ? err.status : 0;
      // 409 = the claim's state is no longer appealable (appeal.service.js).
      toast.error(t(code === 409 ? 'appealNotEligible' : friendlyMessageKey(code)), { duration: 4000 });
    } finally {
      setSubmitting(false);
    }
  };

  // While the appeal loads the panel keeps its place (no jump) and says it is busy.
  if (status === 'loading') {
    return (
      <section
        className="rounded-card border border-surface-border bg-white p-4 shadow-card"
        aria-busy="true"
        aria-label={t('appealLoading')}
        data-testid="appeal-loading"
      >
        <SkeletonText lines={2} />
      </section>
    );
  }

  return (
    <section className="rounded-card border border-surface-border bg-white p-4 shadow-card" aria-labelledby="appeal-title">
      <div className="mb-2 flex items-center gap-2">
        <MessageSquareWarning className="h-4 w-4 text-emerald-700" aria-hidden />
        <h3 id="appeal-title" className="text-sm font-bold text-gray-800">
          {t('appealTitle')}
        </h3>
      </div>

      {status === 'error' && (
        <div className="flex items-center gap-3 text-xs text-amber-900">
          <span>{t('appealLoadFailed')}</span>
          <button onClick={() => void load()} className="rounded-full border border-amber-400 px-2.5 py-0.5 font-semibold hover:bg-amber-100">
            {t('retry')}
          </button>
        </div>
      )}

      {status === 'ready' && appeal && (
        <div className="space-y-1 text-sm text-gray-700">
          <p>
            <span className="font-semibold">{t('appealStatusLabel')}: </span>
            {t(`appealStatus_${appeal.status}`)}
          </p>
          <p className="text-xs text-gray-500">
            {t('appealSentOn', { date: formatClaimDate(appeal.createdAt, language) })}
          </p>
          <p className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-700">{appeal.reason}</p>
        </div>
      )}

      {status === 'ready' && !appeal && !formOpen && (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">{t('appealIntro')}</p>
          <Button variant="secondary" onClick={() => setFormOpen(true)}>
            {t('appealAction')}
          </Button>
        </div>
      )}

      {status === 'ready' && !appeal && formOpen && (
        <div className="space-y-2">
          <label className="block text-xs text-gray-600">
            <span className="mb-1 block font-semibold">{t('appealReasonLabel')}</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={APPEAL_REASON_MAX}
              rows={4}
              placeholder={t('appealReasonPlaceholder')}
              className="w-full rounded-xl border border-gray-200 p-2 text-sm outline-none focus:border-emerald-400"
            />
          </label>
          {trimmed.length > 0 && trimmed.length < APPEAL_REASON_MIN && (
            <p className="text-xs text-amber-800">{t('appealReasonTooShort', { min: APPEAL_REASON_MIN })}</p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void handleSubmit()} disabled={!reasonValid} loading={submitting}>
              {t('appealSubmit')}
            </Button>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={submitting}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};

export default ClaimAppealPanel;
