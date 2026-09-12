import { request } from './api/client';
import type { ApiEnvelope } from './types';

export interface ChatResult {
  chatId: string;
  messages: Array<{
    sender: string;
    text: string;
    timestamp?: string;
    imageId?: string;
  }>;
  response: string;
  hasContext?: boolean;
  hasChatHistory?: boolean;
  sourceCount?: number;
  timestamp?: string;
  session?: unknown;
}

// Owned by the authenticated backend token — identity is NEVER sent in the body.
interface ChatMessageInput {
  message: string;
  language: 'en' | 'ta';
  chatId?: string;
}

export const sendChatMessage = async (
  message: string,
  language: string,
  chatId?: string | null
): Promise<ApiEnvelope<ChatResult>> => {
  const payload: ChatMessageInput = {
    message,
    language: language === 'ta' ? 'ta' : 'en',
  };
  if (chatId) payload.chatId = chatId;

  return request<ChatResult>('/chat', { method: 'POST', body: payload });
};