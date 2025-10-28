import { WeatherData, DailyForecast } from '../types';
import { tamilNaduDistricts, defaultDistrict } from '../config/tamilnaduDistricts';

// Add proper interfaces
interface District {
  name: string;
  lat: number;
  lon: number;
  type: string;
}

interface FarmerLocation {
  lat: number;
  lon: number;
  district: string;
  name: string;
  isInTamilNadu: boolean;
}

export class FarmerWeatherService {
  // Check if location is within Tamil Nadu bounds
  private static isInTamilNadu(lat: number, lon: number): boolean {
    // Tamil Nadu approximate boundaries
    const tnBounds = {
      north: 13.5,   // Northernmost point
      south: 8.0,    // Southernmost point  
      west: 76.0,    // Westernmost point
      east: 80.5     // Easternmost point
    };
    
    return lat >= tnBounds.south && lat <= tnBounds.north && 
           lon >= tnBounds.west && lon <= tnBounds.east;
  }

  // Get user location with smart detection
  static async getFarmerLocation(): Promise<FarmerLocation> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ 
          lat: defaultDistrict.lat, 
          lon: defaultDistrict.lon, 
          district: defaultDistrict.name,
          name: defaultDistrict.name,
          isInTamilNadu: true
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude;
          const userLon = position.coords.longitude;
          const isInTN = this.isInTamilNadu(userLat, userLon);
          
          if (isInTN) {
            // User is in Tamil Nadu - find closest district
            const district = this.findClosestDistrict(userLat, userLon);
            resolve({ 
              lat: userLat, 
              lon: userLon, 
              district: district.name,
              name: district.name,
              isInTamilNadu: true
            });
          } else {
            // User is outside Tamil Nadu - show demo with major TN district
            const demoDistrict = this.getDemoDistrict();
            resolve({
              lat: demoDistrict.lat,
              lon: demoDistrict.lon,
              district: demoDistrict.name,
              name: `${demoDistrict.name} (Demo)`,
              isInTamilNadu: false
            });
          }
        },
        () => {
          // Geolocation failed - use default Tamil Nadu location
          resolve({ 
            lat: defaultDistrict.lat, 
            lon: defaultDistrict.lon, 
            district: defaultDistrict.name,
            name: defaultDistrict.name,
            isInTamilNadu: true
          });
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  }

  // Get a rotating demo district for variety
  private static getDemoDistrict(): District {
    const demoDistricts = [
      tamilNaduDistricts[0],  // Chennai
      tamilNaduDistricts[1],  // Coimbatore  
      tamilNaduDistricts[2],  // Madurai
      tamilNaduDistricts[3]   // Trichy
    ];
    
    // Rotate through demo districts based on day of week
    const dayOfWeek = new Date().getDay();
    return demoDistricts[dayOfWeek % demoDistricts.length];
  }

  // Get complete farmer weather report
  static async getFarmerWeather(location: FarmerLocation, language: 'en' | 'ta' = 'en'): Promise<WeatherData> {
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,rain&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum&timezone=auto&forecast_days=7`
      );

      if (!response.ok) throw new Error('Weather API failed');
      const data = await response.json();

      return this.formatFarmerWeather(data, location, language);
    } catch (error) {
      console.error('Weather fetch error:', error);
      return this.getFallbackWeather(location, language);
    }
  }

  // Format weather data for farmers
  private static formatFarmerWeather(data: any, location: FarmerLocation, language: 'en' | 'ta'): WeatherData {
    const current = data.current;
    const daily = data.daily;
    
    const weatherCode = current.weather_code;
    const rainfall = current.rain || 0;

    // Add location context to description
    let locationName = location.district;
    if (!location.isInTamilNadu) {
      locationName = language === 'en' 
        ? `Demo: ${location.district}, Tamil Nadu`
        : `டெமோ: ${location.district}, தமிழ்நாடு`;
    }

    return {
      temperature: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.temperature_2m + (current.relative_humidity_2m / 100) * 2),
      description: this.getFarmerDescription(weatherCode, language),
      location: locationName,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      rainfall: rainfall,
      soilMoisture: this.getSoilMoisture(rainfall, current.relative_humidity_2m),
      farmingAdvice: this.getFarmingAdvice(weatherCode, rainfall, language, location.isInTamilNadu),
      icon: this.getFarmerIcon(weatherCode),
      forecast: this.formatFarmerForecast(daily, language, location.isInTamilNadu)
    };
  }

  // Simple farmer descriptions
  private static getFarmerDescription(code: number, language: 'en' | 'ta'): string {
    const descriptions: Record<string, Record<number, string>> = {
      en: {
        0: 'Clear sunny day',
        1: 'Mostly sunny',
        2: 'Partly cloudy',
        3: 'Cloudy sky',
        45: 'Foggy morning',
        48: 'Heavy fog',
        51: 'Light drizzle',
        53: 'Drizzling rain',
        55: 'Heavy drizzle',
        61: 'Light rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        80: 'Rain showers',
        81: 'Heavy rain showers',
        82: 'Very heavy rain',
        95: 'Thunderstorm',
        96: 'Thunder with hail'
      },
      ta: {
        0: 'தெளிவான வெயில்',
        1: 'பெரும்பாலும் வெயில்',
        2: 'கொஞ்சம் மேகம்',
        3: 'மேகமூட்டம்',
        45: 'மூடுபனி காலை',
        48: 'கனமான மூடுபனி',
        51: 'இலேசான தூறல்',
        53: 'தூறல் மழை',
        55: 'கனத்த தூறல்',
        61: 'இலேசான மழை',
        63: 'மிதமான மழை',
        65: 'கனமான மழை',
        80: 'மழைத் தூறல்',
        81: 'கனமான மழைத் தூறல்',
        82: 'மிகக் கனமான மழை',
        95: 'இடிமழை',
        96: 'ஆலத்துடன் கூடிய இடி'
      }
    };

    return descriptions[language][code] || descriptions[language][0];
  }

  // Soil moisture status
  private static getSoilMoisture(rainfall: number, humidity: number): string {
    if (rainfall > 10) return 'Very Wet';
    if (rainfall > 5) return 'Wet';
    if (rainfall > 2) return 'Moist';
    if (humidity > 70) return 'Normal';
    return 'Dry';
  }

  // Farming advice based on weather
  private static getFarmingAdvice(code: number, rainfall: number, language: 'en' | 'ta', isInTamilNadu: boolean): string[] {
    const baseAdvice: Record<string, string[]> = {
      en: [
        rainfall > 5 ? 'Good day for planting' : 'Suitable for irrigation',
        code >= 61 ? 'Avoid pesticide spraying' : 'Good for field work',
        rainfall > 10 ? 'Check drainage in fields' : 'Normal farming activities',
        'Monitor crop health regularly'
      ],
      ta: [
        rainfall > 5 ? 'நடவுக்கு ஏற்ற நாள்' : 'பாசனத்திற்கு ஏற்றது',
        code >= 61 ? 'பூச்சிக்கொல்லி தெளிப்பு தவிர்க்க' : 'வயல் வேலைக்கு ஏற்றது',
        rainfall > 10 ? 'வயல் வடிகால் சரிபார்க்க' : 'சாதாரண விவசாய பணிகள்',
        'பயிர் ஆரோக்கியத்தை கண்காணிக்க'
      ]
    };

    const advice = [...baseAdvice[language]];

    // Add demo notice if outside Tamil Nadu
    if (!isInTamilNadu) {
      const demoNotice = language === 'en' 
        ? '📍 Showing Tamil Nadu weather for demo'
        : '📍 டெமோவிற்கு தமிழ்நாடு வானிலை காட்டப்படுகிறது';
      advice.unshift(demoNotice);
    }

    return advice;
  }

  // Simple icons for farmers
  private static getFarmerIcon(code: number): string {
    const icons: Record<number, string> = {
      0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
      45: '🌫️', 48: '🌫️',
      51: '🌦️', 53: '🌦️', 55: '🌦️',
      61: '🌧️', 63: '🌧️', 65: '🌧️',
      80: '🌦️', 81: '🌧️', 82: '⛈️',
      95: '⛈️', 96: '⛈️'
    };
    return icons[code] || '☀️';
  }

  // Format 7-day forecast for farmers
  private static formatFarmerForecast(daily: any, language: 'en' | 'ta', isInTamilNadu: boolean): DailyForecast[] {
    const days = language === 'en' 
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['ஞாய', 'திங்', 'செவ்', 'புத', 'விய', 'வெள்', 'சனி'];

    return daily.time.slice(0, 7).map((date: string, index: number) => {
      const day = new Date(date).getDay();
      const weatherCode = daily.weather_code[index];
      const rainfall = daily.precipitation_sum[index] || 0;

      let farmingTip = this.getDailyFarmingTip(weatherCode, rainfall, language);
      
      // Add demo context to first forecast item
      if (index === 0 && !isInTamilNadu) {
        farmingTip = language === 'en' 
          ? 'Tamil Nadu farming advice'
          : 'தமிழ்நாடு விவசாய ஆலோசனை';
      }

      return {
        date,
        day: days[day],
        maxTemp: Math.round(daily.temperature_2m_max[index]),
        minTemp: Math.round(daily.temperature_2m_min[index]),
        description: this.getFarmerDescription(weatherCode, language),
        rainfall: rainfall,
        farmingTip: farmingTip,
        icon: this.getFarmerIcon(weatherCode)
      };
    });
  }

  // Daily farming tips
  private static getDailyFarmingTip(code: number, rainfall: number, language: 'en' | 'ta'): string {
    const tips: Record<string, Record<string, string>> = {
      en: {
        sunny: rainfall > 5 ? 'Good for sowing' : 'Water plants morning',
        rainy: 'Check field drainage',
        cloudy: 'Good for transplanting',
        storm: 'Protect crops from wind',
        fog: 'Delay pesticide spraying'
      },
      ta: {
        sunny: rainfall > 5 ? 'விதைக்க ஏற்றது' : 'காலையில் நீர்ப்பாசனம்',
        rainy: 'வயல் வடிகால் சரிபார்க்க',
        cloudy: 'நடவுக்கு ஏற்றது',
        storm: 'காற்றிலிருந்து பயிர்களை பாதுகாக்க',
        fog: 'பூச்சிக்கொல்லி தெளிப்பை தாமதிக்க'
      }
    };

    if (code >= 95) return tips[language].storm;
    if (code >= 61) return tips[language].rainy;
    if (code >= 45) return tips[language].fog;
    if (code >= 2) return tips[language].cloudy;
    return tips[language].sunny;
  }

  // Find closest Tamil Nadu district
  private static findClosestDistrict(lat: number, lon: number): District {
    let closestDistrict = defaultDistrict;
    let minDistance = Number.MAX_VALUE;

    tamilNaduDistricts.forEach(district => {
      const distance = Math.sqrt(Math.pow(district.lat - lat, 2) + Math.pow(district.lon - lon, 2));
      if (distance < minDistance) {
        minDistance = distance;
        closestDistrict = district;
      }
    });

    return closestDistrict;
  }

  // Fallback weather data
  private static getFallbackWeather(location: FarmerLocation, language: 'en' | 'ta'): WeatherData {
    let locationName = location.district;
    if (!location.isInTamilNadu) {
      locationName = language === 'en' 
        ? `Demo: ${location.district}, Tamil Nadu`
        : `டெமோ: ${location.district}, தமிழ்நாடு`;
    }

    const farmingAdvice = [
      language === 'en' ? 'Good day for farming activities' : 'விவசாய பணிகளுக்கு ஏற்ற நாள்',
      language === 'en' ? 'Water plants in morning' : 'காலையில் நீர்ப்பாசனம் செய்ய'
    ];

    if (!location.isInTamilNadu) {
      farmingAdvice.unshift(
        language === 'en' 
          ? '📍 Showing Tamil Nadu weather for demo'
          : '📍 டெமோவிற்கு தமிழ்நாடு வானிலை காட்டப்படுகிறது'
      );
    }

    return {
      temperature: 28,
      feelsLike: 32,
      description: language === 'en' ? 'Clear sunny day' : 'தெளிவான வெயில்',
      location: locationName,
      humidity: 65,
      windSpeed: 12,
      rainfall: 0,
      soilMoisture: 'Normal',
      farmingAdvice: farmingAdvice,
      icon: '☀️',
      forecast: []
    };
  }
}