import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { createProfile } from '../api';
import { ApiClientError } from '../api/client';
import { tamilNaduDistricts } from '../config/tamilnaduDistricts';
import { Sprout, X } from 'lucide-react';
import { Button } from './ui';
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

  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusRef.current) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onSkip) onSkip();
        e.stopPropagation();
      }
    };
    const node = focusRef.current;
    node.addEventListener('keydown', handleKeyDown);
    return () => node.removeEventListener('keydown', handleKeyDown);
  }, [onSkip]);

  const [district, setDistrict] = useState('');
  const [crops, setCrops] = useState<string[]>([]);
  const [cropInput, setCropInput] = useState('');
  const [acresInput, setAcresInput] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(language);
  const [errors, setErrors] = useState<{ district?: string; crops?: string; acres?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setErrorFromKey = (field: 'district' | 'crops' | 'acres', key: string) => {
    setErrors(prev => ({ ...prev, [field]: key }));
  };

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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-brand-950/50 p-4 backdrop-blur-sm"
      onKeyDown={(e) => e.key !== 'Escape' || onSkip && onSkip()}
      autoFocus
      ref={focusRef}
    >
      <div className="bg-white rounded-3xl shadow-2xl p-5 sm:p-8 md:p-10 max-w-lg w-full mx-2 my-6">
        <div className="flex justify-center mb-4">
          <div className="bg-gradient-to-br from-brand-500 to-brand-700 p-4 sm:p-5 rounded-full shadow-lg">
            <Sprout aria-hidden="true" className="h-8 w-8 text-white sm:h-9 sm:w-9" />
          </div>
        </div>

        <h1 className="text-xl sm:text-2xl font-bold text-center text-ink mb-2">
          {t('profileHeading')}
        </h1>
        <p className="text-center text-ink-muted text-sm sm:text-base mb-6">
          {t('profileDescription')}
        </p>

        {/* DISTRICT */}
        <div className="mb-4">
          <label htmlFor="profile-district" className="block text-sm font-semibold text-ink mb-1">
            {t('district')}
          </label>
          <select
            id="profile-district"
            value={district}
            onChange={e => {
              setDistrict(e.target.value);
              setErrors(prev => ({ ...prev, district: undefined }));
            }}
            className="w-full p-3 border border-surface-border rounded-xl bg-white outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">{t('district')}…</option>
            {tamilNaduDistricts.map(d => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
          {errors.district && (
            <p role="alert" className="text-sm text-danger-fg mt-1">{t(errors.district)}</p>
          )}
        </div>

        {/* CROPS */}
        <div className="mb-4">
          <label htmlFor="profile-crop-input" className="block text-sm font-semibold text-ink mb-1">
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
              className="flex-1 p-3 border border-surface-border rounded-xl outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="button"
              onClick={addCrop}
              disabled={!cropInput.trim() || crops.length >= MAX_CROPS}
              className="px-4 py-3 bg-success-solid text-white rounded-xl font-semibold hover:bg-success-fg disabled:bg-surface-border disabled:cursor-not-allowed"
            >
              {t('add')}
            </button>
          </div>

          {crops.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {crops.map(crop => (
                <span
                  key={crop}
                  className="inline-flex items-center gap-1 bg-success-bg text-success-fg px-3 py-1 rounded-full text-sm"
                >
                  {crop}
                  <button
                    type="button"
                    onClick={() => setCrops(prev => prev.filter(c => c !== crop))}
                    aria-label={t('removeCrop', { crop })}
                    className="text-success-fg hover:text-danger-fg"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {errors.crops && (
            <p role="alert" className="text-sm text-danger-fg mt-1">{t(errors.crops)}</p>
          )}
        </div>

        {/* ACRES */}
        <div className="mb-4">
          <label htmlFor="profile-acres" className="block text-sm font-semibold text-ink mb-1">
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
            className="w-full p-3 border border-surface-border rounded-xl outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          {errors.acres && (
            <p role="alert" className="text-sm text-danger-fg mt-1">{t(errors.acres)}</p>
          )}
        </div>

        {/* LANGUAGE */}
        <div className="mb-6">
          <span className="block text-sm font-semibold text-ink mb-1">
            {t('preferredLanguage')}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => selectLanguage('ta')}
              className={`p-3 rounded-xl border-2 font-semibold transition-colors
                ${selectedLanguage === 'ta'
                  ? 'border-brand-500 bg-brand-50 text-brand-800'
                  : 'border-surface-border text-ink'}`}
            >
              தமிழ்
            </button>
            <button
              type="button"
              onClick={() => selectLanguage('en')}
              className={`p-3 rounded-xl border-2 font-semibold transition-colors
                ${selectedLanguage === 'en'
                  ? 'border-brand-500 bg-brand-50 text-brand-800'
                  : 'border-surface-border text-ink'}`}
            >
              English
            </button>
          </div>
        </div>

        {submitError && (
          <p role="alert" className="mb-4 text-center text-sm text-danger-fg bg-danger-bg border border-danger-border rounded-lg px-3 py-2">
            {t(submitError)}
          </p>
        )}

        {/* Shared primary Button (flat brand-700, 5.5:1 with white text; the old gradient started at
            a 3.8:1 emerald-600). While saving it is disabled, aria-busy and shows a spinner. */}
        <Button size="lg" onClick={handleSubmit} loading={isSubmitting} className="w-full sm:text-lg">
          {isSubmitting ? t('savingProfile') : t('saveProfile')}
        </Button>

        {onSkip && (
          <button
            onClick={onSkip}
            className="mt-3 w-full text-center text-sm font-medium text-ink-subtle hover:text-ink"
          >
            {t('continueWithoutProfile')}
          </button>
        )}
      </div>
    </div>
  );
};