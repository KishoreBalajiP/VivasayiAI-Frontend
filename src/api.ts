import { request } from './api/client';
import type {
  ChatSessionRecord,
  FarmProfile,
  FarmProfileInput,
  ImageAnalysisResult,
  SessionMessage,
  UploadResult,
  WeatherResponse,
} from './types';

// ── POST /chat ──────────────────────────────────────────────────────────────────────────
// Returns the AI reply AND persists the full exchange into the (new or existing) session
// server-side. The backend owns both the session and the AI turn — identity is NEVER sent.
// With `uploadId`, the backend runs the E3 image-diagnosis pipeline (S3 → vision → RAG →
// reasoning) instead of text chat, and the response carries an `image` block.

export interface ChatResult {
  chatId: string;
  messages: SessionMessage[];
  response: string;
  hasContext?: boolean;
  hasChatHistory?: boolean;
  sourceCount?: number;
  chatHistoryCount?: number;
  timestamp?: string;
  session?: ChatSessionRecord;
  // E3 image-turn fields — present only when the request carried an uploadId.
  uploadId?: string;
  image?: ImageAnalysisResult;
}

interface ChatMessageInput {
  message: string;
  language: 'en' | 'ta';
  chatId?: string;
  uploadId?: string;
}

export const sendChatMessage = async (
  message: string,
  language: string,
  chatId?: string | null,
  uploadId?: string
): Promise<ChatResult> => {
  const payload: ChatMessageInput = {
    message,
    language: language === 'ta' ? 'ta' : 'en',
  };
  if (chatId) payload.chatId = chatId;
  if (uploadId) payload.uploadId = uploadId;

  const envelope = await request<ChatResult>('/chat', { method: 'POST', body: payload });
  return envelope.data;
};

// ── POST /upload ─────────────────────────────────────────────────────────────────────────
// Multipart image upload (E3). The centralized client attaches the Bearer token and sends
// FormData as-is so the browser sets the multipart boundary — Content-Type is NEVER set
// manually. `image` is the exact multipart field the backend expects (multer.single).
// The backend validates size (≤5 MB), magic bytes and MIME, normalizes and stores the
// image, and returns a metadata-only response (no S3 keys/URLs are ever returned).

export const uploadImage = async (file: File): Promise<UploadResult> => {
  const form = new FormData();
  form.append('image', file);
  const envelope = await request<UploadResult>('/upload', { method: 'POST', body: form });
  return envelope.data;
};

// ── /chatsessions ───────────────────────────────────────────────────────────────────────
// Envelope is unwrapped here so components stay focused on UI/state and never touch
// {statusCode, message, data} directly.

// GET /chatsessions/list — the caller's sessions, newest-first (backend sorts by
// updatedAt desc). Ownership comes exclusively from the Bearer token.
export const listChatSessions = async (): Promise<ChatSessionRecord[]> => {
  const envelope = await request<{ sessions: ChatSessionRecord[] }>('/chatsessions/list');
  return envelope.data?.sessions ?? [];
};

// POST /chatsessions/new — only the optional title field is supported.
export const createChatSession = async (title?: string): Promise<ChatSessionRecord> => {
  const body: { title?: string } = {};
  if (title !== undefined && title !== '') body.title = title;
  const envelope = await request<{ session: ChatSessionRecord }>('/chatsessions/new', {
    method: 'POST',
    body,
  });
  return envelope.data.session;
};

// GET /chatsessions/:id — the caller's session (foreign/unowned → 404 by the backend).
export const getChatSession = async (id: string): Promise<ChatSessionRecord> => {
  const envelope = await request<{ session: ChatSessionRecord }>(`/chatsessions/${id}`);
  return envelope.data.session;
};

// POST /chatsessions/:id/message — appends a single raw message to the caller's session.
// (The chat UI sends through POST /chat via sendChatMessage so it also receives the AI
// response; this is the raw append endpoint for callers that only need persistence.)
export const sendChatSessionMessage = async (
  id: string,
  sender: 'user' | 'ai' | 'system',
  text: string
): Promise<ChatSessionRecord> => {
  const envelope = await request<{ session: ChatSessionRecord }>(
    `/chatsessions/${id}/message`,
    { method: 'POST', body: { sender, text } }
  );
  return envelope.data.session;
};

// DELETE /chatsessions/:id — removes the caller's session (foreign/unowned → 404).
export const deleteChatSession = async (id: string): Promise<void> => {
  await request(`/chatsessions/${id}`, { method: 'DELETE' });
};

// DELETE /chatsessions/clear/all — removes all of the caller's sessions.
export const clearAllChatSessions = async (): Promise<void> => {
  await request('/chatsessions/clear/all', { method: 'DELETE' });
};

// ── /profile ─────────────────────────────────────────────────────────────────────────────
// Farm profile (E2-S4). The backend derives ownership from the Bearer token and uses the
// profile when assembling AI context — the client never sends profile fields to /chat.

// GET /profile — the caller's profile. The backend returns 404 when NO profile exists;
// that 404 is how the app detects "onboarding required".
export const getProfile = async (): Promise<FarmProfile> => {
  const envelope = await request<{ profile: FarmProfile }>('/profile');
  return envelope.data.profile;
};

// POST /profile — upsert (create; also update when it already exists). Only the four
// supported fields are sent.
export const createProfile = async (input: FarmProfileInput): Promise<FarmProfile> => {
  const envelope = await request<{ profile: FarmProfile }>('/profile', {
    method: 'POST',
    body: input,
  });
  return envelope.data.profile;
};

// DELETE /profile — removes the caller's farm profile. Not surfaced in the UI this phase
// (the backend endpoint is exercised by a future settings/profile-management phase).
export const deleteProfile = async (): Promise<void> => {
  await request('/profile', { method: 'DELETE' });
};

// ── /weather ──────────────────────────────────────────────────────────────────────────────
// Live weather for the caller's farm district (E2-S1). The district comes from the loaded
// FarmProfile — the client never geolocates or guesses. The backend is cache-first and
// degrades to `status: "unknown"` (current: null, forecast: []) when the district is not
// resolvable or the provider is down — the UI renders a friendly "unavailable" message.

// GET /weather?district=<district-name> — current + 1-day forecast for the district.
export const getWeather = async (district: string): Promise<WeatherResponse> => {
  const envelope = await request<WeatherResponse>(
    `/weather?district=${encodeURIComponent(district)}`
  );
  return envelope.data;
};