import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Language } from '../types';
import { Languages } from 'lucide-react';

export const LanguageSelection = () => {
  const { t, i18n } = useTranslation();
  const { updateUserLanguage } = useAuth();

  const selectLanguage = async (lang: Language) => {
    await updateUserLanguage(lang);
    i18n.changeLanguage(lang);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 md:p-12 max-w-lg w-full mx-2">
        <div className="flex justify-center mb-6 sm:mb-8">
          <div className="bg-green-600 p-4 sm:p-5 md:p-6 rounded-full">
            <Languages className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 text-white" />
          </div>
        </div>

        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center text-gray-800 mb-6 sm:mb-8 md:mb-10">
          {t('selectLanguage')}
        </h2>

        <div className="space-y-4 sm:space-y-5">
          <button
            onClick={() => selectLanguage('en')}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 sm:py-6 md:py-8 px-4 sm:px-6 rounded-2xl transition-all duration-200 text-lg sm:text-xl md:text-2xl shadow-lg hover:shadow-xl hover:scale-105 transform flex items-center justify-center gap-3"
          >
            <span className="text-base sm:text-lg">🇺🇸</span>
            English
          </button>

          <button
            onClick={() => selectLanguage('ta')}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 sm:py-6 md:py-8 px-4 sm:px-6 rounded-2xl transition-all duration-200 text-lg sm:text-xl md:text-2xl shadow-lg hover:shadow-xl hover:scale-105 transform flex items-center justify-center gap-3"
          >
            <span className="text-base sm:text-lg">🇮🇳</span>
            தமிழ் (Tamil)
          </button>
        </div>

        <p className="text-center text-gray-600 mt-6 sm:mt-8 text-base sm:text-lg">
          {t('askQuestion')}
        </p>
      </div>
    </div>
  );
};