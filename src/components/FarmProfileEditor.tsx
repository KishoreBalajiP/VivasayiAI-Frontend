import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { tamilNaduDistricts } from '../config/tamilnaduDistricts';
import { Sprout, X } from 'lucide-react';
import type { FarmProfile, Language } from '../types';

interface Props {
  existingProfile?: FarmProfile | null;
  onComplete: (profile: FarmProfile) => void;
  onCancel?: () => void;
}

const MAX_CROPS = 20;
const MAX_CROP_LENGTH = 100;

export const FarmProfileEditor = ({ existingProfile, onComplete, onCancel }: Props) => {
  const { t } = useTranslation();
  const { language, setLanguage } = useAuth();

  const heading = t('profileHeading');
  const description = t('profileDescription');

  const [district, setDistrict] = useState('');
  const [crops, setCrops] = useState<string[]>([]);
  const [cropInput, setCropInput] = useState('');
  const [acresInput, setAcresInput] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(language);
  const [errors, setErrors] = useState<{ district?: string; crops?: string; acres?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // onComplete is part of the Props interface for future save integration; currently a placeholder
  void onComplete;

  useEffect(() => {
    if (existingProfile) {
      setDistrict(existingProfile.district);
      setCrops(existingProfile.crops);
      setAcresInput(String(existingProfile.acres));
      if (existingProfile.language) {
        setSelectedLanguage(existingProfile.language);
      }
    }
  }, [existingProfile]);

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
    if (crops.some(c => c.toLowerCase() === crop.toLowerCase())) {
      setCropInput('');
      return;
    }
    setCrops(prev => [...prev, crop]);
    setCropInput('');
  };

  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusRef.current) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onCancel) onCancel();
        e.stopPropagation();
      }
    };
    const node = focusRef.current;
    node.addEventListener('keydown', handleKeyDown);
    return () => node.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-brand-950/50 p-4 backdrop-blur-sm"
      onKeyDown={(e) => { if (e.key === 'Escape' && onCancel) onCancel(); }}
      autoFocus
      ref={focusRef}
    >
      <div className="bg-white rounded-3xl shadow-2xl p-5 sm:p-8 md:p-10 max-w-lg w-full mx-2 my-6">
        {onCancel && (
          <div className="mb-4 flex justify-end">
            <button
              onClick={onCancel}
              aria-label={t('cancel')}
              className="rounded-full p-1.5 text-ink-subtle hover:bg-surface-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="flex justify-center mb-4">
          <div className="bg-gradient-to-br from-brand-500 to-brand-700 p-4 sm:p-5 rounded-full shadow-lg">
            <Sprout aria-hidden="true" className="h-8 w-8 text-white sm:h-9 sm:w-9" />
          </div>
        </div>

        <h1 className="text-xl sm:text-2xl font-bold text-center text-ink mb-2">
          {heading}
        </h1>
        <p className="text-center text-ink-muted text-sm sm:text-base mb-6">
          {description}
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
              onClick={() => {
                setSelectedLanguage('ta');
                setLanguage('ta');
              }}
              className={`p-3 rounded-xl border-2 font-semibold transition-colors
                ${selectedLanguage === 'ta'
                  ? 'border-brand-500 bg-brand-50 text-brand-800'
                  : 'border-surface-border text-ink'}`}
            >
              தமிழ்
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedLanguage('en');
                setLanguage('en');
              }}
              className={`p-3 rounded-xl border-2 font-semibold transition-colors
                ${selectedLanguage === 'en'
                  ? 'border-brand-500 bg-brand-50 text-brand-800'
                  : 'border-surface-border text-ink'}`}
            >
              English
            </button>
          </div>
        </div>

        {/* SAVE / CANCEL */}
        {onCancel && (
          <div className="flex justify-end mt-4">
            <button
              onClick={onCancel}
              aria-label={t('cancel')}
              className="rounded-full p-1.5 text-ink-subtle hover:bg-surface-muted"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              disabled={isSubmitting}
              onClick={() => {
                setIsSubmitting(true);
                // save profile logic would go here
                setIsSubmitting(false);
              }}
              className="ml-3 rounded-full p-1.5 text-ink-subtle hover:bg-surface-muted"
            >
              {t('save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};