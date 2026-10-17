import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, ConfirmDialog } from './ui';
import { ApiClientError, friendlyMessageKey } from '../api/client';
import {
  deleteEvidenceUpload,
  getEvidenceUrl,
  uploadClaimEvidence,
} from '../api/claims';
import { validateImageFile } from '../utils/imageValidation';
import { evidenceStatusLabelKey } from '../utils/claimFlow';
import type { ClaimEvidenceEntry } from '../types';

// Claim evidence gallery (Phase 7). Renders backend-serialized evidence summaries; only stored
// images get a short-lived signed GET URL for display (never an S3 key). Add/remove are only
// offered while the claim state allows mutations (canEdit comes from the backend-declared state).

interface ClaimEvidenceGalleryProps {
  claimId: string;
  evidence: ClaimEvidenceEntry[];
  canEdit: boolean;
  onChanged: () => void;
}

export const ClaimEvidenceGallery = ({
  claimId,
  evidence,
  canEdit,
  onChanged,
}: ClaimEvidenceGalleryProps) => {
  const { t } = useTranslation();
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadThumbnails = useCallback(async () => {
    const stored = evidence.filter((entry) => entry.status === 'stored');
    if (stored.length === 0) return;
    const entries = await Promise.all(
      stored.map(async (entry) => {
        try {
          const { url } = await getEvidenceUrl(claimId, entry.uploadId);
          return [entry.uploadId, url] as const;
        } catch {
          return null;
        }
      })
    );
    const next: Record<string, string> = {};
    for (const hit of entries) {
      if (hit) next[hit[0]] = hit[1];
    }
    setThumbnails((prev) => ({ ...prev, ...next }));
  }, [claimId, evidence]);

  useEffect(() => {
    void loadThumbnails();
  }, [loadThumbnails]);

  const handleAdd = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || uploading) return;
      const file = files[0];
      try {
        await validateImageFile(file);
      } catch (err) {
        const key = (err as { key?: string })?.key;
        toast.error(key ? t(key) : t('unsupportedImage'), { duration: 4000 });
        return;
      }
      setUploading(true);
      try {
        await uploadClaimEvidence(claimId, file);
        toast.success(t('evidenceAddedToast'), { duration: 3000 });
        onChanged();
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.status === 401) return;
          toast.error(t(friendlyMessageKey(err.status, 'image')), { duration: 4000 });
          return;
        }
        toast.error(t('imageUploadFailed'), { duration: 4000 });
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [claimId, uploading, onChanged, t]
  );

  const handleDelete = useCallback(
    async (evidenceId: string) => {
      setBusyKey(evidenceId);
      try {
        await deleteEvidenceUpload(claimId, evidenceId);
        setThumbnails((prev) => {
          const rest = { ...prev };
          delete rest[evidenceId];
          return rest;
        });
        toast.success(t('evidenceDeletedToast'), { duration: 3000 });
        onChanged();
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.status === 401) return;
          toast.error(t(friendlyMessageKey(err.status)), { duration: 4000 });
          return;
        }
        toast.error(t('imageUploadFailed'), { duration: 4000 });
      } finally {
        setBusyKey(null);
        setConfirmKey(null);
      }
    },
    [claimId, onChanged, t]
  );

  const confirmIndex = confirmKey ? evidence.findIndex((entry) => entry.uploadId === confirmKey) : -1;

  if (evidence.length === 0 && !canEdit) {
    return (
      <div className="rounded-card border border-surface-border bg-white p-4 text-sm text-ink-muted shadow-card">
        {t('noEvidenceText')}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">{t('evidenceAmount')}</h3>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            loading={uploading}
            leadingIcon={<Plus className="h-3.5 w-3.5" />}
          >
            {t('evidenceAdd')}
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={false}
        className="hidden"
        onChange={(event) => void handleAdd(event.target.files)}
      />

      {evidence.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('noEvidenceText')}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {evidence.map((entry, index) => {
            const thumb = thumbnails[entry.uploadId];
            const isBusy = busyKey === entry.uploadId;
            return (
              <li
                key={entry.uploadId}
                className="relative aspect-square overflow-hidden rounded-control border border-surface-border bg-surface-muted"
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={t('evidencePhotoAlt', { n: index + 1 })}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-subtle">
                    {entry.status === 'stored' || entry.status === 'completed' ? (
                      <ImageIcon aria-hidden="true" className="h-5 w-5" />
                    ) : (
                      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                    )}
                    <span className="px-1 text-center text-2xs leading-tight text-ink-muted">
                      {t(evidenceStatusLabelKey(entry.status))}
                    </span>
                  </div>
                )}
                {canEdit && (
                  // Always visible (not hover-only): touch screens and keyboards have no hover.
                  <button
                    type="button"
                    onClick={() => setConfirmKey(entry.uploadId)}
                    disabled={isBusy}
                    aria-label={t('evidenceDeleteItem', { n: index + 1 })}
                    className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-ink shadow hover:bg-white disabled:opacity-60"
                  >
                    {isBusy ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <X aria-hidden="true" className="h-3.5 w-3.5" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirmKey !== null}
        tone="danger"
        title={t('evidenceDeleteConfirm')}
        body={t('evidenceDeleteBody')}
        confirmLabel={confirmIndex >= 0 ? t('evidenceDeleteItem', { n: confirmIndex + 1 }) : t('evidenceDelete')}
        busy={busyKey !== null}
        onConfirm={() => {
          if (confirmKey) void handleDelete(confirmKey);
        }}
        onCancel={() => setConfirmKey(null)}
      />
    </div>
  );
};

export default ClaimEvidenceGallery;