import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/LocationContext';
import { createProfile } from '../api';
import { ApiClientError } from '../api/client';
import { tamilNaduDistricts } from '../config/tamilnaduDistricts';
import { Loader2, X } from 'lucide-react';
import type { FarmProfile, Language } from '../types';

interface Props {
  onComplete: (profile: FarmProfile) => void;
  onSkip?: () => void;
}

const MAX_CROPS = 20;
const MAX_CROP_LENGTH = 100;

export const ProfileOnboarding = ({ onComplete, onSkip }: Props) => {
  const { t, i18n } = useTranslation();
  const { language, setLanguage } = useAuth();
  // Device location is a convenience pre-fill only — the farmer still chooses and owns the
  // district saved to the profile. Location is never equated with the farm district.
  const { district: detectedDistrict, status: locStatus } = useLocation();

  const [district, setDistrict] = useState(
    locStatus === 'granted' && detectedDistrict ? detectedDistrict : ''
  );
  const [crops, setCrops] = useState<string[]>([]);
  const [cropInput, setCropInput] = useState('');
  const [acresInput, setAcresInput] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(language);
  const [errors, setErrors] = useState<{ district?: string; crops?: string; acres?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addCrop = () => {
    const crop = cropInput.trim();
    if (!crop) return;

    setErrors(prev => ({ ...prev, crops: undefined }));

    if (crops.length >= MAX_CROPS) {
      setErrorFromKey('crops', 'cropLimit');
      return;
    }
    if (crop.length > MAX_CROP_LENGTH) {
      setErrorFromKey('crops', 'cropLimit');
      return;
    }
    // Backend treats crop names as case-sensitive strings; avoid obvious duplicates
    // case-insensitively for a better UX.
    if (crops.some(c => c.toLowerCase() === crop.toLowerCase())) {
      setCropInput('');
      return;
    }
    setCrops(prev => [...prev, crop]);
    setCropInput('');
  };

  // Full-width error shown under the field the user is correcting.
  const setErrorFromKey = (field: 'district' | 'crops' | 'acres', key: string) => {
    setErrors(prev => ({ ...prev, [field]: key }));
  };

  const selectLanguage = (lang: Language) => {
    setSelectedLanguage(lang);
    setLanguage(lang);
    i18n.changeLanguage(lang);
  };

  const validate = (): boolean => {
    const next: { district?: string; crops?: string; acres?: string } = {};

    if (!district) next.district = 'districtRequired';

    if (crops.length === 0) next.crops = 'cropRequired';

    const acresNumber = Number(acresInput);
    if (!acresInput.trim()) next.acres = 'acresRequired';
    else if (!Number.isFinite(acresNumber) || acresNumber <= 0) next.acres = 'acresInvalid';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Only the four supported profile fields; ownership derives from the Bearer token.
      const profile = await createProfile({
        district: district.trim(),
        crops,
        acres: Number(acresInput),
        language: selectedLanguage,
      });
      onComplete(profile);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) return; // Phase 1 auth layer routes to login
        if (err.status === 429) {
          setSubmitError('rateLimited');
          return;
        }
        if (err.status === 0) {
          setSubmitError('networkError');
          return;
        }
      }
      setSubmitError('saveFailed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('profileHeading')}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-emerald-950/50 p-4 backdrop-blur-sm"
    >
      <div className="bg-white rounded-3xl shadow-2xl p-5 sm:p-8 md:p-10 max-w-lg w-full mx-2 my-6">
        <div className="flex justify-center mb-4">
          <div className="bg-gradient-to-br from-emerald-500 to-green-700 p-4 sm:p-5 rounded-full shadow-lg">
            <span className="text-3xl sm:text-4xl">🌾</span>
          </div>
        </div>

        <h1 className="text-xl sm:text-2xl font-bold text-center text-gray-800 mb-2">
          {t('profileHeading')}
        </h1>
        <p className="text-center text-gray-600 text-sm sm:text-base mb-6">
          {t('profileDescription')}
        </p>

        {/* DISTRICT */}
        <div className="mb-4">
          <label htmlFor="profile-district" className="block text-sm font-semibold text-gray-700 mb-1">
            {t('district')}
          </label>
          <select
            id="profile-district"
            value={district}
            onChange={e => {
              setDistrict(e.target.value);
              setErrors(prev => ({ ...prev, district: undefined }));
            }}
            className="w-full p-3 border border-gray-200 rounded-xl bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">{t('district')}…</option>
            {tamilNaduDistricts.map(d => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
          {errors.district && (
            <p role="alert" className="text-sm text-red-600 mt-1">{t(errors.district)}</p>
          )}
        </div>

        {/* CROPS */}
        <div className="mb-4">
          <label htmlFor="profile-crop-input" className="block text-sm font-semibold text-gray-700 mb-1">
            {t('addCrops')}
          </label>
          <div className="flex gap-2">
            <input
              id="profile-crop-input"
              type="text"
              value={cropInput}
              onChange={e => setCropInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCrop();
                }
              }}
              placeholder={t('cropPlaceholder')}
              className="flex-1 p-3 border border-gray-200 rounded-xl outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            <button
              type="button"
              onClick={addCrop}
              disabled={!cropInput.trim() || crops.length >= MAX_CROPS}
              className="px-4 py-3 bg-green-600 text-white rounded-xl font-semibold
                hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {t('add')}
            </button>
          </div>

          {crops.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {crops.map(crop => (
                <span
                  key={crop}
                  className="inline-flex items-center gap-1 bg-green-100 text-green-900 px-3 py-1 rounded-full text-sm"
                >
                  {crop}
                  <button
                    type="button"
                    onClick={() => setCrops(prev => prev.filter(c => c !== crop))}
                    aria-label={t('removeCrop', { crop })}
                    className="text-green-700 hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {errors.crops && (
            <p role="alert" className="text-sm text-red-600 mt-1">{t(errors.crops)}</p>
          )}
        </div>

        {/* ACRES */}
        <div className="mb-4">
          <label htmlFor="profile-acres" className="block text-sm font-semibold text-gray-700 mb-1">
            {t('acres')}
          </label>
          <input
            id="profile-acres"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="any"
            value={acresInput}
            onChange={e => {
              setAcresInput(e.target.value);
              setErrors(prev => ({ ...prev, acres: undefined }));
            }}
            placeholder={t('acresPlaceholder')}
            className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
          {errors.acres && (
            <p role="alert" className="text-sm text-red-600 mt-1">{t(errors.acres)}</p>
          )}
        </div>

        {/* LANGUAGE */}
        <div className="mb-6">
          <span className="block text-sm font-semibold text-gray-700 mb-1">
            {t('preferredLanguage')}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => selectLanguage('ta')}
              className={`p-3 rounded-xl border-2 font-semibold transition-colors
                ${selectedLanguage === 'ta'
                  ? 'border-orange-500 bg-orange-50 text-orange-800'
                  : 'border-gray-300 text-gray-700'}`}
            >
              தமிழ்
            </button>
            <button
              type="button"
              onClick={() => selectLanguage('en')}
              className={`p-3 rounded-xl border-2 font-semibold transition-colors
                ${selectedLanguage === 'en'
                  ? 'border-green-600 bg-green-50 text-green-800'
                  : 'border-gray-300 text-gray-700'}`}
            >
              English
            </button>
          </div>
        </div>

        {submitError && (
          <p role="alert" className="mb-4 text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {t(submitError)}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white font-bold py-3 px-4 rounded-xl
            text-base sm:text-lg shadow-md hover:shadow-lg transition-all duration-200
            disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:from-emerald-600 disabled:hover:to-green-700
            flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {t('savingProfile')}
            </>
          ) : (
            t('saveProfile')
          )}
        </button>

        {onSkip && (
          <button
            onClick={onSkip}
            className="mt-3 w-full text-center text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            {t('continueWithoutProfile')}
          </button>
        )}
      </div>
    </div>
  );
};