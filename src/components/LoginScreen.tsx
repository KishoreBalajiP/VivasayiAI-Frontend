import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Sprout } from 'lucide-react';
import { useState, useEffect } from 'react';
import { FarmerWeatherService } from '../services/farmerWeatherService';
import { WeatherData } from '../types';

export const LoginScreen = () => {
  const { t } = useTranslation(); // Removed unused i18n
  const { login, language } = useAuth();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(true);

  useEffect(() => {
    loadWeather();
  }, []);

  const loadWeather = async () => {
    try {
      setLoadingWeather(true);
      const location = await FarmerWeatherService.getFarmerLocation();
      const weatherData = await FarmerWeatherService.getFarmerWeather(
        location.lat, 
        location.lon, 
        location.district, // Use district instead of name
        language as 'en' | 'ta'
      );
      setWeather(weatherData);
    } catch (error) {
      console.error('Failed to load weather:', error);
    } finally {
      setLoadingWeather(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 max-w-4xl w-full">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Weather Section */}
          <div className="lg:w-2/5 bg-gradient-to-br from-blue-50 to-green-50 rounded-2xl p-6 border border-green-200">
            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">
              {language === 'en' ? "Today's Weather for Farmers" : "இன்றைய விவசாய வானிலை"}
            </h3>
            
            {loadingWeather ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
                <p className="text-gray-600 mt-2">
                  {language === 'en' ? "Loading weather..." : "வானிலை ஏற்றுகிறது..."}
                </p>
              </div>
            ) : weather ? (
              <div className="space-y-4">
                {/* Current Weather */}
                <div className="text-center">
                  <div className="text-4xl mb-2">{weather.icon}</div>
                  <div className="text-2xl font-bold text-gray-800">{weather.temperature}°C</div>
                  <div className="text-gray-600">{weather.description}</div>
                  <div className="text-sm text-gray-500 mt-1">{weather.location}</div>
                </div>

                {/* Weather Details */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-white rounded-lg p-3 text-center">
                    <div className="text-gray-600">💧 {language === 'en' ? 'Rain' : 'மழை'}</div>
                    <div className="font-semibold">{weather.rainfall}mm</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <div className="text-gray-600">💨 {language === 'en' ? 'Wind' : 'காற்று'}</div>
                    <div className="font-semibold">{weather.windSpeed} km/h</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <div className="text-gray-600">🌱 {language === 'en' ? 'Soil' : 'மண்'}</div>
                    <div className="font-semibold">
                      {language === 'en' ? weather.soilMoisture : 
                       weather.soilMoisture === 'Dry' ? 'உலர்' :
                       weather.soilMoisture === 'Wet' ? 'ஈரம்' : 'சாதாரணம்'}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <div className="text-gray-600">💦 {language === 'en' ? 'Humidity' : 'ஈரப்பதம்'}</div>
                    <div className="font-semibold">{weather.humidity}%</div>
                  </div>
                </div>

                {/* Farming Advice */}
                <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                  <div className="font-semibold text-yellow-800 text-sm mb-2">
                    {language === 'en' ? "Farming Advice" : "விவசாய ஆலோசனை"}
                  </div>
                  <ul className="text-xs text-yellow-700 space-y-1">
                    {weather.farmingAdvice.slice(0, 2).map((advice, index) => (
                      <li key={index}>• {advice}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                {language === 'en' ? "Weather unavailable" : "வானிலை தகவல் இல்லை"}
              </div>
            )}
          </div>

          {/* Login Section */}
          <div className="lg:w-3/5 flex flex-col justify-center">
            <div className="flex justify-center mb-6">
              <div className="bg-green-600 p-6 rounded-full">
                <Sprout className="w-16 h-16 text-white" />
              </div>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-3 text-center">
              {t('welcome')}
            </h1>

            <p className="text-gray-600 mb-8 text-lg text-center">
              {t('askQuestion')}
            </p>

            <button
              onClick={login}
              className="w-full bg-white border-2 border-gray-300 hover:border-green-600 hover:bg-green-50 text-gray-800 font-semibold py-5 px-6 rounded-2xl transition-all duration-200 flex items-center justify-center gap-3 text-lg shadow-md hover:shadow-lg"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {t('loginWithGoogle')}
            </button>

            {/* Weather Note */}
            <div className="mt-6 text-center text-sm text-gray-500">
              {language === 'en' 
                ? "Get personalized farming advice based on your local weather"
                : "உங்கள் பிராந்திய வானிலை அடிப்படையில் தனிப்பட்ட விவசாய ஆலோசனைகளைப் பெறுங்கள்"
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};