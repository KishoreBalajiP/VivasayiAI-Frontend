import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, RefreshCw, WifiOff } from 'lucide-react';
import { Alert, Button, Card, CardBody, StatusPill } from '../ui';
import {
  formatDateTime,
  formatRelativeTime,
  overallBodyKey,
  overallLabelKey,
  overallTone,
} from '../../utils/claimProgress';
import { formatClaimDate } from '../../utils/claimFlow';
import type { ProgressReadError } from '../../hooks/useClaimProgress';
import type { ClaimProgress, LossClaim } from '../../types';

// The top of the claim tracker (design §7.1): overall status, reference, event, submitted date,
// when the backend last recorded something ("Last update", server time) and when this page last
// heard from it ("Checked", client time), a Refresh button, and the offline / refresh-error banner.
// A failed refresh never clears the screen: the last progress stays visible under the banner.

export interface TrackerHeaderProps {
  claimId: string;
  claim: LossClaim | null;
  progress: ClaimProgress | null;
  language: string;
  fetchedAt: number | null;
  stale: boolean;
  refreshing: boolean;
  offline: boolean;
  error: ProgressReadError | null;
  onRefresh: () => void;
}

// Relative times ("2 minutes ago") are re-rendered every 30 s so they do not freeze while polling
// is slow or stopped. Display only; it never triggers a read.
const CLOCK_TICK_MS = 30_000;

const useNow = (): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
};

export const TrackerHeader = ({
  claimId,
  claim,
  progress,
  language,
  fetchedAt,
  stale,
  refreshing,
  offline,
  error,
  onRefresh,
}: TrackerHeaderProps) => {
  const { t } = useTranslation();
  const tick = useNow();
  // Never show "in 3 seconds" because the client clock is behind the server's.
  const now = Math.max(tick, fetchedAt ?? 0, Date.now());
  const reference = claimId.slice(-8).toUpperCase();
  const status = progress?.overallStatus ?? null;
  const submittedAt = progress?.submittedAt ?? claim?.submittedAt ?? null;
  const lastUpdatedAt = progress?.lastUpdatedAt ?? null;

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      toast.success(t('trackerReferenceCopied'), { duration: 2000 });
    } catch {
      // Clipboard blocked: the reference is on screen to copy by hand.
    }
  };

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            {progress && status ? (
              <StatusPill tone={overallTone(progress)} className="text-sm">
                {t(overallLabelKey(status))}
              </StatusPill>
            ) : (
              <span aria-hidden="true" className="inline-block h-6 w-40 animate-pulse rounded-full bg-surface-sunken" />
            )}
            {status && <p className="text-sm text-ink-muted">{t(overallBodyKey(status))}</p>}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            loading={refreshing}
            leadingIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            {refreshing ? t('trackerRefreshing') : t('trackerRefresh')}
          </Button>
        </div>

        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex min-w-0 items-center gap-2">
            <dt className="text-ink-muted">{t('claimReference')}</dt>
            <dd className="flex min-w-0 items-center gap-1 font-mono font-semibold text-ink">
              <span>{reference}</span>
              <button
                type="button"
                onClick={() => void copyReference()}
                aria-label={t('trackerCopyReference', { ref: reference })}
                className="inline-flex h-8 w-8 items-center justify-center rounded-control text-ink-subtle hover:bg-surface-sunken hover:text-ink"
              >
                <Copy aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-ink-muted">
          <p>
            {submittedAt ? t('trackerSubmittedOn', { date: formatClaimDate(submittedAt, language) }) : t('trackerNotSubmitted')}
          </p>
          <p>
            <time
              data-testid="tracker-last-updated"
              data-last-updated={lastUpdatedAt ?? ''}
              dateTime={lastUpdatedAt ?? undefined}
              title={lastUpdatedAt ? formatDateTime(lastUpdatedAt, language) : undefined}
            >
              {lastUpdatedAt
                ? t('trackerLastUpdated', { time: formatRelativeTime(lastUpdatedAt, now, language) })
                : t('trackerLastUpdatedNone')}
            </time>
            {fetchedAt !== null && (
              <span className="ml-2 text-xs text-ink-subtle">
                {t('trackerChecked', { time: formatRelativeTime(fetchedAt, now, language) })}
              </span>
            )}
          </p>
        </div>

        {stale && !offline && <p className="text-xs text-ink-subtle">{t('trackerStale')}</p>}

        {offline ? (
          <Alert tone="warning" icon={WifiOff} title={t('trackerOfflineTitle')}>
            {t('trackerOfflineBody')}
          </Alert>
        ) : (
          error &&
          error.status !== 404 &&
          progress && (
            <Alert tone="warning" data-testid="tracker-refresh-error" title={t('trackerRefreshErrorTitle')}>
              {error.status === 429 ? t('trackerRateLimitedBody') : t('trackerRefreshErrorBody')}
            </Alert>
          )
        )}
      </CardBody>
    </Card>
  );
};

export default TrackerHeader;
