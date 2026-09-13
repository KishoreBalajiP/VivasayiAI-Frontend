import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export const LoginScreen = () => {
  const { t } = useTranslation();
  const { login, isAuthenticating, authError } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-green-100 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 md:p-8 lg:p-12 max-w-4xl w-full mx-2">
        <div className="flex flex-col justify-center gap-4 sm:gap-6 md:gap-8">

          {/* Login Section */}
          <div className="w-full flex flex-col justify-center">
            <div className="flex justify-center mb-4 sm:mb-6">
              <div className="bg-green-600 p-5 sm:p-6 md:p-7 rounded-full shadow-lg">
                <span className="text-4xl sm:text-5xl md:text-6xl">🌾</span>
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 mb-2 sm:mb-3 text-center">
              {t('welcome')}
            </h1>

            <p className="text-gray-600 mb-6 sm:mb-8 text-base sm:text-lg text-center">
              {t('askQuestion')}
            </p>

            {authError && (
              <p
                role="alert"
                className="mb-4 text-center text-sm sm:text-base text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              >
                {t(authError)}
              </p>
            )}

            <button
              onClick={login}
              disabled={isAuthenticating}
              className="w-full bg-white border-2 border-gray-300 hover:border-green-600 hover:bg-green-50 text-gray-800 font-semibold py-3 sm:py-4 md:py-5 px-4 sm:px-6 rounded-xl sm:rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 sm:gap-3 text-base sm:text-lg shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:border-gray-300 disabled:hover:bg-white"
            >
              {isAuthenticating ? (
                <>
                  <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                  {t('signingIn')}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {t('loginWithGoogle')}
                </>
              )}
            </button>

            <div className="mt-4 sm:mt-6 text-center text-xs sm:text-sm text-gray-500">
              {t('personalizedWeatherAdvice')}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
