export interface User {
  _id?: string;
  name: string;
  email: string;
  language?: string;
  createdAt?: Date;
}

export interface ImageAttachment {
  previewUrl: string;
  file: File;
}

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  text?: string;
  image?: ImageAttachment;
  audioUrl?: string;
  // For backend-loaded images later
  imageUrl?: string;
}


// Frontend-only mirror kept for reference; the backend drives ownership from the token's
// cognitoSub and never expects/returns userEmail.
export interface ChatSession {
  _id: string;
  title: string;
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

// Standard backend response envelope: every endpoint (success or error) returns
// { statusCode, message, data } — see backend utils/ApiResponse.js + middlewares/error.js.
export interface ApiEnvelope<T = unknown> {
  statusCode: number;
  message: string;
  data: T;
}

// The user returned by the backend after POST /auth/google. Ownership derives from the
// token's cognitoSub server-side — this object is for display only.
export interface BackendUser {
  _id?: string;
  name?: string;
  email?: string;
  cognitoSub?: string;
  createdAt?: string;
}

// Backend-issued session tokens (E1-S3). The access token is the ONLY credential the
// frontend uses for protected APIs (Authorization: Bearer). The refresh token is ignored
// for now — the backend does not expose a /auth/refresh endpoint yet.
export interface BackendAuthResponse {
  user: BackendUser;
  accessToken: string;
  refreshToken?: string;
}