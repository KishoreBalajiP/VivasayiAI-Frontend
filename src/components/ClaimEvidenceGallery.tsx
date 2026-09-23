import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
          toast.error(t(friendlyMessageKey(err.status)), { duration: 4000 });
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

  if (evidence.length === 0 && !canEdit) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-500 shadow-sm">
        {t('noEvidenceText')}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-800">{t('evidenceAmount')}</h3>
        {canEdit && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-70"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {t('evidenceAdd')}
          </button>
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
        <p className="text-sm text-gray-500">{t('noEvidenceText')}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {evidence.map((entry) => {
            const thumb = thumbnails[entry.uploadId];
            const isBusy = busyKey === entry.uploadId;
            return (
              <li
                key={entry.uploadId}
                className="group relative aspect-square overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={entry.mediaType}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-gray-400">
                    {entry.status === 'stored' || entry.status === 'completed' ? (
                      <ImageIcon className="h-5 w-5" />
                    ) : (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    )}
                    <span className="px-1 text-center text-[10px] leading-tight text-gray-500">
                      {t(evidenceStatusLabelKey(entry.status))}
                    </span>
                  </div>
                )}
                {canEdit && (
                  <>
                    {confirmKey === entry.uploadId ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 p-1">
                        <span className="text-center text-[10px] leading-tight text-white">
                          {t('evidenceDeleteConfirm')}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => void handleDelete(entry.uploadId)}
                            disabled={isBusy}
                            className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-60"
                          >
                            {isBusy ? t('loading') : t('delete')}
                          </button>
                          <button
                            onClick={() => setConfirmKey(null)}
                            className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-800"
                          >
                            {t('cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmKey(entry.uploadId)}
                        aria-label={t('evidenceDelete')}
                        className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-700 opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ClaimEvidenceGallery;