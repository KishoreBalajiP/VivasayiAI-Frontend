import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, RefreshCw } from 'lucide-react';
import { ApiClientError } from '../api/client';
import { getVerificationDiagnostics } from '../api/admin';
import { formatDateTime, overallLabelKey, parseClaimProgress } from '../utils/claimProgress';
import { Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle, SkeletonText } from './ui';
import type {
  AdminDiagnosticsEvidence,
  AdminDiagnosticsJob,
  AdminVerificationDiagnostics as DiagnosticsData,
} from '../types';

// Reviewer-side verification diagnostics (owner decision D9, plan B7). READ-ONLY: it shows what the
// farmer view deliberately hides (each job's step, status, attempts, last error code and kind and
// timestamps; review cases; evidence rows; the audit trail) next to what the farmer is told. It
// has no buttons that change anything; the only mutation in the admin claim view is the override.

const JOB_TIMES = ['runAt', 'startedAt', 'completedAt', 'deadAt', 'cancelledAt'] as const;

type Load = 'loading' | 'ready' | 'error';

const evidenceSummary = (rows: AdminDiagnosticsEvidence[]) => {
  const bySource = new Map<string, { statuses: Map<string, number>; latest: string | null }>();
  for (const row of rows) {
    if (row.kind === 'review_case') continue;
    const entry = bySource.get(row.source) ?? { statuses: new Map<string, number>(), latest: null };
    entry.statuses.set(row.status, (entry.statuses.get(row.status) ?? 0) + 1);
    if (row.createdAt && (!entry.latest || Date.parse(row.createdAt) > Date.parse(entry.latest))) entry.latest = row.createdAt;
    bySource.set(row.source, entry);
  }
  return Array.from(bySource.entries()).map(([source, entry]) => ({
    source,
    statuses: Array.from(entry.statuses.entries()).map(([status, count]) => `${status} ×${count}`).join(', '),
    latest: entry.latest,
  }));
};

export const AdminVerificationDiagnostics = ({ claimId, language }: { claimId: string; language: string }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [status, setStatus] = useState<Load>('loading');

  const load = useCallback(async (isActive: () => boolean = () => true) => {
    setStatus('loading');
    try {
      const diagnostics = await getVerificationDiagnostics(claimId);
      if (!isActive()) return;
      setData(diagnostics);
      setStatus('ready');
    } catch (err) {
      if (!isActive()) return;
      if (err instanceof ApiClientError && err.status === 401) return;
      setStatus('error');
    }
  }, [claimId]);

  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  const farmerProgress = useMemo(() => (data ? parseClaimProgress(data.progress) : null), [data]);
  const evidence = useMemo(() => evidenceSummary(data?.evidence ?? []), [data]);
  const time = (value: string | null | undefined) => (value ? formatDateTime(value, language) : '—');

  const jobTimes = (job: AdminDiagnosticsJob) =>
    JOB_TIMES.filter((field) => job[field]).map((field) => (
      <span key={field} className="block whitespace-nowrap">
        {t(`adminDiagTime_${field}`)}: {time(job[field])}
      </span>
    ));

  return (
    <Card titleId={titleId} data-testid="admin-verification-diagnostics">
      <CardHeader>
        <CardTitle id={titleId}>{t('adminDiagTitle')}</CardTitle>
        <Badge tone="quiet" icon={Lock}>
          {t('adminDiagReadOnly')}
        </Badge>
      </CardHeader>
      <CardBody className="space-y-4 text-sm">
        {status === 'loading' && (
          <div aria-busy="true">
            <span className="sr-only">{t('adminLoading')}</span>
            <SkeletonText lines={3} />
          </div>
        )}
        {status === 'error' && (
          <Alert
            tone="danger"
            title={t('adminDiagLoadFailed')}
            actions={
              <Button size="sm" variant="secondary" onClick={() => void load()} leadingIcon={<RefreshCw className="h-3.5 w-3.5" />}>
                {t('retry')}
              </Button>
            }
          />
        )}
        {status === 'ready' && data && (
          <>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              <span>{t('adminDiagRound', { round: data.submissionRound })}</span>
              {data.policy?.configured?.id && <span>{t('adminDiagPolicy', { policy: data.policy.configured.id })}</span>}
              {farmerProgress && (
                <span data-testid="diag-farmer-status">
                  {t('adminDiagFarmerSees', { status: t(overallLabelKey(farmerProgress.overallStatus)) })}
                </span>
              )}
            </p>

            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('adminDiagJobs')}</h4>
              {data.jobs.length === 0 ? (
                <p className="text-ink-muted">{t('adminDiagNoJobs')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-surface-border text-ink-subtle">
                        <th className="px-2 py-1.5">{t('adminDiagColStep')}</th>
                        <th className="px-2 py-1.5">{t('adminDiagColStatus')}</th>
                        <th className="px-2 py-1.5">{t('adminDiagColAttempts')}</th>
                        <th className="px-2 py-1.5">{t('adminDiagColLastError')}</th>
                        <th className="px-2 py-1.5">{t('adminDiagColTimes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.jobs.map((job) => (
                        <tr
                          key={job.id}
                          data-testid="diag-job"
                          data-step={job.step}
                          data-status={job.status}
                          className="border-b border-surface-border align-top last:border-0"
                        >
                          <td className="px-2 py-1.5 font-mono text-ink">{job.step}</td>
                          <td className="px-2 py-1.5 font-mono">{job.status}</td>
                          <td className="px-2 py-1.5">
                            {t('adminDiagAttempts', { attempts: job.attempts, max: job.maxAttempts ?? '—' })}
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {job.lastError ? `${job.lastError.code ?? '—'} · ${job.lastError.kind ?? '—'}` : t('adminDiagNoError')}
                          </td>
                          <td className="px-2 py-1.5 text-ink-muted">{jobTimes(job)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('adminDiagReviewCases')}</h4>
              {data.reviewCases.length === 0 ? (
                <p className="text-ink-muted">{t('adminDiagNoReviewCases')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.reviewCases.map((row) => (
                    <li key={row.id} data-testid="diag-review-case" className="rounded-control bg-surface-muted px-3 py-2 text-xs">
                      <span className="font-mono font-semibold text-ink">{row.status}</span>
                      {' · '}
                      <span className="font-mono">{row.source}</span>
                      {row.reasons.length > 0 && <> · {row.reasons.join(', ')}</>}
                      {(row.failedStep || row.errorCode || row.errorKind) && (
                        <span className="font-mono">
                          {' · '}
                          {[row.failedStep, row.errorCode, row.errorKind].filter(Boolean).join(' / ')}
                        </span>
                      )}
                      <span className="text-ink-subtle"> · {time(row.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('adminDiagEvidence')}</h4>
              {evidence.length === 0 ? (
                <p className="text-ink-muted">{t('adminDiagNoEvidence')}</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {evidence.map((row) => (
                    <li key={row.source} data-testid="diag-evidence" className="flex flex-wrap gap-x-2">
                      <span className="font-mono font-semibold text-ink">{row.source}</span>
                      <span className="font-mono">{row.statuses}</span>
                      <span className="text-ink-subtle">{time(row.latest)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('adminDiagAudit')}</h4>
              {data.audit.length === 0 ? (
                <p className="text-ink-muted">{t('adminDiagNoAudit')}</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.audit.map((row, index) => (
                    <li key={`${row.createdAt}:${index}`} data-testid="diag-audit" className="flex flex-wrap gap-x-2">
                      <span className="text-ink-subtle">{time(row.createdAt)}</span>
                      <span className="font-semibold text-ink">{row.actor}</span>
                      <span className="font-mono">{row.action}</span>
                      <span className="font-mono">
                        {row.fromState} → {row.toState}
                      </span>
                      {row.reason && <span className="text-ink-muted">· {row.reason}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </CardBody>
    </Card>
  );
};

export default AdminVerificationDiagnostics;
