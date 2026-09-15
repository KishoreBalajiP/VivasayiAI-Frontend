import { Message } from '../types';
import { useTranslation } from 'react-i18next';
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
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[80%] rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 shadow-md ${
          isUser
            ? 'bg-green-600 text-white'
            : 'bg-white text-gray-800 border-2 border-gray-200'
        }`}
      >
        {/* FRONTEND IMAGE PREVIEW (before backend process) */}
        {message.image?.previewUrl && (
          <img
            src={message.image.previewUrl}
            alt={t('uploadedImage')}
            className="rounded-xl sm:rounded-2xl mb-2 sm:mb-3 max-w-full h-auto"
          />
        )}

        {/* TEXT (optional) */}
        {message.text && (
          <p className="text-base sm:text-lg leading-relaxed whitespace-pre-wrap">
            {message.text}
          </p>
        )}

        {/* BACKEND IMAGE DIAGNOSIS (image-turn assistant response) */}
        {!isUser && message.diagnosis && (
          <DiagnosisCard diagnosis={message.diagnosis} />
        )}

        {/* TIMESTAMP */}
        <div
          className={`flex items-center gap-2 mt-1 sm:mt-2 text-xs sm:text-sm ${
            isUser ? 'text-green-100' : 'text-gray-500'
          }`}
        >
          <span>
            {timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>
    </div>
  );
};
