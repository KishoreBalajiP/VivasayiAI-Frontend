export interface User {
  _id?: string;
  name: string;
  email: string;
  language?: string;
  createdAt?: Date;
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  audioUrl?: string;
  imageUrl?: string;
}

export interface ChatSession {
  _id: string;
  title: string;
  userEmail: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export type Language = 'en' | 'ta';

// WEATHER TYPES - Farmer Friendly
export interface WeatherData {
  temperature: number;
  feelsLike: number;
  description: string; // Simple farmer terms
  location: string;
  humidity: number;
  windSpeed: number;
  rainfall: number;
  soilMoisture: string; // Dry/Normal/Wet
  farmingAdvice: string[];
  icon: string;
  forecast?: DailyForecast[];
}

export interface DailyForecast {
  date: string;
  day: string;
  maxTemp: number;
  minTemp: number;
  description: string;
  rainfall: number;
  farmingTip: string;
  icon: string;
}