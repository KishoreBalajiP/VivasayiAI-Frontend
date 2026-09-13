import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Message, ImageAttachment, SessionMessage } from '../types';
import { Send, Image as ImageIcon, LogOut, Languages, Loader2 } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { sendChatMessage, getChatSession } from '../api';
import { ApiClientError } from '../api/client';
import VoiceRecorder from './VoiceRecorder';

interface Props {
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  // Reports each send; `true` means a brand-new session was created by this message
  // (the sidebar should refresh its list only then).
  onMessageSent?: (createdNew: boolean) => void;
  onOpenSidebar?: () => void;
}

// Backend messages carry no id and use ISO timestamps; the UI model needs a stable React
// key. The index-based id is a rendering key only — no backend message fields are fabricated.
const toViewMessages = (msgs: SessionMessage[]): Message[] =>
  msgs.map((m, i) => ({
    id: `srv-${i}`,
    sender: m.sender === 'user' ? 'user' : 'ai',
    timestamp: new Date(m.timestamp),
    text: m.text,
    // imageId (E3 image-turn link) is preserved in the SessionMessage type layer; the UI
    // renders these as timestamp-only turns until image UI ships in a later phase.
  }));

export const ChatInterface = ({
  activeChatId,
  setActiveChatId,
  onMessageSent,
  onOpenSidebar,
}: Props) => {
  const { t, i18n } = useTranslation();
  const { user, logout, language, setLanguage } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<ImageAttachment | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ✅ AUTO SCROLL ONLY MESSAGE AREA
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => setInput(''), [activeChatId]);

  useEffect(() => {
    setHistoryError(null);
    if (!activeChatId) {
      setMessages([]);
      setIsLoadingHistory(false);
      return;
    }

    setIsLoadingHistory(true);
    (async () => {
      try {
        // Routed through the authenticated client so the Backend access token is attached.
        const session = await getChatSession(activeChatId);
        setMessages(toViewMessages(session.messages));
      } catch (err) {
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 429)) {
          return; // 401 → auth layer routes to login; 429 silent here is acceptable as the
          // request is retried on next session switch, and the rate-limit toasts apply to
          // user-initiated actions.
        }
        if (err instanceof ApiClientError && err.status === 404) {
          // Session unavailable (deleted/unowned): safe empty state, no raw details.
          setMessages([]);
          return;
        }
        // Network/server failure: user-visible, existing friendly error.
        setHistoryError('serverError');
      } finally {
        setIsLoadingHistory(false);
      }
    })();
  }, [activeChatId]);

  const handleSend = async () => {
    if (!input.trim() && !selectedImage) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      timestamp: new Date(),
      text: input || undefined,
      image: selectedImage || undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSelectedImage(null);
    setIsProcessing(true);

    try {
      // Owned by the authenticated token — no userEmail/cognitoSub/userId is sent.
      const res = await sendChatMessage(
        userMessage.text || '',
        language,
        activeChatId
      );

      const createdNew = !activeChatId && Boolean(res.chatId);
      if (createdNew) {
        setActiveChatId(res.chatId);
      }

      setMessages(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          text: res.response || 'No response received.',
          sender: 'ai',
          timestamp: new Date(),
        },
      ]);

      onMessageSent?.(createdNew);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          text: 'Server error. Please try again.',
          sender: 'ai',
          timestamp: new Date(),
        },
      ]);
    }

    setIsProcessing(false);
  };

  const toggleLanguage = () => {
    const newLang = language === 'en' ? 'ta' : 'en';
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
    setShowLangMenu(false);
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-green-50 to-white overflow-hidden">

      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-green-600 text-white px-3 py-2 shadow-lg">
        <div className="flex items-center justify-between max-w-4xl mx-auto">

          <div className="flex items-center gap-2 overflow-hidden">
            <button
              onClick={onOpenSidebar}
              className="lg:hidden p-2 hover:bg-green-700 rounded-lg"
            >
              ☰
            </button>

            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-white rounded-full flex items-center justify-center">
              <span className="text-xl sm:text-2xl">🌾</span>
            </div>

            <div className="overflow-hidden">
              <h1 className="text-sm sm:text-lg font-bold truncate">
                {t('appTitle')}
              </h1>
              <p className="hidden sm:block text-xs text-green-100 truncate">
                {user?.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="p-2 hover:bg-green-700 rounded-lg"
            >
              <Languages className="w-5 h-5" />
            </button>

            <button
              onClick={logout}
              className="p-2 hover:bg-green-700 rounded-lg"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showLangMenu && (
          <div className="max-w-4xl mx-auto mt-2 bg-white rounded-xl shadow overflow-hidden">
            <button
              onClick={toggleLanguage}
              className="w-full p-3 text-left text-gray-800 hover:bg-green-50 font-semibold"
            >
              {language === 'en' ? 'தமிழ் (Tamil)' : 'English'}
            </button>
          </div>
        )}
      </header>

      {/* CHAT BODY */}
      <main className="flex-1 overflow-y-auto px-3 py-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((m, i) => (
            <MessageBubble key={`${m.id}-${i}`} message={m} />
          ))}

          {isLoadingHistory && (
            <div className="flex items-center gap-2 text-gray-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t('processing')}</span>
            </div>
          )}

          {historyError && (
            <MessageBubble
              message={{
                id: 'history-error',
                sender: 'ai',
                timestamp: new Date(),
                text: t(historyError),
              }}
            />
          )}

          {isProcessing && (
            <div className="flex items-center gap-2 text-gray-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t('processing')}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* INPUT BAR */}
      <footer className="bg-white border-t border-gray-200 px-3 py-3">
        <div className="max-w-4xl mx-auto">

          {/* IMAGE PREVIEW (ChatGPT-style) */}
          {selectedImage && (
            <div className="mb-2 relative w-fit">
              <img
                src={selectedImage.previewUrl}
                alt="preview"
                className="max-w-[160px] rounded-xl border"
              />
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute -top-2 -right-2 bg-black text-white rounded-full w-6 h-6 text-sm"
              >
                ×
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex gap-2">
              <VoiceRecorder onResult={setInput} />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-3 bg-blue-600 text-white rounded-xl"
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  setSelectedImage({
                    file,
                    previewUrl: URL.createObjectURL(file),
                  });
                }}
              />
            </div>

            <div className="flex gap-2 flex-1">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={t('typeMessage')}
                className="flex-1 p-3 border rounded-xl"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() && !selectedImage}
                className="p-3 bg-green-600 text-white rounded-xl disabled:bg-gray-400"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
