import { useId, useRef, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, CheckCircle2, Circle, FileText, ImageIcon, Loader2, RotateCcw, Upload, X } from 'lucide-react';
import { OWNERSHIP_DOCUMENT_ACCEPT } from '../../../api/claims';
import { Badge, Button, cn } from '../../ui';
import { StepShell } from './StepShell';
import {
  CLAIM_DOCUMENT_MAX,
  CLAIM_EVIDENCE_MAX,
  MIN_PHOTOS_TO_SUBMIT,
  OWNERSHIP_DOCUMENT_CATEGORIES,
  claimantRelationshipLabelKey,
  documentGroupStatus,
  ownershipCategoryLabelKey,
  type EvidenceStepNeed,
  type StagedDocument,
  type StagedEvidence,
} from '../../../utils/claimFlow';
import type { ClaimantRelationship, OwnershipDocumentCategory } from '../../../types';

// Step 4 of 5: crop photos (required, MIN_PHOTOS_TO_SUBMIT..CLAIM_EVIDENCE_MAX) and land documents
// (recommended, up to CLAIM_DOCUMENT_MAX, images only). Nothing is uploaded here: files are staged
// and the submission sends them after the claim is created. After a failed submission each item
// shows its own status, and a failed item can be retried on its own.

/** An inline message, translated at render time so a language switch re-words it. */
export interface InlineMessage {
  key: string;
  name?: string;
  reasonKey?: string;
  max?: number;
}

export interface EvidenceStepProps {
  evidence: StagedEvidence[];
  documents: StagedDocument[];
  relationship: ClaimantRelationship | null;
  /** The claim exists on the server, so a failed item can be retried on its own. */
  claimSaved: boolean;
  /** A submission or a single-item retry is running. */
  busy: boolean;
  missing: EvidenceStepNeed[];
  photoMessages: InlineMessage[];
  documentMessages: InlineMessage[];
  previewUrlFor: (key: string) => string | undefined;
  headingRef?: Ref<HTMLHeadingElement>;
  onAddPhotos: (files: File[]) => void;
  onRemovePhoto: (key: string) => void;
  onRetryPhoto: (key: string) => void;
  onReplacePhoto: (key: string, file: File) => void;
  onAddDocuments: (files: File[]) => void;
  onRemoveDocument: (key: string) => void;
  onRetryDocument: (key: string) => void;
  onReplaceDocument: (key: string, file: File) => void;
  onDocumentCategory: (key: string, category: OwnershipDocumentCategory) => void;
}

const formatSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const fileMeta = (detectedType: string | null, size: number): string =>
  detectedType ? `${detectedType.toUpperCase()} · ${formatSize(size)}` : formatSize(size);

const statusTone = (status: string): string => {
  switch (status) {
    case 'failed':
      return 'text-danger-fg';
    case 'missing_file':
      return 'text-warning-fg';
    case 'uploaded':
    case 'attached':
      return 'text-success-fg';
    default:
      return 'text-ink-muted';
  }
};

const Messages = ({ messages, testId }: { messages: InlineMessage[]; testId: string }) => {
  const { t } = useTranslation();
  // The live region is always in the DOM, so a message added later is announced.
  return (
    <div aria-live="polite" data-testid={testId} className={cn(messages.length > 0 && 'mt-2')}>
      {messages.length > 0 && (
        <ul className="space-y-1 rounded-control border border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger-fg">
          {messages.map((message, index) => (
            <li key={`${message.key}-${index}`}>
              {t(message.key, {
                name: message.name,
                max: message.max,
                reason: message.reasonKey ? t(message.reasonKey) : '',
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const EvidenceStep = ({
  evidence,
  documents,
  relationship,
  claimSaved,
  busy,
  missing,
  photoMessages,
  documentMessages,
  previewUrlFor,
  headingRef,
  onAddPhotos,
  onRemovePhoto,
  onRetryPhoto,
  onReplacePhoto,
  onAddDocuments,
  onRemoveDocument,
  onRetryDocument,
  onReplaceDocument,
  onDocumentCategory,
}: EvidenceStepProps) => {
  const { t } = useTranslation();
  const ids = useId();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  // Which item "Choose again" is for; one hidden input serves every item.
  const replaceTargetRef = useRef<{ kind: 'photo' | 'document'; key: string } | null>(null);

  const groups = documentGroupStatus(relationship, documents);
  const canAddPhoto = evidence.length < CLAIM_EVIDENCE_MAX;
  const canAddDocument = documents.length < CLAIM_DOCUMENT_MAX;

  const takeFiles = (input: HTMLInputElement): File[] => {
    const files = input.files ? Array.from(input.files) : [];
    // Clear the input so choosing the same file again still fires `change`.
    input.value = '';
    return files;
  };

  const chooseAgain = (kind: 'photo' | 'document', key: string) => {
    replaceTargetRef.current = { kind, key };
    replaceInputRef.current?.click();
  };

  return (
    <StepShell title={t('wizardEvidenceTitle')} headingRef={headingRef}>
      {/* The photo input comes first in the DOM on purpose (component tests pick the first file input). */}
      <input
        ref={photoInputRef}
        data-testid="wizard-photo-input"
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => onAddPhotos(takeFiles(event.target))}
      />
      <input
        ref={documentInputRef}
        data-testid="wizard-document-input"
        type="file"
        accept={OWNERSHIP_DOCUMENT_ACCEPT}
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => onAddDocuments(takeFiles(event.target))}
      />
      <input
        ref={replaceInputRef}
        data-testid="wizard-replace-input"
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const [file] = takeFiles(event.target);
          const target = replaceTargetRef.current;
          replaceTargetRef.current = null;
          if (!file || !target) return;
          if (target.kind === 'photo') onReplacePhoto(target.key, file);
          else onReplaceDocument(target.key, file);
        }}
      />

      {/* ── Crop photos (required) ─────────────────────────────────────────────────── */}
      <section aria-labelledby={`${ids}-photos`} className="mb-6">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h4 id={`${ids}-photos`} className="text-sm font-semibold text-ink">
            {t('wizardPhotosTitle')}
          </h4>
          <Badge tone="warning" icon={null}>
            {t('wizardRequired')}
          </Badge>
          <span className="ml-auto text-xs text-ink-muted">
            {t('wizardPhotosCount', { count: evidence.length, max: CLAIM_EVIDENCE_MAX })}
          </span>
        </div>
        <p className="mb-3 text-xs text-ink-muted">
          {t('wizardPhotosHint', { min: MIN_PHOTOS_TO_SUBMIT, max: CLAIM_EVIDENCE_MAX })}
        </p>
        <Button
          variant="secondary"
          leadingIcon={<Camera className="h-4 w-4" />}
          onClick={() => photoInputRef.current?.click()}
          disabled={!canAddPhoto || busy}
        >
          {t('wizardAddPhotos')}
        </Button>
        {!canAddPhoto && <p className="mt-2 text-xs text-ink-muted">{t('wizardPhotoLimitReached', { max: CLAIM_EVIDENCE_MAX })}</p>}
        <Messages messages={photoMessages} testId="wizard-photo-messages" />

        {evidence.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">{t('wizardNoPhotos')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {evidence.map((entry) => {
              const preview = previewUrlFor(entry.key);
              const statusText =
                entry.status === 'uploaded'
                  ? t('wizardItemStatus_uploaded')
                  : entry.status === 'uploading'
                    ? t('photoUploading')
                    : entry.status === 'failed'
                      ? entry.errorKey
                        ? t(entry.errorKey)
                        : t('photoUploadFailed')
                      : entry.status === 'missing_file'
                        ? t('wizardItemStatus_missing_file')
                        : `${t('wizardItemStatus_staged')} · ${fileMeta(entry.detectedType, entry.size)}`;
              return (
                <li
                  key={entry.key}
                  data-testid="wizard-photo"
                  data-status={entry.status}
                  className="flex items-center gap-3 rounded-control border border-surface-border px-3 py-2"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-sunken">
                    {preview ? (
                      <img src={preview} alt={t('wizardPhotoThumbAlt', { name: entry.name })} className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon aria-hidden="true" className="h-6 w-6 text-ink-subtle" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{t('photoAdded', { name: entry.name })}</div>
                    <div className={cn('text-xs', statusTone(entry.status))}>{statusText}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {entry.status === 'uploading' ? (
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-brand-700" />
                    ) : (
                      <>
                        {entry.status === 'failed' && claimSaved && (
                          <Button
                            size="sm"
                            variant="secondary"
                            leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
                            aria-label={t('wizardRetryItem', { name: entry.name })}
                            onClick={() => onRetryPhoto(entry.key)}
                            disabled={busy}
                          >
                            {t('retry')}
                          </Button>
                        )}
                        {entry.status === 'missing_file' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            leadingIcon={<Upload className="h-3.5 w-3.5" />}
                            aria-label={t('wizardChooseAgainItem', { name: entry.name })}
                            onClick={() => chooseAgain('photo', entry.key)}
                            disabled={busy}
                          >
                            {t('wizardChooseAgain')}
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t('wizardRemovePhoto', { name: entry.name })}
                          onClick={() => onRemovePhoto(entry.key)}
                          disabled={busy}
                        >
                          <X aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Land documents (recommended) ───────────────────────────────────────────── */}
      <section aria-labelledby={`${ids}-docs`}>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h4 id={`${ids}-docs`} className="text-sm font-semibold text-ink">
            {t('ownershipTitle')}
          </h4>
          <Badge tone="quiet" icon={null}>
            {t('wizardRecommended')}
          </Badge>
          <span className="ml-auto text-xs text-ink-muted">
            {t('wizardDocumentsCount', { count: documents.length, max: CLAIM_DOCUMENT_MAX })}
          </span>
        </div>
        <p className="mb-3 text-xs text-ink-muted">{t('wizardDocumentsHint')}</p>

        {relationship && groups.length > 0 ? (
          <div className="mb-3 rounded-control border border-surface-border bg-surface-muted px-3 py-2">
            <p className="text-xs font-semibold text-ink">
              {t('ownershipExpectedFor', { relationship: t(claimantRelationshipLabelKey(relationship)) })}
            </p>
            <ul data-testid="wizard-document-groups" className="mt-1 space-y-1">
              {groups.map((entry) => (
                <li
                  key={entry.group.join('|')}
                  data-satisfied={entry.satisfied ? 'true' : 'false'}
                  className="flex items-start gap-2 text-xs text-ink-muted"
                >
                  {entry.satisfied ? (
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-solid" />
                  ) : (
                    <Circle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                  )}
                  <span className="min-w-0">
                    {entry.group.map((category) => t(ownershipCategoryLabelKey(category))).join(t('listOrJoiner'))}
                    <span className={cn('ml-1 font-semibold', entry.satisfied ? 'text-success-fg' : 'text-ink-subtle')}>
                      {`(${entry.satisfied ? t('wizardDocumentGroupAdded') : t('wizardDocumentGroupMissing')})`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p data-testid="wizard-document-generic" className="mb-3 rounded-control border border-surface-border bg-surface-muted px-3 py-2 text-xs text-ink-muted">
            {t('ownershipHintNoRelationship')}
          </p>
        )}

        <Button
          variant="secondary"
          leadingIcon={<FileText className="h-4 w-4" />}
          onClick={() => documentInputRef.current?.click()}
          disabled={!canAddDocument || busy}
        >
          {t('wizardAddDocument')}
        </Button>
        {!canAddDocument && <p className="mt-2 text-xs text-ink-muted">{t('wizardDocumentLimitReached', { max: CLAIM_DOCUMENT_MAX })}</p>}
        <Messages messages={documentMessages} testId="wizard-document-messages" />

        {documents.length > 0 && (
          <ul className="mt-3 space-y-2">
            {documents.map((doc) => {
              const fixed = doc.status === 'attached' || doc.status === 'attaching';
              const statusText =
                doc.status === 'failed' && doc.errorKey
                  ? t(doc.errorKey)
                  : t(`wizardDocumentStatus_${doc.status}`);
              return (
                <li
                  key={doc.key}
                  data-testid="wizard-document"
                  data-status={doc.status}
                  className="rounded-control border border-surface-border px-3 py-2"
                >
                  <div className="flex items-start gap-3">
                    <FileText aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-ink-subtle" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{doc.name}</div>
                      <div className={cn('text-xs', statusTone(doc.status))}>{statusText}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {doc.status === 'uploading' || doc.status === 'attaching' ? (
                        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-brand-700" />
                      ) : doc.status === 'attached' ? null : (
                        <>
                          {doc.status === 'failed' && claimSaved && (
                            <Button
                              size="sm"
                              variant="secondary"
                              leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
                              aria-label={t('wizardRetryItem', { name: doc.name })}
                              onClick={() => onRetryDocument(doc.key)}
                              disabled={busy}
                            >
                              {t('retry')}
                            </Button>
                          )}
                          {doc.status === 'missing_file' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              leadingIcon={<Upload className="h-3.5 w-3.5" />}
                              aria-label={t('wizardChooseAgainItem', { name: doc.name })}
                              onClick={() => chooseAgain('document', doc.key)}
                              disabled={busy}
                            >
                              {t('wizardChooseAgain')}
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t('wizardRemoveDocument', { name: doc.name })}
                            onClick={() => onRemoveDocument(doc.key)}
                            disabled={busy}
                          >
                            <X aria-hidden="true" className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <span>{t('ownershipCategoryLabel')}</span>
                    <select
                      value={doc.category}
                      disabled={fixed || busy}
                      aria-label={t('wizardDocumentCategoryFor', { name: doc.name })}
                      onChange={(event) => onDocumentCategory(doc.key, event.target.value as OwnershipDocumentCategory)}
                      className="min-h-9 rounded-control border border-surface-border bg-white px-2 py-1 text-sm text-ink disabled:bg-surface-muted"
                    >
                      {OWNERSHIP_DOCUMENT_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {t(ownershipCategoryLabelKey(category))}
                        </option>
                      ))}
                    </select>
                  </label>
                  {doc.status === 'attached' && (
                    <p className="mt-1 text-2xs text-ink-subtle">{t('wizardDocumentAttachedNote')}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 text-xs text-ink-muted">{t('ownershipImagesOnlyHint')}</p>
        <p data-testid="wizard-documents-ai-note" className="mt-1 text-xs text-ink-muted">
          {t('evidenceDocsAiNote')}
        </p>
      </section>

      <div aria-live="polite" className="mt-4">
        {missing.length > 0 && (
          <div
            data-testid="evidence-missing-hint"
            className="rounded-control border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-fg"
          >
            <p className="font-semibold">{t('wizardMissingTitle')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {missing.map((need) => (
                <li key={need}>{t(`wizardEvidenceMissing_${need}`)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </StepShell>
  );
};

export default EvidenceStep;
