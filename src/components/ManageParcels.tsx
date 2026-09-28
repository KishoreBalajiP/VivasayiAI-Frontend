import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Plus,
  Loader2,
  MapPin,
  Edit,
  Trash2,
  Map,
  X,
  Check,
  ArrowLeft,
} from 'lucide-react';
import { ApiClientError, friendlyMessageKey } from '../api/client';
import {
  listParcels,
  createParcel,
  updateParcel,
  deleteParcel,
  type CreateParcelInput,
  type UpdateParcelInput,
} from '../api';
import type { ParcelRecord } from '../types';

interface ManageParcelsProps {
  onClose: () => void;
  onParcelsChange: () => void;
}

export const ManageParcels = ({ onClose, onParcelsChange }: ManageParcelsProps) => {
  const { t } = useTranslation();
  const [parcels, setParcels] = useState<ParcelRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingParcel, setEditingParcel] = useState<ParcelRecord | null>(null);
  const [deletingParcelId, setDeletingParcelId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [crop, setCrop] = useState('');
  const [geometry, setGeometry] = useState<ParcelRecord['geometry'] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadParcels = useCallback(async () => {
    setStatus('loading');
    try {
      const fetched = await listParcels();
      setParcels(fetched);
      setStatus('ready');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return;
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadParcels();
  }, [loadParcels]);

  const resetForm = () => {
    setName('');
    setCrop('');
    setGeometry(null);
    setSubmitError(null);
    setEditingParcel(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (parcel: ParcelRecord) => {
    setEditingParcel(parcel);
    setName(parcel.name);
    setCrop(parcel.crop);
    setGeometry(parcel.geometry);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    resetForm();
  };

  const validateForm = (): boolean => {
    if (!name.trim()) {
      setSubmitError('parcelNameRequired');
      return false;
    }
    if (!crop.trim()) {
      setSubmitError('parcelCropRequired');
      return false;
    }
    if (!geometry) {
      setSubmitError('boundaryRequired');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!validateForm()) return;

    // After validation, geometry is guaranteed to be non-null
    const validGeometry = geometry!;
    
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const input: CreateParcelInput = {
        name: name.trim(),
        crop: crop.trim(),
        geometry: validGeometry,
      };

      if (editingParcel) {
        const updateInput: UpdateParcelInput = {
          name: name.trim(),
          crop: crop.trim(),
          geometry: validGeometry,
        };
        await updateParcel(editingParcel.parcelId, updateInput);
        toast.success(t('parcelUpdated'));
      } else {
        await createParcel(input);
        toast.success(t('parcelCreated'));
      }

      closeModal();
      loadParcels();
      onParcelsChange();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return;
      toast.error(
        err instanceof ApiClientError
          ? t(friendlyMessageKey(err.status))
          : t(editingParcel ? 'parcelUpdateFailed' : 'parcelCreateFailed')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (parcelId: string) => {
    if (!window.confirm(t('confirmDeleteParcelHint'))) return;

    setDeletingParcelId(parcelId);
    try {
      await deleteParcel(parcelId);
      toast.success(t('parcelDeleted'));
      loadParcels();
      onParcelsChange();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) return;
      toast.error(
        err instanceof ApiClientError
          ? t(friendlyMessageKey(err.status))
          : t('parcelDeleteFailed')
      );
    } finally {
      setDeletingParcelId(null);
    }
  };

  const renderParcelCard = (parcel: ParcelRecord) => (
    <div key={parcel.parcelId} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-gray-900">
              {parcel.name || t('parcelNameLabel')}
            </h3>
            <span className="whitespace-nowrap text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {t('parcelAreaAcresLabel', { acres: parcel.calculatedAreaAcres })}
            </span>
          </div>
          {parcel.crop && (
            <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
              <MapPin className="h-3.5 w-3.5" />
              <span>{t('parcelCropLabel')}: {parcel.crop}</span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => openEditModal(parcel)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-emerald-700"
            aria-label={t('editParcel')}
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleDelete(parcel.parcelId)}
            disabled={deletingParcelId === parcel.parcelId}
            className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            aria-label={t('deleteParcel')}
          >
            {deletingParcelId === parcel.parcelId ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (status === 'loading') {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-gray-100">
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label={t('backToClaims')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-bold text-gray-900">{t('manageParcelsTitle')}</h2>
          <div className="w-10" />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-gray-100">
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label={t('backToClaims')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-bold text-gray-900">{t('manageParcelsTitle')}</h2>
          <div className="w-10" />
        </div>
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="text-center">
            <p className="text-sm text-red-700">{t('claimsLoadFailed')}</p>
            <button
              onClick={loadParcels}
              className="mt-3 rounded-full border border-gray-300 px-4 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              {t('retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-gray-100 bg-white">
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          aria-label={t('backToClaims')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-bold text-gray-900">{t('manageParcelsTitle')}</h2>
        <button
          onClick={openAddModal}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:from-emerald-700 hover:to-green-800"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('addParcel')}</span>
        </button>
      </header>

      {/* Content */}
      <main className="flex min-h-0 min-w-0 flex-1 overflow-y-auto p-4 bg-gray-50">
        <div className="mx-auto max-w-2xl space-y-4">
          {parcels.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-700">
                <MapPin className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-base font-bold text-gray-900">{t('noParcelsTitle')}</h3>
              <p className="max-w-md text-sm text-gray-600">{t('noParcelsBody')}</p>
              <button
                onClick={openAddModal}
                className="mt-1 rounded-xl bg-gradient-to-r from-emerald-600 to-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-emerald-700 hover:to-green-800"
              >
                {t('addFirstParcel')}
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {parcels.map(renderParcelCard)}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Add/Edit Parcel Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingParcel ? t('editParcel') : t('addParcel')}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-emerald-950/50 p-4 backdrop-blur-sm"
        >
          <div className="bg-white rounded-3xl shadow-2xl p-5 sm:p-8 md:p-10 max-w-lg w-full mx-2 my-6">
            <div className="mb-4 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-800">
                {editingParcel ? t('editParcel') : t('addParcel')}
              </h3>
              <button
                onClick={closeModal}
                aria-label={t('cancel')}
                className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-6 text-sm text-gray-600">
              {editingParcel ? t('manageParcelsDescription') : t('manageParcelsDescription')}
            </p>

            {/* NAME */}
            <div className="mb-4">
              <label htmlFor="parcel-name" className="block text-sm font-semibold text-gray-700 mb-1">
                {t('parcelName')}
              </label>
              <input
                id="parcel-name"
                type="text"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setSubmitError(null);
                }}
                placeholder={t('parcelNamePlaceholder')}
                className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            {/* CROP */}
            <div className="mb-4">
              <label htmlFor="parcel-crop" className="block text-sm font-semibold text-gray-700 mb-1">
                {t('parcelCrop')}
              </label>
              <input
                id="parcel-crop"
                type="text"
                value={crop}
                onChange={e => {
                  setCrop(e.target.value);
                  setSubmitError(null);
                }}
                placeholder={t('parcelCropPlaceholder')}
                className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            {/* BOUNDARY DRAWING PLACEHOLDER */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {t('drawingBoundary')}
              </label>
              <div
                className={`relative rounded-xl border-2 p-8 text-center ${
                  geometry
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-dashed border-gray-300 bg-gray-50'
                }`}
              >
                {geometry ? (
                  <div className="flex items-center justify-center gap-2 text-emerald-700">
                    <Check className="h-5 w-5" />
                    <span className="font-medium">{t('parcelAreaAcresLabel', { acres: 'calculated' })}</span>
                  </div>
                ) : (
                  <div className="space-y-2 text-gray-500">
                    <Map className="mx-auto h-10 w-10" />
                    <p className="text-sm">{t('boundaryRequired')}</p>
                    <p className="text-xs">Map drawing integration coming soon</p>
                  </div>
                )}
              </div>
              {submitError === 'boundaryRequired' && (
                <p role="alert" className="text-sm text-red-600 mt-1">{t('boundaryRequired')}</p>
              )}
            </div>

            {submitError && submitError !== 'boundaryRequired' && (
              <p role="alert" className="mb-4 text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {t(submitError)}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-700 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-emerald-700 hover:to-green-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isSubmitting ? t('savingProfile') : t(editingParcel ? 'updateProfile' : 'saveProfile')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageParcels;