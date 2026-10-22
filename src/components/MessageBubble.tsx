import { useState } from 'react';
import { Message, ChatSource } from '../types';
import { useTranslation } from 'react-i18next';
import { Sprout, MoreVertical, Trash2 } from 'lucide-react';
import { DiagnosisCard } from './DiagnosisCard';
import { PersistedChatImage } from './PersistedChatImage';

// Several retrieved chunks often come from the same document; list each file once.
const uniqueSourceNames = (sources: ChatSource[]): string[] => [
  ...new Set(
    sources
      .map((source) => (typeof source?.filename === 'string' ? source.filename.trim() : ''))
      .filter(Boolean)
  ),
];

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
          <Sprout aria-hidden="true" className="h-4 w-4 text-white" />
        </div>
      )}

      <div
        className={`min-w-0 max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm sm:max-w-[75%] ${
          isUser
            ? // Flat brand-700 token (white 5.5:1, the brand-100 timestamp 4.8:1); the copied
              // gradient started at emerald-600, where white text was only ~3.8:1.
              'rounded-tr-md bg-brand-700 text-white'
            : 'rounded-tl-md border border-surface-sunken bg-surface text-ink'
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

        {/* PERSISTED IMAGE TURN (reloaded from chat history). The stable message contract is
            imageId → ImageRecord; pixels stay private in S3. The bubble requests an authorized
            short-lived signed URL on demand and renders the ACTUAL image (loading chip while
            resolving; controlled "image unavailable" chip if the record/object is gone or the
            URL expired). No permanent URL, no raw S3 key, nothing persisted. */}
        {message.imageId && !message.image?.previewUrl && (
          <PersistedChatImage imageId={message.imageId} alt={t('uploadedImage')} />
        )}

        {/* TEXT (optional) */}
        {message.text && (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        )}

        {/* BACKEND IMAGE DIAGNOSIS (image-turn assistant response) */}
        {!isUser && message.diagnosis && (
          <DiagnosisCard diagnosis={message.diagnosis} />
        )}

        {/* KNOWLEDGE SOURCES (text answers): file names the backend grounded the answer in.
            Names only — the backend never returns chunk text or storage paths. */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-2 border-t border-surface-sunken pt-1.5 text-xs text-ink-subtle" data-testid="chat-sources">
            <span className="font-semibold">{t('chatSourcesLabel')}: </span>
            {uniqueSourceNames(message.sources).join(', ')}
          </div>
        )}

        {/* TIMESTAMP */}
        <div
          className={`mt-1.5 text-2xs ${isUser ? 'text-brand-100' : 'text-ink-subtle'}`}
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
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={t('messageMenu')}
            aria-expanded={menuOpen}
            title={t('messageMenu')}
            className="mt-1 flex h-7 w-7 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink-muted"
          >
            <MoreVertical aria-hidden="true" className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default"
                aria-label={t('closeMenu')}
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-xl border border-surface-sunken bg-surface py-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRequestDelete?.();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger-fg hover:bg-danger-bg focus-visible:outline-offset-[-2px]"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
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