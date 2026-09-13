import { request } from './api/client';
import type { ChatSessionRecord, SessionMessage } from './types';

// ── POST /chat ──────────────────────────────────────────────────────────────────────────
// Returns the AI reply AND persists the full exchange into the (new or existing) session
// server-side. The backend owns both the session and the AI turn — identity is NEVER sent.

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
}

interface ChatMessageInput {
  message: string;
  language: 'en' | 'ta';
  chatId?: string;
}

export const sendChatMessage = async (
  message: string,
  language: string,
  chatId?: string | null
): Promise<ChatResult> => {
  const payload: ChatMessageInput = {
    message,
    language: language === 'ta' ? 'ta' : 'en',
  };
  if (chatId) payload.chatId = chatId;

  const envelope = await request<ChatResult>('/chat', { method: 'POST', body: payload });
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