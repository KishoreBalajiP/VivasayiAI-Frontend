import { Message } from '../types';
import { useTranslation } from 'react-i18next';
import { Sprout } from 'lucide-react';
import { DiagnosisCard } from './DiagnosisCard';

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isUser = message.sender === 'user';
  const { t } = useTranslation();

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
        className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm sm:max-w-[75%] ${
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
            className="mb-2 max-h-64 max-w-full rounded-xl object-cover"
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
    </div>
  );
};