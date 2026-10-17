import { useId, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { LazyParcelDrawMap } from '../../LazyParcelDrawMap';
import { Alert, cn } from '../../ui';
import { StepShell } from './StepShell';
import {
  CLAIM_EVENT_TYPES,
  claimEventLabelKey,
  validateClaimDate,
  type EventStepNeed,
} from '../../../utils/claimFlow';
import type { GeoJsonPolygon, LossEventType, ParcelRecord } from '../../../types';

// Step 3 of 5: what happened, when, and which part of the parcel. Three fieldsets on one screen
// (they were three separate steps). Continue stays disabled until all three are answered, and an
// aria-live hint lists what is still missing.

export interface EventStepProps {
  parcel: ParcelRecord | null;
  eventType: LossEventType | null;
  eventDate: string | null;
  geometry: GeoJsonPolygon | null;
  missing: EventStepNeed[];
  /** The claim is already saved: these answers were sent on create and can no longer change. */
  locked?: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
  onSelectEvent: (eventType: LossEventType) => void;
  onSelectDate: (value: string) => void;
  onSelectArea: (geometry: GeoJsonPolygon | null) => void;
}

const chipClass = (active: boolean) =>
  cn(
    'min-h-11 rounded-control border px-3 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
    active
      ? 'border-brand-600 bg-brand-50 text-brand-900 ring-2 ring-brand-100'
      : 'border-surface-border bg-white text-ink-muted hover:border-brand-300'
  );

export const EventStep = ({
  parcel,
  eventType,
  eventDate,
  geometry,
  missing,
  locked = false,
  headingRef,
  onSelectEvent,
  onSelectDate,
  onSelectArea,
}: EventStepProps) => {
  const { t } = useTranslation();
  const ids = useId();
  const typeLegendId = `${ids}-type`;
  const dateLegendId = `${ids}-date`;
  const dateHintId = `${ids}-date-hint`;
  const maxDate = new Date().toISOString().slice(0, 10);
  const dateCheck = validateClaimDate(eventDate);

  return (
    <StepShell title={t('wizardEventTitle')} headingRef={headingRef}>
      {locked && (
        <Alert tone="info" className="mb-4">
          {t('wizardLockedNote')}
        </Alert>
      )}

      <fieldset disabled={locked} className="mb-5">
        <legend id={typeLegendId} className="mb-2 text-sm font-semibold text-ink">
          {t('selectEvent')}
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CLAIM_EVENT_TYPES.map((type) => {
            const active = eventType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onSelectEvent(type)}
                aria-pressed={active}
                className={chipClass(active)}
              >
                {t(claimEventLabelKey(type))}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset disabled={locked} className="mb-5">
        <legend id={dateLegendId} className="mb-2 text-sm font-semibold text-ink">
          {t('selectDate')}
        </legend>
        <input
          type="date"
          value={eventDate ?? ''}
          max={maxDate}
          aria-labelledby={dateLegendId}
          aria-describedby={dateHintId}
          aria-invalid={eventDate ? !dateCheck.ok : undefined}
          onChange={(event) => onSelectDate(event.target.value)}
          className="min-h-11 w-full rounded-control border border-surface-border p-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-surface-muted"
        />
        <p id={dateHintId} className="mt-2 text-xs text-ink-muted">
          {t('dateHint')}
        </p>
        {eventDate && !dateCheck.ok && (
          <p role="alert" className="mt-2 text-sm text-danger-fg">
            {dateCheck.reason === 'future' ? t('dateInvalidFuture') : t('dateInvalidWindow')}
          </p>
        )}
      </fieldset>

      <fieldset disabled={locked}>
        <legend className="mb-2 text-sm font-semibold text-ink">{t('selectArea')}</legend>
        <AffectedArea parcel={parcel} geometry={geometry} locked={locked} onSelect={onSelectArea} />
      </fieldset>

      {/* Polite live region: present from the first render so later changes are announced. */}
      <div aria-live="polite" className="mt-4">
        {missing.length > 0 && !locked && (
          <div
            data-testid="event-missing-hint"
            className="rounded-control border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-fg"
          >
            <p className="font-semibold">{t('wizardMissingTitle')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {missing.map((need) => (
                <li key={need}>{t(`wizardEventMissing_${need}`)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </StepShell>
  );
};

// ── Affected area ───────────────────────────────────────────────────────────────────────────
// The affected area is a SEPARATE geometry from the parcel boundary: the parcel footprint is
// stored on the FarmProfile, while this polygon only ever lives on the claim draft and is
// submitted as the claim's `geometry`. The backend computes `claimedAreaAcres` from it and
// the Phase 9 spatial engine decides containment/overlap — the map preview is advisory only.

const AffectedArea = ({
  parcel,
  geometry,
  locked,
  onSelect,
}: {
  parcel: ParcelRecord | null;
  geometry: GeoJsonPolygon | null;
  locked: boolean;
  onSelect: (geometry: ParcelRecord['geometry'] | null) => void;
}) => {
  const { t } = useTranslation();
  // A drawn area (restored draft, or an Edit from the review step) is shown on the map again.
  const [draftGeometry, setDraftGeometry] = useState<ParcelRecord['geometry'] | null>(() =>
    geometry && parcel && JSON.stringify(geometry) !== JSON.stringify(parcel.geometry) ? geometry : null
  );

  if (!parcel) {
    return <p className="text-sm text-ink-muted">{t('reviewReason_no_parcel')}</p>;
  }

  const wholeParcelSelected =
    geometry != null &&
    JSON.stringify(geometry) === JSON.stringify(parcel.geometry);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setDraftGeometry(null);
          onSelect(parcel.geometry);
        }}
        aria-pressed={wholeParcelSelected}
        className={cn(
          'mb-3 w-full rounded-control border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
          wholeParcelSelected
            ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100'
            : 'border-surface-border bg-white hover:border-brand-300'
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-ink">
            {t('areaEntireParcel', { acres: parcel.calculatedAreaAcres })}
          </span>
          {wholeParcelSelected && <Check aria-hidden="true" className="h-5 w-5 text-brand-700" />}
        </div>
        <p className="mt-1 text-xs text-ink-muted">{t('areaEntireParcelDesc')}</p>
      </button>

      <p className="mb-2 text-sm font-semibold text-ink">{t('areaDrawPrompt')}</p>
      <LazyParcelDrawMap
        value={draftGeometry}
        label={t('areaDrawPrompt')}
        compact
        readOnly={locked}
        contextPolygon={parcel.geometry}
        contextIsContainer
        footerNote={t('areaServerAuthority')}
        onChange={(polygon) => {
          setDraftGeometry(polygon);
          // Clearing the drawing clears the claim's affected area. Falling back to the parcel
          // boundary here would turn a partial claim into a full-parcel claim without the farmer
          // ever asking for it — the single worst outcome of this step.
          onSelect(polygon);
        }}
      />
      {geometry != null && !wholeParcelSelected && (
        <p className="mt-3 rounded-control border border-success-border bg-success-bg px-3 py-2 text-xs text-success-fg">
          {t('areaAffectedDrawn')}
        </p>
      )}
    </div>
  );
};

export default EventStep;
