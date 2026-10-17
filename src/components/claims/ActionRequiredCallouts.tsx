import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, FileText, Send, Undo2 } from 'lucide-react';
import { Alert, Badge, Button } from '../ui';
import { actionBodyKeys, actionTitleKeys } from '../../utils/claimProgress';
import { ownershipCategoryLabelKey } from '../../utils/claimFlow';
import type { ProgressAction } from '../../types';

// What the farmer can do now, straight from progress.actionRequired (design §7.1). Each callout
// says whether it is required or only recommended (the policy decides; e.g. land documents are
// optional under v1.1). The buttons only move focus or open a confirmation: nothing here decides.
//
// e2e selector contract: each callout is `data-testid="claim-action"` with `data-action-code`.

export interface ActionRequiredCalloutsProps {
  actions: ProgressAction[];
  onSubmit: () => void;
  submitting: boolean;
  /** Translated reason the last submit failed; shown inline next to the submit action. */
  submitError: string | null;
  onAddPhotos: () => void;
  onAddDocuments: () => void;
  onResubmit: () => void;
  resubmitting: boolean;
}

export const ActionRequiredCallouts = ({
  actions,
  onSubmit,
  submitting,
  submitError,
  onAddPhotos,
  onAddDocuments,
  onResubmit,
  resubmitting,
}: ActionRequiredCalloutsProps) => {
  const { t } = useTranslation();
  const titleId = useId();
  if (actions.length === 0) return null;

  const documentGroups = (action: ProgressAction) => {
    const groups = action.params.categoryGroups ?? [];
    if (groups.length === 0) return [t('actionAnyLandDocument')];
    return groups.map((group) =>
      t('actionDocumentGroup', { docs: group.map((category) => t(ownershipCategoryLabelKey(category))).join(t('listOrJoiner')) })
    );
  };

  const button = (action: ProgressAction) => {
    switch (action.code) {
      case 'submit_claim':
        return (
          <Button size="sm" onClick={onSubmit} loading={submitting} leadingIcon={<Send className="h-3.5 w-3.5" />}>
            {t('submitClaim')}
          </Button>
        );
      case 'add_photos':
        return (
          <Button size="sm" variant="secondary" onClick={onAddPhotos} leadingIcon={<Camera className="h-3.5 w-3.5" />}>
            {t('actionButton_add_photos')}
          </Button>
        );
      case 'upload_land_documents':
        return (
          <Button size="sm" variant="secondary" onClick={onAddDocuments} leadingIcon={<FileText className="h-3.5 w-3.5" />}>
            {t('actionButton_upload_land_documents')}
          </Button>
        );
      case 'resubmit_with_evidence':
        return (
          <Button size="sm" onClick={onResubmit} loading={resubmitting} leadingIcon={<Undo2 className="h-3.5 w-3.5" />}>
            {t('resubmitClaim')}
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <section aria-labelledby={titleId} className="mb-3 space-y-2">
      <h3 id={titleId} className="text-sm font-semibold text-ink">
        {t('trackerActionsTitle')}
      </h3>
      {actions.map((action, index) => (
        <div key={`${action.code}:${index}`} data-testid="claim-action" data-action-code={action.code}>
          <Alert
            tone={action.required ? 'warning' : 'info'}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {t(actionTitleKeys(action))}
                <Badge tone={action.required ? 'warning' : 'quiet'} icon={null}>
                  {action.required ? t('actionRequiredBadge') : t('actionRecommendedBadge')}
                </Badge>
              </span>
            }
            actions={button(action)}
          >
            <p>{t(actionBodyKeys(action))}</p>
            {action.code === 'upload_land_documents' && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="claim-action-document-groups">
                {documentGroups(action).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </Alert>
          {action.code === 'submit_claim' && submitError && (
            <Alert tone="danger" className="mt-2" title={t('actionSubmitFailedTitle')} focusOnMount>
              {submitError}
            </Alert>
          )}
        </div>
      ))}
    </section>
  );
};

export default ActionRequiredCallouts;
