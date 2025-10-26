import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Language } from '../types';
import { Globe } from 'lucide-react';

export const LanguageSelection = () => {
  const { t, i18n } = useTranslation();
  const { updateUserLanguage } = useAuth();

  const selectLanguage = async (lang: Language) => {
    await updateUserLanguage(lang);
    i18n.changeLanguage(lang);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 max-w-lg w-full">
        <div className="flex justify-center mb-8">
          <div className="bg-green-600 p-6 rounded-full">
            <Globe className="w-16 h-16 text-white" />
          </div>
        </div>

        <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-800 mb-10">
          {t('selectLanguage')}
        </h2>

        <div className="space-y-5">
          <button
            onClick={() => selectLanguage('en')}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-8 px-6 rounded-2xl transition-all duration-200 text-2xl shadow-lg hover:shadow-xl hover:scale-105 transform"
          >
            English
          </button>

          <button
            onClick={() => selectLanguage('ta')}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-8 px-6 rounded-2xl transition-all duration-200 text-2xl shadow-lg hover:shadow-xl hover:scale-105 transform"
          >
            தமிழ் (Tamil)
          </button>
        </div>

        <p className="text-center text-gray-600 mt-8 text-lg">
          {t('askQuestion')}
        </p>
      </div>
    </div>
  );
};
