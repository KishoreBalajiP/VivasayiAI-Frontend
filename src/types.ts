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
  // Client-detected format (sniffed from the file's magic bytes) so the preview chip can show
  // an honest "JPEG · 240 KB" label even when the browser reports no/odd MIME type. Null when
  // the file was accepted on the browser's `image/*` MIME alone (the backend re-verifies the
  // real bytes); the preview chip falls back to a neutral "IMG" label in that case.
  detectedType?: 'jpeg' | 'png' | 'webp' | null;
}

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  text?: string;
  image?: ImageAttachment;
  // Persisted image-turn link (for history-loaded messages). Copy of the backend
  // SessionMessage.imageId (`img_<uuid>` uploadId → ImageRecord). When set WITHOUT
  // `image` (no local preview), the bubble requests an authorized short-lived signed URL via
  // GET /upload/:uploadId/view and renders the ACTUAL private-S3 image on demand — the URL
  // is never persisted; imageId remains the stable source of truth.
  imageId?: string;
  // Backend-returned image diagnosis block (POST /chat image path). Present only on AI
  // messages produced from an image turn. Shape mirrors the backend response exactly.
  diagnosis?: ImageAnalysisResult;
}

// ── IMAGE / DIAGNOSIS TYPES — mirror of the backend E3 upload + chat-image pipeline ──────
// (services/upload.service.js receiveUpload result, models/ImageRecord.js processed/vision
// schemas, services/chatImage.service.js response.image). Only fields the backend actually
// returns are typed; nothing here is fabricated.

// Normalized image metadata for the stored (private-S3) image.
export interface ProcessedImageInfo {
  mediaType: string;
  size: number;
  width: number;
  height: number;
}

// `uploadImage` (presigned transport) → data returned by POST /upload/:uploadId/complete:
// synchronously-validated, stored upload metadata. `status` is the ImageRecord pipeline
// state ("stored" at response time; analysis happens later via /chat).
export interface UploadResult {
  uploadId: string;
  mediaType: string;
  extension: string;
  size: number;
  status: string;
  processed: ProcessedImageInfo;
}

// One item of the vision model's structured issue observation.
export interface VisionIssue {
  name: string | null;
  type: 'pest' | 'disease' | 'deficiency' | 'environmental' | 'other';
  confidence: 'high' | 'medium' | 'low' | 'uncertain';
  evidence: string[];
}

// The normalized vision observation stored on ImageRecord and returned with the /chat
// image response. `uncertain` is the authoritative non-definitive signal.
export interface VisionResult {
  crop: string | null;
  symptoms: string[];
  likelyIssues: VisionIssue[];
  confidence: 'high' | 'medium' | 'low' | 'unclear';
  uncertain: boolean;
  summary: string | null;
}

// POST /chat image path → the `image` block of the response.
export interface ImageAnalysisResult {
  status: string;
  processed: ProcessedImageInfo;
  vision: VisionResult;
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

// WEATHER TYPES — mirror of the backend GET /weather?district=<name> response
// (services/weather.service.js buildResponse/unknown path). Only fields the backend
// actually returns are typed — no humidity/soilMoisture/farmingAdvice/icon are invented.

export interface WeatherCurrent {
  temperature: number;
  windspeed: number;
  weatherCode: number;
  isDay: number;
  summary: string;
}

export interface WeatherForecastDay {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  precipitation: number;
  summary: string;
}

// Normal success shape (cache hit or fresh). current/forecast can be null/[] when the
// district is unbeknownst to the provider (status: "unknown").
export interface WeatherResponse {
  district: string;
  current: WeatherCurrent | null;
  forecast: WeatherForecastDay[];
  source: string;
  cached: boolean;
  ageSeconds: number;
  freshness?: 'fresh' | 'stale';
  status?: 'unknown';
  note?: string;
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