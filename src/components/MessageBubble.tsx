import { Message } from '../types';
import { Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isUser = message.sender === 'user';
  const { t } = useTranslation();

  // Fix: Convert timestamp string to Date object if needed
  const timestamp =
    message.timestamp instanceof Date
      ? message.timestamp
      : new Date(message.timestamp);

  const playAudio = () => {
    if (message.audioUrl) {
      const audio = new Audio(message.audioUrl);
      audio.play();
    }
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[80%] rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 shadow-md ${
          isUser
            ? 'bg-green-600 text-white'
            : 'bg-white text-gray-800 border-2 border-gray-200'
        }`}
      >
        {message.imageUrl && (
          <img
            src={message.imageUrl}
            alt="Uploaded"
            className="rounded-xl sm:rounded-2xl mb-2 sm:mb-3 max-w-full h-auto"
          />
        )}

        <p className="text-base sm:text-lg leading-relaxed whitespace-pre-wrap">
          {message.text}
        </p>

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

          {message.audioUrl && (
            <button
              onClick={playAudio}
              className="ml-1 sm:ml-2 p-1 sm:p-2 hover:bg-opacity-20 hover:bg-black rounded-full transition-colors"
              title={t('playAudio')}
            >
              <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}; 
