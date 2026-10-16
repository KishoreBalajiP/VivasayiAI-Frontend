import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Eye, FileText, Loader2, Plus, RefreshCw } from 'lucide-react';
import { ApiClientError, friendlyMessageKey } from '../api/client';
import {
  getOwnershipDocumentUrl,
  listOwnershipEvidence,
  OWNERSHIP_DOCUMENT_ACCEPT,
  uploadOwnershipDocument,
} from '../api/claims';
import { validateImageFile } from '../utils/imageValidation';
import {
  OWNERSHIP_DOCUMENT_CATEGORIES,
  RELATIONSHIP_DOCUMENT_GROUPS,
  claimantRelationshipLabelKey,
  formatClaimDate,
  ownershipCategoryLabelKey,
  ownershipStatusLabelKey,
} from '../utils/claimFlow';
import type {
  ClaimantRelationship,
  OwnershipDocumentCategory,
  OwnershipEvidence,
} from '../types';

// Land ownership documents on the claim detail (contract §1.1, §3). The farmer attaches photos or
// scans of their land papers; each one waits for a manual review. Attaching a document is NOT a
// verification and nothing here is ever labelled "official": no authoritative provider exists.
// Upload goes through the generic private pipeline (images only — JPEG/PNG/WebP), then the
// stored upload is attached with its category. The signed view URL is minted on demand.

interface ClaimOwnershipDocumentsProps {
  claimId: string;
  relationship: ClaimantRelationship | null | undefined;
  canAttach: boolean;
  language: string;
  // Called after a document is attached so the detail view can refresh its checklist.
  onChanged?: () => void;
}

const firstExpectedCategory = (
  relationship: ClaimantRelationship | null | undefined
): OwnershipDocumentCategory =>
  relationship ? RELATIONSHIP_DOCUMENT_GROUPS[relationship][0][0] : 'land_record';

export const ClaimOwnershipDocuments = ({
  claimId,
  relationship,
  canAttach,
  language,
  onChanged,
}: ClaimOwnershipDocumentsProps) => {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<OwnershipEvidence[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [category, setCategory] = useState<OwnershipDocumentCategory>(() =>
    firstExpectedCategory(relationship)
  );
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<{ id: string; url: string | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoadFailed(false);
    try {
      const list = await listOwnershipEvidence(claimId);
      if (requestIdRef.current !== requestId) return;
      setDocuments(list.evidence ?? []);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      if (err instanceof ApiClientError && err.status === 401) return; // auth layer
      setLoadFailed(true);
    }
  }, [claimId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || uploading) return;
    try {
      await validateImageFile(file);
    } catch (err) {
      const key = (err as { key?: string })?.key;
      toast.error(t(key ?? 'unsupportedImage'), { duration: 4000 });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      await uploadOwnershipDocument(claimId, file, category);
      toast.success(t('ownershipAttachedToast'), { duration: 3000 });
      await load();
      onChanged?.();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return;
      const status = err instanceof ApiClientError ? err.status : 0;
      // 400 on this path is the upload pipeline refusing the file type (images only).
      const key = status === 400 ? 'ownershipImagesOnly' : friendlyMessageKey(status, 'image');
      toast.error(t(key), { duration: 4000 });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleView = async (evidenceId: string) => {
    if (viewing?.id === evidenceId && viewing.url) {
      setViewing(null); // toggle closed
      return;
    }
    setViewing({ id: evidenceId, url: null });
    try {
      const signed = await getOwnershipDocumentUrl(claimId, evidenceId);
      setViewing({ id: evidenceId, url: signed.signedUrl });
    } catch (err) {
      setViewing(null);
      if (err instanceof ApiClientError && err.status === 401) return;
      toast.error(t('ownershipViewFailed'), { duration: 4000 });
    }
  };

  const expectedGroups = relationship ? RELATIONSHIP_DOCUMENT_GROUPS[relationship] : null;

  return (
    <section
      className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
      aria-labelledby="ownership-docs-title"
    >
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-emerald-700" aria-hidden />
        <h3 id="ownership-docs-title" className="text-sm font-bold text-gray-800">
          {t('ownershipTitle')}
        </h3>
      </div>

      {relationship && expectedGroups ? (
        <div className="mb-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <p className="mb-1">
            {t('ownershipExpectedFor', { relationship: t(claimantRelationshipLabelKey(relationship)) })}
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            {expectedGroups.map((group) => (
              <li key={group.join('|')}>
                {group.map((c) => t(ownershipCategoryLabelKey(c))).join(t('listOrJoiner'))}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mb-3 text-xs text-gray-600">{t('ownershipHintNoRelationship')}</p>
      )}

      {documents === null && !loadFailed && (
        <div className="flex items-center gap-2 py-2 text-xs text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      )}

      {loadFailed && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>{t('ownershipLoadFailed')}</span>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-full border border-amber-400 px-2.5 py-0.5 font-semibold hover:bg-amber-100"
          >
            <RefreshCw className="h-3 w-3" />
            {t('retry')}
          </button>
        </div>
      )}

      {documents !== null && documents.length === 0 && (
        <p className="mb-2 text-xs text-gray-500">{t('ownershipEmpty')}</p>
      )}

      {documents !== null && documents.length > 0 && (
        <ul className="mb-3 space-y-2">
          {documents.map((doc) => {
            const docCategory = doc.metadata?.documentCategory ?? 'other';
            const open = viewing?.id === doc.id;
            return (
              <li key={doc.id} className="rounded-xl border border-gray-200 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-800">
                      {t(ownershipCategoryLabelKey(docCategory))}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t(ownershipStatusLabelKey(doc.status))}
                      {doc.createdAt ? ` · ${formatClaimDate(doc.createdAt, language)}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => void handleView(doc.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    aria-expanded={open && Boolean(viewing?.url)}
                  >
                    {open && !viewing?.url ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    {t('ownershipView')}
                  </button>
                </div>
                {open && viewing?.url && (
                  <div className="mt-2">
                    <img
                      src={viewing.url}
                      alt={t(ownershipCategoryLabelKey(docCategory))}
                      className="max-h-72 w-full rounded-lg border object-contain"
                    />
                    <a
                      href={viewing.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs font-semibold text-emerald-700 underline"
                    >
                      {t('ownershipOpenFull')}
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canAttach && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs text-gray-600">
            <span className="mb-1 block font-semibold">{t('ownershipCategoryLabel')}</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as OwnershipDocumentCategory)}
              disabled={uploading}
              className="w-full rounded-xl border border-gray-200 bg-white p-2 text-sm outline-none focus:border-emerald-400"
            >
              {OWNERSHIP_DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(ownershipCategoryLabelKey(c))}
                </option>
              ))}
            </select>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept={OWNERSHIP_DOCUMENT_ACCEPT}
            className="hidden"
            data-testid="ownership-file-input"
            onChange={(event) => void handleFile(event.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-400 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {uploading ? t('ownershipUploading') : t('ownershipAdd')}
          </button>
        </div>
      )}

      <p className="mt-3 text-[11px] text-gray-500">{t('ownershipImagesOnlyHint')}</p>
      <p className="mt-1 text-[11px] text-gray-500">{t('ownershipNotOfficial')}</p>
    </section>
  );
};

export default ClaimOwnershipDocuments;
