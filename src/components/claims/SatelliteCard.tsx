import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Info, Loader2, Satellite } from 'lucide-react';
import { Badge, Card, CardBody, CardHeader, CardTitle, StatusPill } from '../ui';
import {
  formatDateTime,
  formatUtcDate,
  satelliteNoteKey,
  satelliteReasonKeys,
  satelliteStatusLabelKey,
  satelliteTone,
} from '../../utils/claimProgress';
import type { SatelliteProgress } from '../../types';

// The satellite check, told truthfully (design §7.3, owner decision D1). Satellite pictures are
// supporting information only: they never block or change a decision. So the card is never
// success-toned (it proves nothing) and never danger-toned (it can never count against the
// farmer); `passed` reads "Supports your report" in the info tone. The supporting-only note and the
// dates looked at are always shown; a post-event window that has not opened yet says "starts …"
// and has no end date.
//
// e2e selector contract: `data-testid="tracker-satellite"` with `data-satellite-status` = API value.

const MAX_DATES_SHOWN = 3;

export interface SatelliteCardProps {
  satellite: SatelliteProgress;
  language: string;
}

export const SatelliteCard = ({ satellite, language }: SatelliteCardProps) => {
  const { t } = useTranslation();
  const titleId = useId();
  const windows = satellite.observedWindows;
  const pre = windows?.preEvent ?? null;
  const post = windows?.postEvent ?? null;
  const date = (value: string | null) => formatUtcDate(value, language);

  const dateList = (dates: string[]): string => {
    if (dates.length === 0) return t('satelliteImageryNone');
    const shown = dates.slice(0, MAX_DATES_SHOWN).map(date).join(', ');
    const more = dates.length - MAX_DATES_SHOWN;
    return more > 0 ? `${shown} ${t('satelliteImageryMore', { count: more })}` : shown;
  };

  const postWindowText = (): string | null => {
    if (!post) return null;
    if (!post.open) return t('satelliteWindowAfterStarts', { start: date(post.start) });
    if (!post.complete || !post.end) return t('satelliteWindowAfterCollecting', { start: date(post.start) });
    return t('satelliteWindowAfter', { start: date(post.start), end: date(post.end) });
  };

  const tone = satelliteTone(satellite.status);
  const imagery = satellite.imageryDates;
  const hasImagery = Boolean(imagery && (imagery.preEvent.length > 0 || imagery.postEvent.length > 0));

  return (
    <Card titleId={titleId} data-testid="tracker-satellite" data-satellite-status={satellite.status}>
      <CardHeader>
        <CardTitle id={titleId} className="flex items-center gap-2">
          <Satellite aria-hidden="true" className="h-4 w-4 text-ink-subtle" />
          {t('satelliteTitle')}
        </CardTitle>
        <Badge tone="quiet" icon={Info}>
          {t('satelliteSupportingBadge')}
        </Badge>
      </CardHeader>
      <CardBody className="space-y-3 text-sm">
        <div className="space-y-1">
          <StatusPill
            tone={tone}
            icon={satellite.status === 'processing' ? Loader2 : satellite.status === 'pending' ? Clock : undefined}
            data-testid="tracker-satellite-status"
          >
            {t(satelliteStatusLabelKey(satellite.status))}
          </StatusPill>
          <p className="text-ink-muted">{t(satelliteReasonKeys(satellite))}</p>
          {satellite.noteCode && <p className="text-xs text-ink-subtle">{t(satelliteNoteKey(satellite.noteCode))}</p>}
        </div>

        {(pre || post) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('satelliteWindowsTitle')}</p>
            <ul className="mt-1 space-y-0.5 text-ink-muted" data-testid="tracker-satellite-windows">
              {pre && (
                <li>
                  {pre.end
                    ? t('satelliteWindowBefore', { start: date(pre.start), end: date(pre.end) })
                    : t('satelliteWindowBeforeFrom', { start: date(pre.start) })}
                </li>
              )}
              {post && <li data-post-open={post.open ? 'true' : 'false'}>{postWindowText()}</li>}
            </ul>
          </div>
        )}

        {hasImagery && imagery && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('satelliteImageryTitle')}</p>
            <ul className="mt-1 space-y-0.5 text-ink-muted">
              <li>{t('satelliteImageryBefore', { dates: dateList(imagery.preEvent) })}</li>
              <li>{t('satelliteImageryAfter', { dates: dateList(imagery.postEvent) })}</li>
            </ul>
          </div>
        )}

        {satellite.nextCheckAt && (
          <p className="text-ink-muted" data-testid="tracker-satellite-next-check">
            {t('trackerNextCheck', { time: formatDateTime(satellite.nextCheckAt, language) })}
          </p>
        )}

        <p className="flex items-start gap-1.5 rounded-control bg-surface-muted px-3 py-2 text-xs text-ink-muted">
          <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('satelliteSupportingNote')}
        </p>
      </CardBody>
    </Card>
  );
};

export default SatelliteCard;
