import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, FileText, MessageSquareWarning, Undo2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, CardTitle } from '../ui';

// "N photos · M land documents" plus quick links to the sections further down the page (design
// §7.1). The links move focus with scrollIntoView rather than anchors, because the URL hash is the
// router. Withdraw lives here too and always goes through a confirmation dialog.

export interface EvidenceSummaryProps {
  photoCount: number;
  /** null while the land documents are still loading. */
  documentCount: number | null;
  onPhotos: () => void;
  onDocuments: () => void;
  /** Present only when the claim's decision may be appealed. */
  onAppeal?: () => void;
  /** Present only while the state machine allows a withdrawal. */
  onWithdraw?: () => void;
  withdrawing?: boolean;
}

export const EvidenceSummary = ({
  photoCount,
  documentCount,
  onPhotos,
  onDocuments,
  onAppeal,
  onWithdraw,
  withdrawing = false,
}: EvidenceSummaryProps) => {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <Card titleId={titleId} data-testid="tracker-evidence-summary">
      <CardHeader>
        <CardTitle id={titleId}>{t('evidenceSummaryTitle')}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3 text-sm">
        <p className="text-ink-muted" data-testid="tracker-evidence-counts">
          {t('evidenceSummaryPhotos', { count: photoCount })}
          {' · '}
          {documentCount === null
            ? t('evidenceSummaryDocumentsLoading')
            : t('evidenceSummaryDocuments', { count: documentCount })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onPhotos} leadingIcon={<Camera className="h-3.5 w-3.5" />}>
            {t('evidenceLinkPhotos')}
          </Button>
          <Button size="sm" variant="secondary" onClick={onDocuments} leadingIcon={<FileText className="h-3.5 w-3.5" />}>
            {t('evidenceLinkDocuments')}
          </Button>
          {onAppeal && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onAppeal}
              leadingIcon={<MessageSquareWarning className="h-3.5 w-3.5" />}
            >
              {t('evidenceLinkAppeal')}
            </Button>
          )}
          {onWithdraw && (
            <Button
              size="sm"
              variant="dangerOutline"
              onClick={onWithdraw}
              loading={withdrawing}
              leadingIcon={<Undo2 className="h-3.5 w-3.5" />}
            >
              {t('withdrawClaim')}
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
};

export default EvidenceSummary;
