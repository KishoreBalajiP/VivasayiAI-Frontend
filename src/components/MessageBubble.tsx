import { useState } from 'react';
import { Message } from '../types';
import { useTranslation } from 'react-i18next';
import { Sprout, MoreVertical, Trash2 } from 'lucide-react';
import { DiagnosisCard } from './DiagnosisCard';

interface MessageBubbleProps {
  message: Message;
  // When provided (user-sent messages), a contextual "⋯" menu enables message actions.
  // The backend cannot delete a single message (messageSchema has no ids) — the frontend
  // surfaces an honest dialog instead and offers the supported whole-chat deletion.
  onRequestDelete?: () => void;
}

export const MessageBubble = ({ message, onRequestDelete }: MessageBubbleProps) => {
  const isUser = message.sender === 'user';
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  const showMenu = Boolean(onRequestDelete) && isUser;

  // Convert timestamp string to Date object if needed
  const timestamp =
    message.timestamp instanceof Date
      ? message.timestamp
      : new Date(message.timestamp);

  return (
    <div className={`flex w-full items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* AI avatar (agent identity only — never data) */}
      {!isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-700 shadow-sm">
          <Sprout className="h-4 w-4 text-white" />
        </div>
      )}

      <div
        className={`min-w-0 max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm sm:max-w-[75%] ${
          isUser
            ? 'rounded-tr-md bg-gradient-to-br from-emerald-600 to-green-700 text-white'
            : 'rounded-tl-md border border-gray-100 bg-white text-gray-800'
        }`}
      >
        {/* FRONTEND IMAGE PREVIEW (before backend process) */}
        {message.image?.previewUrl && (
          <img
            src={message.image.previewUrl}
            alt={t('uploadedImage')}
            className="mb-2 max-h-64 w-full rounded-xl object-cover"
          />
        )}

        {/* TEXT (optional) */}
        {message.text && (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        )}

        {/* BACKEND IMAGE DIAGNOSIS (image-turn assistant response) */}
        {!isUser && message.diagnosis && (
          <DiagnosisCard diagnosis={message.diagnosis} />
        )}

        {/* TIMESTAMP */}
        <div
          className={`mt-1.5 text-[11px] ${
            isUser ? 'text-emerald-100' : 'text-gray-400'
          }`}
        >
          {timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>

      {/* CONTEXTUAL MENU (user messages only) */}
      {showMenu && (
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={t('messageMenu')}
            aria-expanded={menuOpen}
            title={t('messageMenu')}
            className="mt-1 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <button
                className="fixed inset-0 z-40 cursor-default"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-xl">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onRequestDelete?.();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('deleteMessage')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};