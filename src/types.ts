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


// Backend message shape (models/ChatSession messageSchema). Messages have NO Mongo _id.
// `text` is absent only for image-only turns (E3); `imageId` is the server-side link to
// the stored ImageRecord (keys ImageRecord, not a client URL).
export interface SessionMessage {
  sender: 'user' | 'ai' | 'system';
  text?: string;
  imageId?: string;
  timestamp: string;
}

// Backend ChatSession document as returned by GET /list, GET /:id, POST /new,
// POST /:id/message. Ownership derives from the token's cognitoSub server-side;
// `userEmail` is a server-set display/legacy field and is never sent by the client.
export interface ChatSessionRecord {
  _id: string;
  title: string;
  messages: SessionMessage[];
  createdAt: string;
  updatedAt: string;
  cognitoSub?: string;
  userEmail?: string | null;
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

// Backend farm profile document (POST / GET /profile). Server-owned identity fields
// (cognitoSub/userEmail/_id) are typed for accuracy but are NEVER submitted by the client.
export interface FarmProfile {
  _id?: string;
  cognitoSub?: string;
  userEmail?: string | null;
  district: string;
  crops: string[];
  acres: number;
  language?: 'en' | 'ta';
  createdAt?: string;
  updatedAt?: string;
}

// Exactly the fields the backend accepts on POST /profile (farmProfileBody).
export interface FarmProfileInput {
  district: string;
  crops: string[];
  acres: number;
  language: 'en' | 'ta';
}