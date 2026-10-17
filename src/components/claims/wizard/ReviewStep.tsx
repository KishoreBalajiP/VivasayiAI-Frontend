import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Pencil } from 'lucide-react';
import { Alert, cn } from '../../ui';
import { StepShell } from './StepShell';
import {
  claimEventLabelKey,
  claimantRelationshipLabelKey,
  formatClaimDate,
  ownershipCategoryLabelKey,
  type ClaimReviewSummary,
  type ClaimWizardStep,
} from '../../../utils/claimFlow';

// Step 5 of 5: everything the farmer entered, each section with an Edit link back to its step
// (limited to steps already reached). Once the claim is saved on the server, the fields that were
// sent on create can no longer be edited, so their Edit links are hidden and a note says why.

export interface ReviewStepProps {
  summary: ClaimReviewSummary;
  language: string;
  /** The claim is already saved: parcel, relationship and event can no longer change. */
  locked: boolean;
  canEdit: (step: ClaimWizardStep) => boolean;
  onEdit: (step: ClaimWizardStep) => void;
  previewUrlFor: (key: string) => string | undefined;
  headingRef?: Ref<HTMLHeadingElement>;
}

const Section = ({
  title,
  editStep,
  editLabel,
  canEdit,
  onEdit,
  children,
  testId,
}: {
  title: string;
  editStep: ClaimWizardStep;
  editLabel: string;
  canEdit: boolean;
  onEdit: (step: ClaimWizardStep) => void;
  children: ReactNode;
  testId: string;
}) => {
  const { t } = useTranslation();
  return (
    <section data-testid={testId} className="border-b border-surface-border py-3 first:pt-0 last:border-b-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</h4>
        {canEdit && (
          <button
            type="button"
            onClick={() => onEdit(editStep)}
            aria-label={editLabel}
            className="inline-flex min-h-9 items-center gap-1 rounded-control px-2 text-xs font-semibold text-brand-700 underline-offset-2 hover:underline"
          >
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
            {t('wizardEdit')}
          </button>
        )}
      </div>
      {children}
    </section>
  );
};

const Row = ({ label, value, muted = false }: { label: string; value: ReactNode; muted?: boolean }) => (
  <div className="flex justify-between gap-3 text-sm">
    <dt className="text-ink-muted">{label}</dt>
    <dd className={cn('text-right', muted ? 'text-ink-muted' : 'font-semibold text-ink')}>{value}</dd>
  </div>
);

export const ReviewStep = ({ summary, language, locked, canEdit, onEdit, previewUrlFor, headingRef }: ReviewStepProps) => {
  const { t } = useTranslation();
  const editable = (step: ClaimWizardStep) => !locked && canEdit(step);
  const editLabel = (section: string) => t('wizardEditSection', { section });

  return (
    <StepShell title={t('reviewTitle')} headingRef={headingRef}>
      {locked && (
        <Alert tone="info" className="mb-3">
          {t('wizardLockedNote')}
        </Alert>
      )}

      <Section
        testId="review-parcel"
        title={t('reviewParcel')}
        editStep="parcel"
        editLabel={editLabel(t('reviewParcel'))}
        canEdit={editable('parcel')}
        onEdit={onEdit}
      >
        <dl className="space-y-1">
          <Row label={t('wizardReviewParcelName')} value={summary.parcelName ?? t('parcelNameLabel')} />
          {summary.crop && <Row label={t('parcelCropLabel')} value={summary.crop} />}
          {/* Whole-parcel total is reference context only — it is NEVER the claimed area unless
              the farmer explicitly chose the entire parcel. */}
          {summary.parcelAreaAcres !== null && (
            <Row
              label={t('reviewParcelTotal')}
              value={t('parcelAreaAcresLabel', { acres: summary.parcelAreaAcres })}
              muted
            />
          )}
        </dl>
      </Section>

      <Section
        testId="review-relationship"
        title={t('claimantRelationshipLabel')}
        editStep="relationship"
        editLabel={editLabel(t('claimantRelationshipLabel'))}
        canEdit={editable('relationship')}
        onEdit={onEdit}
      >
        <p className="text-sm font-semibold text-ink">
          {summary.relationship ? t(claimantRelationshipLabelKey(summary.relationship)) : t('relationshipNotGiven')}
        </p>
      </Section>

      <Section
        testId="review-event"
        title={t('stepEvent')}
        editStep="event"
        editLabel={editLabel(t('stepEvent'))}
        canEdit={editable('event')}
        onEdit={onEdit}
      >
        <dl className="space-y-1">
          <Row label={t('reviewEvent')} value={summary.eventType ? t(claimEventLabelKey(summary.eventType)) : '—'} />
          <Row label={t('reviewDate')} value={summary.eventDate ? formatClaimDate(summary.eventDate, language) : '—'} />
          <Row
            label={t('reviewArea')}
            value={
              summary.claimedAreaAcres !== null
                ? t('parcelAreaAcresLabel', { acres: summary.claimedAreaAcres })
                : '—'
            }
          />
        </dl>
        {summary.claimedAreaAcres !== null && (
          <p className="mt-1 text-xs text-ink-muted">
            {summary.affectedIsWholeParcel ? t('reviewAreaWholeParcel') : t('reviewAreaPartial')}
          </p>
        )}
      </Section>

      <Section
        testId="review-photos"
        title={t('reviewEvidence')}
        editStep="evidence"
        editLabel={editLabel(t('reviewEvidence'))}
        canEdit={canEdit('evidence')}
        onEdit={onEdit}
      >
        <p className="text-sm font-semibold text-ink">{t('wizardReviewPhotoCount', { count: summary.photos.length })}</p>
        {summary.photos.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {summary.photos.map((photo) => {
              const preview = previewUrlFor(photo.key);
              return (
                <li key={photo.key} className="flex max-w-full items-center gap-2 rounded-control border border-surface-border px-2 py-1 text-xs text-ink-muted">
                  {preview && <img src={preview} alt="" className="h-8 w-8 rounded object-cover" />}
                  <span className="truncate">{photo.name}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        testId="review-documents"
        title={t('ownershipTitle')}
        editStep="evidence"
        editLabel={editLabel(t('ownershipTitle'))}
        canEdit={canEdit('evidence')}
        onEdit={onEdit}
      >
        {summary.documents.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('wizardReviewNoDocuments')}</p>
        ) : (
          <ul className="space-y-1">
            {summary.documents.map((doc) => (
              <li key={doc.key} className="flex justify-between gap-3 text-sm">
                <span className="truncate text-ink-muted">{doc.name}</span>
                <span className="text-right font-semibold text-ink">{t(ownershipCategoryLabelKey(doc.category))}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div
        data-testid="review-state"
        className={cn(
          'mt-3 rounded-control border px-3 py-2 text-sm font-medium',
          summary.ok ? 'border-success-border bg-success-bg text-success-fg' : 'border-danger-border bg-danger-bg text-danger-fg'
        )}
      >
        {summary.ok ? t('reviewReady') : t(`reviewReason_${summary.reason}`)}
      </div>

      <div className="mt-3 space-y-1.5 rounded-control border border-info-border bg-info-bg px-3 py-2 text-xs text-info-fg">
        <p className="flex gap-2">
          <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t('wizardReviewChecksNote')}</span>
        </p>
        <p className="pl-5">{t('wizardReviewAiNote')}</p>
      </div>
    </StepShell>
  );
};

export default ReviewStep;
